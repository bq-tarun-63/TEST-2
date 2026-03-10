"use client";

import EditIcon from "@/components/tailwind/ui/icons/editIcon";
import EllipsisIcon from "@/components/tailwind/ui/icons/ellipsisIcon";
import UserIcon from "@/components/tailwind/ui/icons/userIcon";
import { useNoteContext } from "@/contexts/NoteContext";
import { useBoard } from "@/contexts/boardContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import type { Note, ViewCollection } from "@/types/board";
import type { Members } from "@/types/workspace";
import { Calendar, FileText, Mail, Link as LinkIcon, Phone, Paperclip, Download } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState, useMemo } from "react";
import TaskDropdownMenu from "../taskDropdownMenu";
import { formatFormulaValue, isFormulaValueEmpty } from "@/utils/formatFormulaValue";
import { formatNumericValue } from "@/utils/formatNumericValue";
import { getColorStyles } from "@/utils/colorStyles";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import { computeRollupData } from "@/utils/rollupUtils";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import GalleryCardPreview from "../galleryView/galleryCardPreview";
import { formatDate } from "@/lib/utils";

interface BoardCardProps {
  card: Block;
  board: Block;
  onEdit: (newTitle: string) => void;
  onDelete: () => void;
  onOpenSidebar: (card: Block) => void;
  updateNoteTitleLocally?: (noteId: string, newTitle: string) => void;
  columnColors?: {
    dotColor: string;
    textColor: string;
    bgColor: string;
    badgeColor: string;
  };
  autoFocusTitle?: boolean;
  previewType?: "page_cover" | "page_content" | string | "none";
}

