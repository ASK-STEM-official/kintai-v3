"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

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
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'no-camera';

interface FaceAuthProps {
  /** signaling先。既定は env NEXT_PUBLIC_FACE_AUTH_URL */
  signalingUrl?: string;
  /** 打刻結果を受け取る。親が kioskState を見て表示を判断する。 */
  onResult: (result: FaceAuthResult) => void;
  /** 顔登録完了を受け取る（event:"register_done" に正規化済み）。 */
  onRegisterDone?: (result: FaceAuthResult) => void;
  /** true で枠を強調（顔登録モード中など）。 */
  prominent?: boolean;
  /** 映像ボックスのサイズclass。未指定なら小（右下用）。 */
  boxClassName?: string;
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
  { signalingUrl, onResult, onRegisterDone, prominent = false, boxClassName }: FaceAuthProps,
  ref: React.Ref<FaceAuthHandle>,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const registerPcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const [connState, setConnState] = useState<ConnState>('idle');

  // コールバックは再生成されうるので ref で最新を参照する
  const onResultRef = useRef(onResult);
  const onRegisterDoneRef = useRef(onRegisterDone);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onRegisterDoneRef.current = onRegisterDone; }, [onRegisterDone]);

  const url = (signalingUrl
    || process.env.NEXT_PUBLIC_FACE_AUTH_URL
    || 'https://localhost:8000').replace(/\/$/, '');

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

  // 親へ公開する命令: 顔登録開始
  useImperativeHandle(ref, () => ({
    startRegister: (userId: string) => {
      if (!streamRef.current) {
        console.warn('[FaceAuth] camera not ready');
        return false;
      }
      runRegister(userId);
      return true;
    },
  }), [runRegister]);

  const cleanupPc = useCallback(() => {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch { /* noop */ }
      pcRef.current = null;
    }
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
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-xs text-gray-200 bg-black/50 px-2 py-1 rounded-full">
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
