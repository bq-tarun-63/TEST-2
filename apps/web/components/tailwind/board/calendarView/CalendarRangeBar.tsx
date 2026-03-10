"use client";

import { useBoard } from "@/contexts/boardContext";
import type { Block } from "@/types/block";
import { useMemo } from "react";
import { formatDate } from "@/lib/utils";

export interface RangeSegment {
    noteId: string;
    note: Block;
    colStart: number;
    colEnd: number;
    isStart: boolean;
    isEnd: boolean;
    stackRow: number;
}

interface CalendarRangeBarProps {
    segment: RangeSegment;
    board: Block;
    onClick: () => void;
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    canDrag?: boolean;
}

/** Height of one bar row in px — tall enough for title + one property row */
export const BAR_ROW_HEIGHT = 72;
/** Top offset before the first bar — space for the date number row */
export const BAR_TOP_OFFSET = 32;

// Compact color map shared with CalendarCard
const OPTION_COLOR_MAP: Record<string, { bg: string; text: string }> = {
    default: { bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-900 dark:text-gray-100" },
    gray: { bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-900 dark:text-gray-100" },
    brown: { bg: "bg-orange-200 dark:bg-orange-900", text: "text-orange-900 dark:text-orange-100" },
    orange: { bg: "bg-orange-200 dark:bg-orange-800", text: "text-orange-900 dark:text-orange-100" },
    yellow: { bg: "bg-yellow-200 dark:bg-yellow-800", text: "text-yellow-900 dark:text-yellow-100" },
    green: { bg: "bg-green-200 dark:bg-green-800", text: "text-green-900 dark:text-green-100" },
    blue: { bg: "bg-blue-200 dark:bg-blue-800", text: "text-blue-900 dark:text-blue-100" },
    purple: { bg: "bg-purple-200 dark:bg-purple-800", text: "text-purple-900 dark:text-purple-100" },
    pink: { bg: "bg-pink-200 dark:bg-pink-800", text: "text-pink-900 dark:text-pink-100" },
    red: { bg: "bg-red-200 dark:bg-red-800", text: "text-red-900 dark:text-red-100" },
};

function getOptionColor(schema: { options?: { id?: string; name: string; color?: string }[] }, id: string) {
    const opt = schema.options?.find((o) => String(o.id) === String(id));
    return OPTION_COLOR_MAP[opt?.color || "default"] ?? OPTION_COLOR_MAP.default!;
}

export default function CalendarRangeBar({
    segment,
    board,
    onClick,
    onDragStart,
    onDragEnd,
    canDrag = false,
}: CalendarRangeBarProps) {
    const { getCurrentDataSourceProperties, getPropertyVisibility, propertyOrder } = useBoard();
    const boardProperties = getCurrentDataSourceProperties(board._id) || {};
    const visiblePropertyIds = getPropertyVisibility(board._id) || [];

    const leftPct = (segment.colStart / 7) * 100;
    const widthPct = ((segment.colEnd - segment.colStart + 1) / 7) * 100;
    const topPx = BAR_TOP_OFFSET + segment.stackRow * BAR_ROW_HEIGHT;

    const roundLeft = segment.isStart ? "rounded-l-md" : "rounded-l-none";
    const roundRight = segment.isEnd ? "rounded-r-md" : "rounded-r-none";

    // Build ordered list of max 3 visible props to show as compact badges
    const orderedVisibleProps = useMemo(() => {
        if (!visiblePropertyIds.length) return [];
        const order = propertyOrder[board._id];
        const effective = (order?.length ? order : Object.keys(boardProperties).filter((id) => id !== "title"));
        return [
            ...effective.filter((id) => visiblePropertyIds.includes(id)),
            ...visiblePropertyIds.filter((id) => !effective.includes(id)),
        ]
            .filter((id) => boardProperties[id])
            .slice(0, 3);
    }, [visiblePropertyIds, boardProperties, propertyOrder, board._id]);

    const note = segment.note;
    const props = note.value.databaseProperties || {};

    // Render a single property as a compact inline badge / text
    const renderProp = (propId: string) => {
        const schema = boardProperties[propId] as any;
        if (!schema) return null;
        const value = props[propId];
        if (value === undefined || value === null || value === "") return null;

        switch (schema.type) {
            case "status":
            case "select":
            case "priority": {
                const colors = getOptionColor(schema, String(value));
                const opt = schema.options?.find((o: any) => String(o.id) === String(value));
                const label = opt?.name || String(value);
                return (
                    <span key={propId} className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium leading-4 ${colors.bg} ${colors.text}`}>
                        {label}
                    </span>
                );
            }
            case "person": {
                const members = Array.isArray(value) ? value : [];
                if (!members.length) return null;
                const names = members.slice(0, 2).map((m: any) => m.userName || "?").join(", ");
                return (
                    <span key={propId} className="inline-flex items-center text-[10px] text-gray-500 dark:text-gray-400">
                        👤 {names}
                    </span>
                );
            }
            case "checkbox": {
                return (
                    <span key={propId} className="text-[10px] text-gray-500 dark:text-gray-400">
                        {value ? "☑" : "☐"} {schema.name}
                    </span>
                );
            }
            case "date": {
                const dateStr = String(value);
                const parts = dateStr.split(",");
                const formatted = parts.length === 2 && parts[1]
                    ? `${formatDate(parts[0])} → ${formatDate(parts[1])}`
                    : formatDate(parts[0]);
                if (!formatted) return null;
                return (
                    <span key={propId} className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {formatted}
                    </span>
                );
            }
            case "number":
            case "text":
            case "email":
            case "url":
            case "phone": {
                const str = String(value);
                if (!str) return null;
                return (
                    <span key={propId} className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[60px]">
                        {str}
                    </span>
                );
            }
            default:
                return null;
        }
    };

    const propBadges = orderedVisibleProps.map(renderProp).filter(Boolean);

    return (
        <div
            draggable={canDrag}
            className={`absolute flex flex-col justify-center px-2 text-xs font-medium select-none
        transition-all border
        bg-white dark:bg-[#2c2c2c]
        border-gray-200 dark:border-[#343434]
        text-gray-900 dark:text-gray-100
        hover:bg-gray-100 dark:hover:bg-[#383838]
        ${canDrag ? "cursor-move" : "cursor-pointer"}
        ${roundLeft} ${roundRight}`}
            style={{
                left: `calc(${leftPct}% + ${segment.isStart ? 4 : 0}px)`,
                width: `calc(${widthPct}% - ${segment.isStart ? 4 : 0}px - ${segment.isEnd ? 4 : 0}px)`,
                top: `${topPx}px`,
                height: `${BAR_ROW_HEIGHT - 6}px`,
                zIndex: 10,
                pointerEvents: "auto",
                overflow: "hidden",
            }}
            title={note.value.title || "New page"}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onDragStart={(e) => { e.stopPropagation(); onDragStart?.(e); }}
            onDragEnd={(e) => { e.stopPropagation(); onDragEnd?.(e); }}
        >
            {/* ── Title row ── */}
            <div className="flex items-center gap-1 truncate leading-none">
                {!segment.isStart && <span className="opacity-40 flex-shrink-0 text-gray-400">←</span>}
                <span className="truncate font-semibold">
                    {note.value.icon ? `${note.value.icon} ` : ""}
                    {note.value.title || "New page"}
                </span>
                {!segment.isEnd && <span className="opacity-40 flex-shrink-0 text-gray-400 ml-auto">→</span>}
            </div>

            {/* ── Property badges row ── */}
            {propBadges.length > 0 && (
                <div className="flex items-center gap-1 mt-0.5 truncate overflow-hidden">
                    {propBadges}
                </div>
            )}
        </div>
    );
}
