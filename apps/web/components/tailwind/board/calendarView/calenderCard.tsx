"use client";

import { useBoard } from "@/contexts/boardContext";
import type { Block } from "@/types/block";
import { Calendar, Edit, MenuIcon, Trash2Icon, User, FileText, Mail, Link as LinkIcon, Phone, Paperclip } from "lucide-react";
import { formatFormulaValue } from "@/utils/formatFormulaValue";
import { formatNumericValue } from "@/utils/formatNumericValue";
import type React from "react";
import { useEffect, useRef, useState, useMemo } from "react";
import { getColorStyles } from "@/utils/colorStyles";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import { computeRollupData } from "@/utils/rollupUtils";
import { formatDate } from "@/lib/utils";

interface CalendarCardProps {
  card: Block;
  board: Block;
  onEdit: (newTitle: string) => void;
  onDelete: () => void;
  onClick: (card: Block) => void;
  updateNoteTitleLocally?: (noteId: string, newTitle: string) => void;
}

export default function CalendarCard({ card, board, onEdit, onDelete, onClick, updateNoteTitleLocally }: CalendarCardProps) {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editValue, setEditValue] = useState<string>(card.value.title);
  const [originalTitle, setOriginalTitle] = useState<string>(card.value.title || "");
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const [showContextMenu, setShowContextMenu] = useState<boolean>(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const inputRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { propertyOrder, getCurrentDataSourceProperties, getPropertyVisibility, getRelationNoteTitle, getNotesByDataSourceId, getValidRelationIds, getDataSource } = useBoard();

  // Get properties from current data source
  const boardProperties = getCurrentDataSourceProperties(board._id) || {};

  // Get visible property IDs using the helper function which properly handles viewTypeId lookup
  const visiblePropertyIds = getPropertyVisibility(board._id) || [];

  const isInitialFocus = useRef(true);

  // Sync editValue with card title when card prop changes (e.g., when updated from sidebar)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(card.value.title);
      setOriginalTitle(card.value.title || ""); // Also update originalTitle
    }
  }, [card.value.title, isEditing]);

  // Helper function to get color styles for an option
  const getOptionColorStyles = (
    propSchema: { options?: { id?: string; name: string; color?: string }[] },
    optionValue: string,
  ) => {
    const option = propSchema.options?.find((opt) => String(opt.id) === String(optionValue));
    const color = option?.color || "default";
    return getColorStyles(color);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      const el = inputRef.current;
      if (isInitialFocus.current) {
        el.textContent = editValue;
        el.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        const len = el.textContent?.length || 0;
        if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
          range.setStart(el.firstChild, Math.min(len, (el.firstChild.textContent || "").length));
        } else {
          range.setStart(el, 0);
        }
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        isInitialFocus.current = false;
      }
    } else {
      isInitialFocus.current = true;
    }
  }, [isEditing, editValue]);

  // Get visible properties: only render properties that are in visiblePropertyIds for this viewTypeId
  const visibleProps = useMemo(() => {
    if (!boardProperties || Object.keys(boardProperties).length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[CalendarCard] No boardProperties available');
      }
      return [];
    }

    // When visibility array is empty, show all non-default properties (default behavior)
    // When visibility array has values, show only those properties
    if (visiblePropertyIds.length === 0) {
      return [];
    }

    const filtered = visiblePropertyIds.filter(propId => boardProperties[propId] !== undefined);

    if (process.env.NODE_ENV === 'development') {
      console.log('[CalendarCard] Showing only visible properties:', filtered);
    }

    return filtered;
  }, [boardProperties, visiblePropertyIds]);

  const order = propertyOrder[board._id];
  const effectiveOrder = order && order.length > 0
    ? order
    : Object.keys(boardProperties || {}).filter(id => id !== "title");

  const orderedVisibleProps = useMemo(() => [
    ...effectiveOrder.filter((propId) => visibleProps.includes(propId)),
    ...visibleProps.filter((propId) => !effectiveOrder.includes(propId)),
  ], [effectiveOrder, visibleProps]);

  const handleEditSubmit = () => {
    onEdit(editValue.trim());
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditing(false);
      setEditValue(card.value.title);
      // Revert local changes if cancelled
      if (updateNoteTitleLocally) {
        updateNoteTitleLocally(card._id, card.value.title);
      }
    }
  };



  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      onClick(card);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Calculate position to ensure menu stays within viewport
    const x = Math.min(e.clientX, window.innerWidth - 150);
    const y = Math.min(e.clientY, window.innerHeight - 120);

    setContextMenuPosition({ x, y });
    setShowContextMenu(true);
  };

  if (isEditing) {
    return (
      <div
        className="px-2 py-1 rounded cursor-pointer transition-opacity"
      >
        <div
          ref={inputRef}
          contentEditable
          suppressContentEditableWarning={true}
          onMouseDown={(e) => { e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); }}
          onDoubleClick={(e) => { e.stopPropagation(); }}
          onInput={(e) => {
            const newValue = e.currentTarget.textContent || "";
            setEditValue(newValue);
            if (updateNoteTitleLocally) {
              updateNoteTitleLocally(card._id, newValue);
            }
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const newValue = (e.currentTarget as HTMLDivElement).textContent?.trim() || "";
              // Don't call updateNoteTitleLocally here, handleEditSubmit will handle the API call
              setEditValue(newValue || card.value.title);
              handleEditSubmit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setIsEditing(false);
              setEditValue(card.value.title);
              // Revert local changes if cancelled
              if (updateNoteTitleLocally) {
                updateNoteTitleLocally(card._id, card.value.title);
              }
            }
          }}
          onBlur={(e) => {
            const newValue = e.currentTarget.textContent?.trim() || "";
            setEditValue(newValue);
            handleEditSubmit();
          }}
          className="text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent whitespace-pre-wrap px-1 py-1 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
          data-placeholder="New page"
          style={{ minHeight: "1.75rem", maxWidth: "100%" }}
        />
      </div>
    );
  }

  return (
    <>
      <div
        className="p-1.5 rounded-md cursor-pointer hover:opacity-80 transition-opacity truncate relative group border dark:border-[#343434] hover:bg-gray-200 dark:hover-bg-[#202020] bg-white dark:bg-[#2c2c2c]"
        title={card.value.title}
        onClick={handleCardClick}
        onContextMenu={handleContextMenu}
      >
        {/* Main title */}
        <div className="flex items-start gap-2">
          {card.value.icon && (
            <div
              role="button"
              tabIndex={0}
              className="flex items-center justify-center h-4 w-4 rounded-md flex-shrink-0 mr-1 mt-1 cursor-pointer hover:bg-accent transition-colors select-none"
            >
              <div className="text-sm">
                {card.value.icon}
              </div>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div
              className={`font-semibold text-sm`}
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditValue(card.value.title); // Sync editValue with current card title before editing
                setIsEditing(true);
              }}
            >
              {card.value.title.trim() === "" ? <span className="text-gray-400 dark:text-gray-500">New page</span> : card.value.title}
            </div>
          </div>
        </div>

        {/* Visible Properties */}
        {orderedVisibleProps.length > 0 ? (
          <div className="mt-1 space-y-1 text-black dark:text-gray-300">
            {orderedVisibleProps.map((propId) => {
              const propSchema = boardProperties[propId];
              // Safety check: ensure property exists
              if (!propSchema) {
                if (process.env.NODE_ENV === 'development') {
                  console.warn('[CalendarCard] Property schema not found for propId:', propId);
                }
                return null;
              }

              // Get property value - use propId directly from databaseProperties for more reliable lookup
              const value = card.value.databaseProperties?.[propId];

              // For properties with options (select, status, priority), match the value to the option
              let displayValue = value;
              if (propSchema.options && value !== undefined && value !== null && !Array.isArray(value)) {
                const option = propSchema.options.find(
                  (opt: any) => String(opt.id) === String(value)
                );
                displayValue = option ? option.name : String(value);
              } else if (value !== undefined && value !== null) {
                displayValue = value;
              }

              // Skip empty values (but not for rollup/formula which compute their own values)
              if (propSchema.type !== "rollup" && propSchema.type !== "formula" && (value === undefined || value === null || value === "")) {
                return null;
              }

              switch (propSchema.type) {
                case "date": {
                  const dateStr = String(displayValue || value || "");
                  let formattedDate = dateStr;

                  const parts = dateStr.split(",");

                  if (parts.length === 1 || !parts[1]) {
                    formattedDate = formatDate(parts[0]);
                  } else {
                    formattedDate = `${formatDate(parts[0])} → ${formatDate(parts[1])}`;
                  }

                  return (
                    <div key={propId} className="flex items-center gap-1 mt-1 py-1 text-[color:var(--c-texPri)]">
                      <p className="text-xs m-0">{formattedDate}</p>
                    </div>
                  );
                }

                case "priority": {
                  const defaultPriorityOpts = [
                    { id: "high", name: "High" },
                    { id: "medium", name: "Medium" },
                    { id: "low", name: "Low" },
                  ];
                  const effectivePriorityOpts = (propSchema as any).options?.length ? (propSchema as any).options : defaultPriorityOpts;
                  const priorityOpt = effectivePriorityOpts.find((o: any) => String(o.id) === String(value));
                  const priorityName = priorityOpt?.name || String(value || "");
                  const priorityColorStyles = getOptionColorStyles({ options: effectivePriorityOpts }, String(value || ""));
                  return (
                    <div key={propId} className="m-0 py-0.5">
                      <span
                        className="inline-flex px-2 py-1 items-center rounded-md text-xs font-medium"
                        style={{ backgroundColor: priorityColorStyles.bg, color: priorityColorStyles.text }}
                      >
                        {priorityName}
                      </span>
                    </div>
                  );
                }

                case "person": {
                  const membersArray = (Array.isArray(value) ? value : (Array.isArray(displayValue) ? displayValue : [])) as any[];
                  if (membersArray.length === 0) return null;
                  const colorList = ['#ffd966', '#b4a7d6', '#a2c4c9', '#93c47d', '#f6b26b', '#e06666', '#6fa8dc', '#8e7cc3', '#f9cb9c', '#6d9eeb'];

                  return (
                    <div key={propId} className="mt-1 flex flex-wrap gap-1">
                      {membersArray.slice(0, 2).map((member: any, idx: number) => {
                        const displayName = member.userName || member.userEmail || member.name || "Unknown";
                        const fallbackColor = idx % 10;
                        return (
                          <div
                            key={member.userId || idx}
                            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 bg-[var(--ca-butHovBac,#f3f2ef)] border dark:border-white/5"
                          >
                            <div className="flex items-center justify-center w-4 h-4 rounded-full overflow-hidden shrink-0">
                              {member.userAvatar || member.avatarUrl ? (
                                <img
                                  alt={displayName}
                                  src={member.userAvatar || member.avatarUrl}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white uppercase"
                                  style={{ background: colorList[fallbackColor] }}
                                >
                                  {displayName[0]}
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-medium text-[color:var(--c-texPri)] max-w-[80px] truncate">
                              {displayName}
                            </span>
                          </div>
                        );
                      })}
                      {membersArray.length > 2 && (
                        <span className="text-[11px] text-muted-foreground self-center">+{membersArray.length - 2}</span>
                      )}
                    </div>
                  );
                }

                case "relation": {
                  const relationLimit = propSchema?.relationLimit || "multiple";
                  const linkedDatabaseId = propSchema?.linkedDatabaseId;
                  const rawNoteIds = getRelationIdsFromValue(value, relationLimit);
                  const noteIds = getValidRelationIds(rawNoteIds, linkedDatabaseId ? String(linkedDatabaseId) : "");

                  if (noteIds.length === 0) {
                    return null;
                  }

                  return (
                    <div key={propId} className="flex items-center gap-1 mt-1 py-1 flex-wrap">
                      {noteIds.map((noteId: string) => {
                        if (!noteId) {
                          return null;
                        }
                        const relTitle = getRelationNoteTitle(noteId, linkedDatabaseId ? String(linkedDatabaseId) : "", "");
                        if (!relTitle) {
                          return null;
                        }
                        const note = getNotesByDataSourceId(linkedDatabaseId ? String(linkedDatabaseId) : "").find(
                          (n: Block) => String(n._id) === noteId,
                        );
                        const noteIcon = (note as Block)?.value.icon;
                        return (
                          <div
                            key={noteId}
                            className="inline-flex items-center gap-1.5 py-1 px-2 rounded hover:bg-[var(--ca-butHovBac,#f3f2ef)] text-xs font-medium transition-colors text-[color:var(--c-texPri)]"
                          >
                            {noteIcon ? (
                              <span className="text-xs opacity-70 shrink-0" style={{ fontSize: "12px" }}>
                                {noteIcon}
                              </span>
                            ) : (
                              <FileText className="w-3.5 h-3.5 opacity-70 shrink-0" />
                            )}
                            <span className="max-w-[120px] truncate text-xs">{relTitle}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                case "status":
                  return (
                    <div key={propId} className="m-0 py-0.5">
                      {(() => {
                        const colorStyles = getOptionColorStyles(propSchema, String(value || ""));
                        return (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis"
                            style={{ backgroundColor: colorStyles.bg, color: colorStyles.text }}
                          >
                            <div className="shrink-0 rounded-full h-2 w-2" style={{ backgroundColor: colorStyles.dot || colorStyles.text }}></div>
                            <span>{displayValue || value}</span>
                          </span>
                        );
                      })()}
                    </div>
                  );

                case "select":
                  return (
                    <div key={propId} className="m-0 py-0.5">
                      {(() => {
                        const colorStyles = getOptionColorStyles(propSchema, String(value || ""));
                        return (
                          <span
                            className="inline-flex px-2 py-1 items-center rounded-md text-xs font-medium"
                            style={{ backgroundColor: colorStyles.bg, color: colorStyles.text }}
                          >
                            {String(displayValue || value || "")}
                          </span>
                        );
                      })()}
                    </div>
                  );

                case "number": {
                  const numValue = typeof value === "number" ? value : Number(value) || 0;
                  const showAs = (propSchema as any)?.showAs || "number";
                  const progressColor = (propSchema as any)?.progressColor || "blue";
                  const progressDivideByRaw = (propSchema as any)?.progressDivideBy;
                  const showNumberText = (propSchema as any)?.showNumberText !== false; // default true
                  const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;

                  const formatted = formatNumericValue(numValue, {
                    numberFormat: (propSchema as any).numberFormat,
                    decimalPlaces: (propSchema as any).decimalPlaces,
                  });

                  const numberNode = showNumberText ? (
                    <p className="text-xs text-[color:var(--c-texPri)] m-0 font-medium">{formatted}</p>
                  ) : null;

                  if (showAs === "bar") {
                    const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));
                    const colorStyles = getColorStyles(progressColor);
                    return (
                      <div key={propId} className="mt-1 py-1 flex items-center gap-2">
                        {numberNode}
                        <div className="flex-1">
                          <div className="relative w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" style={{ height: "4px" }}>
                            <div
                              className="absolute rounded-full h-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: colorStyles.dot,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (showAs === "ring") {
                    const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));
                    const colorStyles = getColorStyles(progressColor);
                    const circumference = 2 * Math.PI * 6; // radius = 6
                    const offset = circumference - (percentage / 100) * circumference;
                    return (
                      <div key={propId} className="mt-1 py-1 flex items-center gap-2">
                        {numberNode}
                        <svg viewBox="0 0 14 14" width="16" height="16" className="flex-shrink-0">
                          <circle
                            cx="7"
                            cy="7"
                            r="6"
                            fill="none"
                            strokeWidth="2"
                            className="stroke-gray-200 dark:stroke-gray-700"
                          />
                          <g transform="rotate(-90 7 7)">
                            <circle
                              cx="7"
                              cy="7"
                              r="6"
                              fill="none"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeDasharray={circumference}
                              strokeDashoffset={offset}
                              style={{
                                stroke: colorStyles.dot,
                                transition: 'stroke-dashoffset 0.5s ease-out',
                              }}
                            />
                          </g>
                        </svg>
                      </div>
                    );
                  }

                  return (
                    <div key={propId} className="mt-1 py-1">
                      <p className="text-xs text-[color:var(--c-texPri)] m-0">{formatted}</p>
                    </div>
                  );
                }

                case "multi_select":
                  return (
                    <div key={propId} className="flex flex-wrap gap-1 m-0 py-0.5">
                      {(() => {
                        let values: string[] = [];
                        const valToUse = value !== undefined && value !== null ? value : displayValue;

                        if (Array.isArray(valToUse)) {
                          values = valToUse.map((v: string | { name?: string; id?: string }) =>
                            typeof v === "string" ? v : v.name || v.id || "",
                          );
                        } else if (typeof valToUse === "string") {
                          values = valToUse.split(",").map((v) => v.trim());
                        }
                        return values.slice(0, 2).map((item) => {
                          const opt = propSchema.options?.find((o: any) => String(o.id) === String(item));
                          const displayItem = opt?.name || item;
                          const colorStyles = getOptionColorStyles(propSchema, item);
                          return (
                            <span
                              key={item}
                              className="inline-flex px-1.5 py-0.5 items-center rounded-md text-xs font-medium"
                              style={{ backgroundColor: colorStyles.bg, color: colorStyles.text }}
                            >
                              {displayItem}
                            </span>
                          );
                        });
                      })()}
                    </div>
                  );

                case "formula": {
                  const formulaReturnType = propSchema?.formulaReturnType;
                  const formatOptions = {
                    numberFormat: (propSchema as any)?.numberFormat,
                    decimalPlaces: (propSchema as any)?.decimalPlaces,
                  };
                  const formatted = formatFormulaValue(value, formulaReturnType, formatOptions);
                  const showAs = (propSchema as any)?.showAs || "number";
                  const numValue = typeof value === "number" ? value : Number(value);
                  const isValidNumeric = Number.isFinite(numValue);

                  if (isValidNumeric && (showAs === "bar" || showAs === "ring")) {
                    const progressColor = (propSchema as any)?.progressColor || "blue";
                    const progressDivideByRaw = (propSchema as any)?.progressDivideBy;
                    const showNumberText = (propSchema as any)?.showNumberText !== false;
                    const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;
                    const colorStyles = getColorStyles(progressColor);
                    const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));

                    const numberNode = showNumberText ? (
                      <p className="text-xs text-[color:var(--c-texPri)] m-0 font-medium">{formatted}</p>
                    ) : null;

                    if (showAs === "bar") {
                      return (
                        <div key={propId} className="mt-1 py-1 flex items-center gap-2">
                          {numberNode}
                          <div className="flex-1">
                            <div className="relative w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" style={{ height: "4px" }}>
                              <div
                                className="absolute rounded-full h-full transition-all"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: colorStyles.dot,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (showAs === "ring") {
                      const circumference = 2 * Math.PI * 6;
                      const offset = circumference - (percentage / 100) * circumference;
                      return (
                        <div key={propId} className="mt-1 py-1 flex items-center gap-2">
                          {numberNode}
                          <svg viewBox="0 0 14 14" width="20" height="20" className="flex-shrink-0">
                            <circle cx="7" cy="7" r="6" fill="none" strokeWidth="2" className="stroke-gray-200 dark:stroke-gray-700" />
                            <g transform="rotate(-90 7 7)">
                              <circle
                                cx="7" cy="7" r="6" fill="none" strokeWidth="2" strokeLinecap="round"
                                strokeDasharray={circumference} strokeDashoffset={offset}
                                style={{ stroke: colorStyles.dot, transition: "stroke-dashoffset 0.5s ease-out" }}
                              />
                            </g>
                          </svg>
                        </div>
                      );
                    }
                  }

                  return (
                    <div key={propId} className="mt-1 py-1">
                      <p className="text-xs text-[color:var(--c-texPri)] m-0">{formatted}</p>
                    </div>
                  );
                }

                case "rollup": {
                  const rollupResult = computeRollupData(
                    card,
                    propSchema,
                    boardProperties,
                    getNotesByDataSourceId,
                    getDataSource,
                  );

                  if (rollupResult.state !== "ready") {
                    return (
                      <div key={propId} className="text-xs text-[color:var(--c-texPri)] py-1">
                        {rollupResult.message || "—"}
                      </div>
                    );
                  }

                  const { calculation, values, count, countFraction, percent, numericValue } = rollupResult;
                  const isMath = ["sum", "average", "min", "max", "median"].includes(calculation?.category || "");
                  const showAs = (propSchema as any)?.showAs || "number";
                  const numberFormat = (propSchema as any).numberFormat;
                  const decimalPlaces = (propSchema as any).decimalPlaces;

                  if ((calculation?.category === "count" || calculation?.category === "percent" || isMath) && (showAs === "bar" || showAs === "ring")) {
                    const progressColor = (propSchema as any)?.progressColor || "blue";
                    const progressDivideByRaw = (propSchema as any)?.progressDivideBy;
                    const showNumberText = (propSchema as any)?.showNumberText !== false;
                    const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;
                    const colorStyles = getColorStyles(progressColor);

                    let valToUse = numericValue ?? 0;
                    if (calculation?.category === "percent") valToUse = percent ?? 0;
                    if (calculation?.category === "count") valToUse = count ?? 0;

                    const percentage = Math.min(100, Math.max(0, (valToUse / divideBy) * 100));

                    const displayValue = calculation?.category === "percent" ? formatNumericValue(percent ?? 0, { numberFormat: "percent", decimalPlaces }) : (calculation?.category === "count" && calculation.value === "per_group" ? (countFraction || `${count}/${rollupResult.totalCount}`) : (calculation?.category === "count" ? formatNumericValue(valToUse) : formatNumericValue(valToUse, { numberFormat, decimalPlaces })));

                    const numberNode = showNumberText ? (
                      <p className="text-xs text-[color:var(--c-texPri)] m-0 font-medium">
                        {displayValue}
                      </p>
                    ) : null;

                    if (showAs === "bar") {
                      return (
                        <div key={propId} className="mt-1 py-1 flex items-center gap-2">
                          {numberNode}
                          <div className="flex-1">
                            <div className="relative w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" style={{ height: "4px" }}>
                              <div
                                className="absolute rounded-full h-full transition-all"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: colorStyles.dot,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (showAs === "ring") {
                      const circumference = 2 * Math.PI * 6;
                      const offset = circumference - (percentage / 100) * circumference;
                      return (
                        <div key={propId} className="mt-1 py-1 flex items-center gap-2">
                          {numberNode}
                          <svg viewBox="0 0 14 14" width="16" height="16" className="flex-shrink-0">
                            <circle cx="7" cy="7" r="6" fill="none" strokeWidth="2" className="stroke-gray-200 dark:stroke-gray-700" />
                            <g transform="rotate(-90 7 7)">
                              <circle
                                cx="7" cy="7" r="6" fill="none" strokeWidth="2" strokeLinecap="round"
                                strokeDasharray={circumference} strokeDashoffset={offset}
                                style={{ stroke: colorStyles.dot, transition: "stroke-dashoffset 0.5s ease-out" }}
                              />
                            </g>
                          </svg>
                        </div>
                      );
                    }
                  }

                  if (calculation?.category === "count") {
                    const valToFormat = calculation.value === "per_group" ? (countFraction || `${count ?? 0}/${rollupResult.totalCount ?? 0}`) : (count ?? 0);
                    const displayValue = typeof valToFormat === "number" ? formatNumericValue(valToFormat) : valToFormat;
                    return (
                      <div key={propId} className="text-xs text-[color:var(--c-texPri)] py-1 font-medium">
                        {displayValue}
                      </div>
                    );
                  }

                  if (calculation?.category === "percent") {
                    const displayValue = formatNumericValue(percent ?? 0, { numberFormat: "percent", decimalPlaces });
                    return (
                      <div key={propId} className="text-xs text-[color:var(--c-texPri)] py-1 font-medium">
                        {displayValue}
                      </div>
                    );
                  }

                  if (isMath && numericValue !== undefined) {
                    const displayValue = formatNumericValue(numericValue, { numberFormat, decimalPlaces });
                    return (
                      <div key={propId} className="text-xs text-[color:var(--c-texPri)] py-1 font-medium">
                        {displayValue}
                      </div>
                    );
                  }

                  if (values && values.length > 0) {
                    return (
                      <div key={propId} className="text-xs text-[color:var(--c-texPri)] py-1 truncate" title={values.join(', ')}>
                        {values.join(', ')}
                      </div>
                    );
                  }

                  return (
                    <div key={propId} className="text-xs text-[color:var(--c-texPri)] py-1">
                      No related values
                    </div>
                  );
                }

                case "email": {
                  const emailValue = String(value || "").trim();
                  if (!emailValue) return null;
                  return (
                    <div key={propId} className="flex items-center gap-1 mt-1 py-1 text-xs text-blue-600 dark:text-blue-400">
                      <Mail className="w-3 h-3 opacity-70" />
                      <a href={`mailto:${emailValue}`} className="hover:underline truncate" title={emailValue}>
                        {emailValue}
                      </a>
                    </div>
                  );
                }

                case "url": {
                  const rawUrl = String(value || "").trim();
                  if (!rawUrl) return null;
                  const sanitizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
                  const displayUrl = rawUrl.replace(/^https?:\/\//i, "");
                  return (
                    <div key={propId} className="flex items-center gap-1 mt-1 py-1 text-xs text-blue-600 dark:text-blue-400">
                      <LinkIcon className="w-3 h-3 opacity-70" />
                      <a href={sanitizedUrl} target="_blank" rel="noreferrer" className="hover:underline truncate" title={rawUrl}>
                        {displayUrl}
                      </a>
                    </div>
                  );
                }

                case "phone": {
                  const phoneValue = String(value || "").trim();
                  if (!phoneValue) return null;
                  return (
                    <div key={propId} className="flex items-center gap-1 mt-1 py-1 text-xs text-blue-600 dark:text-blue-400">
                      <Phone className="w-3 h-3 opacity-70" />
                      <a href={`tel:${phoneValue.replace(/\s+/g, "")}`} className="hover:underline" title={phoneValue}>
                        {phoneValue}
                      </a>
                    </div>
                  );
                }

                case "file": {
                  const attachments = Array.isArray(value) ? value : value ? [value] : [];
                  if (attachments.length === 0) return null;
                  return (
                    <div key={propId} className="flex items-center gap-1 mt-1 py-1 flex-wrap">
                      {attachments.slice(0, 2).map((file: any, idx: number) => {
                        const fileUrl = file.url || file;
                        const fileName = file.name || (typeof file === "string" ? file : "Attachment");
                        return (
                          <div key={file.id || fileUrl || idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-100 max-w-[100px] truncate">
                            <Paperclip className="h-3 w-3 opacity-70 shrink-0" />
                            <span className="truncate" title={fileName}>{fileName}</span>
                          </div>
                        );
                      })}
                      {attachments.length > 2 && (
                        <span className="text-[12px] font-semibold text-[color:var(--c-texTer,#9b9a97)]">
                          +{attachments.length - 2}
                        </span>
                      )}
                    </div>
                  );
                }

                case "id":
                case "text":
                  return (
                    <div key={propId} className="text-xs text-[color:var(--c-texPri)] py-1">
                      {String(value ?? "")}
                    </div>
                  );

                default:
                  return (
                    <div key={propId} className="text-xs text-[color:var(--c-texPri)] py-1">
                      {String(displayValue !== undefined ? displayValue : value || "")}
                    </div>
                  );
              }
            })}
          </div>
        ) : null}
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditValue(card.value.title); // Sync editValue with current card title before editing
              setIsEditing(true);
              setShowContextMenu(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Edit className="w-3.5 h-3.5" />
            Edit Title
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick(card);
              setShowContextMenu(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <MenuIcon className="h-4 w-4" />
            Edit Properties
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowContextMenu(false);
              onDelete();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2Icon className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
    </>
  );
}
