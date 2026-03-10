"use client";
import React, { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Check, AlarmClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/tailwind/ui/popover";

interface MentionDateCalenderProps {
    initialStartDate?: Date;
    initialEndDate?: Date;
    initialIncludeTime?: boolean;
    initialReminder?: string;
    initialTimeFormat?: '12h' | '24h';
    onSelect: (start: Date | null, end: Date | null, includeTime: boolean, reminder: string, timeFormat: '12h' | '24h') => void;
    className?: string;
}

const REMINDER_OPTIONS = [
    { label: "None", value: "none" },
    { label: "At time of event", value: "at_time" },
    { label: "5 minutes before", value: "5_mins" },
    { label: "10 minutes before", value: "10_mins" },
    { label: "15 minutes before", value: "15_mins" },
    { label: "30 minutes before", value: "30_mins" },
    { label: "1 hour before", value: "1_hour" },
    { label: "2 hours before", value: "2_hours" },
    { label: "1 day before (9:00 AM)", value: "1_day" },
    { label: "2 days before (9:00 AM)", value: "2_days" },
];

const Switch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div
        onClick={(e) => { e.stopPropagation(); onChange(); }}
        className={cn(
            "relative flex-shrink-0 h-[18px] w-[30px] rounded-full cursor-pointer transition-colors duration-200 p-[2px]",
            checked ? "bg-[#2383e2]" : "bg-[#d3d1cb] dark:bg-[#474c50]"
        )}
    >
        <div className={cn(
            "h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200",
            checked ? "translate-x-[12px]" : "translate-x-0"
        )} />
    </div>
);

