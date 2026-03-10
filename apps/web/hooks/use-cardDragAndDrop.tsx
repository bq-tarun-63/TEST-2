import { useState, useCallback } from "react";
import type { Block } from "@/types/block";
import { postWithAuth } from "@/lib/api-helpers";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { toast } from "sonner";
import { useDragState } from "@/contexts/dragStateContext";
import { useAuth } from "@/hooks/use-auth";
import { isOwner } from "@/services-frontend/user/userServices";

interface UseDragDropNotesProps {
    board: Block;
    notes: Block[];
    setLocalNotes: React.Dispatch<React.SetStateAction<Block[]>>;
    primaryDateProperty: string;
}

interface DragDropHandlers {
    draggedNote: Block | null;
    dragOverTarget: string | null;
    handleDragStart: (e: React.DragEvent, note: Block) => void;
    handleDragEnd: (e: React.DragEvent) => void;
    handleDragOver: (e: React.DragEvent, target: string | Date) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent, targetDate: Date | string, customValue?: string) => Promise<void>;
    isDragging: (noteId: string) => boolean;
    isDropTarget: (target: string) => boolean;
}

export default function useDragDropNotes({
    board,
    notes,
    setLocalNotes,
    primaryDateProperty,
}: UseDragDropNotesProps): DragDropHandlers {
    const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
    const { currentView, getDataSource, updateDataSource } = useBoard();
    const { getBlock, updateBlock, upsertBlocks } = useGlobalBlocks();
    const { currentWorkspace } = useWorkspaceContext();
    const {
        privatePagesOrder,
        publicPagesOrder,
        sharedPagesOrder,
        workAreaPagesOrder,
        removePage,
    } = useRootPagesOrder();
    const { dragNoteInfo, setDragState, clearDragState, dragSource } = useDragState();
    const { user } = useAuth();

    // Helper to get current dataSourceId
    const getCurrentDataSourceId = useCallback((): string | null => {
        const currentViewData = currentView[board._id];
        const latestBoard = getBlock(board._id) || board;

        let view;
        if (currentViewData?.id) {
            view = latestBoard.value?.viewsTypes?.find((vt) => {
                const vtId = typeof vt._id === "string" ? vt._id : String(vt._id);
                return vtId === currentViewData.id;
            });
        } else if (currentViewData?.type) {
            view = latestBoard.value?.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
        }

        const dsId = view?.databaseSourceId;
        return dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
    }, [currentView, board._id, getBlock]);

    const handleDragStart = useCallback((e: React.DragEvent, note: Block) => {
        const userOwnsNote = isOwner(note.value?.userEmail, true, user);

        if (!userOwnsNote) {
            toast.error("Only the owner can move this page");
            e.preventDefault();
            return;
        }

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', note._id);

        // Get dataSourceId and blockIds for calendar → sidebar drops
        const dataSourceId = getCurrentDataSourceId();
        const datasource = dataSourceId ? getDataSource(dataSourceId) : null;

        // Mark this as a calendar drag with metadata for sidebar handling
        e.dataTransfer.setData('application/x-calendar-note', JSON.stringify({
            noteId: note._id,
            dataSourceId: dataSourceId,
            sourceBlockIds: datasource?.blockIds || [],
        }));

        // Set drag state in context (store note info)
        setDragState({ noteId: note._id }, "calendar");

        // Add a subtle opacity to the dragged element
        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '0.5';
        }
    }, [getCurrentDataSourceId, getDataSource, setDragState, user]);

    const handleDragEnd = useCallback((e: React.DragEvent) => {
        setDragOverTarget(null);

        // Clear drag state on drag end (handles cancelled drags)
        clearDragState();

        // Restore opacity
        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '1';
        }
    }, [clearDragState]);

    const handleDragOver = useCallback((e: React.DragEvent, target: string | Date) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Convert target to string for consistent handling
        const targetString = target instanceof Date ? target.toDateString() : target;
        setDragOverTarget(targetString);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {

        // Only clear drag over state if we're leaving the drop zone entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverTarget(null);
        }
    }, []);

    const handleDrop = useCallback(async (
        e: React.DragEvent,
        targetDate: Date | string,
        customValue?: string
    ) => {
        e.preventDefault();
        setDragOverTarget(null);

        // If this is a calendar-to-calendar drag, stop propagation to prevent
        // the editor from also handling this drop
        if (dragSource === "calendar" && dragNoteInfo) {
            e.stopPropagation();
        }

        // --- Handle Sidebar → Calendar Drop ---
        if (dragSource !== "calendar") {
            const draggedNoteId = e.dataTransfer.getData("text/plain");
            const isFromEditor = e.dataTransfer.types.includes("application/page-block-from-editor");
            const isFromCalendar = e.dataTransfer.types.includes("application/x-calendar-note");
            const isFromBoard = e.dataTransfer.types.includes("application/x-board-note");

            // Only handle if it's from sidebar (not from editor, not from calendar, not from board)
            if (draggedNoteId && !isFromEditor && !isFromCalendar && !isFromBoard) {
                console.log("Handling sidebar → calendar drop:", draggedNoteId);
                e.stopPropagation();

                const draggedBlock = getBlock(draggedNoteId);
                if (!draggedBlock) {
                    console.error("Dragged note not found in BlockContext");
                    return;
                }

                const userOwnsNote = isOwner(draggedBlock.value?.userEmail, true, user);
                if (!userOwnsNote) {
                    toast.error("Only the owner can move this page");
                    return;
                }

                // Prevent dragging parent pages with children
                // if (draggedBlock.blockIds && draggedBlock.blockIds.length > 0) {
                //     console.warn("Cannot drag parent page with children to calendar");
                //     toast.error("Cannot move a page with sub-pages to calendar");
                //     return;
                // }

                // Get dataSourceId
                const dataSourceId = getCurrentDataSourceId();
                if (!dataSourceId) {
                    console.error("Data source not found for current view");
                    return;
                }

                const datasource = getDataSource(dataSourceId);
                if (!datasource) {
                    console.error("DataSource not found");
                    return;
                }

                // Determine target date string
                let targetDateString: string;
                if (customValue) {
                    targetDateString = customValue;
                } else if (targetDate instanceof Date) {
                    targetDateString = targetDate.toLocaleDateString("en-CA");
                } else {
                    targetDateString = targetDate;
                }

                // Determine source info
                const sourceParentId = draggedBlock.parentId;
                const isRootNote = draggedBlock.parentType === "workspace" || draggedBlock.parentType === "workarea";

                // Calculate source blockIdArray after removing the dragged note
                let sourceBlockIdArray: string[] = [];
                let sourceType = "private";

                if (isRootNote) {
                    if (privatePagesOrder.includes(draggedNoteId)) {
                        sourceBlockIdArray = privatePagesOrder.filter(id => id !== draggedNoteId);
                        sourceType = "private";
                    } else if (publicPagesOrder.includes(draggedNoteId)) {
                        sourceBlockIdArray = publicPagesOrder.filter(id => id !== draggedNoteId);
                        sourceType = "public";
                    } else if (sharedPagesOrder.includes(draggedNoteId)) {
                        sourceBlockIdArray = sharedPagesOrder.filter(id => id !== draggedNoteId);
                        sourceType = "private";
                    } else {
                        for (const waId in workAreaPagesOrder) {
                            if (workAreaPagesOrder[waId]?.includes(draggedNoteId)) {
                                sourceBlockIdArray = workAreaPagesOrder[waId].filter(id => id !== draggedNoteId);
                                sourceType = "workarea";
                                break;
                            }
                        }
                    }
                } else {
                    const parentBlock = getBlock(sourceParentId);
                    if (parentBlock) {
                        sourceBlockIdArray = (parentBlock.blockIds || []).filter(id => id !== draggedNoteId);
                    }
                    const parentVal = parentBlock?.value as any;
                    sourceType = (parentVal?.pageType === "public" || parentVal?.isPublicNote) ? "public" : "private";
                }

                // Store previous state for rollback
                const previousBlockIds = [...(datasource.blockIds || [])];

                // Add to datasource blockIds
                const newBlockIds = [...(datasource.blockIds || []), draggedNoteId];

                // Update note with date property, parentId, parentType, and pageType
                const updatedNote: Block = {
                    ...draggedBlock,
                    parentId: dataSourceId,
                    parentType: "collection",
                    value: {
                        ...draggedBlock.value,
                        pageType: "Viewdatabase_Note",
                        databaseProperties: {
                            ...(draggedBlock.value.databaseProperties || {}),
                            [primaryDateProperty]: targetDateString,
                        },
                    },
                };

                // Optimistic updates
                setLocalNotes(prevNotes => [...prevNotes, updatedNote]);
                updateDataSource(dataSourceId, { blockIds: newBlockIds });
                upsertBlocks([updatedNote]);

                // Remove from sidebar
                if (isRootNote) {
                    removePage(draggedNoteId);
                } else {
                    const parentBlock = getBlock(sourceParentId);
                    if (parentBlock) {
                        const updatedParent: Block = {
                            ...parentBlock,
                            blockIds: sourceBlockIdArray
                        };
                        upsertBlocks([updatedParent]);
                    }
                }

                try {
                    // Call API to update parent (remove from sidebar, add to calendar)
                    const parentUpdateResponse = await postWithAuth('/api/note/block/drag-and-drop', {
                        dragAndDropinputfieldArray: [
                            {
                                parentId: sourceParentId,
                                blockIdArray: sourceBlockIdArray,
                                workspaceId: currentWorkspace?._id,
                                typeofChild: isRootNote ? sourceType : "page"
                            },
                            {
                                parentId: dataSourceId,
                                blockIdArray: newBlockIds,
                                workspaceId: currentWorkspace?._id,
                                typeofChild: "page"
                            }
                        ],
                        updatedBlockInfo: {
                            blockId: draggedNoteId,
                            parentId: dataSourceId,
                            parentType: 'collection',
                            pageType: "Viewdatabase_Note"
                        },
                    });

                    // Set date property
                    const dateUpdateResponse = await postWithAuth('/api/database/updatePropertyValue', {
                        dataSourceId: dataSourceId,
                        blockId: draggedNoteId,
                        propertyId: primaryDateProperty,
                        value: targetDateString,
                        workspaceName: currentWorkspace?.name || "",
                    });

                    if (!parentUpdateResponse.success || !dateUpdateResponse.success) {
                        throw new Error("Failed to complete sidebar → calendar drop");
                    }

                    console.log("✅ Sidebar → calendar drop successful");
                    toast.success("Note moved to calendar");

                    // Clear drag state after successful drop
                    clearDragState();

                } catch (error) {
                    console.error("Failed to move note from sidebar to calendar:", error);
                    toast.error("Failed to move note to calendar");

                    // Rollback optimistic updates
                    updateDataSource(dataSourceId, { blockIds: previousBlockIds });
                    setLocalNotes(prevNotes => prevNotes.filter(n => n._id !== draggedNoteId));
                    upsertBlocks([draggedBlock]);
                }

                return;
            }

            // --- Handle Editor → Calendar Drop ---
            if (draggedNoteId && isFromEditor) {
                console.log("Handling editor → calendar drop:", draggedNoteId);
                e.stopPropagation();

                const draggedBlock = getBlock(draggedNoteId);
                if (!draggedBlock) {
                    console.error("Dragged note not found in BlockContext");
                    return;
                }

                const userOwnsNote = isOwner(draggedBlock.value?.userEmail, true, user);
                if (!userOwnsNote) {
                    toast.error("Only the owner can move this page");
                    return;
                }

                // Prevent dragging parent pages with children
                // if (draggedBlock.blockIds && draggedBlock.blockIds.length > 0) {
                //     console.warn("Cannot drag parent page with children to calendar");
                //     toast.error("Cannot move a page with sub-pages to calendar");
                //     return;
                // }

                // Get dataSourceId
                const dataSourceId = getCurrentDataSourceId();
                if (!dataSourceId) {
                    console.error("Data source not found for current view");
                    return;
                }

                const datasource = getDataSource(dataSourceId);
                if (!datasource) {
                    console.error("DataSource not found");
                    return;
                }

                // Determine target date string
                let targetDateString: string;
                if (customValue) {
                    targetDateString = customValue;
                } else if (targetDate instanceof Date) {
                    targetDateString = targetDate.toLocaleDateString("en-CA");
                } else {
                    targetDateString = targetDate;
                }

                // Source is the editor parent (the page containing this block in the editor)
                const sourceParentId = draggedBlock.parentId;
                const sourceParentBlock = getBlock(sourceParentId);

                // Calculate source blockIdArray after removing the dragged note
                const previousSourceBlockIds = sourceParentBlock?.blockIds ? [...sourceParentBlock.blockIds] : [];
                const newSourceBlockIds = previousSourceBlockIds.filter(id => id !== draggedNoteId);

                // Store previous state for rollback
                const previousBlockIds = [...(datasource.blockIds || [])];

                // Add to datasource blockIds
                const newBlockIds = [...(datasource.blockIds || []), draggedNoteId];

                // Update note with date property, parentId, parentType, and pageType
                const updatedNote: Block = {
                    ...draggedBlock,
                    parentId: dataSourceId,
                    parentType: "collection",
                    value: {
                        ...draggedBlock.value,
                        pageType: "Viewdatabase_Note",
                        databaseProperties: {
                            ...(draggedBlock.value.databaseProperties || {}),
                            [primaryDateProperty]: targetDateString,
                        },
                    },
                };

                // Optimistic updates
                setLocalNotes(prevNotes => [...prevNotes, updatedNote]);
                updateDataSource(dataSourceId, { blockIds: newBlockIds });
                upsertBlocks([updatedNote]);

                // Remove from editor parent's blockIds
                if (sourceParentBlock) {
                    const updatedSourceParent: Block = {
                        ...sourceParentBlock,
                        blockIds: newSourceBlockIds
                    };
                    upsertBlocks([updatedSourceParent]);
                }

                try {
                    // Call API to update parent (remove from editor, add to calendar)
                    const parentUpdateResponse = await postWithAuth('/api/note/block/drag-and-drop', {
                        dragAndDropinputfieldArray: [
                            {
                                parentId: sourceParentId,
                                blockIdArray: newSourceBlockIds,
                                workspaceId: currentWorkspace?._id,
                                typeofChild: "page"
                            },
                            {
                                parentId: dataSourceId,
                                blockIdArray: newBlockIds,
                                workspaceId: currentWorkspace?._id,
                                typeofChild: "page"
                            }
                        ],
                        updatedBlockInfo: {
                            blockId: draggedNoteId,
                            parentId: dataSourceId,
                            parentType: 'collection',
                            pageType: "Viewdatabase_Note"
                        },
                    });

                    // Set date property
                    const dateUpdateResponse = await postWithAuth('/api/database/updatePropertyValue', {
                        dataSourceId: dataSourceId,
                        blockId: draggedNoteId,
                        propertyId: primaryDateProperty,
                        value: targetDateString,
                        workspaceName: currentWorkspace?.name || "",
                    });

                    if (!parentUpdateResponse.success || !dateUpdateResponse.success) {
                        throw new Error("Failed to complete editor → calendar drop");
                    }

                    console.log("✅ Editor → calendar drop successful");
                    toast.success("Note moved to calendar");

                    // Dispatch event to remove page block from editor content
                    const event = new CustomEvent("remove-page-block-from-editor", {
                        detail: { pageId: draggedNoteId, sourceParentId: sourceParentId }
                    });
                    window.dispatchEvent(event);

                    // Clear drag state after successful drop
                    clearDragState();

                } catch (error) {
                    console.error("Failed to move note from editor to calendar:", error);
                    toast.error("Failed to move note to calendar");

                    // Rollback optimistic updates
                    updateDataSource(dataSourceId, { blockIds: previousBlockIds });
                    setLocalNotes(prevNotes => prevNotes.filter(n => n._id !== draggedNoteId));
                    upsertBlocks([draggedBlock]);

                    // Restore editor parent's blockIds
                    if (sourceParentBlock) {
                        const restoredSourceParent: Block = {
                            ...sourceParentBlock,
                            blockIds: previousSourceBlockIds
                        };
                        upsertBlocks([restoredSourceParent]);
                    }
                }

                return;
            }

            // --- Handle Board → Calendar Drop ---
            // Also handles List view (which uses "board" source)
            if (draggedNoteId && (isFromBoard || (dragSource === "board" && dragNoteInfo))) {
                console.log("Handling board → calendar drop:", draggedNoteId);
                e.stopPropagation();

                const efficientDraggedNoteId = draggedNoteId || dragNoteInfo?.noteId;
                if (!efficientDraggedNoteId) return;

                const draggedBlock = getBlock(efficientDraggedNoteId);
                if (!draggedBlock) {
                    console.error("Dragged note not found in BlockContext");
                    return;
                }

                const userOwnsNote = isOwner(draggedBlock.value?.userEmail, true, user);
                if (!userOwnsNote) {
                    toast.error("Only the owner can move this page");
                    return;
                }

                // Get dataSourceId
                const dataSourceId = getCurrentDataSourceId();
                if (!dataSourceId) {
                    console.error("Data source not found for current view");
                    return;
                }

                const datasource = getDataSource(dataSourceId);
                if (!datasource) {
                    console.error("DataSource not found");
                    return;
                }

                // Determine target date string
                let targetDateString: string;
                if (customValue) {
                    targetDateString = customValue;
                } else if (targetDate instanceof Date) {
                    targetDateString = targetDate.toLocaleDateString("en-CA");
                } else {
                    targetDateString = targetDate;
                }

                const sourceDatasourceId = draggedBlock.parentId;
                const isCrossDatasource = sourceDatasourceId && sourceDatasourceId !== dataSourceId;

                // If internal move (same datasource) and same date, check date property
                const currentDateString = draggedBlock.value.databaseProperties?.[primaryDateProperty];
                if (!isCrossDatasource && currentDateString === targetDateString) {
                    return;
                }

                // Store previous state for rollback
                const previousBlockIds = [...(datasource.blockIds || [])];

                // Calculate NEW blockIds
                let newTargetBlockIds = [...previousBlockIds];

                // Remove existing occurrence if present (internal move)
                if (newTargetBlockIds.includes(efficientDraggedNoteId)) {
                    newTargetBlockIds = newTargetBlockIds.filter(id => id !== efficientDraggedNoteId);
                }

                // Add to target
                newTargetBlockIds.push(efficientDraggedNoteId);

                // Source Handling (Remove from source if cross-datasource)
                if (isCrossDatasource && sourceDatasourceId) {
                    const sourceDs = getDataSource(sourceDatasourceId);
                    if (sourceDs) {
                        const newSourceBlockIds = (sourceDs.blockIds || []).filter(id => id !== efficientDraggedNoteId);
                        updateDataSource(sourceDatasourceId, { blockIds: newSourceBlockIds });
                    }
                }

                // Update Target Datasource BlockIds
                updateDataSource(dataSourceId, { blockIds: newTargetBlockIds });

                // Update Note Block (Optimistic)
                const updatedNote: Block = {
                    ...draggedBlock,
                    parentId: dataSourceId,
                    value: {
                        ...draggedBlock.value,
                        pageType: "Viewdatabase_Note",
                        databaseProperties: {
                            ...(draggedBlock.value.databaseProperties || {}),
                            [primaryDateProperty]: targetDateString,
                        },
                    },
                };

                // Update Local Notes (UI)
                setLocalNotes(prevNotes => {
                    const exists = prevNotes.some(n => n._id === efficientDraggedNoteId);
                    if (exists) {
                        return prevNotes.map(note => note._id === efficientDraggedNoteId ? updatedNote : note);
                    } else {
                        return [...prevNotes, updatedNote];
                    }
                });

                // Update global block context
                upsertBlocks([updatedNote]);

                try {
                    // Prepare API Payload
                    const dragAndDropPayload: any[] = [];

                    // Source Update (if cross-datasource and loaded)
                    if (isCrossDatasource && sourceDatasourceId) {
                        const sourceDs = getDataSource(sourceDatasourceId);
                        if (sourceDs && sourceDs.blockIds) {
                            const sourceBlockIds = sourceDs.blockIds.filter(id => id !== efficientDraggedNoteId);
                            dragAndDropPayload.push({
                                parentId: sourceDatasourceId,
                                blockIdArray: sourceBlockIds,
                                workspaceId: currentWorkspace?._id,
                                typeofChild: "page"
                            });
                        }
                    }

                    // Target Update
                    dragAndDropPayload.push({
                        parentId: dataSourceId,
                        blockIdArray: newTargetBlockIds,
                        workspaceId: currentWorkspace?._id,
                        typeofChild: "page"
                    });

                    // API Call
                    const dndResponse = await postWithAuth('/api/note/block/drag-and-drop', {
                        dragAndDropinputfieldArray: dragAndDropPayload,
                        updatedBlockInfo: {
                            blockId: efficientDraggedNoteId,
                            parentId: dataSourceId,
                            parentType: 'collection',
                            pageType: "Viewdatabase_Note"
                        },
                    });

                    // Update Property Value (Date)
                    const propResponse = await postWithAuth('/api/database/updatePropertyValue', {
                        dataSourceId: dataSourceId,
                        blockId: efficientDraggedNoteId,
                        propertyId: primaryDateProperty,
                        value: targetDateString,
                        workspaceName: currentWorkspace?.name || "",
                    });

                    if (!dndResponse.success || !propResponse.success) {
                        throw new Error("Failed to complete Board -> Calendar drop");
                    }

                    console.log("✅ Board → Calendar drop successful");
                    toast.success("Note moved to calendar");
                    clearDragState();

                } catch (error) {
                    console.error("Failed to move note from board to calendar:", error);
                    toast.error("Failed to move note to calendar");

                    // Rollback
                    updateDataSource(dataSourceId, { blockIds: previousBlockIds });
                    if (isCrossDatasource && sourceDatasourceId) {
                        // We can't easily rollback source if it wasn't loaded, but if it was, we updated it above
                        const sourceDs = getDataSource(sourceDatasourceId);
                        if (sourceDs) upsertBlocks([draggedBlock]); // Revert block changes
                    }
                    setLocalNotes(prevNotes => prevNotes.map(n => n._id === efficientDraggedNoteId ? draggedBlock : n));
                }
                return;
            }

            // Not a valid drop, exit
            return;
        }

        // Calendar-to-calendar drop: Get dragged note from context
        if (!dragNoteInfo || dragSource !== "calendar") {
            return;
        }

        const draggedNote = getBlock(dragNoteInfo.noteId);
        if (!draggedNote) {
            console.error("Dragged note not found in BlockContext");
            clearDragState();
            return;
        }

        const userOwnsNote = isOwner(draggedNote.value?.userEmail, true, user);
        if (!userOwnsNote) {
            toast.error("Only the owner can move this page");
            clearDragState();
            return;
        }

        // Determine the target date string
        let targetDateString: string;
        if (customValue) {
            targetDateString = customValue;
        } else if (targetDate instanceof Date) {
            targetDateString = targetDate.toLocaleDateString("en-CA");
        } else {
            targetDateString = targetDate;
        }

        // Get dataSourceId from current view
        const currentViewData = currentView[board._id];
        const latestBoard = getBlock(board._id) || board;

        let view;
        if (currentViewData?.id) {
            const currentViewId = currentViewData.id;
            view = latestBoard.value?.viewsTypes?.find((vt) => {
                const vtId = typeof vt._id === "string" ? vt._id : String(vt._id);
                return vtId === currentViewId;
            });
        } else if (currentViewData?.type) {
            view = latestBoard.value?.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
        }

        const dataSourceId = view?.databaseSourceId;
        if (!dataSourceId) {
            console.error("Data source not found for current view");
            clearDragState();
            return;
        }
        const normalizedDsId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);

        // Check for cross-datasource move
        const sourceDatasourceId = draggedNote.parentId;
        const isCrossDatasource = sourceDatasourceId && sourceDatasourceId !== normalizedDsId;

        const currentDateString = draggedNote.value.databaseProperties?.[primaryDateProperty];

        // If internal move (same datasource) and same date, do nothing
        if (!isCrossDatasource && currentDateString === targetDateString) {
            clearDragState();
            return;
        }

        console.log("Calendar Drop Logic ++", {
            noteId: draggedNote._id,
            sourceDatasourceId,
            targetDatasourceId: normalizedDsId,
            isCrossDatasource,
            targetDate: targetDateString
        });

        // Store previous state for rollback
        const previousNote = draggedNote;
        const previousSourceBlockIds = sourceDatasourceId ? [...(getDataSource(sourceDatasourceId)?.blockIds || [])] : [];
        const previousTargetBlockIds = [...(getDataSource(normalizedDsId)?.blockIds || [])];

        // Calculate NEW blockIds
        // Start with current target blockIds
        let newTargetBlockIds = [...previousTargetBlockIds];

        // Remove existing occurrence if present (to handle internal reorder/move correctly)
        // Even for cross-datasource, good practice to ensure no dupes
        if (newTargetBlockIds.includes(draggedNote._id)) {
            newTargetBlockIds = newTargetBlockIds.filter(id => id !== draggedNote._id);
        }

        // 1. Target: Add the note (append to end for now, as calendar doesn't have strict order)
        newTargetBlockIds.push(draggedNote._id);

        // 2. Source: Remove the note (if we have access to it)
        if (isCrossDatasource && sourceDatasourceId) {
            const sourceDs = getDataSource(sourceDatasourceId);
            if (sourceDs) {
                const newSourceBlockIds = (sourceDs.blockIds || []).filter(id => id !== draggedNote._id);
                updateDataSource(sourceDatasourceId, { blockIds: newSourceBlockIds });
            }
        }

        // Update Target Datasource BlockIds
        updateDataSource(normalizedDsId, { blockIds: newTargetBlockIds });

        // Update Note Block (Optimistic)
        const updatedNote: Block = {
            ...draggedNote,
            parentId: normalizedDsId, // Update parent to target
            value: {
                ...draggedNote.value,
                databaseProperties: {
                    ...draggedNote.value.databaseProperties,
                    [primaryDateProperty]: targetDateString
                }
            }
        };

        // Update Local Notes (UI) - Add to local list if not present (cross-ds) or update if present
        setLocalNotes(prevNotes => {
            const exists = prevNotes.some(n => n._id === draggedNote._id);
            if (exists) {
                return prevNotes.map(note => note._id === draggedNote._id ? updatedNote : note);
            } else {
                return [...prevNotes, updatedNote];
            }
        });

        // Update global block context
        upsertBlocks([updatedNote]);

        try {
            if (isCrossDatasource) {
                // Cross-Datasource Move API Call (Batch)
                const dragAndDropPayload: any[] = [];

                // Source Update (if available)
                if (sourceDatasourceId) {
                    const sourceDs = getDataSource(sourceDatasourceId);
                    if (sourceDs) {
                        const sourceBlockIds = (sourceDs.blockIds || []).filter(id => id !== draggedNote._id);
                        dragAndDropPayload.push({
                            parentId: sourceDatasourceId,
                            blockIdArray: sourceBlockIds,
                            workspaceId: currentWorkspace?._id,
                            typeofChild: "page"
                        });
                    }
                }

                // Target Update
                dragAndDropPayload.push({
                    parentId: normalizedDsId,
                    blockIdArray: newTargetBlockIds,
                    workspaceId: currentWorkspace?._id,
                    typeofChild: "page"
                });

                const dndResponse = await postWithAuth('/api/note/block/drag-and-drop', {
                    dragAndDropinputfieldArray: dragAndDropPayload,
                    updatedBlockInfo: {
                        blockId: draggedNote._id,
                        parentId: normalizedDsId,
                        parentType: 'collection',
                        pageType: "Viewdatabase_Note"
                    },
                });

                // Update Property Value (Date)
                const propResponse = await postWithAuth('/api/database/updatePropertyValue', {
                    dataSourceId: normalizedDsId,
                    blockId: draggedNote._id,
                    propertyId: primaryDateProperty,
                    value: targetDateString,
                    workspaceName: currentWorkspace?.name || "",
                });

                if (!dndResponse.success || !propResponse.success) {
                    throw new Error("Failed to move note cross-datasource");
                }

                toast.success("Note moved to calendar");

            } else {
                // Internal Move (Same Datasource) - Just Property Update
                const res = await postWithAuth(`/api/database/updatePropertyValue`, {
                    dataSourceId: normalizedDsId,
                    blockId: draggedNote._id,
                    propertyId: primaryDateProperty,
                    value: targetDateString,
                    workspaceName: currentWorkspace?.name
                });

                if (!res.success) {
                    throw new Error("Failed to update property value");
                }
            }

            // Sync final state from server if needed (optional, upsertBlocks usually handles it)
            // ...

            console.log(
                `Moved note "${draggedNote.value.title}" to ${targetDateString}`
            );

            // Clear drag state
            clearDragState();

        } catch (err) {
            console.error("Failed to update note date/move:", err);

            // Roll back
            if (isCrossDatasource) {
                // Restore source blockIds if we touched them
                if (sourceDatasourceId) {
                    updateDataSource(sourceDatasourceId, { blockIds: previousSourceBlockIds });
                }
                updateDataSource(normalizedDsId, { blockIds: previousTargetBlockIds });
                setLocalNotes(prevNotes => prevNotes.filter(n => n._id !== draggedNote._id)); // Remove if it was new
            } else {
                setLocalNotes(prevNotes => prevNotes.map(n => n._id === draggedNote._id ? previousNote : n));
            }
            updateBlock(draggedNote._id, previousNote);
            toast.error("Failed to move note");
        }
    }, [dragNoteInfo, dragSource, primaryDateProperty, board._id, setLocalNotes, getBlock, updateBlock, currentView, getDataSource, updateDataSource, upsertBlocks, currentWorkspace, clearDragState]);

    const isDragging = useCallback((noteId: string) => {
        return dragSource === "calendar" && dragNoteInfo?.noteId === noteId;
    }, [dragSource, dragNoteInfo]);

    const isDropTarget = useCallback((target: string) => {
        return dragOverTarget === target;
    }, [dragOverTarget]);

    // Get dragged note from context for return value
    const draggedNote = dragSource === "calendar" && dragNoteInfo
        ? getBlock(dragNoteInfo.noteId) || null
        : null;

    return {
        draggedNote,
        dragOverTarget,
        handleDragStart,
        handleDragEnd,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        isDragging,
        isDropTarget,
    };
}