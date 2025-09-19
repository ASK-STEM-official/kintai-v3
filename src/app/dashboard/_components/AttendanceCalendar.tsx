"use client";

import { useState, useEffect, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { getMonthlyAttendance } from '@/app/actions';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

interface AttendanceRecord {
  date: string;
  status: 'in' | 'out' | 'mixed';
}

export default function AttendanceCalendar({ userId }: { userId: string }) {
  const [date, setDate] = useState<Date>(new Date());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      setIsLoading(true);
      const data = await getMonthlyAttendance(userId, date);
      setAttendance(data);
      setIsLoading(false);
    };
    fetchAttendance();
  }, [userId, date]);

  const handleMonthChange = (month: Date) => {
    setDate(month);
  };
  
  const goToPreviousMonth = () => {
    setDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  const goToNextMonth = () => {
    setDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  const attendedDays = useMemo(() => attendance.map(a => {
    const d = new Date(a.date);
    d.setHours(0,0,0,0);
    // Adjust for timezone offset to prevent off-by-one day errors
    const timezoneOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() + timezoneOffset);
  }), [attendance]);

  const formatDay = (day: Date) => {
    const isAttended = attendedDays.some(ad => ad.getTime() === day.getTime());
    return (
        <>
            <div>{day.getDate()}</div>
            <div className="attendance-count">
                {isAttended ? <Check className="h-4 w-4 text-primary" /> : <>&nbsp;</>}
            </div>
        </>
    );
  };

  return (
    <div>
        <div className="flex justify-between items-center mb-2 px-1">
            <h3 className="text-lg font-semibold">
                {format(date, 'yyyy年 M月', { locale: ja })}
            </h3>
            <div className='flex items-center gap-1'>
              <Button variant="ghost" size="icon" onClick={goToPreviousMonth} disabled={isLoading}>
                  <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon" onClick={goToNextMonth} disabled={isLoading}>
                  <ChevronRight />
              </Button>
            </div>
        </div>
      <Calendar
        month={date}
        onMonthChange={handleMonthChange}
        disabled={isLoading}
        className="rounded-md border"
        showOutsideDays
        components={{
          Caption: () => null,
        }}
        modifiers={{
          attended: attendedDays
        }}
        modifiersClassNames={{
          attended: 'font-bold'
        }}
        formatters={{
          formatDay
        }}
      />
       <div className="mt-4 space-y-2 text-sm">
            <p className="flex items-center gap-2"><Badge className="w-16 justify-center">出勤</Badge> 記録がある日</p>
        </div>
    </div>
  );
}
