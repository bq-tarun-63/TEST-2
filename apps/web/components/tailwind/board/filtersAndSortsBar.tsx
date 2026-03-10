"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Plus, ArrowUpDown, Check, X } from "lucide-react";
import { ViewCollection, BoardProperty } from "@/types/board";
import { useBoard } from "@/contexts/boardContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import FilterPropertiesModal from "./filterPropertiesModal";
import SortModal from "./sortPropertiesModel";
import AdvancedFilterModal from "./advancedFilterModal";
import CompleteSprintModal from "./CompleteSprintModal";
import { PROPERTY_TYPES } from "./addPropertyDialog";
import { updateFilters, updateSorts, updateAdvancedFilters } from "@/services-frontend/boardServices/databaseSettingsService";
import { toast } from "sonner";
import { getColorStyles } from "@/utils/colorStyles";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { normalizeCalculation } from "@/utils/rollupUtils";

interface FiltersAndSortsBarProps {
  board: Block;
  boardProperties: Record<string, BoardProperty>;
}

export default function FiltersAndSortsBar({ board, boardProperties }: FiltersAndSortsBarProps) {
  // REMOVED: boards, updateBoard - boards are now in global block context
  // boards, // Commented out - boards are now in global block context
  // updateBoard, // Commented out - boards are now in global block context
  const {
    getFilters,
    getSortBy,
    getGroupBy,
    getAdvancedFilters: getAdvancedFiltersFromContext,
    currentView,
    setBoardFilters,
    setBoardSortBy,
    setAdvancedFilters,
    getRelationNoteTitle,
    getNoteById,
    getNotesByDataSourceId,
    getCurrentDataSource,
    getDataSource,
  } = useBoard();
  const { blocks, getBlock, updateBlock } = useGlobalBlocks();
  const { workspaceMembers } = useWorkspaceContext();
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showAdvancedFilterModal, setShowAdvancedFilterModal] = useState(false);
  const [showCompleteSprintModal, setShowCompleteSprintModal] = useState(false);
  const [completionKey, setCompletionKey] = useState(0);
  const [selectedPropertyForOptions, setSelectedPropertyForOptions] = useState<string | null>(null);
  const [showOptionModal, setShowOptionModal] = useState(false);
  const [filterInputValues, setFilterInputValues] = useState<Record<string, string>>({});

  const optionModalRef = useRef<HTMLDivElement>(null);
  const filterModalRef = useRef<HTMLDivElement>(null);
  const sortModalRef = useRef<HTMLDivElement>(null);
  const advancedFilterModalRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const advancedFilterButtonRef = useRef<HTMLButtonElement>(null);

  const boardId = board._id;
  const currentViewData = currentView[boardId];

  const getCurrentViewTypeId = (): string | null => {
    if (!board || !currentViewData) return null;

    let view;
    if (currentViewData.id) {
      view = board.value.viewsTypes?.find((v) => v._id === currentViewData.id);
    } else if (currentViewData.type) {
      view = board.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
    }

    if (!view) return null;
    return view._id || null;
  };

  const viewTypeId = getCurrentViewTypeId();
  const activeFilters = viewTypeId ? getFilters(boardId) : {};
  const activeSorts = viewTypeId ? getSortBy(boardId) : [];
  const activeGroupBy = viewTypeId ? getGroupBy(boardId) : undefined;

  // Get advanced filters from view settings
  // Use context function to get advanced filters (loaded from database on page reload)
  const advancedFilters = getAdvancedFiltersFromContext(boardId);

  // Count total rules in all groups (including nested)
  const countAdvancedFilterRules = (groups: any[]): number => {
    let count = 0;
    for (const group of groups) {
      count += group.rules?.length || 0;
      if (group.groups && group.groups.length > 0) {
        count += countAdvancedFilterRules(group.groups);
      }
    }
    return count;
  };

  const advancedFilterRuleCount = countAdvancedFilterRules(advancedFilters);
  const advancedFilterLabelCount = advancedFilterRuleCount || 0;

  // --- Sprint summary detection ---
  const sprintContext = useMemo(() => {
    // Current view must have an advanced filter rule with nestedPropertyId
    const hasNestedFilter = advancedFilters.some((group: any) =>
      group.rules?.some((rule: any) => rule.nestedPropertyId)
    );
    if (!hasNestedFilter) return null;

    const tasksDataSource = getCurrentDataSource(boardId);
    if (!tasksDataSource?.isSprintOn || !tasksDataSource?.pairedDataSourceId) return null;

    const sprintDataSource = getDataSource(String(tasksDataSource.pairedDataSourceId));
    if (!sprintDataSource?.isSprint) return null;

    // Resolve sprint status property
    const sprintProps = sprintDataSource.properties ?? {};
    const sprintStatusEntry = Object.entries(sprintProps).find(
      ([, p]: [string, any]) => p.type === "status" && p.specialProperty
    );
    if (!sprintStatusEntry) return null;
    const [sprintStatusPropId, sprintStatusProp] = sprintStatusEntry;
    const statusOptions: { id: string; name: string }[] = (sprintStatusProp as any).options ?? [];
    const currentOptId = statusOptions.find((o) => o.name.toLowerCase() === "current")?.id;
    if (!currentOptId) return null;

    // Resolve sprint ID property and task relation property
    const sprintIdEntry = Object.entries(sprintProps).find(
      ([, p]: [string, any]) => p.type === "id" && p.specialProperty
    );
    const sprintIdPropId = sprintIdEntry?.[0] ?? "";

    // Find sprint notes and current sprint
    const sprintNotes: Block[] = getNotesByDataSourceId(String(sprintDataSource._id));
    const currentSprint = sprintNotes.find(
      (n) => String(n.value?.databaseProperties?.[sprintStatusPropId]) === String(currentOptId)
    );
    if (!currentSprint) return null;

    // Count tasks in the current sprint
    const taskNotes: Block[] = getNotesByDataSourceId(String(tasksDataSource._id));

    // Find the relation property in tasks datasource that points to sprints
    const taskProps = tasksDataSource.properties ?? {};
    const sprintRelationEntry = Object.entries(taskProps).find(
      ([, p]: [string, any]) =>
        p.type === "relation" &&
        String(p.linkedDatabaseId) === String(sprintDataSource._id)
    );
    const sprintRelationPropId = sprintRelationEntry?.[0] ?? "";
    // syncedPropertyId on the tasks relation = the Task Tracker relation ID in the sprints datasource
    const taskRelationPropId: string = (sprintRelationEntry?.[1] as any)?.syncedPropertyId ?? "";
    const sprintRelationLimit: "single" | "multiple" =
      (sprintRelationEntry?.[1] as any)?.relationLimit ?? "multiple";

    // Find the task status property for counting done tasks
    const taskStatusEntry = Object.entries(taskProps).find(
      ([, p]: [string, any]) => p.type === "status" && p.specialProperty
    );
    const taskStatusPropId = taskStatusEntry?.[0] ?? "";
    const taskStatusOptions: { id: string; name: string }[] =
      (taskStatusEntry?.[1] as any)?.options ?? [];
    const doneOptIds = taskStatusOptions
      .filter((o) => o.name.toLowerCase().includes("done") || o.name.toLowerCase().includes("complet"))
      .map((o) => o.id);

    let totalTasks = 0;
    let doneTasks = 0;
    const incompleteTasks: Block[] = [];

    if (sprintRelationPropId) {
      const currentSprintId = String(currentSprint._id);
      for (const task of taskNotes) {
        const relVal = task.value?.databaseProperties?.[sprintRelationPropId];
        const relIds: string[] = Array.isArray(relVal)
          ? relVal.map(String)
          : relVal
            ? [String(relVal)]
            : [];
        if (relIds.includes(currentSprintId)) {
          totalTasks++;
          const taskStatus = String(task.value?.databaseProperties?.[taskStatusPropId] ?? "");
          if (taskStatusPropId && doneOptIds.some((id) => id === taskStatus)) {
            doneTasks++;
          } else {
            incompleteTasks.push(task);
          }
        }
      }
    }

    // Rollup: percentage done (0-100)
    const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const circumference = 2 * Math.PI * 6.25; // r=6.25
    const dashOffset = circumference - (pct / 100) * circumference;

    return {
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
      pct,
      dashOffset,
      circumference,
    };
  }, [advancedFilters, boardId, getCurrentDataSource, getDataSource, getNotesByDataSourceId, completionKey, blocks]);

  const hasFilters = activeFilters && Object.keys(activeFilters).length > 0;
  const hasSorts = activeSorts && activeSorts.length > 0;
  const hasGroupBy = activeGroupBy !== undefined;
  const hasAdvancedFilters = advancedFilters.length > 0;

  // Initialize input value when a property is selected for options
  useEffect(() => {
    if (selectedPropertyForOptions && activeFilters[selectedPropertyForOptions]) {
      const existingValue = activeFilters[selectedPropertyForOptions][0] || "";
      setFilterInputValues(prev => ({
        ...prev,
        [selectedPropertyForOptions]: existingValue
      }));
    }
  }, [selectedPropertyForOptions, activeFilters]);

  // Always render the bar (even if empty) to show the "Add filter" button

  const capitalize = (str: string) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getPropertyIcon = (type: string) => {
    const found = PROPERTY_TYPES.find((p) => p.type === type);
    return found?.icon || null;
  };

  const getFilterDisplayValue = (propId: string, values: string[]): string => {
    const prop = boardProperties[propId];
    if (!prop) return values.join(", ");

    if (prop.type === "checkbox") {
      return values.map(v => v === "true" ? "Checked" : v === "false" ? "Unchecked" : v).join(", ");
    }

    if (prop.type === "person") {
      return values.map(val => {
        const member = workspaceMembers.find(m => m.userId === val || m.userName === val || m.userEmail === val);
        return member?.userName || val;
      }).join(", ");
    }

    if (["status", "select", "multiselect", "priority"].includes(prop.type)) {
      return values.map(val => {
        const option = prop.options?.find((opt: any) => String(opt.id || opt.value) === String(val));
        return option?.name || val;
      }).join(", ");
    }

    if (prop.type === "relation") {
      // For relation, values are note titles - get current titles from context
      return values.map(val => {
        // Try to find note by title first (for backward compatibility)
        // Search through all relation properties to find the note
        let foundNote: any = null;
        for (const [pId, p] of Object.entries(boardProperties)) {
          if (p.type === "relation" && p.linkedDatabaseId) {
            const notes = getNotesByDataSourceId(p.linkedDatabaseId);
            foundNote = notes.find((n: any) => n.title === val || String(n._id) === val);
            if (foundNote) break;
          }
        }

        // Also try getNoteById
        if (!foundNote) {
          foundNote = getNoteById(val);
        }

        if (foundNote) {
          const linkedDatabaseId = prop.linkedDatabaseId || "";
          return getRelationNoteTitle(String(foundNote._id || val), linkedDatabaseId, val);
        }
        return val;
      }).join(", ");
    }

    return values.join(", ");
  };

  const getPropertyName = (propId: string): string => {
    const prop = boardProperties[propId];
    return prop ? capitalize(prop.name) : propId;
  };

  const getPropertyOptions = (propId: string) => {
    const prop = boardProperties[propId];
    if (!prop) return [];

    if (prop.type === "person") {
      return workspaceMembers.map((m) => ({
        id: m.userId,
        name: m.userName,
      }));
    }

    if (prop.type === "relation" && prop.linkedDatabaseId) {
      // Get relation notes from context
      const notes = getNotesByDataSourceId(prop.linkedDatabaseId);
      return notes.map((note: Block) => ({
        id: note._id || "",
        name: note.value.title || "New page",
      }));
    }

    if (prop.type === "checkbox") {
      return [
        { id: "true", name: "Checked" },
        { id: "false", name: "Unchecked" },
      ];
    }

    return prop.options || [];
  };

  const getOptionDisplay = (propId: string, optionName: string, optionId?: string) => {
    const prop = boardProperties[propId];
    if (!prop) return { name: optionName, color: "default" };

    if (prop.type === "person") {
      const member = workspaceMembers.find((m) => m.userName === optionName || m.userEmail === optionName);
      return { name: member?.userName || optionName, color: "default" };
    }

    if (prop.type === "relation" && optionId) {
      // Get current title from context (updates automatically)
      const linkedDatabaseId = prop.linkedDatabaseId || "";
      const currentTitle = getRelationNoteTitle(optionId, linkedDatabaseId, optionName);
      return {
        name: currentTitle,
        color: "default"
      };
    }

    const option = prop.options?.find((opt: any) => String(opt.id) === String(optionId || optionName));
    return {
      name: option?.name || optionName,
      color: option?.color || "default",
    };
  };


  const getStatusIcon = (type: string) => {
    switch (type) {
      case "status":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.501 2.391a8 8 0 0 1 .998 0 .625.625 0 0 1-.081 1.247 7 7 0 0 0-.836 0 .625.625 0 0 1-.08-1.247m3.034 1.053a.625.625 0 0 1 .838-.284q.45.222.863.5a.625.625 0 0 1-.695 1.038 6 6 0 0 0-.722-.417.625.625 0 0 1-.284-.837m-5.072 0a.625.625 0 0 1-.284.837q-.375.185-.722.417a.625.625 0 0 1-.695-1.038q.414-.278.863-.5a.625.625 0 0 1 .838.284m8.009 2.147a.625.625 0 0 1 .867.172q.278.414.5.863a.625.625 0 0 1-1.12.554 6 6 0 0 0-.418-.722.625.625 0 0 1 .171-.867m-10.946 0c.287.192.363.58.171.867q-.232.346-.417.722a.625.625 0 1 1-1.12-.554q.221-.45.499-.863a.625.625 0 0 1 .867-.172m12.418 3.327a.625.625 0 0 1 .664.583 8 8 0 0 1 0 .998.625.625 0 0 1-1.248-.081 6 6 0 0 0 0-.836.625.625 0 0 1 .584-.664m-13.89 0c.345.022.606.32.583.664a7 7 0 0 0 0 .836.625.625 0 0 1-1.247.08 8 8 0 0 1 0-.997.625.625 0 0 1 .664-.583m13.501 3.618c.31.153.437.528.284.838q-.222.45-.5.863a.625.625 0 1 1-1.038-.695q.231-.346.417-.722a.625.625 0 0 1 .837-.284m-13.112 0a.625.625 0 0 1 .837.284q.185.375.417.722a.625.625 0 0 1-1.038.695 8 8 0 0 1-.5-.864.625.625 0 0 1 .284-.837m2.147 2.937a.625.625 0 0 1 .867-.171q.346.231.722.417a.625.625 0 1 1-.554 1.12 8 8 0 0 1-.863-.499.625.625 0 0 1-.172-.867m8.818 0a.625.625 0 0 1-.172.867 8 8 0 0 1-.864.5.625.625 0 0 1-.553-1.12q.375-.187.722-.418a.625.625 0 0 1 .867.171m-5.491 1.472a.625.625 0 0 1 .664-.584 6 6 0 0 0 .836 0 .625.625 0 0 1 .08 1.248 8 8 0 0 1-.997 0 .625.625 0 0 1-.583-.664"></path>
          </svg>
        );
      case "priority":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M8.954 12.856a.718.718 0 0 1-1.079-.62V7.764c0-.554.6-.9 1.08-.62l3.833 2.236a.718.718 0 0 1 0 1.24z"></path>
            <path d="M2.375 10a7.625 7.625 0 1 0 15.25 0 7.625 7.625 0 0 0-15.25 0M10 16.375a6.375 6.375 0 1 1 0-12.75 6.375 6.375 0 0 1 0 12.75"></path>
          </svg>
        );
      default:
        return null;
    }
  };

  const handleOptionToggle = async (propId: string, optionName: string) => {
    const prop = boardProperties[propId];
    const isSingleValueType = prop && ["text", "number", "date", "email", "url", "phone", "id"].includes(prop.type);
    const normalizedRollupCalc = prop?.type === "rollup" ? normalizeCalculation(prop.rollup?.calculation) : null;
    const isRollupInput = prop?.type === "rollup" && normalizedRollupCalc && normalizedRollupCalc.category !== "original";

    const current = activeFilters[propId] || [];
    let updated: string[];

    if (isSingleValueType || isRollupInput) {
      updated = [optionName];
    } else {
      if (current.includes(optionName)) {
        updated = current.filter((name) => name !== optionName);
      } else {
        updated = [...current, optionName];
      }
    }

    const updatedFilters = (() => {
      if (updated.length === 0) {
        const { [propId]: _, ...rest } = activeFilters;
        return rest;
      }

      return { ...activeFilters, [propId]: updated };
    })();

    if (!viewTypeId) {
      toast.error("View type ID not found");
      return;
    }

    try {
      // updateFilters handles optimistic update and rollback internally
      await updateFilters(
        viewTypeId,
        updatedFilters,
        boardId,
        setBoardFilters,
        getFilters,
        getBlock,
        updateBlock,
      );
    } catch (err) {
      console.error("Failed to update filters:", err);
    }
  };

  const handleClearSelection = async (propId: string) => {
    const updatedFilters = (() => {
      const { [propId]: _, ...rest } = activeFilters;
      return rest;
    })();

    if (!viewTypeId) {
      toast.error("View type ID not found");
      return;
    }

    try {
      // updateFilters handles optimistic update and rollback internally
      await updateFilters(
        viewTypeId,
        updatedFilters,
        boardId,
        setBoardFilters,
        getFilters,
        getBlock,
        updateBlock,
      );

      setShowOptionModal(false);
      setSelectedPropertyForOptions(null);
    } catch (err) {
      console.error("Failed to update filters:", err);
      toast.error("Failed to update filters");
    }
  };

  const renderOptionModal = (propId: string) => {
    const prop = boardProperties[propId];
    const options = getPropertyOptions(propId);
    const selectedOptions = activeFilters[propId] || [];

    const normalizedRollupCalc =
      prop?.type === "rollup" ? normalizeCalculation(prop.rollup?.calculation) : null;
    const isRollupInput = prop?.type === "rollup" && normalizedRollupCalc && normalizedRollupCalc.category !== "original";
    const isInputType = ["text", "number", "date", "email", "url", "phone", "id"].includes(prop?.type || "");
    const needsInput = isRollupInput || isInputType;

    const inputValue = filterInputValues[propId] ?? "";

    const handleInputSubmit = () => {
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      handleOptionToggle(propId, trimmed);
      setFilterInputValues((prev) => ({ ...prev, [propId]: "" }));
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleInputSubmit();
      }
    };

    return (
      <>
        <div className="flex-shrink-0">
          <div className="p-1 pt-0">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{capitalize(prop?.name || "")} is </span>
              <ChevronDown className="w-3 h-3" />
            </div>
          </div>
          <div className="flex-1">
            {needsInput && (
              <div className="px-3 pb-3">
                <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900 flex items-center gap-2">
                  <input
                    type={prop?.type === "date" ? "date" : prop?.type === "number" ? "number" : "text"}
                    className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-gray-100"
                    value={inputValue}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setFilterInputValues((prev) => ({ ...prev, [propId]: newValue }));
                      // Auto-submit for date type
                      const isDateInput = prop?.type === "date";
                      if (isDateInput && newValue) {
                        handleOptionToggle(propId, newValue);
                      }
                    }}
                    onKeyDown={handleInputKeyDown}
                    placeholder={prop?.type === "date" ? "" : `Type a ${prop?.type || "value"}…`}
                    autoFocus
                  />
                  {inputValue && prop?.type !== "date" && (
                    <button
                      type="button"
                      onClick={() => setFilterInputValues((prev) => ({ ...prev, [propId]: "" }))}
                      className="h-6 w-6 rounded-full text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      aria-label="Clear input"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="pb-1">
              {!needsInput && options.map((opt: any) => {
                const useId = prop?.type === "relation" || prop?.type === "checkbox" || prop?.type === "person" || prop?.type === "status" || prop?.type === "select" || prop?.type === "multi_select" || prop?.type === "priority";
                const optionValue = useId ? opt.id : opt.name;
                const isSelected = selectedOptions.includes(optionValue);
                const display = getOptionDisplay(propId, opt.name, opt.id);
                const color = display.color || "default";

                return (
                  <div
                    key={opt.id || opt.name}
                    role="menuitem"
                    tabIndex={-1}
                    className={`flex items-center gap-2 px-4 py-1.5 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded ${isSelected ? "bg-gray-100 dark:hover:bg-gray-800" : ""
                      }`}
                    onClick={() => handleOptionToggle(propId, optionValue)}
                  >
                    <div className="relative w-3.5 h-3.5 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleOptionToggle(propId, optionValue)}
                        className="absolute opacity-0 w-full h-full cursor-pointer"
                      />
                      <div
                        className={`w-3.5 h-3.5 rounded border transition-colors ${isSelected
                          ? "bg-blue-600 border-blue-600"
                          : "border-gray-300 dark:border-gray-600"
                          }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      {prop?.type === "status" && (() => {
                        const colors = getColorStyles(color);
                        if (!colors) return null;
                        return (
                          <div
                            className="inline-flex items-center flex-shrink-1 min-w-0 max-w-full h-5 rounded-full px-2 py-0.5 text-sm font-medium"
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.text,
                            }}
                          >
                            <div
                              className="w-2 h-2 rounded-full mr-1.5 flex-shrink-0"
                              style={{ backgroundColor: colors.dot }}
                            ></div>
                            <span className="truncate">{capitalize(display.name)}</span>
                          </div>
                        );
                      })()}
                      {prop?.type === "priority" && (
                        <div className="flex items-center gap-1">
                          {getStatusIcon("priority")}
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {capitalize(display.name)}
                          </span>
                        </div>
                      )}
                      {prop?.type !== "status" && prop?.type !== "priority" && (
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {capitalize(display.name)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 mt-1">
            <button
              onClick={() => handleClearSelection(propId)}
              className="w-full px-2 py-2 text-sm text-left text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              Clear selection
            </button>
          </div>
        </div>
      </>
    );
  };

  // Close modals on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      // Handle option modal
      if (showOptionModal && optionModalRef.current && !optionModalRef.current.contains(target)) {
        const clickedButton = (target as HTMLElement).closest('button[aria-haspopup="dialog"]');
        if (clickedButton && clickedButton.getAttribute('data-filter-prop-id') === selectedPropertyForOptions) {
          return;
        }
        setShowOptionModal(false);
        setSelectedPropertyForOptions(null);
      }

      // Handle filter modal
      if (showFilterModal && filterModalRef.current && !filterModalRef.current.contains(target)) {
        if (filterButtonRef.current && filterButtonRef.current.contains(target)) {
          return;
        }
        setShowFilterModal(false);
      }

      // Handle sort modal
      if (showSortModal && sortModalRef.current && !sortModalRef.current.contains(target)) {
        if (sortButtonRef.current && sortButtonRef.current.contains(target)) {
          return;
        }
        setShowSortModal(false);
      }

      // Handle advanced filter modal
      if (showAdvancedFilterModal && advancedFilterModalRef.current && !advancedFilterModalRef.current.contains(target)) {
        if (advancedFilterButtonRef.current && advancedFilterButtonRef.current.contains(target)) {
          return;
        }
        setShowAdvancedFilterModal(false);
      }
    }

    if (showOptionModal || showFilterModal || showSortModal || showAdvancedFilterModal) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showOptionModal, showFilterModal, showSortModal, showAdvancedFilterModal, selectedPropertyForOptions]);

  // Only show the bar if there are active filters, sorts, or advanced filters
  if (!hasFilters && !hasSorts && !hasAdvancedFilters) {
    return null;
  }

  return (
    <>
      <div className="w-full border-t border-gray-200 dark:border-gray-700 !m-0 z-[86]">
        <div className="w-full rounded-md z-[86]" tabIndex={0} role="button">
          <div className="flex pt-1">
            <div className="relative flex-grow-0">
              <div className="flex items-center pt-2 pb-2">
                {/* Sorts Button */}
                {hasSorts && (
                  <div className="relative inline-flex">
                    <div data-popup-origin="true" className="contents">
                      <div className="rounded-2xl mr-1.5 inline-flex">
                        <button
                          ref={sortButtonRef}
                          onClick={() => setShowSortModal(!showSortModal)}
                          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-sm rounded-full h-6 leading-6 px-2"
                          type="button"
                          aria-expanded={showSortModal}
                          aria-haspopup="dialog"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="-mt-px max-w-[220px] whitespace-nowrap truncate">
                            {activeSorts.length} {activeSorts.length === 1 ? "Sort" : "sorts"}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                        </button>
                      </div>
                    </div>
                    {showSortModal && (
                      <div
                        ref={sortModalRef}
                        className="absolute left-0 top-full mt-1 bg-background dark:bg-gray-900 rounded-lg border dark:border-gray-700 shadow-lg z-[100]"
                      >
                        <SortModal
                          board={board}
                          boardProperties={boardProperties}
                          sorts={activeSorts}
                          onClose={() => setShowSortModal(false)}
                          onApply={async (sorts) => {
                            if (!viewTypeId) return;
                            await updateSorts(
                              viewTypeId,
                              sorts,
                              board._id,
                              setBoardSortBy,
                              getSortBy,
                              getBlock,
                              updateBlock
                            );
                          }}
                          triggerRef={sortButtonRef}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Divider */}
                {(hasSorts && (hasFilters || hasAdvancedFilters)) && (
                  <div className="border-r border-gray-200 dark:border-gray-700 h-6 ml-2 mr-3" />
                )}

                {/* Advanced Filters */}
                {hasAdvancedFilters && (
                  <div className="relative inline-flex">
                    <div data-popup-origin="true" className="contents">
                      <div className="rounded-2xl mr-1.5 inline-flex">
                        <button
                          ref={advancedFilterButtonRef}
                          onClick={() => setShowAdvancedFilterModal(!showAdvancedFilterModal)}
                          className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-sm rounded-full h-6 leading-6 px-2"
                          type="button"
                          aria-expanded={showAdvancedFilterModal}
                          aria-haspopup="dialog"
                        >
                          <span className="-mt-px max-w-[220px] whitespace-nowrap truncate">
                            {`${advancedFilterLabelCount} ${advancedFilterLabelCount === 1 ? "rule" : "rules"}`}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                        </button>
                      </div>
                    </div>
                    {showAdvancedFilterModal && (
                      <div
                        ref={advancedFilterModalRef}
                        className="absolute left-0 top-full mt-1 z-[100]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AdvancedFilterModal
                          board={board}
                          boardProperties={boardProperties}
                          onClose={() => setShowAdvancedFilterModal(false)}
                          initialRules={(() => {
                            // Convert IAdvancedFilterGroup[] to rules array (flatten groups)
                            if (!advancedFilters || advancedFilters.length === 0) return [];

                            const allRules: any[] = [];
                            const flattenGroup = (group: any) => {
                              if (group.rules && group.rules.length > 0) {
                                group.rules.forEach((rule: any, index: number) => {
                                  allRules.push({
                                    id: rule.id || `rule-${Date.now()}-${index}`,
                                    propertyId: rule.propertyId || null,
                                    operator: rule.operator || "contains",
                                    value: rule.value || "",
                                    booleanOperator: index > 0 ? (rule.booleanOperator || group.booleanOperator || "AND") : undefined,
                                    nestedPropertyId: rule.nestedPropertyId,
                                  });
                                });
                              }
                              if (group.groups && group.groups.length > 0) {
                                group.groups.forEach((nestedGroup: any) => flattenGroup(nestedGroup));
                              }
                            };

                            advancedFilters.forEach((group) => flattenGroup(group));
                            return allRules;
                          })()}
                          onApply={async (rules) => {
                            if (!viewTypeId) {
                              toast.error("View type ID not found");
                              return;
                            }

                            try {
                              // Convert rules to groups format for backend (single group with all rules)
                              const groups = rules.length > 0 ? [{
                                id: `group-${Date.now()}`,
                                booleanOperator: "AND" as const,
                                rules: rules.map((rule) => ({
                                  id: rule.id,
                                  propertyId: rule.propertyId!,
                                  operator: rule.operator,
                                  value: rule.value,
                                  booleanOperator: rule.booleanOperator, // Preserve booleanOperator
                                  nestedPropertyId: rule.nestedPropertyId,
                                })),
                                groups: [],
                              }] : [];

                              // updateAdvancedFilters handles optimistic update and rollback internally
                              await updateAdvancedFilters(
                                viewTypeId,
                                groups,
                                boardId,
                                setAdvancedFilters,
                                getAdvancedFiltersFromContext,
                                getBlock,
                                updateBlock,
                              );

                              toast.success("Advanced filters updated successfully");
                              setShowAdvancedFilterModal(false);
                            } catch (err) {
                              console.error("Failed to update advanced filters:", err);
                              toast.error(err instanceof Error ? err.message : "Failed to update advanced filters");
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Divider between advanced filters and regular filters */}
                {(hasAdvancedFilters && hasFilters) && (
                  <div className="border-r border-gray-200 dark:border-gray-700 h-6 ml-2 mr-3" />
                )}

                {/* Filters */}
                {hasFilters && (
                  <div className="flex m-0 flex-shrink-0">
                    {Object.entries(activeFilters).map(([propId, values]) => {
                      if (!values || values.length === 0) return null;

                      const prop = boardProperties[propId];
                      if (!prop) return null;

                      const Icon = getPropertyIcon(prop.type);
                      const displayValue = getFilterDisplayValue(propId, values);
                      const propertyName = getPropertyName(propId);

                      const isOpen = selectedPropertyForOptions === propId && showOptionModal;

                      return (
                        <div key={propId} className="relative flex flex-row cursor-grab">
                          <div data-popup-origin="true" className="contents">
                            <div className="rounded-2xl mr-1.5 inline-flex">
                              <button
                                onClick={() => {
                                  // Toggle: if already open for this property, close it; otherwise open it
                                  if (isOpen) {
                                    setShowOptionModal(false);
                                    setSelectedPropertyForOptions(null);
                                  } else {
                                    setSelectedPropertyForOptions(propId);
                                    setShowOptionModal(true);
                                  }
                                }}
                                data-filter-prop-id={propId}
                                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-sm rounded-full h-6 leading-6 px-2"
                                type="button"
                                aria-expanded={isOpen}
                                aria-haspopup="dialog"
                              >
                                {Icon && (
                                  <div className="flex items-center justify-center flex-shrink-0 w-4 h-4">
                                    <Icon className="w-3.5 h-3.5" />
                                  </div>
                                )}
                                <span className="inline-block max-w-[180px] min-w-0 truncate">
                                  <span className="font-medium">{propertyName}</span>: <span>{displayValue}</span>
                                </span>
                                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                              </button>
                            </div>
                          </div>
                          {isOpen && (
                            <div
                              ref={optionModalRef}
                              className="absolute left-0 top-full mt-1 bg-background dark:bg-gray-900 rounded-lg border dark:border-gray-700 shadow-lg z-[100] w-[260px] min-w-[180px]"
                              style={{
                                maxWidth: "calc(100vw - 24px)"
                              }}
                            >
                              {renderOptionModal(propId)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Filter Button */}
                <div className="relative inline-flex">
                  <div data-popup-origin="true" className="contents">
                    <button
                      ref={filterButtonRef}
                      onClick={() => setShowFilterModal(!showFilterModal)}
                      className="inline-flex items-center gap-1 transition-opacity cursor-pointer hover:opacity-80 text-gray-500 dark:text-gray-400 h-6 px-[5px] pr-[9px] rounded-xl whitespace-nowrap text-sm flex-shrink-0 leading-[1.2] min-w-0 mr-3"
                      type="button"
                      aria-expanded={showFilterModal}
                      aria-haspopup="dialog"
                    >
                      <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Filter</span>
                    </button>
                  </div>
                  {showFilterModal && (
                    <div
                      ref={filterModalRef}
                      className="absolute left-0 top-full mt-1 bg-background dark:bg-gray-900 rounded-lg border dark:border-gray-700 shadow-lg z-[100]"
                    >
                      <FilterPropertiesModal
                        board={board}
                        boardProperties={boardProperties}
                        onClose={() => setShowFilterModal(false)}
                        onApply={selectedFilters => {
                          if (viewTypeId) {
                            setBoardFilters(viewTypeId, selectedFilters);
                          }
                          setShowFilterModal(false);
                        }}
                        filters={activeFilters}
                        triggerRef={filterButtonRef}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Sprint summary — shown when view is a nested-property sprint filter */}
            {sprintContext && (
              <div className="flex items-center pt-1.5 ml-auto flex-shrink-0">
                {/* Progress ring + task count */}
                <div className="flex items-center justify-center gap-[5px] text-sm font-normal whitespace-nowrap text-gray-500 dark:text-gray-400">
                  <svg
                    viewBox="0 0 14 14"
                    width="15"
                    height="15"
                    aria-hidden="true"
                    focusable="false"
                    className="w-[15px] h-[15px] flex-shrink-0"
                  >
                    {/* Track */}
                    <circle
                      cx="7"
                      cy="7"
                      r="6.25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-gray-200 dark:text-gray-700"
                    />
                    {/* Progress */}
                    <g transform="rotate(-90 7 7)">
                      <circle
                        cx="7"
                        cy="7"
                        r="6.25"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeDasharray={sprintContext.circumference}
                        strokeDashoffset={sprintContext.dashOffset}
                        className="text-blue-500 dark:text-blue-400"
                        style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
                      />
                    </g>
                  </svg>
                  {sprintContext.doneTasks} / {sprintContext.totalTasks} tasks
                </div>

                {/* Complete sprint button */}
                <button
                  type="button"
                  onClick={() => setShowCompleteSprintModal(true)}
                  className="select-none cursor-pointer inline-flex items-center justify-center h-[26px] px-3 rounded-md whitespace-nowrap text-sm font-medium leading-none border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 ms-2 bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Complete sprint
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Complete Sprint Modal */}
      {showCompleteSprintModal && sprintContext && (
        <CompleteSprintModal
          tasksDataSource={sprintContext.tasksDataSource}
          sprintDataSource={sprintContext.sprintDataSource}
          sprintNotes={sprintContext.sprintNotes}
          currentSprint={sprintContext.currentSprint}
          totalTasks={sprintContext.totalTasks}
          doneTasks={sprintContext.doneTasks}
          incompleteTasks={sprintContext.incompleteTasks}
          sprintRelationPropId={sprintContext.sprintRelationPropId}
          taskRelationPropId={sprintContext.taskRelationPropId}
          sprintRelationLimit={sprintContext.sprintRelationLimit}
          onComplete={() => setCompletionKey((k) => k + 1)}
          onClose={() => setShowCompleteSprintModal(false)}
        />
      )}
    </>
  );
}

