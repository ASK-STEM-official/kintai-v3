"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

// Python → "detections" DataChannel で届く顔検出データ
interface FaceDetection {
  id: number;
  box: { top: number; right: number; bottom: number; left: number };
  name: string | null;
  state: 'waiting' | 'matched' | 'unknown' | 'cooldown';
  blinks: number;
  blinks_req: number;
  dist: number | null;
  cooldown_remaining?: number | null;
}

const STATE_COLOR: Record<string, string> = {
  waiting: '#3b82f6',
  matched: '#22c55e',
  unknown: '#ef4444',
  cooldown: '#a855f7',
};

const STATE_LABEL: Record<string, string> = {
  waiting: '認識中',
  matched: '認証済',
  unknown: '不明',
  cooldown: '処理済',
};

// Python から DataChannel "result" で届くメッセージ。
// - 認証(打刻): {success, message, user:{display_name}, type}（event/status 無し）
// - 顔登録(別接続 /register/offer): {status:"capturing"|"done", ...}
//   → FaceAuth が onRegisterDone 用に {event:"register_done", success, count, message} へ正規化して渡す。
export interface FaceAuthResult {
  event?: 'register_done';
  success: boolean;
  message: string;
  user?: { display_name: string | null } | null;
  type?: 'in' | 'out' | null;
  count?: number;
}

