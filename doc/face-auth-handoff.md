# 顔認証 勤怠連携 — 引継ぎ（まず最初に読む）

このドキュメントは顔認証機能の**全体像・現状・残作業**をまとめた入口。詳細は各専門ドキュメントへ。

## 1. 概要と目的

kioskの勤怠打刻を**顔認証でも**できるようにする。顔認証はカードの代替/補助で、最終的にやることは既存の勤怠記録と同じ。

旧 face_auth は OpenCVでカメラを掴み `wtype` で card_id を打鍵する方式だったが、①打鍵先フォーカスの衝突 ②CF Tunnelでの校内ホスト外部公開、の2問題があり廃止。**カメラをブラウザに移し、ブラウザ⇔ローカルPythonをWebRTCで繋ぐ**方式に転換した。

## 2. アーキテクチャと役割分担

```
[kioskブラウザ = Web担当(このリポジトリ)]      [Python(localhost) = 後輩担当]
  カメラ取得 / プレビュー / 結果表示             aiortc / 顔検出・照合
  WebRTC接続・DataChannel                       record_attendance_by_user_id 呼び出し
  顔登録の本人確認(QR/カード)                    顔登録キャプチャ→face_encodings保存
         │                                         ▲
         └──── WebRTC (HTTPS signaling) ───────────┘
                         │
                  [Supabase DB (本番・共有)]
```

| 範囲 | 担当 |
|---|---|
| Web（kiosk UI・WebRTC・本人確認・サーバアクション） | **このリポジトリ（実装済み/進行中）** |
| Python（aiortcサーバ・顔照合・キャプチャ・HTTPS証明書） | **後輩** |
| DB（RPC `record_attendance_by_user_id` 適用） | DB担当/後輩（部長承認の上で） |

## 3. 現状（done / pending）

**done（実装・検証済み）**
- 認証(打刻)側 Web: `FaceAuth.tsx` + kiosk統合。ブランチ `feature/face-auth-kiosk`。
- 顔登録フロー Web: `;`キーで登録モード、QR(`/register-face`)＋カードの2経路、`control`で登録指示、完了表示。
- DB: `attendance.face_encodings`（顔ベクトル）、`attendance.face_reg_sessions`（QR本人確認セッション）作成済み。
- ドキュメント一式（本書 + protocol/integration/plan）。
- typecheck / production build 通過。

**pending（未完）**
- **Python本体**（後輩）: aiortcサーバ、`/offer`、照合、`control`受信→キャプチャ→保存、HTTPS証明書。
- **RPC `record_attendance_by_user_id` の本番適用**（DB担当、部長承認）。雛形は integration.md §4。
- **生体検知(liveness)**: 未対応（写真スプーフ可）。将来課題。
- E2E（Python完成後）: 本人確認→キャプチャ→打刻まで通す。

## 4. ブランチ / ファイルマップ

- ブランチ: **`feature/face-auth-kiosk`**（origin にpush済み。Vercelプレビュー対象）。
- Web（kintai-v3）:
  - `src/components/kiosk/FaceAuth.tsx` — カメラ・WebRTC・DataChannel・`startRegister`
  - `src/app/kiosk/page.tsx` — kiosk統合（打刻表示・`;`登録モード・QR/カード経路）
  - `src/app/register-face/[token]/` — QR本人確認ページ
  - `src/app/actions.ts` — `createFaceRegSession`/`resolveUserByCard`/`getFaceRegSession`/`markFaceRegSessionDone`
- Python（別リポジトリ `face_auth/`）: 後輩が protocol.md に従って実装。
- DB: `attendance` スキーマ（`face_encodings`, `face_reg_sessions`, RPCは未適用）。

## 5. ドキュメント案内（読む順）

1. **本書（handoff）** — 全体像と現状。
2. **face-auth-protocol.md** — 配線の正典。signaling・DataChannel全メッセージ。**Python実装の必読**。
3. **face-auth-integration.md** — Python実装ガイド（依存・テーブル構造・aiortcコード例・RPC雛形・HTTPS証明書）。配線はprotocol.mdを正とする。
4. **face-auth-plan.md** — 認証側の概要計画（経緯）。

## 6. 環境・秘密情報の所在

- Python の接続情報は `face_auth/.env`（`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `API_KEY`）。**コミット禁止**（.gitignore済み）。リポジトリと一緒に受け渡す。
- Web の signaling先: env `NEXT_PUBLIC_FACE_AUTH_URL`（既定 `https://localhost:8000`）。実機(Python同居)なら未設定でも既定値で正しく動く。

## 7. 後輩の次アクション（チェックリスト）

- [ ] `requirements.txt` に `aiortc` / `av` を追加し依存導入。
- [ ] `POST /offer`（aiortc signaling）実装、CORSでkioskオリジン許可。
- [ ] video track 受信→ ~5fps で顔検出・照合（既存 main.py のロジック流用）。
- [ ] 認証一致時 `record_attendance_by_user_id` を呼び、`result`(A) を送信。
- [ ] `control` の `register_start` 受信→登録モードでキャプチャ→`face_encodings`に複数insert→`result`(B) `register_done` 送信。
- [ ] HTTPS化（mkcert、SANに localhost/127.0.0.1、長期有効）。
- [ ] CF Tunnel（config.yml）廃止、localhost運用へ。
- [ ] （DB担当）`record_attendance_by_user_id` RPCを部長承認の上で適用。

## 8. 決定ログ

- **WebRTC(aiortc)採用** — wtype方式のフォーカス衝突を解消、カメラはブラウザ管理。
- **Python は localhost のみ**（CF外部公開廃止）— 校内ネットワークに穴を開けない。
- **Mixed content対策は案B（Python signalingをHTTPS化、自己署名/mkcert・長期有効）** — kioskはVercel(HTTPS)のまま使うため。
- **顔登録は本人確認2経路（カードタッチ / QR+Discord OAuth）** — kioskが両方の仕組みを既に持つため低コスト・最良UX。
- **打刻はPythonが直接RPC、結果はDataChannelで返す** — ブラウザは表示専門。
- **顔打刻の `attendances.card_id` は `'face'` センチネル** — カード/顔の由来を判別可能に。
- **liveness 未対応** — スコープ外、将来課題。

## 9. ローカルでの動かし方 / テスト

- **Web単体**: kioskを開き、カメラプレビュー・接続ステータスを確認。`;`キーで登録モード→QR/カードで本人確認まで（キャプチャはPython待ち）。
- **DB**: `face_reg_sessions` に `createFaceRegSession`→行生成、`/register-face/[token]`をOAuthで開く→`status='identified'`・`user_id`紐付けを確認。テスト行は後始末。
- **回帰**: 顔機能稼働中もカードスキャン・QR出退勤・カード登録が従来通り動くこと。
- **E2E**（Python完成後）: 顔登録→認証(打刻)で本人判定→`attendances`に`card_id='face'`行。
