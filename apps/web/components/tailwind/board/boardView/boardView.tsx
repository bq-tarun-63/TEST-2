"use client";

import EllipsisIcon from "@/components/tailwind/ui/icons/ellipsisIcon";
import PlusIcon from "@/components/tailwind/ui/icons/plusIcon";
import { useNoteDragAndDrop } from "@/hooks/use-NoteDragAndDrop";
import useAddRootPage from "@/hooks/use-addRootPage";
import { useDragAndDrop } from "@/hooks/use-dragAndDrop";
import useNoteActions from "@/hooks/use-updateNode";
import { deleteCard, editCard } from "@/services-frontend/boardServices/boardServices";
import type { BoardPropertyOption, DatabaseSource, Note, ViewCollection } from "@/types/board";
import type { JSONContent } from "novel";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Draggable } from "../draggable";
import { NoteDraggable } from "../noteDraggable";
import { useBoard } from "@/contexts/boardContext";
import { handleReorderPropertyOptions } from "@/services-frontend/boardServices/dragAndDropServices";
import useBoardFunctions from "@/hooks/use-board";
import { useNoteContext } from "@/contexts/NoteContext";
import { applySorting } from "@/utils/sortingCard";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import { computeRollupData, getRollupComparableValue } from "@/utils/rollupUtils";
import { applyAdvancedFilters } from "@/utils/advancedFilterUtils";
import { getInitialPropertiesFromFilters } from "@/utils/filterUtils";

import RightSidebar from "../rightSidebar";
import CenterPeek from "../centerPeek";
import BoardCard from "./boardViewCard";
import { getColorStylesWithBadge } from "@/utils/colorStyles";
import { Block, PageType, ParentTable, BlockStatus } from "@/types/block";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { ObjectId } from "bson";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useDragState } from "@/contexts/dragStateContext";
import { isOwner } from "@/services-frontend/user/userServices";
import { toast } from "sonner";

// ---------------- Types ----------------

export type Column = {
  id: string;
  title: string;
  propId: string;
  optionId: string;
  optionName: string;
  optionValue?: any;
  bgColor: string;
  textColor: string;
  badgeColor: string;
  dotColor: string;
  cards: Block[];
  count: number;
};

interface BoardViewProps {
  board: Block;
  datasourcePageBlocks: Block[];
}

