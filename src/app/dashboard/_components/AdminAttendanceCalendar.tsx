"use client";

import { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { getMonthlyAttendanceSummary } from '@/app/actions';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type AttendanceSummary = Record<string, { total: number; byGeneration: Record<number, number> }>;

function DayCell({ day, summary }: { day: Date, summary: AttendanceSummary | null }) {
    const dateKey = format(day, 'yyyy-MM-dd');
    const daySummary = summary?.[dateKey];

    if (!daySummary || daySummary.total === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full w-full">
                <time dateTime={day.toISOString()}>{day.getDate()}</time>
            </div>
        );
    }
    
    const sortedGenerations = Object.entries(daySummary.byGeneration)
      .sort(([a], [b]) => Number(b) - Number(a));


    return (
        <Popover>
            <PopoverTrigger asChild>
                <div className="flex flex-col items-center justify-center h-full w-full cursor-pointer">
                    <time dateTime={day.toISOString()}>{day.getDate()}</time>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Users className="h-3 w-3" />
                        {daySummary.total}人
                    </span>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
                <div className="space-y-1">
                    <h4 className="font-semibold text-sm">{format(day, 'M月d日')}の出勤内訳</h4>
                     {sortedGenerations.map(([generation, count]) => (
                        <div key={generation} className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">{generation}期生</span>
                            <span className="font-medium">{count}人</span>
                        </div>
                    ))}
                    <div className="flex justify-between items-center text-xs font-bold pt-1 border-t">
                        <span>合計</span>
                        <span>{daySummary.total}人</span>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}


export default function AdminAttendanceCalendar() {
  const [date, setDate] = useState<Date>(new Date());
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      const data = await getMonthlyAttendanceSummary(date);
      setSummary(data);
      setIsLoading(false);
    };
    fetchSummary();
  }, [date]);

  const handleMonthChange = (month: Date) => {
    setDate(month);
  };
  
  const goToPreviousMonth = () => {
    setDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  const goToNextMonth = () => {
    setDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }
  
  const refreshData = async () => {
      setIsLoading(true);
      const data = await getMonthlyAttendanceSummary(date);
      setSummary(data);
      setIsLoading(false);
  }

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
                 <Button variant="ghost" size="icon" onClick={refreshData} disabled={isLoading}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                </Button>
            </div>
        </div>
      <Calendar
        month={date}
        onMonthChange={handleMonthChange}
        disabled={isLoading}
        className="rounded-md border p-0"
        classNames={{
            months: "p-3",
            day: "h-16 w-full p-1",
            cell: "p-0",
        }}
        showOutsideDays
        components={{
          Caption: () => null,
          DayContent: (props) => <DayCell day={props.date} summary={summary} />,
        }}
      />
    </div>
  );
}
