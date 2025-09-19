
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { recordAttendance, createTempRegistration } from '@/app/actions';
import { Database } from '@/lib/types';
import Clock from '@/components/kiosk/Clock';
import { Bell, LogIn, LogOut, XCircle, UserPlus, Wifi, WifiOff, Copy } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type KioskState = 'idle' | 'input' | 'success' | 'error' | 'register' | 'qr' | 'processing' | 'loading';
type AttendanceType = 'in' | 'out' | null;
type Announcement = Database['public']['Tables']['announcements']['Row'] | null;

const AUTO_RESET_DELAY = 5000;

export default function KioskPage() {
  const [kioskState, setKioskState] = useState<KioskState>('loading');
  const [message, setMessage] = useState('');
  const [subMessage, setSubMessage] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpiry, setQrExpiry] = useState<number>(0);
  const [announcement, setAnnouncement] = useState<Announcement>(null);
  const [isOnline, setIsOnline] = useState<boolean | undefined>(undefined);
  const [attendanceType, setAttendanceType] = useState<AttendanceType>(null);
  const { toast } = useToast();


  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const fetchData = async () => {
        const { data: initialAnnouncement } = await supabase.from('announcements').select('*').eq('is_current', true).limit(1).maybeSingle();
        setAnnouncement(initialAnnouncement);
        setKioskState('idle');
    };
    fetchData();
  }, [supabase]);


  const resetToIdle = useCallback(() => {
    setKioskState('idle');
    setInputValue('');
    setMessage('');
    setSubMessage('');
    setQrToken(null);
    setAttendanceType(null);
  }, []);

  const handleFormSubmit = useCallback(async (cardId: string) => {
    if (!cardId.trim() || kioskState === 'processing') {
      setInputValue('');
      return;
    }
    
    setKioskState('processing');

    const stateAtSubmission = kioskState;
    setInputValue(''); 

    if (stateAtSubmission === 'register') {
      const result = await createTempRegistration(cardId);
      if (result.success && result.token) {
        setQrToken(result.token);
        setQrExpiry(Date.now() + 30 * 60 * 1000);
        setKioskState('qr');
      } else {
        setKioskState('error');
        setMessage(result.message);
        setSubMessage('');
      }
    } else {
      const result = await recordAttendance(cardId);
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
  }, [kioskState]);


  useEffect(() => {
    if (kioskState === 'success' || kioskState === 'error') {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToIdle, AUTO_RESET_DELAY);
    }
    
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    }

  }, [kioskState, resetToIdle]);
  
   useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (kioskState === 'processing' || (kioskState === 'qr' && e.key !== 'Escape')) {
        return;
      }

      if (e.key === 'Escape') {
        if(resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetToIdle();
        return;
      }
      
      if (e.key === 'Enter') {
        if (inputValue.trim()) {
            handleFormSubmit(inputValue);
        }
        return;
      }
      
      if (e.key === '/') {
         if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
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
  }, [kioskState, resetToIdle, inputValue, handleFormSubmit]);
  
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
    
    let qrChannel: any;
    if (kioskState === 'qr' && qrToken) {
      qrChannel = supabase
        .channel(`kiosk-qr-channel-${qrToken}`)
        .on(
          'postgres_changes',
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'temp_registrations', 
            filter: `qr_token=eq.${qrToken}`
          },
          (payload) => {
            if ((payload.new.accessed_at || payload.new.is_used) && kioskState === 'qr') {
              if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
              resetToIdle();
            }
          }
        ).subscribe();
    }
    
    const announcementChannel = supabase
      .channel('kiosk-announcement-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        async () => {
          const { data } = await supabase.from('announcements').select('*').eq('is_current', true).limit(1).maybeSingle();
          setAnnouncement(data);
        }
      ).subscribe();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      if (qrChannel) supabase.removeChannel(qrChannel);
      if (announcementChannel) supabase.removeChannel(announcementChannel);
    };
  }, [supabase, qrToken, kioskState, resetToIdle]);
  
  const QrTimer = () => {
    const [remaining, setRemaining] = useState(qrExpiry - Date.now());
    useEffect(() => {
      const timer = setInterval(() => {
        const newRemaining = qrExpiry - Date.now();
        if (newRemaining <= 0) {
          clearInterval(timer);
          resetToIdle();
        }
        setRemaining(newRemaining);
      }, 1000);
      return () => clearInterval(timer);
    }, []);
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');

    return (
       <p className="mt-2 text-lg">有効期限: あと{minutes}分{seconds}秒</p>
    )
  }
  
  const IdleScreen = () => (
    <div className="flex flex-col h-full w-full justify-between p-8">
        <header className="w-full flex justify-between items-center text-xl">
            <h1 className="font-bold">STEM研究部 勤怠管理システム</h1>
            {isOnline !== undefined && (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${isOnline ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                {isOnline ? <Wifi size={16}/> : <WifiOff size={16}/>}
                <span>{isOnline ? 'オンライン' : 'オフライン'}</span>
            </div>
            )}
        </header>

        <div className="flex-grow w-full flex flex-col items-center justify-center overflow-y-auto py-4">
            {announcement && announcement.is_active && (
                <div className="w-full max-w-4xl p-6 bg-blue-500/10 border border-blue-400/30 rounded-lg text-center mb-8">
                <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-3">
                    <Bell className="text-blue-300" />
                    {announcement.title}
                </h2>
                <p className="text-lg text-gray-300 whitespace-pre-wrap">{announcement.content}</p>
                </div>
            )}
            <Clock />
        </div>
        
        <footer className="w-full text-center">
            <p className="text-3xl font-semibold mb-4">NFCタグをタッチしてください</p>
            <p className="text-gray-400">カードリーダーにタッチするか、IDをキーボードで入力してください</p>
            <div className="text-gray-500 mt-8">
                新しいカードを登録するには <span className="font-mono bg-gray-700 text-gray-300 px-2 py-1 rounded">/</span> キー
            </div>
        </footer>
    </div>
  );

  const renderQrScreen = () => {
    if (!qrToken) return null;
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/register/${qrToken}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(url).then(() => {
            toast({
                title: "コピーしました",
                description: "登録用リンクをクリップボードにコピーしました。",
            });
        }).catch(err => {
            console.error('Failed to copy: ', err);
            toast({
                variant: 'destructive',
                title: "コピー失敗",
                description: "リンクのコピーに失敗しました。",
            });
        });
    };

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
        <div className="mt-4 flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
            <p className="text-sm text-gray-300 font-mono truncate max-w-xs">{url}</p>
            <Button variant="ghost" size="icon" onClick={handleCopy}>
                <Copy className="h-5 w-5" />
            </Button>
        </div>
        <QrTimer />
        <p className="text-sm text-gray-500 mt-4">※QR読み取り後、この画面は自動的に戻ります</p>
      </div>
    );
  };

  const renderState = () => {
    switch (kioskState) {
      case 'success':
        return (
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
        );
      case 'error':
        return (
          <div className="text-center flex flex-col items-center">
            <XCircle className="w-32 h-32 text-red-400 mb-8" />
            <p className="text-5xl font-bold">{message}</p>
            <p className="text-2xl text-gray-400 mt-4">{subMessage}</p>
             <p className="text-sm text-gray-500 mt-8">(5秒後に自動的に戻ります)</p>
          </div>
        );
      case 'register':
        return (
          <div className="text-center flex flex-col items-center">
            <UserPlus className="w-32 h-32 text-blue-400 mb-8" />
            <p className="text-5xl font-bold">{message}</p>
            <p className="text-2xl text-gray-400 mt-4">{subMessage}</p>
            <p className="text-sm text-gray-500 mt-8">キャンセルするにはEscキー</p>
          </div>
        );
      case 'qr':
        return renderQrScreen();
      case 'loading':
      case 'processing':
         return (
             <div className="text-center flex flex-col items-center">
                 <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-400"></div>
                 <p className="text-4xl text-gray-400 mt-8">{kioskState === 'loading' ? '読み込み中...' : '処理中...'}</p>
             </div>
         )
      case 'input':
      case 'idle':
      default:
        return <IdleScreen />;
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex items-center justify-center font-sans">
      <div className="w-[1024px] h-[768px] bg-gray-900 border-4 border-gray-700 rounded-lg shadow-2xl overflow-hidden">
        <div className="w-full h-full flex flex-col items-center justify-center">
          {renderState()}
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

    
