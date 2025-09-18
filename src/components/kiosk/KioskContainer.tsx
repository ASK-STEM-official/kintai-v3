"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { recordAttendance, createTempRegistration } from '@/app/actions';
import { Database } from '@/lib/types';
import Clock from './Clock';
import { Bell, CheckCircle2, XCircle, UserPlus, QrCode, Wifi, WifiOff } from 'lucide-react';
import Image from 'next/image';

type KioskState = 'idle' | 'input' | 'success' | 'error' | 'register' | 'qr' | 'processing';
type Announcement = Database['public']['Tables']['announcements']['Row'] | null;
type Team = Database['public']['Tables']['teams']['Row'];

interface KioskContainerProps {
  initialAnnouncement: Announcement;
  teams: Team[];
}

const AUTO_RESET_DELAY = 5000;

export default function KioskContainer({ initialAnnouncement, teams }: KioskContainerProps) {
  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [message, setMessage] = useState('');
  const [subMessage, setSubMessage] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpiry, setQrExpiry] = useState<number>(0);
  const [announcement, setAnnouncement] = useState(initialAnnouncement);
  const [isOnline, setIsOnline] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const resetToIdle = useCallback(() => {
    setKioskState('idle');
    setInputValue('');
    setMessage('');
    setSubMessage('');
    setQrToken(null);
    inputRef.current?.focus();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    // Focus input on idle state
    if (kioskState === 'idle' || kioskState === 'error') {
      inputRef.current?.focus();
    }

    // Auto-reset timer for success and error states
    if (kioskState === 'success' || kioskState === 'error') {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToIdle, AUTO_RESET_DELAY);
    } else {
       if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    }
    
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    }

  }, [kioskState, resetToIdle]);
  
   useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== inputRef.current) {
        if (e.key === 'Escape') (document.activeElement as HTMLElement).blur();
        return;
      }
      
      if (kioskState === 'processing' || kioskState === 'success') return;

      if (e.key === 'Escape') {
        resetToIdle();
      } else if (e.key === '/') {
        e.preventDefault();
        setKioskState('register');
        setMessage('新規カード登録');
        setSubMessage('登録したいカードをタッチしてください');
      } else {
        inputRef.current?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [kioskState, resetToIdle]);
  
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(typeof navigator !== 'undefined' && navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
    
    const qrChannel = supabase
      .channel('kiosk-qr-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'temp_registrations', filter: `qr_token=eq.${qrToken}`},
        (payload) => {
          if (payload.new.is_used && kioskState === 'qr') {
            resetToIdle();
          }
        }
      ).subscribe();
    
    const announcementChannel = supabase
      .channel('kiosk-announcement-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        async () => {
          const { data } = await supabase.from('announcements').select('*').eq('is_current', true).single();
          setAnnouncement(data);
        }
      ).subscribe();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      supabase.removeChannel(qrChannel);
      supabase.removeChannel(announcementChannel);
    };
  }, [supabase, qrToken, kioskState, resetToIdle]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newInputValue = e.target.value;
    setInputValue(newInputValue);
    if(newInputValue.trim() !== '' && (kioskState === 'idle' || kioskState === 'input' || kioskState === 'register' || kioskState === 'error')) {
        setKioskState('input');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || kioskState === 'processing' || kioskState === 'success' || kioskState === 'qr') {
      setInputValue('');
      return;
    }
    
    setKioskState('processing');

    const currentKioskState = kioskState; // Use the state at the moment of submission
    const currentInputValue = inputValue;
    setInputValue(''); 

    if (currentKioskState === 'register' || (currentKioskState === 'input' && (message === '新規カード登録' || subMessage.includes('登録するには')))) {
      const result = await createTempRegistration(currentInputValue);
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
      const result = await recordAttendance(currentInputValue);
      if (result.success && result.user) {
        setKioskState('success');
        const teamName = teams.find(t => t.id === result.user.team_id)?.name || '未設定';
        setMessage(`${result.user.display_name} (${teamName}・${result.user.generation}期生)`);
        setSubMessage(result.message);
      } else {
        setKioskState('error');
        setMessage(result.message);
        setSubMessage('登録するには「/」キーを押してください');
      }
    }
  };
  
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
    const seconds = Math.floor((remaining % 60000) / 1000);

    return (
       <p className="mt-4 text-xl">有効期限: あと{minutes}分{seconds.toString().padStart(2, '0')}秒</p>
    )
  }

  const renderState = () => {
    switch (kioskState) {
      case 'success':
        return (
          <div className="text-center flex flex-col items-center">
            <CheckCircle2 className="w-32 h-32 text-green-400 mb-8" />
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
        return (
          <div className="text-center flex flex-col items-center">
            <p className="text-4xl font-bold mb-6">QRコード登録</p>
            <div className="bg-white p-4 rounded-lg">
                <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${process.env.NEXT_PUBLIC_APP_URL}/register/${qrToken}`}
                    width={256}
                    height={256}
                    alt="QR Code"
                    data-ai-hint="qr code"
                />
            </div>
            <p className="mt-6 text-xl max-w-md">スマートフォンでQRコードを読み取り、Discord認証を完了してください。</p>
            <QrTimer />
            <p className="text-sm text-gray-500 mt-4">※登録完了後、この画面は自動的に戻ります</p>
          </div>
        );
      case 'processing':
         return (
             <div className="text-center flex flex-col items-center">
                 <p className="text-4xl text-gray-400">処理中...</p>
             </div>
         )
      case 'input':
        const displayMessage = kioskState === 'register' ? '新規カード登録' : '入力中...';
        return (
            <div className="text-center flex flex-col items-center">
                <p className="text-2xl text-gray-400 mb-4">{displayMessage}</p>
                <p className="text-4xl font-mono bg-gray-800 px-4 py-2 rounded-lg">{inputValue}</p>
                <p className="text-lg text-gray-500 mt-4">そのまま入力を続けてEnterを押してください</p>
            </div>
        )
      case 'idle':
      default:
        return (
          <div className="flex flex-col items-center justify-between h-full w-full py-8">
            <div className="w-full flex justify-between items-center px-8 text-xl">
              <h1 className="font-bold">STEM研究部 勤怠管理システム</h1>
               {isOnline !== undefined && (
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${isOnline ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                  {isOnline ? <Wifi size={16}/> : <WifiOff size={16}/>}
                  <span>{isOnline ? 'オンライン' : 'オフライン'}</span>
                </div>
              )}
            </div>

            {announcement && (
              <div className="w-full max-w-4xl p-6 bg-blue-500/10 border border-blue-400/30 rounded-lg text-center">
                <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-3">
                  <Bell className="text-blue-300" />
                  {announcement.title}
                </h2>
                <p className="text-lg text-gray-300 whitespace-pre-wrap">{announcement.content}</p>
              </div>
            )}

            <Clock />
            
            <div className="text-center">
              <p className="text-3xl font-semibold mb-4">NFCタグをタッチしてください</p>
              <p className="text-gray-400">カードリーダーにタッチするか、IDをキーボードで入力してください</p>
            </div>
            
            <div className="text-gray-500">
                新しいカードを登録するには <span className="font-mono bg-gray-700 text-gray-300 px-2 py-1 rounded">/</span> キー
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full bg-gray-900 text-white flex items-center justify-center">
      <div className="w-[1024px] h-[768px] bg-gray-900 border-4 border-gray-700 rounded-lg p-8 shadow-2xl relative flex items-center justify-center" onClick={() => inputRef.current?.focus()}>
        <form onSubmit={handleFormSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={(e) => { if(kioskState !== 'qr' && kioskState !== 'processing') e.target.focus()}}
            autoFocus
            className="opacity-0 absolute w-0 h-0"
          />
        </form>
        <div className="w-full h-full flex flex-col items-center justify-center">
          {renderState()}
        </div>
      </div>
    </div>
  );
}
