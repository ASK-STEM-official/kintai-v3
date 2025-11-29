"use client";

import { useState, useEffect } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ClientRelativeTimeProps {
  date: string;
}

export default function ClientRelativeTime({ date }: ClientRelativeTimeProps) {
  const [relativeTime, setRelativeTime] = useState('');

  useEffect(() => {
    // This effect runs only on the client, after hydration
    const now = new Date();
    const targetDate = new Date(date);
    
    // Check if the date is from today
    if(now.toDateString() === targetDate.toDateString()) {
      setRelativeTime(format(targetDate, 'HH:mm', { locale: ja }));
    } else {
      setRelativeTime(formatDistanceToNow(targetDate, { addSuffix: true, locale: ja }));
    }
  }, [date]);

  // Render a placeholder on the server and initial client render
  if (!relativeTime) {
    return <span>--</span>;
  }

  return <span>{relativeTime}</span>;
}
