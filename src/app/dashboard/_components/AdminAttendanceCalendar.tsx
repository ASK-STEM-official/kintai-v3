"use client";

import { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { getMonthlyAttendanceSummary } from '@/app/actions';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Users, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type DailySummary = {
  total: number;
  byTeam: Record<string, { name: string; total: number; byGeneration: Record<number, number> }>;
};
type AttendanceSummary = Record<string, DailySummary>;

function DayCell({ day, summary }: { day: Date, summary: AttendanceSummary | null }) {
    const dateKey = format(day, 'yyyy-MM-dd');
    const daySummary = summary?.[dateKey];

    if (!daySummary || daySummary.total === 0) {
        return (
            <div className="flex flex-col h-full w-full">
                <time dateTime={day.toISOString()} className="pt-1">{day.getDate()}</time>
            </div>
        );
    }
    
    const sortedTeams = Object.values(daySummary.byTeam).sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    return (
        <Popover>
            <PopoverTrigger asChild>
                <div className="flex flex-col h-full w-full cursor-pointer">
                    <time dateTime={day.toISOString()} className="pt-1">{day.getDate()}</time>
                    <span className="text-xs text-muted-foreground flex items-center justify-center gap-1 pt-2">
                        <Users className="h-3 w-3" />
                        {daySummary.total}人
                    </span>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="center">
                <div className="space-y-2">
                    <h4 className="font-semibold text-sm">{format(day, 'M月d日')}の出勤内訳</h4>
                    <Accordion type="multiple" className="w-full">
                      {sortedTeams.map(team => (
                        <AccordionItem value={team.name} key={team.name}>
                          <AccordionTrigger className="text-xs py-2">
                              <div className="flex justify-between w-full pr-2">
                                  <span className="font-semibold">{team.name}</span>
                                  <span className="font-normal">{team.total}人</span>
                              </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pl-2 space-y-1">
                                {Object.entries(team.byGeneration)
                                    .sort(([a], [b]) => Number(b) - Number(a))
                                    .map(([generation, count]) => (
                                    <div key={generation} className="flex justify-between items-center text-xs">
                                        <span className="text-muted-foreground">{generation}期生</span>
                                        <span className="font-medium">{count}人</span>
                                    </div>
                                ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                    <div className="flex justify-between items-center text-sm font-bold pt-2 border-t">
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
                    <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
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
            day: "h-16 w-full p-1 text-center",
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