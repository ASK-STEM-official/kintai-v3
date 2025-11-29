'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDailyAttendanceCounts, getDailyAttendanceDetails } from '@/app/actions';
import { format, startOfMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Users, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DailyDetails {
    byTeam: Record<string, number>;
    byGrade: Record<string, number>;
    byTeamAndGrade: Record<string, Record<string, number>>;
    total: number;
}

export default function OverallAttendanceCalendar() {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
    const [dailyCounts, setDailyCounts] = useState<Record<string, number>>({});
    const [selectedDetails, setSelectedDetails] = useState<DailyDetails | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        startTransition(async () => {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth() + 1;
            const counts = await getDailyAttendanceCounts(year, month);
            setDailyCounts(counts);
        });
    }, [currentMonth]);

    useEffect(() => {
        if (!selectedDate) {
            setSelectedDetails(null);
            return;
        }
        startTransition(async () => {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const details = await getDailyAttendanceDetails(dateStr);
            setSelectedDetails(details);
        });
    }, [selectedDate]);
    
    const handleMonthChange = (month: Date) => {
        setCurrentMonth(startOfMonth(month));
        setSelectedDate(undefined);
    };

    const attendedDays = useMemo(() => {
        return Object.keys(dailyCounts)
            .filter(dateStr => (dailyCounts[dateStr] || 0) > 0)
            .map(dateStr => {
                const d = new Date(dateStr);
                const timezoneOffset = d.getTimezoneOffset() * 60000;
                return new Date(d.getTime() + timezoneOffset);
            });
    }, [dailyCounts]);

    const formatDay = (day: Date) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const count = dailyCounts[dateStr];
        return (
            <>
                <div>{day.getDate()}</div>
                <div className="attendance-count">
                    {count && count > 0 ? `${count}人` : ''}
                </div>
            </>
        );
    };
    
    const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
    const attendanceCount = selectedDateStr ? (dailyCounts[selectedDateStr] || 0) : 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                    <Card>
                        <CardHeader className="flex-row items-center justify-between pb-2">
                             <h3 className="text-lg font-semibold">
                                {format(currentMonth, 'yyyy年 M月', { locale: ja })}
                            </h3>
                            <div className='flex items-center gap-1'>
                                <Button variant="outline" size="icon" onClick={() => handleMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} disabled={isPending}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => handleMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} disabled={isPending}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => handleMonthChange(new Date())} disabled={isPending}>
                                    <RefreshCcw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                month={currentMonth}
                                onMonthChange={handleMonthChange}
                                locale={ja}
                                showOutsideDays
                                components={{
                                    Caption: () => null,
                                }}
                                modifiers={{
                                    attended: attendedDays,
                                }}
                                modifiersClassNames={{
                                    attended: 'has-attendance',
                                }}
                                formatters={{ formatDay }}
                                className="p-0"
                                classNames={{
                                    day_selected: "bg-primary/20 text-primary-foreground font-bold border border-primary",
                                }}
                            />
                        </CardContent>
                    </Card>
                </div>

                {selectedDate && (
                    <Card className="flex-1">
                        <CardContent className="pt-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-lg">
                                        {format(selectedDate, 'M月d日(E)', { locale: ja })}
                                    </h3>
                                    <Badge variant={attendanceCount > 0 ? 'default' : 'secondary'} className="text-lg px-3 py-1">
                                        <Users className="w-4 h-4 mr-1" />
                                        {attendanceCount}人
                                    </Badge>
                                </div>

                                {isPending ? (
                                    <div className="text-center text-muted-foreground py-8">
                                        読み込み中...
                                    </div>
                                ) : selectedDetails && selectedDetails.total > 0 ? (
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-sm text-muted-foreground mb-3">班別出席人数</h4>
                                            <div className="space-y-3">
                                                {Object.entries(selectedDetails.byTeamAndGrade)
                                                    .sort(([a], [b]) => a.localeCompare(b))
                                                    .map(([team, gradeData]) => {
                                                        const teamTotal = selectedDetails.byTeam[team] || 0;
                                                        return (
                                                            <div key={team} className="space-y-2">
                                                                <div className="flex justify-between items-center p-2 rounded-md bg-primary/10 border border-primary/20">
                                                                    <span className="font-semibold text-sm">{team}</span>
                                                                    <Badge variant="default">{teamTotal}人</Badge>
                                                                </div>
                                                                <div className="ml-4 grid grid-cols-2 gap-2">
                                                                    {Object.entries(gradeData)
                                                                        .sort(([a], [b]) => {
                                                                            const aNum = parseInt(a.match(/\d+/)?.[0] || '0');
                                                                            const bNum = parseInt(b.match(/\d+/)?.[0] || '0');
                                                                            return aNum - bNum;
                                                                        })
                                                                        .map(([grade, count]) => (
                                                                            <div key={grade} className="flex justify-between items-center px-2 py-1 rounded bg-muted/50 text-xs">
                                                                                <span className="text-muted-foreground">{grade}</span>
                                                                                <span className="font-medium">{count}人</span>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center text-muted-foreground py-8">
                                        この日の出席記録はありません
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
