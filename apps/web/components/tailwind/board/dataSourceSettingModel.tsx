"use client";

import React, { useMemo, useState, useRef } from "react";
import { getWithAuth, postWithAuth } from "@/lib/api-helpers";
import { useBoard } from "@/contexts/boardContext";
import { toast } from "sonner";
import { DropdownMenuHeader, DropdownMenuSearch, DropdownMenuSectionHeading, DropdownMenu, DropdownMenuIcons } from "@/components/tailwind/ui/dropdown-menu";
import type { DropdownMenuItemProps } from "@/components/tailwind/ui/dropdown-menu";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { Block } from "@/types/block";
import { BoardProperties, DatabaseSource, View } from "@/types/board";

interface DataSource {
    _id: string;
    name: string;
    icon?: string;
    properties: BoardProperties;
}

interface DataSourceSettingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBack?: () => void;
    board: Block;
    view?: Record<string, string>;
    workspaceId?: string;
    excludeViewId?: string;
}

export default function DataSourceSettingModal({
    isOpen,
    onClose,
    onBack,
    board,
    view,
    workspaceId,
    excludeViewId,
}: DataSourceSettingModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [allDataSources, setAllDataSources] = useState<DataSource[]>([]);
    const [showAllSuggested, setShowAllSuggested] = useState(false);
    const [showAllExisting, setShowAllExisting] = useState(false);
    const { setDataSource, currentView, getDataSource, setGroupBy, setBoardFilters, setAdvancedFilters, setBoardSortBy, setPropertyVisibility } = useBoard();
    const { getBlock, updateBlock, upsertBlocks } = useGlobalBlocks();


    // Get the latest board from context
    const latestBoard = getBlock(board._id) || board;

    React.useEffect(() => {
        if (!isOpen) return;
        const WorkspaceId = board?.workspaceId || workspaceId || "";
        if (!WorkspaceId) {
            console.warn("Workspace ID is required to fetch data sources");
            return;
        }
        console.log(".................Fetching data sources for workspace:", WorkspaceId);

        // Auto-fetch when opening
        (async () => {
            try {
                setLoading(true);
                const WorkspaceId = board?.workspaceId || workspaceId || "";
                const res: any = await getWithAuth('/api/database/getdataSource/getAll');
                console.log("...............Fetched data sources:", res);
                if (res && res.success && Array.isArray(res.datasources)) {
                    // Map data sources to the expected format
                    const mapped: DataSource[] = res.datasources.map((ds: DatabaseSource) => ({
                        _id: ds._id,
                        name: ds.title || `Data Source ${ds._id?.toString().slice(-6) || ""}`,
                        icon: "",
                        properties: ds.properties || {},
                    }));

                    setAllDataSources(mapped);
                } else {
                    console.error("Failed to fetch data sources:", res);
                    setAllDataSources([]);
                }
            } catch (error) {
                console.error("Error fetching data sources:", error);
                setAllDataSources([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [isOpen, board?.workspaceId, workspaceId]);

    // Get default datasource
    const defaultDataSource = useMemo(() => {
        if (!latestBoard?.value.defaultDataSourceId) return null;
        const defaultDsId = typeof latestBoard.value.defaultDataSourceId === "string"
            ? latestBoard.value.defaultDataSourceId
            : String(latestBoard.value.defaultDataSourceId);
        return allDataSources.find(ds => ds._id === defaultDsId) || null;
    }, [latestBoard, allDataSources]);

    // Get suggested datasources (from other viewtypes in the board, excluding current view and default)
    const suggestedDataSources = useMemo(() => {
        if (!latestBoard?.value?.viewsTypes || !Array.isArray(latestBoard.value.viewsTypes) || latestBoard.value.viewsTypes.length === 0) {
            return [];
        }

        const currentViewData = currentView[latestBoard._id];
        // Handle both _id and id for viewTypeId
        const currentViewId = view?.id || currentViewData?.id;

        const defaultDsId = latestBoard.value.defaultDataSourceId
            ? (typeof latestBoard.value.defaultDataSourceId === "string"
                ? latestBoard.value.defaultDataSourceId
                : String(latestBoard.value.defaultDataSourceId))
            : null;

        // Get unique datasource IDs from other viewtypes (excluding current view and default)
        const suggestedIds = new Set<string>();
        const viewsTypes = latestBoard.value.viewsTypes;
        if (Array.isArray(viewsTypes)) {
            viewsTypes.forEach((vt) => {
                if (!vt || !vt._id) return;
                const vtId = typeof vt._id === "string" ? vt._id : String(vt._id);
                // Exclude current view
                if (currentViewId && vtId === currentViewId) return;

                if (vt.databaseSourceId) {
                    const dsId = typeof vt.databaseSourceId === "string"
                        ? vt.databaseSourceId
                        : String(vt.databaseSourceId);
                    if (dsId !== defaultDsId) {
                        suggestedIds.add(dsId);
                    }
                }
            });
        }

        return allDataSources.filter(ds => suggestedIds.has(ds._id));
    }, [latestBoard, allDataSources, currentView, view]);

    // Get existing datasources (all others, excluding default and suggested)
    const existingDataSources = useMemo(() => {
        const defaultDsId = latestBoard?.value.defaultDataSourceId
            ? (typeof latestBoard.value.defaultDataSourceId === "string"
                ? latestBoard.value.defaultDataSourceId
                : String(latestBoard.value.defaultDataSourceId))
            : null;

        const suggestedIds = new Set(suggestedDataSources.map(ds => ds._id));
        if (defaultDsId) suggestedIds.add(defaultDsId);

        return allDataSources.filter(ds => !suggestedIds.has(ds._id));
    }, [allDataSources, latestBoard, suggestedDataSources]);

    // Filter by query
    const filteredDefault = useMemo(() => {
        if (!defaultDataSource) return null;
        if (!query) return defaultDataSource;
        return defaultDataSource.name?.toLowerCase().includes(query.toLowerCase()) ? defaultDataSource : null;
    }, [defaultDataSource, query]);

    const filteredSuggested = useMemo(() =>
        suggestedDataSources.filter((v) =>
            v.name?.toLowerCase().includes(query.toLowerCase())
        ), [suggestedDataSources, query]);

    const filteredExisting = useMemo(() =>
        existingDataSources.filter((v) =>
            v.name?.toLowerCase().includes(query.toLowerCase())
        ), [existingDataSources, query]);

    // Show only first 3 suggested initially
    const displayedSuggested = showAllSuggested ? filteredSuggested : filteredSuggested.slice(0, 3);
    const remainingSuggestedCount = filteredSuggested.length - 3;

    // Show only first 3 existing initially
    const displayedExisting = showAllExisting ? filteredExisting : filteredExisting.slice(0, 3);
    const remainingExistingCount = filteredExisting.length - 3;

    if (!isOpen) return null;

    const handleChangeDataSource = async (dataSourceId: string) => {
        if (!board?._id || !dataSourceId) {
            console.error("Board ID and Data Source ID are required");
            toast.error("Missing required information");
            return;
        }

        // Get the latest board from context
        const latestBoard = getBlock(board._id) || board;
        if (!latestBoard) {
            toast.error("Board not found");
            return;
        }

        // Find the current view type object to get viewTypeId
        const currentViewData = currentView[board._id];
        const viewTypeId = view?.id || currentViewData?.id;

        if (!viewTypeId) {
            toast.error("View type ID not found");
            return;
        }

        // Detect if this is a list view to auto-fill properties
        const viewObj = latestBoard.value.viewsTypes?.find((vt: any) => (vt._id || vt.id) === viewTypeId);
        const isListView = viewObj?.viewType === "list";

        // If list view, show all properties of the new data source by default
        let newVisibility: string[] = [];
        if (isListView) {
            const selectedDS = allDataSources.find(ds => ds._id === dataSourceId);
            if (selectedDS?.properties) {
                newVisibility = Object.keys(selectedDS.properties);
            }
        }

        // Clear all per-view settings locally and via API when datasource changes
        setGroupBy(viewTypeId, undefined);
        setBoardFilters(viewTypeId, {});
        setAdvancedFilters(viewTypeId, []);
        setBoardSortBy(viewTypeId, []);
        setPropertyVisibility(viewTypeId, newVisibility);

        // Persist the reset to the server in parallel (fire and forget)
        Promise.all([
            postWithAuth("/api/database/settings/filter", { viewTypeId, blockId: board._id, filters: [] }),
            postWithAuth("/api/database/settings/sort", { viewTypeId, blockId: board._id, sorts: [] }),
            postWithAuth("/api/database/settings/group", { viewTypeId, blockId: board._id, group: null }),
            postWithAuth("/api/database/settings/propertyVisibility", {
                viewTypeId,
                blockId: board._id,
                propertyVisibility: newVisibility.map(id => ({ propertyId: id }))
            }),
        ]).catch((err) => {
            console.error("Failed to clear view settings on datasource change:", err);
        });

        // Store previous state for rollback
        const previousBoard = { ...latestBoard };

        // Optimistic update: update board block immediately
        if (latestBoard.value?.viewsTypes && Array.isArray(latestBoard.value.viewsTypes) && latestBoard.value.viewsTypes.length > 0) {
            const optimisticViewsTypes = latestBoard.value.viewsTypes.map((vt: any) => {
                if (!vt || !vt._id) return vt;
                const vtId = typeof vt._id === "string" ? vt._id : String(vt._id);
                if (vtId === viewTypeId) {
                    return {
                        ...vt,
                        databaseSourceId: dataSourceId,
                        // Reset settings for the view type to empty values
                        settings: {
                            filters: {},
                            sorts: [],
                            groupBy: [],
                            propertyVisibility: newVisibility.map(id => ({ propertyId: id })),
                        }
                    };
                }
                return vt;
            });

            updateBlock(board._id, {
                ...latestBoard,
                value: {
                    ...latestBoard.value,
                    viewsTypes: optimisticViewsTypes,
                },
            });
        }

        // Close modal immediately (optimistic close)
        onClose();

        // Call API in background without waiting
        (async () => {
            try {
                // Call API to update view's data source
                const res = await postWithAuth("/api/database/updateViewDataSource", {
                    blockId: board._id,
                    viewTypeId: viewTypeId,
                    dataSourceId: dataSourceId
                });

                if (!res || res.isError || !res.success) {
                    throw new Error(res?.message || "Failed to update data source. Please try again.");
                }

                // Update board block with the response from API
                // if (res.view && res.view.viewsTypes) {
                //     const updatedBoard = getBlock(board._id) || latestBoard;
                //     updateBlock(board._id, {
                //         ...updatedBoard,
                //         value: {
                //             ...updatedBoard.value,
                //             viewsTypes: res.view.viewsTypes,
                //         },
                //     });
                // }

                // Fetch and store the new data source along with its notes - check context first
                // Check if datasource is already in context before making API call
                if (!getDataSource(dataSourceId)) {
                    try {
                        const dsRes = await getWithAuth(`/api/database/getdataSource/${dataSourceId}`) as {
                            success?: boolean;
                            collection?: {
                                dataSource?: DatabaseSource;
                                blocks?: Block[];
                            }
                        };
                        if (dsRes?.success && dsRes.collection?.dataSource) {
                            const ds = dsRes.collection.dataSource;
                            const normalizedId = ds._id || dataSourceId;

                            // Store the data source
                            setDataSource(normalizedId, ds);

                            // Store the notes for this data source
                            if (dsRes.collection.blocks && Array.isArray(dsRes.collection.blocks)) {
                                upsertBlocks(dsRes.collection.blocks);
                            }
                        }
                    } catch (dsErr) {
                        console.error("Failed to fetch new data source:", dsErr);
                    }
                }

                toast.success("Data source updated successfully");

            } catch (err) {
                // Rollback optimistic update on error
                updateBlock(board._id, previousBoard);

                console.error("Data source update error:", err);
                toast.error(err instanceof Error ? err.message : "Failed to update data source");
            }
        })();
    }

    // Helper to render data source icon
    const renderDataSourceIcon = (source: DataSource) => {
        if (source.icon) {
            return (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={source.icon} className="block object-cover rounded w-5 h-5" />
            );
        }
        return <DropdownMenuIcons.DatabaseDefault />;
    };

    // Build menu items for a data source list
    const buildDataSourceMenuItems = (sources: DataSource[]): DropdownMenuItemProps[] => {
        return sources.map((source) => ({
            id: source._id,
            label: source.name,
            icon: renderDataSourceIcon(source),
            onClick: () => handleChangeDataSource(source._id),
        }));
    };

    // Build "Show more" menu item
    const buildShowMoreMenuItem = (count: number, onClick: () => void): DropdownMenuItemProps => ({
        id: 'show-more',
        label: `Show ${count} more`,
        icon: (
            <svg viewBox="0 0 20 20" className="w-5 h-5 block flex-shrink-0 fill-gray-500 dark:fill-gray-400">
                <path d="M4 11.375a1.375 1.375 0 1 0 0-2.75 1.375 1.375 0 0 0 0 2.75m6 0a1.375 1.375 0 1 0 0-2.75 1.375 1.375 0 0 0 0 2.75m6 0a1.375 1.375 0 1 0 0-2.75 1.375 1.375 0 0 0 0 2.75"></path>
            </svg>
        ),
        onClick,
    });

    return (
        <div
            ref={modalRef}
            className="flex flex-col w-[290px] max-h-[500px] rounded-[10px] bg-background dark:bg-[#191919] border shadow-lg overflow-hidden mb-5"
        >
            {/* Header */}
            <div className="flex-shrink-0">
                <DropdownMenuHeader
                    title="Source"
                    onBack={onBack}
                    onClose={onClose}
                    showBack={true}
                    showClose={true}
                />
            </div>

            {/* Scroller */}
            <div className="z-[1] flex-1 min-h-0 overflow-hidden overflow-y-auto translate-z-0">
                {/* Search input */}
                <div className="px-2 py-1 pt-2">
                    <DropdownMenuSearch
                        placeholder="Link to a data source…"
                        value={query}
                        onChange={setQuery}
                        variant="subtle"
                        className="bg-[#f8f8f7] dark:bg-[#202020]"
                    />
                </div>

                <div className="flex flex-col relative p-1 gap-[1px]">
                    {/* Loading skeleton */}
                    {loading && (
                        <div className="space-y-1 px-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="w-full rounded-md bg-gray-100 dark:bg-[#2c2c2c] h-10 animate-pulse" />
                            ))}
                        </div>
                    )}

                    {!loading && (
                        <>
                            {/* Section 1: Source (Default Datasource) */}
                            {filteredDefault && (
                                <>
                                    <div className="px-2 mt-[6px] mb-2">
                                        <DropdownMenuSectionHeading>Source</DropdownMenuSectionHeading>
                                    </div>
                                    <DropdownMenu items={buildDataSourceMenuItems([filteredDefault])} />
                                </>
                            )}

                            {/* Section 2: Suggested */}
                            {filteredSuggested.length > 0 && (
                                <>
                                    <div className="px-2 mt-[6px] mb-2">
                                        <DropdownMenuSectionHeading>Suggested</DropdownMenuSectionHeading>
                                    </div>
                                    <DropdownMenu
                                        items={[
                                            ...buildDataSourceMenuItems(displayedSuggested),
                                            ...(!showAllSuggested && remainingSuggestedCount > 0 ? [buildShowMoreMenuItem(remainingSuggestedCount, () => setShowAllSuggested(true))] : [])
                                        ]}
                                    />
                                </>
                            )}

                            {/* Section 3: Existing data sources */}
                            {filteredExisting.length > 0 && (
                                <>
                                    <div className="px-2 mt-[6px] mb-2">
                                        <DropdownMenuSectionHeading>Existing data sources</DropdownMenuSectionHeading>
                                    </div>
                                    <DropdownMenu
                                        items={[
                                            ...buildDataSourceMenuItems(displayedExisting),
                                            ...(!showAllExisting && remainingExistingCount > 0 ? [buildShowMoreMenuItem(remainingExistingCount, () => setShowAllExisting(true))] : [])
                                        ]}
                                    />
                                </>
                            )}

                            {/* No results */}
                            {!filteredDefault && filteredSuggested.length === 0 && filteredExisting.length === 0 && (
                                <div className="px-2 py-6 text-sm text-gray-500">No data source available</div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
