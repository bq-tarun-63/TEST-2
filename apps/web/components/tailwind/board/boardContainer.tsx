"use client";

import BoardToolbar from "@/components/tailwind/board/boardToolbar";
import BoardView from "@/components/tailwind/board/boardView/boardView";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { postWithAuth, getWithAuth } from "@/lib/api-helpers";
import type { DatabaseSource, ViewCollection } from "@/types/board";
import { updateCollectionViewBlock } from "@/lib/collectionViewHelpers";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { ObjectId } from "bson";
import { useDatabaseProperties } from "@/hooks/use-viewProperty";
import AddViewDialog from "./addViewDialog";
import CalendarView from "./calendarView/calenderView";
import ListView from "./listView/listView";
import TimelineView from "./timelineView/timelineView";
import FormView from "./formView/formView";
import ChartView from "./chartView/chartView";
import GalleryView from "./galleryView/galleryView";
import FiltersAndSortsBar from "./filtersAndSortsBar";
import { Block } from "@/types/block";
import { useComputedNotes } from "@/hooks/use-computedNotes";
interface BoardContainerProps {
  readonly boardId: string;
  readonly datasourceLoading?: boolean;
  readonly onViewChangeOverride?: (viewId: string) => void;
}

export default function BoardContainer({ boardId, datasourceLoading = false, onViewChangeOverride }: BoardContainerProps) {

  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const { getBlock, updateBlock, upsertBlocks } = useGlobalBlocks();

  const {
    getNotesByDataSourceId,
    currentView,
    setCurrentView,
    setDataSource,
    getDataSource,
    setCurrentDataSource,
    currentDataSource,
    setBoardFilters,
    setAdvancedFilters,
    setBoardSortBy,
    setGroupBy,
    setPropertyVisibility,
    getPropertyVisibility,
    getCurrentDataSourceProperties,
    getCurrentDataSource,
    setLayoutSettings,
    setChartSettings
  } = useBoard();

  // Get board from global block context - use ViewCollection directly
  const collectionViewBlock = getBlock(boardId);
  const loadedSettingsRef = useRef<Set<string>>(new Set());

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

  const { handleAddProperty } = useDatabaseProperties(collectionViewBlock as Block, dummyNote, () => { });

  // Helper function to update collection_view block
  // This wraps updateCollectionViewBlock for easier use within this component
  const updateBoardBlock = async (
    updatedValue: ViewCollection,
    apiCall: () => Promise<any>,
    onSuccess?: (response: any) => void,
    onError?: (error: Error) => void
  ) => {
    return updateCollectionViewBlock({
      blockId: boardId,
      updatedValue,
      apiCall,
      globalBlocks: { getBlock, updateBlock },
      onSuccess,
      onError,
    });
  };

  const currentViewData = currentView[boardId];
  const currentViewId = currentViewData?.id;

  let currentViewObj;
  if (currentViewId && collectionViewBlock) {
    // Prioritize ID match - if currentViewId exists, ONLY match by ID
    currentViewObj = collectionViewBlock.value.viewsTypes?.find((v) => v._id === currentViewId);
  } else if (currentViewData?.type && collectionViewBlock) {
    // Only fallback to type if no ID is available
    currentViewObj = collectionViewBlock.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
  }

  const boardView = currentViewObj?.viewType || currentViewData?.type || collectionViewBlock?.value?.viewsTypes?.[0]?.viewType || "board";
  const actualCurrentViewId = currentViewObj?._id || currentViewId || collectionViewBlock?.value?.viewsTypes?.[0]?._id || "";

  // Get dataSourceId from current view
  const currentDataSourceId = currentViewObj?.databaseSourceId as string | undefined;

  // Set currentDataSource in context when view changes - this ensures boardView can access properties
  useEffect(() => {
    if (currentDataSourceId && boardId) {
      // Only update if the value is different to avoid infinite loops
      if (currentDataSource[boardId] !== currentDataSourceId) {
        setCurrentDataSource(boardId, currentDataSourceId);
      }
    }
  }, [boardId, currentDataSourceId, setCurrentDataSource, currentDataSource]);

  // Fetch datasource if not in context
  useEffect(() => {
    if (!currentDataSourceId) return;

    // Check if datasource is already in context
    if (!getDataSource(currentDataSourceId)) {
      // Fetch datasource
      (async () => {
        try {
          const res = await getWithAuth(`/api/database/getdataSource/${currentDataSourceId}`) as {
            success?: boolean;
            collection?: {
              dataSource?: any;
              blocks?: Block[]; // Changed from notes to blocks
            }
          };

          if (res?.success && res.collection?.dataSource) {
            const ds = res.collection.dataSource;
            const dsId = ds._id || currentDataSourceId;
            setDataSource(dsId, ds as any);

            // Store blocks in global block context
            const blocks = res.collection.blocks || [];
            if (blocks.length > 0) {
              await upsertBlocks(blocks);
            }
          }
        } catch (err) {
          console.error(`Failed to fetch data source ${currentDataSourceId}:`, err);
        }
      })();
    }
  }, [currentDataSourceId, getDataSource, setDataSource, upsertBlocks]);

  // Get notes by dataSourceId from context
  const rawDatasourcePageBlocks = currentDataSourceId ? getNotesByDataSourceId(currentDataSourceId) : [];

  // Recompute formulas on-the-fly (derived state)
  const boardProperties = getCurrentDataSourceProperties(boardId) || {};
  const datasourcePageBlocks = useComputedNotes(
    rawDatasourcePageBlocks,
    boardProperties,
    boardId,
    getNotesByDataSourceId,
    getDataSource
  );

  // load setting of all viewtypes
  useEffect(() => {
    if (!collectionViewBlock || !collectionViewBlock.value.viewsTypes) return;

    console.log("................Loading settings for all view types...");

    // Process all views including the first one
    collectionViewBlock.value.viewsTypes.forEach((view, index) => {

      const viewTypeId = view._id || "";

      if (!viewTypeId) return;

      const settingsKey = `${boardId}-${viewTypeId}`;

      if (loadedSettingsRef.current.has(settingsKey)) {
        return;
      }

      if (view.settings && Object.keys(view.settings).length > 0) {
        loadedSettingsRef.current.add(settingsKey);

        if (view.settings.filters && Array.isArray(view.settings.filters) && view.settings.filters.length > 0) {
          const filtersMap: Record<string, string[]> = {};
          view.settings.filters.forEach((filter: any) => {
            // Skip advanced filters - they're handled separately from settings
            if (filter.isAdvanced) {
              return;
            }
            if (!filtersMap[filter.propertyId]) {
              filtersMap[filter.propertyId] = [];
            }
            if (Array.isArray(filter.value)) {
              filtersMap[filter.propertyId] = filter.value;
            } else if (filter.value !== undefined && filter.value !== null) {
              filtersMap[filter.propertyId] = [filter.value];
            }
          });
          setBoardFilters(viewTypeId, filtersMap);
        }

        // Load advanced filters
        const settings = view.settings as any;
        if (settings?.advancedFilters && Array.isArray(settings.advancedFilters)) {
          setAdvancedFilters(viewTypeId, settings.advancedFilters);
        } else {
          setAdvancedFilters(viewTypeId, []);
        }

        if (view.settings.sorts && Array.isArray(view.settings.sorts) && view.settings.sorts.length > 0) {
          const newSorts = view.settings.sorts.map((s: any) => ({
            propertyId: s.propertyId,
            direction: s.direction,
          }));
          setBoardSortBy(viewTypeId, newSorts);
        }

        if (view.settings.group && view.settings.group.propertyId) {
          setGroupBy(viewTypeId, view.settings.group.propertyId);
        }

        if (view.settings.propertyVisibility && Array.isArray(view.settings.propertyVisibility)) {
          const newVisibility = view.settings.propertyVisibility.map((pv: any) =>
            typeof pv === 'string' ? pv : pv.propertyId
          );
          setPropertyVisibility(viewTypeId, newVisibility);
        }

        if (view.settings.layout) {
          setLayoutSettings(viewTypeId, view.settings.layout);
        }
      } else {
        // Mark as loading before making the API call to prevent duplicate calls
        loadedSettingsRef.current.add(settingsKey);

        (async () => {
          try {
            const res = await getWithAuth(`/api/database/settings/get/${viewTypeId}?blockId=${boardId}`) as {
              success?: boolean;
              viewType?: {
                _id?: string;
                settings?: any;
                isLocked?: boolean;
              };
            };

            if (res?.success && res.viewType?.settings) {
              if (res.viewType.settings.filters && Array.isArray(res.viewType.settings.filters) && res.viewType.settings.filters.length > 0) {
                const filtersMap: Record<string, string[]> = {};
                res.viewType.settings.filters.forEach((filter: any) => {
                  // Skip advanced filters - they're handled separately
                  if (filter.isAdvanced) {
                    return;
                  }
                  if (!filtersMap[filter.propertyId]) {
                    filtersMap[filter.propertyId] = [];
                  }
                  if (Array.isArray(filter.value)) {
                    filtersMap[filter.propertyId] = filter.value;
                  } else if (filter.value !== undefined && filter.value !== null) {
                    filtersMap[filter.propertyId] = [filter.value];
                  }
                });
                setBoardFilters(viewTypeId, filtersMap);
              }

              // Load advanced filters from API response
              const apiSettings = res.viewType.settings as any;
              if (apiSettings?.advancedFilters && Array.isArray(apiSettings.advancedFilters)) {
                setAdvancedFilters(viewTypeId, apiSettings.advancedFilters);
              } else {
                setAdvancedFilters(viewTypeId, []);
              }

              if (res.viewType.settings.sorts && Array.isArray(res.viewType.settings.sorts) && res.viewType.settings.sorts.length > 0) {
                const newSorts = res.viewType.settings.sorts.map((s: any) => ({
                  propertyId: s.propertyId,
                  direction: s.direction,
                }));
                setBoardSortBy(viewTypeId, newSorts);
              }

              if (res.viewType.settings.group && res.viewType.settings.group.propertyId) {
                setGroupBy(viewTypeId, res.viewType.settings.group.propertyId);
              }

              if (res.viewType.settings.propertyVisibility && Array.isArray(res.viewType.settings.propertyVisibility)) {
                const newVisibility = res.viewType.settings.propertyVisibility.map((pv: any) =>
                  typeof pv === 'string' ? pv : pv.propertyId
                );
                setPropertyVisibility(viewTypeId, newVisibility);
              }

              if (res.viewType.settings.layout) {
                setLayoutSettings(viewTypeId, res.viewType.settings.layout);
              }
            }
          } catch (err) {
            console.error(`Failed to fetch settings for viewTypeId ${viewTypeId} (index ${index}):`, err);
          }
        })();
      }
    });
  }, [boardId, collectionViewBlock, setBoardFilters, setAdvancedFilters, setBoardSortBy, setGroupBy, setPropertyVisibility, setLayoutSettings, setChartSettings]);

  useEffect(() => {
    if (!collectionViewBlock?.value?.viewsTypes?.[0]) return;

    const currentViewData = currentView[boardId];

    if (!currentViewData) {
      const firstView = collectionViewBlock.value.viewsTypes[0] || "";
      if (firstView) {
        setCurrentView(boardId, firstView._id, firstView.viewType);
      }
    }
    else {
      console.log("Current view already set:", currentViewData);
    }
  }, [boardId, currentView, collectionViewBlock?.value.viewsTypes, setCurrentView]);

  const handleAddView = async (view: "board" | "list" | "calendar" | "timeline" | "forms" | "chart" | "gallery") => {
    if (!collectionViewBlock) return;

    const newViewTypeId = new ObjectId().toString();
    const newViewTypeTitle = view.charAt(0).toUpperCase() + view.slice(1);

    // Get databaseSourceId from currently selected view type
    const existingDataSourceId = currentViewObj?.databaseSourceId || collectionViewBlock?.value.viewsTypes?.[0]?.databaseSourceId;
    setIsDialogOpen(false);


    if (!existingDataSourceId) {
      toast.error("Data source not found for current view!");
      return;
    }

    // Validate required properties exist in the datasource
    let dataSource = getDataSource(existingDataSourceId);

    if (!dataSource) {
      toast.error("Data source not found!");
      return;
    }


    // Check for required properties based on view type and create if missing
    const properties = dataSource.properties || {};
    const propertyEntries = Object.entries(properties);

    if (view === "board" || view === "list") {
      // Check if datasource has a status property, create if missing
      const hasStatusProperty = propertyEntries.some(([_, prop]) => prop.type === "status" && prop.default === true);
      if (!hasStatusProperty) {
        handleAddProperty("status", undefined, undefined, undefined, "Status");
      }
    } else if (view === "timeline" || view === "calendar") {
      // Check if datasource has a date property, create if missing
      const hasDateProperty = propertyEntries.some(([_, prop]) => prop.type === "date");
      if (!hasDateProperty) {
        handleAddProperty("date", undefined, undefined, undefined, "Date");
      }
    }


    try {
      const currentValue = collectionViewBlock.value;
      const newViewType = {
        _id: newViewTypeId,
        viewType: view,
        icon: "",
        title: newViewTypeTitle,
        databaseSourceId: existingDataSourceId,
        viewDatabaseId: boardId || collectionViewBlock._id,
        settings: {
          propertyVisibility: view === "list"
            ? Object.keys(properties).map(propId => ({ propertyId: propId }))
            : [],
          filters: [],
          advancedFilters: [],
          layout: {
            openPagesIn: "side_peek",
            ...(view === "board" ? { cardPreview: "none" } : {}),
            ...(view === "gallery" ? { cardPreview: "page_content" } : {}),
          },
        },
      };
      const updatedValue: ViewCollection = {
        ...currentValue,
        viewsTypes: [...(currentValue.viewsTypes || []), newViewType],
      };

      setCurrentView(boardId, newViewTypeId, view);

      await updateCollectionViewBlock({
        blockId: boardId,
        updatedValue,
        apiCall: async () => {
          const res = await postWithAuth(`/api/database/addViewType`, {
            blockId: boardId,
            viewId: newViewTypeId,
            typeToAdd: view,
            viewTypeValue: newViewType
          });
          if (!res.view) {
            throw new Error(res?.message || "Failed to create view");
          }
          return res;
        },
        globalBlocks: { getBlock, updateBlock },
        onSuccess: async (res) => {
        },
        onError: (error) => {
          // Revert currentView
          const firstView = collectionViewBlock?.value?.viewsTypes?.[0];
          if (firstView) {
            if (onViewChangeOverride) {
              onViewChangeOverride(firstView._id);
            } else {
              setCurrentView(boardId, firstView._id, firstView.viewType);
            }
          }
          console.error("Error in creating the View:", error);
          toast.error("Failed to create view!");
        },
      });
      // After the block update has settled, we can safely sync the URL
      // since the global block context will now contain the new view.
      if (onViewChangeOverride) {
        onViewChangeOverride(newViewTypeId);
      }
    } catch (err) {
      console.error("Failed to add view:", err);
    }
  };

  if (!collectionViewBlock) {
    return <div className="p-4 text-muted-foreground">⚠️ Board not found</div>;
  }

  // Helper function to check for required properties and render appropriate content
  const renderViews = () => {
    // Check for required properties based on view type
    const boardProperties = getCurrentDataSourceProperties(boardId) || {};
    const propertyEntries = Object.entries(boardProperties);

    // Check if required property exists
    let missingProperty: { type: string; name: string } | null = null;

    if (boardView === "board" || boardView === "list") {
      const hasStatusProperty = propertyEntries.some(([_, prop]) => prop.type === "status" && prop.default === true);
      if (!hasStatusProperty) {
        missingProperty = { type: "status", name: "Status" };
      }
    } else if (boardView === "timeline" || boardView === "calendar") {
      const hasDateProperty = propertyEntries.some(([_, prop]) => prop.type === "date");
      if (!hasDateProperty) {
        missingProperty = { type: "date", name: "Date" };
      }
    }

    // If property is missing, show message instead of view
    if (missingProperty) {
      return (
        <div className="flex flex-col items-center justify-center py-10 px-4">
          <div className="text-center space-y-4 max-w-md">
            <p className="m-0 text-lg font-medium text-gray-900 dark:text-gray-100">
              No default {missingProperty.name.toLowerCase()} property
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your data source needs a {missingProperty.name.toLowerCase()} property to display the {boardView} view.
            </p>
            <button
              onClick={async () => {
                await handleAddProperty(missingProperty!.type, undefined, undefined, undefined, missingProperty!.name);
              }}
              className="inline-flex items-center px-4 py-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline transition-colors"
            >
              Add {missingProperty.name.toLowerCase()} property
            </button>
          </div>
        </div>
      );
    }

    // Render views normally if property exists
    return (
      <>
        {boardView === "board" && <BoardView board={collectionViewBlock} datasourcePageBlocks={datasourcePageBlocks} />}
        {boardView === "calendar" && <CalendarView board={collectionViewBlock} notes={datasourcePageBlocks} />}
        {boardView === "timeline" && <TimelineView board={collectionViewBlock} notes={datasourcePageBlocks} />}
        {boardView === "list" && <ListView board={collectionViewBlock} notes={datasourcePageBlocks} />}
        {boardView === "forms" && <FormView board={collectionViewBlock} notes={datasourcePageBlocks} />}
        {boardView === "chart" && <ChartView board={collectionViewBlock} notes={datasourcePageBlocks} />}
        {boardView === "gallery" && <GalleryView board={collectionViewBlock} notes={datasourcePageBlocks} />}
      </>
    );
  };

  return (
    <div className="space-y-4 w-full">
      {/* Toolbar */}
      <BoardToolbar
        currentView={(currentView[boardId]?.id || currentView[boardId]?.type || actualCurrentViewId || boardView)}
        onChangeView={(viewId) => {
          let view;
          if (collectionViewBlock.value.viewsTypes) {
            view = collectionViewBlock.value.viewsTypes.find((v) => v._id === viewId);
            // If not found by ID, try by type (fallback)
            if (!view) {
              view = collectionViewBlock.value.viewsTypes.find((v) => v.viewType === viewId);
            }
          }
          if (view) {
            if (onViewChangeOverride) {
              onViewChangeOverride(view._id);
            } else {
              setCurrentView(boardId, view._id, view.viewType);
            }
          }
        }}
        onAddView={() => {
          setIsDialogOpen((prev) => !prev);
        }}
        boardViewsTypes={collectionViewBlock.value.viewsTypes}
        board={collectionViewBlock}
      >
        {isDialogOpen && (
          <AddViewDialog
            existingViews={collectionViewBlock.value.viewsTypes}
            onSelect={handleAddView}
            onClose={() => setIsDialogOpen(false)}
          />
        )}
      </BoardToolbar>

      {/* Filters and Sorts Bar */}
      <FiltersAndSortsBar
        board={collectionViewBlock}
        boardProperties={getCurrentDataSourceProperties(boardId) || {}}
      />

      {/* View Renderer */}
      <div className="rounded-lg bg-background py-2 w-full">
        {datasourceLoading ? (
          <div className="w-full animate-pulse space-y-6 p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative w-4 h-4">
                <div className="absolute inset-0 border-2 border-gray-400 dark:border-gray-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Loading {boardView} view...
              </span>
            </div>

            {/* Small header skeleton */}
            <div className="h-6 w-[150px] rounded-sm bg-[rgb(235,235,235)] dark:bg-[rgb(45,45,45)]" />

            {/* Three placeholder cards (full width responsive) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-52 rounded-lg bg-[rgb(235,235,235)] dark:bg-[rgb(45,45,45)]"
                />
              ))}
            </div>
          </div>
        ) : renderViews()}
      </div>
    </div>
  );
}
