# 顔認証 接続プロトコル（正典 / single source of truth）

ブラウザ(kiosk) ⇔ ローカルPython(aiortc) 間の**配線仕様の唯一の正**。
Web側(`src/components/kiosk/FaceAuth.tsx`)・Python側(後輩)は**このファイルに厳密に従う**こと。
食い違いが出たら、実装ではなくこのドキュメントを正とする。

---

## 0. メッセージ早見表

| チャンネル/経路 | 方向 | payload | 用途 |
|---|---|---|---|
| `POST /offer` | ブラウザ→Python | `{sdp,type:"offer"}` → 返 `{sdp,type:"answer"}` | WebRTC確立(signaling) |
| video track | ブラウザ→Python | （メディア） | 顔照合用の映像 |
| DataChannel `result` | Python→ブラウザ | 打刻結果 / 登録完了（後述） | 結果通知 |
| DataChannel `control` | ブラウザ→Python | `{action:"register_start",...}` | 顔登録の指示 |

DataChannel は**ブラウザ側が2本とも作成**する（`result` と `control`）。Python は `ondatachannel` で label を見て振り分け、`result` に送信し `control` を受信する。

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

## 4. DataChannel 定義（型つき）

### 4-1. `result`（Python → ブラウザ）
1メッセージ = 1 JSON 文字列。`event` フィールドの有無で2種類を判別する。

**(A) 打刻結果**（通常の認証。`event` 無し）:
```json
{
  "success": true,
  "message": "出勤しました",
  "user": { "display_name": "たろう" },
  "type": "in"
}
```
| key | 型 | 備考 |
|---|---|---|
| `success` | boolean | |
| `message` | string | 画面表示文言 |
| `user` | `{display_name: string|null}` \| null | null可。display_name null は「名無しさん」表示 |
| `type` | `"in"` \| `"out"` \| null | 出勤/退勤 |

→ kiosk は **idle のときだけ**反映（カードスキャン/QR/登録中は無視）。

**(B) 顔登録完了**（`event:"register_done"`）:
```json
{ "event": "register_done", "success": true, "count": 5, "message": "登録しました" }
```
| key | 型 | 備考 |
|---|---|---|
| `event` | `"register_done"` | これで登録完了と判別 |
| `success` | boolean | |
| `count` | int | 保存した encoding 枚数 |
| `message` | string | 失敗時の理由など |

→ kiosk は登録完了画面を出し、セッションを `done` にして idle へ復帰。

### 4-2. `control`（ブラウザ → Python）
```json
{ "action": "register_start", "user_id": "<uuid>", "count": 5 }
```
| key | 型 | 備考 |
|---|---|---|
| `action` | `"register_start"` | 顔登録開始 |
| `user_id` | string(uuid) | 登録対象。`member.members.supabase_auth_user_id` |
| `count` | int | 取得を試みる枚数（既定5） |

（任意）`{ "action": "register_cancel" }` … 登録中断（実装は任意）。

## 5. Python 状態遷移

```
[認証モード(既定)]
  映像を照合 → 一致(<0.45)&クールダウンOK → record_attendance_by_user_id → result(A) 送信
      │
      │ control: register_start 受信
      ▼
[登録モード]  ※自動打刻を抑止
  映像から「顔が1つだけ」のフレームを最大 count 枚 encoding 化
  → face_encodings(user_id, encoding, is_adaptive=false) に insert
  → result(B) register_done 送信
  → 認証モードへ復帰
```

## 6. DB 契約

- **`attendance.face_encodings`**（Python が読み書き）: `id bigint`, `user_id uuid`, `encoding double precision[]`(128次元), `is_adaptive bool`, `created_at/updated_at`。列詳細は `face-auth-integration.md` §0。
- **RPC `attendance.record_attendance_by_user_id(p_user_id uuid)`**（Python が認証時に呼ぶ）: 既存 `record_attendance_by_card` の user_id 版。`attendances.card_id` は NOT NULL のため顔打刻は `card_id='face'` を入れる。戻り JSON は §4-1(A) と同形。SQL雛形は `face-auth-integration.md` §4。
- **`attendance.face_reg_sessions`**: **Web内部用。Python は触らない**。QR経路で本人確認した user_id を kiosk に渡すためのテーブルで、kioskのサーバアクションのみが読み書きする。

## 7. パラメータ既定値

| 項目 | 既定 | 所在 |
|---|---|---|
| 認証距離しきい値 | 0.45 | Python |
| 同一人物クールダウン | 5秒 | Python |
| 登録取得枚数 `count` | 5 | ブラウザが control で送る |
| signaling 再接続間隔 | 5秒 | ブラウザ |
| 顔キャプチャ全体のタイムアウト | 15秒 | ブラウザ（未完了で error 表示） |

## 8. 顔登録フロー全体（参考）

```
kioskで「;」キー → 顔登録モード
  ├─[カード] タッチ→Enter → resolveUserByCard → user_id
  └─[QR] /register-face/[token] → Discord OAuth → face_reg_sessions.status=identified
            → kiosk が getFaceRegSession でポーリング検知 → user_id
  ▼ user_id 確定
  kiosk → control: register_start(user_id, count)
  Python: 登録モードでキャプチャ→保存 → result: register_done
  kiosk: 「登録完了」表示 → idle
```
Web側の該当実装: `src/app/kiosk/page.tsx`（`;`キー・QRポーリング・カード解決・完了表示）、`src/components/kiosk/FaceAuth.tsx`（DataChannel・`startRegister`）、`src/app/register-face/[token]/`（本人確認ページ）、`src/app/actions.ts`（`createFaceRegSession`/`resolveUserByCard`/`getFaceRegSession`/`markFaceRegSessionDone`）。
