"use client";
import React, { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";

interface DayPickerCalendarProps {
    /**
     * String value storing the date or date range.
     * Single date: "YYYY-MM-DD"
     * Date range: "YYYY-MM-DD,YYYY-MM-DD"
     */
    value: string;
    onChange: (val: string) => void;
    className?: string;
}

export function DayPickerCalendar({
    value,
    onChange,
    className
}: DayPickerCalendarProps) {
    // Parse incoming value into a tuple: [Start Date, End Date]
    const parsedDates = useMemo<[Date | null, Date | null]>(() => {
        if (!value) return [null, null];
        const parts = value.split(",");

        const start = parts[0] ? new Date(parts[0]) : null;
        let end = parts[1] ? new Date(parts[1]) : null;

        // Ensure valid dates
        const safeStart = start && !isNaN(start.getTime()) ? start : null;
        const safeEnd = end && !isNaN(end.getTime()) ? end : null;

        return [safeStart, safeEnd];
    }, [value]);

    const [startDate, setStartDate] = useState<Date | null>(parsedDates[0]);
    const [endDate, setEndDate] = useState<Date | null>(parsedDates[1]);

    // Decide which month to show initially
    const [viewDate, setViewDate] = useState<Date>(parsedDates[0] || new Date());

    // Update internal state if props change (e.g., cleared from outside)
    useEffect(() => {
        setStartDate(parsedDates[0]);
        setEndDate(parsedDates[1]);
        if (parsedDates[0] && parsedDates[0].getTime() !== startDate?.getTime()) {
            setViewDate(new Date(parsedDates[0]));
        }
    }, [parsedDates]);

    // Handle emitting the string back up cleanly
    const updateValue = (s: Date | null, e: Date | null) => {
        if (!s) {
            onChange("");
            return;
        }

        // Format helper Date -> YYYY-MM-DD
        const format = (d: Date) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        if (!e || s.getTime() === e.getTime()) {
            onChange(format(s));
        } else {
            // Ensure start is always before end
            const isReversed = s > e;
            const finalStart = isReversed ? e : s;
            const finalEnd = isReversed ? s : e;

            onChange(`${format(finalStart)},${format(finalEnd)}`);
        }
    };

    const days = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        // Get the start of the week for the first day
        const startDay = new Date(firstDayOfMonth);
        startDay.setDate(startDay.getDate() - startDay.getDay());

        // Get the end of the week for the last day
        const endDay = new Date(lastDayOfMonth);
        endDay.setDate(endDay.getDate() + (6 - endDay.getDay()));

        const calendarDays: {
            date: Date;
            isCurrentMonth: boolean;
            isToday: boolean;
            isSelected: boolean;
            isInRange: boolean;
            isStart: boolean;
            isEnd: boolean;
        }[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const iterDate = new Date(startDay);
        while (iterDate <= endDay) {
            const iterTime = new Date(iterDate).setHours(0, 0, 0, 0);
            const sTime = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
            const eTime = endDate ? new Date(endDate).setHours(0, 0, 0, 0) : null;

            const isStart = sTime !== null && iterTime === sTime;
            const isEnd = eTime !== null && iterTime === eTime;
            const isSelected = isStart || isEnd;
            const isInRange = sTime !== null && eTime !== null && iterTime > Math.min(sTime, eTime) && iterTime < Math.max(sTime, eTime);

            calendarDays.push({
                date: new Date(iterDate),
                isCurrentMonth: iterDate.getMonth() === month,
                isToday: iterTime === today.getTime(),
                isSelected,
                isInRange,
                isStart,
                isEnd,
            });
            iterDate.setDate(iterDate.getDate() + 1);
        }
        return calendarDays;
    }, [viewDate, startDate, endDate]);

    const handleDateClick = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);

        if (!startDate || (startDate && endDate)) {
            // Start a brand new selection
            setStartDate(d);
            setEndDate(null);
            updateValue(d, null);
        } else {
            // We have a start date but no end date, complete the range
            setEndDate(d);
            updateValue(startDate, d);
        }
    };

    const setToday = () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        setStartDate(d);
        setEndDate(null);
        setViewDate(d);
        updateValue(d, null);
    };

    const clearSelection = () => {
        setStartDate(null);
        setEndDate(null);
        updateValue(null, null);
    }

    const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));

    const ChevronLeftIcon = () => (
        <svg width="11" height="17" viewBox="0 0 120 120"><path d="M69.490332,3.34314575 C72.6145263,0.218951416 77.6798462,0.218951416 80.8040405,3.34314575 C83.8617626,6.40086786 83.9268205,11.3179931 80.9992143,14.4548388 L80.8040405,14.6568542 L35.461,60 L80.8040405,105.343146 C83.8617626,108.400868 83.9268205,113.317993 80.9992143,116.454839 L80.8040405,116.656854 C77.7463184,119.714576 72.8291931,119.779634 69.6923475,116.852028 L69.490332,116.656854 L18.490332,65.6568542 C15.4326099,62.5991321 15.367552,57.6820069 18.2951583,54.5451612 L18.490332,54.3431458 L69.490332,3.34314575 Z" fill="currentColor" fillRule="nonzero"></path></svg>
    );

    const ChevronRightIcon = () => (
        <svg width="11" height="17" viewBox="0 0 120 120"><path d="M49.8040405,3.34314575 C46.6798462,0.218951416 41.6145263,0.218951416 38.490332,3.34314575 C35.4326099,6.40086786 35.367552,11.3179931 38.2951583,14.4548388 L38.490332,14.6568542 L83.8333725,60 L38.490332,105.343146 C35.4326099,108.400868 35.367552,113.317993 38.2951583,116.454839 L38.490332,116.656854 C41.5480541,119.714576 46.4651794,119.779634 49.602025,116.852028 L49.8040405,116.656854 L100.804041,65.6568542 C103.861763,62.5991321 103.926821,57.6820069 100.999214,54.5451612 L100.804041,54.3431458 L49.8040405,3.34314575 Z" fill="currentColor"></path></svg>
    );

    return (
        <div className={cn("bg-background border rounded-[10px] shadow-xl w-[270px] select-none flex flex-col relative", className)}>

            {/* Header & Navigation */}
            <div className="p-2 border-b border-muted">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[14px] font-semibold text-foreground px-1">
                        {viewDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
                    </h2>
                    <div className="flex items-center gap-1 border border-muted/30 rounded-md p-0.5">
                        <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center hover:bg-accent rounded text-muted-foreground transition-colors">
                            <ChevronLeftIcon />
                        </button>

                        {/* <button
                            onClick={setToday}
                            title="Jump to Today"
                            className="w-4 h-4 rounded-full bg-accent hover:bg-muted-foreground flex items-center justify-center mx-1 transition-colors"
                        /> */}

                        <button onClick={nextMonth} className="w-6 h-6 flex items-center justify-center hover:bg-accent rounded text-muted-foreground transition-colors">
                            <ChevronRightIcon />
                        </button>
                    </div>
                </div>

                {/* Day Labels */}
                <div className="grid grid-cols-7 gap-0.5 mb-1 text-center">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, i) => (
                        <div key={i} className="text-[11px] text-muted-foreground font-medium py-1">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-y-0.5">
                    {days.map((day, i) => {
                        const isRangeActive = startDate !== null && endDate !== null;
                        // Handle reversed selections cleanly for rounded corners
                        const firstDate = isRangeActive && startDate && endDate ? (startDate < endDate ? startDate : endDate) : null;
                        const lastDate = isRangeActive && startDate && endDate ? (startDate > endDate ? startDate : endDate) : null;

                        const isFirst = firstDate && day.date.getTime() === firstDate.getTime();
                        const isLast = lastDate && day.date.getTime() === lastDate.getTime();

                        return (
                            <button
                                key={i}
                                onClick={(e) => { e.preventDefault(); handleDateClick(day.date); }}
                                className={cn(
                                    "text-[12px] h-[28px] w-full flex items-center justify-center transition-all relative z-0",
                                    !day.isCurrentMonth && "text-muted-foreground opacity-30",
                                    day.isToday && !day.isSelected && !day.isInRange && "text-[#2383e2] font-bold",
                                    day.isInRange && "bg-[#ebf5fe] dark:bg-[#1a3d5e] z-0",
                                    // Selected Start and End nodes
                                    day.isSelected && "bg-[#2383e2] text-white z-10",
                                    isFirst && isRangeActive && "rounded-l-md",
                                    isLast && isRangeActive && "rounded-r-md",
                                    day.isSelected && (!isRangeActive) && "rounded-md",

                                    !day.isSelected && !day.isInRange && "hover:bg-accent rounded-md"
                                )}
                            >
                                {day.date.getDate()}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="p-1 px-2 flex items-center justify-end h-9">
                {value && (
                    <button onClick={clearSelection} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-medium">
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}
