"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

// Pythonから DataChannel "result" で届く打刻結果。
// kiosk の recordAttendanceDirect の戻り型と同形にしてある。
export interface FaceAuthResult {
  success: boolean;
  message: string;
  user: { display_name: string | null } | null;
  type: 'in' | 'out' | null;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'no-camera';

interface FaceAuthProps {
  /** signaling先。既定は env NEXT_PUBLIC_FACE_AUTH_URL */
  signalingUrl?: string;
  /** 打刻結果を受け取るコールバック（親が kioskState を見て表示を判断する） */
  onResult: (result: FaceAuthResult) => void;
}

const RECONNECT_DELAY = 5000;

/**
 * ブラウザのカメラを取得し、ローカルPython(aiortc)へWebRTCで送出する。
 * Pythonが顔照合→打刻し、結果を DataChannel "result" で返す。
 * このコンポーネントは「カメラ送出」と「プレビュー表示」「結果の転送」だけを担い、
 * 打刻ロジックは持たない（Python側が record_attendance_by_user_id を直叩きする）。
 */
export default function FaceAuth({ signalingUrl, onResult }: FaceAuthProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const [connState, setConnState] = useState<ConnState>('idle');

  // onResult は再生成されうるので ref で最新を参照する（DataChannel onmessage が古い参照を掴まないように）
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const url = signalingUrl
    || process.env.NEXT_PUBLIC_FACE_AUTH_URL
    || 'https://localhost:8000';

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
      // カメラはコンポーネント存続中つけっぱなし。stream は使い回す。
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

    // 受信用 DataChannel "result"
    const channel = pc.createDataChannel('result');
    channel.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as FaceAuthResult;
        onResultRef.current(data);
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
      // カメラ解放（LED消灯）
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

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="relative w-40 h-30 rounded-lg overflow-hidden border-2 border-gray-700 bg-black">
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
