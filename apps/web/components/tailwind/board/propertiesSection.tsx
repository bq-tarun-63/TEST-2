import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { debounce } from "lodash";
import { Note, BoardProperties, BoardPropertyOption, BoardProperty, RollupConfig } from "@/types/board";
import { formatFormulaValue } from "@/utils/formatFormulaValue";
import { computeRollupData, normalizeCalculation, isNumberLike } from "@/utils/rollupUtils";
import {
  Check,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AddPropertyDialog } from "./addPropertyDialog";
import { PROPERTY_TYPES } from "./addPropertyDialog";
import { Members } from "@/types/workspace";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useNoteContext } from "@/contexts/NoteContext";
import DeleteConfirmationModal from "../ui/deleteConfirmationModal";
import { CheckboxPropertyInput } from "./properties/inputs/checkboxPropertyInput";
import { DatePropertyInput } from "./properties/inputs/datePropertyInput";
import { DefaultPropertyInput } from "./properties/inputs/defaultPropertyInput";
import { NumberPropertyInput } from "./properties/inputs/numberPropertyInput";
import { TextPropertyInput } from "./properties/inputs/textPropertyInput";
import { StatusPropertyInput } from "./properties/inputs/statusPropertyInput";
import { PersonPropertyInput } from "./properties/inputs/personPropertyInput";
import { PriorityPropertyInput } from "./properties/inputs/priorityPropertyInput";
import { RelationPropertyInput } from "./properties/inputs/relationPropertyInput";
import { RollupPropertyInput } from "./properties/inputs/rollupPropertyInput";
import { RelationViewSelector } from "./properties/inputs/relationViewSelector";
import { PropertyOptionsModal } from "../ui/modals/propertyOptionModal";
import { SelectPropertyInput } from "./properties/inputs/selectPropertyInput";
import { MultiSelectPropertyInput } from "./properties/inputs/multiSelectPropertyInput";
import { EditPropertyModal } from "../ui/modals/editBoardPropertyModel";
import { RelationConfigModal } from "@/components/tailwind/ui/modals/relationConfigModal";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { getWithAuth } from "@/lib/api-helpers";
import { GitHubPrPropertyInput } from "./properties/inputs/githubPrPropertyInput";
import { FilePropertyInput } from "./properties/inputs/filePropertyInput";
import { FormulaPropertyInput } from "./properties/inputs/formulaPropertyInput";
import type { IVeiwDatabase } from "@/models/types/Block";
import type { DatabaseSource, ViewCollection } from "@/types/board";
import { Block } from "@/types/block";
import { getColorStyles } from "@/utils/colorStyles";

interface PropertiesSectionProps {
  boardId: string;
  note: Block;
  boardProperties: BoardProperties;
  onUpdateProperty: (key: string, value: any) => void;
  onAddProperty: (type: string, options?: any, linkedDatabaseId?: string, relationConfig?: { relationLimit?: "single" | "multiple"; twoWayRelation?: boolean }, customName?: string) => Promise<{ id: string; name: string } | null>;
  onRenameProperty: (key: string, newName: string, newOption?: BoardPropertyOption[], relationConfig?: { relationLimit?: "single" | "multiple"; twoWayRelation?: boolean; linkedDatabaseId?: string }, rollupConfig?: RollupConfig) => Promise<void>;
  onDeleteProperty: (key: string) => Promise<void>;
}


