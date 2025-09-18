'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function Clock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    // Set initial time on client mount
    setTime(new Date());

    const timerId = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  return (
    <div className="text-center text-gray-400">
      <p className="text-8xl font-bold text-white font-mono tracking-wider h-[96px]">
        {time ? format(time, 'HH:mm') : ''}
      </p>
      <p className="text-2xl mt-2 font-semibold h-[32px]">
        {time ? format(time, 'yyyy年M月d日 E曜日', { locale: ja }) : ''}
      </p>
    </div>
  );
}