export default function BoardCard({
  card,
  board,
  onEdit,
  onDelete,
  onOpenSidebar,
  updateNoteTitleLocally,
  columnColors,
  autoFocusTitle = false,
  previewType = "none",
}: BoardCardProps) {
  const [isEditing, setIsEditing] = useState<boolean>(autoFocusTitle);
  const [editValue, setEditValue] = useState<string>(card.value.title);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const { getBlock } = useGlobalBlocks();

  const willShowPreview = useMemo(() => {
    if (previewType === "none") return false;
    if (previewType === "page_cover") {
      return !!(card.value.coverURL || card.value.coverUrl || card.value.databaseProperties?.coverImage);
    }
    if (previewType === "page_content") {
      const childBlocks = (!card.blockIds || card.blockIds.length === 0)
        ? []
        : card.blockIds.map((id) => getBlock(id)).filter(Boolean);
      return childBlocks.length > 0;
    }
    const fileValue = card.value.databaseProperties?.[previewType];
    if (fileValue) {
      const fileUrl = Array.isArray(fileValue) ? fileValue[0] : fileValue;
      if (typeof fileUrl === "string" && (fileUrl.startsWith("http") || fileUrl.startsWith("/"))) {
        return true;
      }
    }
    return false;
  }, [previewType, card, getBlock]);
  const { propertyOrder, getCurrentDataSourceProperties, getPropertyVisibility, getRelationNoteTitle, getValidRelationIds, getNotesByDataSourceId, getDataSource } = useBoard();

  // Get properties from current data source
  const boardProperties = getCurrentDataSourceProperties(board._id);

  // Get visible property IDs using the helper function which properly handles viewTypeId lookup
  // Memoize to prevent recalculation on every render
  const visiblePropertyIds = useMemo(() => getPropertyVisibility(board._id) || [], [getPropertyVisibility, board._id]);

  // Helper function to get color styles for an option
  const getOptionColorStyles = (
    propSchema: { options?: { id?: string; name: string; color?: string }[] },
    optionValue: string,
  ) => {
    const option = propSchema.options?.find((opt) => String(opt.id) === String(optionValue));
    const color = option?.color || "default";
    return getColorStyles(color);
  };

  // Sync value when not editing
  useEffect(() => {
    if (!isEditing) {
      setEditValue(card.value.title || "");
    }
  }, [card.value.title, isEditing]);

  // Initial focus and selection when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  // Handle auto-expanding height
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editValue, isEditing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !triggerButtonRef.current?.contains(event.target as Node)
      ) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { workspaceMembers } = useWorkspaceContext();
  const { sharedWith, iscurrentNotPublic } = useNoteContext();

  let mentionMembers: Members[] = [];
  mentionMembers = workspaceMembers;

  // if (!iscurrentNotPublic) {
  //   mentionMembers = sharedWith.map((u, index) => {
  //     const matchedMember = workspaceMembers.find((wm) => wm.userEmail === u.email);

  //     return {
  //       userId: matchedMember ? matchedMember.userId : `shared-${index}`,
  //       userEmail: u.email,
  //       role: u.access,
  //       joinedAt: matchedMember ? matchedMember.joinedAt : "",
  //       userName: matchedMember ? matchedMember.userName : u.email,
  //     };
  //   });
  // } else {
  //   mentionMembers = workspaceMembers;
  // }

  const handleEditSubmit = () => {
    onEdit(editValue.trim());
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(card.value.title);
      if (updateNoteTitleLocally) {
        updateNoteTitleLocally(card._id, card.value.title); // restore sidebar
      }
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // check if blur target is inside the member button
    if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest("#member-btn")) {
      return; // do not close edit mode
    }
    handleEditSubmit();
  };

  const visibleProps = useMemo(() => {
    if (!boardProperties || Object.keys(boardProperties).length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[BoardCard] No boardProperties available');
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
      console.log('[BoardCard] Showing only visible properties:', filtered);
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

  return (
    <div className="">
      {/* Card container - always the same */}
      <div
        className="p-2 transition-all bg-background dark:bg-black rounded-lg shadow group relative dark:border-b-[rgb(42,42,42)]"
        style={{
          border: columnColors ? `1px solid ${columnColors.dotColor}05` : undefined,
          overflow: "hidden"
        }}
      >
        {willShowPreview && (
          <div className="w-[calc(100%+16px)] -mx-2 -mt-2 cursor-default mb-2">
            <GalleryCardPreview
              note={card}
              previewType={previewType}
              fitImage={false}
              heightClass="h-[140px]"
            />
          </div>
        )}
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
            {isEditing ? (
              // Edit mode - auto-expanding textarea
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(e) => {
                  const newValue = e.target.value;

                  // 60-word limit logic
                  const words = newValue.trim().split(/\s+/).filter(w => w.length > 0);
                  if (words.length > 60) {
                    // If it's a "backspace/delete" (length decreased), allow it
                    if (newValue.length < editValue.length) {
                      setEditValue(newValue);
                      if (updateNoteTitleLocally) {
                        updateNoteTitleLocally(card._id, newValue);
                      }
                    }
                    return;
                  }

                  setEditValue(newValue);
                  if (updateNoteTitleLocally) {
                    updateNoteTitleLocally(card._id, newValue); // live update sidebar while typing
                  }
                }}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="w-full p-0 text-sm font-medium break-words outline-none bg-transparent resize-none overflow-hidden whitespace-pre-wrap"
                placeholder="New page"
                style={{ minHeight: "1.5rem" }}
                rows={1}
              />
            ) : (
              // Normal mode - display text
              <div className="text-sm font-medium pr-2 break-words whitespace-pre-wrap"
                style={{ maxWidth: "100%", minHeight: "1.5rem" }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
              >
                {card.value.title.trim() === "" ? <span className="text-gray-400 dark:text-gray-500">New page</span> : card.value.title}
              </div>
            )}
          </div>
        </div>
        {/* Dynamically render all visible properties for this viewTypeId */}
        {orderedVisibleProps.length > 0 ? (
          orderedVisibleProps.map((propId) => {
            const propSchema = boardProperties[propId];
            // Safety check: ensure property exists (should already be filtered in visibleProps)
            if (!propSchema) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[BoardCard] Property schema not found for propId:', propId);
              }
              return null;
            }

            // Get property value - use propId directly from databaseProperties for more reliable lookup
            const value = card.value.databaseProperties?.[propId];
            const isFormulaProp = propSchema.type === "formula";
            const isRollupProp = propSchema.type === "rollup";

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

            // Skip empty values (except formula and rollup which compute their own values)
            if (!isFormulaProp && !isRollupProp && (value === undefined || value === null || value === "")) {
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
                  <div key={propId} className="mt-1">
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
                const membersArray = Array.isArray(value) ? value : (Array.isArray(displayValue) ? displayValue : []);
                if (membersArray.length === 0) return null;
                const colorList = ['#ffd966', '#b4a7d6', '#a2c4c9', '#93c47d', '#f6b26b', '#e06666', '#6fa8dc', '#8e7cc3', '#f9cb9c', '#6d9eeb'];

                return (
                  <div key={propId} className="mt-2 flex flex-wrap gap-1">
                    {membersArray.map((member: any, idx: number) => {
                      const displayName = member.userName || member.userEmail || member.name || "Unknown";
                      const fallbackColor = idx % 10;
                      return (
                        <div
                          key={member.userId || idx}
                          className="flex items-center gap-1.5 rounded-full px-2 py-0.5 h-[22px] bg-[var(--ca-butHovBac,#f3f2ef)] border dark:border-white/5"
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
                          <span className="text-xs font-medium text-[color:var(--c-texPri)] max-w-[100px] truncate">
                            {displayName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              case "relation": {
                const relationLimit = propSchema.relationLimit || "multiple";
                const linkedDatabaseId = propSchema.linkedDatabaseId;
                const rawNoteIds = getRelationIdsFromValue(value, relationLimit);
                const noteIds = getValidRelationIds(rawNoteIds, linkedDatabaseId || "");

                if (noteIds.length === 0) {
                  return null;
                }

                return (
                  <div key={propId} className="mt-1 flex flex-wrap gap-1">
                    {noteIds.map((noteId: string) => {
                      if (!noteId) {
                        return null;
                      }
                      const relTitle = getRelationNoteTitle(noteId, linkedDatabaseId || "", "");
                      if (!relTitle) {
                        return null;
                      }

                      const note = getNotesByDataSourceId(linkedDatabaseId || "").find(
                        (n: Block) => String(n._id) === noteId,
                      );
                      const noteIcon = (note as Block)?.value.icon;

                      return (
                        <div
                          key={noteId}
                          className="inline-flex items-center gap-1.5 py-1 px-2 rounded hover:bg-[var(--ca-butHovBac,#f3f2ef)] text-xs font-medium transition-colors text-[color:var(--c-texPri)]"
                        >
                          {noteIcon ? (
                            <span className="text-xs opacity-70 shrink-0" style={{ fontSize: "12px" }}>{noteIcon}</span>
                          ) : (
                            <FileText className="w-3.5 h-3.5 opacity-70" />
                          )}
                          <span className="max-w-[120px] text-xs truncate">{relTitle}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              case "status":
                return (
                  <div key={propId} className="mt-1">
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
                  <div key={propId} className="mt-1">
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

              case "formula": {
                const formatOptions = {
                  numberFormat: (propSchema as any)?.numberFormat,
                  decimalPlaces: (propSchema as any)?.decimalPlaces,
                };
                const formattedValue = formatFormulaValue(value, propSchema.formulaReturnType, formatOptions);
                const errorMessage = card.value.formulaErrors?.[propId];
                const showAs = (propSchema as any).showAs || "number";
                const numValue = typeof value === "number" ? value : Number(value);
                const isValidNumeric = Number.isFinite(numValue);

                if (!errorMessage && isValidNumeric && (showAs === "bar" || showAs === "ring")) {
                  const progressColor = (propSchema as any).progressColor || "blue";
                  const progressDivideByRaw = (propSchema as any).progressDivideBy;
                  const showNumberText = (propSchema as any).showNumberText !== false;
                  const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;
                  const colorStyles = getColorStyles(progressColor);
                  const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));

                  const numberNode = showNumberText ? (
                    <div className="text-xs text-[color:var(--c-texPri)] font-medium">{formattedValue}</div>
                  ) : null;

                  if (showAs === "bar") {
                    return (
                      <div key={propId} className="mt-1 flex items-center gap-2 py-1">
                        {numberNode}
                        <div className="flex-1">
                          <div className="relative w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" style={{ height: "4px" }}>
                            <div
                              className="absolute rounded-full h-full transition-all"
                              style={{ width: `${percentage}%`, backgroundColor: getColorStyles(progressColor).dot }}
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
                      <div key={propId} className="mt-1 flex items-center gap-2 py-1">
                        {numberNode}
                        <svg viewBox="0 0 14 14" width="20" height="20" className="flex-shrink-0">
                          <circle cx="7" cy="7" r="6" fill="none" strokeWidth="2" className="stroke-gray-200 dark:stroke-gray-700" />
                          <g transform="rotate(-90 7 7)">
                            <circle
                              cx="7" cy="7" r="6" fill="none" strokeWidth="2" strokeLinecap="round"
                              strokeDasharray={circumference} strokeDashoffset={offset}
                              style={{ stroke: getColorStyles(progressColor).dot, transition: "stroke-dashoffset 0.5s ease-out" }}
                            />
                          </g>
                        </svg>
                      </div>
                    );
                  }
                }

                return (
                  <div key={propId} className="mt-1 py-1 text-xs text-[color:var(--c-texPri)]" title={typeof formattedValue === "string" ? formattedValue : undefined}>
                    {formattedValue || ""}
                    {errorMessage && (
                      <div className="text-xs text-red-500 mt-1" title={errorMessage}>
                        {errorMessage}
                      </div>
                    )}
                  </div>
                );
              }

              case "multi_select":
                return (
                  <div key={propId} className="mt-2">
                    {(() => {
                      let values: string[] = [];
                      const valToUse = value !== undefined && value !== null ? value : displayValue;

                      if (Array.isArray(valToUse)) {
                        // If already an array
                        values = valToUse.map((v: string | { name?: string; id?: string }) =>
                          typeof v === "string" ? v : v.name || v.id || "",
                        );
                      } else if (typeof valToUse === "string") {
                        // Split comma-separated string
                        values = valToUse.split(",").map((v) => v.trim());
                      }

                      return values.map((item) => {
                        const opt = propSchema.options?.find((o: any) => String(o.id) === String(item));
                        const displayItem = opt?.name || item;
                        const colorStyles = getOptionColorStyles(propSchema, item);
                        return (
                          <span
                            key={item}
                            className="inline-flex px-1.5 py-0.5 items-center rounded-md text-xs font-medium mr-1 mb-1"
                            style={{ backgroundColor: colorStyles.bg, color: colorStyles.text }}
                          >
                            {displayItem}
                          </span>
                        );
                      });
                    })()}
                  </div>
                );


              case "number": {
                const numValue = typeof value === "number" ? value : Number(value) || 0;
                const showAs = (propSchema as any).showAs || "number";
                const progressColor = (propSchema as any).progressColor || "blue";
                const progressDivideByRaw = (propSchema as any).progressDivideBy;
                const showNumberText = (propSchema as any).showNumberText !== false; // default true
                const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;

                const formatted = formatNumericValue(numValue, {
                  numberFormat: (propSchema as any).numberFormat,
                  decimalPlaces: (propSchema as any).decimalPlaces,
                });

                const numberNode = showNumberText ? (
                  <div className="text-xs text-gray-600 dark:text-gray-300 font-medium">{formatted}</div>
                ) : null;

                if (showAs === "bar") {
                  const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));
                  return (
                    <div key={propId} className="mt-1 flex items-center gap-2 py-1">
                      {numberNode}
                      <div className="flex-1">
                        <div className="relative w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" style={{ height: "4px" }}>
                          <div
                            className="absolute rounded-full h-full transition-all"
                            style={{ width: `${percentage}%`, backgroundColor: getColorStyles(progressColor).dot }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                }

                if (showAs === "ring") {
                  const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));
                  const circumference = 2 * Math.PI * 6;
                  const offset = circumference - (percentage / 100) * circumference;
                  return (
                    <div key={propId} className="mt-1 flex items-center gap-2 py-1">
                      {numberNode}
                      <svg viewBox="0 0 14 14" width="20" height="20" className="flex-shrink-0">
                        <circle cx="7" cy="7" r="6" fill="none" strokeWidth="2" className="stroke-gray-200 dark:stroke-gray-700" />
                        <g transform="rotate(-90 7 7)">
                          <circle
                            cx="7" cy="7" r="6" fill="none" strokeWidth="2" strokeLinecap="round"
                            strokeDasharray={circumference} strokeDashoffset={offset}
                            style={{ stroke: getColorStyles(progressColor).dot, transition: "stroke-dashoffset 0.5s ease-out" }}
                          />
                        </g>
                      </svg>
                    </div>
                  );
                }

                // Default: show as number
                return (
                  <div key={propId} className="mt-1 py-1 text-xs text-gray-600 dark:text-gray-300">
                    {formatted}
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
                    <div key={propId} className="mt-1 py-1 text-xs text-[color:var(--c-texPri)]">
                      {rollupResult.message || "—"}
                    </div>
                  );
                }

                const { calculation, values, count, countFraction, percent, numericValue } = rollupResult;
                const isMath = ["sum", "average", "min", "max", "median"].includes(calculation?.category || "");
                const showAs = (propSchema as any).showAs || "number";
                const numberFormat = (propSchema as any).numberFormat;
                const decimalPlaces = (propSchema as any).decimalPlaces;

                if ((calculation?.category === "count" || calculation?.category === "percent" || isMath) && (showAs === "bar" || showAs === "ring")) {
                  const progressColor = (propSchema as any).progressColor || "blue";
                  const progressDivideByRaw = (propSchema as any).progressDivideBy;
                  const showNumberText = (propSchema as any).showNumberText !== false;
                  const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;
                  const colorStyles = getColorStyles(progressColor);

                  let valToUse = numericValue ?? 0;
                  if (calculation?.category === "percent") valToUse = percent ?? 0;
                  if (calculation?.category === "count") valToUse = count ?? 0;

                  const percentage = Math.min(100, Math.max(0, (valToUse / divideBy) * 100));

                  const displayValue = calculation?.category === "percent" ? formatNumericValue(percent ?? 0, { numberFormat: "percent", decimalPlaces }) : (calculation?.category === "count" && calculation.value === "per_group" ? (countFraction || `${count}/${rollupResult.totalCount}`) : (calculation?.category === "count" ? formatNumericValue(valToUse) : formatNumericValue(valToUse, { numberFormat, decimalPlaces })));

                  const numberNode = showNumberText ? (
                    <div className="text-xs text-gray-600 dark:text-gray-300 font-medium mr-1.5">{displayValue}</div>
                  ) : null;

                  if (showAs === "bar") {
                    return (
                      <div key={propId} className="mt-1 flex items-center gap-2 py-1">
                        {numberNode}
                        <div className="flex-1">
                          <div className="relative w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" style={{ height: "4px" }}>
                            <div
                              className="absolute rounded-full h-full transition-all"
                              style={{ width: `${percentage}%`, backgroundColor: colorStyles.dot }}
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
                      <div key={propId} className="mt-1 flex items-center gap-2 py-1">
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

                if (calculation?.category === "count") {
                  const valToFormat = calculation.value === "per_group" ? (countFraction || `${count ?? 0}/${rollupResult.totalCount ?? 0}`) : (count ?? 0);
                  const displayValue = typeof valToFormat === "number" ? formatNumericValue(valToFormat) : valToFormat;
                  return (
                    <div key={propId} className="mt-1 py-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {displayValue}
                    </div>
                  );
                }

                if (calculation?.category === "percent") {
                  const displayValue = formatNumericValue(percent ?? 0, { numberFormat: "percent", decimalPlaces });
                  return (
                    <div key={propId} className="mt-1 py-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {displayValue}
                    </div>
                  );
                }

                if (isMath && numericValue !== undefined) {
                  const displayValue = formatNumericValue(numericValue, { numberFormat, decimalPlaces });
                  return (
                    <div key={propId} className="mt-1 py-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {displayValue}
                    </div>
                  );
                }

                if (values && values.length > 0) {
                  return (
                    <div key={propId} className="mt-1 py-1 text-xs text-gray-600 dark:text-gray-300 truncate" title={values.join(', ')}>
                      {values.join(', ')}
                    </div>
                  );
                }

                return (
                  <div key={propId} className="mt-1 py-1 text-xs text-[color:var(--c-texPri)]">
                    No related values
                  </div>
                );
              }

              case "email": {
                const emailValue = String(value || "").trim();
                if (!emailValue) return null;
                return (
                  <div key={propId} className="mt-1 py-1 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <Mail className="w-3 h-3" />
                    <a href={`mailto:${emailValue}`} className="truncate hover:underline" title={emailValue}>
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
                  <div key={propId} className="mt-1 py-1 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <LinkIcon className="w-3 h-3" />
                    <a
                      href={sanitizedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:underline"
                      title={rawUrl}
                    >
                      {displayUrl}
                    </a>
                  </div>
                );
              }

              case "phone": {
                const phoneValue = String(value || "").trim();
                if (!phoneValue) return null;
                return (
                  <div key={propId} className="mt-1 py-1 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <Phone className="w-3 h-3" />
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
                  <div key={propId} className="mt-1 py-1 flex flex-wrap gap-1">
                    {attachments.slice(0, 2).map((file: any, idx: number) => {
                      const fileUrl = file.url || file;
                      const fileName = file.name || (typeof file === "string" ? file : "Attachment");
                      return (
                        <div key={file.id || fileUrl || idx} className="flex items-center gap-1">
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Paperclip className="h-3 w-3" />
                            <span className="max-w-[100px] truncate">{fileName}</span>
                          </a>
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
                  <div key={propId} className="mt-1 py-1 text-xs text-[color:var(--c-texPri)]">
                    {String(displayValue || value || "")}
                  </div>
                );


              default:
                // Fallback plain text for other property types
                return (
                  <div key={propId} className="mt-1 py-1 text-xs text-[color:var(--c-texPri)]">
                    {String(displayValue !== undefined ? displayValue : value || "")}
                  </div>
                );
            }
          })
        ) : null}
        {/* Edit/Options buttons - only show when not editing */}
        {!isEditing && (
          <div className="absolute bg-background border rounded-sm dark:bg-background right-2 top-2 flex opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button className="border-r p-1"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              <EditIcon className="w-4 h-4 text-gray-600" />
            </button>
            <button className="p-1"
              ref={triggerButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                setShowOptions(!showOptions);
              }}
            >
              <EllipsisIcon className="w-4 h-4 text-gray-600" />
            </button>
            {/* Dropdown */}
            {showOptions && (
              <div ref={dropdownRef}>
                <TaskDropdownMenu
                  onEditProperties={() => {
                    onOpenSidebar(card);
                  }}
                  onDelete={onDelete}
                  onClose={() => setShowOptions(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
