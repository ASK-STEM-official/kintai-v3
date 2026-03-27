'use client';

import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { ja } from 'date-fns/locale';

const timeZone = 'Asia/Tokyo';

export default function Clock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());

    const timerId = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  return (
    <div className="text-center text-gray-400">
      <p className="text-8xl font-bold text-white font-mono tracking-wider h-[96px]">
        {time ? formatInTimeZone(time, timeZone, 'HH:mm') : ''}
      </p>
      <p className="text-2xl mt-2 font-semibold h-[32px]">
        {time ? formatInTimeZone(time, timeZone, 'yyyy年M月d日 EEEE', { locale: ja }) : ''}
      </p>
    </div>
  );
}
