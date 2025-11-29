"use client";

import { useState, useEffect, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { getMonthlyAttendance } from '@/app/actions';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface AttendanceRecord {
  date: string;
  status: 'in' | 'out' | 'mixed';
}

interface AttendanceDetails {
  firstIn: string | null;
  lastOut: string | null;
  totalMinutes: number;
}

export default function AttendanceCalendar({ userId }: { userId: string }) {
  const [date, setDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceDetails, setAttendanceDetails] = useState<AttendanceDetails | null>(null);
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

  useEffect(() => {
    const fetchDayDetails = async () => {
      if (!selectedDate) {
        setAttendanceDetails(null);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      const { data: records, error } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('type, timestamp')
        .eq('user_id', userId)
        .eq('date', dateStr)
        .order('timestamp');

      if (error || !records || records.length === 0) {
        setAttendanceDetails(null);
        return;
      }

      const inRecords = records.filter(r => r.type === 'in');
      const outRecords = records.filter(r => r.type === 'out');

      const firstIn = inRecords.length > 0 ? inRecords[0].timestamp : null;
      const lastOut = outRecords.length > 0 ? outRecords[outRecords.length - 1].timestamp : null;

      // Calculate total minutes
      let totalMinutes = 0;
      for (let i = 0; i < inRecords.length; i++) {
        const inTime = new Date(inRecords[i].timestamp);
        const outTime = outRecords[i] ? new Date(outRecords[i].timestamp) : new Date();
        totalMinutes += (outTime.getTime() - inTime.getTime()) / (1000 * 60);
      }

      setAttendanceDetails({
        firstIn,
        lastOut,
        totalMinutes: Math.round(totalMinutes),
      });
    };

    fetchDayDetails();
  }, [userId, selectedDate]);

  const handleMonthChange = (month: Date) => {
    setDate(month);
    // 月変更時に選択日を新しい月の同じ日に更新
    if (selectedDate) {
      const newSelectedDate = new Date(month.getFullYear(), month.getMonth(), selectedDate.getDate());
      setSelectedDate(newSelectedDate);
    }
  };
  
  const goToPreviousMonth = () => {
    const newMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    setDate(newMonth);
    // 月変更時に選択日を新しい月の同じ日に更新
    if (selectedDate) {
      const newSelectedDate = new Date(newMonth.getFullYear(), newMonth.getMonth(), selectedDate.getDate());
      setSelectedDate(newSelectedDate);
    }
  }

  const goToNextMonth = () => {
    const newMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    setDate(newMonth);
    // 月変更時に選択日を新しい月の同じ日に更新
    if (selectedDate) {
      const newSelectedDate = new Date(newMonth.getFullYear(), newMonth.getMonth(), selectedDate.getDate());
      setSelectedDate(newSelectedDate);
    }
  }

  const attendedDays = useMemo(() => attendance.map(a => {
    const d = new Date(a.date);
    d.setHours(0,0,0,0);
    // Adjust for timezone offset to prevent off-by-one day errors
    const timezoneOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() + timezoneOffset);
  }), [attendance]);

  const handleDayClick = (day: Date | undefined) => {
    setSelectedDate(day);
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '-';
    return format(new Date(timestamp), 'HH:mm', { locale: ja });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}時間${mins}分`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        onDayClick={handleDayClick}
        disabled={isLoading}
        className="rounded-md border"
        showOutsideDays
        locale={ja}
        components={{
          Caption: () => null,
        }}
        modifiers={{
          attended: attendedDays,
          selected: selectedDate ? [selectedDate] : []
        }}
        modifiersClassNames={{
          attended: 'is-attended'
        }}
      />
       <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-primary/20 border border-primary"></div>出勤日</div>
        </div>
      </div>

      <div>
        {selectedDate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {format(selectedDate, 'M月d日(E)', { locale: ja })} の詳細
              </CardTitle>
            </CardHeader>
            <CardContent>
              {attendanceDetails ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <LogIn className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="text-sm text-muted-foreground">初回出勤</div>
                      <div className="text-lg font-semibold">{formatTime(attendanceDetails.firstIn)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <LogOut className="h-5 w-5 text-red-600" />
                    <div>
                      <div className="text-sm text-muted-foreground">最終退勤</div>
                      <div className="text-lg font-semibold">{formatTime(attendanceDetails.lastOut)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-sm text-muted-foreground">活動時間</div>
                      <div className="text-lg font-semibold">{formatDuration(attendanceDetails.totalMinutes)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  この日の出勤記録はありません
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
