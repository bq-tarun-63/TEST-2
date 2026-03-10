"use client";

import { useBoard } from "@/contexts/boardContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { formatFormulaValue, isFormulaValueEmpty } from "@/utils/formatFormulaValue";
import { formatNumericValue } from "@/utils/formatNumericValue";
import { getColorStyles } from "@/utils/colorStyles";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import { computeRollupData } from "@/utils/rollupUtils";
import type { Block } from "@/types/block";
import type { PropertySchema } from "@/models/types/DatabaseSource";
import { Calendar, FileText, Mail, Link as LinkIcon, Phone, Paperclip } from "lucide-react";
import { useMemo } from "react";
import { formatDate } from "@/lib/utils";

interface GalleryCardPropertiesProps {
  note: Block;
  board: Block;
  boardProperties: Record<string, PropertySchema>;
  visiblePropertyIds: string[];
  propertyOrder: string[];
}

export default function GalleryCardProperties({
  note,
  board,
  boardProperties,
  visiblePropertyIds,
  propertyOrder,
}: GalleryCardPropertiesProps) {
  const { getRelationNoteTitle, getValidRelationIds, getNotesByDataSourceId, getDataSource } = useBoard();
  const { workspaceMembers } = useWorkspaceContext();

  // Helper function to get color styles for an option
  const getOptionColorStyles = (
    propSchema: { options?: { id?: string; name: string; color?: string }[] },
    optionValue: string,
  ) => {
    const option = propSchema.options?.find((opt) => String(opt.id) === String(optionValue));
    const color = option?.color || "default";
    return getColorStyles(color);
  };

  const effectiveOrder = propertyOrder.length > 0
    ? propertyOrder
    : Object.keys(boardProperties || {}).filter((id) => id !== "title");

  const orderedVisibleProps = useMemo(() => [
    ...effectiveOrder.filter((propId) => visiblePropertyIds.includes(propId)),
    ...visiblePropertyIds.filter((propId) => !effectiveOrder.includes(propId)),
  ], [effectiveOrder, visiblePropertyIds]);

  if (orderedVisibleProps.length === 0) {
    return null;
  }

  return (
    <div className="pt-0 line-height-normal flex flex-col mx-0 pb-2">
      {orderedVisibleProps.map((propId) => {
        const propSchema = boardProperties[propId];
        if (!propSchema) return null;

        const value = note.value.databaseProperties?.[propId];
        const isFormulaProp = propSchema.type === "formula";
        const isRollupProp = propSchema.type === "rollup";

        // Skip empty values (except formula and rollup which compute their own values)
        if (!isFormulaProp && !isRollupProp && (value === undefined || value === null || value === "")) {
          return null;
        }

        // For properties with options (select, status, priority), match the value to the option
        let displayValue: string | number | boolean = value;
        if (propSchema.options && value !== undefined && value !== null && !Array.isArray(value)) {
          const option = propSchema.options.find(
            (opt: any) => String(opt.id) === String(value)
          );
          displayValue = option ? option.name : String(value);
        } else if (value !== undefined && value !== null) {
          displayValue = value;
        }

        const finalDisplayValue = displayValue;

        switch (propSchema.type) {
          case "date": {
            const dateStr = String(finalDisplayValue || value || "");
            let formattedDate = dateStr;
            const parts = dateStr.split(",");

            if (parts.length === 1 || !parts[1]) {
              formattedDate = formatDate(parts[0]);
            } else {
              formattedDate = `${formatDate(parts[0])} → ${formatDate(parts[1])}`;
            }


            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                {formattedDate}
              </div>
            );
          }

          case "status":
            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                {(() => {
                  const colorStyles = getOptionColorStyles(propSchema, String(value || ""));
                  return (
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis"
                      style={{ backgroundColor: colorStyles.bg, color: colorStyles.text }}
                    >
                      <div className="shrink-0 rounded-full h-2 w-2" style={{ backgroundColor: colorStyles.dot || colorStyles.text }}></div>
                      <span>{finalDisplayValue || value}</span>
                    </span>
                  );
                })()}
              </div>
            );

          case "select":
            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                {(() => {
                  const colorStyles = getOptionColorStyles(propSchema, String(value || ""));
                  return (
                    <span
                      className="inline-flex px-2 py-1 items-center rounded-md text-xs font-medium"
                      style={{ backgroundColor: colorStyles.bg, color: colorStyles.text }}
                    >
                      {String(finalDisplayValue || value || "")}
                    </span>
                  );
                })()}
              </div>
            );

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
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                <span
                  className="inline-flex px-2 py-1 items-center rounded-md text-xs font-medium"
                  style={{ backgroundColor: priorityColorStyles.bg, color: priorityColorStyles.text }}
                >
                  {priorityName}
                </span>
              </div>
            );
          }

          case "multi_select": {
            const rawMulti = value;
            let multiValues: string[] = [];
            if (Array.isArray(rawMulti)) {
              multiValues = rawMulti.map((v: any) => typeof v === "string" ? v : v?.id || "");
            } else if (typeof rawMulti === "string" && rawMulti) {
              multiValues = rawMulti.split(",").map((v: string) => v.trim());
            }
            if (multiValues.length === 0) return null;
            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] flex flex-wrap gap-1 items-center rounded-md">
                {multiValues.slice(0, 2).map((item) => {
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
                })}
                {multiValues.length > 2 && (
                  <span className="text-xs text-muted-foreground">+{multiValues.length - 2}</span>
                )}
              </div>
            );
          }

          case "person": {
            const rawMembers = Array.isArray(value) ? value : (value ? [value] : []);
            if (rawMembers.length === 0) return null;

            return (
              <div key={propId} className="mt-0.5 mb-0.5 mx-1.5 pt-1 pb-1 px-1.5 min-h-[28px] flex items-center rounded-md">
                <div className="flex flex-wrap gap-1.5 items-center">
                  {rawMembers.slice(0, 3).map((memberData: any, idx: number) => {
                    // Handle both ID strings and member objects
                    let member: any = null;
                    if (typeof memberData === "string") {
                      member = workspaceMembers.find(
                        (m) => m.userId === memberData || m.userEmail === memberData
                      );
                    } else if (memberData && typeof memberData === "object") {
                      member = memberData.userId || memberData.userEmail ?
                        workspaceMembers.find(m => m.userId === memberData.userId || m.userEmail === memberData.userEmail) || memberData :
                        memberData;
                    }

                    if (!member) return null;
                    const displayName = member.userName || member.userEmail || member.name || "Unknown";
                    const fallbackColor = idx % 10;
                    const colorList = ['#ffd966', '#b4a7d6', '#a2c4c9', '#93c47d', '#f6b26b', '#e06666', '#6fa8dc', '#8e7cc3', '#f9cb9c', '#6d9eeb'];

                    return (
                      <div
                        key={idx}
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
                              className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ background: colorList[fallbackColor] }}
                            >
                              {displayName[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-medium text-[color:var(--c-texPri)] max-w-[100px] truncate">
                          {displayName}
                        </span>
                      </div>
                    );
                  })}
                  {rawMembers.length > 3 && (
                    <span className="text-[11px] text-muted-foreground">+{rawMembers.length - 3}</span>
                  )}
                </div>
              </div>
            );
          }

          case "formula": {
            const formatOptions = {
              numberFormat: (propSchema as any)?.numberFormat,
              decimalPlaces: (propSchema as any)?.decimalPlaces,
            };
            const formulaValue = formatFormulaValue(value, propSchema.formulaReturnType, formatOptions);
            if (isFormulaValueEmpty(formulaValue)) return null;

            const showAs = (propSchema as any).showAs || "number";
            const numValue = typeof value === "number" ? value : Number(value);
            const isValidNumeric = Number.isFinite(numValue);

            if (isValidNumeric && (showAs === "bar" || showAs === "ring")) {
              const progressColor = (propSchema as any).progressColor || "blue";
              const progressDivideByRaw = (propSchema as any).progressDivideBy;
              const showNumberText = (propSchema as any).showNumberText !== false;
              const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;
              const colorStyles = getColorStyles(progressColor);
              const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));

              const numberNode = showNumberText ? (
                <span className="text-xs text-[color:var(--c-texPri)] mr-2">{formulaValue}</span>
              ) : null;

              if (showAs === "bar") {
                return (
                  <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] flex items-center rounded-md">
                    {numberNode}
                    <div className="flex-1 min-w-[60px]">
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
                  <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] flex items-center rounded-md">
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
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs text-[color:var(--c-texPri)]">
                {formulaValue}
              </div>
            );
          }

          case "rollup": {
            const rollupResult = computeRollupData(
              note,
              propSchema as any,
              boardProperties as any,
              getNotesByDataSourceId,
              getDataSource,
            );
            if (rollupResult.state !== "ready") return null;
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

              const displayValueFormatted = calculation?.category === "percent" ? formatNumericValue(percent ?? 0, { numberFormat: "percent", decimalPlaces }) : (calculation?.category === "count" && calculation.value === "per_group" ? (countFraction || `${count}/${rollupResult.totalCount}`) : (calculation?.category === "count" ? formatNumericValue(valToUse) : formatNumericValue(valToUse, { numberFormat, decimalPlaces })));

              const numberNode = showNumberText ? (
                <span className="text-xs text-[color:var(--c-texPri)] mr-2">
                  {displayValueFormatted}
                </span>
              ) : null;

              if (showAs === "bar") {
                return (
                  <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] flex items-center rounded-md">
                    {numberNode}
                    <div className="flex-1 min-w-[60px]">
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
                  <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] flex items-center rounded-md">
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

            let displayValue: string | number = "";
            if (calculation?.category === "count") {
              if (calculation.value === "per_group") {
                displayValue = countFraction || `${count ?? 0}/${rollupResult.totalCount ?? 0}`;
              } else {
                displayValue = formatNumericValue(count ?? 0);
              }
            } else if (calculation?.category === "percent") {
              displayValue = formatNumericValue(percent ?? 0, { numberFormat: "percent", decimalPlaces });
            } else if (isMath) {
              displayValue = formatNumericValue(numericValue ?? 0, { numberFormat, decimalPlaces });
            } else if (values && values.length > 0) {
              displayValue = values.join(", ");
            } else {
              return null;
            }

            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs text-[color:var(--c-texPri)]">
                {String(displayValue)}
              </div>
            );
          }

          case "checkbox":
            return value ? (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                <span className="text-green-600 dark:text-green-400">✓</span>
              </div>
            ) : null;

          case "number": {
            const numValue = typeof value === "number" ? value : Number(value) || 0;
            const showAs = (propSchema as any).showAs || "number";
            const progressColor = (propSchema as any).progressColor || "blue";
            const progressDivideByRaw = (propSchema as any).progressDivideBy;
            const showNumberText = (propSchema as any).showNumberText !== false;
            const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;

            const formatted = formatNumericValue(numValue, {
              numberFormat: (propSchema as any).numberFormat,
              decimalPlaces: (propSchema as any).decimalPlaces,
            });

            if (showAs === "bar" || showAs === "ring") {
              const colorStyles = getColorStyles(progressColor);
              const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));

              const numberNode = showNumberText ? (
                <span className="text-xs text-[color:var(--c-texPri)] mr-2">{formatted}</span>
              ) : null;

              if (showAs === "bar") {
                return (
                  <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] flex items-center rounded-md">
                    {numberNode}
                    <div className="flex-1 min-w-[60px]">
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
                  <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] flex items-center rounded-md">
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
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs text-[color:var(--c-texPri)]">
                {formatted}
              </div>
            );
          }

          case "id":
          case "text":
            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs text-[color:var(--c-texPri)]">
                {String(value || "")}
              </div>
            );

          case "email": {
            const emailValue = String(value || "").trim();
            if (!emailValue) return null;
            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                <Mail className="w-3 h-3 mr-1 opacity-70" />
                <a href={`mailto:${emailValue}`} className="text-blue-600 dark:text-blue-400 hover:underline truncate" title={emailValue}>
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
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                <LinkIcon className="w-3 h-3 mr-1 opacity-70" />
                <a href={sanitizedUrl} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate" title={rawUrl}>
                  {displayUrl}
                </a>
              </div>
            );
          }

          case "phone": {
            const phoneValue = String(value || "").trim();
            if (!phoneValue) return null;
            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                <Phone className="w-3 h-3 mr-1 opacity-70" />
                <a href={`tel:${phoneValue.replace(/\s+/g, "")}`} className="text-blue-600 dark:text-blue-400 hover:underline" title={phoneValue}>
                  {phoneValue}
                </a>
              </div>
            );
          }

          case "file": {
            const attachments = Array.isArray(value) ? value : value ? [value] : [];
            if (attachments.length === 0) return null;
            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] flex flex-wrap gap-1 items-center rounded-md">
                {attachments.slice(0, 2).map((file: any, idx: number) => {
                  const fileUrl = file.url || file;
                  const fileName = file.name || (typeof file === "string" ? file : "Attachment");
                  return (
                    <div key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-100 max-w-[240px] truncate">
                      <Paperclip className="h-3 w-3 opacity-70 shrink-0" />
                      <span className="truncate" title={fileName}>{fileName}</span>
                    </div>
                  );
                })}
                {attachments.length > 2 && (
                  <span className="text-[12px] font-semibold text-[color:var(--c-texTer,#9b9a97)]">+{attachments.length - 2}</span>
                )}
              </div>
            );
          }

          case "relation":
            if (!value) return null;
            const rawRelationIds = getRelationIdsFromValue(value);
            const relationIds = getValidRelationIds(rawRelationIds, propSchema.linkedDatabaseId ? String(propSchema.linkedDatabaseId) : "");
            if (relationIds.length === 0) return null;
            return (
              <div key={propId} className="mt-0 mb-0 mx-1.5 pt-1.5 pb-1.5 px-1.5 min-h-[28px] whitespace-nowrap min-w-fit w-fit relative flex overflow-hidden items-center rounded-md text-xs">
                <div className="flex min-w-0 flex-shrink-0 flex-wrap-nowrap gap-x-1.5 gap-y-0 items-center">
                  {relationIds.slice(0, 2).map((relId: string, idx: number) => {
                    const relTitle = getRelationNoteTitle(relId, propSchema.linkedDatabaseId ? String(propSchema.linkedDatabaseId) : "");
                    if (!relTitle) return null;

                    const relNote = getNotesByDataSourceId(propSchema.linkedDatabaseId ? String(propSchema.linkedDatabaseId) : "").find(
                      (n: Block) => String(n._id) === relId,
                    );
                    const noteIcon = (relNote as Block)?.value.icon;

                    return (
                      <div
                        key={idx}
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
                  {relationIds.length > 2 && (
                    <span className="text-[12px] font-semibold rounded-[8px] px-[7px] h-[20px] flex items-center text-[color:var(--c-texTer,#9b9a97)] bg-[#eee]">+{relationIds.length - 2}</span>
                  )}
                </div>
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}