const InputCell = ({ value, onChange, placeholder, isFocused, onBlur, onFocus }: any) => (
    <div
        className={cn(
            "flex items-center rounded-[6px] h-[28px] px-[8px] transition-all duration-200",
            isFocused
                ? "bg-[rgba(35,131,226,0.15)] shadow-[rgb(35,131,226)_0px_0px_0px_2px_inset]"
                : "bg-accent/30 dark:bg-accent/10 border border-muted/20"
        )}
    >
        <input
            type="text"
            value={value}
            onChange={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
            className="bg-transparent border-none outline-none text-[14px] w-full placeholder:text-muted-foreground/50 h-full"
            placeholder={placeholder}
        />
    </div>
);

export function MentionDateCalender({
    initialStartDate,
    initialEndDate,
    initialIncludeTime = false,
    initialReminder = 'none',
    initialTimeFormat = '12h',
    onSelect,
    className
}: MentionDateCalenderProps) {
    const [viewDate, setViewDate] = useState(initialStartDate || new Date());
    const [startDate, setStartDate] = useState<Date | null>(initialStartDate || null);
    const [endDate, setEndDate] = useState<Date | null>(initialEndDate || null);
    const [isRangeMode, setIsRangeMode] = useState(!!initialEndDate);
    const [includeTime, setIncludeTime] = useState(initialIncludeTime);
    const [reminder, setReminder] = useState(initialReminder);
    const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>(initialTimeFormat);
    const [isReminderOpen, setIsReminderOpen] = useState(false);

    // Input States
    const [startInput, setStartInput] = useState("");
    const [startTimeInput, setStartTimeInput] = useState("");
    const [endInput, setEndInput] = useState("");
    const [endTimeInput, setEndTimeInput] = useState("");
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const updateLabel = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Tomorrow";
        if (diffDays === -1) return "Yesterday";
        if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
        if (diffDays >= 7 && diffDays < 14) return `Next ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
        if (diffDays < -1 && diffDays > -7) return `Last ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: timeFormat !== '24h'
        }).toLowerCase();
    };

    useEffect(() => {
        if (startDate) {
            if (focusedField !== 'start') setStartInput(updateLabel(startDate));
            if (focusedField !== 'startTime') setStartTimeInput(formatTime(startDate));
        }
        if (endDate) {
            if (focusedField !== 'end') setEndInput(updateLabel(endDate));
            if (focusedField !== 'endTime') setEndTimeInput(formatTime(endDate));
        } else if (isRangeMode && startDate) {
            if (focusedField !== 'end') setEndInput(updateLabel(startDate));
            if (focusedField !== 'endTime') setEndTimeInput(formatTime(startDate));
        } else {
            if (focusedField !== 'end') setEndInput("");
            if (focusedField !== 'endTime') setEndTimeInput("");
        }
    }, [startDate, endDate, isRangeMode, timeFormat, focusedField]);

    const update = (s: Date | null, e: Date | null, t: boolean, r: string, tf: '12h' | '24h') => {
        onSelect(s, e, t, r, tf);
    };

    const days = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const startDay = new Date(firstDayOfMonth);
        startDay.setDate(startDay.getDate() - startDay.getDay());
        const endDay = new Date(lastDayOfMonth);
        endDay.setDate(endDay.getDate() + (6 - endDay.getDay()));

        const calendarDays: { date: Date; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean; isInRange: boolean; isStart: boolean; isEnd: boolean }[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const iterDate = new Date(startDay);
        while (iterDate <= endDay) {
            const iterTime = new Date(iterDate).setHours(0, 0, 0, 0);
            const startTime = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
            const endTime = (endDate && isRangeMode) ? new Date(endDate).setHours(0, 0, 0, 0) : null;

            calendarDays.push({
                date: new Date(iterDate),
                isCurrentMonth: iterDate.getMonth() === month,
                isToday: iterTime === today.getTime(),
                isSelected: !!((startTime && iterTime === startTime) || (endTime && iterTime === endTime)),
                isInRange: !!(startTime && endTime && iterTime >= startTime && iterTime <= endTime),
                isStart: !!(startTime && iterTime === startTime),
                isEnd: !!(endTime && iterTime === endTime),
            });
            iterDate.setDate(iterDate.getDate() + 1);
        }
        return calendarDays;
    }, [viewDate, startDate, endDate, isRangeMode]);

    const handleDateClick = (date: Date) => {
        const d = new Date(date);

        // Preserve existing time if available
        if (startDate) {
            d.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        } else {
            const now = new Date();
            d.setHours(now.getHours(), now.getMinutes(), 0, 0);
        }

        if (!isRangeMode) {
            setStartDate(d);
            setEndDate(null);
            update(d, null, includeTime, reminder, timeFormat);
            return;
        }

        if (!startDate || (startDate && endDate)) {
            setStartDate(d);
            setEndDate(null);
            update(d, d, includeTime, reminder, timeFormat);
        } else if (d < startDate) {
            setEndDate(startDate);
            setStartDate(d);
            update(d, startDate, includeTime, reminder, timeFormat);
        } else {
            setEndDate(d);
            update(startDate, d, includeTime, reminder, timeFormat);
        }
    };

    const toggleRangeMode = () => {
        const newMode = !isRangeMode;
        setIsRangeMode(newMode);
        if (!newMode) {
            setEndDate(null);
            update(startDate, null, includeTime, reminder, timeFormat);
        } else if (startDate) {
            update(startDate, startDate, includeTime, reminder, timeFormat);
        }
    };

    const toggleIncludeTime = () => {
        const newVal = !includeTime;
        setIncludeTime(newVal);
        update(startDate, isRangeMode ? (endDate || startDate) : null, newVal, reminder, timeFormat);
    };

    const toggleTimeFormat = () => {
        const newVal = timeFormat === '12h' ? '24h' : '12h';
        setTimeFormat(newVal);
        update(startDate, isRangeMode ? (endDate || startDate) : null, includeTime, reminder, newVal);
    };

    const handleReminderChange = (newReminder: string) => {
        setReminder(newReminder);
        setIsReminderOpen(false);
        update(startDate, isRangeMode ? (endDate || startDate) : null, includeTime, newReminder, timeFormat);
    };

    const setToday = () => {
        const d = new Date();
        if (startDate) {
            d.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        } else {
            d.setHours(0, 0, 0, 0);
        }
        setStartDate(d);
        setEndDate(null);
        setViewDate(d);
        update(d, isRangeMode ? d : null, includeTime, reminder, timeFormat);
    };

    const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));

    const parseDateInput = (val: string, current: Date | null): Date | null => {
        if (!val) return current;
        const lower = val.toLowerCase();

        const getBaseWithTime = () => {
            const d = new Date();
            if (current) {
                d.setHours(current.getHours(), current.getMinutes(), 0, 0);
            } else {
                d.setHours(0, 0, 0, 0);
            }
            return d;
        };

        if (lower.includes("today")) return getBaseWithTime();
        if (lower.includes("tomorrow") || lower.includes("tmr")) {
            const d = getBaseWithTime();
            d.setDate(d.getDate() + 1);
            return d;
        }
        if (lower.includes("yesterday")) {
            const d = getBaseWithTime();
            d.setDate(d.getDate() - 1);
            return d;
        }
        const parsed = new Date(val);
        if (!isNaN(parsed.getTime())) {
            // Preserve time if current exists
            if (current) {
                parsed.setHours(current.getHours(), current.getMinutes(), 0, 0);
            }
            return parsed;
        }
        return current;
    };

    const parseTimeInput = (val: string, current: Date | null): Date | null => {
        if (!current || !val) return current;
        const match = val.match(/(\d+):(\d+)\s*(am|pm)?/i);
        if (!match) return current;

        const hStr = match[1];
        const mStr = match[2];
        if (!hStr || !mStr) return current;

        let hours = parseInt(hStr, 10);
        const mins = parseInt(mStr, 10);
        const ampm = match[3]?.toLowerCase();

        if (ampm === "pm" && hours < 12) hours += 12;
        if (ampm === "am" && hours === 12) hours = 0;

        const d = new Date(current);
        d.setHours(hours, mins, 0, 0);
        return d;
    };

    const handleInputBlur = (field: 'start' | 'startTime' | 'end' | 'endTime') => {
        setFocusedField(null);
        if (field === 'start') {
            const newDate = parseDateInput(startInput, startDate);
            if (newDate) {
                setStartDate(newDate);
                update(newDate, isRangeMode ? (endDate || newDate) : null, includeTime, reminder, timeFormat);
            }
        } else if (field === 'startTime') {
            const newDate = parseTimeInput(startTimeInput, startDate);
            if (newDate) {
                setStartDate(newDate);
                update(newDate, isRangeMode ? (endDate || newDate) : null, includeTime, reminder, timeFormat);
            }
        } else if (field === 'end') {
            const currentEnd = endDate || startDate;
            const newDate = parseDateInput(endInput, currentEnd);
            if (newDate) {
                setEndDate(newDate);
                update(startDate, newDate, includeTime, reminder, timeFormat);
            }
        } else if (field === 'endTime') {
            const currentEnd = endDate || startDate;
            const newDate = parseTimeInput(endTimeInput, currentEnd);
            if (newDate) {
                setEndDate(newDate);
                update(startDate, newDate, includeTime, reminder, timeFormat);
            }
        }
    };

    const ChevronLeftIcon = () => (
        <svg width="11" height="17" viewBox="0 0 120 120"><path d="M69.490332,3.34314575 C72.6145263,0.218951416 77.6798462,0.218951416 80.8040405,3.34314575 C83.8617626,6.40086786 83.9268205,11.3179931 80.9992143,14.4548388 L80.8040405,14.6568542 L35.461,60 L80.8040405,105.343146 C83.8617626,108.400868 83.9268205,113.317993 80.9992143,116.454839 L80.8040405,116.656854 C77.7463184,119.714576 72.8291931,119.779634 69.6923475,116.852028 L69.490332,116.656854 L18.490332,65.6568542 C15.4326099,62.5991321 15.367552,57.6820069 18.2951583,54.5451612 L18.490332,54.3431458 L69.490332,3.34314575 Z" fill="currentColor" fillRule="nonzero"></path></svg>
    );

    const ChevronRightIcon = () => (
        <svg width="11" height="17" viewBox="0 0 120 120"><path d="M49.8040405,3.34314575 C46.6798462,0.218951416 41.6145263,0.218951416 38.490332,3.34314575 C35.4326099,6.40086786 35.367552,11.3179931 38.2951583,14.4548388 L38.490332,14.6568542 L83.8333725,60 L38.490332,105.343146 C35.4326099,108.400868 35.367552,113.317993 38.2951583,116.454839 L38.490332,116.656854 C41.5480541,119.714576 46.4651794,119.779634 49.602025,116.852028 L49.8040405,116.656854 L100.804041,65.6568542 C103.861763,62.5991321 103.926821,57.6820069 100.999214,54.5451612 L100.804041,54.3431458 L49.8040405,3.34314575 Z" fill="currentColor"></path></svg>
    );

    return (
        <div className={cn("bg-background border rounded-[10px] shadow-xl w-[270px] select-none flex flex-col relative", className)}>
            {/* Input Section */}
            <div className="p-[8px] space-y-[8px] border-b border-muted/50">
                {/* State: Both OFF -> Start Date Full Width */}
                {!isRangeMode && !includeTime && (
                    <div className="w-full">
                        <InputCell
                            value={startInput}
                            onChange={(e: any) => setStartInput(e.target.value)}
                            onFocus={() => setFocusedField('start')}
                            onBlur={() => handleInputBlur('start')}
                            isFocused={focusedField === 'start'}
                            placeholder="Date"
                        />
                    </div>
                )}

                {/* State: Only End Date ON -> Start Date | End Date */}
                {isRangeMode && !includeTime && (
                    <div className="flex items-center gap-[8px]">
                        <div className="flex-grow flex-shrink basis-1/2 min-w-0">
                            <InputCell
                                value={startInput}
                                onChange={(e: any) => setStartInput(e.target.value)}
                                onFocus={() => setFocusedField('start')}
                                onBlur={() => handleInputBlur('start')}
                                isFocused={focusedField === 'start'}
                                placeholder="Start Date"
                            />
                        </div>
                        <div className="flex-grow flex-shrink basis-1/2 min-w-0">
                            <InputCell
                                value={endInput}
                                onChange={(e: any) => setEndInput(e.target.value)}
                                onFocus={() => setFocusedField('end')}
                                onBlur={() => handleInputBlur('end')}
                                isFocused={focusedField === 'end'}
                                placeholder="End Date"
                            />
                        </div>
                    </div>
                )}

                {/* State: Only Time ON -> Start Date | Start Time */}
                {!isRangeMode && includeTime && (
                    <div className="flex items-center gap-[8px]">
                        <div className="flex-grow flex-shrink basis-1/2 min-w-0">
                            <InputCell
                                value={startInput}
                                onChange={(e: any) => setStartInput(e.target.value)}
                                onFocus={() => setFocusedField('start')}
                                onBlur={() => handleInputBlur('start')}
                                isFocused={focusedField === 'start'}
                                placeholder="Date"
                            />
                        </div>
                        <div className="flex-grow flex-shrink basis-1/2 min-w-0">
                            <InputCell
                                value={startTimeInput}
                                onChange={(e: any) => setStartTimeInput(e.target.value)}
                                onFocus={() => setFocusedField('startTime')}
                                onBlur={() => handleInputBlur('startTime')}
                                isFocused={focusedField === 'startTime'}
                                placeholder="Time"
                            />
                        </div>
                    </div>
                )}

                {/* State: Both ON -> S Date | S Time [break] E Date | E Time */}
                {isRangeMode && includeTime && (
                    <>
                        <div className="flex items-center gap-[8px]">
                            <div className="flex-grow flex-shrink basis-1/2 min-w-0">
                                <InputCell
                                    value={startInput}
                                    onChange={(e: any) => setStartInput(e.target.value)}
                                    onFocus={() => setFocusedField('start')}
                                    onBlur={() => handleInputBlur('start')}
                                    isFocused={focusedField === 'start'}
                                    placeholder="Start Date"
                                />
                            </div>
                            <div className="flex-grow flex-shrink basis-1/2 min-w-0">
                                <InputCell
                                    value={startTimeInput}
                                    onChange={(e: any) => setStartTimeInput(e.target.value)}
                                    onFocus={() => setFocusedField('startTime')}
                                    onBlur={() => handleInputBlur('startTime')}
                                    isFocused={focusedField === 'startTime'}
                                    placeholder="Start Time"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-[8px]">
                            <div className="flex-grow flex-shrink basis-1/2 min-w-0">
                                <InputCell
                                    value={endInput}
                                    onChange={(e: any) => setEndInput(e.target.value)}
                                    onFocus={() => setFocusedField('end')}
                                    onBlur={() => handleInputBlur('end')}
                                    isFocused={focusedField === 'end'}
                                    placeholder="End Date"
                                />
                            </div>
                            <div className="flex-grow flex-shrink basis-1/2 min-w-0">
                                <InputCell
                                    value={endTimeInput}
                                    onChange={(e: any) => setEndTimeInput(e.target.value)}
                                    onFocus={() => setFocusedField('endTime')}
                                    onBlur={() => handleInputBlur('endTime')}
                                    isFocused={focusedField === 'endTime'}
                                    placeholder="End Time"
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Calendar Section */}
            <div className="p-2">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[14px] font-semibold text-foreground px-1">
                        {viewDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
                    </h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={setToday}
                            className="text-[12px] font-medium text-muted-foreground hover:bg-accent px-2 py-0.5 rounded transition-colors"
                        >
                            Today
                        </button>
                        <button onClick={prevMonth} className="w-5 h-5 flex items-center justify-center hover:bg-accent rounded text-muted-foreground transition-colors">
                            <ChevronLeftIcon />
                        </button>
                        <button onClick={nextMonth} className="w-5 h-5 flex items-center justify-center hover:bg-accent rounded text-muted-foreground transition-colors">
                            <ChevronRightIcon />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, i) => (
                        <div key={i} className="text-[11px] text-muted-foreground font-medium text-center py-1">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-y-0.5">
                    {days.map((day, i) => {
                        const isRangeActive = isRangeMode && startDate && (endDate || startDate);
                        return (
                            <button
                                key={i}
                                onClick={() => handleDateClick(day.date)}
                                className={cn(
                                    "text-[12px] h-[28px] w-full flex items-center justify-center transition-all relative z-0",
                                    !day.isCurrentMonth && "text-muted-foreground opacity-30",
                                    day.isToday && !day.isSelected && !day.isInRange && "text-[#2383e2] font-bold",
                                    day.isInRange && !day.isSelected && "bg-[#ebf5fe] dark:bg-[#1a3d5e] z-0",
                                    day.isStart && isRangeActive && "bg-[#2383e2] text-white rounded-l-md z-10",
                                    day.isEnd && isRangeActive && "bg-[#2383e2] text-white rounded-r-md z-10",
                                    day.isSelected && (!isRangeActive) && "bg-[#2383e2] text-white rounded-md z-10",
                                    day.isStart && day.isEnd && isRangeActive && "rounded-md",
                                    !day.isSelected && !day.isInRange && "hover:bg-accent rounded-md"
                                )}
                            >
                                {day.date.getDate()}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Options Section */}
            <div className="mt-1 px-1 pb-1 border-t border-muted/50">
                <div
                    onClick={toggleRangeMode}
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-accent/50 rounded-md cursor-pointer transition-colors"
                >
                    <span className="text-[13px] text-foreground">End date</span>
                    <Switch checked={isRangeMode} onChange={toggleRangeMode} />
                </div>

                <div
                    onClick={toggleIncludeTime}
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-accent/50 rounded-md cursor-pointer transition-colors"
                >
                    <span className="text-[13px] text-foreground">Include time</span>
                    <Switch checked={includeTime} onChange={toggleIncludeTime} />
                </div>

                {includeTime && (
                    <div
                        onClick={toggleTimeFormat}
                        className="flex items-center justify-between px-2 py-1.5 hover:bg-accent/50 rounded-md cursor-pointer transition-colors"
                    >
                        <span className="text-[13px] text-foreground">Time format</span>
                        <div className="flex items-center gap-1 text-[13px] text-muted-foreground capitalize">
                            <span>{timeFormat}</span>
                        </div>
                    </div>
                )}

                <Popover open={isReminderOpen} onOpenChange={setIsReminderOpen}>
                    <PopoverTrigger asChild>
                        <div className="flex items-center justify-between px-2 py-1.5 hover:bg-accent/50 rounded-md cursor-pointer transition-colors">
                            <span className="text-[13px] text-foreground">Remind</span>
                            <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
                                <span className="max-w-[120px] truncate">
                                    {REMINDER_OPTIONS.find(o => o.value === reminder)?.label || 'None'}
                                </span>
                                <svg className="w-3 h-3 rotate-90" viewBox="0 0 16 16"><path d="m12.76 6.52-4.32 4.32a.62.62 0 0 1-.44.18.62.62 0 0 1-.44-.18L3.24 6.52a.63.63 0 0 1 0-.88c.24-.24.64-.24.88 0L8 9.52l3.88-3.88c.24-.24.64-.24.88 0s.24.64 0 .88" fill="currentColor"></path></svg>
                            </div>
                        </div>
                    </PopoverTrigger>
                    <PopoverContent side="right" align="start" className="p-1 w-[220px] shadow-2xl border-muted/50 rounded-lg bg-background">
                        <div className="flex flex-col py-1">
                            {REMINDER_OPTIONS.map((opt) => (
                                <div
                                    key={opt.value}
                                    onClick={() => handleReminderChange(opt.value)}
                                    className={cn(
                                        "flex items-center justify-between px-3 h-8 text-[13px] cursor-pointer transition-colors rounded-md",
                                        reminder === opt.value ? "bg-[#ebf5fe] dark:bg-[#1a3d5e] text-[#2383e2]" : "hover:bg-accent"
                                    )}
                                >
                                    <span>{opt.label}</span>
                                    {reminder === opt.value && <Check className="w-3.5 h-3.5" />}
                                </div>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
