# 顔認証 連携仕様（Python側＝後輩向け）

Web（kioskブラウザ）側が前提とする取り決め。Python（aiortcサーバ）はこの契約に合わせて実装すること。
Web側は `kintai-v3/src/components/kiosk/FaceAuth.tsx`（予定）でこの仕様に沿って接続する。

> このドキュメントだけで Python 側の設計・実装に着手できるよう、接続情報（`.env` の秘密値）を除く必要情報を全て記載している。
> 秘密値（`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `API_KEY`）は `face_auth/.env` に設定済み。リポジトリと一緒に受け取ること。

---

## 0. 前提・データ構造・依存

### 既存コードの流用
- 既存 `face_auth/main.py` の `load_from_supabase()`（起動時ロード）・照合ロジック・定数はそのまま流用できる。
- 変更点は「**カメラ入力を OpenCV → aiortc の受信フレームに差し替える**」「**`wtype` 打鍵 → RPC直叩き+DataChannel返却に差し替える**」の2点。

### Supabase クライアント（service_role / attendanceスキーマ）
```python
from supabase import create_client, ClientOptions
supabase = create_client(
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    options=ClientOptions(schema="attendance"),  # ← 必須。無いと public を見て全クエリ空振り
)
```
- service_role キーは RLS をバイパスする（サーバ常駐プロセスなのでこれが正解）。
- `attendance.face_encodings` は RLS 有効・ポリシー無し ＝ **service_role のみ**読み書き可。

### テーブル構造

**`attendance.face_encodings`**（作成済み・顔ベクトル保管）
| 列 | 型 | 内容 |
|---|---|---|
| `id` | bigint (identity) | 主キー |
| `user_id` | uuid | `attendance.users` 参照（ON DELETE CASCADE）。照合で当てるID |
| `encoding` | double precision[] | 128次元ベクトル（face_recognition の出力を `.tolist()` したもの） |
| `is_adaptive` | boolean | 適応学習で更新済みか（既定 false） |
| `created_at` / `updated_at` | timestamptz | |

**`attendance.users`**（card_id ↔ user の対応。表示名取得の補助）
| 列 | 型 |
|---|---|
| `supabase_auth_user_id` | uuid（主キー） |
| `card_id` | varchar |
| `created_at` / `updated_at` | timestamptz |

- 照合で得た `user_id` を §4 のRPCに渡せば打刻される。表示名はRPCが `member.members` から取得して返すので、Python側で名前解決は不要。

### 起動時ロード（既存 load_from_supabase と同じ）
```python
enc_res = supabase.table("face_encodings").select("user_id, id, encoding").execute()
# user_data[user_id] = { "encodings": [np.array(...)], "enc_ids": [...] } に展開
```

### 依存（requirements.txt に追加）
```
aiortc
av
# 既存: fastapi, uvicorn[standard], supabase, python-dotenv, numpy, face_recognition, Pillow
# OpenCV(opencv-python) はカメラ取得に使わなくなるが、描画等で使うなら残す
```
- signaling は既存 FastAPI/uvicorn を流用してよい（`/offer` を1本足すだけ）。

---

## 全体の流れ

```
ブラウザ                                  Python (localhost:8000, HTTPS)
  1. getUserMedia でカメラ取得
  2. RTCPeerConnection 作成
     - カメラ video track を addTrack
     - DataChannel "result" を作成
  3. createOffer → POST /offer ──────────▶ 4. offer受信 → PeerConnection確立
                                              video track を受信
  5. answer受信 → setRemoteDescription ◀──    answer返却
  --- WebRTC確立 ---
                                            6. フレームを間引き処理(~5fps)
                                               顔検出→128次元化→face_encodings照合
                                               閾値<0.45 & クールダウンOK なら:
                                                 record_attendance_by_user_id(uid)
  8. result表示 ◀──DataChannel "result"──    7. 戻りJSONをDataChannelで送信
```

---

## 1. Signaling: `POST /offer`

- **URL**: `https://localhost:8000/offer`（ポートは任意、Web側は env で指定）
- **リクエスト body (JSON)**:
  ```json
  { "sdp": "<offer SDP>", "type": "offer" }
  ```
- **レスポンス body (JSON)**:
  ```json
  { "sdp": "<answer SDP>", "type": "answer" }
  ```
