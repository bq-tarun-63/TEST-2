"use client";

import { useBoard } from "@/contexts/boardContext";
import useAddRootPage from "@/hooks/use-addRootPage";
import useBoardFunctions from "@/hooks/use-board";
import useNoteActions from "@/hooks/use-updateNode";
import { applySorting } from "@/utils/sortingCard";
import { computeRollupData, getRollupComparableValue } from "@/utils/rollupUtils";
import { applyAdvancedFilters } from "@/utils/advancedFilterUtils";
import { getInitialPropertiesFromFilters } from "@/utils/filterUtils";
import type { JSONContent } from "novel";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import RightSidebar from "../rightSidebar";
import CenterPeek from "../centerPeek";
import GalleryCard from "./galleryCard";
import GalleryGrid from "./galleryGrid";
import GalleryGroup from "./galleryGroup";
import type { PropertySchema } from "@/models/types/DatabaseSource";
import PlusIcon from "@/components/tailwind/ui/icons/plusIcon";
import { Block, ParentTable } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useAuth } from "@/hooks/use-auth";
import { ObjectId } from "bson";
import { getColorStylesWithBadge } from "@/utils/colorStyles";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import { useRowDragDrop } from "@/hooks/use-row-drag-drop";

interface GalleryViewProps {
  board: Block;
  notes: Block[];
}

export type GalleryColumn = {
  id: string;
  title: string;
  propId: string;
  optionId: string;
  optionName: string;
  groupType: string;
  bgColor?: string;
  textColor?: string;
  dotColor?: string;
  cards: Block[];
  count: number;
  optionValue?: any;
};

