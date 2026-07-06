
"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { createTempRegistration, createFaceRegSession, resolveUserByCard, getFaceRegSession, markFaceRegSessionDone, pruneOldFaceData } from '@/app/actions';
import Clock from '@/components/kiosk/Clock';
import { Bell, LogIn, LogOut, XCircle, UserPlus, Copy, Thermometer, ScanFace } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import FaceAuth, { type FaceAuthResult, type FaceAuthHandle } from '@/components/kiosk/FaceAuth';

type KioskState = 'idle' | 'input' | 'success' | 'error' | 'register' | 'qr' | 'processing' | 'loading' | 'face-register' | 'face-capturing';
type AttendanceType = 'in' | 'out' | null;

interface WbgtData {
  wbgt: number | null;
  timestamp: string | null;
}

const AUTO_RESET_DELAY = 5000;
const PROCESSING_TIMEOUT = 15000;

// --- Direct Supabase RPC call for attendance (bypasses Vercel serverless) ---

async function recordAttendanceDirect(supabase: ReturnType<typeof createSupabaseBrowserClient>, cardId: string): Promise<{
  success: boolean;
  message: string;
  user: { display_name: string | null } | null;
  type: 'in' | 'out' | null;
}> {
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

  const { data, error } = await supabase.schema('attendance').rpc('record_attendance_by_card', {
    p_card_id: normalizedCardId,
  });

  if (error) {
    console.error('RPC error:', error);
    return { success: false, message: '打刻処理中にエラーが発生しました。', user: null, type: null };
  }

  const result = data as {
    success: boolean;
    message: string;
    user: { display_name: string | null; discord_uid: string | null } | null;
    type: 'in' | 'out' | null;
  };

  // display_nameがNULLの場合は「名無しさん」にフォールバック
  if (result.user && !result.user.display_name) {
    result.user.display_name = '名無しさん';
  }

  return {
    success: result.success,
    message: result.message,
    user: result.user ? { display_name: result.user.display_name } : null,
    type: result.type,
  };
}

// --- Helper function to isolate submission logic ---

async function processSubmission(supabase: ReturnType<typeof createSupabaseBrowserClient>, submissionType: 'idle' | 'register', cardId: string) {
  if (submissionType === 'register') {
    return await createTempRegistration(cardId);
  }
  // 出退勤はSupabase RPCを直接呼ぶ（Vercelサーバーレスを経由しない）
  return await recordAttendanceDirect(supabase, cardId);
}

// --- Memoized Components for Performance ---

