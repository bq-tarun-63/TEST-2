// context/BoardContext.tsx
"use client";

import { postWithAuth, getWithAuth } from "@/lib/api-helpers";
import type { Comment, DatabaseSource, SortItem, ViewCollection } from "@/types/board";
import type { BoardProperties } from "@/types/board";
import type { IChartSettings } from "@/models/types/ViewTypes";
import type { LayoutSettings } from "@/types/board";
import { type ReactNode, createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useSocketContext } from "@/contexts/socketContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import type { Block } from "@/types/block";

interface BoardContextType {
  // removeBoard: (blockId: string) => void; // Commented out

  dataSources: Record<string, DatabaseSource>; // key: dataSourceId -> DatabaseSource
  setNotesState: (dataSourceId: string, notes: Block[]) => void;
  updateAllNotes: (dataSourceId: string, newNotes: Block[]) => void;
  updateNoteComments: (dataSourceId: string, noteId: string, newComment: Comment) => void;
  refreshNotes: (dataSourceId: string) => Promise<void>; // Refresh notes for a dataSourceId from API
  getNotesByDataSourceId: (dataSourceId: string) => Block[]; // Helper to get notes for a specific dataSourceId
  getNoteById: (noteId: string) => Block | null; // Helper to get a block by ID from global block context
  getRelationNoteTitle: (noteId: string, linkedDatabaseId: string, fallbackTitle?: string) => string; // Get current title of a relation note
  getValidRelationIds: (noteIds: string[], linkedDatabaseId: string) => string[]; // Filters out deleted IDs without hiding unloaded ones

  // Data Source management
  setDataSource: (dataSourceId: string, dataSource: DatabaseSource) => void;
  setDataSources: (dataSources: Record<string, DatabaseSource>) => void;
  updateDataSource: (dataSourceId: string, updatedDataSource: Partial<DatabaseSource>) => void;
  getDataSource: (dataSourceId: string) => DatabaseSource | undefined;

  // Current state
  // Note: boardId refers to the collection_view block ID (the board's block ID)
  currentDataSource: Record<string, string | undefined>; // boardId -> dataSourceId
  getCurrentDataSource: (boardId: string) => DatabaseSource | undefined;
  getCurrentDataSourceProperties: (boardId: string) => BoardProperties;
  setCurrentDataSource: (boardId: string, dataSourceId: string | undefined) => void;

  groupBy: Record<string, string | undefined>; // key: viewTypeId -> propertyId
  setGroupBy: (viewTypeId: string, propertyId: string | undefined) => void;
  getGroupBy: (boardId: string) => string | undefined; // Helper to get groupBy for current view

  filters: Record<string, Record<string, string[]>>; // key: viewTypeId -> { propertyId: string[] }
  setBoardFilters: (viewTypeId: string, boardFilters: Record<string, string[]>) => void;
  getFilters: (boardId: string) => Record<string, string[]>; // Helper to get filters for current view

  advancedFilters: Record<string, any[]>; // key: viewTypeId -> IAdvancedFilterGroup[]
  setAdvancedFilters: (viewTypeId: string, advancedFilters: any[]) => void;
  getAdvancedFilters: (boardId: string) => any[]; // Helper to get advanced filters for current view

  sortBy: Record<string, SortItem[]>; // key: viewTypeId -> SortItem[]
  setBoardSortBy: (viewTypeId: string, boardSorts: SortItem[]) => void;
  getSortBy: (boardId: string) => SortItem[]; // Helper to get sortBy for current view

  chartSettings: Record<string, IChartSettings | undefined>; // key: viewTypeId -> IChartSettings
  setChartSettings: (viewTypeId: string, chartSettings: IChartSettings | undefined) => void;
  getChartSettings: (boardId: string) => IChartSettings | undefined; // Helper to get chartSettings for current view

  propertyVisibility: Record<string, string[]>; // key: viewTypeId -> propertyId[]
  setPropertyVisibility: (viewTypeId: string, propertyIds: string[]) => void;
  getPropertyVisibility: (boardId: string) => string[]; // Helper to get propertyVisibility for current view

