"use client";

import { useState, useEffect, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { getUserMonthlyCalendar } from '@/app/actions-new';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toZonedTime } from 'date-fns-tz';
import { formatJst } from '@/lib/utils';

interface AttendanceRecord {
  date: string;
  status: 'in' | 'out' | 'mixed';
}

interface AttendanceDetails {
  firstIn: string | null;
  lastOut: string | null;
  totalMinutes: number;
}

const timeZone = 'Asia/Tokyo';

export default function AttendanceCalendar({ userId }: { userId: string }) {
  const [date, setDate] = useState<Date>(new Date());
<<<<<<<< HEAD:vercel/path0/src/app/dashboard/_components/AttendanceCalendar.tsx
  const [attendance, setAttendance] = useState<any[]>([]);
========
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceDetails, setAttendanceDetails] = useState<AttendanceDetails | null>(null);
>>>>>>>> 547a868659686faedaf45e0f01bf034300664d61:src/app/dashboard/_components/AttendanceCalendar.tsx
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      setIsLoading(true);
      const data = await getUserMonthlyCalendar(userId, date);
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

      let totalMinutes = 0;
      let lastInTime: Date | null = null;
      records.forEach(rec => {
          if (rec.type === 'in') {
              lastInTime = new Date(rec.timestamp);
          } else if (rec.type === 'out' && lastInTime) {
              const outTime = new Date(rec.timestamp);
              totalMinutes += (outTime.getTime() - lastInTime.getTime()) / (1000 * 60);
              lastInTime = null; 
          }
      });
      // Handle case where user is still clocked in
      if (lastInTime) {
          totalMinutes += (new Date().getTime() - lastInTime.getTime()) / (1000 * 60);
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
    if (selectedDate) {
      const newSelectedDate = new Date(month.getFullYear(), month.getMonth(), selectedDate.getDate());
      setSelectedDate(newSelectedDate);
    }
  };
  
  const goToPreviousMonth = () => {
    handleMonthChange(new Date(date.getFullYear(), date.getMonth() - 1, 1));
  }

  const goToNextMonth = () => {
    handleMonthChange(new Date(date.getFullYear(), date.getMonth() + 1, 1));
  }

  const attendedDays = useMemo(() => attendance.map(a => {
    // Treat the date string as a UTC date and convert it to JST for correct display.
    // e.g., "2023-10-27" becomes "2023-10-27T00:00:00Z", which is correctly handled.
    return new Date(a.date.replace(/-/g, '/'));
  }), [attendance]);

  const handleDayClick = (day: Date | undefined) => {
    setSelectedDate(day);
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '-';
    return formatJst(new Date(timestamp), 'HH:mm');
  };

  const formatDuration = (minutes: number) => {
    if (isNaN(minutes) || minutes < 0) return '0時間0分';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}時間${mins}分`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <div className="flex justify-between items-center mb-2 px-1">
            <h3 className="text-lg font-semibold">
                {formatJst(date, 'yyyy年 M月')}
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
<<<<<<<< HEAD:vercel/path0/src/app/dashboard/_components/AttendanceCalendar.tsx
          attended: 'has-attendance'
        }}
        formatters={{
          formatDay
        }}
      />
       <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2"><Badge className="w-16 justify-center">出勤</Badge> 記録がある日</div>
========
          attended: 'is-attended'
        }}
      />
       <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-primary/20 border border-primary"></div>出勤日</div>
>>>>>>>> 547a868659686faedaf45e0f01bf034300664d61:src/app/dashboard/_components/AttendanceCalendar.tsx
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
