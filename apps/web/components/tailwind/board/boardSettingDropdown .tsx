"use client";

import CardPropertiesEditor from "@/components/tailwind/board/boardView/cardPropertiesEditor";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { deleteWithAuth, postWithAuth } from "@/lib/api-helpers";
import { updateCollectionViewBlock } from "@/lib/collectionViewHelpers";
import type { BoardProperty, Note, ViewCollection } from "@/types/board";
import { ObjectId } from "bson";
import { createSprintTemplate } from "../../../lib/sprintTemplate";
import { generateSprintsDatabaseCore, generateSprintBoardAndPages } from "@/lib/convertSprintTemplate";
import { serializeDataSourceForAPI, serializeViewDatabaseForAPI } from "@/lib/collectionViewTemplate";
import {
  updateFilters,
  updateSorts,
  updatePropertyVisibility,
  updateGroupByPropertyId,
  toggleLock,
} from "@/services-frontend/boardServices/databaseSettingsService";
import {
  Calendar,
  Clock,
  LayoutGrid,
  List,
  FileText,
} from "lucide-react";
import { DropdownMenu, DropdownMenuIcons, DropdownMenuHeader, DropdownMenuSearch, DropdownMenuSectionHeading, DropdownMenuEditableItem } from "@/components/tailwind/ui/dropdown-menu";
import type { DropdownMenuItemProps } from "@/components/tailwind/ui/dropdown-menu";
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import EditPropertiesModal from "./editPropertiesModal";
import EditSinglePropertyModal from "./editSinglePropertyModal";
import FilterPropertiesModal from "./filterPropertiesModal";
import { Editor } from "@tiptap/core";
import GroupByPropertiesModal from "./groupByPropertiesModal";
import GroupModal from "./groupModal";
import LayoutSettingsModal from "./layoutSettingsModal";
import SortModal from "./sortPropertiesModel";
import DeleteConfirmationModal from "../ui/deleteConfirmationModal";
import ChartSettingsModal from "./chartView/ChartSettingsModal";
import SprintSetupModal, { type SprintPropertySelections } from "./SprintSetupModal";
import { EMOJI_CATEGORIES } from "../editor/EmojiPicker";
import DataSourceSettingModal from "./dataSourceSettingModel";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { handleSubmitScreen } from "@/services-frontend/form/formViewService";
import FormAddPropertyDialog from "./formView/FormAddPropertyDialog";
import { useDatabaseProperties } from "@/hooks/use-viewProperty";
import { Block } from "@/types/block";

interface BoardSettingsDropdownProps {
  board: Block;
  boardProperties: Record<string, BoardProperty>;
  onClose: () => void;
  editor?: Editor | null;
  triggerRef?: React.RefObject<HTMLElement>;
}