- **CORS**: kiosk のオリジン（例 `https://<kintai>.vercel.app`）を `Access-Control-Allow-Origin` で許可。プリフライト `OPTIONS` にも応答すること。
- aiortc の標準的な offer/answer ハンドラでよい（公式サンプル `server.py` の `/offer` と同型）。

---

## 2. 映像トラック

- ブラウザは **video track を1本**送る（音声なし）。
- Python はこのトラックのフレームを受信して顔照合する。
- 毎フレームは重いので **間引き（~5fps 程度）** を推奨。

### フレーム取り出しの具体（aiortc → face_recognition）
`track.recv()` が返す `av.VideoFrame` を ndarray に変換して既存の照合ロジックへ渡す:

```python
@pc.on("track")
def on_track(track):
    if track.kind != "video":
        return
    async def consume():
        frame_count = 0
        while True:
            frame = await track.recv()              # av.VideoFrame
            frame_count += 1
            if frame_count % 6 != 0:                # ~5fps に間引き(30fps想定)
                continue
            img = frame.to_ndarray(format="rgb24")  # face_recognition は RGB
            # 必要なら縮小: img = img[::4, ::4]  等
            locations = face_recognition.face_locations(img, model="hog")
            encs = face_recognition.face_encodings(img, locations)
            for enc in encs:
                handle_match(enc)                   # ↓ 既存の照合＋打刻
    asyncio.ensure_future(consume())
```

### 照合＋打刻＋返却（既存 main.py のロジックを流用）
```python
def handle_match(face_enc):
    best_uid, best_dist = None, float("inf")
    for uid, data in user_data.items():
        dists = face_recognition.face_distance(data["encodings"], face_enc)
        i = int(np.argmin(dists))
        if dists[i] < best_dist:
            best_uid, best_dist = uid, dists[i]

    if best_uid and best_dist < RECOGNITION_THRESHOLD:
        now = time.time()
        if now - last_input_time.get(best_uid, 0) > COOLDOWN_SECONDS:
            last_input_time[best_uid] = now
            res = supabase.rpc("record_attendance_by_user_id",
                               {"p_user_id": best_uid}).execute()
            result_channel.send(json.dumps(res.data))   # DataChannel "result" へ
```
- `result_channel` は §3 の DataChannel。`@pc.on("datachannel")` で受け取り、ラベル `result` のものを保持しておく。
- `send()` は文字列のみ。`res.data`（dict）を `json.dumps` してから送る。

---

## 3. DataChannel `result`（Python → ブラウザ）

- **ラベルは必ず `result`**。
- 打刻が発生するたびに、**以下と完全に同形の JSON 文字列**を送る:
  ```json
  {
    "success": true,
    "message": "出勤しました",
    "user": { "display_name": "たろう" },
    "type": "in"
  }
  ```
- フィールド:
  | key | 型 | 内容 |
  |---|---|---|
  | `success` | bool | 打刻成否 |
  | `message` | string | 表示メッセージ（例「出勤しました」「退勤しました」「未登録です」） |
  | `user` | object \| null | `{ "display_name": string \| null }`。display_nameがnullなら表示側は「名無しさん」にフォールバック |
  | `type` | `"in"` \| `"out"` \| null | 出勤=in / 退勤=out |

- これは kiosk 既存の `recordAttendanceDirect` の戻り型と同じ。同形にすることで**ブラウザ側の表示UIを無改修**で再利用できる。
- 後述の RPC `record_attendance_by_user_id` の戻り JSON をそのまま流せばよい（`user.discord_uid` は余分に含まれていても無害）。

---

## 4. DB RPC `attendance.record_attendance_by_user_id(uuid)`

Python が service_role で呼ぶ前提の**新RPC**。DB変更なので **DB担当/後輩で用意**すること。
既存 `record_attendance_by_card(text)` の user_id 版。`attendances.card_id` は NOT NULL なので顔打刻は **`card_id = 'face'`** センチネルを入れる（由来がカードか顔か後で判別できる利点もある）。

SQL雛形（既存RPCを踏襲）:

