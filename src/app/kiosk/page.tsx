
"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { createTempRegistration } from '@/app/actions';
import Clock from '@/components/kiosk/Clock';
import { Bell, LogIn, LogOut, XCircle, UserPlus, Copy, Thermometer } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type KioskState = 'idle' | 'input' | 'success' | 'error' | 'register' | 'qr' | 'processing' | 'loading';
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


const IdleScreen = memo(({ wbgtData }: { wbgtData: WbgtData }) => (
  <div className="flex flex-col h-full w-full justify-between p-6">
    <header className="w-full flex justify-between items-start text-xl">
      <h1 className="font-bold">STEM研究部 勤怠管理システム</h1>
      <div className="flex flex-col items-end gap-2">
        <WbgtDisplay wbgt={wbgtData.wbgt} />
      </div>
    </header>
    <div className="flex-grow w-full flex flex-col items-center justify-center overflow-y-auto py-4 space-y-8">
      <Clock />
    </div>
    <footer className="w-full text-center">
      <p className="text-3xl font-semibold mb-4">NFCタグをタッチしてください</p>
      <p className="text-gray-400">カードリーダーにタッチするか、IDをキーボードで入力してください</p>
      <div className="text-gray-500 mt-8">
        新しいカードを登録するには <span className="font-mono bg-gray-700 text-gray-300 px-2 py-1 rounded">/</span> キー
      </div>
      <div className="mt-6 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
        <p className="text-yellow-300 text-lg">
          📢 このシステムを知らない、もしくは「カードが未登録」と出た方は部長まで連絡してください
        </p>
      </div>
    </footer>
  </div>
));
IdleScreen.displayName = 'IdleScreen';

const SuccessScreen = memo(({ message, subMessage, attendanceType }: { message: string, subMessage: string, attendanceType: AttendanceType }) => (
  <div className="text-center flex flex-col items-center">
    {attendanceType === 'in' ? (
      <LogIn className="w-32 h-32 text-green-400 mb-8" />
    ) : (
      <LogOut className="w-32 h-32 text-blue-400 mb-8" />
    )}
    <p className="text-5xl font-bold">{message}</p>
    <p className="text-3xl text-gray-300 mt-4">{subMessage}</p>
    <p className="text-sm text-gray-500 mt-8">(5秒後に自動的に戻ります)</p>
  </div>
));
SuccessScreen.displayName = 'SuccessScreen';

const ErrorScreen = memo(({ message, subMessage }: { message: string, subMessage: string }) => (
  <div className="text-center flex flex-col items-center">
    <XCircle className="w-32 h-32 text-red-400 mb-8" />
    <p className="text-5xl font-bold">{message}</p>
    <p className="text-2xl text-gray-400 mt-4">{subMessage}</p>
    <p className="text-sm text-gray-500 mt-8">(5秒後に自動的に戻ります)</p>
  </div>
));
ErrorScreen.displayName = 'ErrorScreen';

const RegisterScreen = memo(({ message, subMessage }: { message: string, subMessage: string }) => (
    <div className="text-center flex flex-col items-center">
        <UserPlus className="w-32 h-32 text-blue-400 mb-8" />
        <p className="text-5xl font-bold">{message}</p>
        <p className="text-2xl text-gray-400 mt-4">{subMessage}</p>
        <p className="text-sm text-gray-500 mt-8">キャンセルするにはEscキー</p>
    </div>
));
RegisterScreen.displayName = 'RegisterScreen';


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
                <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(url)}`}
                    width={256}
                    height={256}
                    alt="QR Code"
                    data-ai-hint="qr code"
                    priority
                />
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
  
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    setKioskState('idle');
  }, []);

  const resetToIdle = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    setKioskState('idle');
    setInputValue('');
    setMessage('');
    setSubMessage('');
    setQrToken(null);
    setAttendanceType(null);
  }, []);

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
  }, [kioskState, resetToIdle]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (kioskState === 'loading' || (kioskState === 'qr' && e.key !== 'Escape')) {
        return;
      }

      if (e.key === 'Escape') {
        resetToIdle();
        return;
      }

      if (kioskState === 'processing') {
        return;
      }
      
      if (e.key === 'Enter') {
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
  }, [kioskState, inputValue, handleFormSubmit, resetToIdle]);
  
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
    if (!qrToken) return;

    const channel = supabase
      .channel(`kiosk-qr-channel-${qrToken}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'attendance', table: 'temp_registrations', filter: `qr_token=eq.${qrToken}` },
        (payload) => {
          if ((payload.new.accessed_at || payload.new.is_used) && kioskState === 'qr') {
            resetToIdle();
          }
        }
      ).subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, qrToken, resetToIdle, kioskState]);
  
  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex items-center justify-center font-sans p-2">
      <div className="w-full h-full bg-gray-900 border-4 border-gray-700 rounded-lg shadow-2xl overflow-hidden">
        <div className="w-full h-full flex flex-col items-center justify-center">
          {kioskState === 'idle' && <IdleScreen wbgtData={wbgtData} />}
          {kioskState === 'success' && <SuccessScreen message={message} subMessage={subMessage} attendanceType={attendanceType} />}
          {kioskState === 'error' && <ErrorScreen message={message} subMessage={subMessage} />}
          {kioskState === 'register' && <RegisterScreen message={message} subMessage={subMessage} />}
          {kioskState === 'qr' && qrToken && <QrScreen qrToken={qrToken} qrExpiry={qrExpiry} onExpire={resetToIdle} />}
          {(kioskState === 'loading' || kioskState === 'processing') && <ProcessingScreen state={kioskState} />}
        </div>
        
        {(kioskState === 'input' || (kioskState === 'register' && inputValue)) && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-4xl mx-auto text-center">
              <p className="text-lg text-gray-400 mb-2">読み取り中...</p>
              <p className="text-2xl font-mono bg-gray-800 px-4 py-2 rounded-lg inline-block">{inputValue}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