// kiosk(親)から呼ぶ命令インターフェース
export interface FaceAuthHandle {
  /** 顔登録を開始する。/register/offer に user_id 付きの別接続を張る。成功可否(カメラ準備済みか)を返す。 */
  startRegister: (userId: string) => boolean;
  /** Python側の設定を更新する。config DataChannel が開いていれば送信。 */
  sendConfig: (cfg: Record<string, number>) => void;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'no-camera';

interface FaceAuthProps {
  /** signaling先。既定は env NEXT_PUBLIC_FACE_AUTH_URL */
  signalingUrl?: string;
  /** 打刻結果を受け取る。親が kioskState を見て表示を判断する。 */
  onResult: (result: FaceAuthResult) => void;
  /** 顔登録完了を受け取る（event:"register_done" に正規化済み）。 */
  onRegisterDone?: (result: FaceAuthResult) => void;
  /** キャプチャ進捗（Python からの capturing 通知を転送）。 */
  onCaptureProgress?: (captured: number, total: number) => void;
  /** true で枠を強調（顔登録モード中など）。 */
  prominent?: boolean;
  /** 映像ボックスのサイズclass。未指定なら小（右下用）。 */
  boxClassName?: string;
  /** カウントダウン秒数。>0 のとき "N秒後に撮影" オーバーレイを表示。 */
  countdown?: number | null;
  /** キャプチャ進捗。表示中はプログレスバーを重ねる。 */
  captureProgress?: { captured: number; total: number } | null;
}

const RECONNECT_DELAY = 5000;

/**
 * ブラウザのカメラを取得し、ローカルPython(aiortc)へWebRTCで送出する。
 * - 認証: 常時 /offer に1接続を維持。Pythonが照合→打刻し結果を "result" で返す。
 * - 登録: startRegister() で /register/offer に user_id 付きの別接続を張り、
 *         Python がキャプチャ→保存し {status:"done"} を返したら完了。
 * 打刻/登録のロジックは Python 側（doc/face-auth-protocol.md 参照）。
 */
function FaceAuthInner(
  { signalingUrl, onResult, onRegisterDone, onCaptureProgress, prominent = false, boxClassName, countdown, captureProgress }: FaceAuthProps,
  ref: React.Ref<FaceAuthHandle>,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clearCanvasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const configChannelRef = useRef<RTCDataChannel | null>(null);
  const registerPcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const [connState, setConnState] = useState<ConnState>('idle');

  // コールバックは再生成されうるので ref で最新を参照する
  const onResultRef = useRef(onResult);
  const onRegisterDoneRef = useRef(onRegisterDone);
  const onCaptureProgressRef = useRef(onCaptureProgress);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onRegisterDoneRef.current = onRegisterDone; }, [onRegisterDone]);
  useEffect(() => { onCaptureProgressRef.current = onCaptureProgress; }, [onCaptureProgress]);

  const url = (signalingUrl
    || process.env.NEXT_PUBLIC_FACE_AUTH_URL
    || 'https://localhost:8000').replace(/\/$/, '');

  const drawDetections = useCallback((faces: FaceDetection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cW = Math.round(rect.width);
    const cH = Math.round(rect.height);
    if (canvas.width !== cW || canvas.height !== cH) {
      canvas.width = cW;
      canvas.height = cH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cW, cH);
    if (!faces.length) return;

    // object-cover によるレンダリングサイズ計算
    const vW = video.videoWidth || 640;
    const vH = video.videoHeight || 480;
    const scale = Math.max(cW / vW, cH / vH);
    const rW = vW * scale;
    const rH = vH * scale;
    const oX = (cW - rW) / 2;
    const oY = (cH - rH) / 2;

    // 正規化座標 → canvas 座標（x はミラー補正で反転）
    const tx = (nx: number) => cW - (nx * rW + oX);
    const ty = (ny: number) => ny * rH + oY;

    for (const face of faces) {
      const color = STATE_COLOR[face.state] ?? '#3b82f6';

      // Python の right/left を mirror 補正して swap
      const bx1 = tx(face.box.right);
      const bx2 = tx(face.box.left);
      const by1 = ty(face.box.top);
      const by2 = ty(face.box.bottom);
      const bw = bx2 - bx1;
      const bh = by2 - by1;

      // ボックス
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx1, by1, bw, bh);

      // コーナー装飾
      const cs = Math.min(bw, bh) * 0.18;
      ctx.lineWidth = 3;
      ([ [bx1, by1, 1, 1], [bx2, by1, -1, 1], [bx1, by2, 1, -1], [bx2, by2, -1, -1] ] as [number, number, number, number][])
        .forEach(([x, y, dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(x + dx * cs, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + dy * cs);
          ctx.stroke();
        });

      // ラベルテキスト
      const cdSec = face.cooldown_remaining != null ? Math.ceil(face.cooldown_remaining) : null;
      const stateLabel = face.state === 'cooldown' && cdSec != null
        ? `CD ${cdSec}s`
        : (STATE_LABEL[face.state] ?? '---');
      const mainText = face.name
        ? (face.state === 'cooldown' && cdSec != null ? `${face.name}  CD ${cdSec}s` : face.name)
        : stateLabel;
      const subText = `瞬目 ${face.blinks}/${face.blinks_req}${face.dist !== null ? `  d:${face.dist.toFixed(3)}` : ''}`;
      const padX = 6, padY = 4;
      const mainSize = 14, subSize = 11;
      const lH1 = mainSize + padY, lH2 = subSize + padY;
      const labelH = lH1 + lH2 + padY;

      ctx.font = `bold ${mainSize}px monospace`;
      const mainW = ctx.measureText(mainText).width;
      ctx.font = `${subSize}px monospace`;
      const subW = ctx.measureText(subText).width;
      const labelW = Math.max(mainW, subW) + padX * 2;

      const labelX = Math.max(0, Math.min(bx1, cW - labelW));
      const labelY = by1 - labelH > 4 ? by1 - labelH : by2 + 2;

      // ラベル背景（角丸）
      ctx.fillStyle = `${color}cc`;
      const r = 4;
      ctx.beginPath();
      ctx.moveTo(labelX + r, labelY);
      ctx.lineTo(labelX + labelW - r, labelY);
      ctx.quadraticCurveTo(labelX + labelW, labelY, labelX + labelW, labelY + r);
      ctx.lineTo(labelX + labelW, labelY + labelH - r);
      ctx.quadraticCurveTo(labelX + labelW, labelY + labelH, labelX + labelW - r, labelY + labelH);
      ctx.lineTo(labelX + r, labelY + labelH);
      ctx.quadraticCurveTo(labelX, labelY + labelH, labelX, labelY + labelH - r);
      ctx.lineTo(labelX, labelY + r);
      ctx.quadraticCurveTo(labelX, labelY, labelX + r, labelY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${mainSize}px monospace`;
      ctx.fillText(mainText, labelX + padX, labelY + lH1);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `${subSize}px monospace`;
      ctx.fillText(subText, labelX + padX, labelY + lH1 + lH2);

      // トラックIDバッジ
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx1 + 11, by1 + 11, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${face.id}`, bx1 + 11, by1 + 15);
      ctx.textAlign = 'left';
    }
  }, []);

  const cleanupRegisterPc = useCallback(() => {
    if (registerPcRef.current) {
      try { registerPcRef.current.close(); } catch { /* noop */ }
      registerPcRef.current = null;
    }
  }, []);

  // 顔登録: /register/offer に user_id 付きの別接続を張る
  const runRegister = useCallback(async (userId: string) => {
    cleanupRegisterPc();
    const rpc = new RTCPeerConnection();
    registerPcRef.current = rpc;
    let lastCaptured = 0;

    const ch = rpc.createDataChannel('result');
    ch.onmessage = (e) => {
      console.log('[FaceAuth] <- register', e.data);
      try {
        const data = JSON.parse(e.data);
        if (data.status === 'capturing') {
          lastCaptured = data.captured ?? lastCaptured;
          onCaptureProgressRef.current?.(lastCaptured, data.total ?? 5);
        } else if (data.status === 'done') {
          onRegisterDoneRef.current?.({
            event: 'register_done',
            success: true,
            count: lastCaptured || data.total || 0,
            message: data.message || '登録しました',
          });
          cleanupRegisterPc();
        }
      } catch (err) {
        console.error('[FaceAuth] invalid register payload:', err);
      }
    };

    // カメラ track を登録接続にも送る（同じ track を複数接続で利用可）
    streamRef.current!.getVideoTracks().forEach((track) => {
      rpc.addTrack(track, streamRef.current!);
    });

    try {
      const offer = await rpc.createOffer();
      await rpc.setLocalDescription(offer);
      console.log('[FaceAuth] -> /register/offer', { user_id: userId });

      const res = await fetch(`${url}/register/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: offer.sdp, type: offer.type, user_id: userId }),
      });
      if (!res.ok) throw new Error(`register signaling HTTP ${res.status}`);
      const answer = await res.json();
      await rpc.setRemoteDescription(answer);
    } catch (err) {
      console.error('[FaceAuth] register signaling error:', err);
      onRegisterDoneRef.current?.({
        event: 'register_done', success: false, count: 0,
        message: '登録用の接続に失敗しました',
      });
      cleanupRegisterPc();
    }
  }, [url, cleanupRegisterPc]);

  // 親へ公開する命令: 顔登録開始 / 設定送信
  useImperativeHandle(ref, () => ({
    startRegister: (userId: string) => {
      if (!streamRef.current) {
        console.warn('[FaceAuth] camera not ready');
        return false;
      }
      runRegister(userId);
      return true;
    },
    sendConfig: (cfg: Record<string, number>) => {
      const ch = configChannelRef.current;
      if (ch && ch.readyState === 'open') {
        ch.send(JSON.stringify({ type: 'config', ...cfg }));
        console.log('[FaceAuth] -> config', cfg);
      } else {
        console.warn('[FaceAuth] config channel not open');
      }
    },
  }), [runRegister]);

  const cleanupPc = useCallback(() => {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch { /* noop */ }
      pcRef.current = null;
    }
    configChannelRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    if (closedRef.current) return;
    cleanupPc();
    setConnState('connecting');

    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      }
    } catch (err) {
      console.error('[FaceAuth] camera error:', err);
      setConnState('no-camera');
      return;
    }

    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    // 認証結果受信用 "result"（Python→ブラウザ）
    const resultChannel = pc.createDataChannel('result');
    resultChannel.onopen = () => console.log('[FaceAuth] result channel open');
    resultChannel.onmessage = (e) => {
      console.log('[FaceAuth] <- result', e.data);
      try {
        onResultRef.current(JSON.parse(e.data) as FaceAuthResult);
      } catch (err) {
        console.error('[FaceAuth] invalid result payload:', err);
      }
    };

    // 設定送信用 "config"（ブラウザ → Python）
    const configChannel = pc.createDataChannel('config');
    configChannel.onopen = () => console.log('[FaceAuth] config channel open');
    configChannelRef.current = configChannel;

    // 検出オーバーレイ受信用 "detections"（Python → ブラウザ）
    const detectionsChannel = pc.createDataChannel('detections');
    detectionsChannel.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.faces)) {
          drawDetections(data.faces);
          if (clearCanvasTimerRef.current) clearTimeout(clearCanvasTimerRef.current);
          // 検出が途切れたら 600ms でクリア
          clearCanvasTimerRef.current = setTimeout(() => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          }, 600);
        }
      } catch { /* noop */ }
    };

    // カメラ track を送出
    streamRef.current.getVideoTracks().forEach((track) => {
      pc.addTrack(track, streamRef.current!);
    });

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log('[FaceAuth] ICE state:', s);
      if (s === 'connected' || s === 'completed') {
        setConnState('connected');
      } else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
        setConnState('disconnected');
        scheduleReconnect();
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`${url}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
      });
      if (!res.ok) throw new Error(`signaling HTTP ${res.status}`);

      const answer = await res.json();
      await pc.setRemoteDescription(answer);
    } catch (err) {
      console.error('[FaceAuth] signaling error:', err);
      setConnState('error');
      scheduleReconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, cleanupPc]);

  const scheduleReconnect = useCallback(() => {
    if (closedRef.current) return;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    reconnectRef.current = setTimeout(() => { connect(); }, RECONNECT_DELAY);
  }, [connect]);

  useEffect(() => {
    closedRef.current = false;
    connect();

    return () => {
      closedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (clearCanvasTimerRef.current) clearTimeout(clearCanvasTimerRef.current);
      cleanupPc();
      cleanupRegisterPc();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLabel: Record<ConnState, string> = {
    idle: '',
    connecting: '接続中…',
    connected: '顔認証 稼働中',
    disconnected: '再接続中…',
    error: '接続エラー',
    'no-camera': 'カメラ未接続',
  };

  const dotColor: Record<ConnState, string> = {
    idle: 'bg-gray-500',
    connecting: 'bg-yellow-400',
    connected: 'bg-green-400',
    disconnected: 'bg-orange-400',
    error: 'bg-red-500',
    'no-camera': 'bg-red-500',
  };

  const sizeClass = boxClassName ?? 'w-40 h-30';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${sizeClass} rounded-2xl overflow-hidden border-4 ${prominent ? 'border-green-500' : 'border-gray-700'} bg-black transition-all shadow-xl`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover -scale-x-100"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* カウントダウンオーバーレイ */}
        {countdown != null && countdown > 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 gap-3">
            <p className="text-white/80 text-lg font-medium tracking-wide">カメラを見てください</p>
            <span
              key={countdown}
              className="text-white font-bold leading-none animate-bounce"
              style={{ fontSize: 'clamp(4rem, 12vw, 9rem)' }}
            >
              {countdown}
            </span>
            <p className="text-white/60 text-base">秒後に撮影開始</p>
          </div>
        )}

        {/* キャプチャ進捗オーバーレイ */}
        {captureProgress != null && (countdown == null || countdown <= 0) && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-black/70 flex flex-col items-center gap-2 py-3 px-4">
            <p className="text-white text-sm font-semibold tracking-wide">
              撮影中 {captureProgress.captured} / {captureProgress.total}
            </p>
            <div className="flex gap-2">
              {Array.from({ length: captureProgress.total }).map((_, i) => (
                <span
                  key={i}
                  className={`block rounded-full transition-all duration-300 ${
                    i < captureProgress.captured
                      ? 'w-4 h-4 bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.7)]'
                      : 'w-3 h-3 bg-white/30 mt-0.5'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 text-xs text-gray-200 bg-black/50 px-2 py-1 rounded-full">
          <span className={`inline-block w-2 h-2 rounded-full ${dotColor[connState]}`} />
          <span>{statusLabel[connState]}</span>
        </div>
      </div>
    </div>
  );
}

const FaceAuth = forwardRef<FaceAuthHandle, FaceAuthProps>(FaceAuthInner);
FaceAuth.displayName = 'FaceAuth';
export default FaceAuth;
