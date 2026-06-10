"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

// Pythonから DataChannel "result" で届くメッセージ。配線仕様は doc/face-auth-protocol.md。
// - 打刻結果(event 無し): success/message/user/type
// - 登録完了(event:"register_done"): success/count/message
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
  /** 顔登録を開始する制御メッセージ(control)をPythonへ送る。成功可否を返す。 */
  startRegister: (userId: string, count?: number) => boolean;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'no-camera';

interface FaceAuthProps {
  /** signaling先。既定は env NEXT_PUBLIC_FACE_AUTH_URL */
  signalingUrl?: string;
  /** 打刻結果(event 無し)を受け取る。親が kioskState を見て表示を判断する。 */
  onResult: (result: FaceAuthResult) => void;
  /** 顔登録完了(event:"register_done")を受け取る。 */
  onRegisterDone?: (result: FaceAuthResult) => void;
  /** true で大きく表示（顔登録モード中の位置合わせ用）。 */
  prominent?: boolean;
}

const RECONNECT_DELAY = 5000;
const DEFAULT_REGISTER_COUNT = 5;

/**
 * ブラウザのカメラを取得し、ローカルPython(aiortc)へWebRTCで送出する。
 * Pythonが顔照合→打刻し、結果を DataChannel "result" で返す。
 * 顔登録時は親から startRegister() を呼び、"control" チャンネルで Python に登録を指示する。
 * 打刻/登録のロジックは Python 側（doc/face-auth-protocol.md 参照）。
 */
function FaceAuthInner(
  { signalingUrl, onResult, onRegisterDone, prominent = false }: FaceAuthProps,
  ref: React.Ref<FaceAuthHandle>,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const [connState, setConnState] = useState<ConnState>('idle');

  // コールバックは再生成されうるので ref で最新を参照する
  const onResultRef = useRef(onResult);
  const onRegisterDoneRef = useRef(onRegisterDone);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onRegisterDoneRef.current = onRegisterDone; }, [onRegisterDone]);

  const url = signalingUrl
    || process.env.NEXT_PUBLIC_FACE_AUTH_URL
    || 'https://localhost:8000';

  // 親へ公開する命令: 顔登録開始
  useImperativeHandle(ref, () => ({
    startRegister: (userId: string, count = DEFAULT_REGISTER_COUNT) => {
      const ch = controlChannelRef.current;
      if (!ch || ch.readyState !== 'open') {
        console.warn('[FaceAuth] control channel not open (readyState=', ch?.readyState, ')');
        return false;
      }
      const payload = { action: 'register_start', user_id: userId, count };
      console.log('[FaceAuth] -> control register_start', payload);
      ch.send(JSON.stringify(payload));
      return true;
    },
  }), []);

  const cleanupPc = useCallback(() => {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch { /* noop */ }
      pcRef.current = null;
    }
    controlChannelRef.current = null;
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

    // 結果受信用 "result"（Python→ブラウザ）
    const resultChannel = pc.createDataChannel('result');
    resultChannel.onopen = () => console.log('[FaceAuth] result channel open');
    resultChannel.onmessage = (e) => {
      console.log('[FaceAuth] <- result', e.data);
      try {
        const data = JSON.parse(e.data) as FaceAuthResult;
        if (data.event === 'register_done') {
          onRegisterDoneRef.current?.(data);
        } else {
          onResultRef.current(data);
        }
      } catch (err) {
        console.error('[FaceAuth] invalid result payload:', err);
      }
    };

    // 制御送信用 "control"（ブラウザ→Python）
    const controlChannel = pc.createDataChannel('control');
    controlChannel.onopen = () => console.log('[FaceAuth] control channel open');
    controlChannelRef.current = controlChannel;

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

      const res = await fetch(`${url.replace(/\/$/, '')}/offer`, {
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

  const sizeClass = prominent ? 'w-[28rem] h-[21rem]' : 'w-40 h-30';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative ${sizeClass} rounded-lg overflow-hidden border-2 ${prominent ? 'border-green-500' : 'border-gray-700'} bg-black transition-all`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor[connState]}`} />
        <span>{statusLabel[connState]}</span>
      </div>
    </div>
  );
}

const FaceAuth = forwardRef<FaceAuthHandle, FaceAuthProps>(FaceAuthInner);
FaceAuth.displayName = 'FaceAuth';
export default FaceAuth;
