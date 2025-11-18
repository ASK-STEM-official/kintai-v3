'use client';

import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDailyAttendanceCounts, getDailyAttendanceDetails } from '@/app/actions';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useEffect } from 'react';
import { Users } from 'lucide-react';

interface DailyDetails {
    byTeam: Record<string, number>;
    byGrade: Record<string, number>;
    total: number;
}

export default function OverallAttendanceCalendar() {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [dailyCounts, setDailyCounts] = useState<Record<string, number>>({});
    const [selectedDetails, setSelectedDetails] = useState<DailyDetails | null>(null);
    const [loading, setLoading] = useState(false);

    // 月が変わったときにデータを取得
    useEffect(() => {
        const fetchCounts = async () => {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth() + 1;
            const counts = await getDailyAttendanceCounts(year, month);
            setDailyCounts(counts);
        };
        fetchCounts();
    }, [currentMonth]);

    // 日付が選択されたときに詳細を取得
    useEffect(() => {
        const fetchDetails = async () => {
            if (!selectedDate) {
                setSelectedDetails(null);
                return;
            }
            
            setLoading(true);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const details = await getDailyAttendanceDetails(dateStr);
            setSelectedDetails(details);
            setLoading(false);
        };
        fetchDetails();
    }, [selectedDate]);

    const modifiers = {
        attendance: (date: Date) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            return (dailyCounts[dateStr] || 0) > 0;
        },
    };

    const modifiersClassNames = {
        attendance: 'bg-primary/10 font-bold',
    };

    const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
    const attendanceCount = selectedDateStr ? (dailyCounts[selectedDateStr] || 0) : 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        month={currentMonth}
                        onMonthChange={setCurrentMonth}
                        locale={ja}
                        modifiers={modifiers}
                        modifiersClassNames={modifiersClassNames}
                        className="rounded-md border w-full"
                    />
                    <div className="mt-4 text-sm text-muted-foreground">
                        <p className="font-semibold mb-2">凡例:</p>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded bg-primary/10 border"></div>
                            <span>出席記録あり</span>
                        </div>
                    </div>
                    
                    {/* 日別出席人数一覧 */}
                    <div className="mt-4">
                        <h4 className="font-medium text-sm mb-2">今月の出席人数</h4>
                        <div className="grid grid-cols-7 gap-1 text-xs">
                            {Object.entries(dailyCounts)
                                .filter(([date]) => {
                                    const d = new Date(date);
                                    return d.getMonth() === currentMonth.getMonth() && 
                                           d.getFullYear() === currentMonth.getFullYear();
                                })
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([date, count]) => (
                                    <div 
                                        key={date} 
                                        className="p-1 rounded bg-muted/50 text-center cursor-pointer hover:bg-muted"
                                        onClick={() => setSelectedDate(new Date(date))}
                                    >
                                        <div className="font-medium">{new Date(date).getDate()}日</div>
                                        <div className="text-primary font-semibold">{count}人</div>
                                    </div>
                                ))}
                        </div>
                    </div>
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

                                {loading ? (
                                    <div className="text-center text-muted-foreground py-8">
                                        読み込み中...
                                    </div>
                                ) : selectedDetails && selectedDetails.total > 0 ? (
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-sm text-muted-foreground mb-2">班別出席人数</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                {Object.entries(selectedDetails.byTeam)
                                                    .sort(([a], [b]) => a.localeCompare(b))
                                                    .map(([team, count]) => (
                                                        <div key={team} className="flex justify-between items-center p-2 rounded bg-muted/50">
                                                            <span className="text-sm font-medium">{team}</span>
                                                            <Badge variant="outline">{count}人</Badge>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="font-medium text-sm text-muted-foreground mb-2">学年別出席人数</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                {Object.entries(selectedDetails.byGrade)
                                                    .sort(([a], [b]) => {
                                                        // 数字でソート（期数）
                                                        const aNum = parseInt(a.match(/\d+/)?.[0] || '0');
                                                        const bNum = parseInt(b.match(/\d+/)?.[0] || '0');
                                                        return aNum - bNum;
                                                    })
                                                    .map(([grade, count]) => (
                                                        <div key={grade} className="flex justify-between items-center p-2 rounded bg-muted/50">
                                                            <span className="text-sm font-medium">{grade}</span>
                                                            <Badge variant="outline">{count}人</Badge>
                                                        </div>
                                                    ))}
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
