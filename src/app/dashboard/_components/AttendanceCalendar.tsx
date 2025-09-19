"use client";

import { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { getMonthlyAttendance } from '@/app/actions';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

  const attendedDays = attendance.map(a => new Date(a.date));

  return (
    <div>
        <div className="flex justify-between items-center mb-2 px-1">
            <h3 className="text-lg font-semibold">
                {format(date, 'yyyy年 M月', { locale: ja })}
            </h3>
            <div className='flex items-center gap-1'>
              <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
                  <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                  <ChevronRight />
              </Button>
            </div>
        </div>
      <Calendar
        mode="multiple"
        month={date}
        onMonthChange={handleMonthChange}
        selected={attendedDays}
        disabled={isLoading}
        className="rounded-md border p-0"
        classNames={{
            day_selected: "bg-primary/90 text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            months: "p-3",
        }}
        showOutsideDays
        components={{
          Caption: () => null,
        }}
      />
       <div className="mt-4 space-y-2 text-sm">
            <p className="flex items-center gap-2"><Badge className="w-16 justify-center">出勤</Badge> 記録がある日</p>
        </div>
    </div>
  );
}