export function PropertiesSection({
  boardId,
  note,
  boardProperties,
  onUpdateProperty,
  onAddProperty,
  onRenameProperty,
  onDeleteProperty
}: PropertiesSectionProps) {

  const { workspaceMembers } = useWorkspaceContext();
  const [showDialog, setShowDialog] = useState<boolean>(false);
  const addPropertyBtnRef = useRef<HTMLButtonElement>(null);
  const [localValues, setLocalValues] = useState<Record<string, any>>(
    note.value.databaseProperties ?? {}
  );
  const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(null);
  const [localPropertyNames, setLocalPropertyNames] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(boardProperties).map(([key, prop]) => [key, prop.name]))
  );
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [editingOptionsKey, setEditingOptionsKey] = useState<string | null>(null);

  const { sharedWith, iscurrentNotPublic } = useNoteContext();
  const [editPropertyModalOpen, setEditPropertyModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<string | null>(null);

  // REMOVED: boards - boards are now in global block context
  // boards, // Commented out - boards are now in global block context
  const { propertyOrder, setPropertyOrder, getNotesByDataSourceId, getDataSource, setDataSource, currentView } = useBoard();
  const { getBlock } = useGlobalBlocks();

  // Get board from global block context
  const collectionViewBlock = getBlock(boardId);
  const viewDatabase = collectionViewBlock?.blockType === "collection_view"
    ? (collectionViewBlock.value as IVeiwDatabase)
    : null;

  // Get current dataSourceId from current view
  const getCurrentDataSourceId = (): string | null => {
    const currentViewData = currentView[boardId];
    const latestBoard = getBlock(boardId);
    if (!latestBoard) return null;

    let view;
    if (currentViewData?.id) {
      view = latestBoard.value.viewsTypes?.find((vt) => vt._id === currentViewData.id);
    } else if (currentViewData?.type) {
      view = latestBoard.value.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
    }

    const dsId = view?.databaseSourceId;
    return dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
  };

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  useEffect(() => {
    if (draggedIndex === null) {
      const order = (propertyOrder[boardId] && propertyOrder[boardId].length > 0)
        ? propertyOrder[boardId]
        : Object.keys(boardProperties);
      setLocalOrder(order);
    }
  }, [propertyOrder, boardId, boardProperties, draggedIndex]);
  const [rollupDataSourceLoading, setRollupDataSourceLoading] = useState<Record<string, boolean>>({});


  let mentionMembers: Members[] = [];
  mentionMembers = workspaceMembers;

  // if (!iscurrentNotPublic) {
  //     mentionMembers = sharedWith.map((u, index) => {
  //         const matchedMember = workspaceMembers.find(
  //             (wm) => wm.userEmail === u.email
  //         );

  //         return {
  //             userId: matchedMember ? matchedMember.userId : `shared-${index}`,
  //             userEmail: u.email,
  //             role: u.access,
  //             joinedAt: matchedMember ? matchedMember.joinedAt : "",
  //         userName: matchedMember ? matchedMember.userName : u.email, // fallback to email if no match
  //         };
  //     });
  // } else {
  //     mentionMembers = workspaceMembers;
  // }
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  const [showRelationViewSelector, setShowRelationViewSelector] = useState(false);
  const [newRelationPropertyId, setNewRelationPropertyId] = useState<string | null>(null);
  const [relationDataSources, setRelationDataSources] = useState<any[]>([]);
  const [loadingRelationViews, setLoadingRelationViews] = useState(false);
  const [relationSelectTargetId, setRelationSelectTargetId] = useState<string | null>(null);
  const [relationSelectedView, setRelationSelectedView] = useState<{ id: string; title: string } | null>(null);
  const [showRelationConfigModal, setShowRelationConfigModal] = useState(false);
  const [isRelationLoading, setIsRelationLoading] = useState(false);
  const [pendingRelationData, setPendingRelationData] = useState<{
    dataSourceId: string; dataSourceTitle: string; databaseSourceId: string;
  } | null>(null);
  const { currentWorkspace } = useWorkspaceContext();


  useEffect(() => {
    // Reset localValues whenever the note changes
    setLocalValues({ ...note.value.databaseProperties });
    console.log("Local Values ------>", localValues)
  }, [note]);

  useEffect(() => {
    setLocalPropertyNames(
      Object.fromEntries(Object.entries(boardProperties).map(([key, prop]) => [key, prop.name]))
    );
  }, [boardProperties]);


  // Debounced API updater
  const debouncedUpdate = useCallback(
    debounce((key: string, value: any) => {
      onUpdateProperty(key, value);
    }, 600), // wait 600ms after user stops typing
    [onUpdateProperty]
  );

  useEffect(() => {
    return () => debouncedUpdate.cancel();
  }, [debouncedUpdate]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    // Mark this as a properties-reorder drag so the board doesn't show card/column drop UI
    e.dataTransfer.setData("application/x-board-property-row", "1");

    // Delay state update to allow drag to initialize properly
    // The browser will capture the element as the drag ghost before this runs
    setTimeout(() => {
      setDraggedIndex(index);
    }, 0);
  };

  const moveProperty = (dragIndex: number, hoverIndex: number) => {
    const newOrder = [...localOrder];
    const item = newOrder[dragIndex];
    if (!item) return; // Ensure item exists to avoid type widening to (string | undefined)[]
    newOrder.splice(dragIndex, 1);
    newOrder.splice(hoverIndex, 0, item);
    setLocalOrder(newOrder);
    setDraggedIndex(hoverIndex);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex === null) return;

    // Clear selection and force blur to prevent stuck hoist states
    window.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setPropertyOrder(boardId, localOrder);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    window.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };


  const handleLocalChange = (key: string, val: any, immediate: boolean = false) => {

    console.log("Key ---->", key, val)
    setLocalValues((prev) => ({ ...prev, [key]: val }));
    if (immediate) {
      // for checkbox, status, date → fire immediately
      onUpdateProperty(key, val);
    } else {
      // for text/number → debounce
      debouncedUpdate(key, val);
    }
  };

  const rollupRelationOptions = useMemo(
    () =>
      Object.entries(boardProperties)
        .filter(([, prop]) => prop.type === "relation")
        .map(([id, prop]) => ({
          id,
          name: prop.name || "Relation",
          linkedDatabaseId: prop.linkedDatabaseId
            ? String(prop.linkedDatabaseId)
            : undefined,
        })),
    [boardProperties],
  );

  const ensureRollupDataSource = useCallback(
    async (rawDataSourceId?: string) => {
      if (!rawDataSourceId) return;
      const dataSourceId = String(rawDataSourceId);
      // Check if datasource is already in context before making API call
      if (getDataSource(dataSourceId)) return;
      if (rollupDataSourceLoading[dataSourceId]) return;

      setRollupDataSourceLoading((prev) => ({ ...prev, [dataSourceId]: true }));
      try {
        const response: any = await getWithAuth(`/api/database/getdataSource/${dataSourceId}`);
        if (response?.success && response.collection?.dataSource) {
          const ds = response.collection.dataSource;
          const normalizedId =
            typeof ds._id === "string" ? ds._id : ds._id?.toString?.() || dataSourceId;
          // Only set if not already in context (double check)
          if (!getDataSource(normalizedId)) {
            setDataSource(normalizedId, ds);
          }
        }
      } catch (err) {
        console.error("Failed to load linked database", err);
      } finally {
        setRollupDataSourceLoading((prev) => {
          const next = { ...prev };
          delete next[dataSourceId];
          return next;
        });
      }
    },
    [getDataSource, rollupDataSourceLoading, setDataSource],
  );

  const handleRollupConfigUpdate = useCallback(
    async (
      rollupId: string,
      updates: {
        relationId?: string;
        linkedDatabaseId?: string;
        targetPropertyId?: string;
        calculation?: RollupConfig["calculation"];
        selectedOptions?: string[];
      },
    ) => {
      const property = boardProperties[rollupId];
      if (!property || property.type !== "rollup") return;

      const currentConfig = property.rollup || {};
      let nextConfig: RollupConfig = { ...currentConfig };

      // Handle relation change
      if (updates.relationId !== undefined) {
        const relationOption = rollupRelationOptions.find((option) => option.id === updates.relationId);
        const relationDataSourceId = updates.linkedDatabaseId || relationOption?.linkedDatabaseId;

        if (!relationDataSourceId) {
          toast.error("Selected relation is missing linked database");
          return;
        }

        nextConfig = {
          relationPropertyId: updates.relationId,
          relationDataSourceId: String(relationDataSourceId),
          targetPropertyId: undefined, // Reset when relation changes
          calculation: normalizeCalculation(currentConfig.calculation),
          selectedOptions: undefined, // Reset when relation changes
        };

        void ensureRollupDataSource(relationDataSourceId);
      }

      // Handle property change
      if (updates.targetPropertyId !== undefined) {
        if (!nextConfig.relationPropertyId || !nextConfig.relationDataSourceId) {
          toast.error("Select a relation first");
          return;
        }
        nextConfig.targetPropertyId = updates.targetPropertyId;
        // Reset selectedOptions when property changes
        nextConfig.selectedOptions = undefined;

        // Reset calculation if new property is not number-like and current calculation is mathematical
        const relatedDataSource = getDataSource(nextConfig.relationDataSourceId);
        const targetProperty = relatedDataSource?.properties?.[updates.targetPropertyId];
        const normalizedCalc = normalizeCalculation(nextConfig.calculation);
        const isMath = ["sum", "average", "min", "max", "median"].includes(normalizedCalc.category);
        if (isMath && !isNumberLike(targetProperty)) {
          nextConfig.calculation = { category: "original", value: "original" };
        }
      }

      // Handle calculation change
      if (updates.calculation !== undefined) {
        if (!nextConfig.relationPropertyId) {
          toast.error("Configure relation first");
          return;
        }
        nextConfig.calculation = updates.calculation;
        // Clear selectedOptions when switching to non-per-group calculation
        const normalizedCalc = normalizeCalculation(updates.calculation);
        const isPerGroup = (normalizedCalc.category === "count" || normalizedCalc.category === "percent") && normalizedCalc.value === "per_group";
        if (!isPerGroup) {
          nextConfig.selectedOptions = undefined;
        }
      }

      // Handle selectedOptions change
      if (updates.selectedOptions !== undefined) {
        nextConfig.selectedOptions = updates.selectedOptions;
      }

      await onRenameProperty(rollupId, localPropertyNames[rollupId] ?? property.name, undefined, undefined, nextConfig);
    },
    [boardProperties, localPropertyNames, onRenameProperty, rollupRelationOptions, ensureRollupDataSource],
  );

  return (
    <div className="w-full max-w-full bg-background dark:bg-background">
      <div
        role="table"
        aria-label="Page properties"
        className="w-full bg-background dark:bg-background relative"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedIndex !== null) handleDrop(e);
        }}
      >
        {localOrder.map((key, index) => {
          const property = boardProperties[key];
          if (!property) return null;
          const value = note.value.databaseProperties?.[key] ?? "";
          const Icon = PROPERTY_TYPES.find((prop) => prop.type === property.type)?.icon || Tag

          const renderInput = () => {
            switch (property.type) {
              case "text":
                return (
                  <TextPropertyInput
                    value={localValues[key] ?? ""}
                    onChange={(val, immediate) => handleLocalChange(key, val, immediate)}
                    property={property}
                  />
                );

              case "number":
                return (
                  <NumberPropertyInput
                    value={localValues[key] ?? ""}
                    onChange={(val) => handleLocalChange(key, val, false)}
                    property={property}
                  />
                );

              case "checkbox":
                return (
                  <CheckboxPropertyInput
                    value={localValues[key] ?? false}
                    onChange={(val, immediate) => handleLocalChange(key, val, immediate)}
                    property={property}
                  />
                );

              case "status":
                return (
                  <StatusPropertyInput
                    value={localValues[key] ?? ""}
                    propertyId={key}
                    onChange={(val) => handleLocalChange(key, val, true)}
                    property={property}
                    onEditOptions={() => { setEditingOptionsKey(key); setOptionsModalOpen(true); }}
                    boardId={boardId}
                    noteId={note._id}
                  />
                );

              case "person":
                return (
                  <PersonPropertyInput
                    value={localValues[key] ?? []}
                    onChange={(selected) => handleLocalChange(key, selected, true)}
                    availableMembers={mentionMembers}
                  />
                );

              case "relation":
                return (
                  <RelationPropertyInput
                    value={localValues[key] ?? []}
                    onChange={(selected) => handleLocalChange(key, selected, true)}
                    property={property}
                  />
                );
              case "rollup": {
                const rollupConfig = property.rollup;
                const relationDataSourceId = rollupConfig?.relationDataSourceId
                  ? String(rollupConfig.relationDataSourceId)
                  : undefined;

                // Load data source if needed
                if (relationDataSourceId && !getDataSource(relationDataSourceId)) {
                  void ensureRollupDataSource(relationDataSourceId);
                }

                const targetDataSource = relationDataSourceId
                  ? getDataSource(relationDataSourceId)
                  : undefined;
                const targetProperties = targetDataSource?.properties;
                const rollupResult = computeRollupData(
                  note,
                  property,
                  boardProperties,
                  getNotesByDataSourceId,
                  getDataSource,
                );

                const dsId = getCurrentDataSourceId();
                const currentDS = dsId ? getDataSource(dsId) : null;
                const isSprintAndSpecial = !!(currentDS?.isSprint && property.specialProperty);

                return (
                  <RollupPropertyInput
                    relationOptions={rollupRelationOptions}
                    selectedRelationId={rollupConfig?.relationPropertyId}
                    targetProperties={targetProperties}
                    selectedPropertyId={rollupConfig?.targetPropertyId}
                    calculation={rollupConfig?.calculation || { category: "original", value: "original" }}
                    selectedOptions={rollupConfig?.selectedOptions || []}
                    loadingProperties={
                      relationDataSourceId ? !!rollupDataSourceLoading[relationDataSourceId] : false
                    }
                    disabled={rollupRelationOptions.length === 0 || isSprintAndSpecial}
                    rollupResult={rollupResult}
                    onChange={(updates) => handleRollupConfigUpdate(key, updates)}
                    showAs={(property as any).showAs}
                    progressColor={(property as any).progressColor}
                    progressDivideBy={(property as any).progressDivideBy}
                    showNumberText={(property as any).showNumberText}
                    numberFormat={(property as any).numberFormat}
                    decimalPlaces={(property as any).decimalPlaces}
                  />
                );
              }

              case "date":
                return (
                  <DatePropertyInput
                    value={localValues[key] ?? ""}
                    onChange={(val, immediate) => handleLocalChange(key, val, immediate)}
                    property={property}
                  />
                );

              case "priority":
                return (
                  <PriorityPropertyInput
                    value={localValues[key]}
                    options={property.options}
                    propertyId={key}
                    onChange={(val) => handleLocalChange(key, val, true)}
                    onEditOptions={() => { setEditingOptionsKey(key); setOptionsModalOpen(true); }}
                  />
                )

              case "select":
                return (
                  <SelectPropertyInput
                    value={localValues[key]}
                    options={property.options ?? []}
                    onChange={(val) => handleLocalChange(key, val, true)}
                    onEditOptions={() => { setEditingOptionsKey(key); setOptionsModalOpen(true) }}
                  />
                );

              case "multi_select":
                return (
                  <MultiSelectPropertyInput
                    value={localValues[key] ?? []}
                    options={property.options ?? []}
                    onChange={(val) => handleLocalChange(key, val, true)}
                    onEditOptions={() => { setEditingOptionsKey(key); setOptionsModalOpen(true) }}
                  />
                );

              case "github_pr":
                return (
                  <GitHubPrPropertyInput
                    value={localValues[key]}
                    onChange={(val, immediate) => handleLocalChange(key, val, immediate ?? true)}
                    property={property}
                  />
                );

              case "file":
                return (
                  <FilePropertyInput
                    value={localValues[key]}
                    onChange={(val) => handleLocalChange(key, val, true)}
                  />
                );

              case "formula":
                return (
                  <FormulaPropertyInput
                    value={localValues[key]}
                    property={property as any}
                    errorMessage={note.value.formulaErrors?.[key]}
                    className="flex items-center text-sm w-[250px] px-2 py-1.5"
                  />
                );


              default:
                return (
                  <DefaultPropertyInput
                    value={localValues[key]}
                    onChange={(val) => handleLocalChange(key, val, false)}
                    property={property}
                  />
                );
            }
          };

          return (
            <div key={key}
              role="row"
              className={`flex mx-3 relative gap-4 mb-1.5 ${draggedIndex === index ? 'opacity-40' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => {
                if (draggedIndex !== null && draggedIndex !== index) {
                  moveProperty(draggedIndex, index);
                }
              }}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            >
              {/* Property Name Column */}
              <div className="relative">
                <div
                  className={`flex items-center w-40 max-w-40 min-w-0 px-3 py-2 bg-background dark:bg-background ${draggedIndex === null ? 'hover:bg-gray-200 dark:hover:bg-[#2c2c2c]' : ''} rounded-sm cursor-pointer`}
                  onClick={() => {
                    setEditingProperty(key);
                    setEditPropertyModalOpen(true);
                  }}>
                  <div className="flex items-center text-gray-600 dark:text-gray-400 min-w-0">
                    <div className="mr-2 text-gray-500 flex-shrink-0">
                      <Icon size={16} className="transform scale-110" />
                    </div>

                    {editingPropertyKey === key ? (
                      <input
                        type="text"
                        value={localPropertyNames[key]}
                        autoFocus
                        onChange={(e) =>
                          setLocalPropertyNames((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onBlur={() => {
                          setEditingPropertyKey(null);
                          onRenameProperty(key, localPropertyNames[key] ?? ""); // send rename to parent / backend
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setEditingPropertyKey(null);
                            onRenameProperty(key, localPropertyNames[key] ?? "");
                          } else if (e.key === "Escape") {
                            setEditingPropertyKey(null);
                          }
                        }}
                        className="text-sm font-medium w-full bg-gray-100 dark:bg-gray-800 p-1 rounded outline-none"
                      />
                    ) : (
                      <span
                        className="text-sm font-medium truncate cursor-pointer"
                        onDoubleClick={() => setEditingPropertyKey(key)}
                      >
                        {(localPropertyNames[key] || '').charAt(0).toUpperCase() + (localPropertyNames[key] || '').slice(1)}
                      </span>
                    )}
                  </div>
                </div>
                {/* Edit Property Modal */}
                {editPropertyModalOpen && editingProperty === key && (
                  <EditPropertyModal
                    isOpen={editPropertyModalOpen && editingProperty === key}
                    onClose={() => setEditPropertyModalOpen(false)}
                    onRename={() => {
                      setEditingPropertyKey(key);
                      setEditPropertyModalOpen(false);
                    }}
                    onDelete={() => {
                      setDeleteConfirmKey(key);
                      setEditPropertyModalOpen(false);
                    }}
                    propertyType={property.type}
                    board={collectionViewBlock!} // Get board from global block context
                    propertyId={key}
                    property={property as BoardProperty}
                  />
                )}
              </div>

              {/* Property Value Column */}
              <div className=" flex items-center relative">
                {renderInput()}

                {/* Property Options Modal - positioned absolute to this property row */}
                {optionsModalOpen && editingOptionsKey && boardProperties[key] && editingOptionsKey === key && (
                  <PropertyOptionsModal
                    isOpen={optionsModalOpen && editingOptionsKey === key}
                    options={boardProperties[key].options || []}
                    onClose={() => {
                      setOptionsModalOpen(false);
                      setEditingOptionsKey(null);
                    }}
                    onSave={(newOptions) => {
                      console.log("New Options --->", newOptions);
                      const property = boardProperties[key];
                      if (!property) return;
                      setOptionsModalOpen(false);
                      setEditingOptionsKey(null);
                      // Call API to persist - this will update the data source in context
                      onRenameProperty(key, property.name, newOptions);
                    }}
                    property={boardProperties[key] as any}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Property Option */}
      <div className="relative">
        <button
          ref={addPropertyBtnRef}
          onClick={() => {
            setShowDialog((prev) => !prev);
          }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-3 rounded-md hover:bg-gray-50 dark:hover:bg-[#2c2c2c] w-full pl-5 bg-background dark:bg-background"
        >
          <Plus size={16} />
          <span>Add property</span>
        </button>

        <div className="absolute ml-5 border border-gray-200 rounded-md shadow-xl dark:border-[#3c3c3c]">
          {showDialog && (
            <AddPropertyDialog
              triggerRef={addPropertyBtnRef}
              onSelect={async (type: string, options?: any) => {
                if (type === "relation" && options?.showViewSelector) {
                  // Don't create property yet - fetch views first, then show selector
                  setShowDialog(false);
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
                    }
                  } catch (err) {
                    toast.error("Failed to fetch views");
                  } finally {
                    setLoadingRelationViews(false);
                  }

                  return null;
                }
                const result = await onAddProperty(type, options);
                return result;
              }}
              onClose={() => setShowDialog(false)}
            />
          )}
        </div>

        {/* Relation View Selector */}
        {showRelationViewSelector && (
          <>
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-transparent z-[190]"
              onClick={() => {
                setShowRelationViewSelector(false);
                setRelationDataSources([]);
                setRelationSelectTargetId(null);
              }}
            />
            {/* Dialog positioned same as AddPropertyDialog */}
            <div className="absolute ml-5 border border-gray-200 rounded-md shadow-xl dark:border-[#3c3c3c] z-[200]">
              <RelationViewSelector
                key={`relation-selector-${showRelationViewSelector}`}
                isOpen={true}
                loading={loadingRelationViews}
                dataSources={relationDataSources}
                onClose={() => {
                  setShowRelationViewSelector(false);
                  setRelationDataSources([]);
                  setRelationSelectTargetId(null);
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
            <div className="absolute ml-5 border border-gray-200 rounded-md shadow-xl dark:border-[#3c3c3c] z-[200]">
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

                    // Ensure the selected data source is saved in the property option first
                    if (relationSelectTargetId) {
                      await onRenameProperty(relationSelectTargetId, config.propertyName, [{ id: dataSourceId, name: dataSourceTitle }], {
                        relationLimit: config.relationLimit,
                        twoWayRelation: config.twoWayRelation,
                        linkedDatabaseId: databaseSourceId,
                      });
                    } else {
                      // Pass both dataSourceId (for options) and databaseSourceId (for linkedDatabaseId)
                      const created = await onAddProperty(
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
                        setNewRelationPropertyId(created.id);
                      }
                    }

                    // Now fetch notes using the relatedDataSourceId stored in the option
                    setRelationSelectedView({ id: dataSourceId, title: dataSourceTitle });

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
      </div>

      <DeleteConfirmationModal
        isOpen={!!deleteConfirmKey}
        header="Delete Property"
        message={deleteConfirmKey
          ? `Are you sure you want to delete ${localPropertyNames[deleteConfirmKey]?.toLocaleUpperCase() ?? 'this property'} from the board?`
          : "Are you sure you want to delete this property from the board?"}
        onCancel={() => setDeleteConfirmKey(null)}
        onConfirm={async () => {
          if (deleteConfirmKey) {
            console.log("Delete Confimation Key --->", deleteConfirmKey);
            await onDeleteProperty(deleteConfirmKey);
            setDeleteConfirmKey(null);
          }
        }}
      />

    </div>
  );
}
