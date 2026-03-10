"use client";
import { useBoard } from "@/contexts/boardContext";
import useAddRootPage from "@/hooks/use-addRootPage";
import useBoardFunctions from "@/hooks/use-board";
import { Calendar, CheckSquare, Flag, Type, User, Plus, ChevronRight, Calculator, ListChecks, Tag, Star, FileText, GitPullRequest, Mail, Link, Phone, Paperclip, Download, Hash, Clock } from "lucide-react";
import { formatFormulaValue } from "@/utils/formatFormulaValue";
import { formatNumericValue } from "@/utils/formatNumericValue";
import { normalizeGitHubPrValue, getGitHubPrStatusMeta } from "@/utils/githubPr";
import type { JSONContent } from "novel";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GroupSection from "./GroupSection";
import MainHeaderRow from "./MainHeaderRow";
import RightSidebar from "../rightSidebar";
import CenterPeek from "../centerPeek";
import GroupActionBar from "./GroupActionBar";
import { useGroupEditing } from "../../../../services-frontend/boardServices/useGroupEditing";
import { applySorting } from "@/utils/sortingCard";
import { AddPropertyDialog } from "../addPropertyDialog";
import { useDatabaseProperties } from "@/hooks/use-viewProperty";
import { useRowDragDrop } from "@/hooks/use-row-drag-drop";
import CellEditor from "../cellEditors/CellEditor";
import { canEditProperty } from "../cellEditors/CellEditorRegistry";
import type { EditingCell } from "@/types/cellEditor";
import { postWithAuth } from "@/lib/api-helpers";
import { toast } from "sonner";
import DeleteConfirmationModal from "@/components/tailwind/ui/deleteConfirmationModal";
import { getColorStyles } from "@/utils/colorStyles";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import { computeRollupData, getRollupComparableValue } from "@/utils/rollupUtils";
import { applyAdvancedFilters } from "@/utils/advancedFilterUtils";
import { getInitialPropertiesFromFilters } from "@/utils/filterUtils";

import PropertyHeaderDropdown from "../PropertyHeaderDropdown";
import EditSinglePropertyModal from "../editSinglePropertyModal";
import { createHandlers } from "./listViewHandlers";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import useNoteActions from "@/hooks/use-updateNode";
import { RelationViewSelector } from "../properties/inputs/relationViewSelector";
import { RelationConfigModal } from "@/components/tailwind/ui/modals/relationConfigModal";
import { getWithAuth } from "@/lib/api-helpers";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { ObjectId } from "bson";
import { useAuth } from "@/hooks/use-auth";
import { isOwner } from "@/services-frontend/user/userServices";
import { updateGroupByPropertyId, updateSorts, updateFilters } from "@/services-frontend/boardServices/databaseSettingsService";
import { generatePropertyId } from "@/lib/propertyIdGenerator";
import { DatabaseSource, BoardProperty } from "@/types/board";
import { formatDate } from "@/lib/utils";
interface ListViewProps {
  readonly board: Block;
  readonly notes: Block[];
}

interface PropertyColumn {
  id: string;
  name: string;
  type: string;
  width: number;
  icon: React.ReactNode;
}