const WbgtDisplay = memo(({ wbgt }: { wbgt: number | null }) => {
  if (wbgt === null) {
    return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-gray-500/20 text-gray-300">
            <span>WBGT: --.-°C</span>
        </div>
    );
  }

  const getWbgtColor = (value: number) => {
    if (value >= 28) return 'bg-red-500/20 text-red-300'; // 厳重警戒以上
    if (value >= 25) return 'bg-orange-500/20 text-orange-300'; // 警戒
    if (value >= 21) return 'bg-yellow-500/20 text-yellow-300'; // 注意
    return 'bg-green-500/20 text-green-300'; // ほぼ安全
  };

  const colorClass = getWbgtColor(wbgt);

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${colorClass}`}>
      <Thermometer size={16} />
      <span>{`WBGT: ${wbgt.toFixed(1)}°C`}</span>
    </div>
  );
});
WbgtDisplay.displayName = 'WbgtDisplay';


// 打刻結果・処理中・入力中・登録中を画面上部にバナー表示（カメラを隠さない）
const TopBanner = memo(({ state, message, subMessage, attendanceType, inputValue }: {
  state: KioskState; message: string; subMessage: string; attendanceType: AttendanceType; inputValue: string;
}) => {
  let bg = 'bg-gray-700';
  let icon: React.ReactNode = null;
  let title = '';
  let sub = '';

  if (state === 'success') {
    bg = attendanceType === 'out' ? 'bg-blue-600' : 'bg-green-600';
    icon = attendanceType === 'out'
      ? <LogOut className="w-12 h-12" />
      : <LogIn className="w-12 h-12" />;
    title = message;
    sub = subMessage;
  } else if (state === 'error') {
    bg = 'bg-red-600';
    icon = <XCircle className="w-12 h-12" />;
    title = message;
    sub = subMessage;
  } else if (state === 'processing') {
    bg = 'bg-gray-700';
    icon = <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />;
    title = '処理中…';
  } else if (state === 'input') {
    bg = 'bg-gray-700';
    title = '読み取り中…';
    sub = inputValue;
  } else {
    return null;
  }

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-top-4">
      <div className={`flex items-center gap-5 ${bg} text-white px-10 py-5 rounded-2xl shadow-2xl min-w-[420px] max-w-[92vw]`}>
        {icon}
        <div className="min-w-0">
          <p className="text-4xl font-bold truncate">{title}</p>
          {sub && <p className="text-xl text-white/85 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
});
TopBanner.displayName = 'TopBanner';


const QrTimer = memo(({ qrExpiry, onExpire }: { qrExpiry: number, onExpire: () => void }) => {
    const [remaining, setRemaining] = useState(qrExpiry - Date.now());
    useEffect(() => {
        const timer = setInterval(() => {
            const newRemaining = qrExpiry - Date.now();
            if (newRemaining <= 0) {
                clearInterval(timer);
                onExpire();
            }
            setRemaining(newRemaining);
        }, 1000);
        return () => clearInterval(timer);
    }, [qrExpiry, onExpire]);

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');

    return (
        <p className="mt-2 text-lg">有効期限: あと{minutes}分{seconds}秒</p>
    );
});
QrTimer.displayName = 'QrTimer';


const QrScreen = memo(({ qrToken, qrExpiry, onExpire }: { qrToken: string, qrExpiry: number, onExpire: () => void }) => {
    const { toast } = useToast();
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/register/${qrToken}`;

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(url).then(() => {
            toast({ title: "コピーしました", description: "登録用リンクをクリップボードにコピーしました。" });
        }).catch(err => {
            console.error('Failed to copy: ', err);
            toast({ variant: 'destructive', title: "コピー失敗", description: "リンクのコピーに失敗しました。" });
        });
    }, [url, toast]);

    return (
        <div className="text-center flex flex-col items-center">
            <p className="text-4xl font-bold mb-4">QRコード登録</p>
            <div className="bg-white p-4 rounded-lg">
                <QRCode value={url} size={256} />
            </div>
            <p className="mt-4 text-xl max-w-md">スマートフォンでQRコードを読み取り登録を完了してください。</p>
            <div className="mt-4 flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg max-w-2xl">
                <p className="text-sm text-gray-300 font-mono break-all">{url}</p>
                <Button variant="ghost" size="icon" onClick={handleCopy} className="flex-shrink-0">
                    <Copy className="h-5 w-5" />
                </Button>
            </div>
            <QrTimer qrExpiry={qrExpiry} onExpire={onExpire} />
            <p className="text-sm text-gray-500 mt-4">※QR読み取り後、この画面は自動的に戻ります</p>
        </div>
    );
});
QrScreen.displayName = 'QrScreen';

const ProcessingScreen = memo(({ state }: { state: 'loading' | 'processing' }) => (
    <div className="text-center flex flex-col items-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-400"></div>
        <p className="text-4xl text-gray-400 mt-8">{state === 'loading' ? '読み込み中...' : '処理中...'}</p>
    </div>
));
ProcessingScreen.displayName = 'ProcessingScreen';

// 顔登録モード: カードタッチ or QRで本人確認を待つ画面
const FaceRegisterScreen = memo(({ faceRegToken, inputValue }: { faceRegToken: string | null; inputValue: string }) => {
  const url = faceRegToken ? `${process.env.NEXT_PUBLIC_APP_URL}/register-face/${faceRegToken}` : null;
  return (
    <div className="flex flex-col items-center justify-center text-center gap-6 p-6">
      <ScanFace className="w-24 h-24 text-green-400" />
      <div>
        <p className="text-4xl font-bold">顔登録</p>
        <p className="text-xl text-gray-300 mt-3">本人確認の方法を選んでください</p>
      </div>
      <div className="flex items-center gap-10 mt-2">
        <div className="flex flex-col items-center gap-2">
          <UserPlus className="w-10 h-10 text-gray-300" />
          <p className="text-lg">登録済みカードをタッチ</p>
          {inputValue && (
            <p className="text-base font-mono bg-gray-800 px-3 py-1 rounded">{inputValue}</p>
          )}
        </div>
        <div className="text-gray-500 text-2xl">または</div>
        <div className="flex flex-col items-center gap-2">
          {url ? (
            <div className="bg-white p-3 rounded-lg">
              <QRCode value={url} size={140} />
            </div>
          ) : (
            <div className="w-[164px] h-[164px] bg-gray-800 rounded-lg flex items-center justify-center">
              <p className="text-gray-500 text-sm">QR生成中...</p>
            </div>
          )}
          <p className="text-lg">スマホでQR → ログイン</p>
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-4">キャンセルするにはEscキー</p>
    </div>
  );
});
FaceRegisterScreen.displayName = 'FaceRegisterScreen';

