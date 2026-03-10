"use client";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import useAddRootPage from "@/hooks/use-addRootPage";
import useBoardFunctions from "@/hooks/use-board";
import useDragDropNotes from "@/hooks/use-cardDragAndDrop";
import useNoteActions from "@/hooks/use-updateNode";
import type { Block } from "@/types/block";
import { applySorting } from "@/utils/sortingCard";
import { computeRollupData, getRollupComparableValue } from "@/utils/rollupUtils";
import { applyAdvancedFilters } from "@/utils/advancedFilterUtils";
import { getInitialPropertiesFromFilters } from "@/utils/filterUtils";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import type { JSONContent } from "novel";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PlusIcon from "../../ui/icons/plusIcon";
import RightSidebar from "../rightSidebar";
import CenterPeek from "../centerPeek";
import CalendarCard from "./calenderCard";
import CalendarHeader from "./calenderHeader";
import CalendarRangeBar, { BAR_ROW_HEIGHT, BAR_TOP_OFFSET } from "./CalendarRangeBar";
import type { RangeSegment } from "./CalendarRangeBar";
import { ObjectId } from "bson";
import { useAuth } from "@/hooks/use-auth";
import { isOwner } from "@/services-frontend/user/userServices";
import { useWorkspaceContext } from "@/contexts/workspaceContext";

interface CalendarViewProps {
  board: Block;
  notes: Block[];
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  notes: Block[];
}