export default function GalleryView({ board, notes }: GalleryViewProps) {
  const [selectedTask, setSelectedTask] = useState<Block | null>(null);
  const [rightSidebarContent, setRightSidebarContent] = useState<JSONContent | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const previousCardIdRef = useRef<string | null>(null);
  const { addRootPage } = useAddRootPage();
  const [localNotes, setLocalNotes] = useState<Block[]>(notes);
  const { UpdateNote, DeleteNote } = useNoteActions();
  const {
    getFilters,
    getAdvancedFilters,
    getSortBy,
    getGroupBy,
    searchQuery,
    currentView,
    getNotesByDataSourceId,
    getDataSource,
    propertyOrder,
    getPropertyVisibility,
    currentDataSource,
    dataSources,
    updateDataSource,
    getRelationNoteTitle,
    getValidRelationIds,
    setCurrentBoardNoteId,
    getLayoutSettings,
  } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();
  const { currentWorkspace, workspaceMembers } = useWorkspaceContext();
  const { user } = useAuth();

  const groupByPropertyId = getGroupBy(board._id);

  // Get current dataSourceId from current view ID (not type)
  const getCurrentDataSourceId = (): string | null => {
    const currentViewData = currentView[board._id];
    const latestBoard = getBlock(board._id) || board;

    let view;
    if (currentViewData?.id) {
      view = latestBoard.value.viewsTypes?.find((vt) => vt._id === currentViewData.id);
    } else if (currentViewData?.type) {
      view = latestBoard.value.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
    }

    const dsId = view?.databaseSourceId;
    return dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
  };

  // Get properties from current data source
  const boardProperties = useMemo(() => {
    const dataSourceId = currentDataSource[board._id];
    if (dataSourceId && dataSources[dataSourceId]) {
      return dataSources[dataSourceId]?.properties || {};
    }
    return {};
  }, [currentDataSource, dataSources, board._id]);

  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

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

    // Check for advanced filters
    const advancedFilters = getAdvancedFilters(board._id);
    if (advancedFilters.length > 0) {
      result = applyAdvancedFilters(
        result,
        advancedFilters,
        boardProperties,
        getNotesByDataSourceId,
        getDataSource,
        getValidRelationIds
      );
    }

    // Apply property filters
    const boardFilters = getFilters(board._id);
    if (!boardFilters || Object.keys(boardFilters).length === 0) return result;

    return result.filter((note) => {
      const noteProps = note.value.databaseProperties || {};

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
            return false;
          }

          const filterArray = Array.isArray(filterValues) ? filterValues : [filterValues];
          return filterArray.some((fv) => String(rollupValue) === String(fv));
        }

        const noteValue = noteProps[propId];

        if (noteValue === undefined || noteValue === null) {
          return filterValues.length === 0 || filterValues.includes("");
        }

        // Handle relation properties — filter stores page IDs, notes store relation IDs
        if (propSchema?.type === "relation") {
          const relationLimit = propSchema.relationLimit || "multiple";
          const noteIds = getRelationIdsFromValue(noteValue, relationLimit);
          return noteIds.some((noteId) => filterValues.includes(noteId));
        }

        if (Array.isArray(noteValue)) {
          return noteValue.some((val) => {
            if (typeof val === "object" && val !== null) {
              const vId = val.userId || val.userEmail || val.id;
              if (vId) return filterValues.includes(vId);
            }
            return filterValues.includes(val);
          });
        }

        // For text-like types, use contains matching; for number, coerce to string
        if (propSchema && ["text", "email", "url", "phone"].includes(propSchema.type)) {
          const noteStr = String(noteValue).toLowerCase();
          return filterValues.some((fv) => noteStr.includes(String(fv).toLowerCase()));
        }
        if (propSchema?.type === "id") {
          // Sprint IDs are stored as numbers; filter values are strings — compare via String()
          const hasMatch = filterValues.some((fv) => String(noteValue) === String(fv));
          return hasMatch;
        }
        if (propSchema?.type === "number") {
          return filterValues.some((fv) => String(noteValue) === String(fv));
        }
        if (propSchema?.type === "checkbox") {
          return filterValues.some((fv) => String(noteValue) === fv);
        }
        return filterValues.includes(String(noteValue));
      });
    });
  }, [
    localNotes,
    searchQuery,
    board._id,
    getAdvancedFilters,
    getFilters,
    boardProperties,
    getNotesByDataSourceId,
    getDataSource,
  ]);

  // Apply sorting
  const sortedNotes = useMemo(() => {
    const sortBy = getSortBy(board._id);
    if (!sortBy || sortBy.length === 0) return filteredNotes;

    return applySorting(
      filteredNotes,
      sortBy,
      boardProperties as Record<string, any>,
      {
        getNotesByDataSourceId,
        getDataSource,
      }
    );
  }, [filteredNotes, getSortBy, board._id, boardProperties, getNotesByDataSourceId, getDataSource]);

  // Drag and drop - same as list view
  const {
    draggedNoteId,
    dragOverNoteId,
    dragPosition,
    handleRowDragStart,
    handleRowDragEnd,
    handleRowDragOver,
    handleRowDragLeave,
    handleRowDrop,
  } = useRowDragDrop({
    filteredNotes: sortedNotes,
    setLocalNotes,
    boardId: board._id,
    getSortBy,
  });

  const memberValueToLabel = (val: string) => {
    const member = workspaceMembers?.find((m: any) => m.userId === val || m.userEmail === val || m.userName === val || m.id === val);
    return member?.userName || val;
  };

  // Build columns dynamically for grouping
  const buildColumns = useCallback((notes: Block[]): GalleryColumn[] => {
    const props = boardProperties || {};
    if (!props || Object.keys(props).length === 0) return [];

    const propsToGroupBy = (() => {
      if (!props || Object.keys(props).length === 0) return [];
      if (groupByPropertyId && props[groupByPropertyId]) {
        return [[groupByPropertyId, props[groupByPropertyId]]];
      }
      return Object.entries(props).filter(([_, prop]: any) => prop.type === "status" && prop.default);
    })();

    if (propsToGroupBy.length === 0) return [];

    const cols: GalleryColumn[] = [];
    propsToGroupBy.forEach(([pId, p]: any) => {
      const gType = p.type;
      // 1. Fixed Options Grouping (Status, Select, Priority, Multi-select)
      if (Array.isArray(p.options) && p.options.length > 0 && ["status", "select", "priority", "multi_select"].includes(gType)) {
        p.options.forEach((opt: any) => {
          const colors = getColorStylesWithBadge(opt.color || "default");
          let cards = notes.filter((n) => {
            const val = n.value.databaseProperties?.[pId];
            if (Array.isArray(val)) return val.includes(opt.id);
            return val === opt.id;
          });

          if (getSortBy(board._id)?.length) {
            cards = applySorting(cards, getSortBy(board._id)!, props, { getNotesByDataSourceId, getDataSource });
          }

          cols.push({
            id: opt.id,
            title: opt.name,
            bgColor: colors.bg,
            textColor: colors.text,
            dotColor: colors.dot,
            cards,
            count: cards.length,
            propId: pId,
            optionId: opt.id,
            optionName: opt.name,
            groupType: gType,
          });
        });
      }
      // 2. Dynamic Scanning for Person, Relation, and Multi-select (with no options)
      else if (gType === "person" || gType === "relation" || gType === "multi_select") {
        const uniqueValues: Map<string, any> = new Map();
        const isRelation = gType === "relation";
        const relationLimit = p.relationLimit || "multiple";
        const linkedDatabaseId = p.linkedDatabaseId;

        notes.forEach((n) => {
          const rawVal = n.value.databaseProperties?.[pId];
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
              if (gType === "person") {
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
          if (gType === "person") {
            title = valObj.userName || memberValueToLabel(valId);
          } else if (isRelation) {
            title = getRelationNoteTitle(valId, linkedDatabaseId ? String(linkedDatabaseId) : "", "New page");
          }

          let cards = notes.filter((n) => {
            const rawVal = n.value.databaseProperties?.[pId];
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

          if (getSortBy(board._id)?.length) {
            cards = applySorting(cards, getSortBy(board._id)!, props, { getNotesByDataSourceId, getDataSource });
          }

          cols.push({
            id: valId,
            title: title,
            cards,
            count: cards.length,
            propId: pId,
            optionId: valId,
            optionName: title,
            groupType: gType,
            optionValue: gType === "multi_select" ? valId : (gType === "person" ? [valObj] : [valId]),
          });
        });
      }
      // 3. Dynamic Scanning for all other types (Text, Number, Date, etc.)
      else {
        const uniqueValues: Map<string, any> = new Map();
        notes.forEach((n) => {
          const val = n.value.databaseProperties?.[pId];
          if (val !== undefined && val !== null && val !== "") {
            uniqueValues.set(String(val), val);
          }
        });

        uniqueValues.forEach((originalVal, keyString) => {
          let cards = notes.filter((n) => String(n.value.databaseProperties?.[pId]) === keyString);

          if (getSortBy(board._id)?.length) {
            cards = applySorting(cards, getSortBy(board._id)!, props, { getNotesByDataSourceId, getDataSource });
          }

          cols.push({
            id: keyString,
            title: gType === "checkbox" ? (keyString === "true" ? "Checked" : "Unchecked") : keyString,
            bgColor: "#f9fafb",
            textColor: "#111827",
            dotColor: "#6b7280",
            cards,
            count: cards.length,
            propId: pId,
            optionId: keyString,
            optionName: keyString,
            optionValue: originalVal,
            groupType: gType,
          });
        });
      }

      // Add Unassigned column if there are unassigned notes
      let unassignedNotes = notes.filter((n) => {
        const val = n.value.databaseProperties?.[pId];
        if (gType === "person") {
          const valArr = Array.isArray(val) ? val : (val ? [val] : []);
          return valArr.length === 0;
        }
        if (gType === "relation") {
          const rawIds = getRelationIdsFromValue(val, p.relationLimit);
          const ids = getValidRelationIds(rawIds, p.linkedDatabaseId ? String(p.linkedDatabaseId) : "");
          return ids.length === 0;
        }
        if (gType === "checkbox" || gType === "number") return val === undefined || val === null || val === "";
        return !val;
      });

      if (getSortBy(board._id)?.length && unassignedNotes.length > 0) {
        unassignedNotes = applySorting(unassignedNotes, getSortBy(board._id)!, props, { getNotesByDataSourceId, getDataSource });
      }

      if (unassignedNotes.length > 0) {
        cols.push({
          id: "unassigned",
          title: "No " + (p.name || "Group"),
          cards: unassignedNotes,
          count: unassignedNotes.length,
          propId: pId as string,
          optionId: "unassigned",
          optionName: "",
          groupType: gType,
        });
      }
    });

    return cols;
  }, [boardProperties, groupByPropertyId, getRelationNoteTitle, getSortBy, board._id, getNotesByDataSourceId, getDataSource]);

  const columns = useMemo(() => buildColumns(sortedNotes), [buildColumns, sortedNotes]);

  // Get visible properties
  const visiblePropertyIds = getPropertyVisibility(board._id) || [];
  const order = propertyOrder[board._id] || [];

  const handleAddPage = async (groupInfo?: { propId: string; value: any; type: string; id: string }) => {
    const dataSourceId = currentDataSource[board._id];
    if (!dataSourceId) return;

    const title = "New page";
    const tempId = new ObjectId().toString();

    const databaseProperties: Record<string, any> = {};
    if (groupInfo && groupInfo.id !== "unassigned") {
      if (groupInfo.type === "person") {
        databaseProperties[groupInfo.propId] = [{ userId: groupInfo.id, userName: groupInfo.value }];
      } else if (groupInfo.type === "relation") {
        databaseProperties[groupInfo.propId] = [groupInfo.id];
      } else {
        databaseProperties[groupInfo.propId] = groupInfo.value;
      }
    }

    // Merge in filter-derived properties (group-by values already set above won't be overwritten)
    const mergedProps = getInitialPropertiesFromFilters(
      getFilters(board._id),
      getAdvancedFilters(board._id),
      boardProperties,
      databaseProperties,
      workspaceMembers,
      getNotesByDataSourceId,
      getDataSource
    );
    // mergedProps already contains databaseProperties + new filter props
    // Update the object in place so it's used below
    Object.keys(mergedProps).forEach((key) => {
      if (databaseProperties[key] === undefined) {
        databaseProperties[key] = mergedProps[key];
      }
    });

    // Create optimistic block
    const optimisticNote: Block = {
      _id: tempId,
      blockType: "page",
      value: {
        title,
        pageType: "Viewdatabase_Note",
        databaseProperties,
        icon: "",
        coverUrl: null,
        userId: user?.email || "",
        userEmail: user?.email || "",
      },
      workareaId: null,
      parentId: dataSourceId,
      parentType: "collection" as ParentTable,
      workspaceId: currentWorkspace?._id || "",
      status: "alive",
      blockIds: []
    };

    // Add optimistic note locally
    setLocalNotes((prev) => [...prev, optimisticNote]);

    try {
      await addRootPage(tempId, optimisticNote, dataSourceId, board._id);
    } catch (error) {
      console.error("Failed to add page:", error);
      // Rollback optimistic note on error
      setLocalNotes((prev) => prev.filter((note) => note._id !== tempId));
    }
  };

  const handleEditCard = async (cardId: string, newTitle: string) => {
    const card = localNotes.find((n) => n._id === cardId);
    if (!card) return;

    const updatedCard = {
      ...card,
      value: { ...card.value, title: newTitle }
    };
    setLocalNotes(localNotes.map((n) => (n._id === cardId ? updatedCard : n)));

    try {
      await UpdateNote(cardId, newTitle, "");
    } catch (error) {
      console.error("Failed to update card:", error);
      setLocalNotes(notes);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    const card = localNotes.find((n) => n._id === cardId);
    if (!card) return;

    // Optimistically remove from local notes
    setLocalNotes(localNotes.filter((n) => n._id !== cardId));

    // Close sidebar immediately if this card is open
    if (selectedTask?._id === cardId) {
      setSelectedTask(null);
      setRightSidebarContent(null);
      // Close in board context too - need to make sure setCurrentBoardNoteId is destructured from useBoard()
      setCurrentBoardNoteId(null);
    }

    try {
      const deleteResult = await DeleteNote(cardId);
      if (deleteResult) {
        const currentDsId = getCurrentDataSourceId();
        if (currentDsId) {
          const dataSource = dataSources[currentDsId];
          if (dataSource && dataSource.blockIds) {
            const updatedBlockIds = dataSource.blockIds.filter((id: string) => id !== cardId);
            updateDataSource(currentDsId, { blockIds: updatedBlockIds });
          }
        }
      }
    } catch (error) {
      console.error("Failed to delete card:", error);
      setLocalNotes(notes);
    }
  };

  const handleUpdateNote = async (updatedNote: Block) => {
    setLocalNotes(localNotes.map((n) => (n._id === updatedNote._id ? updatedNote : n)));
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

    // Update local state for gallery view
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

  // Group UI state
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  // Gallery view settings
  const layoutSettings = getLayoutSettings(board._id);
  const layoutCardPreview = layoutSettings?.cardPreview || "page_content";
  const previewType = layoutCardPreview === "cover" ? "page_cover" : layoutCardPreview;
  const fitImage = false; // Can be made configurable

  const currentSelectedTask = useMemo(() => {
    if (!selectedTask) return null;

    // Find the current note data from filtered notes or localNotes
    const foundNote = localNotes.find((note) => note._id === selectedTask._id);
    if (foundNote) {
      return foundNote;
    }

    return selectedTask;
  }, [selectedTask, localNotes]);

  return (
    <div className="w-full">
      {groupByPropertyId && columns.length > 0 ? (
        /* Grouped View */
        <div className="flex flex-col gap-6">
          {columns.map((col) => (
            <GalleryGroup
              key={col.id}
              title={col.title}
              cards={col.cards}
              board={board}
              boardProperties={boardProperties as Record<string, PropertySchema>}
              visiblePropertyIds={visiblePropertyIds}
              propertyOrder={order}
              previewType={previewType}
              fitImage={fitImage}
              onEditCard={handleEditCard}
              onDeleteCard={handleDeleteCard}
              onOpenSidebar={handleCardClick}
              updateNoteTitleLocally={updateNoteTitleLocally}
              onAddPage={() =>
                handleAddPage({
                  propId: col.propId,
                  value: col.groupType === "person" ? col.optionName : col.optionId,
                  type: col.groupType,
                  id: col.id,
                })
              }
              dotColor={col.dotColor}
              textColor={col.textColor}
              bgColor={col.bgColor}
              collapsed={collapsedGroups[col.title]}
              onToggleCollapse={() => toggleGroupCollapse(col.title)}
              // Drag and drop props
              draggedNoteId={draggedNoteId}
              dragOverNoteId={dragOverNoteId}
              dragPosition={dragPosition}
              onDragStart={handleRowDragStart}
              onDragEnd={handleRowDragEnd}
              onDragOver={handleRowDragOver}
              onDragLeave={handleRowDragLeave}
              onDrop={handleRowDrop}
              groupValue={col.groupType === "person" ? col.optionName : col.optionId}
            />
          ))}
        </div>
      ) : (
        /* Ungrouped View (Default) */
        <GalleryGrid>
          {
            sortedNotes.map((note) => {
              const isDragging = draggedNoteId === note._id;
              const isDropTarget = dragOverNoteId === note._id;

              return (
                <GalleryCard
                  key={note._id}
                  card={note}
                  board={board}
                  boardProperties={boardProperties as Record<string, PropertySchema>}
                  visiblePropertyIds={visiblePropertyIds}
                  propertyOrder={order}
                  previewType={previewType}
                  fitImage={fitImage}
                  onEdit={(newTitle) => handleEditCard(note._id, newTitle)}
                  onDelete={() => handleDeleteCard(note._id)}
                  onOpenSidebar={handleCardClick}
                  updateNoteTitleLocally={updateNoteTitleLocally}
                  // Drag and drop
                  draggable
                  isDragging={isDragging}
                  isDropTarget={isDropTarget}
                  dragPosition={dragPosition}
                  onDragStart={(e) => handleRowDragStart(e, note._id)}
                  onDragEnd={handleRowDragEnd}
                  onDragOver={(e) => handleRowDragOver(e, note._id)}
                  onDragLeave={handleRowDragLeave}
                  onDrop={(e) => handleRowDrop(e, note._id)}
                />
              );
            })
          }

          {/* Add New Page Button */}
          <div className="flex flex-col h-full rounded-lg border bg-background shadow-sm cursor-pointer overflow-hidden transition-colors hover:bg-accent/50">
            <button
              onClick={() => handleAddPage()}
              className="flex items-center justify-center h-full w-full gap-1.5 text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="text-sm font-medium">New page</span>
            </button>
          </div>
        </GalleryGrid>
      )}

      {/* Right Sidebar / Center Peek */}
      {currentSelectedTask &&
        typeof document !== "undefined" &&
        createPortal(
          getLayoutSettings(board._id)?.openPagesIn === "center_peek" ? (
            <CenterPeek
              note={currentSelectedTask}
              initialContent={rightSidebarContent}
              board={board}
              onClose={handleCloseSidebar}
              isClosing={isClosing}
              onUpdate={(updatedNote) => {
                setSelectedTask(updatedNote);
                handleUpdateNote(updatedNote);
              }}
              updateNoteTitleLocally={updateNoteTitleLocally}
              persistNoteTitleChange={persistNoteTitleChange}
            />
          ) : (
            <RightSidebar
              note={currentSelectedTask}
              initialContent={rightSidebarContent}
              board={board}
              onClose={handleCloseSidebar}
              isClosing={isClosing}
              onUpdate={(updatedNote) => {
                setSelectedTask(updatedNote);
                handleUpdateNote(updatedNote);
              }}
              updateNoteTitleLocally={updateNoteTitleLocally}
              persistNoteTitleChange={persistNoteTitleChange}
            />
          ),
          document.body
        )}
    </div>
  );
}
