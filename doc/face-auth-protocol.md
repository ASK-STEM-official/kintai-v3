# 顔認証 接続プロトコル（正典 / single source of truth）

ブラウザ(kiosk) ⇔ ローカルPython(aiortc) 間の**配線仕様の唯一の正**。
Web側(`src/components/kiosk/FaceAuth.tsx`)・Python側(後輩)は**このファイルに厳密に従う**こと。
食い違いが出たら、実装ではなくこのドキュメントを正とする。

---

## 0. メッセージ早見表

認証(打刻)と顔登録で**別々のWebRTC接続**を使う。認証は常時1接続、登録は実行のたびに張って捨てる。

| 経路 | 方向 | payload | 用途 |
|---|---|---|---|
| `POST /offer` | ブラウザ→Python | `{sdp,type}` → 返 `{sdp,type}` | 認証用 接続確立 |
| `POST /register/offer` | ブラウザ→Python | `{sdp,type,user_id}` → 返 `{sdp,type}` | 登録用 接続確立（user_idを同梱） |
| video track | ブラウザ→Python | （メディア） | 顔照合/登録キャプチャ用の映像 |
| DataChannel `result` | Python→ブラウザ | 認証=打刻結果 / 登録=進捗・完了（後述） | 結果通知 |

各接続とも DataChannel `result` は**ブラウザ側が作成**し、Python は `ondatachannel` で受け取って送信に使う。
**user_id は `/register/offer` の body で渡す**（DataChannel経由ではない）。

---

## 1. トポロジ前提

- kioskブラウザと Python は**同一マシン**、Python は **localhost のみ**で待ち受け（外部公開しない）。
- kiosk が Vercel(HTTPS) 配信のため、Python signaling も **HTTPS必須**（自己署名/mkcert、SANに `localhost`/`127.0.0.1`、長期有効）。詳細は `face-auth-integration.md` §5。
- signaling先 base URL は Web 側 env `NEXT_PUBLIC_FACE_AUTH_URL`（既定 `https://localhost:8000`）。

## 2. WebRTC signaling: `POST {base}/offer`

- リクエスト body (JSON): `{ "sdp": "<offer SDP>", "type": "offer" }`
- レスポンス body (JSON): `{ "sdp": "<answer SDP>", "type": "answer" }`
- **CORS**: kioskオリジンを `Access-Control-Allow-Origin` で許可。プリフライト `OPTIONS` にも応答。
- 失敗時（非2xx/ネットワークエラー）: ブラウザは **5秒後に再接続**を試みる。接続断（ICE `failed`/`disconnected`/`closed`）でも同様に再接続。

## 3. メディア

- ブラウザ→Python に **video track 1本のみ**（音声なし）。
- Python は ~5fps 程度に間引いて顔検出・照合する想定（負荷対策。実装は後輩裁量）。

## 4. メッセージ定義（型つき）

### 4-1. 認証接続(`/offer`)の `result`（Python → ブラウザ）
打刻のたびに、RPC `record_attendance_by_user_id` の戻りJSONをそのまま1メッセージで送る:
```json
{ "success": true, "message": "出勤しました", "user": { "display_name": "たろう" }, "type": "in" }
```
| key | 型 | 備考 |
|---|---|---|
| `success` | boolean | |
| `message` | string | 画面表示文言 |
| `user` | `{display_name: string|null}` \| null | null可。display_name null は「名無しさん」表示 |
| `type` | `"in"` \| `"out"` \| null | 出勤/退勤 |

→ kiosk は **idle のときだけ**画面反映（カードスキャン/QR/登録中は無視）。

### 4-2. 登録接続(`/register/offer`)の `result`（Python → ブラウザ）
登録は **専用接続**で行う。接続時に **body で `user_id` を渡す**（`{sdp,type,user_id}`）。
Python はその接続の映像から顔をキャプチャし、進捗と完了を `result` チャンネルで送る:

**進捗**（任意・複数回）:
```json
{ "status": "capturing", "captured": 3, "total": 5 }
```
**完了**:
```json
{ "status": "done", "message": "5枚の顔を登録しました" }
```
| key | 型 | 備考 |
|---|---|---|
| `status` | `"capturing"` \| `"done"` | done で登録完了 |
| `captured` / `total` | int | 進捗(capturing時) |
| `message` | string | 完了文言 |

→ ブラウザは `status:"done"` を受けたら完了表示し、登録接続を閉じる。15秒以内に done が来なければタイムアウト表示。
（失敗時にPythonが何も送らない場合もタイムアウトで拾う。明示的に失敗を返すなら `{status:"error", message}` を送ってよい。）

## 5. Python 動作

- **認証接続(`/offer`)**: 常時。映像を照合 → 一致(<0.45)&クールダウンOK → `record_attendance_by_user_id` → §4-1 を送信。
- **登録接続(`/register/offer`)**: 1登録ごとに張られる。body の `user_id` 宛に、映像から顔フレームを最大 `count`(=5) 枚 encoding 化 → `face_encodings(user_id, encoding, is_adaptive=false)` に insert → §4-2 の `done` を送信。完了後この接続は閉じる。
- 注: 登録中も認証接続は並走するため、既登録者が登録し直すと打刻が走り得る（既知の軽微な副作用）。

## 6. DB 契約

- **`attendance.face_encodings`**（Python が読み書き）: `id bigint`, `user_id uuid`, `encoding double precision[]`(128次元), `is_adaptive bool`, `created_at/updated_at`。列詳細は `face-auth-integration.md` §0。
- **RPC `attendance.record_attendance_by_user_id(p_user_id uuid)`**（Python が認証時に呼ぶ）: 既存 `record_attendance_by_card` の user_id 版。`attendances.card_id` は NOT NULL のため顔打刻は `card_id='face'` を入れる。戻り JSON は §4-1(A) と同形。SQL雛形は `face-auth-integration.md` §4。
- **`attendance.face_reg_sessions`**: **Web内部用。Python は触らない**。QR経路で本人確認した user_id を kiosk に渡すためのテーブルで、kioskのサーバアクションのみが読み書きする。

## 7. パラメータ既定値

| 項目 | 既定 | 所在 |
|---|---|---|
| 認証距離しきい値 | 0.45 | Python |
| 同一人物クールダウン | 5秒 | Python |
| 登録取得枚数 | 5 | Python（`/register/offer`側で固定） |
| signaling 再接続間隔（認証接続） | 5秒 | ブラウザ |
| 顔登録のタイムアウト | 15秒 | ブラウザ（done未受信で error 表示） |

## 8. 顔登録フロー全体（参考）

```
kioskで「;」キー → 顔登録モード
  ├─[カード] タッチ→Enter → resolveUserByCard → user_id
  └─[QR] /register-face/[token] → Discord OAuth → face_reg_sessions.status=identified
            → kiosk が getFaceRegSession でポーリング検知 → user_id
  ▼ user_id 確定
  kiosk → POST /register/offer (body: sdp,type,user_id) で別接続を張る
  Python: その映像からキャプチャ→保存 → result: {status:"done"}
  kiosk: 「登録完了」表示 → 登録接続を閉じる → idle
```
Web側の該当実装: `src/app/kiosk/page.tsx`（`;`キー・QRポーリング・カード解決・完了表示）、`src/components/kiosk/FaceAuth.tsx`（DataChannel・`startRegister`）、`src/app/register-face/[token]/`（本人確認ページ）、`src/app/actions.ts`（`createFaceRegSession`/`resolveUserByCard`/`getFaceRegSession`/`markFaceRegSessionDone`）。
