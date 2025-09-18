"use client";

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ClientRelativeTimeProps {
  date: string;
}

export default function ClientRelativeTime({ date }: ClientRelativeTimeProps) {
  const [relativeTime, setRelativeTime] = useState('');

  useEffect(() => {
    // This effect runs only on the client, after hydration
    setRelativeTime(formatDistanceToNow(new Date(date), { addSuffix: true, locale: ja }));
  }, [date]);

  // Render a placeholder on the server and initial client render
  if (!relativeTime) {
    return <span>--</span>;
  }

  return <span>{relativeTime}</span>;
}
