import { BoardProperty } from "@/types/board";
import React, { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/tailwind/ui/popover";
import { DayPickerCalendar } from "@/components/tailwind/common/GenericCalendar";
import { X } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface Props {
  value: any;
  onChange: (val: any, immediate?: boolean) => void;
  property?: BoardProperty;
}

export const DatePropertyInput = ({ value, onChange }: Props) => {
  // value is expected to be a string like "2026-03-10" or "2026-03-10,2026-03-15"
  const dateString = value ?? "";

  // Format the display label for the button
  const displayLabel = useMemo(() => {
    if (!dateString) return "Empty";

    const parts = dateString.split(",");

    if (parts.length === 1 || !parts[1]) {
      return formatDate(parts[0]);
    } else {
      return `${formatDate(parts[0])} → ${formatDate(parts[1])}`;
    }
  }, [dateString]);

  return (
    <div className="flex items-center group w-[250px]">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex-1 flex items-center gap-2 text-left justify-start px-2 py-1.5 h-[28px] overflow-hidden rounded-sm transition-colors",
              "hover:bg-gray-200 dark:hover:bg-[#2c2c2c]",
              !dateString ? "text-gray-400" : "text-gray-900 dark:text-gray-100"
            )}
          >
            <span className="text-sm truncate leading-none mt-0.5">
              {displayLabel}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border-none bg-transparent shadow-none" align="start">
          <DayPickerCalendar
            value={dateString}
            onChange={(val) => {
              onChange(val, true); // Immediate save to backend
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Clear Button */}
      {dateString && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange("", true);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-gray-400 hover:text-gray-600 transition-opacity"
          title="Clear date"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
