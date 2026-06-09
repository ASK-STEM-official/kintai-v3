# 顔認証 勤怠連携 — まとめ計画

## 背景

後輩の `face_auth`（Python + dlib / face_recognition）の初期実装は、OpenCV でカメラを直接掴み、認証成功時に `wtype` で card_id をキーボード打鍵して既存 kiosk に「カードがタッチされた」と錯覚させる方式だった。

この方式には根本的な問題が2つある:

1. **フォーカス衝突** — `wtype` の打鍵先（kiosk ブラウザ）と OpenCV プレビュー窓（`cv2.waitKey` 用）が同時にフォーカスを要求し両立できない。打鍵先がズレると card_id が別ウィンドウに漏れる。
2. **学校ネットワークに穴** — 登録 API を Cloudflare Tunnel で未承認のまま外部公開しており、校内ホストを晒すガバナンス上の問題。

## 新方式

カメラの所有を **ブラウザ**に移し、ブラウザ ⇔ ローカル Python を **WebRTC (aiortc)** で接続する。

```
[kioskブラウザ = Web担当]                      [Python(localhost) = 後輩担当]
  getUserMedia(カメラ)                            aiortc RTCPeerConnection
  RTCPeerConnection ──映像track──────────────▶   フレーム受信→顔検出+128次元化
  DataChannel "result" ◀───打刻結果JSON──────    face_encodings照合→閾値判定
  プレビュー表示 / 成功・退勤画面                  record_attendance_by_user_id(service_role)
         │                                          ▲
         └── POST /offer (SDP交換, HTTPS) ──────────┘
```

これにより:
- `wtype` と OpenCV プレビューが不要 → **フォーカス問題が消える**。
- Python は **localhost 常駐**で外部公開ゼロ → **CF Tunnel 不要**（校内ネットワーク問題が解消）。

## 役割分担

| 範囲 | 担当 |
|---|---|
| Web（kioskのカメラ取得・WebRTC接続・結果表示） | **こちら** |
| Python（aiortcサーバ・顔照合・RPC呼び出し・HTTPS証明書） | **後輩** |
| DB（新RPC `record_attendance_by_user_id`） | DB担当/後輩 |

両者が噛み合うためのインターフェース契約は別ファイル **`face-auth-integration.md`** に集約。

## 今回スコープ

- **認証（打刻）側の Web のみ**。
- 顔登録フローは別途（カード登録に倣う想定）。

## 確定した設計判断

- **既存 kioskページに統合**（別ページにしない）。プレビューと結果表示を kiosk 内に配置し、**カードスキャン(キーボード入力)・QR の動作を一切妨げない**。
- **打刻は Python が直接** 新RPCで実行し、結果を **DataChannel** でブラウザへ返却。ブラウザは「カメラ送出」と「結果表示」だけのシンプルな役割。
- 伝送は **WebRTC (aiortc)**。

## Web側の実装範囲

`kintai-v3/src/app/kiosk/page.tsx` にカメラ＋WebRTCを統合。新規 `src/components/kiosk/FaceAuth.tsx`（または `useFaceAuth` フック）に切り出す。

- `getUserMedia({video})` → idle画面の隅に小さくプレビュー（QR・「NFCタッチ」表示と被らない位置）。
- `RTCPeerConnection`: カメラ track を `addTrack`、DataChannel `result` を作成、`createOffer` → signaling へ POST → answer を `setRemoteDescription`。
- signaling先は env `NEXT_PUBLIC_FACE_AUTH_URL`（既定 `https://localhost:8000`）でハードコードしない。
- 結果は既存 `SuccessScreen`/`ErrorScreen` + `setKioskState` を再利用して表示。
- **状態機械との共存（最重要）**: 顔の打刻結果は `kioskState === 'idle'` のときだけ反映。`input`/`processing`/`register`/`qr` 中は抑止し、既存のカードスキャン・QRフローを壊さない（これらのコードは非改変）。
- アンマウント/画面遷移で track 停止・PeerConnection close（カメラ点きっぱなし防止）。

## Mixed content 対策（案B確定）

kiosk は **Vercel(HTTPS)** 配信のまま使うため、`http://localhost` への signaling POST は混在コンテンツでブロックされる。→ **Python signaling を HTTPS 化**して回避する。

- 証明書 = **自己署名（mkcert推奨）／有効期限は長め（例10年）／SAN に `localhost` と `127.0.0.1` を必須**。
- 手動信頼の自己署名には 398日制限が適用されないため長期可 = **毎年の再配置は不要**。
- 証明書生成・配置・HTTPS待受は **後輩のPython側担当**。Web側は env を `https://localhost:8000` に向けるだけ。

## 既知の残課題（今回スコープ外）

- **生体検知(liveness)なし** — 写真/画面でなりすまし可能。将来対応（瞬き検知等）。
- **顔登録フロー** — 別途設計（OAuth認証→顔キャプチャ→`face_encodings`保存）。
- Python側の CF 外部公開は廃止し localhost 運用へ（後輩へ申し送り）。

## 影響ファイル（Web側のみ）

- `kintai-v3/src/app/kiosk/page.tsx` — 顔認証統合（既存 card/QR ロジックは非改変）
- 新規 `kintai-v3/src/components/kiosk/FaceAuth.tsx`（or `useFaceAuth` フック）
- `kintai-v3` の env に `NEXT_PUBLIC_FACE_AUTH_URL` 追加

## 検証手順

Python本体は後輩担当のため、Web側を独立検証できるようにする:

1. **接続**: モック signaling（または後輩のPython）に対し offer→answer 接続成立、DataChannel `result` が開くことを確認。
2. **結果表示**: モックが `result` に打刻JSONを流し、kiosk が既存 `SuccessScreen`/`ErrorScreen` で「○○さん 出勤/退勤」を表示することを確認。
3. **回帰（最重要）**: 顔認証稼働中でもカードスキャン・QRが従来通り動き、idle以外で顔結果が割り込まないことを確認。
4. **カメラ/接続**: プレビュー表示、ICE接続state、アンマウント時の track 停止を確認。
5. Mixed content の実機確認（HTTPS kiosk + HTTPS localhost）。