// ---------------- BoardView ----------------
export default function BoardView({ board, datasourcePageBlocks: notes }: BoardViewProps) {
  const [selectedTask, setSelectedTask] = useState<Block | null>(null);
  const [newlyCreatedCardId, setNewlyCreatedCardId] = useState<string | null>(null);
  const [rightSidebarContent, setRightSidebarContent] = useState<JSONContent | null>(null);
  const { addRootPage } = useAddRootPage();
  const { UpdateNote, DeleteNote } = useNoteActions();
  const [isClosing, setIsClosing] = useState(false);
  const previousCardIdRef = useRef<string | null>(null);
  const colorAssignments = useRef<Record<string, any>>({});
  const { setCurrentBoardNoteId, getCurrentDataSource, currentDataSource, dataSources, updateDataSource, setDataSource, currentView, getLayoutSettings } = useBoard();
  const { selectedNoteId } = useNoteContext();
  const { getGroupBy, getFilters, getAdvancedFilters, getSortBy, searchQuery, getRelationNoteTitle, getValidRelationIds, getNotesByDataSourceId, getDataSource } = useBoard();
  const { currentWorkspace, workspaceMembers } = useWorkspaceContext();
  const { user } = useAuth();
  const groupByPropertyId = getGroupBy(board._id);
  const { getBlock, updateBlock } = useGlobalBlocks();

  // Board view layout settings
  const layoutSettings = getLayoutSettings(board._id);
  const layoutCardPreview = layoutSettings?.cardPreview || "none";
  const previewType = layoutCardPreview === "cover" ? "page_cover" : layoutCardPreview;
  // Get current dataSourceId from current view ID (not type)
  // IMPORTANT: Always match by view ID first, only use type as fallback
  const getCurrentDataSourceId = (): string | null => {

    const currentViewData = currentView[board._id];

    const latestBoard = getBlock(board._id) || board;
    let view;
    if (currentViewData?.id) {

      // Prioritize ID match - if currentViewData.id exists, ONLY match by ID
      view = latestBoard.value.viewsTypes?.find((vt) => vt._id === currentViewData.id);
    } else if (currentViewData?.type) {
      // Only fallback to type if no ID is available
      view = latestBoard.value.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
    }

    const dsId = view?.databaseSourceId;
    return dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
  };

  // Get properties from current data source - memoize to avoid recreating on every render
  // Depend on actual values instead of functions to prevent infinite loops
  const boardProperties = useMemo(() => {
    const dataSourceId = currentDataSource[board._id];
    if (dataSourceId && dataSources[dataSourceId]) {
      return dataSources[dataSourceId]?.properties || {};
    }
    return {};
  }, [currentDataSource, dataSources, board._id]);

  const { handleCardClick, handleCloseSidebar } = useBoardFunctions({
    board,
    setSelectedTask,
    setRightSidebarContent,
    setIsClosing,
    previousCardIdRef,
  });

  // Find the status property (the one with default: true)
  const statusPropEntry = Object.entries(boardProperties).find(([_, prop]) => prop.type === "status" && prop.default);

  const statusOptions: { id: string; name: string }[] =
    statusPropEntry && Array.isArray(statusPropEntry[1].options) ? statusPropEntry[1].options : [];

  // Build a map for quick lookups
  const statusOrderMap = new Map(statusOptions.map((opt, index) => [opt.name, index]));

  // Helper function to convert option color to CSS colors
  const getColorFromOption = (colorName = "default") => {
    return getColorStylesWithBadge(colorName);
  };

  const getStatusColor = (option: { name: string; color?: string }) => {
    return getColorFromOption(option.color || "default");
  };

  const memberValueToLabel = (val: string) => {
    const member = workspaceMembers?.find((m: any) => m.userId === val || m.userEmail === val || m.userName === val || m.id === val);
    return member?.userName || val;
  };

  const getGroupByProps = () => {
    if (!boardProperties || Object.keys(boardProperties).length === 0) return [];

    //if user has choosen property for grouping
    if (groupByPropertyId && boardProperties[groupByPropertyId]) {
      return [[groupByPropertyId, boardProperties[groupByPropertyId]]];
    }

    //else fallback to default property with default = true
    return Object.entries(boardProperties).filter(([_, prop]: any) => prop.type === "status" && prop.default);
  };

  // Build columns dynamically - memoize to avoid recreating on every render
  const buildColumns = useCallback((board: Block, notes: Block[]): Column[] => {
    // Use boardProperties from current data source
    const props = boardProperties || {};
    if (!props || Object.keys(props).length === 0) return [];

    // Get props to group by using the determined props
    const propsToGroupBy = (() => {
      if (!props || Object.keys(props).length === 0) return [];
      if (groupByPropertyId && props[groupByPropertyId]) {
        return [[groupByPropertyId, props[groupByPropertyId]]];
      }
      return Object.entries(props).filter(([_, prop]: any) => prop.type === "status" && prop.default);
    })();


    if (propsToGroupBy.length === 0) return [];

    const cols: Column[] = [];

    propsToGroupBy.forEach(([propId, prop]: any) => {
      // 1. Fixed Options Grouping (Status, Select, Priority, Multi-select)
      if (Array.isArray(prop.options) && prop.options.length > 0 && ["status", "select", "priority", "multi_select"].includes(prop.type)) {
        prop.options.forEach((opt: any) => {
          const colors = getStatusColor(opt);
          let cards: Block[] = notes
            .filter((n) => n.value.pageType === "Viewdatabase_Note")
            .filter((n) => {
              const val = n.value.databaseProperties?.[propId];
              if (Array.isArray(val)) return val.includes(opt.id);
              return val === opt.id;
            });

          const sorts = getSortBy(board._id);
          if (sorts?.length) {
            cards = applySorting(cards, sorts, props, { getNotesByDataSourceId, getDataSource });
          }

          if (colors) {
            cols.push({
              id: opt.id,
              title: opt.name,
              bgColor: colors.bg,
              textColor: colors.text,
              badgeColor: colors.badge,
              dotColor: colors.dot,
              cards,
              count: cards.length,
              propId,
              optionId: opt.id,
              optionName: opt.name,
              optionValue: opt.id,
            });
          }
        });
      }
      // 2. Dynamic Scanning for Person, Relation, and Multi-select (with no options)
      else if (prop.type === "person" || prop.type === "relation" || prop.type === "multi_select") {
        const uniqueValues: Map<string, any> = new Map();
        const isRelation = prop.type === "relation";
        const relationLimit = prop.relationLimit || "multiple";
        const linkedDatabaseId = prop.linkedDatabaseId;

        notes.forEach((n) => {
          const rawVal = n.value.databaseProperties?.[propId];
          let values: string[] = [];
          if (isRelation) {
            values = getValidRelationIds(getRelationIdsFromValue(rawVal, relationLimit), linkedDatabaseId ? String(linkedDatabaseId) : "");
          } else {
            const arr = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
            arr.forEach((item: any) => {
              const id = typeof item === "object" && item !== null ? (item.userId || item.userEmail || item.id || item._id) : item;
              if (id) values.push(String(id));
            });
          }

          values.forEach(v => {
            if (!uniqueValues.has(v)) {
              if (prop.type === "person") {
                const workMember = workspaceMembers?.find((wm: any) => wm.userId === v || wm.userEmail === v || wm.id === v || wm.userName === v) as any;
                uniqueValues.set(v, {
                  userId: workMember?.userId || v,
                  userName: workMember?.userName || v,
                  userEmail: workMember?.userEmail || v,
                  avatarUrl: workMember?.avatarUrl || null,
                });
              } else {
                uniqueValues.set(v, v);
              }
            }
          });
        });

        uniqueValues.forEach((valObj, valId) => {
          let title = valId;
          if (prop.type === "person") {
            title = valObj.userName || memberValueToLabel(valId);
          } else if (isRelation) {
            title = getRelationNoteTitle(valId, linkedDatabaseId ? String(linkedDatabaseId) : "", "New page");
          }

          let cards = notes.filter((n) => {
            const rawVal = n.value.databaseProperties?.[propId];
            if (isRelation) {
              const ids = getValidRelationIds(getRelationIdsFromValue(rawVal, relationLimit), linkedDatabaseId ? String(linkedDatabaseId) : "");
              return ids.includes(valId);
            }
            const arr = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
            return arr.some((item: any) => {
              const id = typeof item === "object" && item !== null ? (item.userId || item.userEmail || item.id || item._id) : item;
              return String(id) === valId;
            });
          });

          const sorts = getSortBy(board._id);
          if (sorts?.length) {
            cards = applySorting(cards, sorts, props, { getNotesByDataSourceId, getDataSource });
          }

          cols.push({
            id: valId,
            title: title,
            bgColor: isRelation ? "#f0f9ff" : "#f9fafb",
            textColor: isRelation ? "#0c4a6e" : "#111827",
            badgeColor: isRelation ? "#bae6fd" : "#e5e7eb",
            dotColor: isRelation ? "#0284c7" : "#6b7280",
            cards,
            count: cards.length,
            propId,
            optionId: valId,
            optionName: title,
            optionValue: prop.type === "multi_select" ? valId : (prop.type === "person" ? [valObj] : [valId]),
          });
        });
      }
      // 3. Dynamic Scanning for all other types (Text, Number, Date, etc.)
      else {
        const uniqueValues: Map<string, any> = new Map();
        notes.forEach((n) => {
          const val = n.value.databaseProperties?.[propId];
          if (val !== undefined && val !== null && val !== "") {
            uniqueValues.set(String(val), val);
          }
        });

        uniqueValues.forEach((originalVal, keyString) => {
          let cards = notes.filter((n) => String(n.value.databaseProperties?.[propId]) === keyString);
          const sorts = getSortBy(board._id);
          if (sorts?.length) {
            cards = applySorting(cards, sorts, props, { getNotesByDataSourceId, getDataSource });
          }
          cols.push({
            id: keyString,
            title: prop.type === "checkbox" ? (keyString === "true" ? "Checked" : "Unchecked") : keyString,
            bgColor: "#f9fafb",
            textColor: "#111827",
            badgeColor: "#e5e7eb",
            dotColor: "#6b7280",
            cards,
            count: cards.length,
            propId,
            optionId: keyString,
            optionName: keyString,
            optionValue: originalVal,
          });
        });
      }

      // Optional "Unassigned" column
      const unassigned = notes.filter((n) => {
        const val = n.value.databaseProperties?.[propId];
        if (prop.type === "person") {
          const valArr = Array.isArray(val) ? val : (val ? [val] : []);
          return valArr.length === 0;
        }
        if (prop.type === "relation") {
          const relationLimit = prop.relationLimit || "multiple";
          const rawIds = getRelationIdsFromValue(val, relationLimit);
          const ids = getValidRelationIds(rawIds, prop.linkedDatabaseId ? String(prop.linkedDatabaseId) : "");
          return ids.length === 0;
        }
        if (Array.isArray(val)) {
          return val.length === 0;
        }
        if (prop.type === "checkbox" || prop.type === "number") {
          return val === undefined || val === null || val === "";
        }
        return !val;
      });
      // Apply sorting to unassigned cards too
      let sortedUnassigned = unassigned;
      const boardSorts = getSortBy(board._id) || [];
      if (boardSorts.length > 0) {
        sortedUnassigned = applySorting(unassigned, boardSorts, props, {
          getNotesByDataSourceId,
          getDataSource,
        });
      }
      if (sortedUnassigned.length > 0) {
        cols.push({
          id: "unassigned",
          title: prop.type === "person" ? "Unassigned" : prop.type === "relation" ? "No relations" : "Unassigned",
          bgColor: prop.type === "person" ? "#f3f4f6" : prop.type === "relation" ? "#f0f9ff" : "#f1f5f9",
          textColor: prop.type === "person" ? "#111827" : prop.type === "relation" ? "#0c4a6e" : "#475569",
          badgeColor: prop.type === "person" ? "#e5e7eb" : prop.type === "relation" ? "#bae6fd" : "#e2e8f0",
          dotColor: prop.type === "person" ? "#6b7280" : prop.type === "relation" ? "#0284c7" : "#94a3b8",
          cards: sortedUnassigned,
          count: sortedUnassigned.length,
          propId,
          optionId: "unassigned",
          optionName: prop.type === "person" ? "Unassigned Task" : prop.type === "relation" ? "No relations" : "Unassigned",
          optionValue: "",
        });
      }
    });

    return cols.sort((a, b) => (statusOrderMap.get(a.title) ?? 999) - (statusOrderMap.get(b.title) ?? 999));
  }, [boardProperties, groupByPropertyId, getSortBy, board._id, workspaceMembers, getRelationNoteTitle, getValidRelationIds, getNotesByDataSourceId, getDataSource]);

  const filteredNotes = useMemo(() => {
    let result = notes;

    // Apply search query first
    const query = searchQuery[board._id] || "";
    if (query.trim()) {
      const searchLower = query.toLowerCase();
      result = result.filter((note) => {
        const titleMatch = note.value.title.toLowerCase().includes(searchLower);

        return titleMatch;
      });
    }

    // Get current view to access settings
    const currentViewData = currentView[board._id];
    const latestBoard = getBlock(board._id) || board;
    let view;
    if (currentViewData?.id) {
      const currentViewId = typeof currentViewData.id === "string" ? currentViewData.id : String(currentViewData.id);
      view = latestBoard.value.viewsTypes?.find((v) => {
        const viewId = typeof v._id === "string" ? v._id : String(v._id);
        return viewId === currentViewId;
      });
    } else if (currentViewData?.type) {
      view = latestBoard.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
    }

    // Check for advanced filters - apply them first if they exist (separate from regular filters)
    const advancedFilters = getAdvancedFilters(board._id);
    if (advancedFilters.length > 0) {
      // Apply advanced filters using the utility function, then continue with regular filters
      result = applyAdvancedFilters(
        result,
        advancedFilters,
        boardProperties,
        getNotesByDataSourceId,
        getDataSource,
        getValidRelationIds
      );
    }

    // Apply property filters for this specific board (using viewTypeId)
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
          const noteIds = getRelationIdsFromValue(noteValue, relationLimit);
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
  }, [notes, getFilters, board._id, searchQuery[board._id], boardProperties, getNotesByDataSourceId, getDataSource]);

  // Memoize computed columns - depend on actual values, not the function
  const computedColumns = useMemo(() => {
    return buildColumns(board, filteredNotes);
  }, [boardProperties, filteredNotes, groupByPropertyId, getSortBy, board._id]);

  const [columns, setColumns] = useState<Column[]>(computedColumns);
  const boardSorts = getSortBy(board._id);
  const prevDepsRef = useRef({ boardProperties, filteredNotes, groupByPropertyId, boardSorts, boardId: board._id });

  // Sync state with computed columns when dependencies actually change
  useEffect(() => {
    const currentDeps = { boardProperties, filteredNotes, groupByPropertyId, boardSorts, boardId: board._id };
    const prevDeps = prevDepsRef.current;

    // Check if any dependency actually changed
    const hasChanged =
      prevDeps.boardProperties !== currentDeps.boardProperties ||
      prevDeps.filteredNotes !== currentDeps.filteredNotes ||
      prevDeps.groupByPropertyId !== currentDeps.groupByPropertyId ||
      prevDeps.boardSorts !== currentDeps.boardSorts ||
      prevDeps.boardId !== currentDeps.boardId;

    if (hasChanged) {
      prevDepsRef.current = currentDeps;
      setColumns(computedColumns);
    }
  }, [computedColumns, boardProperties, filteredNotes, groupByPropertyId, boardSorts, board._id]);

  const currentSelectedTask = useMemo(() => {
    if (!selectedTask) return null;

    // Find the current note data from columns
    for (const column of columns) {
      const foundNote = column.cards.find((card) => card._id === selectedTask._id);
      if (foundNote) {
        return foundNote;
      }
    }

    return selectedTask;
  }, [selectedTask, columns]);

  const { handleDragStart, handleDragOver, handleDrop, handleDragEnd, draggedItemId, dragOverItemId } = useDragAndDrop(columns, setColumns);

  const { handleNoteDragOver, handleNoteDragStart, handleNoteDragLeave, handleNoteDrop, handleColumnDragOver, handleColumnDragLeave, hoverTarget } =
    useNoteDragAndDrop(columns, setColumns, board);
  const { dragNoteInfo } = useDragState();

  const handleNoteDragStartWrapper = (noteId: string, fromGroupId: string) => {
    const card = getBlock(noteId);
    if (card) {
      const userOwnsNote = isOwner(card.value?.userEmail, true, user);
      if (!userOwnsNote) {
        toast.error("Only the owner can move this page");
        return;
      }
    }
    handleNoteDragStart(noteId, fromGroupId);
  };

  const handleAddPageClick = async (colId: string, title = "") => {
    // Get dataSourceId from context (already tracked and synced)
    const dsId = currentDataSource[board._id] || "";
    const col = columns.find((c) => c.id === colId);

    if (!col) {
      console.error("Column not found for id", colId);
      return;
    }

    // Build databaseProperties from group-by column first (takes precedence)
    const groupByProps: Record<string, any> = col?.propId && (col?.optionValue !== undefined || col?.optionName)
      ? { [col.propId]: col.optionValue !== undefined ? col.optionValue : col.optionName }
      : {};

    // Merge in filter-derived properties (won't overwrite group-by values)
    const boardProperties = getCurrentDataSource(board._id)?.properties || {};
    const databaseProperties = getInitialPropertiesFromFilters(
      getFilters(board._id),
      getAdvancedFilters(board._id),
      boardProperties,
      groupByProps,
      workspaceMembers,
      getNotesByDataSourceId,
      getDataSource
    );

    // Step 1: Create optimistic temp card
    const newPageId = new ObjectId().toString();
    const newBlock: Block = {
      _id: newPageId,
      blockType: "page",
      value: {
        title: title,
        pageType: "Viewdatabase_Note",
        databaseProperties: databaseProperties,
        icon: "",
        coverUrl: null,
        userId: user?.email || "",
        userEmail: user?.email || "",
      },
      workareaId: null,
      parentId: dsId || "",
      parentType: "collection" as ParentTable,
      workspaceId: currentWorkspace?._id || "",
      status: "alive",
      blockIds: []
    };

    // Step 2: Add temp card to UI immediately (optimistic update)
    setColumns((prev) =>
      prev.map((c) =>
        c.id === colId
          ? {
            ...c,
            cards: [...c.cards, newBlock],
            count: c.count + 1,
          }
          : c,
      ),
    );

    // Step 2.5: Mark the newly created page to focus its title automatically
    setNewlyCreatedCardId(newPageId);

    // Step 3: Make API call in background
    try {
      const dataSource = getDataSource(dsId);
      const lastBlockId = dataSource?.blockIds && dataSource.blockIds.length > 0
        ? dataSource.blockIds[dataSource.blockIds.length - 1]
        : null;

      addRootPage(newPageId, newBlock, dsId, board._id, lastBlockId);

      // Step 4: The newPage returned from addRootPage is already a Block, use it directly
      setColumns((prev) =>
        prev.map((c) =>
          c.id === colId
            ? {
              ...c,
              cards: c.cards.map((card) =>
                card._id === newPageId ? newBlock : card
              ),
            }
            : c,
        ),
      );

    } catch (err) {
      console.error("Failed to create task:", err);
      // Rollback: Remove the temp card on error
      setColumns((prev) =>
        prev.map((col) =>
          col.id === colId
            ? {
              ...col,
              cards: col.cards.filter((c) => c._id !== newPageId),
              count: col.count - 1,
            }
            : col,
        ),
      );
    }
  };

  const handleEditCard = async (columnId: string, cardId: string, newTitle: string) => {
    setColumns(editCard(columns, columnId, cardId, newTitle));

    // Update RightSidebar title if this card is selected
    if (selectedTask?._id === cardId) {
      setRightSidebarContent((prev) => prev); // optional, just to trigger re-render
      setSelectedTask((prev) => (prev ? { ...prev, title: newTitle } : prev));
    }

    try {
      // shouldSync: true (default) for final persistence
      UpdateNote(cardId, newTitle, "");
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    // Optimistically remove from column
    setColumns(deleteCard(columns, columnId, cardId));

    // Close sidebar immediately if this card is open
    if (selectedTask?._id === cardId) {
      setSelectedTask(null);
      setRightSidebarContent(null);
      setCurrentBoardNoteId(null);
    }

    try {
      const deleteNote = await DeleteNote(cardId);

      // Remove from the dataSource blockIds array in board context
      if (deleteNote) {
        const currentDsId = getCurrentDataSourceId();
        if (currentDsId) {
          const dataSource = dataSources[currentDsId];
          if (dataSource && dataSource.blockIds) {
            // Filter out the deleted card ID from datasource blockIds
            const updatedBlockIds = dataSource.blockIds.filter((id: string) => id !== cardId);
            updateDataSource(currentDsId, { blockIds: updatedBlockIds });
          }
        }
      }
    } catch (err) {
      console.error("Failed to update task:", err);
      // Ideally rollback here if optimistic update fails
    }
  };

  const handleUpdate = async (updatedNote: Block) => {
    // If title changed → call handleEditCard
    if (updatedNote.value.title !== selectedTask?.value.title) {
      handleEditCard(
        // Find the column this card belongs to
        columns.find((col) => col.cards.some((card) => card._id === updatedNote._id))?.id || "",
        updatedNote._id,
        updatedNote.value.title,
      );
    }
  };

  const handleColumnDrop = async (newColumns: Column[], board: Block) => {
    const newOrder = newColumns.map((c) => c.id);

    try {
      // Use the active grouping property, fallback to default status if none selected
      let activePropId = groupByPropertyId;

      if (!activePropId || !boardProperties?.[activePropId]) {
        // Fallback: find default status propertyId
        activePropId = Object.entries(boardProperties).find(
          ([_, prop]) => prop.type === "status" && prop.default,
        )?.[0];
      }

      if (!activePropId || !boardProperties?.[activePropId]) {
        console.error("No active grouping or default status property found");
        return;
      }

      const activeProp = boardProperties[activePropId];
      if (!activeProp || !Array.isArray(activeProp.options)) {
        console.error("Active grouping property has no options to reorder");
        return;
      }

      const updatedOptions = newOrder
        .map((id) => activeProp.options?.find((opt) => opt.id === id))
        .filter((opt): opt is BoardPropertyOption => Boolean(opt));

      // Get current datasource to update optimistically
      const dataSourceId = currentDataSource[board._id];
      if (!dataSourceId || !dataSources[dataSourceId]) {
        console.error("No datasource found");
        return;
      }

      // 1. Optimistic UI update in global block context
      updateBlock(dataSourceId, {
        value: {
          ...dataSources[dataSourceId],
          properties: {
            ...dataSources[dataSourceId].properties,
            [activePropId]: {
              ...activeProp,
              options: updatedOptions,
            },
          }
        }
      });

      // 2. Optimistic UI update in board context
      updateDataSource(dataSourceId, {
        properties: {
          ...boardProperties,
          [activePropId]: {
            ...activeProp,
            options: updatedOptions,
          },
        },
      });

      // 3. API request
      await handleReorderPropertyOptions(
        board,
        activePropId,
        activeProp.name || "Property",
        updatedOptions,
        getCurrentDataSource
      );
    } catch (error) {
      console.error("Error updating column drop:", error);
      // Fallback UI or toast message can be added here
      toast.error("Failed to reorder columns.");
    }
  };


  const updateNoteTitleLocally = (noteId: string, newTitle: string) => {
    // try {
    //   // shouldSync: false to update local context (sidebar sync) WITHOUT API call
    //   UpdateNote(noteId, newTitle, "", false);
    // } catch (err) {
    //   console.error("Error in updating the note locally ", err);
    // }
    // Only update local state, do not call API here
    // API call should be handled by persistNoteTitleChange or handleEditCard (onBlur/Enter)

    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        cards: col.cards.map((card) =>
          card._id === noteId
            ? { ...card, value: { ...card.value, title: newTitle } }
            : card
        ),
      })),
    );

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
    // Find the columnId of the note
    const column = columns.find((col) => col.cards.some((card) => card._id === noteId));

    if (column) {
      handleEditCard(column.id, noteId, newTitle);
    } else {
      console.warn("Column not found for note", noteId);
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-auto">
      <div className="flex items-start gap-4">
        {columns.map((col) => (
          <React.Fragment key={col.id}>
            <Draggable
              key={col.id}
              id={col.id}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDrop={(droppedColId) => {
                const draggedIndex = columns.findIndex((i: any) => i.id === draggedItemId);
                const targetIndex = columns.findIndex((i: any) => i.id === droppedColId);

                if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
                  // Compute the *new* columns arrangement to send to the server
                  const newColumns = [...columns];
                  const [removed] = newColumns.splice(draggedIndex, 1);
                  if (removed) {
                    newColumns.splice(targetIndex, 0, removed);
                    handleColumnDrop(newColumns, board);
                  }
                }

                // Finally perform array mutation locally strictly for UI updates
                handleDrop(droppedColId);
              }}
              renderHeader={
                <div
                  className="flex items-center px-3 py-2 rounded-t-lg sticky top-0 z-10"
                  style={{ backgroundColor: col.bgColor }}
                >
                  <div
                    className="inline-flex items-center px-2 py-1 rounded-lg text-sm font-medium"
                    style={{ color: col.textColor, background: col.badgeColor }}
                  >
                    <div className="mr-1 h-2 w-2 rounded-full" style={{ backgroundColor: col.dotColor }} />
                    {col.title}
                  </div>
                  <span className="ml-2 text-sm" style={{ color: col.dotColor }}>
                    {col.cards.length}
                  </span>

                  {/* TOP ACTIONS on each group */}
                  <div className="ml-auto flex items-center space-x-1">
                    <button className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors">
                      <EllipsisIcon fill={col.dotColor} className="mr-2 h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleAddPageClick(col.id)}
                      className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                    >
                      <PlusIcon fill={col.dotColor} className="mr-2 h-4 w-4" />
                    </button>
                  </div>
                </div>
              }
            >
              <div
                key={col.id}
                className="relative flex flex-col rounded-b-lg border border-t-0 w-64 shadow-sm dark:border-[rgb(42,42,42)]"
                style={{ backgroundColor: col.bgColor }}
              >

                {/* Cards */}
                <div
                  className="flex flex-col gap-2 px-3 py-2"
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.types.includes("application/x-board-property-row")) return;
                    const target = e.target as HTMLElement;
                    const isOverCard = target.closest('[draggable="true"]');
                    if (!isOverCard) {
                      handleColumnDragOver(col.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    // Only clear if leaving the column entirely (not just moving to a child)
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      handleColumnDragLeave();
                    }
                  }}
                  onDrop={(e) => {
                    if (e.dataTransfer.types.includes("application/x-board-property-row")) return;
                    if (!hoverTarget?.noteId) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleNoteDrop(e, col.id);
                    }
                  }}
                >
                  {col.cards.map((card, idx) => {
                    const userOwnsNote = isOwner(card.value?.userEmail, true, user);

                    return (
                      <NoteDraggable
                        key={card._id ?? card._id ?? `temp-${idx}`}
                        noteId={card._id}
                        columnId={col.id}
                        onDragStart={handleNoteDragStartWrapper}
                        onDragOver={handleNoteDragOver}
                        onDragLeave={handleNoteDragLeave}
                        onDrop={(e) => handleNoteDrop(e, col.id)}
                        dataSourceId={getCurrentDataSourceId() || undefined}
                        sourceBlockIds={getCurrentDataSourceId() ? getDataSource(getCurrentDataSourceId()!)?.blockIds : undefined}
                        hoverTarget={hoverTarget}
                        isDraggable={userOwnsNote}
                      >
                        <div
                          key={card._id ?? card._id ?? `temp-${idx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardClick(card);
                          }}
                          className={dragNoteInfo?.noteId === card._id && dragNoteInfo?.columnId === col.id ? "opacity-50" : ""}
                        >
                          <BoardCard
                            card={card}
                            board={board}
                            autoFocusTitle={newlyCreatedCardId === card._id}
                            onEdit={(newTitle) => {
                              if (newlyCreatedCardId === card._id) setNewlyCreatedCardId(null);
                              handleEditCard(col.id, card._id, newTitle);
                            }}
                            onDelete={() => handleDeleteCard(col.id, card._id)}
                            onOpenSidebar={async (card) => {
                              handleCardClick(card);
                              setCurrentBoardNoteId(card._id);
                            }}
                            updateNoteTitleLocally={updateNoteTitleLocally}
                            columnColors={{
                              dotColor: col.dotColor,
                              textColor: col.textColor,
                              bgColor: col.bgColor,
                              badgeColor: col.badgeColor,
                            }}
                            previewType={previewType}
                          />
                        </div>
                      </NoteDraggable>
                    );
                  })}
                  {/* 👇 Optional placeholder when column is empty */}
                  {/* {col.cards.length === 0 && (
                      <div className="p-4 text-sm text-gray-400 border border-dashed rounded">
                        Drop here
                      </div>
                    )} */}
                  {/* Add new card */}
                  <button
                    onClick={() => handleAddPageClick(col.id)}
                    className="inline-flex items-center h-8 px-2 rounded-lg text-sm hover:bg-muted transition-colors"
                    style={{ color: col.dotColor }}
                  >
                    <PlusIcon className="mr-2 h-4 w-4" fill={col.dotColor} />
                    New page
                  </button>
                </div>
              </div>
            </Draggable>
          </React.Fragment>
        ))}
      </div>
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
