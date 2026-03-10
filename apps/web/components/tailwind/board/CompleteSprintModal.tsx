"use client";

import React, { useState } from "react";
import { X, ArrowLeftRight, ChevronDown } from "lucide-react";
import { postWithAuth } from "@/lib/api-helpers";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useBoard } from "@/contexts/boardContext";
import { toast } from "sonner";
import type { Block } from "@/types/block";
import type { DatabaseSource } from "@/types/board";
import { DayPickerCalendar } from "@/components/tailwind/common/GenericCalendar";

type IncompleteOption = "move_to_next" | "move_to_backlog" | "keep";

interface CompleteSprintModalProps {
  tasksDataSource: DatabaseSource;
  sprintDataSource: DatabaseSource;
  sprintNotes: Block[];
  currentSprint: Block;
  totalTasks: number;
  doneTasks: number;
  incompleteTasks: Block[];
  sprintRelationPropId: string;
  taskRelationPropId: string;
  sprintRelationLimit: "single" | "multiple";
  onClose: () => void;
  onComplete?: () => void;
}

function formatSingleDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function formatDateRange(dateValue: any): string {
  if (!dateValue || typeof dateValue !== "string") return "";
  const parts = dateValue.split(",");
  if (parts.length === 2) return `${formatSingleDate(parts[0]!)} → ${formatSingleDate(parts[1]!)}`;
  return formatSingleDate(dateValue);
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function genOptId(): string {
  return `opt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Merge an array of relation IDs safely. */
function getRelIds(val: any): string[] {
  return Array.isArray(val) ? val.map(String) : val ? [String(val)] : [];
}

export default function CompleteSprintModal({
  tasksDataSource,
  sprintDataSource,
  sprintNotes,
  currentSprint,
  totalTasks,
  doneTasks,
  incompleteTasks,
  sprintRelationPropId,
  taskRelationPropId,
  sprintRelationLimit,
  onClose,
  onComplete,
}: CompleteSprintModalProps) {
  const { updateBlock } = useGlobalBlocks();
  const { updateDataSource } = useBoard();
  const [isLoading, setIsLoading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [incompleteOption, setIncompleteOption] = useState<IncompleteOption>("keep");
  const [showIncompleteDropdown, setShowIncompleteDropdown] = useState(false);

  // --- derive sprint property IDs / options ---
  const sprintProps = sprintDataSource.properties ?? {};

  const sprintStatusEntry = Object.entries(sprintProps).find(
    ([, p]: [string, any]) => p.type === "status" && p.specialProperty
  );
  const sprintStatusPropId = sprintStatusEntry?.[0] ?? "";
  const statusOptions: { id: string; name: string; color?: string }[] =
    (sprintStatusEntry?.[1] as any)?.options ?? [];
  const getOptId = (name: string) =>
    statusOptions.find((o) => o.name.toLowerCase() === name.toLowerCase())?.id ?? "";

  const currentOptId = getOptId("Current");
  const nextOptId = getOptId("Next");
  const futureOptId = getOptId("Future");
  const lastOptId = getOptId("Last");
  const pastOptId = getOptId("Past");

  const sprintDatesPropId = Object.entries(sprintProps).find(
    ([, p]: [string, any]) => p.type === "date" && p.specialProperty
  )?.[0] ?? "";

  const sprintIdPropId = Object.entries(sprintProps).find(
    ([, p]: [string, any]) => p.type === "id" && p.specialProperty
  )?.[0] ?? "";

  // --- derived data ---
  const nextSprint = sprintNotes.find(
    (n) => String(n.value?.databaseProperties?.[sprintStatusPropId]) === String(nextOptId)
  );

  const storedNextDates = nextSprint?.value?.databaseProperties?.[sprintDatesPropId];
  const [newSprintStart, setNewSprintStart] = useState<string>(() =>
    typeof storedNextDates === "string" ? storedNextDates.split(",")[0] ?? todayPlusDays(1) : todayPlusDays(1)
  );
  const [newSprintEnd, setNewSprintEnd] = useState<string>(() =>
    typeof storedNextDates === "string" ? storedNextDates.split(",")[1] ?? todayPlusDays(14) : todayPlusDays(14)
  );

  const currentSprintName = currentSprint.value?.title || "Current Sprint";
  const nextSprintName = nextSprint?.value?.title || "New sprint";
  const currentSprintDates = formatDateRange(currentSprint.value?.databaseProperties?.[sprintDatesPropId]);
  const workspaceName = (tasksDataSource as any).workspaceName ?? "";
  const incompleteCount = incompleteTasks.length;

  // --- main handler (fully optimistic) ---

  const handleComplete = async () => {
    if (!currentOptId || !nextOptId) {
      toast.error("Current and Next sprint status options are not configured.");
      return;
    }

    setIsLoading(true);
    try {
      // ── Step 1: ensure Last / Past options exist ──────────────────────────
      let effectiveLastOptId = lastOptId;
      let effectivePastOptId = pastOptId;

      if (!effectiveLastOptId || !effectivePastOptId) {
        const updatedOptions = [...statusOptions];
        if (!effectiveLastOptId) {
          effectiveLastOptId = genOptId();
          updatedOptions.push({ id: effectiveLastOptId, name: "Last", color: "orange" });
        }
        if (!effectivePastOptId) {
          effectivePastOptId = genOptId();
          updatedOptions.push({ id: effectivePastOptId, name: "Past", color: "default" });
        }
        await postWithAuth("/api/database/updatePropertySchema", {
          dataSourceId: String(sprintDataSource._id),
          blockId: String(sprintDataSource.mainView),
          propertyId: sprintStatusPropId,
          newName: (sprintStatusEntry?.[1] as any)?.name ?? "Sprint Status",
          type: "status",
          options: updatedOptions,
        });
        updateDataSource(String(sprintDataSource._id), {
          properties: {
            ...sprintProps,
            [sprintStatusPropId]: { ...(sprintStatusEntry?.[1] as any), options: updatedOptions },
          },
        });
      }

      // ── Step 2: collect ALL changes (patches + api specs) ─────────────────
      //  We accumulate per-block property patches so we can apply them all at
      //  once for an instant UI update, then fire API calls in parallel.

      // Map: blockId → { propId → newValue }
      const patches = new Map<string, Record<string, any>>();
      // List of API call descriptors
      const calls: Array<{ dsId: string; blockId: string; propId: string; value: any }> = [];

      const schedule = (
        blockId: string,
        dsId: string,
        propId: string,
        value: any
      ) => {
        const cur = patches.get(blockId) ?? {};
        patches.set(blockId, { ...cur, [propId]: value });
        calls.push({ dsId, blockId, propId, value });
      };

      const currentSprintId = String(currentSprint._id);
      const incompleteTaskIds = incompleteTasks.map((t) => String(t._id));

      // ── 2a. Incomplete task changes ──
      if (incompleteCount > 0 && sprintRelationPropId) {
        if (incompleteOption === "move_to_next" && nextSprint) {
          const nextSprintId = String(nextSprint._id);

          // Each incomplete task: replace current sprint → next sprint in relation
          for (const task of incompleteTasks) {
            const relVal = task.value?.databaseProperties?.[sprintRelationPropId];
            const newVal =
              sprintRelationLimit === "single"
                ? nextSprintId
                : [...getRelIds(relVal).filter((id) => id !== currentSprintId), nextSprintId];
            schedule(String(task._id), String(tasksDataSource._id), sprintRelationPropId, newVal);
          }

          // Sprint Task Trackers (reverse relation)
          if (taskRelationPropId) {
            // Current sprint: remove incomplete task IDs
            const curIds = getRelIds(currentSprint.value?.databaseProperties?.[taskRelationPropId]);
            schedule(
              currentSprintId,
              String(sprintDataSource._id),
              taskRelationPropId,
              curIds.filter((id) => !incompleteTaskIds.includes(id))
            );
            // Next sprint: add incomplete task IDs
            const nextIds = getRelIds(nextSprint.value?.databaseProperties?.[taskRelationPropId]);
            schedule(
              String(nextSprint._id),
              String(sprintDataSource._id),
              taskRelationPropId,
              [...new Set([...nextIds, ...incompleteTaskIds])]
            );
          }
        } else if (incompleteOption === "move_to_backlog") {
          for (const task of incompleteTasks) {
            const relVal = task.value?.databaseProperties?.[sprintRelationPropId];
            const newVal =
              sprintRelationLimit === "single"
                ? ""
                : getRelIds(relVal).filter((id) => id !== currentSprintId);
            schedule(String(task._id), String(tasksDataSource._id), sprintRelationPropId, newVal);
          }
          if (taskRelationPropId) {
            const curIds = getRelIds(currentSprint.value?.databaseProperties?.[taskRelationPropId]);
            schedule(
              currentSprintId,
              String(sprintDataSource._id),
              taskRelationPropId,
              curIds.filter((id) => !incompleteTaskIds.includes(id))
            );
          }
        }
        // "keep" → no relation changes
      }

      // ── 2b. Sprint status cascade ──

      // Last → Past
      for (const note of sprintNotes) {
        if (String(note.value?.databaseProperties?.[sprintStatusPropId]) === String(effectiveLastOptId)) {
          schedule(String(note._id), String(sprintDataSource._id), sprintStatusPropId, effectivePastOptId);
        }
      }
      // Current → Last
      schedule(currentSprintId, String(sprintDataSource._id), sprintStatusPropId, effectiveLastOptId);

      // Next → Current  +  update its dates
      if (nextSprint) {
        schedule(String(nextSprint._id), String(sprintDataSource._id), sprintStatusPropId, currentOptId);
        if (newSprintStart && newSprintEnd && sprintDatesPropId) {
          schedule(
            String(nextSprint._id),
            String(sprintDataSource._id),
            sprintDatesPropId,
            `${newSprintStart},${newSprintEnd}`
          );
        }
      }

      // Future sprint with lowest Sprint ID → Next
      const futureNotes = sprintNotes.filter(
        (n) =>
          String(n.value?.databaseProperties?.[sprintStatusPropId]) === String(futureOptId) &&
          String(n._id) !== String(nextSprint?._id)
      );
      if (futureNotes.length > 0 && sprintIdPropId) {
        const sorted = [...futureNotes].sort(
          (a, b) =>
            Number(a.value?.databaseProperties?.[sprintIdPropId] ?? Infinity) -
            Number(b.value?.databaseProperties?.[sprintIdPropId] ?? Infinity)
        );
        schedule(String(sorted[0]!._id), String(sprintDataSource._id), sprintStatusPropId, nextOptId);
      }

      // ── Step 3: apply ALL optimistic block updates instantly ──────────────
      const allBlocks: Block[] = [...sprintNotes, ...incompleteTasks];
      for (const [blockId, propPatch] of patches.entries()) {
        const original = allBlocks.find((b) => String(b._id) === blockId);
        if (original) {
          updateBlock(blockId, {
            ...original,
            value: {
              ...original.value,
              databaseProperties: {
                ...original.value?.databaseProperties,
                ...propPatch,
              },
            },
          });
        }
      }

      // ── Step 4: fire all API calls in parallel ────────────────────────────
      await Promise.all(
        calls.map(({ dsId, blockId, propId, value }) =>
          postWithAuth("/api/database/updatePropertyValue", {
            dataSourceId: dsId,
            blockId,
            propertyId: propId,
            value,
            workspaceName,
          })
        )
      );

      toast.success(`${currentSprintName} completed!`);
      onComplete?.();
      onClose();
    } catch (err) {
      console.error("Failed to complete sprint:", err);
      toast.error("Failed to complete sprint. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- render ---

  const dateDisplayLabel =
    newSprintStart && newSprintEnd
      ? `${formatSingleDate(newSprintStart)} → ${formatSingleDate(newSprintEnd)}`
      : "Set dates";

  const incompleteOpts: { value: IncompleteOption; label: string; disabled?: boolean }[] = [
    { value: "move_to_next", label: "Move to next sprint", disabled: !nextSprint },
    { value: "move_to_backlog", label: "Move to backlog" },
    { value: "keep", label: "Keep in current sprint" },
  ];
  const selectedOptLabel = incompleteOpts.find((o) => o.value === incompleteOption)?.label ?? "Keep in current sprint";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 dark:bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        aria-modal="true"
        role="dialog"
        className="relative z-[201] max-h-full rounded-xl bg-white dark:bg-background shadow-xl border"
      >
        <div className="w-[400px] flex flex-col justify-center p-5 text-sm text-gray-700 dark:text-gray-200">

          {/* Title */}
          <div className="flex items-center justify-center text-base font-semibold mb-1">
            {currentSprintName} summary
          </div>

          {/* Subtitle */}
          <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 mb-4 gap-2">
            {currentSprintDates && <span>{currentSprintDates}</span>}
            {currentSprintDates && <div className="h-0.5 w-0.5 rounded-sm bg-gray-400 dark:bg-gray-500" />}
            <span>{doneTasks} / {totalTasks} total tasks</span>
          </div>

          {/* Info banner */}
          {!bannerDismissed && (
            <div className="flex items-start bg-blue-50 dark:bg-blue-900/20 rounded p-3 mb-3 text-xs leading-relaxed gap-2">
              <div className="flex-shrink-0 mt-[3px]">
                <ArrowLeftRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 font-normal">
                Complete your sprints automatically. Turn on Automated sprints in Settings.
              </div>
            </div>
          )}

          {/* Next sprint */}
          <div className="flex justify-between items-center h-6 mb-4">
            <span>Next sprint</span>
            <span className="flex items-center h-7 px-2 rounded-md text-sm flex-shrink-0">
              {nextSprintName}
            </span>
          </div>

          {/* Start and end dates */}
          <div className="flex justify-between items-center h-6 mb-4">
            <span>Start and end dates</span>
            <div className="relative">
              <button
                type="button"
                aria-expanded={showDatePicker}
                onClick={() => setShowDatePicker((v) => !v)}
                className="flex items-center gap-1 h-7 px-2 rounded-md text-sm cursor-pointer bg-transparent border-none hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {dateDisplayLabel}
                <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              </button>
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-1 z-[300]">
                  <DayPickerCalendar
                    value={
                      newSprintStart && newSprintEnd && newSprintStart !== newSprintEnd
                        ? `${newSprintStart},${newSprintEnd}`
                        : newSprintStart || ""
                    }
                    onChange={(val) => {
                      const parts = val.split(",");
                      if (parts.length === 2 && parts[1]) {
                        setNewSprintStart(parts[0] ?? "");
                        setNewSprintEnd(parts[1]);
                        setShowDatePicker(false);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Incomplete tasks */}
          {incompleteCount > 0 && (
            <div className="flex justify-between items-center h-6 mb-4">
              <span>
                {incompleteCount} incomplete {incompleteCount === 1 ? "task" : "tasks"}
              </span>
              <div className="relative">
                <button
                  type="button"
                  role="button"
                  onClick={() => setShowIncompleteDropdown((v) => !v)}
                  className="flex items-center gap-1 h-7 px-2 rounded-md text-sm cursor-pointer bg-transparent border-none hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {selectedOptLabel}
                  <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                </button>
                {showIncompleteDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-background border rounded-lg shadow-lg z-10 py-1 min-w-[190px]">
                    {incompleteOpts.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => {
                          if (!opt.disabled) {
                            setIncompleteOption(opt.value);
                            setShowIncompleteDropdown(false);
                          }
                        }}
                        className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 bg-transparent border-none cursor-pointer ${opt.disabled ? "opacity-40 cursor-not-allowed" : ""
                          } ${incompleteOption === opt.value ? "font-medium" : ""}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Complete button */}
          <button
            type="button"
            onClick={handleComplete}
            disabled={isLoading}
            className="flex items-center justify-center h-7 px-2 mt-2 rounded-md text-sm font-medium bg-blue-600 dark:bg-blue-500 text-white border-none cursor-pointer w-full disabled:opacity-70"
          >
            {isLoading ? "Completing…" : `Complete ${currentSprintName}`}
          </button>

          {/* Cancel button */}
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex items-center justify-center h-7 px-2 mt-2 rounded-md text-sm border-none cursor-pointer w-full bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