export default function BoardSettingsDropdown({ board, boardProperties, onClose, editor, triggerRef }: BoardSettingsDropdownProps) {
  const boardId = board._id;
  const [showPropertiesEditor, setShowPropertiesEditor] = useState(false);
  const [showEditPropertiesModal, setShowEditPropertiesModal] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [showGroupBySelector, setShowGroupBySelector] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSavingIcon, setIsSavingIcon] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  // Datasource settings state
  const [dataSourceName, setDataSourceName] = useState("");
  const [lastSavedDataSourceTitle, setLastSavedDataSourceTitle] = useState("");
  const [currentDataSourceIcon, setCurrentDataSourceIcon] = useState("");
  const [lastSavedDataSourceIcon, setLastSavedDataSourceIcon] = useState("");
  const [isSavingDataSourceName, setIsSavingDataSourceName] = useState(false);
  const [isSavingDataSourceIcon, setIsSavingDataSourceIcon] = useState(false);
  const [isEditingDataSourceName, setIsEditingDataSourceName] = useState(false);
  const [showDataSourceEmojiPicker, setShowDataSourceEmojiPicker] = useState(false);
  const dataSourceIconButtonRef = useRef<HTMLButtonElement>(null);

  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  const [showAddQuestionDialog, setShowAddQuestionDialog] = useState(false);
  const [addQuestionDialogPosition, setAddQuestionDialogPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const { groupBy, setGroupBy, getGroupBy, filters, setBoardFilters, getFilters, sortBy, setBoardSortBy, getSortBy, chartSettings, currentView, setCurrentView, getCurrentDataSourceProperties, dataSources, setPropertyVisibility, getPropertyVisibility, propertyVisibility, updateDataSource, setDataSource, setCurrentDataSource } =
    useBoard();
  const { getBlock, updateBlock, removeBlock, addBlock, upsertBlocks } = useGlobalBlocks();
  const { currentWorkspace } = useWorkspaceContext();


  // Get collection_view block from global block context
  const collectionViewBlock = getBlock(boardId);
  const collectionViewData = collectionViewBlock?.blockType === "collection_view"
    ? (collectionViewBlock.value as ViewCollection)
    : null;
  const dummyNote = useMemo<Block>(() => ({
    _id: `board-settings-dummy-${boardId}`,
    blockType: "page",
    parentId: boardId,
    value: {
      title: "Dummy Note for Board Settings",
    },
    workspaceId: "",
    parentType: "collection",
    workareaId: null,
    blockIds: [],
    status: "alive",
  }), [boardId]);
  const { handleAddProperty } = useDatabaseProperties(board, dummyNote, () => { });

  // Get properties from current data source instead of board
  const currentDataSourceProperties = getCurrentDataSourceProperties(boardId);
  // Use data source properties if available, otherwise fallback to prop (for backward compatibility)
  const effectiveBoardProperties = currentDataSourceProperties && Object.keys(currentDataSourceProperties).length > 0
    ? currentDataSourceProperties
    : boardProperties;

  // Get current view - stores both id and type
  const currentViewData = currentView[board._id];
  const boardView = currentViewData?.type || board.value.viewsTypes?.[0]?.viewType || "board";
  const isFormsView = (boardView as string) === "forms";

  // IMPORTANT: Always match by view ID first, only use type as fallback
  let currentViewObj;
  if (currentViewData?.id) {
    // Prioritize ID match - if currentViewData.id exists, ONLY match by ID
    currentViewObj = board.value.viewsTypes?.find((v) => v._id === currentViewData.id);
  } else if (currentViewData?.type) {
    // Fallback to type match if no ID
    currentViewObj = board.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
  }

  // Get current view's title - must match by ID if ID exists
  const getCurrentViewTitle = () => {
    if (currentViewData?.id) {
      // Find view by ID specifically
      const viewById = board.value.viewsTypes?.find((v) => v._id === currentViewData.id);
      return viewById?.title || boardView.charAt(0).toUpperCase() + boardView.slice(1);
    }
    // Fallback to type match if no ID
    return currentViewObj?.title || boardView.charAt(0).toUpperCase() + boardView.slice(1);
  };

  // Get current view's icon - must match by ID if ID exists
  const getCurrentViewIcon = () => {
    if (currentViewData?.id) {
      // Find view by ID specifically
      const viewById = board.value.viewsTypes?.find((v) => v._id === currentViewData.id);
      return viewById?.icon || "";
    }
    // Fallback to type match if no ID
    return currentViewObj?.icon || "";
  };

  const [viewName, setViewName] = useState(getCurrentViewTitle());
  const [lastSavedTitle, setLastSavedTitle] = useState(getCurrentViewTitle());
  const [currentViewIcon, setCurrentViewIcon] = useState(getCurrentViewIcon());
  const [lastSavedIcon, setLastSavedIcon] = useState(getCurrentViewIcon());

  // Get view icon
  const getViewIcon = (view: string) => {
    switch (view) {
      case "board":
        return LayoutGrid;
      case "list":
        return List;
      case "calendar":
        return Calendar;
      case "timeline":
        return Clock;
      case "forms":
        return FileText;
      default:
        return LayoutGrid;
    }
  };

  const CurrentViewIcon = getViewIcon(boardView);

  // Get current viewTypeId
  const currentViewTypeId = currentViewObj?._id ? (typeof currentViewObj._id === "string" ? currentViewObj._id : String(currentViewObj._id)) : null;

  // Get settings for current view (using viewTypeId)
  const selectedGroupByProperty = currentViewTypeId ? groupBy[currentViewTypeId] : undefined;
  const propertyVisibilityForBoard = currentViewTypeId ? (propertyVisibility[currentViewTypeId] || []) : [];
  const visiblePropertiesCount = propertyVisibilityForBoard.length;
  const filtersForBoard = currentViewTypeId ? (filters[currentViewTypeId] || {}) : {};
  const filterCount = Object.keys(filtersForBoard).reduce((acc, key) => acc + (filtersForBoard[key]?.length || 0), 0);
  const sortsForBoard = currentViewTypeId ? (sortBy[currentViewTypeId] || []) : [];

  const modalRef = useRef<HTMLDivElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const [emojiSearchTerm, setEmojiSearchTerm] = useState("");
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>("Recent");
  const emojiCategoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const filteredEmojis = useMemo(() => {
    if (!emojiSearchTerm) return EMOJI_CATEGORIES;

    const filtered: Record<string, string[]> = {};
    Object.entries(EMOJI_CATEGORIES).forEach(([category, emojis]) => {
      const matches = emojis.filter((emoji) => emoji.includes(emojiSearchTerm));
      if (matches.length > 0) {
        filtered[category] = matches;
      }
    });
    return filtered;
  }, [emojiSearchTerm]);

  const scrollToEmojiCategory = useCallback((category: string) => {
    const element = emojiCategoryRefs.current[category];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Sync viewName, lastSavedTitle, and icon when board or current view changes from context (from external sources)
  useEffect(() => {
    if (isSavingName || isSavingIcon || isEditingName) return; // Don't sync while saving or typing

    const latestBoard = getBlock(boardId) || board;
    const currentViewData = currentView[boardId];

    let view;
    if (currentViewData?.id) {
      view = latestBoard.value.viewsTypes?.find((v) => v._id === currentViewData.id);
    } else if (currentViewData?.type) {
      view = latestBoard.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
    }

    // Final fallback to first view
    if (!view) {
      view = latestBoard.value.viewsTypes?.[0];
    }

    const newTitle = view?.title || (view?.viewType ? view.viewType.charAt(0).toUpperCase() + view.viewType.slice(1) : "") || "Board";
    const newIcon = view?.icon || "";

    // Only sync if the title changed from an external source (not from our optimistic update)
    if (newTitle !== viewName) {
      setViewName(newTitle);
      setLastSavedTitle(newTitle);
    }

    // Sync icon if it changed from an external source
    if (newIcon !== currentViewIcon) {
      setCurrentViewIcon(newIcon);
      setLastSavedIcon(newIcon);
    }
  }, [boardId, currentView, board.value.viewsTypes, boardView, isSavingName, isSavingIcon, isEditingName]);

  // Sync datasource name and icon
  useEffect(() => {
    if (isSavingDataSourceName || isSavingDataSourceIcon || isEditingDataSourceName) return;

    const dataSourceId = currentViewObj?.databaseSourceId;
    if (!dataSourceId) return;

    const normalizedId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);
    const dataSource = dataSources[normalizedId];

    if (dataSource) {
      const newDSName = dataSource.title || "";
      const newDSIcon = dataSource.icon || "";

      if (newDSName !== dataSourceName) {
        setDataSourceName(newDSName);
        setLastSavedDataSourceTitle(newDSName);
      }
      if (newDSIcon !== currentDataSourceIcon) {
        setCurrentDataSourceIcon(newDSIcon);
        setLastSavedDataSourceIcon(newDSIcon);
      }
    }
  }, [currentViewObj, dataSources, isSavingDataSourceName, isSavingDataSourceIcon, isEditingDataSourceName]);

  const handleEditCard = () => setShowPropertiesEditor(true);
  const handleEditProperties = () => setShowEditPropertiesModal(true);
  const handleGroupByCard = () => setShowGroupBySelector(true);
  const handleFilterCard = () => setShowFilterModal(true);
  const handleSortCard = () => setShowSortModal(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showViewDeleteConfirm, setShowViewDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLayout = () => {
    setShowLayoutModal(true);
  };

  const handlePropertyClick = (propertyId: string) => {
    setEditingPropertyId(propertyId);
  };

  const handleBackToEditProperties = () => {
    setEditingPropertyId(null);
  };

  const handleDataSources = () => {
    setShowDataSourceModal(true);
  }

  const handleSubGroup = () => {
    toast.info("Sub-group coming soon");
  };

  const handleConditionalColor = () => {
    toast.info("Conditional color coming soon");
  };

  const [showSprintModal, setShowSprintModal] = useState(false);
  const [isTurningOnSprint, setIsTurningOnSprint] = useState(false);

  const openSprintModal = () => {
    setShowSprintModal(true);
  };

  const handleAutomations = () => {
    toast.info("Automations coming soon");
  };

  const handleSprint = async (selections: SprintPropertySelections) => {
    setIsTurningOnSprint(true);
    // Prevent converting a board that is already a Sprint board
    const dataSourceId = currentViewObj?.databaseSourceId;
    if (!dataSourceId) {
      setIsTurningOnSprint(false);
      return;
    }
    const normalizedId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);

    const currentDataSource = dataSources[normalizedId];
    if (currentDataSource?.isSprint) {
      toast.info("This Database is already a Sprint tracking system.");
      setIsTurningOnSprint(false);
      return;
    }

    const toastId = toast.loading("Converting board to Sprint Tracker...");
    const createdPropIds: string[] = [];
    const markedSpecialPropIds: string[] = [];

    try {
      // Helper: mark an existing property as specialProperty via API
      const markSpecial = async (propId: string) => {
        const prop = currentDataSource?.properties?.[propId];
        if (!prop || prop.specialProperty) return;

        await postWithAuth("/api/database/updatePropertySchema", {
          dataSourceId: normalizedId,
          propertyId: propId,
          specialProperty: true,
          newName: prop.name,
          type: prop.type,
          blockId: board._id,
        });
        markedSpecialPropIds.push(propId);
      };

      // Resolve assignee
      let assigneePropId: string | undefined;
      if (selections.assigneeId !== "new") {
        assigneePropId = selections.assigneeId;
        await markSpecial(assigneePropId);
      } else if (handleAddProperty) {
        const added = await handleAddProperty("person", undefined, undefined, undefined, "Assignee", undefined, true);
        if (added) {
          assigneePropId = added.id;
          createdPropIds.push(added.id);
        }
      }

      // Resolve due date
      let dueDatePropId: string | undefined;
      if (selections.dueDateId !== "new") {
        dueDatePropId = selections.dueDateId;
        await markSpecial(dueDatePropId);
      } else if (handleAddProperty) {
        const added = await handleAddProperty("date", undefined, undefined, undefined, "Due Date", undefined, true);
        if (added) {
          dueDatePropId = added.id;
          createdPropIds.push(added.id);
        }
      }

      // Resolve status
      let statusPropId: string | undefined;
      let statusPropOptions: any[] | undefined;
      if (selections.statusId !== "new") {
        statusPropId = selections.statusId;
        statusPropOptions = currentDataSource?.properties?.[statusPropId]?.options;
        await markSpecial(statusPropId);
      } else if (handleAddProperty) {
        const added = await handleAddProperty("status", undefined, undefined, undefined, "Status", undefined, true);
        if (added) {
          statusPropId = added.id;
          statusPropOptions = added.options;
          createdPropIds.push(added.id);
        }
      }

      // Resolve created
      let createdPropId: string | undefined;
      if (selections.createdId !== "new") {
        createdPropId = selections.createdId;
        await markSpecial(createdPropId);
      } else if (handleAddProperty) {
        const added = await handleAddProperty("date", undefined, undefined, undefined, "Created", undefined, true);
        if (added) {
          createdPropId = added.id;
          createdPropIds.push(added.id);
        }
      }

      // We must force the creation of a new 2-way relation pointing specifically to 
      // the newly generated sprintsDataSourceId, rather than connecting to an old lingering 
      // property mapped to a deleted sibling database which breaks Rollup dependencies.
      let relationPropId: string | undefined = undefined;

      // We now need to execute the backend sequence to create the Sprints infrastructure.
      // Generate block IDs
      const sprintsBlockId = new ObjectId().toString();
      const sprintsDataSourceId = new ObjectId().toString();
      const sprintBoardBlockId = new ObjectId().toString();
      const tasksBlockId = board._id;

      // Extract workspace & user for the payload
      const workspaceId = board.workspaceId || "default";
      const userEmail = "auto-conversion"; // Fallback if no user object

      // ==========================================
      // PHASE 1: Create Raw Sprints DB Structure
      // ==========================================
      const {
        sprintsDataSource,
        sprintsViewDatabase,
        sprintStatusPropertyId,
        sprintDatesPropertyId,
        sprintIdPropertyId,
        completedTasksRollupId,
        totalTaskRollupId,
        currentStatusOptionId
      } = generateSprintsDatabaseCore({
        workspaceId,
        userEmail,
        sprintsBlockId,
        sprintsDataSourceId,
        tasksDataSourceId: normalizedId, // pairedDataSourceId set inside the datasource object
      });

      // We need proper parentId resolution to insert *next* to the board
      const parentId = board.parentId;
      const targetBlockIdForInsertion = board._id;

      // Push initial Sprints Database to backend
      const serializedSprintsDataSource = serializeDataSourceForAPI(sprintsDataSource);
      await postWithAuth("/api/note/block/batch-create", {
        parentId,
        workspaceId,
        workareaId: (board as any).workareaId || null,
        parentTable: (board as any).parentTable || "page",
        blocks: [
          {
            _id: sprintsBlockId,
            blockType: "collection_view",
            value: serializeViewDatabaseForAPI(sprintsViewDatabase),
            insertAfterBlockID: targetBlockIdForInsertion,
          }
        ],
        dataSourceDetail: serializedSprintsDataSource
      });

      // Optimistic UI updates
      if (setDataSource) setDataSource(sprintsDataSourceId, sprintsDataSource);
      if (setCurrentDataSource) {
        setCurrentDataSource(sprintsBlockId, sprintsDataSourceId);
        setCurrentDataSource(sprintBoardBlockId, currentDataSource?._id as string);
      }


      // ==========================================
      // PHASE 2: Create Bidirectional Relation
      // ==========================================

      let taskRelationId: string | undefined = relationPropId;
      let reverseTaskRelationId: string | undefined = relationPropId
        ? currentDataSource?.properties?.[relationPropId]?.syncedPropertyId
        : undefined;

      // Push Relation Schema via generic hook 
      if (!relationPropId && handleAddProperty) {
        // This API hook automatically creates a synced mapping natively in BOTH databases!
        const added = await handleAddProperty(
          "relation",
          undefined,
          sprintsDataSourceId,
          { relationLimit: "multiple", twoWayRelation: true },
          "Sprint",
          undefined,
          true
        );
        if (added) {
          taskRelationId = added.id;
          reverseTaskRelationId = added.reversePropertyId;
          createdPropIds.push(added.id);

          if (reverseTaskRelationId) {
            sprintsDataSource.properties![reverseTaskRelationId] = {
              name: currentDataSource?.title || "Tasks (Sprint)",
              type: "relation",
              linkedDatabaseId: currentDataSource?._id as unknown as ObjectId, // Keep typing quiet for API prep
              syncedPropertyId: taskRelationId,
              syncedPropertyName: "Sprint",
              relationLimit: "multiple",
              twoWayRelation: true,
              showProperty: true,
              formMetaData: {
                isFiedRequired: false,
                isDescriptionRequired: false,
              }
            } as any;
          }
        }
      }

      // Fail fast if critical properties are missing
      if (!taskRelationId || !reverseTaskRelationId || !statusPropId) {
        throw new Error("Failed to create or resolve critical sprint properties (Relation or Status). Aborting conversion.");
      }

      // ==========================================
      // PHASE 3: Generate Sprint Boards & Rollups
      // ==========================================

      const {
        sprintBoardDatabase,
        sprintsPageBlocks
      } = generateSprintBoardAndPages({
        workspaceId,
        userEmail,
        sprintsBlockId,
        sprintsDataSource,
        tasksBlockId,
        sprintBoardBlockId,
        existingTasksDataSource: currentDataSource as any,
        sprintRelationId: taskRelationId as unknown as string,
        reverseTaskRelationId: reverseTaskRelationId,
        sprintStatusPropertyId,
        taskAssigneePropertyId: assigneePropId,
        taskDueDatePropertyId: dueDatePropId,
        taskCreatedPropertyId: createdPropId,
        taskStatusPropertyId: statusPropId,
        taskStatusOptions: statusPropOptions,
        completedTasksRollupId,
        totalTaskRollupId,
        currentStatusOptionId,
        sprintIdPropertyId
      });

      // Push Sprint Board multi-view macro (sibling to Sprints) BEFORE sprint pages so it
      // exists when sprint pages are created with view_databaseId referencing it (ACL inheritance)
      await postWithAuth("/api/note/block/batch-create", {
        parentId,
        workspaceId,
        workareaId: (board as any).workareaId || null,
        parentTable: (board as any).parentTable || "page",
        blocks: [
          {
            _id: sprintBoardBlockId,
            blockType: "collection_view",
            value: serializeViewDatabaseForAPI(sprintBoardDatabase),
            insertAfterBlockID: sprintsBlockId,
          }
        ]
      });

      // Insert the dynamically generated Sprints pages inside the newly created Sprints collection_view
      for (let i = 0; i < sprintsPageBlocks.length; i++) {
        const { pageBlock, boardBlock } = sprintsPageBlocks[i];

        await postWithAuth("/api/note/block/batch-create", {
          view_databaseId: sprintBoardBlockId,
          parentId: sprintsDataSourceId,
          workspaceId,
          workareaId: board.workareaId || null,
          parentTable: "collection",
          blocks: [
            {
              _id: pageBlock._id,
              blockType: "page",
              value: pageBlock.value,
              insertAfterBlockID: i === 0 ? null : sprintsPageBlocks[i - 1].pageBlock._id
            }
          ]
        });

        await postWithAuth("/api/note/block/batch-create", {
          parentId: pageBlock._id,
          workspaceId,
          workareaId: board.workareaId || null,
          parentTable: "page",
          blocks: [
            {
              _id: boardBlock._id,
              blockType: "collection_view",
              value: serializeViewDatabaseForAPI(boardBlock.value),
              insertAfterBlockID: null
            }
          ]
        });
      }

      // Execute Rollup Property patches directly onto the Sprints DataSource backend natively
      const rollupProperties = Object.entries(sprintsDataSource.properties || {}).filter(([_, prop]: [string, any]) => prop.type === "rollup");
      for (const [propId, propData] of rollupProperties) {
        await postWithAuth("/api/database/createProperty", {
          propertyId: propId,
          dataSourceId: sprintsDataSourceId,
          name: (propData as any).name,
          type: "rollup",
          options: (propData as any).options || [],
          rollup: (propData as any).rollup,
          blockId: sprintsBlockId, // Fix to provide missing API argument
          specialProperty: true,
          numberFormat: (propData as any).numberFormat,
          decimalPlaces: (propData as any).decimalPlaces,
          showAs: (propData as any).showAs,
          progressColor: (propData as any).progressColor,
          progressDivideBy: (propData as any).progressDivideBy,
          showNumberText: (propData as any).showNumberText,
        });
      }

      // Re-hydrate the local memory context since the Sprints DataSource has gained new schemas
      if (setDataSource) {
        setDataSource(sprintsDataSourceId, { ...sprintsDataSource });
      }

      // Optimistically insert standard blocks into UI rendering layer in an atomic batch
      if (upsertBlocks && getBlock && parentId) {
        const blocksToUpsert: Block[] = [];

        // 1. Sprints DB
        blocksToUpsert.push({
          _id: sprintsBlockId,
          blockType: "collection_view",
          parentId,
          value: sprintsViewDatabase as any,
          workspaceId,
          workareaId: (board as any).workareaId || null,
          parentType: "page",
          status: "alive",
        } as Block);

        // 2. Sprint Board DB
        blocksToUpsert.push({
          _id: sprintBoardBlockId,
          blockType: "collection_view",
          parentId,
          value: sprintBoardDatabase as any,
          workspaceId,
          workareaId: (board as any).workareaId || null,
          parentType: "page",
          status: "alive",
        } as Block);

        // 3. Sprints Nested Pages
        for (const { pageBlock, boardBlock } of sprintsPageBlocks) {
          blocksToUpsert.push({
            _id: pageBlock._id,
            blockType: "page",
            parentId: sprintsDataSourceId,
            value: pageBlock.value,
            workspaceId,
            workareaId: (board as any).workareaId || null,
            parentType: "collection",
            status: "alive",
          } as Block);

          blocksToUpsert.push({
            _id: boardBlock._id,
            blockType: "collection_view",
            parentId: pageBlock._id,
            value: boardBlock.value,
            workspaceId,
            workareaId: (board as any).workareaId || null,
            parentType: "page",
            status: "alive",
          } as Block);
        }

        // 4. Update parent's blockIds array so React renders the list locally
        const parentDoc = getBlock(parentId);
        if (parentDoc) {
          const currentBlockIds = parentDoc.blockIds || [];
          const targetIndex = currentBlockIds.indexOf(targetBlockIdForInsertion);
          let updatedBlockIds = [...currentBlockIds];

          if (targetIndex !== -1) {
            updatedBlockIds.splice(targetIndex + 1, 0, sprintsBlockId, sprintBoardBlockId);
          } else {
            updatedBlockIds = [...currentBlockIds, sprintsBlockId, sprintBoardBlockId];
          }

          // Push the mutated parent into the same atomic batch to guarantee render synchronization
          blocksToUpsert.push({
            ...parentDoc,
            blockIds: updatedBlockIds
          } as Block);
        }

        await upsertBlocks(blocksToUpsert);
      }

      // Persist pairedDataSourceId on Tasks + isSprintOn in a single update call.
      // The Sprints datasource already has pairedDataSourceId baked into its creation payload above.
      await postWithAuth("/api/database/update", {
        blockId: board._id,
        dataSourceId: normalizedId,
        isSprintOn: true,
        pairedDataSourceId: sprintsDataSourceId, // Tasks → Sprints
      });

      // Optimistically update local context so use-addRootPage fast-path works immediately.
      // Only pass changed fields — spreading stale currentDataSource would overwrite the Sprint
      // relation property that handleAddProperty already added to the tasks datasource context.
      if (updateDataSource) {
        updateDataSource(normalizedId, { isSprintOn: true, pairedDataSourceId: sprintsDataSourceId });
      }

      toast.success("Board converted to Sprint Tracker!", { id: toastId });
      setShowSprintModal(false);

    } catch (e) {
      toast.error("Failed to convert board to Sprint Tracker.", { id: toastId });
      console.error(e);

      // Cleanup newly created properties on the task board if conversion failed
      if (createdPropIds.length > 0) {
        console.log("Cleaning up created properties due to failure:", createdPropIds);
        for (const propId of createdPropIds) {
          try {
            await postWithAuth("/api/database/deleteProperty", {
              dataSourceId: normalizedId,
              propertyId: propId,
              blockId: board._id,
            });
          } catch (cleanupError) {
            console.error(`Failed to cleanup property ${propId}:`, cleanupError);
          }
        }
      }

      // Revert specialProperty status for existing properties if conversion failed
      if (markedSpecialPropIds.length > 0) {
        console.log("Reverting specialProperty status due to failure:", markedSpecialPropIds);
        for (const propId of markedSpecialPropIds) {
          try {
            const prop = currentDataSource?.properties?.[propId];
            if (!prop) continue;
            await postWithAuth("/api/database/updatePropertySchema", {
              dataSourceId: normalizedId,
              propertyId: propId,
              specialProperty: false,
              newName: prop.name,
              type: prop.type,
              blockId: board._id,
            });
          } catch (revertError) {
            console.error(`Failed to revert specialProperty status for ${propId}:`, revertError);
          }
        }
      }
    } finally {
      setIsTurningOnSprint(false);
    }
  };

  const handleManageDataSources = () => {
    toast.info("Manage data sources coming soon");
  };

  const handleLockDatabase = () => {
    toast.info("Lock database coming soon");
  };

  const handleCopyLink = async () => {
    try {
      const url = typeof globalThis !== "undefined" && globalThis.window ? globalThis.window.location.href : "";
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleViewNameChange = (newName: string) => {
    setViewName(newName);
    if (!collectionViewBlock || !collectionViewData) return;

    const updatedViewsType = collectionViewData.viewsTypes?.map((view) => {
      const viewId = view._id || "";
      const currentViewId = currentViewData?.id || "";
      if (viewId === currentViewId || (!viewId && view.viewType === currentViewData?.type)) {
        return { ...view, title: newName };
      }
      return view;
    }) || [];

    const updatedValue: ViewCollection = {
      ...collectionViewData,
      viewsTypes: updatedViewsType,
    };

    updateCollectionViewBlock({
      blockId: boardId,
      updatedValue,
      apiCall: async () => {
        // API call will be handled by the component that calls handleViewNameChange
        return {};
      },
      globalBlocks: { getBlock, updateBlock },
    });
  };

  const handleIconChange = async (newIcon: string) => {
    if (newIcon === lastSavedIcon) return;

    try {
      setIsSavingIcon(true);

      // Find view by ID first if ID exists
      let viewToUpdate;
      if (currentViewData?.id) {
        viewToUpdate = board.value.viewsTypes?.find((v) => v._id === currentViewData.id);
      } else if (currentViewData?.type) {
        viewToUpdate = board.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
      }

      if (!viewToUpdate || !viewToUpdate._id) {
        toast.error("Current view not found or missing ID");
        setCurrentViewIcon(lastSavedIcon);
        return;
      }

      // Optimistically update local state
      setCurrentViewIcon(newIcon);

      if (!collectionViewBlock || !collectionViewData) {
        toast.error("Board not found");
        return;
      }

      const viewTypeObjectId = viewToUpdate._id;

      if (!collectionViewData) {
        toast.error("View database not found");
        return;
      }

      const updatedViewsTypes = (collectionViewData.viewsTypes || []).map((vt) => {
        if (vt._id === viewToUpdate._id) {
          return { ...vt, icon: newIcon };
        }
        return vt;
      });

      const updatedValue: ViewCollection = {
        ...collectionViewData,
        viewsTypes: updatedViewsTypes,
      };

      await updateCollectionViewBlock({
        blockId: boardId,
        updatedValue,
        apiCall: async () => {
          const res = await postWithAuth("/api/database/updateViewType", {
            blockId: board._id,
            viewTypeId: viewToUpdate._id,
            title: viewToUpdate.title || lastSavedTitle,
            icon: newIcon,
          });
          if (!res.view) {
            throw new Error(res?.message || "Failed to update view icon");
          }
          return res;
        },
        globalBlocks: { getBlock, updateBlock },
        // REMOVED: boardContext: { updateBoard } - boards are now in global block context
        onSuccess: () => {
          setLastSavedIcon(newIcon);
          toast.success("View icon updated");
        },
        onError: () => {
          setCurrentViewIcon(lastSavedIcon);
          toast.error("Failed to update view icon");
        },
      });
    } catch (err) {
      // Error already handled in updateCollectionViewBlock
      console.error("Failed to update view icon:", err);
    } finally {
      setIsSavingIcon(false);
    }
  };

  const handleRemoveIcon = async () => {
    await handleIconChange("");
  };

  const handleRenameView = async () => {
    const trimmed = viewName.trim();
    if (!trimmed || trimmed === lastSavedTitle) return;

    try {
      setIsSavingName(true);

      // Find view by ID first if ID exists
      let viewToUpdate;
      if (currentViewData?.id) {
        viewToUpdate = board.value.viewsTypes?.find((v) => v._id === currentViewData.id);
      } else if (currentViewData?.type) {
        viewToUpdate = board.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
      }

      if (!viewToUpdate || !viewToUpdate._id) {
        toast.error("Current view not found or missing ID");
        setViewName(lastSavedTitle);
        return;
      }

      if (!collectionViewBlock || !collectionViewData) {
        toast.error("Board not found");
        return;
      }

      const viewTypeObjectId = viewToUpdate._id;

      if (!collectionViewData) {
        toast.error("View database not found");
        return;
      }

      const updatedViewsTypes = (collectionViewData.viewsTypes || []).map((vt) => {
        if (vt._id === viewTypeObjectId) {
          return { ...vt, title: trimmed };
        }
        return vt;
      });

      const updatedValue: ViewCollection = {
        ...collectionViewData,
        viewsTypes: updatedViewsTypes,
      };

      await updateCollectionViewBlock({
        blockId: boardId,
        updatedValue,
        apiCall: async () => {
          const res = await postWithAuth("/api/database/updateViewType", {
            blockId: board._id,
            viewTypeId: viewToUpdate._id,
            title: trimmed,
            icon: currentViewIcon || "",
          });
          if (!res.view) {
            throw new Error(res?.message || "Failed to update view name");
          }
          return res;
        },
        globalBlocks: { getBlock, updateBlock },
        // REMOVED: boardContext: { updateBoard } - boards are now in global block context
        onSuccess: () => {
          setLastSavedTitle(trimmed);
          toast.success("View name updated");
        },
        onError: () => {
          setViewName(lastSavedTitle);
          toast.error("Failed to update view name");
        },
      });
    } catch {
      toast.error("Failed to update view name");
      // Rollback on error
      setViewName(lastSavedTitle);
      // REMOVED: updateBoard - boards are now in global block context
      // Rollback is handled by updateCollectionViewBlock helper
    } finally {
      setIsSavingName(false);
      setIsEditingName(false);
    }
  };

  const handleDataSourceNameChange = (newName: string) => {
    setDataSourceName(newName);
  };

  const handleDataSourceIconChange = async (newIcon: string) => {
    if (newIcon === lastSavedDataSourceIcon) return;

    const dataSourceId = currentViewObj?.databaseSourceId;
    if (!dataSourceId) return;
    const normalizedId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);

    try {
      setIsSavingDataSourceIcon(true);
      // Optimistic update
      setCurrentDataSourceIcon(newIcon);
      updateDataSource(normalizedId, { icon: newIcon });

      const res = await postWithAuth("/api/database/update", {
        blockId: board._id,
        dataSourceId: normalizedId,
        icon: newIcon,
        title: dataSourceName || lastSavedDataSourceTitle,
      });

      if (res.dataSource) {
        setLastSavedDataSourceIcon(newIcon);
        toast.success("Data source icon updated");
      } else {
        throw new Error(res.message || "Failed to update data source icon");
      }
    } catch (err) {
      // Rollback
      setCurrentDataSourceIcon(lastSavedDataSourceIcon);
      updateDataSource(normalizedId, { icon: lastSavedDataSourceIcon });
      toast.error("Failed to update data source icon");
      console.error(err);
    } finally {
      setIsSavingDataSourceIcon(false);
    }
  };

  const handleRemoveDataSourceIcon = async () => {
    await handleDataSourceIconChange("");
  };

  const handleRenameDataSource = async () => {
    const trimmed = dataSourceName.trim();
    if (!trimmed || trimmed === lastSavedDataSourceTitle) return;

    const dataSourceId = currentViewObj?.databaseSourceId;
    if (!dataSourceId) return;
    const normalizedId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);

    try {
      setIsSavingDataSourceName(true);
      // Optimistic update
      updateDataSource(normalizedId, { title: trimmed });

      const res = await postWithAuth("/api/database/update", {
        blockId: board._id,
        dataSourceId: normalizedId,
        title: trimmed,
        icon: currentDataSourceIcon || "",
      });

      if (res.dataSource) {
        setLastSavedDataSourceTitle(trimmed);
        toast.success("Data source name updated");
      } else {
        throw new Error(res.message || "Failed to update data source name");
      }
    } catch (err) {
      // Rollback
      setDataSourceName(lastSavedDataSourceTitle);
      updateDataSource(normalizedId, { title: lastSavedDataSourceTitle });
      toast.error("Failed to update data source name");
      console.error(err);
    } finally {
      setIsSavingDataSourceName(false);
      setIsEditingDataSourceName(false);
    }
  };

  useEffect(() => {
    function handleOutsideclick(event: MouseEvent) {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node) &&
        !triggerRef?.current?.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleOutsideclick);
    return () => document.removeEventListener("mousedown", handleOutsideclick);
  }, [onClose, triggerRef]);

  const handleDeleteBoard = async () => {
    // Close modal immediately (optimistic UI update)
    setShowDeleteConfirm(false);
    onClose();

    // const boardId = board._id;
    // const parentId = board.parentId;
    // const workspaceId = currentWorkspace?._id;

    // if (!workspaceId) {
    //   toast.error("Workspace not found");
    // }

    // const parentBlock = parentId ? getBlock(parentId) : null;
    // const originalParentBlockIds = parentBlock?.blockIds || [];

    // if (parentBlock && parentBlock.blockIds) {
    //   const updatedBlockIds = parentBlock.blockIds.filter((id: string) => id !== boardId);
    //   updateBlock(parentId, { blockIds: updatedBlockIds });
    // }
    // removeBlock(boardId);

    // Run API call in background
    (async () => {
      try {
        // await deleteWithAuth("/api/note/block/delete/permanent-delete", {
        //   body: JSON.stringify({
        //     blockId: boardId,
        //     workspaceId,
        //   }),
        // });
        // toast.success("Board deleted!");
        if (editor) {
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              // Iterate over all nodes
              tr.doc.descendants((node, pos) => {
                // Check if this is a view_collection for the board
                if (node.type.name === "view_collection" && node.attrs?.blockId === boardId) {
                  tr.delete(pos, pos + node.nodeSize);
                }
              });
              return true;
            })
            .run();
        }

        // REMOVED: removeBoard - boards are now in global block context
        // removeBoard(board._id);
      } catch (err) {
        console.error("Failed to delete board:", err);
        // updateBlock(parentId, { blockIds: originalParentBlockIds });
        toast.error("Failed to delete board");
      }
    })();
  };

  // Get data source name for Source item
  const getDataSourceName = () => {
    const dataSourceId = currentViewObj?.databaseSourceId;
    if (!dataSourceId) {
      return "No source";
    }
    const normalizedId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);
    const dataSource = dataSources[normalizedId];
    if (dataSource?.title) {
      return dataSource.title;
    }
    return normalizedId.slice(-6);
  };

  // Get group by property name
  const getGroupByPropertyName = () => {
    if (!selectedGroupByProperty) return undefined;
    const prop = effectiveBoardProperties[selectedGroupByProperty];
    if (!prop?.name) return undefined;
    return prop.name.slice(0, 1).toUpperCase() + prop.name.slice(1);
  };

  // Build menu items array
  const menuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [];

    // Layout
    items.push({
      id: 'layout',
      label: "Layout",
      icon: <CurrentViewIcon className="h-4 w-4 text-muted-foreground" />,
      onClick: handleLayout,
      hasChevron: true,
      count: boardView.charAt(0).toUpperCase() + boardView.slice(1),
    });

    if (boardView !== "chart") {
      // Property visibility
      items.push({
        id: 'property-visibility',
        label: "Property visibility",
        icon: <DropdownMenuIcons.Eye />,
        onClick: handleEditCard,
        hasChevron: true,
        count: visiblePropertiesCount > 0 ? visiblePropertiesCount : undefined,
      });

      // Filter
      items.push({
        id: 'filter',
        label: "Filter",
        icon: <DropdownMenuIcons.Filter />,
        onClick: handleFilterCard,
        hasChevron: true,
        count: filterCount > 0 ? filterCount : undefined,
      });

      // Sort
      items.push({
        id: 'sort',
        label: "Sort",
        icon: <DropdownMenuIcons.Sort />,
        onClick: handleSortCard,
        hasChevron: true,
        count: sortsForBoard.length > 0 ? sortsForBoard.length : undefined,
      });

      // Group (conditional - only if not calendar)
      if (boardView !== "calendar") {
        items.push({
          id: 'group',
          label: "Group",
          icon: <DropdownMenuIcons.Group />,
          onClick: handleGroupByCard,
          hasChevron: true,
          count: getGroupByPropertyName(),
        });
      }

      // Sub-group
      // items.push({
      //   id: 'sub-group',
      //   label: "Sub-group",
      //   icon: <DropdownMenuIcons.Group />,
      //   onClick: handleSubGroup,
      //   hasChevron: true,
      // });

      // // Conditional color
      // items.push({
      //   id: 'conditional-color',
      //   label: "Conditional color",
      //   icon: <DropdownMenuIcons.Zap />,
      //   onClick: handleConditionalColor,
      //   hasChevron: true,
      // });

      // Copy link to view (no chevron)
      items.push({
        id: 'copy-link',
        label: "Copy link to view",
        icon: <DropdownMenuIcons.Link />,
        onClick: handleCopyLink,
        hasChevron: false,
      });
    }

    return items;
  }, [
    boardView,
    CurrentViewIcon,
    visiblePropertiesCount,
    filterCount,
    sortsForBoard.length,
    selectedGroupByProperty,
    effectiveBoardProperties,
    getGroupByPropertyName,
    handleLayout,
    handleEditCard,
    handleFilterCard,
    handleSortCard,
    handleGroupByCard,
    handleSubGroup,
    handleConditionalColor,
    handleCopyLink,
  ]);

  // Build data source menu items
  const dataSourceMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [];

    // Source
    items.push({
      id: 'source',
      label: "Source",
      icon: <DropdownMenuIcons.Database />,
      onClick: handleDataSources,
      hasChevron: true,
      count: getDataSourceName(),
    });

    // Edit properties
    if (boardView !== "chart") {
      items.push({
        id: 'edit-properties',
        label: "Edit properties",
        icon: <DropdownMenuIcons.EditProperties />,
        onClick: handleEditProperties,
        hasChevron: true,
      });

      // Automations
      items.push({
        id: 'automations',
        label: "Automations",
        icon: <DropdownMenuIcons.Zap />,
        onClick: handleAutomations,
        hasChevron: true,
      });

      // Sprint Setting (only if not already a sprint)
      const dataSourceId = currentViewObj?.databaseSourceId;
      const normalizedId = dataSourceId ? (typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId)) : null;
      const dataSource = normalizedId ? dataSources[normalizedId] : null;

      if (!dataSource?.isSprint) {
        const isSprintOn = dataSource?.isSprintOn === true;
        items.push({
          id: 'sprint',
          label: "Sprint",
          icon: <DropdownMenuIcons.Sprint />,
          onClick: isSprintOn ? () => { } : openSprintModal,
          hasChevron: !isSprintOn,
          disabled: isSprintOn,
          rightElement: isSprintOn ? (
            <span className="text-xs font-medium px-1.5 py-0.5">
              On
            </span>
          ) : undefined,
        });
      }
    }

    return items;
  }, [handleDataSources, handleEditProperties, handleAutomations, openSprintModal, currentViewObj, dataSources, getDataSourceName]);

  // Build bottom actions menu items
  const bottomMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [];

    // Manage data sources
    items.push({
      id: 'manage-data-sources',
      label: "Manage data sources",
      icon: <DropdownMenuIcons.Database />,
      onClick: handleManageDataSources,
      hasChevron: true,
    });

    // Lock database (no chevron)
    items.push({
      id: 'lock-database',
      label: "Lock database",
      icon: <DropdownMenuIcons.Lock />,
      onClick: handleLockDatabase,
      hasChevron: false,
    });

    // Delete Board (destructive)
    items.push({
      id: 'delete-board',
      label: "Delete Board",
      icon: <DropdownMenuIcons.Delete />,
      onClick: () => handleDeleteBoard(),
      variant: 'destructive',
      hasChevron: false,
    });

    return items;
  }, [handleManageDataSources, handleLockDatabase]);


  const handleAddFormProperty = useCallback(
    (propertyType: string, label: string) => {
      if (!handleAddProperty) return null;
      return handleAddProperty(propertyType, undefined, undefined, undefined, label);
    },
    [handleAddProperty],
  );

  const handleNewQuestion = useCallback((event?: React.MouseEvent<HTMLButtonElement>) => {
    if (!isFormsView) {
      return;
    }
    if (!modalRef.current) {
      return;
    }
    const containerRect = modalRef.current.getBoundingClientRect();
    if (event?.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      setAddQuestionDialogPosition({
        top: rect.bottom - containerRect.top + 8,
        left: rect.left - containerRect.left,
      });
    } else {
      const rect = modalRef.current.getBoundingClientRect();
      setAddQuestionDialogPosition({
        top: rect.top - containerRect.top,
        left: rect.right - containerRect.left + 8,
      });
    }
    setShowAddQuestionDialog(true);
  }, [isFormsView]);

  const handleSubmitscreen = useCallback(handleSubmitScreen, []);

  const handleDeleteView = async () => {

    setShowViewDeleteConfirm(false);
    onClose();

    const viewIdToDelete = currentViewObj?._id;
    if (!viewIdToDelete) {
      toast.error("Current view not found");
      return;
    }
    const isCurrentView = currentViewData?.id === viewIdToDelete;
    const previousViewsTypes = board.value.viewsTypes || [];
    const updatedViewsTypes = previousViewsTypes.filter(v => v._id !== viewIdToDelete);

    const updatedValue: ViewCollection = {
      ...board.value,
      viewsTypes: updatedViewsTypes,
    };

    // Optimistically update the block immediately
    updateBlock(board._id, {
      ...board,
      value: updatedValue,
    });

    if (isCurrentView && updatedViewsTypes.length > 0) {
      const nextView = updatedViewsTypes[0];
      if (nextView) {
        setCurrentView(board._id, nextView._id, nextView.viewType);
      }
    }

    try {
      const res = await deleteWithAuth("/api/database/deleteVeiwType", {
        method: "DELETE",
        body: JSON.stringify({ blockId: board._id, viewTypeToDelete: viewIdToDelete }),
      });
    } catch (err) {
      console.error("Failed to delete view:", err);
      // Rollback optimistic update
    }
  };

  const formMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    if (!isFormsView) {
      return [];
    }
    return [
      {
        id: "new-question",
        label: "New question",
        icon: <DropdownMenuIcons.Plus />,
        onClick: handleNewQuestion,
      },
      {
        id: "automations",
        label: "Automations",
        icon: <DropdownMenuIcons.Zap />,
        hasChevron: true,
        onClick: handleAutomations,
      },
      {
        id: "submit-screen",
        label: "Submit screen",
        icon: <DropdownMenuIcons.Paintbrush />,
        hasChevron: true,
        onClick: handleSubmitscreen,
      },
    ];
  }, [handleAutomations, handleNewQuestion, handleSubmitscreen, isFormsView]);

  const formDataSourceItems: DropdownMenuItemProps[] = useMemo(() => {
    if (!isFormsView) {
      return [];
    }
    return [
      {
        id: "source",
        label: "Source",
        icon: <DropdownMenuIcons.Database />,
        hasChevron: true,
        count: getDataSourceName(),
        disabled: true,
        onClick: () => { },
      },
    ];
  }, [getDataSourceName, handleDataSources, isFormsView]);

  const formBottomMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    if (!isFormsView) {
      return [];
    }
    return [
      {
        id: "delete-form",
        label: "Delete form",
        icon: <DropdownMenuIcons.Delete />,
        variant: "destructive",
        onClick: () => setShowViewDeleteConfirm(true),
      },
    ];
  }, [isFormsView, setShowViewDeleteConfirm]);

  // Early returns for modals - must be AFTER all hooks
  if (showPropertiesEditor) {
    return (
      <div className="absolute right-full top-0 mr-2">
        <CardPropertiesEditor
          board={board}
          boardProperties={effectiveBoardProperties}
          onClose={() => setShowPropertiesEditor(false)}
        />
      </div>
    );
  }

  if (showGroupBySelector) {
    return (
      <div className="absolute right-full top-0 mr-2">
        <GroupModal
          board={board}
          boardProperties={effectiveBoardProperties}
          onClose={() => setShowGroupBySelector(false)}
        />
      </div>
    );
  }

  if (showFilterModal) {
    return (
      <div className="absolute right-full top-0 mr-2">
        <FilterPropertiesModal
          board={board}
          boardProperties={effectiveBoardProperties}
          filters={filtersForBoard}
          onApply={async (selectedFilters) => {
            // if (!currentViewTypeId) {
            //   toast.error("View type ID not found");
            //   return;
            // }

            // try {
            //   // updateFilters handles optimistic update and rollback internally
            //   await updateFilters(
            //     currentViewTypeId,
            //     selectedFilters,
            //     boardId,
            //     setBoardFilters,
            //     getFilters,
            //     getBlock,
            //     updateBlock,
            //   );
            // } catch (err) {
            //   console.error("Failed to update filters:", err);
            // }

            // setShowFilterModal(false);
          }}
          onClose={() => setShowFilterModal(false)}
        />
      </div>
    );
  }

  if (showSortModal) {
    return (
      <div className="absolute right-full top-0 mr-2">
        <SortModal
          board={board}
          boardProperties={effectiveBoardProperties}
          sorts={sortsForBoard}
          onClose={() => setShowSortModal(false)}
          onApply={async (sorts) => {
            if (!currentViewTypeId) {
              toast.error("View type ID not found");
              return;
            }

            try {
              // updateSorts handles optimistic update and rollback internally
              await updateSorts(
                currentViewTypeId,
                sorts,
                boardId,
                setBoardSortBy,
                getSortBy,
                getBlock,
                updateBlock,
              );

              toast.success("Sorts updated successfully");
            } catch (err) {
              console.error("Failed to update sorts:", err);
              // Rollback is handled by updateSorts
            }
          }}
        />
      </div>
    );
  }

  if (showLayoutModal) {
    return <LayoutSettingsModal board={board} onClose={() => setShowLayoutModal(false)} />;
  }

  if (showDataSourceModal) {
    return (
      <DataSourceSettingModal
        isOpen={true}
        onClose={() => setShowDataSourceModal(false)}
        onBack={() => setShowDataSourceModal(false)}
        board={board}
        view={currentViewData ? { id: currentViewData.id || '', type: currentViewData.type } : {}}
        workspaceId={currentWorkspace?._id}
        excludeViewId={"viewName.datasource.id"}
      />
    );
  }

  if (showEditPropertiesModal && !editingPropertyId) {
    return (
      <EditPropertiesModal
        board={board}
        boardProperties={effectiveBoardProperties}
        onClose={() => setShowEditPropertiesModal(false)}
        onPropertyClick={handlePropertyClick}
      />
    );
  }

  if (showEditPropertiesModal && editingPropertyId) {
    const prop = boardProperties[editingPropertyId];
    console.log("............Editing property:", prop);
    if (!prop) return null;
    return (
      <div className="absolute right-full top-0 mr-2">
        <EditSinglePropertyModal
          board={board}
          propertyId={editingPropertyId}
          property={prop}
          onClose={() => {
            setShowEditPropertiesModal(false);
            setEditingPropertyId(null);
          }}
          onBack={handleBackToEditProperties}
        />
      </div>
    );
  }

  return (
    <>
      <div ref={modalRef} className="relative bg-background shadow-lg rounded-md w-72 border border-border z-50">
        {/* Header */}
        <DropdownMenuHeader
          title="View settings"
          onClose={onClose}
          showBack={false}
          showClose={true}
          className="px-1"
        />

        <div className="flex flex-col p-1">
          {/* View name - using generic editable item component */}
          <DropdownMenuEditableItem
            iconButtonRef={iconButtonRef}
            icon={currentViewIcon || <CurrentViewIcon className="h-4 w-4 text-muted-foreground" />}
            onIconClick={() => setShowEmojiPicker(true)}
            iconButtonDisabled={isSavingIcon}
            iconButtonAriaLabel="Change view icon"
            inputValue={viewName}
            inputOnChange={handleViewNameChange}
            inputOnFocus={() => setIsEditingName(true)}
            inputOnBlur={handleRenameView}
            inputOnKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            inputPlaceholder="View name"
            inputAriaLabel="View name"
            inputDisabled={isSavingName}
          >
            {/* Emoji Picker - positioned relative to button */}
            {showEmojiPicker && iconButtonRef.current && (() => {
              if (!iconButtonRef.current) return null;

              const buttonRect = iconButtonRef.current.getBoundingClientRect();
              const maxPickerWidth = 408;
              const pickerHeight = 390;
              const gap = 8;
              const minPickerWidth = 300; // Minimum width to ensure readability

              // Calculate available space in viewport
              const spaceBelow = window.innerHeight - buttonRect.bottom;
              const spaceAbove = buttonRect.top;
              const spaceRight = window.innerWidth - buttonRect.left;
              const spaceLeft = buttonRect.left;

              // Determine picker width based on available space
              const availableWidth = Math.min(spaceRight, spaceLeft + buttonRect.width);
              const pickerWidth = Math.max(minPickerWidth, Math.min(maxPickerWidth, availableWidth - 16)); // 16px for margins

              // Determine vertical position (below or above)
              const showBelow = spaceBelow >= pickerHeight || spaceBelow >= spaceAbove;

              // Calculate top position relative to button (which is relative to parent)
              let top: number;
              if (showBelow) {
                top = buttonRect.height + gap;
              } else {
                top = -(pickerHeight + gap);
              }

              // Calculate left position relative to button
              let left = 0;

              // Adjust if not enough space on the right
              if (spaceRight < pickerWidth) {
                // Align to right edge of button
                left = buttonRect.width - pickerWidth;
                // Ensure it doesn't go too far left (keep at least 8px from viewport edge)
                const minLeft = -(buttonRect.left) + gap;
                if (left < minLeft) {
                  left = minLeft;
                }
              }

              return (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-[60] bg-black/20 dark:bg-black/40"
                    onClick={() => {
                      setShowEmojiPicker(false);
                      setEmojiSearchTerm("");
                    }}
                  />
                  {/* Picker */}
                  <div
                    className="absolute z-[61] bg-white dark:bg-zinc-900 rounded-lg shadow-2xl overflow-hidden h-[390px] max-h-[70vh] flex flex-col"
                    style={{
                      top: `${top}px`,
                      left: `${left}px`,
                      width: `${pickerWidth}px`,
                      minWidth: '300px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Tabs */}
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 px-2 overflow-x-auto hide-scrollbar">
                      <div className="flex gap-1 py-1.5">
                        {Object.keys(EMOJI_CATEGORIES).map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => {
                              setActiveEmojiCategory(category);
                              scrollToEmojiCategory(category);
                            }}
                            className={`px-2 h-7 rounded-md text-sm transition-colors whitespace-nowrap ${activeEmojiCategory === category
                              ? "text-gray-900 dark:text-white"
                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                              }`}
                          >
                            {category}
                            {activeEmojiCategory === category && (
                              <div className="h-0.5 bg-gray-900 dark:bg-white mt-1" />
                            )}
                          </button>
                        ))}
                      </div>
                      {currentViewIcon && (
                        <button
                          type="button"
                          onClick={() => {
                            handleRemoveIcon();
                            setShowEmojiPicker(false);
                            setEmojiSearchTerm("");
                          }}
                          className="px-2 h-7 rounded-md text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Search */}
                    <div className="px-2 py-2">
                      <DropdownMenuSearch
                        placeholder="Filter…"
                        value={emojiSearchTerm}
                        onChange={setEmojiSearchTerm}
                        variant="subtle"
                      />
                    </div>

                    {/* Emoji Grid */}
                    <div className="flex-1 overflow-y-auto px-3 pb-2">
                      {Object.entries(filteredEmojis).map(([category, emojis]) => (
                        <div
                          key={category}
                          className="mb-4"
                          ref={(el) => { emojiCategoryRefs.current[category] = el }}
                        >
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-2 pt-2">
                            {category}
                          </div>
                          <div className="grid grid-cols-12 gap-1">
                            {emojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  handleIconChange(emoji);
                                  setShowEmojiPicker(false);
                                  setEmojiSearchTerm("");
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-2xl"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </DropdownMenuEditableItem>

          {/* Menu items using generic component */}
          <DropdownMenu items={isFormsView ? formMenuItems : menuItems} />
        </div>
        {boardView === "chart" && currentViewTypeId && (
          <div className="flex flex-col border-t">
            <ChartSettingsModal
              board={board}
              boardProperties={effectiveBoardProperties}
              viewTypeId={currentViewTypeId}
              currentSettings={chartSettings[currentViewTypeId] || currentViewObj?.settings?.chart}
              onClose={onClose}
            />
          </div>
        )}

        {/* Data source settings section */}
        <div className="px-4 pt-2 pb-1 border-t">
          <DropdownMenuSectionHeading>Data source settings</DropdownMenuSectionHeading>
        </div>

        <div className="flex flex-col p-1">
          {/* Data source name - using generic editable item component */}
          <DropdownMenuEditableItem
            iconButtonRef={dataSourceIconButtonRef}
            icon={currentDataSourceIcon || <div className="h-4 w-4 text-muted-foreground"><DropdownMenuIcons.Database /></div>}
            onIconClick={() => setShowDataSourceEmojiPicker(true)}
            iconButtonDisabled={isSavingDataSourceIcon}
            iconButtonAriaLabel="Change data source icon"
            inputValue={dataSourceName}
            inputOnChange={handleDataSourceNameChange}
            inputOnFocus={() => setIsEditingDataSourceName(true)}
            inputOnBlur={handleRenameDataSource}
            inputOnKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            inputPlaceholder="Data source name"
            inputAriaLabel="Data source name"
            inputDisabled={isSavingDataSourceName}
          >
            {/* Emoji Picker - positioned relative to button */}
            {showDataSourceEmojiPicker && dataSourceIconButtonRef.current && (() => {
              if (!dataSourceIconButtonRef.current) return null;

              const buttonRect = dataSourceIconButtonRef.current.getBoundingClientRect();
              const maxPickerWidth = 408;
              const pickerHeight = 390;
              const gap = 8;
              const minPickerWidth = 300; // Minimum width to ensure readability

              // Calculate available space in viewport
              const spaceBelow = window.innerHeight - buttonRect.bottom;
              const spaceAbove = buttonRect.top;
              const spaceRight = window.innerWidth - buttonRect.left;
              const spaceLeft = buttonRect.left;

              // Determine picker width based on available space
              const availableWidth = Math.min(spaceRight, spaceLeft + buttonRect.width);
              const pickerWidth = Math.max(minPickerWidth, Math.min(maxPickerWidth, availableWidth - 16)); // 16px for margins

              // Determine vertical position (below or above)
              const showBelow = spaceBelow >= pickerHeight || spaceBelow >= spaceAbove;

              // Calculate top position relative to button (which is relative to parent)
              let top: number;
              if (showBelow) {
                top = buttonRect.height + gap;
              } else {
                top = -(pickerHeight + gap);
              }

              // Calculate left position relative to button
              let left = 0;

              // Adjust if not enough space on the right
              if (spaceRight < pickerWidth) {
                // Align to right edge of button
                left = buttonRect.width - pickerWidth;
                // Ensure it doesn't go too far left (keep at least 8px from viewport edge)
                const minLeft = -(buttonRect.left) + gap;
                if (left < minLeft) {
                  left = minLeft;
                }
              }

              return (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-[60] bg-black/20 dark:bg-black/40"
                    onClick={() => {
                      setShowDataSourceEmojiPicker(false);
                      setEmojiSearchTerm("");
                    }}
                  />
                  {/* Picker */}
                  <div
                    className="absolute z-[61] bg-white dark:bg-zinc-900 rounded-lg shadow-2xl overflow-hidden h-[390px] max-h-[70vh] flex flex-col"
                    style={{
                      top: `${top}px`,
                      left: `${left}px`,
                      width: `${pickerWidth}px`,
                      minWidth: '300px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Tabs */}
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 px-2 overflow-x-auto hide-scrollbar">
                      <div className="flex gap-1 py-1.5">
                        {Object.keys(EMOJI_CATEGORIES).map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => {
                              setActiveEmojiCategory(category);
                              scrollToEmojiCategory(category);
                            }}
                            className={`px-2 h-7 rounded-md text-sm transition-colors whitespace-nowrap ${activeEmojiCategory === category
                              ? "text-gray-900 dark:text-white"
                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                              }`}
                          >
                            {category}
                            {activeEmojiCategory === category && (
                              <div className="h-0.5 bg-gray-900 dark:bg-white mt-1" />
                            )}
                          </button>
                        ))}
                      </div>
                      {currentDataSourceIcon && (
                        <button
                          type="button"
                          onClick={() => {
                            handleRemoveDataSourceIcon();
                            setShowDataSourceEmojiPicker(false);
                            setEmojiSearchTerm("");
                          }}
                          className="px-2 h-7 rounded-md text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Search */}
                    <div className="px-2 py-2">
                      <DropdownMenuSearch
                        placeholder="Filter…"
                        value={emojiSearchTerm}
                        onChange={setEmojiSearchTerm}
                        variant="subtle"
                      />
                    </div>

                    {/* Emoji Grid */}
                    <div className="flex-1 overflow-y-auto px-3 pb-2">
                      {Object.entries(filteredEmojis).map(([category, emojis]) => (
                        <div
                          key={category}
                          className="mb-4"
                          ref={(el) => { emojiCategoryRefs.current[category] = el }}
                        >
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-2 pt-2">
                            {category}
                          </div>
                          <div className="grid grid-cols-12 gap-1">
                            {emojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  handleDataSourceIconChange(emoji);
                                  setShowDataSourceEmojiPicker(false);
                                  setEmojiSearchTerm("");
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-2xl"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </DropdownMenuEditableItem>

          {/* Data source menu items */}
          <DropdownMenu items={isFormsView ? formDataSourceItems : dataSourceMenuItems} />
        </div>

        {/* Bottom actions */}
        <div className="flex flex-col p-1 border-t">
          {/* Bottom menu items */}
          <DropdownMenu items={isFormsView ? formBottomMenuItems : bottomMenuItems} />
        </div>

        {/* Modals */}
        {showPropertiesEditor && (
          <div className="absolute right-full top-0 mr-2">
            <CardPropertiesEditor
              board={board}
              boardProperties={effectiveBoardProperties}
              onClose={() => setShowPropertiesEditor(false)}
            />
          </div>
        )}



        {showGroupBySelector && (
          <div className="absolute right-full top-0 mr-2">
            <GroupByPropertiesModal
              board={board}
              boardProperties={effectiveBoardProperties}
              selectedPropertyId={selectedGroupByProperty}
              onSelect={(propId) => {
                if (currentViewTypeId) setGroupBy(currentViewTypeId, propId);
                setShowGroupBySelector(false);
              }}
              onClose={() => setShowGroupBySelector(false)}
            />
          </div>
        )}

        {showFilterModal && (
          <div className="absolute right-full top-0 mr-2">
            <FilterPropertiesModal
              board={board}
              boardProperties={effectiveBoardProperties}
              filters={filtersForBoard}
              onApply={(newFilters) => {
                if (currentViewTypeId) setBoardFilters(currentViewTypeId, newFilters);
                setShowFilterModal(false);
              }}
              onClose={() => setShowFilterModal(false)}
            />
          </div>
        )}

        {showSortModal && (
          <div className="absolute right-full top-0 mr-2">
            <SortModal
              board={board}
              boardProperties={effectiveBoardProperties}
              sorts={sortsForBoard}
              onApply={(newSorts) => {
                if (currentViewTypeId) setBoardSortBy(currentViewTypeId, newSorts);
                setShowSortModal(false);
              }}
              onClose={() => setShowSortModal(false)}
            />
          </div>
        )}

        {showLayoutModal && (
          <div className="absolute right-full top-0 mr-2">
            <LayoutSettingsModal board={board} onClose={() => setShowLayoutModal(false)} />
          </div>
        )}

        {isFormsView && showViewDeleteConfirm &&
          <DeleteConfirmationModal
            header="Delete Form"
            isOpen={showViewDeleteConfirm}
            onCancel={() => setShowViewDeleteConfirm(false)}
            onConfirm={handleDeleteView}
            isDeleting={false}
            title={viewName}
            entity="view"
          />
        }
        {/* {!isFormsView && showDeleteConfirm &&
        <DeleteConfirmationModal
          header="Delete Board"
          isOpen={showDeleteConfirm}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteBoard}
          isDeleting={false}
          title={board.value.title}
          entity="board"
        />
      } */}

        {showAddQuestionDialog && (
          <>
            <div
              className="absolute inset-0 z-[1400]"
              onClick={() => setShowAddQuestionDialog(false)}
            />
            <div
              className="absolute z-[1401] mb-5"
              style={{
                top: addQuestionDialogPosition.top || 0,
                left: addQuestionDialogPosition.left || 0,
              }}
            >
              <FormAddPropertyDialog
                onSelect={async (type, label) => {
                  const result = await handleAddFormProperty(type, label);
                  return result;
                }}
                onClose={() => setShowAddQuestionDialog(false)}
              />
            </div>
          </>
        )}

      </div>

      {showSprintModal && (() => {
        const dsId = currentViewObj?.databaseSourceId;
        const normalizedDsId = dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
        const currentDs = normalizedDsId ? dataSources[normalizedDsId] : null;
        const propsWithId = Object.entries(currentDs?.properties || {}).map(([id, prop]) => ({
          ...(prop as BoardProperty),
          id,
        }));
        return (
          <SprintSetupModal
            boardProperties={propsWithId}
            onClose={() => { if (!isTurningOnSprint) { setShowSprintModal(false); onClose(); } }}
            onConfirm={(selections) => { handleSprint(selections); }}
            isLoading={isTurningOnSprint}
          />
        );
      })()}
    </>
  );
}