export default function CalendarView({ board, notes }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<Block | null>(null);
  const [rightSidebarContent, setRightSidebarContent] = useState<JSONContent | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const previousCardIdRef = useRef<string | null>(null);
  const { addRootPage } = useAddRootPage();
  const [localNotes, setLocalNotes] = useState<Block[]>(notes);
  const { UpdateNote, DeleteNote } = useNoteActions();
  const { getFilters, getAdvancedFilters, getSortBy, searchQuery, getCurrentDataSourceProperties, currentView, getNotesByDataSourceId, getDataSource, updateDataSource, setCurrentBoardNoteId, getLayoutSettings, getValidRelationIds } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();
  const { user } = useAuth();
  const { workspaceMembers } = useWorkspaceContext();

  // Get current dataSourceId from current view ID (not type)
  // IMPORTANT: Always match by view ID first, only use type as fallback
  const getCurrentDataSourceId = (): string | null => {
    const currentViewData = currentView[board._id];
    const latestBoard = getBlock(board._id) || board;

    let view;
    if (currentViewData?.id) {
      const currentViewId = currentViewData.id;
      view = latestBoard.value?.viewsTypes?.find((vt) => vt._id === currentViewId);
    } else if (currentViewData?.type) {
      view = latestBoard.value?.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
    }

    const dsId = view?.databaseSourceId;
    return dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
  };

  // Get properties from current data source
  const boardProperties = getCurrentDataSourceProperties(board._id) || {};

  useEffect(() => {
    setLocalNotes(notes);
  }, [board, notes]);

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const { handleCardClick, handleCloseSidebar } = useBoardFunctions({
    board,
    setSelectedTask,
    setRightSidebarContent,
    setIsClosing,
    previousCardIdRef,
  });

  // Apply filters and search to notes
  const filteredNotes = useMemo(() => {
    let result = localNotes;

    // Apply search query first
    const query = searchQuery[board._id] || "";
    if (query.trim()) {
      const searchLower = query.toLowerCase();
      result = result.filter((note) => {
        const titleMatch = note.value.title.toLowerCase().includes(searchLower);

        return titleMatch;
      });
    }

    // Get current view to access settings for advanced filters
    const currentViewData = currentView[board._id];
    const latestBoard = getBlock(board._id) || board;
    let view;
    if (currentViewData?.id) {
      const currentViewId = currentViewData.id;
      view = latestBoard.value?.viewsTypes?.find((v) => v._id === currentViewId);
    } else if (currentViewData?.type) {
      view = latestBoard.value?.viewsTypes?.find((v) => v.viewType === currentViewData.type);
    }

    // Check for advanced filters - apply them first if they exist (separate from regular filters)
    const advancedFilters = getAdvancedFilters(board._id);
    if (advancedFilters.length > 0) {
      // Apply advanced filters using the utility function, then continue with normal filters
      result = applyAdvancedFilters(
        result,
        advancedFilters,
        boardProperties,
        getNotesByDataSourceId,
        getDataSource,
        getValidRelationIds
      );
    }

    // Apply property filters for this specific board (using viewTypeId) - regular filters
    const boardFilters = getFilters(board._id);
    if (!boardFilters || Object.keys(boardFilters).length === 0) return result;

    return result.filter((note) => {
      const noteProps = note.value.databaseProperties || {};

      // Loop over each property filter for this board
      return Object.entries(boardFilters).every(([propId, filterValues]) => {
        const propSchema = boardProperties[propId];

        // Handle rollup properties
        if (propSchema?.type === "rollup") {
          const rollupResult = computeRollupData(
            note,
            propSchema,
            boardProperties,
            getNotesByDataSourceId,
            getDataSource,
          );

          const rollupValue = getRollupComparableValue(rollupResult);

          if (rollupValue === null) {
            return false; // Exclude notes with invalid rollup
          }

          const filterArray = Array.isArray(filterValues)
            ? filterValues
            : [filterValues];

          // Convert rollup value to string for comparison
          const rollupValueStr = String(rollupValue);
          return filterArray.some(filterVal => {
            const filterStr = String(filterVal);
            // For count/percent, allow numeric comparison
            if (typeof rollupValue === "number" && !isNaN(Number(filterStr))) {
              return rollupValue === Number(filterStr);
            }
            // For text values, check if filter matches
            return rollupValueStr.toLowerCase().includes(filterStr.toLowerCase()) ||
              filterStr.toLowerCase().includes(rollupValueStr.toLowerCase());
          });
        }

        const noteValue = noteProps[propId];

        if (!noteValue) return false; // if note doesn't have this property, exclude

        // Normalize filterValues as array
        const filterArray = Array.isArray(filterValues) ? filterValues : [filterValues];

        // Handle relation properties — filter stores page IDs, notes store relation IDs
        if (propSchema?.type === "relation") {
          const relationLimit = propSchema.relationLimit || "multiple";
          const rawIds = getRelationIdsFromValue(noteValue, relationLimit);
          const noteIds = getValidRelationIds(rawIds, propSchema.linkedDatabaseId ? String(propSchema.linkedDatabaseId) : "");
          return noteIds.some((noteId) => filterArray.includes(noteId));
        }

        // Case 1: multi-select or person properties (noteValue is array)
        if (Array.isArray(noteValue)) {
          return noteValue.some((val) => {
            if (typeof val === "object" && val.userId) {
              return filterArray.includes(val.userId);
            }
            return filterArray.includes(val);
          });
        }

        // Case 2: single value properties (string, number, status, etc.)
        if (propSchema && ["text", "email", "url", "phone"].includes(propSchema.type)) {
          const noteStr = String(noteValue).toLowerCase();
          return filterArray.some((fv) => noteStr.includes(String(fv).toLowerCase()));
        }
        if (propSchema?.type === "id") {
          // Sprint IDs are stored as numbers; filter values are strings — compare via String()
          const hasMatch = filterArray.some((fv) => String(noteValue) === String(fv));
          return hasMatch;
        }
        if (propSchema?.type === "number") {
          return filterArray.some((fv) => String(noteValue) === String(fv));
        }
        if (propSchema?.type === "checkbox") {
          return filterArray.some((fv) => String(noteValue) === fv);
        }
        return filterArray.includes(noteValue);
      });
    });
  }, [localNotes, getFilters, board._id, searchQuery[board._id], boardProperties, getNotesByDataSourceId, getDataSource, currentView, getBlock]);

  const currentSelectedTask = useMemo(() => {
    if (!selectedTask) return null;

    // Find the current note data from localNotes
    const foundNote = filteredNotes.find((note) => note._id === selectedTask._id);
    if (foundNote) {
      return foundNote;
    }

    return selectedTask;
  }, [selectedTask, filteredNotes]);

  // Find date properties in the board
  const dateProperties = useMemo(() => {
    return Object.entries(boardProperties)
      .filter(([_, prop]: any) => prop.type === "date")
      .map(([id, prop]: any) => ({ id, name: prop.name }));
  }, [boardProperties]);

  // Get the primary date property (first one found, or create a default)
  const primaryDateProperty = dateProperties[0]?.id || "dueDate";

  const {
    draggedNote,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    isDragging,
    isDropTarget,
  } = useDragDropNotes({
    board,
    notes: filteredNotes,
    setLocalNotes,
    primaryDateProperty,
  });

  // ---------------------------------------------------------------------------
  // Separate range tasks from single-date tasks
  // ---------------------------------------------------------------------------
  const { singleDateNotes, rangeNotes } = useMemo(() => {
    const singleDateNotes: { [key: string]: Block[] } = {};
    const rangeNotes: Block[] = [];

    const filtered = filteredNotes.filter(
      (note) => note.value.pageType === "Viewdatabase_Note" && note.value.databaseProperties?.[primaryDateProperty],
    );

    filtered.forEach((note) => {
      const dateValue = note.value.databaseProperties?.[primaryDateProperty];
      if (!dateValue) return;

      if (typeof dateValue === "string" && dateValue.includes(",")) {
        rangeNotes.push(note);
      } else {
        const dateKey = new Date(dateValue).toDateString();
        if (!singleDateNotes[dateKey]) singleDateNotes[dateKey] = [];
        singleDateNotes[dateKey]!.push(note);
      }
    });

    // Apply sorting to single-date buckets
    const boardSorts = getSortBy(board._id) || [];
    if (boardSorts.length > 0) {
      Object.keys(singleDateNotes).forEach((dateKey) => {
        singleDateNotes[dateKey] = applySorting(singleDateNotes[dateKey]!, boardSorts, boardProperties, {
          getNotesByDataSourceId,
          getDataSource,
        });
      });
    }

    return { singleDateNotes, rangeNotes };
  }, [filteredNotes, primaryDateProperty, getSortBy, board._id, boardProperties]);

  // Keep notesByDate as an alias for backward-compat (drag-drop hook references it indirectly)
  const notesByDate = singleDateNotes;

  // ---------------------------------------------------------------------------
  // Generate calendar days (unchanged)
  // ---------------------------------------------------------------------------
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const endDate = new Date(lastDayOfMonth);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const days: CalendarDay[] = [];
    const today = new Date().toDateString();

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toDateString();
      days.push({
        date: new Date(d),
        isCurrentMonth: d.getMonth() === month,
        isToday: dateKey === today,
        notes: notesByDate[dateKey] || [],
      });
    }

    return days;
  }, [currentDate, notesByDate]);

  // ---------------------------------------------------------------------------
  // Compute per-week range segments for spanning bars
  // ---------------------------------------------------------------------------
  const weekRows = useMemo(() => {
    const rows: { days: CalendarDay[]; segments: RangeSegment[]; maxStackRows: number }[] = [];

    for (let i = 0; i < calendarDays.length; i += 7) {
      const weekDaysSlice = calendarDays.slice(i, i + 7);
      const weekStart = weekDaysSlice[0]!.date;
      const weekEnd = weekDaysSlice[6]!.date;

      const segments: RangeSegment[] = [];

      rangeNotes.forEach((note) => {
        const dateValue = note.value.databaseProperties?.[primaryDateProperty];
        if (!dateValue || typeof dateValue !== "string") return;
        const parts = dateValue.split(",");
        if (parts.length < 2) return;
        const startDateStr = parts[0];
        const endDateStr = parts[1];
        if (!startDateStr || !endDateStr) return;

        const rangeStart = new Date(startDateStr);
        const rangeEnd = new Date(endDateStr);
        if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) return;

        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd.setHours(0, 0, 0, 0);

        // Normalise week bounds
        const ws = new Date(weekStart); ws.setHours(0, 0, 0, 0);
        const we = new Date(weekEnd); we.setHours(0, 0, 0, 0);

        // Skip tasks not overlapping this week
        if (rangeEnd < ws || rangeStart > we) return;

        // Clip to week bounds
        const effectiveStart = rangeStart < ws ? ws : rangeStart;
        const effectiveEnd = rangeEnd > we ? we : rangeEnd;

        // Column index within the week (0–6)
        const colStart = weekDaysSlice.findIndex(
          (d) => d.date.toDateString() === effectiveStart.toDateString()
        );
        const colEnd = weekDaysSlice.findIndex(
          (d) => d.date.toDateString() === effectiveEnd.toDateString()
        );
        if (colStart === -1 || colEnd === -1) return;

        segments.push({
          noteId: note._id,
          note,
          colStart,
          colEnd,
          isStart: rangeStart.toDateString() === effectiveStart.toDateString(),
          isEnd: rangeEnd.toDateString() === effectiveEnd.toDateString(),
          stackRow: 0, // assigned below
        });
      });

      // Greedy interval packing — assign stackRow so bars don't overlap
      // rowOccupied[r] = highest colEnd occupied in row r
      const rowOccupied: number[] = [];
      segments.sort((a, b) => a.colStart - b.colStart);
      segments.forEach((seg) => {
        let row = 0;
        while (rowOccupied[row] !== undefined && rowOccupied[row]! >= seg.colStart) {
          row++;
        }
        seg.stackRow = row;
        rowOccupied[row] = seg.colEnd;
      });

      const maxStackRows = rowOccupied.length;

      rows.push({ days: weekDaysSlice, segments, maxStackRows });
    }

    return rows;
  }, [calendarDays, rangeNotes, primaryDateProperty]);

  // Handle adding new card
  const handleAddNewCard = async (date: Date, title = "") => {
    // Find date property
    const dateProperties = Object.entries(boardProperties || {}).filter(([_, prop]: any) => prop.type === "date");

    const primaryDateProp = dateProperties[0];
    if (!primaryDateProp) {
      console.error("No date property found in board");
      return;
    }

    const [datePropId] = primaryDateProp;
    const dateString = date.toLocaleDateString("en-CA");

    // actual note
    try {
      const currentDataSourceId = getCurrentDataSourceId();
      if (!currentDataSourceId) {
        console.error("No dataSourceId found for current view");
        return;
      }

      // Build databaseProperties object (only if both datePropId and dateString exist, matching old behavior)
      const dateProps = datePropId && dateString ? { [datePropId]: dateString } : {};

      // Merge in filter-derived properties (date property won't be overwritten)
      const databaseProperties = getInitialPropertiesFromFilters(
        getFilters(board._id),
        getAdvancedFilters(board._id),
        boardProperties,
        dateProps,
        workspaceMembers,
        getNotesByDataSourceId,
        getDataSource
      );

      // Generate new block ID
      const newPageId = new ObjectId().toString();

      // Create Block object
      const newBlock: Block = {
        _id: newPageId,
        blockType: "page",
        value: {
          title: title,
          pageType: "Viewdatabase_Note",
          databaseProperties: databaseProperties,
          icon: "",
          coverUrl: null,
          userId: "",
          userEmail: "",
        },
        workareaId: null,
        parentId: currentDataSourceId,
        parentType: "collection",
        workspaceId: board.workspaceId || "",
        status: "alive",
        blockIds: [],
      };

      await addRootPage(newPageId, newBlock, currentDataSourceId, board._id);

      console.log("Created new page for date:", date);
    } catch (err) {
      console.error("Failed to create task for date:", err);
    }
  };

  // edit card
  const handleEditCard = async (noteId: string, newTitle: string) => {
    setLocalNotes((prev) => prev.map((note) =>
      note._id === noteId
        ? { ...note, value: { ...note.value, title: newTitle } }
        : note
    ));

    try {
      await UpdateNote(noteId, newTitle, null);
    } catch (err) {
      console.error("Failed to update task:", err);
      setLocalNotes(notes);
    }
  };

  // delete card
  const handleDeleteNote = async (noteId: string) => {
    // Optimistically remove from local notes
    setLocalNotes((prevNotes) => prevNotes.filter((note) => note._id !== noteId));

    // Close sidebar immediately if this card is open
    if (selectedTask?._id === noteId) {
      setSelectedTask(null);
      setRightSidebarContent(null);
      // Close in board context too
      setCurrentBoardNoteId(null);
    }

    try {
      const res = await DeleteNote(noteId);

      if (res) {
        const currentDsId = getCurrentDataSourceId();
        if (currentDsId) {
          const dataSource = res[currentDsId];
          if (dataSource && dataSource.blockIds) {
            // Filter out the deleted card ID from datasource blockIds
            const updatedBlockIds = dataSource.blockIds.filter((id: string) => id !== noteId);
            updateDataSource(currentDsId, { blockIds: updatedBlockIds });
            console.log("Removed card from datasource blockIds ++ ", updatedBlockIds);
          }
        }
      }

    } catch (err) {
      console.error("Failed to delete task:", err);
      setLocalNotes(notes);
    }
  };

  // update card
  const handleUpdate = async (updatedNote: Block) => {
    if (updatedNote.value.title !== selectedTask?.value.title) {
      await handleEditCard(updatedNote._id, updatedNote.value.title);
    }

    setLocalNotes((prevNotes) => prevNotes.map((note) => (note._id === updatedNote._id ? updatedNote : note)));

    console.log("Updated Task", updatedNote);
    setSelectedTask(updatedNote);
  };

  const updateNoteTitleLocally = (noteId: string, newTitle: string) => {
    // Find note in localNotes to get most up-to-date state
    const existingNote = localNotes.find((n) => n._id === noteId) || selectedTask;
    if (!existingNote) return;

    const updatedNote: Block = {
      ...existingNote,
      value: {
        ...existingNote.value,
        title: newTitle,
      },
    };

    // Update local state for calendar view
    setLocalNotes((prev) => prev.map((note) =>
      note._id === noteId ? updatedNote : note
    ));

    // Update sidebar if this note is open - Sync immediately using current selectedTask state
    if (selectedTask && selectedTask._id === noteId) {
      const updatedTask = {
        ...selectedTask,
        value: { ...selectedTask.value, title: newTitle }
      };
      setSelectedTask(updatedTask);
    }

    // Update global block context for app-wide sync
    const existingBlock = getBlock(noteId);
    if (existingBlock) {
      updateBlock(noteId, {
        value: { ...existingBlock.value, title: newTitle }
      });
    }
  };

  const persistNoteTitleChange = async (noteId: string, newTitle: string) => {
    try {
      await UpdateNote(noteId, newTitle, null);
    } catch (err) {
      console.error("Failed to persist title change:", err);
      // Revert on error
      setLocalNotes(notes);
    }
  };


  return (
    <div className="min-w-[800px] w-full max-w-full h-full bg-white dark:bg-background overflow-x-auto">
      {/* Header */}
      <CalendarHeader currentDate={currentDate} setCurrentDate={setCurrentDate} />

      {/* Calendar Grid */}
      <div className="flex flex-col h-full">
        {/* Week Headers */}
        <div className="grid grid-cols-7">
          {weekDays.map((day) => (
            <div key={day} className="p-4 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="border rounded-lg dark:border-[#343434]">
          {weekRows.map((weekRow, weekIdx) => {
            // Vertical space to reserve at top of each day cell for spanning bars
            const reservedPx = BAR_TOP_OFFSET + weekRow.maxStackRows * BAR_ROW_HEIGHT;

            return (
              <div key={weekIdx} className="relative grid grid-cols-7 divide-x divide-gray-200 dark:divide-[#343434]">

                {/* ── Spanning bar overlay ── */}
                {weekRow.segments.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
                    {weekRow.segments.map((segment) => {
                      const canDrag = isOwner(segment.note.value?.userEmail, true, user);
                      return (
                        <CalendarRangeBar
                          key={`${segment.noteId}-w${weekIdx}`}
                          segment={segment}
                          board={board}
                          onClick={() => handleCardClick(segment.note)}
                          canDrag={canDrag}
                          onDragStart={(e) => handleDragStart(e, segment.note)}
                          onDragEnd={handleDragEnd}
                        />
                      );
                    })}
                  </div>
                )}

                {/* ── Day cells ── */}
                {weekRow.days.map((day, dayIdx) => {
                  const dayString = day.date.toDateString();
                  const isDropTargetDay = isDropTarget(dayString);

                  return (
                    <div
                      key={dayIdx}
                      className={`group relative min-h-32 p-2 border-b transition-all !dark:border-b-[#343434] ${!day.isCurrentMonth ? "bg-gray-100 dark:bg-[#202020]" : "bg-white dark:bg-background"
                        } ${day.isToday ? "bg-blue-100 dark:bg-blue-900/20" : ""}`}
                      onDragOver={(e) => handleDragOver(e, day.date)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, day.date)}
                    >
                      {/* Date Number */}
                      <div className="flex items-center justify-between mb-2 pl-1">
                        <div
                          className={`text-sm font-medium ${day.isToday
                            ? "text-blue-600"
                            : day.isCurrentMonth
                              ? "text-gray-900 dark:text-gray-400"
                              : "text-gray-400 dark:text-gray-400"
                            }`}
                        >
                          {day.date.getDate()}
                        </div>

                        {/* Add button on hover */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddNewCard(day.date);
                          }}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                        >
                          <PlusIcon className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Drop indicator */}
                      {isDropTargetDay && (
                        <div className="absolute inset-0 bg-blue-200/50 dark:bg-gray-800/60 pointer-events-none" />
                      )}

                      {/* Single-date cards — pushed below the bar zone */}
                      <div className="space-y-1" style={{ marginTop: weekRow.maxStackRows > 0 ? `${reservedPx - 32}px` : 0 }}>
                        {day.notes.map((note) => {
                          const noteIsDragging = isDragging(note._id);
                          const userOwnsNote = isOwner(note.value?.userEmail, true, user);

                          return (
                            <div
                              key={note._id}
                              draggable={!noteIsDragging && userOwnsNote}
                              onDragStart={(e) => handleDragStart(e, note)}
                              onDragEnd={handleDragEnd}
                              className={`cursor-move transition-all ${noteIsDragging ? "opacity-50" : ""}`}
                            >
                              <CalendarCard
                                card={note}
                                board={board}
                                onEdit={(newTitle) => handleEditCard(note._id, newTitle)}
                                onDelete={() => handleDeleteNote(note._id)}
                                onClick={handleCardClick}
                                updateNoteTitleLocally={updateNoteTitleLocally}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Sidebar / Center Peek */}
      {currentSelectedTask &&
        typeof document !== "undefined" &&
        createPortal(
          getLayoutSettings(board._id)?.openPagesIn === "center_peek" ? (
            <CenterPeek
              note={currentSelectedTask}
              board={board}
              initialContent={rightSidebarContent}
              onClose={handleCloseSidebar}
              isClosing={isClosing}
              onUpdate={handleUpdate}
              updateNoteTitleLocally={updateNoteTitleLocally}
              persistNoteTitleChange={persistNoteTitleChange}
            />
          ) : (
            <RightSidebar
              note={currentSelectedTask}
              board={board}
              initialContent={rightSidebarContent}
              onClose={handleCloseSidebar}
              isClosing={isClosing}
              onUpdate={handleUpdate}
              updateNoteTitleLocally={updateNoteTitleLocally}
              persistNoteTitleChange={persistNoteTitleChange}
            />
          ),
          document.body
        )}
    </div>
  );
}