export default function ListView({ board, notes }: ListViewProps) {
  // CSS for dynamic column widths
  const getColumnStyle = (width: number) => ({ width: `${width}px` });
  const [selectedTask, setSelectedTask] = useState<Block | null>(null);
  const [rightSidebarContent, setRightSidebarContent] = useState<JSONContent | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowTitle, setNewRowTitle] = useState("");
  const [showPropertyDialog, setShowPropertyDialog] = useState(false);
  const [propertyDialogPosition, setPropertyDialogPosition] = useState({ top: 0, left: 0 });
  const [insertionTarget, setInsertionTarget] = useState<{ targetPropertyId: string; side: 'left' | 'right'; anchorElement?: HTMLElement } | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [propertyHeaderDropdown, setPropertyHeaderDropdown] = useState<{ propertyId: string; anchorElement: HTMLElement; } | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const previousCardIdRef = useRef<string | null>(null);
  const addPropertyBtnRef = useRef<HTMLButtonElement>(null);
  const { addRootPage } = useAddRootPage();

  // Relation property state
  const [showRelationViewSelector, setShowRelationViewSelector] = useState(false);
  const [relationDataSources, setRelationDataSources] = useState<any[]>([]);
  const [loadingRelationViews, setLoadingRelationViews] = useState(false);
  const [showRelationConfigModal, setShowRelationConfigModal] = useState(false);
  const [isRelationLoading, setIsRelationLoading] = useState(false);
  const [pendingRelationData, setPendingRelationData] = useState<{ dataSourceId: string; dataSourceTitle: string; databaseSourceId: string; } | null>(null);
  const { getFilters, getAdvancedFilters, propertyOrder, setPropertyOrder, getSortBy, setBoardSortBy, getGroupBy, setGroupBy, searchQuery, setBoardFilters, getCurrentDataSourceProperties, currentView, currentDataSource, getPropertyVisibility, dataSources, getRelationNoteTitle, getValidRelationIds, getNotesByDataSourceId, getDataSource, getLayoutSettings } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();
  const [localNotes, setLocalNotes] = useState<Block[]>(notes);

  // Get visible property IDs from settings (propertyVisibility) - call immediately after hooks
  const visiblePropertyIds = getPropertyVisibility(board._id) || [];
  const shouldShowAllProperties = false;

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
    return dsId || null;
  };

  // Get properties from current data source - make it reactive to dataSources changes
  const boardProperties = useMemo(() => {
    return getCurrentDataSourceProperties(board._id);
  }, [getCurrentDataSourceProperties, board._id, dataSources]);

  const groupEditing = useGroupEditing({
    boardId: board._id, localNotes, setLocalNotes,
    onNoteDeleted: (noteIdsToDelete) => {
      // Close sidebar if selected task is being deleted
      if (selectedTask && noteIdsToDelete.includes(selectedTask._id)) {
        setSelectedTask(null);
        setRightSidebarContent(null);
      }
      setEditingCell(null);
    },
  });

  const { selectedNotes, setSelectedNotes, groupEditingPropertyId, handleSelectNote, handleSelectAll, openGroupEditor, applyGroupUpdate, clearGroupEditing, requestDeleteSelected, confirmDeleteSelected, cancelDelete, showDeleteConfirm, isDeleting, pendingDeletion, } = groupEditing;

  const { workspaceMembers, currentWorkspace } = useWorkspaceContext();
  const { user } = useAuth();
  // Column resize state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ propertyId: string; startX: number; startWidth: number } | null>(null);

  const handleColumnResizeMouseDown = (e: React.MouseEvent, propertyId: string, baseWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = baseWidth;
    resizingRef.current = { propertyId, startX, startWidth };

    const onMouseMove = (ev: MouseEvent) => {
      const state = resizingRef.current;
      if (!state) return;
      const dx = ev.clientX - state.startX;
      const newWidth = Math.min(600, Math.max(80, state.startWidth + dx));
      setColumnWidths((prev) => ({ ...prev, [propertyId]: newWidth }));
    };
    const onMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const downloadAttachment = useCallback(
    async (file: { url: string; name?: string }) => {
      try {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error("Failed to download file");
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = file.name || "attachment";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        console.error("Download failed", error);
        toast.error("Unable to download file. Please try again.");
      }
    },
    [],
  );

  // Property management hooks - create a dummy note if no notes exist
  const dummyNote: Block = {
    _id: 'temp',
    blockType: 'page',
    value: {
      title: '',
      pageType: 'Viewdatabase_Note',
      databaseProperties: {},
      icon: '',
      coverUrl: null,
      userId: '',
      userEmail: '',
    },
    parentId: '',
    parentType: 'collection',
    workspaceId: '',
    workareaId: null,
    status: 'alive',
    blockIds: [],
  };

  const { handleAddProperty, handleUpdateProperty } = useDatabaseProperties(
    board,
    selectedTask || notes[0] || dummyNote,
    (updatedNote) => {
      // Update selectedTask if it's the note being updated
      if (selectedTask && selectedTask._id === updatedNote._id) {
        setSelectedTask(updatedNote);
      }
      // Update localNotes for the specific note
      const noteIndex = localNotes.findIndex(n => n._id === updatedNote._id);
      if (noteIndex !== -1) {
        setLocalNotes(prev => prev.map(n => n._id === updatedNote._id ? updatedNote : n));
        // Update in global block context
        updateBlock(updatedNote._id, updatedNote);
      }
    }
  );

  // Drag and drop state for column reordering
  const [draggedColumnIndex, setDraggedColumnIndex] = useState<number | null>(null);
  const [dragOverColumnIndex, setDragOverColumnIndex] = useState<number | null>(null);

  // Inline title edit state
  const [editingTitleNoteId, setEditingTitleNoteId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState<string>("");
  const titleClickTimerRef = useRef<number | null>(null);
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const { UpdateNote } = useNoteActions();
  // Group UI state
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };
  const [showAddRowForGroup, setShowAddRowForGroup] = useState<Record<string, boolean>>({});
  const [newRowTitleForGroup, setNewRowTitleForGroup] = useState<Record<string, string>>({});

  const createNoteInGroup = async ({ propertyId, value, title, groupName }: { propertyId: string | null; value: any; title: string; groupName: string }) => {
    const groupedPropertyId = propertyId || getGroupBy(board._id);

    // Get dataSourceId from context (already tracked and synced)
    const dsId = currentDataSource[board._id];
    const dataSourceId: string | undefined = (dsId ? String(dsId) : board._id) as string | undefined;

    // Build databaseProperties object (only if both propertyId and value exist, matching old behavior)
    const groupByProps = groupedPropertyId && value ? { [groupedPropertyId]: value } : {};

    // Merge in filter-derived properties (won't overwrite group-by values)
    const databasePropertiesToPass = getInitialPropertiesFromFilters(
      getFilters(board._id),
      getAdvancedFilters(board._id),
      boardProperties,
      groupByProps,
      workspaceMembers,
      getNotesByDataSourceId,
      getDataSource
    );

    const newPageId = new ObjectId().toString();

    const newBlock: Block = {
      _id: newPageId,
      blockType: "page",
      value: {
        title: title,
        pageType: "Viewdatabase_Note",
        databaseProperties: databasePropertiesToPass,
        icon: "",
        coverUrl: null,
        userId: user?.email || "",
        userEmail: user?.email || "",
      },
      parentId: dataSourceId || '',
      parentType: "collection",
      workspaceId: currentWorkspace?._id || "",
      workareaId: null,
      status: "alive",
      blockIds: [],
    };

    // Add optimistic note locally with the real ID
    setLocalNotes((prev) => [...prev, newBlock]);
    setNewRowTitleForGroup((prev) => ({ ...prev, [groupName]: "" }));
    setShowAddRowForGroup((prev) => ({ ...prev, [groupName]: false }));

    try {
      // addRootPage will add the block to global context optimistically
      await addRootPage(newPageId, newBlock, dataSourceId || '', board._id);

    } catch (error) {
      // Rollback: remove optimistic note on error
      // setLocalNotes((prev) => prev.filter((note) => note._id !== newPageId));
    }
  };


  // Lock body scroll while editing a title
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    if (editingTitleNoteId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prevOverflow || '';
    }
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, [editingTitleNoteId]);

  // Handle contentEditable focus and initial content setting
  useEffect(() => {
    if (editingTitleNoteId && contentEditableRef.current) {
      const el = contentEditableRef.current;
      el.focus();
      // Only set initial content, don't update while typing
      if (el.textContent !== editingTitleValue) {
        el.textContent = editingTitleValue;
      }
    }
  }, [editingTitleNoteId]); // Remove editingTitleValue from dependencies

  // Update note title locally (for real-time sidebar updates)
  const updateNoteTitleLocally = (noteId: string, newTitle: string) => {
    const existingNote = notes.find((n) => n._id === noteId) || selectedTask;
    if (!existingNote) return;

    const updatedNote: Block = {
      ...existingNote,
      value: {
        ...existingNote.value,
        title: newTitle,
      },
    };

    setLocalNotes((prev) =>
      prev.map((note) => (note._id === noteId ? updatedNote : note))
    );

    // Update sidebar if this note is open
    if (selectedTask?._id === noteId) {
      setSelectedTask(updatedNote);
    }

    // Update in global block context immediately for real-time sync
    if (updatedNote._id) {
      updateBlock(noteId, updatedNote);
    }
  };

  useEffect(() => {
    setLocalNotes(notes);
  }, [board, notes]);

  // Update dropdown position on scroll and prevent body scroll
  useEffect(() => {
    if (!propertyHeaderDropdown) return;

    const updatePosition = () => {
      const rect = propertyHeaderDropdown.anchorElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const dropdownHeight = 300; // Approximate dropdown height
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      // If not enough space below but enough space above, position above
      const shouldPositionAbove = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight;

      setDropdownPosition({
        top: shouldPositionAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left,
      });
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const dropdown = document.querySelector('[data-dropdown="property-header"]');

      // Close if clicking outside the dropdown and not on the anchor element
      if (dropdown && !dropdown.contains(target) && !propertyHeaderDropdown.anchorElement.contains(target)) {
        setPropertyHeaderDropdown(null);
        setDropdownPosition(null);
      }
    };

    // Set initial position
    updatePosition();

    // Prevent body scroll when dropdown is open
    document.body.style.overflow = 'hidden';

    // Add event listeners
    const scrollContainer = document.querySelector('.overflow-x-auto.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', updatePosition);
    }
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      // Restore body scroll
      document.body.style.overflow = 'unset';

      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', updatePosition);
      }
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [propertyHeaderDropdown]);

  const { handleCardClick, handleCloseSidebar } = useBoardFunctions({
    board,
    setSelectedTask,
    setRightSidebarContent,
    setIsClosing,
    previousCardIdRef,
  });

  const handleEditCard = async (noteId: string, newTitle: string) => {
    setLocalNotes((prev) => prev.map((note) =>
      note._id === noteId
        ? { ...note, value: { ...note.value, title: newTitle } }
        : note
    ));

    try {
      await UpdateNote(noteId, newTitle, null);
      // const noteToUpdate = notes.find((note) => note._id === noteId);

      // if (noteToUpdate) {
      //   const updatedNote: Block = { 
      //     ...noteToUpdate, 
      //     value: { ...noteToUpdate.value, title: newTitle } 
      //   };
      //   // Update in global block context
      //   updateBlock(noteId, updatedNote);
      // }
    } catch (err) {
      console.error("Failed to update task:", err);
      setLocalNotes(notes);
    }
  };

  const persistNoteTitleChangeHandler = async (noteId: string, newTitle: string) => {
    await handleEditCard(noteId, newTitle);
  };


  // Apply filters to notes
  const filteredNotes = useMemo(() => {
    // Safety check: ensure localNotes is an array
    if (!localNotes || !Array.isArray(localNotes)) {
      return [];
    }

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
      view = latestBoard.value?.viewsTypes?.find((v) => v._id === currentViewData.id);
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
    if (!boardFilters || Object.keys(boardFilters).length === 0) {
      return result;
    }

    return result.filter((note) => {
      const noteProps = note.value.databaseProperties || {};
      console.log("Checking note:", note.value.title, "with props:", noteProps);

      return Object.entries(boardFilters).every(([propId, filterValues]) => {
        const propSchema = boardProperties?.[propId];

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

        if (!filterValues || (Array.isArray(filterValues) && filterValues.length === 0)) {
          return true;
        }

        if (noteValue === undefined || noteValue === null || noteValue === "") {
          return false;
        }

        const filterArray = Array.isArray(filterValues)
          ? filterValues
          : [filterValues];

        // Case 1: multi-select, person, or relation properties (noteValue is array or single value)
        const relationLimit = propSchema?.relationLimit || "multiple";

        if (propSchema?.type === "relation") {
          // Filter now stores page IDs, notes also store relation values as arrays of page IDs
          const rawNoteIds = getRelationIdsFromValue(noteValue, relationLimit);
          const noteIds = getValidRelationIds(rawNoteIds, propSchema.linkedDatabaseId ? String(propSchema.linkedDatabaseId) : "");
          return noteIds.some((noteId) => filterArray.includes(noteId));
        }

        if (Array.isArray(noteValue)) {
          const hasMatch = noteValue.some((val) => {
            if (typeof val === "object" && val.userId) {
              return filterArray.includes(val.userId);
            }
            return filterArray.includes(val);
          });
          return hasMatch;
        }

        // Case 2: single value properties (string, number, status, etc.)
        if (propSchema && ["text", "email", "url", "phone"].includes(propSchema.type)) {
          const noteStr = String(noteValue).toLowerCase();
          const hasMatch = filterArray.some((fv) => noteStr.includes(String(fv).toLowerCase()));
          return hasMatch;
        }
        if (propSchema?.type === "id") {
          // Sprint IDs are stored as numbers; filter values are strings — compare via String()
          const hasMatch = filterArray.some((fv) => String(noteValue) === String(fv));
          return hasMatch;
        }
        if (propSchema?.type === "number") {
          const hasMatch = filterArray.some((fv) => String(noteValue) === String(fv));
          return hasMatch;
        }
        if (propSchema?.type === "checkbox") {
          const hasMatch = filterArray.some((fv) => String(noteValue) === fv);
          return hasMatch;
        }
        const hasMatch = filterArray.includes(noteValue);
        return hasMatch;
      });
    });
  }, [localNotes, getFilters, board._id, searchQuery[board._id], boardProperties, getNotesByDataSourceId, getDataSource, currentView]);

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
    filteredNotes,
    setLocalNotes,
    boardId: board._id,
    getSortBy,
  });

  // Apply sorting to notes - using the same utility as BoardView
  const sortedNotes = useMemo(() => {
    const boardSorts = getSortBy(board._id);
    if (!boardSorts || boardSorts.length === 0) {
      return filteredNotes;
    }

    return applySorting(filteredNotes, boardSorts, boardProperties, {
      getNotesByDataSourceId,
      getDataSource,
    });
  }, [filteredNotes, getSortBy, board._id, boardProperties, getNotesByDataSourceId, getDataSource]);

  // Group notes if groupBy is set - same logic as BoardView
  const groupedNotes = useMemo(() => {
    const groupByPropertyId = getGroupBy(board._id);
    if (!groupByPropertyId) {
      return { ungrouped: sortedNotes };
    }

    const groups: Record<string, Block[]> = {};
    const property = boardProperties?.[groupByPropertyId];
    if (!property) return { ungrouped: sortedNotes };

    sortedNotes.forEach((note) => {
      const rawVal = note.value.databaseProperties?.[groupByPropertyId];
      const groupKeys: string[] = [];

      // Handle properties
      if (property?.type === "person" && Array.isArray(rawVal)) {
        if (rawVal.length === 0) {
          groupKeys.push("Unassigned");
        } else {
          rawVal.forEach((p: any) => {
            groupKeys.push(p.userName || p.userEmail || "Unnamed User");
          });
        }
      }
      else if (property?.type === "relation") {
        const relationLimit = property.relationLimit || "multiple";
        const linkedDatabaseId = property.linkedDatabaseId;
        const rawIds = getRelationIdsFromValue(rawVal, relationLimit);
        const relationIds = getValidRelationIds(rawIds, linkedDatabaseId ? String(linkedDatabaseId) : "");
        if (relationIds.length === 0) {
          groupKeys.push("No relations");
        } else {
          relationIds.forEach((id) => {
            const title = getRelationNoteTitle(id!, linkedDatabaseId || "", "New page");
            groupKeys.push(title);
          });
        }
      }
      else if (property?.type === "multi_select" && Array.isArray(rawVal)) {
        if (rawVal.length === 0) {
          groupKeys.push("Unassigned");
        } else {
          rawVal.forEach((val: string) => {
            const opt = property.options?.find((o: any) => String(o.id) === String(val));
            groupKeys.push(opt?.name || val);
          });
        }
      }

      else if (["text", "url", "email", "phone", "number", "checkbox", "select", "status", "priority"].includes(property?.type || "")) {
        if (rawVal === undefined || rawVal === null || rawVal === "") {
          groupKeys.push("No " + (property?.name || "value"));
        } else {
          if (property?.type === "checkbox") {
            groupKeys.push(String(rawVal) === "true" ? "Checked" : "Unchecked");
          } else if (["select", "status", "priority"].includes(property?.type || "")) {
            const opt = property.options?.find((o: any) => String(o.id) === String(rawVal));
            groupKeys.push(opt?.name || String(rawVal));
          } else {
            groupKeys.push(String(rawVal));
          }
        }
      } else {
        // Default fallback
        const valStr = rawVal ? String(rawVal) : "No " + (property?.name || "Group");
        groupKeys.push(valStr);
      }

      // Add note to all determined groups
      groupKeys.forEach(key => {
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(note);
      });
    });

    return groups;
  }, [sortedNotes, getGroupBy, board._id, boardProperties, getRelationNoteTitle]);

  // Define property columns based on board properties and property order
  const propertyColumns: PropertyColumn[] = useMemo(() => {
    const columns: PropertyColumn[] = [];

    // Get the property order for this board (excluding title)
    const boardOrder = propertyOrder[board._id];
    const currentPropertyOrder = (boardOrder?.length ?? 0) > 0
      ? boardOrder!.filter(id => id !== "title")
      : Object.keys(boardProperties || {}).filter(id => id !== "title");

    // Add title column (always visible and first)
    columns.push({
      id: "title",
      name: "Title",
      type: "text",
      width: 200,
      icon: <Type className="w-4 h-4" />,
    });

    // Add properties in the specified order
    for (const propertyId of currentPropertyOrder || []) {

      // Add other properties
      const property = boardProperties?.[propertyId];
      if (!property) continue;

      // Show property based on propertyVisibility settings
      // Show property based on propertyVisibility settings
      // Otherwise, only show if propertyId is in visiblePropertyIds

      // When visibility array has values, only show properties in that array
      if (!visiblePropertyIds.includes(propertyId)) {
        continue;
      }

      let icon: React.ReactNode;
      let width: number;

      switch (property.type) {
        case "text": {
          icon = <Type className="w-4 h-4" />;
          width = 200;
          break;
        }
        case "status": {
          icon = <Tag className="w-4 h-4" />;
          width = 120;
          break;
        }
        case "person": {
          icon = <User className="w-4 h-4" />;
          width = 140;
          break;
        }
        case "date": {
          icon = <Calendar className="w-4 h-4" />;
          width = 120;
          break;
        }
        case "priority": {
          icon = <Star className="w-4 h-4" />;
          width = 100;
          break;
        }
        case "checkbox": {
          icon = <CheckSquare className="w-4 h-4" />;
          width = 100;
          break;
        }
        case "formula": {
          icon = <Calculator className="w-4 h-4" />;
          width = 200;
          break;
        }
        case "select": {
          icon = <Tag className="w-4 h-4" />;
          width = 100;
          break;
        }
        case "multi_select": {
          icon = <ListChecks className="w-4 h-4" />;
          width = 100;
          break;
        }
        case "email": {
          icon = <Mail className="w-4 h-4" />;
          width = 220;
          break;
        }
        case "url": {
          icon = <Link className="w-4 h-4" />;
          width = 240;
          break;
        }
        case "phone": {
          icon = <Phone className="w-4 h-4" />;
          width = 180;
          break;
        }
        case "rollup": {
          icon = <Calculator className="w-4 h-4" />;
          width = 150;
          break;
        }
        case "relation": {
          icon = <FileText className="w-4 h-4" />;
          width = 150;
          break;
        }
        case "github_pr": {
          icon = <GitPullRequest className="w-4 h-4" />;
          width = 220;
          break;
        }
        case "file": {
          icon = <Paperclip className="w-4 h-4" />;
          width = 200;
          break;
        }
        default: {
          icon = <Type className="w-4 h-4" />;
          width = 150;
        }
      }

      columns.push({
        id: propertyId,
        name: property.name,
        type: property.type,
        width,
        icon,
      });
    }

    // Ensure we always have at least the title column
    if (columns.length === 0) {
      columns.push({
        id: "title",
        name: "Title",
        type: "text",
        width: 200,
        icon: <Type className="w-4 h-4" />,
      });
    }

    return columns;
  }, [boardProperties, propertyOrder, board._id, visiblePropertyIds]);

  const totalColumnsWidth = useMemo(() => {
    return propertyColumns.reduce((sum, col) => sum + (columnWidths[col.id] ?? col.width), 0);
  }, [propertyColumns, columnWidths]);

  // Initialize column widths when property columns change (without clobbering user changes)
  useEffect(() => {
    setColumnWidths((prev) => {
      // Only create a new object if there are actually new columns to initialize
      let hasNew = false;
      for (const col of propertyColumns) {
        if (prev[col.id] == null) {
          hasNew = true;
          break;
        }
      }
      if (!hasNew) return prev; // Return same reference to avoid re-render
      const next = { ...prev };
      for (const col of propertyColumns) {
        if (next[col.id] == null) {
          next[col.id] = col.width;
        }
      }
      return next;
    });
  }, [propertyColumns]);

  const handleAddNewRow = async () => {
    const title = newRowTitle.trim();

    // Get dataSourceId from context (already tracked and synced)
    const dsId = currentDataSource[board._id];
    const dataSourceId: string | undefined = (dsId ? String(dsId) : board._id) as string | undefined;

    const newPageId = new ObjectId().toString();

    const newBlock: Block = {
      _id: newPageId,
      blockType: "page",
      value: {
        title: title,
        pageType: "Viewdatabase_Note",
        databaseProperties: getInitialPropertiesFromFilters(
          getFilters(board._id),
          getAdvancedFilters(board._id),
          boardProperties,
          {},
          workspaceMembers,
          getNotesByDataSourceId,
          getDataSource
        ),
        icon: "",
        coverUrl: null,

        userId: user?.email || "",
        userEmail: user?.email || "",
      },
      parentId: dataSourceId || '',
      parentType: "collection",
      workspaceId: currentWorkspace?._id || "",
      status: "alive",
      workareaId: null,
      blockIds: [],
    };

    // Add optimistic note locally with the real ID
    setLocalNotes((prev) => [...prev, newBlock]);
    setNewRowTitle(""); // Clear the input field after creating the page
    setShowAddRow(false);

    try {
      // addRootPage will add the block to global context optimistically
      await addRootPage(newPageId, newBlock, dataSourceId || '', board._id);

    } catch (error) {
      console.error("Failed to create new page:", error);
      // Rollback: remove optimistic note on error
      // setLocalNotes((prev) => prev.filter((note) => note._id !== newPageId));
    }
  };

  // Wrapper to select all based on current grouping using hook's handler
  const handleSelectAllWrapper = () => {
    const allNotes = Object.values(groupedNotes).flat();
    handleSelectAll(allNotes as Block[]);
  };

  // Cell editing handlers
  const handleCellClick = (e: React.MouseEvent, note: Block, property: PropertyColumn) => {
    e.stopPropagation();

    // Only open editor for editable properties
    if (!canEditProperty(property.type)) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setEditingCell({
      noteId: note._id,
      propertyId: property.id,
      position: {
        top: rect.bottom + 2,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  const handleOpenGroupEditor = (propertyId: string, anchorEl: HTMLElement) => {
    openGroupEditor(propertyId, anchorEl, (cell) => setEditingCell(cell));
  };

  const handleCellUpdate = async (noteId: string, propertyId: string, value: any = "") => {
    // If in group mode, apply to all selected rows
    if (groupEditingPropertyId && propertyId === groupEditingPropertyId) {
      await applyGroupUpdate(propertyId, value);
      return;
    }
    const note = localNotes.find(n => n._id === noteId);
    if (!note) return;

    // Use the central hook to handle the update and two-way relations
    await handleUpdateProperty(propertyId, value, note);
  };

  const handleCloseEditor = () => {
    setEditingCell(null);
    clearGroupEditing();
  };

  // Property header dropdown handlers
  const handlePropertyHeaderClick = (e: React.MouseEvent, property: PropertyColumn) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 300; // Approximate dropdown height
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // If not enough space below but enough space above, position above
    const shouldPositionAbove = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight;

    setPropertyHeaderDropdown({
      propertyId: property.id,
      anchorElement: target,
    });
    setDropdownPosition({
      top: shouldPositionAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: rect.left,
    });
  };

  // Helper to get current viewTypeId
  const getCurrentViewTypeId = (): string | null => {
    const currentViewData = currentView[board._id];
    const latestBoard = getBlock(board._id) || board;

    let view;
    if (currentViewData?.id) {
      view = latestBoard.value?.viewsTypes?.find((v) => v._id === currentViewData.id);
    } else if (currentViewData?.type) {
      view = latestBoard.value?.viewsTypes?.find((v) => v.viewType === currentViewData.type);
    }

    return view?._id || null;
  };

  // Create handlers from the handlers file - updated to use viewTypeId
  const currentViewTypeId = getCurrentViewTypeId();
  const handlers = createHandlers({
    boardProperties,
    board,
    setGroupBy: async (viewTypeId: string, propertyId: string | undefined) => {
      try {
        // updateGroupByPropertyId handles optimistic update and rollback internally
        await updateGroupByPropertyId(
          viewTypeId,
          propertyId,
          board._id,
          undefined, // sortDirection
          false, // hideEmptyGroups
          false, // colorColumn
          setGroupBy,
          getGroupBy,
          getBlock,
          updateBlock,
        );
      } catch (err) {
        console.error("Failed to update group by:", err);
        // Rollback is handled by updateGroupByPropertyId
      }
    },
    setBoardSortBy: async (viewTypeId: string, sorts: Array<{ propertyId: string; direction: 'ascending' | 'descending' }>) => {
      try {
        // updateSorts handles optimistic update and rollback internally
        await updateSorts(
          viewTypeId,
          sorts,
          board._id,
          setBoardSortBy,
          getSortBy,
          getBlock,
          updateBlock,
        );
      } catch (err) {
        console.error("Failed to update sorts:", err);
        // Rollback is handled by updateSorts
      }
    },
    setEditingPropertyId,
    setShowPropertyDialog,
    setPropertyOrder,
    groupBy: currentViewTypeId ? { [currentViewTypeId]: getGroupBy(board._id) } : {},
    sortBy: currentViewTypeId ? { [currentViewTypeId]: getSortBy(board._id) } : {},
    propertyOrder,
  });

  const {
    handlePropertySort,
    handlePropertyFilter,
    handlePropertyGroup,
    handlePropertyHide,
    handlePropertyEdit,
    handlePropertyWrapInView,
    handlePropertyDisplayAs,
    handlePropertyInsertLeft,
    handlePropertyInsertRight,
    handleRemoveSortFromProperty,
  } = handlers;

  // Filter modal handlers
  const handleApplyFilters = async (newFilters: Record<string, string[]>) => {
    const viewTypeId = getCurrentViewTypeId();
    if (!viewTypeId) {
      toast.error("View type ID not found");
      return;
    }

    try {
      // updateFilters handles optimistic update and rollback internally
      await updateFilters(
        viewTypeId,
        newFilters,
        board._id,
        setBoardFilters,
        getFilters,
        getBlock,
        updateBlock,
      );

      toast.success("Filters updated successfully");
    } catch (err) {
      console.error("Failed to update filters:", err);
    }

    setPropertyHeaderDropdown(null);
    setDropdownPosition(null);
  };

  // Helper to insert newly created property id into order relative to a target
  const insertPropertyIntoOrder = (newPropertyId: string) => {
    if (!insertionTarget) return;
    // Prefer what is actually rendered to avoid losing columns
    const renderedOrder = [
      "title",
      ...propertyColumns.filter((c) => c.id !== "title").map((c) => c.id),
    ];
    const existingOrder = propertyOrder[board._id];
    const baseOrder = (existingOrder && existingOrder.length > 0)
      ? existingOrder
      : renderedOrder;
    // Remove if already present to avoid duplicates
    const filtered = baseOrder.filter((id) => id !== newPropertyId);
    const targetIndex = filtered.findIndex((id) => id === insertionTarget.targetPropertyId);
    if (targetIndex === -1) {
      // Fallback: append after title
      const titleIndex = filtered.indexOf("title");
      const insertIndex = titleIndex >= 0 ? titleIndex + 1 : 0;
      filtered.splice(insertIndex, 0, newPropertyId);
    } else {
      const insertIndex = insertionTarget.side === 'left' ? targetIndex : targetIndex + 1;
      filtered.splice(insertIndex, 0, newPropertyId);
    }
    setPropertyOrder(board._id, filtered);
    setInsertionTarget(null);
  };

  // Deselect all when clicking outside table/editor/toolbar
  useEffect(() => {
    // Deselect all when clicking outside table/editor/toolbar
    const handleClickOutside = (event: MouseEvent) => {
      if (selectedNotes.size === 0) return;
      const target = event.target as HTMLElement;
      const withinTable = !!target.closest('.overflow-x-auto.overflow-y-auto');
      const withinEditor = !!target.closest('[data-cell-editor]');
      const withinToolbar = !!target.closest('[data-group-toolbar]');
      if (!withinTable && !withinEditor && !withinToolbar) {
        setSelectedNotes(new Set());
        clearGroupEditing();
        setEditingCell(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedNotes]);

  // Keep dialogs positioned next to their anchor while scrolling/resizing
  useEffect(() => {
    // Update position for any open dialog (AddPropertyDialog, RelationViewSelector, or RelationConfigModal)
    const isAnyDialogOpen = showPropertyDialog || showRelationViewSelector || showRelationConfigModal;
    if (!isAnyDialogOpen) return;

    const anchor: HTMLElement | null = insertionTarget?.anchorElement || addPropertyBtnRef.current;
    if (!anchor) return;

    const updateDialogPosition = () => {
      const rect = anchor.getBoundingClientRect();
      setPropertyDialogPosition({ top: rect.bottom + 4, left: rect.left });
    };

    updateDialogPosition();
    const scrollContainer = document.querySelector('.overflow-x-auto.overflow-y-auto');
    const events = ['scroll', 'resize'] as const;
    events.forEach((evt) => window.addEventListener(evt, updateDialogPosition));
    if (scrollContainer) scrollContainer.addEventListener('scroll', updateDialogPosition);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt as any, updateDialogPosition));
      if (scrollContainer) scrollContainer.removeEventListener('scroll', updateDialogPosition);
    };
  }, [showPropertyDialog, showRelationViewSelector, showRelationConfigModal, insertionTarget]);

  // Column drag and drop handlers
  const handleColumnDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggedColumnIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleColumnDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumnIndex(index);
  };

  const handleColumnDragLeave = () => {
    setDragOverColumnIndex(null);
  };

  const handleColumnDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedColumnIndex === null || draggedColumnIndex === dropIndex) {
      setDraggedColumnIndex(null);
      setDragOverColumnIndex(null);
      return;
    }

    // Get current property order (excluding title column)
    const boardOrder = propertyOrder[board._id];
    const currentOrder = (boardOrder && boardOrder.length > 0
      ? boardOrder
      : Object.keys(boardProperties || {})).filter(id => id !== "title");

    // Create new order by moving the dragged item
    // Note: index 0 is always "title", so we subtract 1 to get the index in currentOrder
    const newOrder = [...currentOrder];
    const [movedItem] = newOrder.splice(draggedColumnIndex - 1, 1);
    if (movedItem) {
      newOrder.splice(Math.max(0, dropIndex - 1), 0, movedItem);
    }

    // Update the property order
    setPropertyOrder(board._id, newOrder);

    setDraggedColumnIndex(null);
    setDragOverColumnIndex(null);
  };


  // Helper function to get color styles for an option 
  const getOptionColorStyles = (
    propSchema: { options?: { id?: string; name: string; color?: string }[] },
    optionValue: string,
  ): { bg: string; text: string; dot: string } => {
    let color = "default";
    if (propSchema.options && typeof optionValue === "string") {
      const option = propSchema.options.find((opt) => String(opt.id) === String(optionValue));
      if (option?.color) {
        color = option.color;
      }
    }
    return getColorStyles(color);
  };

  const resolveOptionName = (
    propSchema: { options?: { id?: string; name: string }[] },
    optionValue: string,
  ): string => {
    if (!propSchema.options || typeof optionValue !== "string") return optionValue;
    const option = propSchema.options.find((opt) => String(opt.id) === String(optionValue));
    return option?.name || optionValue;
  };

  const renderPropertyValue = (note: Block, property: PropertyColumn) => {
    // Handle title column specially
    if (property.id === "title") {
      const isEditingTitle = editingTitleNoteId === note._id;
      return (
        <div className="flex items-center gap-2 w-full relative">
          <div
            role="button"
            tabIndex={0}
            className="flex items-center justify-center h-4 w-4 rounded-md flex-shrink-0 mr-1 cursor-pointer hover:bg-accent transition-colors select-none"
          >
            {note.value.icon ? (
              <div className="text-sm">
                {note.value.icon}
              </div>
            ) : (
              <FileText className="w-4 h-4 text-gray-400" />
            )}
          </div>
          <div className={`flex-grow min-w-0 relative ${isEditingTitle ? 'overflow-visible' : 'overflow-hidden'}`}>
            {isEditingTitle ? (
              // Edit mode - inline contentEditable div (like board view)
              <div
                data-property-id="title"
                contentEditable
                suppressContentEditableWarning={true}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                }}
                onInput={(e) => {
                  const target = e.currentTarget;
                  const newValue = target.textContent || "";
                  if (newValue.trim() === "") {
                    target.innerHTML = "";
                  }
                  setEditingTitleValue(newValue);
                  updateNoteTitleLocally(note._id, newValue);
                }}
                onBlur={(e) => {
                  const newValue = e.currentTarget.textContent?.trim() || "";
                  setEditingTitleNoteId(null);
                  handleEditCard(note._id, newValue);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const newValue = (e.currentTarget as HTMLDivElement).textContent?.trim() || "";
                    setEditingTitleNoteId(null);
                    handleEditCard(note._id, newValue);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingTitleNoteId(null);
                    setEditingTitleValue(note.value.title);
                    updateNoteTitleLocally(note._id, note.value.title);
                  }
                  // Allow all other keys (including space) to work normally
                }}
                className="text-sm font-medium break-words outline-none rounded px-1 focus-visible:ring-2 dark:ring-gray-700 py-1 ring-blue-500 whitespace-pre-wrap min-h-[1.25rem] max-w-full max-h-[200px] overflow-auto w-full block empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                data-placeholder="New page"
                ref={contentEditableRef}
              />
            ) : (
              // Display mode - one-line clipped text
              <span
                data-property-id="title"
                onClick={(e) => {
                  e.stopPropagation();
                  if (titleClickTimerRef.current) {
                    window.clearTimeout(titleClickTimerRef.current);
                  }
                  titleClickTimerRef.current = window.setTimeout(() => {
                    handleCardClick(note);
                  }, 200);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (titleClickTimerRef.current) {
                    window.clearTimeout(titleClickTimerRef.current);
                  }
                  setEditingTitleNoteId(note._id);
                  setEditingTitleValue(note.value.title);
                }}
                className="block text-sm leading-normal whitespace-nowrap break-normal overflow-hidden text-ellipsis cursor-pointer select-none font-medium"
              >
                {note.value.title.trim() === "" ? <span style={{ color: "var(--c-texTer, #9b9a97)" }}>New page</span> : note.value.title}
              </span>
            )}
          </div>
          {/* Open button - visible on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick(note);
            }}
            className="open-sidebar-btn opacity-0 transition-opacity flex items-center justify-center flex-shrink-0 w-5 h-5 rounded-sm duration-20"
            style={{
              color: 'rgba(55, 53, 47, 0.65)',
              transition: 'background 20ms ease-in 0s',
            }}
            aria-label={`Open ${note.value.title}`}
            title="Open in sidebar"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    const value = note.value.databaseProperties?.[property.id];
    // Get property schema from boardProperties - this already has the options with colors!
    const propSchema = boardProperties?.[property.id];

    // Skip empty value check for rollup and formula properties (they compute their own values)
    if (property.type !== "rollup" && property.type !== "formula" && !value && value !== false) {
      return <span style={{ color: 'var(--c-texTer, #9b9a97)' }}></span>;
    }

    switch (property.type) {
      case "status": {
        const statusValue = resolveOptionName(propSchema || {}, String(value || ""));
        const fallbackColor = { bg: 'rgba(206,205,202,0.5)', text: 'rgb(55,53,47)', dot: 'rgb(155,154,151)' };

        // propSchema already has the options with colors from boardProperties
        const colorStyles = getOptionColorStyles(propSchema || {}, String(value || "")) ?? fallbackColor;

        return (
          <div className="flex flex-nowrap gap-x-2 gap-y-[6px] max-w-fit">
            <div className="flex text-sm items-center shirink-0 min-w-0 max-w-full h-[20px] m-0 rounded-[10px] px-[7px] pr-[9px] whitespace-nowrap overflow-hidden text-ellipsis"
              style={{
                color: colorStyles.text,
                background: colorStyles.bg,
              }}>
              <div className="inline-flex items-center h-[20px] leading-[20px] whitespace-nowrap overflow-hidden text-ellipsis">
                <div className="flex items-center">
                  <div className="inline-flex shrink-0 rounded-full h-[8px] w-[8px] mr-[5px]"
                    style={{
                      backgroundColor: colorStyles.dot,
                    }}></div>
                </div>
                <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                  {statusValue || ""}
                </span>
              </div>
            </div>
          </div>
        );
      }

      case "checkbox": {
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={!!value}
              onChange={() => {
                // Handle checkbox update
                const updatedCheckboxNote: Block = {
                  ...note,
                  value: {
                    ...note.value,
                    databaseProperties: {
                      ...note.value.databaseProperties,
                      [property.id]: !value,
                    },
                  },
                };
                updateBlock(note._id, updatedCheckboxNote);
              }}
              style={{
                border: '1px solid rgb(196, 196, 196)',
                backgroundColor: value ? 'var(--c-bluIcoAccPri)' : 'transparent',
              }}
              className="w-[16px] h-[16px] rounded-[3px] cursor-pointer"
              aria-label={`Toggle ${property.name}`}
            />
          </div>
        );
      }

      case "date": {
        const dateStr = String(value || "");
        let formattedDate = dateStr;

        const parts = dateStr.split(",");

        if (parts.length === 1 || !parts[1]) {
          formattedDate = formatDate(parts[0]);
        } else {
          formattedDate = `${formatDate(parts[0])} → ${formatDate(parts[1])}`;
        }

        if (!formattedDate) {
          return <span className="text-[color:var(--c-texTer,#9b9a97)]"></span>;
        }

        return (
          <div className="leading-normal whitespace-nowrap break-normal">
            <span className="leading-normal whitespace-nowrap break-normal inline">
              {formattedDate}
            </span>
          </div>
        );
      }

      case "priority": {
        const defaultPriorityOpts = [
          { id: "high", name: "High" },
          { id: "medium", name: "Medium" },
          { id: "low", name: "Low" },
        ];
        const effectivePriorityOpts = (propSchema as any)?.options?.length ? (propSchema as any).options : defaultPriorityOpts;
        const effectivePrioritySchema = { options: effectivePriorityOpts };
        const priorityValue = resolveOptionName(effectivePrioritySchema, String(value || ""));
        const fallbackColor = { bg: 'rgba(206,205,202,0.5)', text: 'rgb(55,53,47)', dot: 'rgb(155,154,151)' };

        const priorityColorStyles = getOptionColorStyles(effectivePrioritySchema, String(value || "")) ?? fallbackColor;

        return (
          <div className="w-full flex justify-between items-center">
            <div className="flex flex-nowrap items-center gap-x-2 gap-y-[6px]">
              <div className="flex items-center shrink-0 min-w-0 max-w-full h-[20px] m-0 rounded-[3px] px-[6px] leading-[120%] text-sm whitespace-nowrap overflow-hidden text-ellipsis"
                style={{
                  color: priorityColorStyles.text,
                  background: priorityColorStyles.bg,
                }}
              >
                <div className="inline-flex items-center h-[20px] leading-[20px] whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                    {priorityValue}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      }

      case "select": {
        const selectValue = resolveOptionName(propSchema || {}, String(value || ""));
        const fallbackColor = { bg: 'rgba(206,205,202,0.5)', text: 'rgb(55,53,47)', dot: 'rgb(155,154,151)' };
        const selectColorStyles = getOptionColorStyles(propSchema || {}, String(value || "")) ?? fallbackColor;

        return (
          <div className="flex flex-nowrap gap-y-[6px] gap-x-2 max-w-fit">
            <div className="flex items-center shrink-0 min-w-0 max-w-full h-[20px] m-0 rounded-[3px] px-[6px] leading-[120%] text-sm whitespace-nowrap overflow-hidden text-ellipsis"
              style={{
                color: selectColorStyles.text,
                background: selectColorStyles.bg,
              }}
            >
              <div className="inline-flex items-center h-[20px] leading-[20px] whitespace-nowrap overflow-hidden text-ellipsis">
                <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                  {selectValue || ""}
                </span>
              </div>
            </div>
          </div>
        );
      }

      case "multi_select": {
        const multiSelectValues = Array.isArray(value) ? value : (value ? [value] : []);
        if (multiSelectValues.length === 0) {
          return <span className="text-sm text-[color:var(--c-texTer,#9b9a97)]"></span>;
        }
        const fallbackColor = { bg: 'rgba(206,205,202,0.5)', text: 'rgb(55,53,47)', dot: 'rgb(155,154,151)' };

        return (
          <div className="flex flex-wrap gap-1 max-w-full">
            {multiSelectValues.slice(0, 3).map((item: any, idx: number) => {
              const itemValue = String(item);
              const itemDisplayName = resolveOptionName(propSchema || {}, itemValue);
              const itemColorStyles = getOptionColorStyles(propSchema || {}, itemValue) ?? fallbackColor;
              return (
                <div
                  key={idx}
                  className="flex items-center shrink-0 min-w-0 max-w-full h-[20px] m-0 rounded-[3px] px-[6px] leading-[120%] text-sm whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{
                    color: itemColorStyles.text,
                    background: itemColorStyles.bg,
                  }}
                >
                  {itemDisplayName}
                </div>
              );
            })}
            {multiSelectValues.length > 3 && (
              <span className="text-[12px] text-[color:var(--c-texTer,#9b9a97)]" >
                +{multiSelectValues.length - 3}
              </span>
            )}
          </div>
        );
      }
      case "email": {
        const emailValue = String(value || "").trim();
        if (!emailValue) {
          return <span className="text-sm text-[color:var(--c-texTer,#9b9a97)]">—</span>;
        }
        return (
          <a
            href={`mailto:${emailValue}`}
            className="text-sm text-blue-600 dark:text-blue-400 truncate max-w-[220px]"
            title={emailValue}
          >
            {emailValue}
          </a>
        );
      }
      case "url": {
        const rawUrl = String(value || "").trim();
        if (!rawUrl) {
          return <span className="text-sm text-[color:var(--c-texTer,#9b9a97)]">—</span>;
        }
        const sanitizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        const displayUrl = rawUrl.replace(/^https?:\/\//i, "");
        return (
          <a
            href={sanitizedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 truncate max-w-[260px]"
            title={rawUrl}
          >
            {displayUrl}
          </a>
        );
      }
      case "phone": {
        const phoneValue = String(value || "").trim();
        if (!phoneValue) {
          return <span className="text-sm text-[color:var(--c-texTer,#9b9a97)]">—</span>;
        }
        return (
          <a
            href={`tel:${phoneValue.replace(/\s+/g, "")}`}
            className="text-sm text-blue-600 dark:text-blue-400"
            title={phoneValue}
          >
            {phoneValue}
          </a>
        );
      }
      case "person": {
        const membersArray = Array.isArray(value) ? value : [];
        if (membersArray.length === 0) {
          return <span className="text-sm text-[color:var(--c-texTer,#9b9a97)]">—</span>;
        }
        // helper: give a color from a palette based on index
        const colorList = [
          '#ffd966', '#b4a7d6', '#a2c4c9', '#93c47d', '#f6b26b',
          '#e06666', '#6fa8dc', '#8e7cc3', '#f9cb9c', '#6d9eeb',
        ];
        function getInitial(m: any) {
          if (m.userName && m.userName.length > 0) return m.userName[0].toUpperCase();
          if (m.userEmail && m.userEmail.length > 0) return m.userEmail[0].toUpperCase();
          return '?';
        }
        return (
          <div className="flex items-center gap-[6px] min-w-0">
            {membersArray.slice(0, 2).map((member: any, idx: number) => (
              <div
                key={member.userId || idx}
                className="flex items-center gap-1 rounded-full px-2 py-0 h-[22px] text-sm font-medium"
                style={{
                  background: 'var(--ca-butHovBac, #f3f2ef)',
                }}
              >
                <div className="flex items-center justify-center w-4 h-4 rounded-full text-white font-bold mr-1"
                  style={{
                    background: colorList[idx % colorList.length],
                    color: '#fff',
                  }}>{getInitial(member)}</div>
                <span className="whitespace-nowrap max-w-[80px] overflow-hidden text-ellipsis text-[13px] text-[color:var(--c-texPri)]">
                  {member.userName || member.userEmail || ''}
                </span>
              </div>
            ))}
            {membersArray.length > 2 && (
              <span className="text-[12px] font-semibold text-[#9b9a97] bg-[#eee] rounded-[8px] px-[7px] h-[20px] flex items-center">
                +{membersArray.length - 2}
              </span>
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
          return <span className="text-sm text-[color:var(--c-texTer,#9b9a97)]">—</span>;
        }

        return (
          <div className="flex items-center gap-[6px] min-w-0">
            {noteIds.slice(0, 2).map((noteId: string, idx: number) => {
              // Get current title from context (updates automatically when note changes)
              const relTitle = getRelationNoteTitle(
                noteId,
                linkedDatabaseId || "",
                "New page"
              );

              // Get note from context to display icon
              const note = getNotesByDataSourceId(linkedDatabaseId || "").find((n: Block) => String(n._id) === noteId);
              const noteIcon = (note as Block)?.value.icon;

              return (
                <div
                  key={noteId}
                  className="flex items-center gap-1 rounded px-2 py-0.5 h-[22px] text-sm font-medium"
                >
                  {noteIcon ? (
                    <span className="text-xs opacity-70 shrink-0" style={{ fontSize: "12px" }}>
                      {noteIcon}
                    </span>
                  ) : (
                    <FileText className="w-3.5 h-3.5 opacity-70 shrink-0" />
                  )}
                  <span className="whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis text-[13px]">
                    {relTitle}
                  </span>
                </div>
              );
            })}
            {noteIds.length > 2 && (
              <span
                className="text-[12px] font-semibold rounded-[8px] px-[7px] h-[20px] flex items-center text-[color:var(--c-texTer,#9b9a97)] bg-[#eee]"
              >
                +{noteIds.length - 2}
              </span>
            )}
          </div>
        );
      }

      case "github_pr": {
        const pr = normalizeGitHubPrValue(value);
        if (!pr.owner && !pr.repo && !pr.pullNumber && !pr.title) {
          return <span className="text-xs text-[color:var(--c-texTer,#9b9a97)]">Link a PR</span>;
        }
        const statusMeta = getGitHubPrStatusMeta(pr);
        const statusStyles =
          statusMeta.tone === "success"
            ? { background: "rgba(16,185,129,0.2)", color: "rgb(5, 122, 85)" }
            : statusMeta.tone === "muted"
              ? { background: "rgba(156,163,175,0.2)", color: "rgb(75,85,99)" }
              : { background: "rgba(59,130,246,0.15)", color: "rgb(37, 99, 235)" };
        const label =
          pr.title || (pr.number ?? pr.pullNumber ? `#${pr.number ?? pr.pullNumber}` : "Linked PR");

        return (
          <div className="flex flex-col gap-1 max-w-[240px]">
            <span
              className="text-sm font-medium text-[color:var(--c-texPri)] whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {label}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                color: "var(--c-texTer)",
              }}
            >
              <span
                style={{
                  padding: "0 8px",
                  borderRadius: "999px",
                  fontWeight: 600,
                  lineHeight: "18px",
                  ...statusStyles,
                }}
              >
                {statusMeta.label}
              </span>
              {pr.owner && pr.repo && (
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "140px",
                  }}
                >
                  {pr.owner}/{pr.repo}
                </span>
              )}
            </div>
          </div>
        );
      }

      case "file": {
        const attachments = Array.isArray(value) ? value : value ? [value] : [];
        if (attachments.length === 0) {
          return <span className="text-xs text-[color:var(--c-texTer,#9b9a97)]">No files</span>;
        }
        return (
          <div className="flex flex-wrap items-center gap-2">
            {attachments.slice(0, 2).map((file: any) => (
              <div key={file.id || file.url} className="flex items-center gap-1">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="max-w-[120px] truncate">{file.name || "Attachment"}</span>
                </a>
                <button
                  type="button"
                  className="rounded p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10"
                  onClick={(event) => {
                    event.stopPropagation();
                    void downloadAttachment(file);
                  }}
                  aria-label="Download attachment"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {attachments.length > 2 && (
              <span className="text-[12px] font-semibold text-[color:var(--c-texTer,#9b9a97)]">
                +{attachments.length - 2}
              </span>
            )}
          </div>
        );
      }

      case "text": {
        return (
          <span className="text-sm text-[color:var(--c-texPri)] whitespace-nowrap overflow-hidden text-ellipsis block max-w-[200px]">
            {String(value || "")}
          </span>
        );
      }

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
          <span className="text-sm text-[color:var(--c-texPri)] font-medium">
            {formatted}
          </span>
        ) : null;

        if (showAs === "bar") {
          const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));
          const colorStyles = getColorStyles(progressColor);
          return (
            <div className="flex items-center gap-3 w-full">
              {numberNode}
              <div className="flex-1 flex items-center">
                <div className="relative w-full rounded-full bg-gray-200/50 overflow-hidden h-1">
                  <div
                    className="absolute top-0 left-0 h-full transition-all duration-500 ease-out"
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
            <div className="flex items-center gap-2">
              {numberNode}
              <svg viewBox="0 0 14 14" width="20" height="20" className="flex-shrink-0">
                <circle
                  cx="7"
                  cy="7"
                  r="6"
                  fill="none"
                  strokeWidth="2"
                  style={{ stroke: 'rgba(229, 231, 235, 0.5)' }}
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
          <span className="text-sm text-[color:var(--c-texPri)]">
            {formatted}
          </span>
        );
      }

      case "formula": {
        const formulaReturnType = propSchema?.formulaReturnType;
        const formatOptions = {
          numberFormat: (propSchema as any)?.numberFormat,
          decimalPlaces: (propSchema as any)?.decimalPlaces,
        };
        const formatted = formatFormulaValue(value, formulaReturnType, formatOptions);
        const errorMessage = note.value.formulaErrors?.[property.id];
        const showAs = (propSchema as any)?.showAs || "number";
        const numValue = typeof value === "number" ? value : Number(value);
        const isValidNumeric = Number.isFinite(numValue);

        if (!errorMessage && isValidNumeric && (showAs === "bar" || showAs === "ring")) {
          const progressColor = (propSchema as any)?.progressColor || "blue";
          const progressDivideByRaw = (propSchema as any)?.progressDivideBy;
          const showNumberText = (propSchema as any)?.showNumberText !== false;
          const divideBy = progressDivideByRaw && progressDivideByRaw !== 0 ? progressDivideByRaw : 100;
          const colorStyles = getColorStyles(progressColor);
          const percentage = Math.min(100, Math.max(0, (numValue / divideBy) * 100));

          const numberNode = showNumberText ? (
            <span className="text-sm text-[color:var(--c-texPri)] font-medium mr-3">
              {formatted}
            </span>
          ) : null;

          if (showAs === "bar") {
            return (
              <div className="flex items-center gap-3 w-full">
                {numberNode}
                <div className="flex-1 flex items-center">
                  <div className="relative w-full rounded-full bg-gray-200/50 overflow-hidden h-1">
                    <div
                      className="absolute top-0 left-0 h-full transition-all duration-500 ease-out"
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
              <div className="flex items-center gap-2">
                {numberNode}
                <svg viewBox="0 0 14 14" width="20" height="20" className="flex-shrink-0">
                  <circle cx="7" cy="7" r="6" fill="none" strokeWidth="2" style={{ stroke: 'rgba(229, 231, 235, 0.5)' }} />
                  <g transform="rotate(-90 7 7)">
                    <circle
                      cx="7" cy="7" r="6" fill="none" strokeWidth="2" strokeLinecap="round"
                      strokeDasharray={circumference} strokeDashoffset={offset}
                      style={{ stroke: colorStyles.dot, transition: 'stroke-dashoffset 0.5s ease-out' }}
                    />
                  </g>
                </svg>
              </div>
            );
          }
        }

        return (
          <div className="flex flex-col max-w-full">
            <span
              className={`text-sm whitespace-nowrap overflow-hidden text-ellipsis ${errorMessage ? 'text-red-600' : 'text-[color:var(--c-texPri)]'}`}
              title={typeof formatted === 'string' ? formatted : undefined}
            >
              {formatted}
            </span>
            {errorMessage && (
              <span
                className="text-xs text-red-600 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                title={errorMessage}
              >
                {errorMessage}
              </span>
            )}
          </div>
        );
      }

      case "rollup": {
        const rollupResult = computeRollupData(
          note,
          propSchema,
          boardProperties,
          getNotesByDataSourceId,
          getDataSource,
        );

        if (rollupResult.state !== "ready") {
          return (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {rollupResult.message || "—"}
            </span>
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
            <span className="text-sm text-[color:var(--c-texPri)] font-medium mr-3">
              {displayValue}
            </span>
          ) : null;

          if (showAs === "bar") {
            return (
              <div className="flex items-center gap-3 w-full">
                {numberNode}
                <div className="flex-1 flex items-center">
                  <div className="relative w-full rounded-full bg-gray-200/50 overflow-hidden h-1">
                    <div
                      className="absolute top-0 left-0 h-full transition-all duration-500 ease-out"
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
              <div className="flex items-center gap-2">
                {numberNode}
                <svg viewBox="0 0 14 14" width="20" height="20" className="flex-shrink-0">
                  <circle cx="7" cy="7" r="6" fill="none" strokeWidth="2" style={{ stroke: 'rgba(229, 231, 235, 0.5)' }} />
                  <g transform="rotate(-90 7 7)">
                    <circle
                      cx="7" cy="7" r="6" fill="none" strokeWidth="2" strokeLinecap="round"
                      strokeDasharray={circumference} strokeDashoffset={offset}
                      style={{ stroke: colorStyles.dot, transition: 'stroke-dashoffset 0.5s ease-out' }}
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
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {displayValue}
            </span>
          );
        }

        if (calculation?.category === "percent") {
          const displayValue = formatNumericValue(percent ?? 0, { numberFormat: "percent", decimalPlaces });
          return (
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {displayValue}
            </span>
          );
        }

        if (isMath && numericValue !== undefined) {
          const displayValue = formatNumericValue(numericValue, { numberFormat, decimalPlaces });
          return (
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {displayValue}
            </span>
          );
        }

        if (values && values.length > 0) {
          return (
            <span
              className="text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap overflow-hidden text-ellipsis block max-w-full truncate"
              title={values.join(', ')}
            >
              {values.join(', ')}
            </span>
          );
        }

        return (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            No related values
          </span>
        );
      }

      default:
        return <span style={{ fontSize: '14px', color: 'var(--c-texPri)' }}>{String(value)}</span>;
    }
  };

  const renderNoteRow = (note: Block, noteIndex: number) => {
    const isDragging = draggedNoteId === note._id;
    const isDropTarget = dragOverNoteId === note._id;
    const showIndicator = isDropTarget && dragPosition;
    const isEditingTitle = editingTitleNoteId === note._id;

    const userOwnsNote = isOwner(note.value?.userEmail, true, user);

    return (
      <div
        key={note._id}
        draggable={userOwnsNote}
        className="flex hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer group border-b border-gray-100 dark:border-gray-800 w-full text-left relative flex-shrink-0"
        style={{
          opacity: isDragging ? 0.5 : 1,
          height: isEditingTitle ? 'auto' : '33px',
          minHeight: '33px'
        }}
        onDragStart={(e) => handleRowDragStart(e, note._id)}
        onDragEnd={handleRowDragEnd}
        onDragOver={(e) => handleRowDragOver(e, note._id)}
        onDragLeave={handleRowDragLeave}
        onDrop={(e) => handleRowDrop(e, note._id)}
        onClick={(e) => {
          // Only open sidebar if clicking on title column or empty space
          const target = e.target as HTMLElement;
          const isTitleColumn = target.closest('[data-property-id="title"]');
          if (isTitleColumn) {
            handleCardClick(note);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick(note);
          }
        }}
      >
        {/* Drop indicator above */}
        {showIndicator && dragPosition === "above" && (
          <div style={{
            position: 'absolute',
            top: '-1px',
            left: 0,
            right: 0,
            height: '2px',
            background: 'rgb(35, 131, 226)',
            zIndex: 10
          }} />
        )}
        {/* Drop indicator below */}
        {showIndicator && dragPosition === "below" && (
          <div style={{
            position: 'absolute',
            bottom: '-1px',
            left: 0,
            right: 0,
            height: '2px',
            background: 'rgb(35, 131, 226)',
            zIndex: 10
          }} />
        )}

        {/* Checkbox - appears on hover before the first column */}
        <div className="flex items-center h-full">
          <input
            type="checkbox"
            checked={selectedNotes.has(note._id)}
            onChange={(e) => {
              e.stopPropagation();
              handleSelectNote(note._id);
            }}
            className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-opacity ${selectedNotes.has(note._id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            aria-label={`Select task: ${note.value.title}`}
          />
        </div>

        {/* Property columns */}
        {propertyColumns.map((property, colIndex) => (
          <div
            key={property.id}
            className="flex items-center min-w-0 flex-shrink-0"
            data-property-id={property.id}
            style={{
              display: 'flex',
              width: `${columnWidths[property.id] ?? property.width}px`,
              height: '100%',
              position: 'relative',
              borderInlineEnd: '1px solid var(--ca-borSecTra, rgba(55, 53, 47, 0.16))',
              opacity: 1
            }}
          >
            <div style={{
              display: 'flex',
              overflowX: 'clip',
              height: isEditingTitle && property.id === 'title' ? 'auto' : '100%',
              width: `${columnWidths[property.id] ?? property.width}px`,
              opacity: 1
            }} className="cell-wrapper">
              <div
                className={`${canEditProperty(property.type) ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : 'cursor-default'}`}
                onClick={(e) => handleCellClick(e, note, property)}
                style={{
                  userSelect: 'none',
                  transition: 'background 20ms ease-in',
                  position: 'relative',
                  display: 'block',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  overflow: isEditingTitle && property.id === 'title' ? 'visible' : 'clip',
                  width: '100%',
                  whiteSpace: isEditingTitle && property.id === 'title' ? 'pre-wrap' : 'nowrap',
                  height: isEditingTitle && property.id === 'title' ? 'auto' : '36px',
                  minHeight: '36px',
                  paddingTop: '7.5px',
                  paddingBottom: '7.5px',
                  paddingInline: '8px',
                  borderRadius: '3px'
                }}
              >
                {renderPropertyValue(note, property)}
              </div>
            </div>
          </div>
        ))}

        {/* Empty space for scrollbar */}
        <div className="w-16 flex-shrink-0" />
      </div>
    );
  };

  // Early return if no board
  if (!board) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground">No board data</p>
          <p className="text-sm text-muted-foreground">Please select a valid board</p>
        </div>
      </div>
    );
  }

  const resolveGroupValue = (groupName: string): any => {
    console.log("resolveGroupValue ++", groupName)
    const groupByPropertyId = getGroupBy(board._id);
    console.log("groupByPropertyId ++", groupByPropertyId)
    if (!groupByPropertyId || !boardProperties) return null;
    const schema: any = (boardProperties as any)[groupByPropertyId];
    console.log("Schema ++", schema);
    if (!schema) return null;
    const name = groupName.trim();
    const lower = name.toLowerCase();
    switch (schema.type) {
      case "person": {
        if (lower === "unassigned" || lower === "no person" || lower.startsWith("no ")) return [];
        const member = (workspaceMembers || []).find((m: any) => m.userName === name || m.userEmail === name);
        return member ? [member] : [];
      }
      case "multi_select": {
        if (lower.startsWith("no ")) return [];
        // groupName is now the display name; look up option to get its ID
        const opt = schema.options?.find((o: any) => o.name === name);
        return opt ? [opt.id] : [name];
      }
      case "status":
      case "select":
      case "priority": {
        if (lower.startsWith("no ")) return null;
        // groupName is now the display name; look up option to get its ID
        const opt = schema.options?.find((o: any) => o.name === name);
        return opt ? opt.id : name;
      }
      case "checkbox": {
        return lower === "true" || lower === "checked";
      }
      case "date": {
        return name === "—" || lower.startsWith("no ") ? null : name;
      }
      default: {
        return name === "—" || lower.startsWith("no ") ? null : name;
      }
    }
  };

  const isGrouped = getGroupBy(board._id) && Object.keys(groupedNotes).length > 1;

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
    <>
      <style>{`
        .cell-wrapper:hover .open-sidebar-btn {
          opacity: 1 !important;
        }
        .cell-wrapper:hover .open-sidebar-btn:hover {
          background: rgba(55, 53, 47, 0.08);
        }
      `}</style>
      <div
        className="flex h-full max-w-full bg-white dark:bg-background"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: 'var(--c-bacPri, #ffffff)',
          flexGrow: 1,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          maxHeight: 'inherit',
          width: '100%',
          overflow: 'hidden'
        }}
      >
        {/* Main List View */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedNotes.size > 0 && (
            <div data-group-toolbar className="mb-2">
              <GroupActionBar
                selectedCount={selectedNotes.size}
                properties={propertyColumns.map((p) => ({ id: p.id, name: p.name, type: p.type, icon: p.icon }))}
                onOpenEditor={handleOpenGroupEditor}
                onDeleteSelected={requestDeleteSelected}
                onClearSelection={() => {
                  setSelectedNotes(new Set());
                  handleCloseEditor();
                }}
              />
            </div>
          )}
          {/* Table Container with proper horizontal scrolling */}
          <div
            className="flex-1 overflow-x-auto overflow-y-auto"
            style={{
              marginTop: '4px',
              minWidth: 0,
              maxWidth: '100%'
            }}
          >
            <div
              className="min-w-full"
              style={{
                width: `${Math.max(totalColumnsWidth + 36, 708)}px` // 36px for checkbox column, min 708px
              }}
            >
              {/* Table Header - MainHeaderRow */}
              <MainHeaderRow
                propertyColumns={propertyColumns}
                columnWidths={columnWidths}
                boardId={board._id}
                filters={getFilters(board._id)}
                sortBy={getSortBy(board._id)}
                selectedAllChecked={selectedNotes.size === Object.values(groupedNotes).flat().length && Object.values(groupedNotes).flat().length > 0}
                onToggleSelectAll={handleSelectAllWrapper}
                draggedColumnIndex={draggedColumnIndex}
                dragOverColumnIndex={dragOverColumnIndex}
                onDragStart={handleColumnDragStart}
                onDragOver={handleColumnDragOver}
                onDragLeave={handleColumnDragLeave}
                onDrop={handleColumnDrop}
                onPropertyHeaderClick={handlePropertyHeaderClick}
                onColumnResizeMouseDown={handleColumnResizeMouseDown}
                onClickAddProperty={() => {
                  if (addPropertyBtnRef.current) {
                    const rect = addPropertyBtnRef.current.getBoundingClientRect();
                    setPropertyDialogPosition({ top: rect.bottom + 4, left: rect.left });
                  }
                  setInsertionTarget(null);
                  setShowPropertyDialog((prev) => !prev);
                }}
                addPropertyBtnRef={addPropertyBtnRef}
              />

              {/* Table Body - Books by ReventLabs  style */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  handleRowDrop(e, null);
                }}
              >
                {Object.values(groupedNotes).flat().length === 0 ? (
                  <div className="flex items-center justify-center py-2 text-gray-500 dark:text-gray-400">
                    {/* <div className="text-center">
                      <p className="text-lg font-medium">No tasks yet</p>
                      <p className="text-sm">Click "New page" to get started</p>
                    </div> */}
                  </div>
                ) : isGrouped ? (
                  Object.entries(groupedNotes)
                    .sort(([a], [b]) => {
                      const groupByProp = boardProperties?.[getGroupBy(board._id) || ""];
                      const unassignedLabel = "No " + (groupByProp?.name || "Group");
                      const isUnassignedA = a === "Unassigned" || a === "No relations" || a === unassignedLabel;
                      const isUnassignedB = b === "Unassigned" || b === "No relations" || b === unassignedLabel;
                      if (isUnassignedA && !isUnassignedB) return 1;
                      if (!isUnassignedA && isUnassignedB) return -1;
                      return 0;
                    })
                    .map(([groupName, groupNotes]) => (
                      <GroupSection
                        key={groupName}
                        groupName={groupName}
                        groupNotes={groupNotes as Block[]}
                        collapsed={!!collapsedGroups[groupName]}
                        onToggleCollapse={toggleGroupCollapse}
                        renderNoteRow={(note, idx) => renderNoteRow(note, idx)}
                        propertyColumns={propertyColumns}
                        columnWidths={columnWidths}
                        filters={getFilters(board._id)}
                        sortBy={getSortBy(board._id)}
                        boardId={board._id}
                        showAddRowForGroup={showAddRowForGroup}
                        setShowAddRowForGroup={setShowAddRowForGroup}
                        newRowTitleForGroup={newRowTitleForGroup}
                        setNewRowTitleForGroup={setNewRowTitleForGroup}
                        groupByPropertyId={getGroupBy(board._id)}
                        boardProperties={boardProperties}
                        workspaceMembers={workspaceMembers}
                        onCreateInGroup={createNoteInGroup}
                        draggedColumnIndex={draggedColumnIndex}
                        dragOverColumnIndex={dragOverColumnIndex}
                        onDragStart={handleColumnDragStart}
                        onDragOver={handleColumnDragOver}
                        onDragLeave={handleColumnDragLeave}
                        onDrop={handleColumnDrop}
                        onPropertyHeaderClick={handlePropertyHeaderClick}
                        onColumnResizeMouseDown={handleColumnResizeMouseDown}
                        onClickAddProperty={() => {
                          if (addPropertyBtnRef.current) {
                            const rect = addPropertyBtnRef.current.getBoundingClientRect();
                            setPropertyDialogPosition({ top: rect.bottom + 4, left: rect.left });
                          }
                          setInsertionTarget(null);
                          setShowPropertyDialog((prev) => !prev);
                        }}
                        addPropertyBtnRef={addPropertyBtnRef}
                        groupAllSelected={(groupNotes as Block[]).length > 0 && (groupNotes as Block[]).every(n => selectedNotes.has(n._id))}
                        onToggleGroupSelect={() => {
                          setSelectedNotes((prev) => {
                            const next = new Set(prev);
                            const allSelected = (groupNotes as Block[]).every(n => next.has(n._id));
                            if (allSelected) {
                              (groupNotes as Block[]).forEach(n => next.delete(n._id));
                            } else {
                              (groupNotes as Block[]).forEach(n => next.add(n._id));
                            }
                            return next;
                          });
                        }}
                        onDropNote={(e) => {
                          handleRowDrop(e, null, resolveGroupValue(groupName));
                        }}
                      />
                    ))
                ) : (
                  // Render ungrouped notes
                  Object.values(groupedNotes).flat().map((note, idx) => renderNoteRow(note, idx))
                )}
              </div>

              {/* Add New page Row - simple single row */}
              {!showAddRow ? (
                <div className="flex border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 h-9 group mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewRowTitle(""); // Clear any previous title
                      setShowAddRow(true);
                    }}
                    className="flex items-center gap-1.5 pl-4 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors w-full text-left"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M8 2.74a.66.66 0 0 1 .66.66v3.94h3.94a.66.66 0 0 1 0 1.32H8.66v3.94a.66.66 0 0 1-1.32 0V8.66H3.4a.66.66 0 0 1 0-1.32h3.94V3.4A.66.66 0 0 1 8 2.74" />
                    </svg>
                    New page
                  </button>
                </div>
              ) : (
                <div className="flex border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 h-9 mb-2">
                  {/* Title input spanning across */}
                  <div className="flex-1 flex items-center px-2 pl-5">
                    <input
                      type="text"
                      value={newRowTitle}
                      onChange={(e) => setNewRowTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAddNewRow();
                        } else if (e.key === "Escape") {
                          setShowAddRow(false);
                          setNewRowTitle("");
                        }
                      }}
                      onBlur={handleAddNewRow}
                      placeholder="New page"
                      className="w-full bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                      autoFocus
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Add Property Dialog - Fixed positioning below the + button */}
        {showPropertyDialog && (
          <>
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-transparent z-[190]"
              onClick={() => setShowPropertyDialog(false)}
            />
            {/* Dialog positioned below the + button */}
            <div
              className="fixed z-[200] border border-gray-200 rounded-md shadow-xl dark:border-[#3c3c3c]"
              style={{
                top: `${propertyDialogPosition.top}px`,
                left: `${propertyDialogPosition.left}px`
              }}
            >
              <AddPropertyDialog
                triggerRef={addPropertyBtnRef}
                onSelect={async (propertyType, options?: any) => {
                  if (propertyType === "relation" && options?.showViewSelector) {
                    // Don't create property yet - fetch views first, then show selector
                    setShowPropertyDialog(false);
                    setLoadingRelationViews(true);
                    setShowRelationViewSelector(true);

                    try {
                      // Call get all data sources API
                      const workspaceId = currentWorkspace?._id;
                      const response: any = await getWithAuth(`/api/database/getdataSource/getAll`);

                      if (response && !response.isError && response.success && Array.isArray(response.datasources)) {
                        // Filter out current data source (the one used by the current view)
                        const currentDataSourceId = getCurrentDataSourceId();
                        let filteredDataSources = response.datasources;
                        if (currentDataSourceId) {
                          filteredDataSources = response.datasources.filter((dataSource: DatabaseSource) => dataSource._id !== currentDataSourceId);
                        }
                        setRelationDataSources(filteredDataSources);
                      } else if (response && response.isError) {
                        toast.error(response.message || "Failed to fetch views");
                      }
                    } catch (err) {
                      toast.error("Failed to fetch views");
                    } finally {
                      setLoadingRelationViews(false);
                    }

                    return null;
                  }
                  const created = await handleAddProperty(propertyType, options);
                  if (created?.id) {
                    insertPropertyIntoOrder(created.id);
                  }
                  setShowPropertyDialog(false);
                  return created;
                }}
                onClose={() => setShowPropertyDialog(false)}
              />
            </div>
          </>
        )}

        {/* Relation View Selector */}
        {showRelationViewSelector && (
          <>
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-transparent z-[190]"
              onClick={() => {
                setShowRelationViewSelector(false);
                setRelationDataSources([]);
              }}
            />
            {/* Dialog positioned same as AddPropertyDialog */}
            <div
              className="fixed z-[200] border border-gray-200 rounded-md shadow-xl dark:border-[#3c3c3c]"
              style={{
                top: `${propertyDialogPosition.top}px`,
                left: `${propertyDialogPosition.left}px`
              }}
            >
              <RelationViewSelector
                key={`relation-selector-${showRelationViewSelector}`}
                isOpen={true}
                loading={loadingRelationViews}
                dataSources={relationDataSources}
                onClose={() => {
                  setShowRelationViewSelector(false);
                  setRelationDataSources([]);
                }}
                onSelectView={async (dataSourceId, dataSourceTitle) => {
                  try {
                    // Find the selected data source
                    const selectedDataSource = relationDataSources.find((ds: any) => ds._id === dataSourceId);

                    if (!selectedDataSource) {
                      toast.error("Selected data source not found");
                      return;
                    }

                    const databaseSourceId = selectedDataSource._id;

                    if (!databaseSourceId) {
                      toast.error("Could not find database source for selected data source");
                      return;
                    }

                    // Store the pending relation data and show config modal
                    setPendingRelationData({
                      dataSourceId,
                      dataSourceTitle,
                      databaseSourceId,
                    });
                    setShowRelationViewSelector(false);
                    setShowRelationConfigModal(true);
                  } catch (err) {
                    console.error("Error selecting relation view:", err);
                    toast.error("Failed to load notes for selected view");
                  } finally {
                    setRelationDataSources([]);
                  }
                }}
              />
            </div>
          </>
        )}

        {/* Relation Configuration Modal */}
        {showRelationConfigModal && pendingRelationData && (
          <>
            <div
              className="fixed inset-0 bg-transparent z-[190]"
              onClick={() => {
                if (isRelationLoading) return;
                setShowRelationConfigModal(false);
                setPendingRelationData(null);
              }}
            />
            <div
              className="fixed z-[200] border border-gray-200 rounded-md shadow-xl dark:border-[#3c3c3c]"
              style={{
                top: `${propertyDialogPosition.top}px`,
                left: `${propertyDialogPosition.left}px`
              }}
            >
              <RelationConfigModal
                isOpen={showRelationConfigModal}
                selectedViewTitle={pendingRelationData.dataSourceTitle}
                isLoading={isRelationLoading}
                onClose={() => {
                  if (isRelationLoading) return;
                  setShowRelationConfigModal(false);
                  setPendingRelationData(null);
                }}
                onConfirm={async (config) => {
                  setIsRelationLoading(true);
                  try {
                    const { dataSourceId, dataSourceTitle, databaseSourceId } = pendingRelationData;

                    // Create the relation property with configuration
                    const created = await handleAddProperty(
                      "relation",
                      [{ id: dataSourceId, name: dataSourceTitle }],
                      databaseSourceId,
                      {
                        relationLimit: config.relationLimit,
                        twoWayRelation: config.twoWayRelation,
                      },
                      config.propertyName
                    );

                    if (created?.id) {
                      insertPropertyIntoOrder(created.id);
                    }

                    setShowRelationConfigModal(false);
                    setPendingRelationData(null);
                  } catch (err) {
                    toast.error("Failed to create relation property");
                    console.error(err);
                  } finally {
                    setIsRelationLoading(false);
                  }
                }}
              />
            </div>
          </>
        )}

        {/* Cell Editor */}
        {editingCell && (() => {
          const propertyId = editingCell.propertyId;
          const fullProperty: BoardProperty | undefined = boardProperties?.[propertyId];
          const columnProperty = propertyColumns.find(p => p.id === propertyId);

          // Create base property object with all fields from boardProperties
          const baseProperty: BoardProperty = fullProperty || {
            name: '',
            type: 'text',
            default: false,
            showProperty: true,
          };

          return (
            <div data-cell-editor>
              <CellEditor
                isVisible={true}
                value={groupEditingPropertyId ? undefined : localNotes.find(n => n._id === editingCell.noteId)?.value.databaseProperties?.[propertyId]}
                property={{
                  // Spread full property schema first (includes decimalPlaces, showAs, etc.)
                  ...baseProperty,
                  // Override with specific fields to ensure correct values
                  id: propertyId,
                  name: columnProperty?.name || baseProperty.name || '',
                  type: (columnProperty?.type || baseProperty.type) as BoardProperty['type'],
                  options: baseProperty.options || [],
                  placeholder: `Enter ${(columnProperty?.name || baseProperty.name || 'value').toLowerCase()}...`,
                  linkedDatabaseId: baseProperty.linkedDatabaseId,
                  relationLimit: baseProperty.relationLimit,
                  syncedPropertyId: baseProperty.syncedPropertyId,
                  syncedPropertyName: baseProperty.syncedPropertyName,
                  numberFormat: baseProperty.numberFormat,
                  decimalPlaces: baseProperty.decimalPlaces,
                  showAs: baseProperty.showAs,
                  progressColor: baseProperty.progressColor,
                  progressDivideBy: baseProperty.progressDivideBy,
                  showNumberText: baseProperty.showNumberText,
                  rollup: baseProperty.rollup,
                  formula: baseProperty.formula,
                  formulaReturnType: baseProperty.formulaReturnType,
                  githubPrConfig: baseProperty.githubPrConfig,
                  displayProperties: baseProperty.displayProperties,
                  settingforForm: baseProperty.settingforForm,
                  formMetaData: baseProperty.formMetaData,
                  default: baseProperty.default,
                  showProperty: baseProperty.showProperty,
                }}
                note={localNotes.find(n => n._id === editingCell.noteId)!}
                boardId={board._id}
                onUpdate={handleCellUpdate}
                onClose={handleCloseEditor}
                position={editingCell.position}
                workspaceMembers={workspaceMembers}
              />
            </div>
          );
        })()}

        {/* Property Header Dropdown */}
        {propertyHeaderDropdown && dropdownPosition && (
          <>
            {/* Backdrop overlay for click outside detection */}
            <div
              className="fixed inset-0 bg-transparent z-[9998]"
              onClick={() => {
                setPropertyHeaderDropdown(null);
                setDropdownPosition(null);
              }}
            />

            <div
              className="fixed z-[9999]"
              data-dropdown="property-header"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
              }}
            >
              <PropertyHeaderDropdown
                property={{
                  id: propertyHeaderDropdown.propertyId,
                  name: boardProperties?.[propertyHeaderDropdown.propertyId]?.name || propertyHeaderDropdown.propertyId,
                  type: boardProperties?.[propertyHeaderDropdown.propertyId]?.type || 'text',
                }}
                boardProperty={boardProperties?.[propertyHeaderDropdown.propertyId]}
                onClose={() => {
                  setPropertyHeaderDropdown(null);
                  setDropdownPosition(null);
                }}
                onSort={(direction) => handlePropertySort(propertyHeaderDropdown.propertyId, direction)}
                onFilter={handlePropertyFilter}
                onGroup={() => handlePropertyGroup(propertyHeaderDropdown.propertyId)}
                onHide={() => handlePropertyHide(propertyHeaderDropdown.propertyId)}
                onEdit={() => handlePropertyEdit(propertyHeaderDropdown.propertyId)}
                onWrapInView={handlePropertyWrapInView}
                onDisplayAs={handlePropertyDisplayAs}
                onInsertLeft={() => {
                  const rect = propertyHeaderDropdown.anchorElement.getBoundingClientRect();
                  setPropertyDialogPosition({ top: rect.bottom + 4, left: rect.left });
                  setInsertionTarget({ targetPropertyId: propertyHeaderDropdown.propertyId, side: 'left', anchorElement: propertyHeaderDropdown.anchorElement });
                  setShowPropertyDialog(true);
                }}
                onInsertRight={() => {
                  const rect = propertyHeaderDropdown.anchorElement.getBoundingClientRect();
                  setPropertyDialogPosition({ top: rect.bottom + 4, left: rect.left });
                  setInsertionTarget({ targetPropertyId: propertyHeaderDropdown.propertyId, side: 'right', anchorElement: propertyHeaderDropdown.anchorElement });
                  setShowPropertyDialog(true);
                }}
                hasFilters={!!getFilters(board._id)?.[propertyHeaderDropdown.propertyId]?.length}
                hasSorts={!!getSortBy(board._id)?.find(s => s.propertyId === propertyHeaderDropdown.propertyId)}
                isGrouped={getGroupBy(board._id) === propertyHeaderDropdown.propertyId}
                onRemoveSort={() => handleRemoveSortFromProperty(propertyHeaderDropdown.propertyId)}
                board={board}
                filters={getFilters(board._id) || {}}
                sortBy={getSortBy(board._id) || []}
                onApplyFilters={handleApplyFilters}
                onApplySort={(newSorts) => {
                  // Get current viewTypeId
                  const currentViewData = currentView[board._id];
                  const latestBoard = getBlock(board._id) || board;
                  let view;
                  if (currentViewData?.id) {
                    view = latestBoard.value?.viewsTypes?.find((v) => v._id === currentViewData.id);
                  } else if (currentViewData?.type) {
                    view = latestBoard.value?.viewsTypes?.find((v) => v.viewType === currentViewData.type);
                  }
                  const viewTypeId = view?._id || null;
                  if (viewTypeId) {
                    setBoardSortBy(viewTypeId, newSorts);
                  }
                }}
              />
            </div>
          </>
        )}


        {/* Edit Property Modal */}
        {editingPropertyId && boardProperties?.[editingPropertyId] && (
          <EditSinglePropertyModal
            board={board}
            propertyId={editingPropertyId}
            property={boardProperties[editingPropertyId]!}
            onClose={() => setEditingPropertyId(null)}
            onBack={() => setEditingPropertyId(null)}
          />
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
                  setLocalNotes((prev) => prev.map((note) => (note._id === updatedNote._id ? updatedNote : note)));
                  updateBlock(updatedNote._id, updatedNote);
                }}
                updateNoteTitleLocally={updateNoteTitleLocally}
                persistNoteTitleChange={persistNoteTitleChangeHandler}
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
                  setLocalNotes((prev) => prev.map((note) => (note._id === updatedNote._id ? updatedNote : note)));
                  // Update in global block context
                  updateBlock(updatedNote._id, updatedNote);
                }}
                updateNoteTitleLocally={updateNoteTitleLocally}
                persistNoteTitleChange={persistNoteTitleChangeHandler}
              />
            ),
            document.body
          )}

        {/* Group Delete Confirmation Modal */}
        <DeleteConfirmationModal
          header="Delete Tasks"
          isOpen={showDeleteConfirm}
          onCancel={cancelDelete}
          onConfirm={confirmDeleteSelected}
          isDeleting={isDeleting}
          entity={pendingDeletion?.count === 1 ? "task" : "tasks"}
          count={pendingDeletion?.count || selectedNotes.size}
          singleTitle={
            pendingDeletion?.count === 1 && pendingDeletion.noteIds.length > 0
              ? localNotes.find((n) => n._id === pendingDeletion.noteIds[0])?.value.title
              : selectedNotes.size === 1
                ? localNotes.find((n) => selectedNotes.has(n._id))?.value.title
                : undefined
          }
        />
      </div>
    </>
  );
}
