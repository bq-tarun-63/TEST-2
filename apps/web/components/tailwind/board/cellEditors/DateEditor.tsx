"use client";

import React, { useState } from "react";
import BaseCellEditor from "./BaseCellEditor";
import type { CellEditorProps } from "@/types/cellEditor";
import { DayPickerCalendar } from "@/components/tailwind/common/GenericCalendar";

function parseInitialDate(dateValue: any): string {
  if (!dateValue) return "";
  if (typeof dateValue === "string") {
    // Already string, could be range or single date
    return dateValue;
  }

  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

export default function DateEditor({ value, property, onUpdate, onClose, note, boardId, position }: CellEditorProps) {
  const [dateString, setDateString] = useState<string>(() => parseInitialDate(value));

  const handleChange = (val: string) => {
    setDateString(val);
    onUpdate(note._id, property.id, val || null);
  };

  const handleClear = () => {
    setDateString("");
    onUpdate(note._id, property.id, null);
    onClose();
  };

  return (
    <BaseCellEditor
      value={value}
      property={property}
      note={note}
      boardId={boardId}
      onUpdate={onUpdate}
      onClose={onClose}
      position={position}
      className="p-0"
    >
      <div className="flex flex-col bg-white dark:bg-gray-800 rounded overflow-hidden">
        <DayPickerCalendar
          value={dateString}
          onChange={handleChange}
        />
      </div>
    </BaseCellEditor>
  );
}