```sql
create or replace function attendance.record_attendance_by_user_id(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path to 'attendance', 'member'
as $function$
declare
  v_display_name text;
  v_discord_uid  text;
  v_last_type    text;
  v_new_type     text;
  v_now          timestamptz := now();
  v_date         date := (v_now at time zone 'Asia/Tokyo')::date;
begin
  -- ユーザー存在確認
  if not exists (select 1 from member.members m where m.supabase_auth_user_id = p_user_id) then
    return json_build_object('success', false, 'message', '未登録のユーザーです。', 'user', null, 'type', null);
  end if;

  -- 表示名取得
  select m.discord_username, m.discord_uid into v_display_name, v_discord_uid
  from member.members m where m.supabase_auth_user_id = p_user_id;

  if v_display_name is null then
    select au.raw_user_meta_data->>'custom_claims'->>'global_name'
    into v_display_name from auth.users au where au.id = p_user_id;
  end if;

  -- 最新打刻をトグル
  select a.type into v_last_type
  from attendance.attendances a
  where a.user_id = p_user_id
  order by a.timestamp desc limit 1;

  v_new_type := case when v_last_type = 'in' then 'out' else 'in' end;

  insert into attendance.attendances (user_id, card_id, type, timestamp, date)
  values (p_user_id, 'face', v_new_type, v_now, v_date);

  return json_build_object(
    'success', true,
    'message', case when v_new_type = 'in' then '出勤しました' else '退勤しました' end,
    'user', json_build_object('display_name', v_display_name, 'discord_uid', v_discord_uid),
    'type', v_new_type
  );
exception when others then
  return json_build_object('success', false,
    'message', '打刻処理中にエラーが発生しました: ' || sqlerrm, 'user', null, 'type', null);
end;
$function$;
```

Python からの呼び出し（service_role クライアント、`schema="attendance"`）:
```python
res = supabase.rpc("record_attendance_by_user_id", {"p_user_id": uid}).execute()
result_json = res.data   # これをそのまま DataChannel "result" へ
```

> 注: 顔のベクトルは `attendance.face_encodings`（作成済み）に `user_id`(uuid) で保存されている。
> Python は起動時に `face_encodings` + `users`/`members` を読み込み、照合で当てた `user_id` をこのRPCに渡す。

**適用の段取り（重要）**: これは**本番DB**への変更。後輩が勝手に `create function` せず、**部長承認の上で適用**すること（Supabaseダッシュボード or MCP で実行）。適用後に下記で動作確認:
```sql
-- 実ユーザーIDで2回叩いて in→out のトグルと戻りJSONを確認
select attendance.record_attendance_by_user_id('<実user_id>');
-- 確認後、テストで入った行は削除して後始末
delete from attendance.attendances where card_id = 'face' and user_id = '<実user_id>';
```

---

## 5. HTTPS 自己署名証明書（Python側で用意）

kiosk は Vercel(HTTPS) 配信。HTTPSページから `http://localhost` への通信は混在コンテンツでブロックされるため、**Python signaling を HTTPS 化**する必要がある。

- **mkcert 推奨**（ローカルCAを信頼ストアに登録 → ブラウザ警告なし）:
  ```bash
  mkcert -install
  mkcert localhost 127.0.0.1
  ```
- 証明書要件:
  - **SAN に `localhost` と `127.0.0.1` を必ず含める**（CNだけの証明書は現代のブラウザが拒否）。
  - **有効期限は長め（例10年）**。手動信頼の自己署名には398日制限が適用されないため長期可＝毎年の再配置は不要。
- aiortc/uvicorn を HTTPS で待ち受け（`uvicorn ... --ssl-keyfile --ssl-certfile`、または aiohttp の `ssl_context`）。
- kiosk 端末では mkcert のローカルCAを信頼させておくこと。

---

## 6. Python側パラメータ（既存 face_auth/main.py からの申し送り）

- `RECOGNITION_THRESHOLD = 0.45`（距離。小さいほど厳格）
- `COOLDOWN_SECONDS = 5`（同一ユーザーの連続打刻防止）
- フレーム縮小・HOGモデルでの顔検出ロジックは流用可。
- **適応学習 `update_encoding`（ALPHA=0.05）は初期はオフ推奨** — 誤マッチ時にテンプレートが汚染されるリスクがあるため、まず固定ベクトルで安定動作を確認してから検討。
- **CF Tunnel（config.yml）は廃止**し localhost 運用へ。外部公開しない。

---

## 7. Web側が前提にすること（まとめ）

- signaling先 = env `NEXT_PUBLIC_FACE_AUTH_URL`（既定 `https://localhost:8000`）。
- DataChannel ラベル = `result`、JSON は §3 の形。
- 打刻結果は kiosk が `idle` のときだけ画面反映（カードスキャン・QR中は割り込まない）。
- ブラウザは打刻ロジックを持たない（Python が RPC を直接呼ぶ）。