// --- Main Page Component ---

export default function KioskPage() {
  const [kioskState, setKioskState] = useState<KioskState>('loading');
  const [message, setMessage] = useState('');
  const [subMessage, setSubMessage] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpiry, setQrExpiry] = useState<number>(0);
  const [attendanceType, setAttendanceType] = useState<AttendanceType>(null);
  const [wbgtData, setWbgtData] = useState<WbgtData>({ wbgt: null, timestamp: null });
  const [checkinToken, setCheckinToken] = useState<string | null>(null);
  const [faceRegToken, setFaceRegToken] = useState<string | null>(null);
  // 結果が更新されるたびに増やし、自動リセットタイマーを張り直すトリガにする
  const [resultNonce, setResultNonce] = useState(0);

  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  const [captureProgress, setCaptureProgress] = useState<{ captured: number; total: number } | null>(null);

  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceAuthRef = useRef<FaceAuthHandle>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // 顔認証の結果ハンドラから現在の状態を参照するための ref（古いクロージャ回避）
  const kioskStateRef = useRef<KioskState>(kioskState);
  useEffect(() => { kioskStateRef.current = kioskState; }, [kioskState]);
  const faceRegTokenRef = useRef<string | null>(null);
  useEffect(() => { faceRegTokenRef.current = faceRegToken; }, [faceRegToken]);
  const faceCapUserIdRef = useRef<string | null>(null);
  const faceCapStartedAtRef = useRef<string | null>(null);

  useEffect(() => {
    setKioskState('idle');
  }, []);

  // 顔認証(Python)からの打刻結果。
  // idle / 直前の結果表示中(success/error) なら上書き表示し、立て続けの打刻でも
  // 全員分のバナーが順に出るようにする。カード入力中・処理中・登録中には割り込まない。
  const handleFaceResult = useCallback((result: FaceAuthResult) => {
    const s = kioskStateRef.current;
    if (s !== 'idle' && s !== 'success' && s !== 'error') return;

    if (result.success && result.user) {
      setAttendanceType(result.type ?? null);
      setMessage(result.user.display_name || '名無しさん');
      setSubMessage(result.message);
      setKioskState('success');
    } else {
      setMessage(result.message);
      setSubMessage('');
      setKioskState('error');
    }
    // 新しい結果が来たことを通知（success→success でも自動リセットを張り直す）
    setResultNonce((n) => n + 1);
  }, []);

  // 顔登録: 5秒カウントダウン後に Python にキャプチャ開始を指示
  const beginFaceCapture = useCallback((userId: string, displayName?: string) => {
    faceCapUserIdRef.current = userId;
    faceCapStartedAtRef.current = new Date().toISOString();
    setInputValue('');
    setMessage(displayName ? `${displayName} さん` : '');
    setSubMessage('カメラを見てください');
    setKioskState('face-capturing');
    setCaptureCountdown(5);
    setCaptureProgress(null);

    let remaining = 5;
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current!);
        countdownTimerRef.current = null;
        setCaptureCountdown(null);
        const ok = faceAuthRef.current?.startRegister(userId);
        if (!ok) {
          setMessage('カメラに接続できていません');
          setSubMessage('しばらく待ってから、もう一度お試しください');
          setKioskState('error');
          return;
        }
        if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
        processingTimerRef.current = setTimeout(() => {
          setMessage('顔の登録がタイムアウトしました');
          setSubMessage('カメラに顔が写っているか確認して、もう一度お試しください');
          setKioskState('error');
        }, PROCESSING_TIMEOUT);
      } else {
        setCaptureCountdown(remaining);
      }
    }, 1000);
  }, []);

  const handleCaptureProgress = useCallback((captured: number, total: number) => {
    setCaptureProgress({ captured, total });
  }, []);

  // Python からの顔登録完了
  const handleRegisterDone = useCallback((result: FaceAuthResult) => {
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    const token = faceRegTokenRef.current;
    if (token) markFaceRegSessionDone(token).catch(() => {});
    setFaceRegToken(null);
    if (result.success) {
      // 今回の登録より前にあった古いデータを削除（上書き更新）
      const userId = faceCapUserIdRef.current;
      const beforeTs = faceCapStartedAtRef.current;
      if (userId && beforeTs) {
        pruneOldFaceData(userId, beforeTs)
          .then(({ deleted }) => { if (deleted > 0) console.log(`[face] pruned ${deleted} old encodings`); })
          .catch(() => {});
      }
      setAttendanceType('in');
      setMessage('顔を登録しました');
      setSubMessage(`${result.count ?? 0}枚のデータを保存しました`);
      setKioskState('success');
    } else {
      setMessage('顔の登録に失敗しました');
      setSubMessage(result.message || 'もう一度お試しください');
      setKioskState('error');
    }
  }, []);

  // カード経路: 登録モード中にタッチされたカードから user_id を解決してキャプチャ開始
  const handleFaceRegCard = useCallback(async (cardId: string) => {
    const res = await resolveUserByCard(cardId);
    if (res.success && res.userId) {
      beginFaceCapture(res.userId, res.displayName);
    } else {
      setMessage('カードを確認できません');
      setSubMessage(res.message);
      setKioskState('error');
    }
  }, [beginFaceCapture]);

  // QRコード用トークンを30秒ごとに更新
  const refreshCheckinToken = useCallback(async () => {
    const { data, error } = await supabase.schema('attendance').rpc('create_checkin_token');
    if (!error && data) {
      setCheckinToken(data as string);
    }
  }, [supabase]);

  useEffect(() => {
    refreshCheckinToken();
    const interval = setInterval(refreshCheckinToken, 30_000);
    return () => clearInterval(interval);
  }, [refreshCheckinToken]);

  // 誰かがQRを使ったら即座にトークンを更新
  useEffect(() => {
    if (!checkinToken) return;
    const poll = setInterval(async () => {
      const { data } = await supabase.schema('attendance').rpc('has_checkin_token_been_used', { p_token: checkinToken });
      if (data === true) {
        refreshCheckinToken();
      }
    }, 3_000);
    return () => clearInterval(poll);
  }, [checkinToken, supabase, refreshCheckinToken]);

  const resetToIdle = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setKioskState('idle');
    setInputValue('');
    setMessage('');
    setSubMessage('');
    setQrToken(null);
    setFaceRegToken(null);
    setAttendanceType(null);
    setCaptureCountdown(null);
    setCaptureProgress(null);
  }, []);

  // 顔登録モードに入る（QR経路用セッションを発行）
  const enterFaceRegister = useCallback(async () => {
    setKioskState('face-register');
    setInputValue('');
    setMessage('');
    setSubMessage('');
    setFaceRegToken(null);
    const r = await createFaceRegSession();
    if (r.success && r.token) setFaceRegToken(r.token);
  }, []);

  // 顔登録モード(QR経路): セッションが本人確認済みになったらキャプチャ開始
  useEffect(() => {
    if (kioskState !== 'face-register' || !faceRegToken) return;
    const poll = setInterval(async () => {
      const { status, userId } = await getFaceRegSession(faceRegToken);
      if (status === 'identified' && userId) {
        clearInterval(poll);
        beginFaceCapture(userId);
      } else if (status === 'expired') {
        clearInterval(poll);
        const r = await createFaceRegSession();
        if (r.success && r.token) setFaceRegToken(r.token);
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [kioskState, faceRegToken, beginFaceCapture]);

  const handleFormSubmit = useCallback(async (submissionType: 'idle' | 'register', cardId: string) => {
    if (!cardId.trim()) {
      setInputValue('');
      return;
    }

    setKioskState('processing');
    setInputValue('');

    // Client-side timeout for processing state
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    processingTimerRef.current = setTimeout(() => {
      setKioskState('error');
      setMessage('応答がタイムアウトしました');
      setSubMessage('もう一度カードをタッチしてください');
    }, PROCESSING_TIMEOUT);

    try {
        const result: any = await processSubmission(supabase, submissionType, cardId);

        // Clear processing timeout since we got a response
        if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
        
        if (submissionType === 'register') {
          if (result.success && result.token) {
            setQrToken(result.token);
            setQrExpiry(Date.now() + 30 * 60 * 1000);
            setKioskState('qr');
          } else {
            setKioskState('error');
            setMessage(result.message);
            setSubMessage('');
          }
        } else { // 'idle'
          if (result.success && result.user) {
            setKioskState('success');
            setAttendanceType(result.type);
            setMessage(`${result.user.display_name}`);
            setSubMessage(result.message);
          } else {
            setKioskState('error');
            setMessage(result.message);
            setSubMessage('登録するには「/」キーを押してください');
          }
        }
    } catch (error) {
        if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
        console.error("Submission failed:", error);
        setKioskState('error');
        setMessage('サーバーとの通信に失敗しました。');
        setSubMessage('ネットワーク接続を確認して、もう一度お試しください。');
    }
  }, [supabase]);

  useEffect(() => {
    if (kioskState === 'success' || kioskState === 'error') {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToIdle, AUTO_RESET_DELAY);
    }
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
    // resultNonce を含めることで success→success の連続でもタイマーを張り直す
  }, [kioskState, resultNonce, resetToIdle]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (kioskState === 'loading' || (kioskState === 'qr' && e.key !== 'Escape')) {
        return;
      }

      if (e.key === 'Escape') {
        resetToIdle();
        return;
      }

      if (kioskState === 'processing' || kioskState === 'face-capturing') {
        return;
      }

      if (e.key === 'Enter') {
        if (kioskState === 'face-register') {
          if (inputValue.trim()) handleFaceRegCard(inputValue);
          return;
        }
        const submissionType = kioskState === 'register' ? 'register' : 'idle';
        if (inputValue.trim()) {
            handleFormSubmit(submissionType, inputValue);
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setKioskState('register');
        setMessage('新規カード登録');
        setSubMessage('登録したいカードをタッチしてください');
        setInputValue('');
        return;
      }

      // 顔登録モード起動。';' はどの状態でも必ず消費し、card id には絶対に混ぜない。
      if (e.key === ';') {
        e.preventDefault();
        if (kioskState !== 'face-register') {
          enterFaceRegister();
        }
        return;
      }
      
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setInputValue(prev => prev + e.key);
        if (kioskState === 'idle' || kioskState === 'success' || kioskState === 'error') {
           setKioskState('input');
        }
      }

      if (e.key === 'Backspace') {
        setInputValue(prev => prev.slice(0, -1));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [kioskState, inputValue, handleFormSubmit, resetToIdle, handleFaceRegCard, enterFaceRegister]);
  
  useEffect(() => {
    const fetchWbgt = async () => {
      try {
        const response = await fetch('https://stem-weather.vercel.app/api/wbgt');
        if (!response.ok) {
          console.error('Failed to fetch WBGT data, status:', response.status);
          return;
        }
        const data = await response.json();
        if (data.wbgt !== undefined) {
          setWbgtData({ wbgt: data.wbgt, timestamp: data.timestamp });
        }
      } catch (error) {
        console.error('Error fetching WBGT data:', error);
      }
    };

    fetchWbgt(); // Fetch on initial load
    const intervalId = setInterval(fetchWbgt, 30 * 60 * 1000); // Fetch every 30 minutes

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  useEffect(() => {
    if (!qrToken || kioskState !== 'qr') return;

    // Realtime subscription
    const channel = supabase
      .channel(`kiosk-qr-channel-${qrToken}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'attendance', table: 'temp_registrations', filter: `qr_token=eq.${qrToken}` },
        (payload) => {
          if (payload.new.accessed_at || payload.new.is_used) {
            resetToIdle();
          }
        }
      ).subscribe();

    // Polling fallback: Realtimeが届かない場合に備えて1秒ごとに確認
    const checkUsed = async () => {
      const { data } = await supabase
        .schema('attendance')
        .from('temp_registrations')
        .select('accessed_at, is_used')
        .eq('qr_token', qrToken)
        .single();
      if (data?.accessed_at || data?.is_used) resetToIdle();
    };
    const poll = setInterval(checkUsed, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, qrToken, resetToIdle, kioskState]);
  
  const checkinUrl = checkinToken ? `${process.env.NEXT_PUBLIC_APP_URL}/checkin/${checkinToken}` : null;
  const registering = kioskState === 'face-register' || kioskState === 'face-capturing';

  return (
    <div className="h-screen w-screen bg-gray-900 text-white font-sans overflow-hidden relative flex flex-col">
      {/* ヘッダー */}
      <header className="flex justify-between items-start px-6 py-4 z-10">
        <h1 className="text-2xl font-bold">STEM研究部 勤怠</h1>
        <WbgtDisplay wbgt={wbgtData.wbgt} />
      </header>

      {/* メイン: 大画面カメラ + サイド情報。カメラは常時マウントしてWebRTCを維持。 */}
      <div className="flex-1 flex items-center justify-center gap-8 px-6 pb-6 min-h-0">
        <FaceAuth
          ref={faceAuthRef}
          onResult={handleFaceResult}
          onRegisterDone={handleRegisterDone}
          onCaptureProgress={handleCaptureProgress}
          prominent={registering}
          boxClassName="h-[78vh] w-[64vw] max-w-[1200px]"
          countdown={captureCountdown}
          captureProgress={captureProgress}
        />

        <aside className="w-80 shrink-0 flex flex-col items-center gap-5 text-center">
          <Clock />
          {checkinUrl ? (
            <div className="bg-white p-3 rounded-lg shadow-md">
              <QRCode value={checkinUrl} size={150} />
            </div>
          ) : (
            <div className="w-[174px] h-[174px] bg-gray-800 rounded-lg flex items-center justify-center">
              <p className="text-gray-500 text-sm">QR生成中...</p>
            </div>
          )}
          <p className="text-gray-300">カードがない方はQRで出退勤</p>
          <p className="text-2xl font-semibold mt-2">NFCタッチ</p>
          <p className="text-sm text-gray-500">
            <span className="font-mono bg-gray-700 px-1.5 py-0.5 rounded">/</span> 新規カード登録 ・{' '}
            <span className="font-mono bg-gray-700 px-1.5 py-0.5 rounded">;</span> 顔登録
          </p>
        </aside>
      </div>

      {/* 上部バナー: 打刻結果・処理中・入力中・登録中（カメラを隠さない）。
          resultNonce をキーにして連続打刻のたびに再マウント＝再アニメーション。 */}
      <TopBanner
        key={resultNonce}
        state={kioskState}
        message={message}
        subMessage={subMessage}
        attendanceType={attendanceType}
        inputValue={inputValue}
      />

      {/* 中央オーバーレイ: カード登録 / 顔登録の本人確認 / ローディング（背景を暗くして集中） */}
      {(kioskState === 'register' || kioskState === 'qr' || kioskState === 'face-register' || kioskState === 'loading') && (
        <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-center justify-center">
          {kioskState === 'register' && (
            <div className="text-center flex flex-col items-center">
              <UserPlus className="w-28 h-28 text-blue-400 mb-6" />
              <p className="text-5xl font-bold">{message}</p>
              <p className="text-2xl text-gray-300 mt-4">{subMessage}</p>
              {inputValue && (
                <p className="mt-4 text-2xl font-mono bg-gray-800 px-4 py-2 rounded-lg">{inputValue}</p>
              )}
              <p className="text-sm text-gray-500 mt-8">キャンセルするにはEscキー</p>
            </div>
          )}
          {kioskState === 'qr' && qrToken && (
            <QrScreen qrToken={qrToken} qrExpiry={qrExpiry} onExpire={resetToIdle} />
          )}
          {kioskState === 'face-register' && (
            <FaceRegisterScreen faceRegToken={faceRegToken} inputValue={inputValue} />
          )}
          {kioskState === 'loading' && <ProcessingScreen state="loading" />}
        </div>
      )}
    </div>
  );
}