  layoutSettings: Record<string, LayoutSettings | undefined>; // key: viewTypeId -> LayoutSettings
  setLayoutSettings: (viewTypeId: string, layoutSettings: LayoutSettings | undefined) => void;
  getLayoutSettings: (boardId: string) => LayoutSettings | undefined; // Helper to get layoutSettings for current view

  propertyOrder: Record<string, string[]>; // key: boardId → order of properties
  setPropertyOrder: (boardId: string, order: string[]) => void;

  currentBoardNoteId: string | null;
  setCurrentBoardNoteId: (noteId: string | null) => void;

  currentView: Record<string, { id?: string; type: string }>; // boardId -> { id?, type }
  setCurrentView: (boardId: string, viewId: string, viewType: string) => void;

  searchQuery: Record<string, string>;
  setSearchQuery: (boardId: string, query: string) => void;

}

const BoardContext = createContext<BoardContextType | undefined>(undefined);

export const BoardProvider = ({ children }: { children: ReactNode }) => {
  const { socket } = useSocketContext();
  const { getBlock, upsertBlocks } = useGlobalBlocks();
  const [dataSources, setDataSourcesState] = useState<Record<string, DatabaseSource>>({});
  const [currentDataSource, setCurrentDataSourceState] = useState<Record<string, string | undefined>>({});
  // Settings stored per viewTypeId (not boardId)
  const [groupBy, setGroupByState] = useState<Record<string, string | undefined>>({}); // key: viewTypeId
  const [filters, setFilters] = useState<Record<string, Record<string, string[]>>>({}); // key: viewTypeId
  const [advancedFilters, setAdvancedFiltersState] = useState<Record<string, any[]>>({}); // key: viewTypeId
  const [propertyOrder, setPropertyOrderState] = useState<Record<string, string[]>>({}); // key: boardId (collection_view block ID)
  const [propertyVisibility, setPropertyVisibilityState] = useState<Record<string, string[]>>({}); // key: viewTypeId
  const [currentBoardNoteId, setCurrentBoardNoteId] = useState<string | null>(null);
  const [currentView, setCurrentViewState] = useState<Record<string, { id?: string; type: string }>>({}); // key: boardId (collection_view block ID)
  const [sortBy, setSortBy] = useState<Record<string, SortItem[]>>({}); // key: viewTypeId
  const [chartSettings, setChartSettingsState] = useState<Record<string, IChartSettings | undefined>>({}); // key: viewTypeId
  const [layoutSettings, setLayoutSettingsState] = useState<Record<string, LayoutSettings | undefined>>({}); // key: viewTypeId
  const [searchQuery, setSearchQueryState] = useState<Record<string, string>>({}); // key: boardId (collection_view block ID)

  // Refresh blocks for a dataSourceId by fetching from API
  const refreshNotes = async (dataSourceId: string) => {
    const normalizedDataSourceId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);
    try {
      const response = await getWithAuth(`/api/database/getdataSource/${normalizedDataSourceId}`) as {
        success?: boolean;
        collection?: {
          dataSource?: DatabaseSource;
          blocks?: Block[];
        };
      };

      if (response?.success && response.collection) {
        // Store blocks in global block context
        if (response.collection.blocks && response.collection.blocks.length > 0) {
          upsertBlocks(response.collection.blocks);
        }

        // Also update dataSource if provided
        if (response.collection.dataSource) {
          const ds = response.collection.dataSource;
          const dsId = ds._id || normalizedDataSourceId;
          setDataSource(dsId, ds);
        }
      }
    } catch (error) {
      console.error(`Failed to refresh blocks for dataSourceId ${normalizedDataSourceId}:`, error);
    }
  };

  // Listen for note update events from webhooks
  useEffect(() => {
    if (!socket) return;

    const handleNoteUpdated = (data: { noteId: string; dataSourceId: string }) => {
      console.log("[Board Context] Note updated event received:", data);
      if (data.dataSourceId) {
        // Refresh notes for this dataSourceId
        refreshNotes(data.dataSourceId).catch((err) => {
          console.error("[Board Context] Failed to refresh notes after update:", err);
        });
      }
    };

    socket.on("note-updated", handleNoteUpdated);

    return () => {
      socket.off("note-updated", handleNoteUpdated);
    };
  }, [socket]);

  type ReorderResponse = {
    success: boolean;
    dataSource?: DatabaseSource;
    message?: string
  } | { isError: true; message: string };

  const savePropertyOrder = async (boardId: string, order: string[], dataSourceId: string) => {
    // Get current view for audit purposes
    // Note: boardId is the collection_view block ID
    const currentViewData = currentView[boardId];
    // REMOVED: Get board from boards array - boards are now in global block context
    // Components should get viewId from global block context if needed
    let viewId: string | undefined = currentViewData?.id;

    const res = await postWithAuth<ReorderResponse>("/api/database/reOrderSchema", {
      dataSourceId,
      blockId: boardId, // Required for permission checking
      viewId, // Optional for audit
      order
    });

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to save property order");
    }

    // Update context with returned dataSource
    const response = res as { success?: boolean; dataSource?: DatabaseSource };
    // if (response.dataSource) {
    //   const ds = response.dataSource;
    //   const responseDsId = ds._id 
    //     ? (typeof ds._id === "string" 
    //         ? ds._id 
    //         : (ds._id as { toString: () => string }).toString()) 
    //     : dataSourceId;
    //   setDataSource(responseDsId, ds);
    // }
  };

  const setPropertyOrder = (boardId: string, order: string[]) => {
    // Note: boardId is the collection_view block ID
    // REMOVED: Get dataSourceId from boards array - boards are now in global block context
    // Components should get dataSourceId from global block context and pass it if needed
    // For now, just update local state - components should handle API calls
    const filteredOrder = order.filter((id) => id !== "title");

    setPropertyOrderState((prev) => ({
      ...prev,
      [boardId]: filteredOrder,
    }));

    // Get dataSourceId from currentDataSource context and save to API
    const dataSourceId = currentDataSource[boardId];
    if (dataSourceId) {
      const previousOrder = propertyOrder[boardId];
      // Make API call to save property order
      savePropertyOrder(boardId, filteredOrder, dataSourceId).catch((error) => {
        console.error("Failed to save property order:", error);
        // Rollback on error - restore previous order
        if (previousOrder) {
          setPropertyOrderState((prev) => ({
            ...prev,
            [boardId]: previousOrder,
          }));
        }
      });
    } else {
      console.warn("No dataSourceId found for board:", boardId);
    }
  };
  const getCurrentViewTypeId = (boardId: string): string | null => {
    // Note: boardId is the collection_view block ID
    // REMOVED: Get viewTypeId from boards array - boards are now in global block context
    // For backward compatibility, return currentView.id if available
    const currentViewData = currentView[boardId];
    if (currentViewData?.id) {
      return typeof currentViewData.id === "string" ? currentViewData.id : String(currentViewData.id);
    }
    return null;

    // OLD CODE (commented out):
    // const board = boards.find((b) => b._id === blockId);
    // if (!board || !currentViewData) return null;
    // let view;
    // if (currentViewData.id) {
    //   const currentViewId = typeof currentViewData.id === "string" ? currentViewData.id : String(currentViewData.id);
    //   view = board.viewsType?.find((v) => {
    //     const viewId = typeof v.id === "string" ? v.id : String(v.id);
    //     return viewId === currentViewId;
    //   });
    // } else if (currentViewData.type) {
    //   view = board.viewsType?.find((v) => v.viewType === currentViewData.type);
    // }
    // return view?.id ? (typeof view.id === "string" ? view.id : String(view.id)) : null;
  };

  const setBoardFilters = (viewTypeId: string, boardFilters: Record<string, string[]>) => {
    setFilters((prev) => ({ ...prev, [viewTypeId]: boardFilters }));
  };

  const setAdvancedFilters = (viewTypeId: string, advancedFiltersArray: any[]) => {
    setAdvancedFiltersState((prev) => ({ ...prev, [viewTypeId]: advancedFiltersArray }));
  };

  const setGroupBy = (viewTypeId: string, propertyId: string | undefined) => {
    setGroupByState((prev) => ({
      ...prev,
      [viewTypeId]: propertyId,
    }));
  };

  const setBoardSortBy = (viewTypeId: string, sorts: SortItem[]) => {
    setSortBy((prev) => ({
      ...prev,
      [viewTypeId]: sorts,
    }));
  };

  const setPropertyVisibility = (viewTypeId: string, propertyIds: string[]) => {
    setPropertyVisibilityState((prev) => {
      const updated = {
        ...prev,
        [viewTypeId]: propertyIds,
      };
      return updated;
    });
  };

  const getFilters = useCallback((boardId: string): Record<string, string[]> => {
    // Note: boardId is the collection_view block ID
    const viewTypeId = getCurrentViewTypeId(boardId);
    if (!viewTypeId) return {};
    return filters[viewTypeId] || {};
  }, [filters, currentView]); // currentView is needed for getCurrentViewTypeId

  const getAdvancedFilters = useCallback((boardId: string): any[] => {
    // Note: boardId is the collection_view block ID
    const viewTypeId = getCurrentViewTypeId(boardId);
    if (!viewTypeId) return [];
    return advancedFilters[viewTypeId] || [];
  }, [advancedFilters, currentView]);

  const getGroupBy = useCallback((boardId: string): string | undefined => {
    // Note: boardId is the collection_view block ID
    const viewTypeId = getCurrentViewTypeId(boardId);
    if (!viewTypeId) return undefined;
    return groupBy[viewTypeId];
  }, [groupBy, currentView]);

  const getSortBy = useCallback((boardId: string): SortItem[] => {
    // Note: boardId is the collection_view block ID
    const viewTypeId = getCurrentViewTypeId(boardId);
    if (!viewTypeId) return [];
    return sortBy[viewTypeId] || [];
  }, [sortBy, currentView]);

  const setChartSettings = (viewTypeId: string, chartSettings: IChartSettings | undefined) => {
    setChartSettingsState((prev) => ({
      ...prev,
      [viewTypeId]: chartSettings,
    }));
  };

  const getChartSettings = (boardId: string): IChartSettings | undefined => {
    // Note: boardId is the collection_view block ID
    const viewTypeId = getCurrentViewTypeId(boardId);
    if (!viewTypeId) return undefined;
    return chartSettings[viewTypeId];
  };

  const setLayoutSettings = (viewTypeId: string, layoutSettings: LayoutSettings | undefined) => {
    setLayoutSettingsState((prev) => ({
      ...prev,
      [viewTypeId]: layoutSettings,
    }));
  };

  const getLayoutSettings = useCallback((boardId: string): LayoutSettings | undefined => {
    // Note: boardId is the collection_view block ID
    const viewTypeId = getCurrentViewTypeId(boardId);
    if (!viewTypeId) return undefined;
    return layoutSettings[viewTypeId];
  }, [layoutSettings, currentView]);

  const getPropertyVisibility = useCallback((boardId: string): string[] => {
    // Note: boardId is the collection_view block ID
    const viewTypeId = getCurrentViewTypeId(boardId);
    if (!viewTypeId) {
      return [];
    }
    return propertyVisibility[viewTypeId] || [];
  }, [propertyVisibility, currentView]);

  const setSearchQuery = (boardId: string, query: string) => {
    // Note: boardId is the collection_view block ID
    setSearchQueryState((prev) => ({
      ...prev,
      [boardId]: query,
    }));
  };



  const setCurrentView = (boardId: string, viewId: string, viewType: string) => {
    // Note: boardId is the collection_view block ID
    // Prevent infinite loops by checking if the value is already set
    setCurrentViewState((prev) => {
      const current = prev[boardId];
      // If the same view is already set, don't update
      if (current?.id === viewId && current?.type === viewType) {
        return prev;
      }
      return {
        ...prev,
        [boardId]: { id: viewId || undefined, type: viewType },
      };
    });

    // Sync currentDataSource from global block context
    const boardBlock = getBlock(boardId);
    if (boardBlock && boardBlock.blockType === "collection_view") {
      let view;
      if (viewId) {
        view = boardBlock.value.viewsTypes?.find((v) => v._id === viewId);
      } else {
        view = boardBlock.value.viewsTypes?.find((v) => v.viewType === viewType);
      }

      if (view?.databaseSourceId) {
        const dataSourceId = typeof view.databaseSourceId === "string"
          ? view.databaseSourceId
          : String(view.databaseSourceId);

        setCurrentDataSourceState((prev) => {
          if (prev[boardId] !== dataSourceId) {
            return {
              ...prev,
              [boardId]: dataSourceId,
            };
          }
          return prev;
        });
      }
    }
  };

  // Data Source management functions
  const setDataSource = (dataSourceId: string, dataSource: DatabaseSource) => {
    setDataSourcesState((prev) => ({
      ...prev,
      [dataSourceId]: dataSource,
    }));
  };

  const setDataSources = (newDataSources: Record<string, DatabaseSource>) => {
    setDataSourcesState(newDataSources);
    console.log("..............Data sources set:..........", newDataSources);
  };

  const updateDataSource = (dataSourceId: string, updatedDataSource: Partial<DatabaseSource>) => {
    setDataSourcesState((prev) => {
      const existing = prev[dataSourceId];
      if (!existing) return prev;
      return {
        ...prev,
        [dataSourceId]: { ...existing, ...updatedDataSource },
      };
    });
  };

  const getDataSource = useCallback((dataSourceId: string): DatabaseSource | undefined => {
    return dataSources[dataSourceId];
  }, [dataSources]);

  const getCurrentDataSource = useCallback((boardId: string): DatabaseSource | undefined => {
    // Note: boardId is the collection_view block ID
    const dataSourceId = currentDataSource[boardId];
    if (!dataSourceId) return undefined;
    return dataSources[dataSourceId];
  }, [currentDataSource, dataSources]);

  const getCurrentDataSourceProperties = useCallback((boardId: string): BoardProperties => {
    // Note: boardId is the collection_view block ID
    const dataSource = getCurrentDataSource(boardId);
    return dataSource?.properties || {};
  }, [getCurrentDataSource]);

  const setCurrentDataSource = useCallback((boardId: string, dataSourceId: string | undefined) => {
    // Note: boardId is the collection_view block ID
    setCurrentDataSourceState((prev) => {
      // Only update if the value actually changed
      if (prev[boardId] === dataSourceId) {
        return prev;
      }
      return {
        ...prev,
        [boardId]: dataSourceId,
      };
    });
  }, []);

  // Sync currentDataSource when currentView changes (using global block context)
  useEffect(() => {
    // Get all boardIds from currentView
    const boardIds = Object.keys(currentView);

    boardIds.forEach((boardId) => {
      const currentViewData = currentView[boardId];
      if (!currentViewData) return;

      // Get board block from global block context
      const boardBlock = getBlock(boardId);
      if (!boardBlock || boardBlock.blockType !== "collection_view") return;

      let view;

      if (currentViewData.id) {
        const viewIdStr = typeof currentViewData.id === "string"
          ? currentViewData.id
          : String(currentViewData.id);
        view = boardBlock.value.viewsTypes?.find((v) => v._id === currentViewData.id);
      } else if (currentViewData.type) {
        view = boardBlock.value.viewsTypes?.find((v) => v.viewType === currentViewData.type);
      }

      if (view?.databaseSourceId) {
        const dataSourceId = view.databaseSourceId
        setCurrentDataSourceState((prev) => {
          if (prev[boardId] !== dataSourceId) {
            return {
              ...prev,
              [boardId]: dataSourceId,
            };
          }
          return prev;
        });
      }
    });
  }, [currentView, getBlock, getDataSource, setDataSource]);



  // REMOVED: Load all data sources for loaded boards' views on mount/updates
  // Datasources are now fetched on-demand when needed by components
  // OLD CODE (commented out):
  // const fetchingDataSourcesRef = useRef<Set<string>>(new Set());
  // useEffect(() => {
  //   const fetchMissingDataSources = async () => {
  //     const missingIds = new Set<string>();
  //     boards.forEach((board) => {
  //       (board.viewsType || []).forEach((vt) => {
  //         const dsId = vt.databaseSourceId;
  //         if (dsId) {
  //           const normalizedId = typeof dsId === "string" ? dsId : String(dsId);
  //           if (!dataSources[normalizedId] && !fetchingDataSourcesRef.current.has(normalizedId)) {
  //             missingIds.add(normalizedId);
  //           }
  //         }
  //       });
  //     });
  //     if (missingIds.size === 0) return;
  //     missingIds.forEach((id) => fetchingDataSourcesRef.current.add(id));
  //     await Promise.all(
  //       Array.from(missingIds).map(async (id) => {
  //         try {
  //           const res = (await getWithAuth(`/api/database/getdataSource/${id}`)) as { success?: boolean; collection?: { dataSource?: any } };
  //           if (res?.success && res.collection?.dataSource) {
  //             const ds = res.collection.dataSource;
  //             const normalizedId = typeof ds._id === "string" ? ds._id : ds._id?.toString?.() || id;
  //             setDataSource(normalizedId, ds as any);
  //           }
  //         } catch (e) {
  //           // ignore individual failures
  //         } finally {
  //           fetchingDataSourcesRef.current.delete(id);
  //         }
  //       }),
  //     );
  //   };
  //   fetchMissingDataSources();
  // }, [boards, dataSources]);


  const setNotesState = (dataSourceId: string, boardNotes: Block[]) => {
    const normalizedDataSourceId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);
    // setNotes((prev) => ({
    //   ...prev,
    //   [normalizedDataSourceId]: boardNotes,
    // }));
  };

  // REMOVED: removeBoard - boards are now in global block context
  // OLD CODE (commented out):
  // const removeBoard = (blockId: string) => {
  //   setBoards((prev) => prev.filter((b) => b._id !== blockId));
  //   const board = boards.find((b) => b._id === blockId);
  //   if (board) {
  //     setNotes((prev) => {
  //       const updated = { ...prev };
  //       (board.viewsType || []).forEach((vt) => {
  //         if (vt.databaseSourceId) {
  //           const dsId = typeof vt.databaseSourceId === "string" ? vt.databaseSourceId : String(vt.databaseSourceId);
  //           delete updated[dsId];
  //         }
  //       });
  //       return updated;
  //     });
  //   }
  // };


  const updateAllNotes = (dataSourceId: string, newNotes: Block[]) => {
    const normalizedDataSourceId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);
    // setNotes((prev) => ({
    //   ...prev,
    //   [normalizedDataSourceId]: newNotes,
    // }));
  };

  // 🆕 Add new comment to a note in the correct data source
  const updateNoteComments = (dataSourceId: string, noteId: string, newComment: Comment) => {
    const normalizedDataSourceId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);
    // setNotes((prev) => {
    //   const dataSourceNotes = prev[normalizedDataSourceId] || [];
    //   const updatedNotes = dataSourceNotes.map((note) =>
    //     note._id === noteId ? { ...note, comments: [...(note.comments || []), newComment] } : note,
    //   );

    //   return { ...prev, [normalizedDataSourceId]: updatedNotes };
    // });
  };

  // Helper to get blocks for a specific dataSourceId
  // Gets blocks from block context using datasource's blockIds array
  const getNotesByDataSourceId = useCallback((dataSourceId: string): Block[] => {
    const normalizedDataSourceId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);

    // Get datasource to access its blockIds array
    const dataSource = dataSources[normalizedDataSourceId];
    if (!dataSource || !dataSource.blockIds || dataSource.blockIds.length === 0) {
      return [];
    }

    // Get blocks from global block context using datasource's blockIds
    const blocks: Block[] = [];
    dataSource.blockIds.forEach((blockId) => {
      const block = getBlock(blockId);
      if (block) {
        blocks.push(block);
      }
    });

    return blocks as Block[];
  }, [dataSources, getBlock]);

  // Helper to get a block by ID from global block context
  // This is useful for relation properties where we need to find the current title
  const getNoteById = (noteId: string): Block | null => {
    if (!noteId) return null;


    // Get block from global block context
    const block = getBlock(noteId);
    return block || null;
  };

  // Helper to get relation block title from global block context (with fallback to stored value)
  const getRelationNoteTitle = (noteId: string, linkedDatabaseId: string, fallbackTitle?: string): string => {
    if (!noteId) return fallbackTitle || "New page";

    // Get block from global block context
    const block = getBlock(noteId);
    if (block?.value?.title) {
      return block.value.title;
    }

    // Fallback to stored title or default
    return fallbackTitle || "New page";
  };

  // Helper to filter out deleted IDs without prematurely hiding them if the target DB isn't fetched
  const getValidRelationIds = (noteIds: string[], linkedDatabaseId: string): string[] => {
    if (!linkedDatabaseId || !noteIds || noteIds.length === 0) return noteIds;

    const targetDataSource = getDataSource(linkedDatabaseId);
    if (!targetDataSource) {
      // The target data source hasn't been fetched yet, so we don't know if these IDs are dead.
      // Return them all so they don't incorrectly disappear on initial load.
      return noteIds;
    }

    // Target data source is fetched. We can safely filter out any IDs that aren't in its block list.
    const linkedNotes = getNotesByDataSourceId(linkedDatabaseId);

    // Create a Set for fast lookup of valid IDs
    const validIdsSet = new Set(linkedNotes?.map(n => String(n._id)) || []);

    return noteIds.filter(id => validIdsSet.has(id));
  };

  const contextValue = useMemo(
    () => ({
      // removeBoard, // Commented out
      dataSources,
      setNotesState,
      updateAllNotes,
      setDataSource,
      setDataSources,
      updateDataSource,
      getDataSource,
      currentDataSource,
      getCurrentDataSource,
      getCurrentDataSourceProperties,
      setCurrentDataSource,
      groupBy,
      setGroupBy,
      getGroupBy,
      filters,
      setBoardFilters,
      getFilters,
      advancedFilters,
      setAdvancedFilters,
      getAdvancedFilters,
      propertyOrder,
      setPropertyOrder,
      propertyVisibility,
      setPropertyVisibility,
      getPropertyVisibility,
      currentBoardNoteId,
      setCurrentBoardNoteId,
      updateNoteComments,
      refreshNotes,
      getNotesByDataSourceId,
      getNoteById,
      getRelationNoteTitle,
      getValidRelationIds,
      currentView,
      setCurrentView,
      sortBy,
      setBoardSortBy,
      getSortBy,
      chartSettings,
      setChartSettings,
      getChartSettings,
      layoutSettings,
      setLayoutSettings,
      getLayoutSettings,
      searchQuery,
      setSearchQuery,
    }),
    [dataSources, currentDataSource, groupBy, filters, advancedFilters, propertyOrder, propertyVisibility, currentBoardNoteId, currentView, sortBy, chartSettings, layoutSettings, searchQuery],
  );

  return <BoardContext.Provider value={contextValue}>{children}</BoardContext.Provider>;
};

export const useBoard = (): BoardContextType => {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error("useBoard must be used inside a BoardProvider");
  }
  return context;
};
