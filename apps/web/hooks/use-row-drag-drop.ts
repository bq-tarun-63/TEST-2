import { useCallback, useState } from "react";
import { Block } from "@/types/block";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { postWithAuth } from "@/lib/api-helpers";
import { toast } from "sonner";
import { useDragState } from "@/contexts/dragStateContext";
import { useAuth } from "@/hooks/use-auth";
import { isOwner } from "@/services-frontend/user/userServices";

interface UseRowDragDropProps {
    filteredNotes: Block[];
    setLocalNotes: React.Dispatch<React.SetStateAction<Block[]>>;
    boardId: string;
    getSortBy: (boardId: string) => any;
}

export const useRowDragDrop = ({ filteredNotes, setLocalNotes, boardId, getSortBy }: UseRowDragDropProps) => {
    const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null);
    const [dragPosition, setDragPosition] = useState<"above" | "below" | null>(null);
    const { dragNoteInfo, dragSource, setDragState, clearDragState } = useDragState();
    const { user } = useAuth();

    const {
        currentView,
        getDataSource,
        updateDataSource,
        dataSources,
        getGroupBy
    } = useBoard();
    const { getBlock, upsertBlocks } = useGlobalBlocks();
    const { currentWorkspace } = useWorkspaceContext();
    const {
        privatePagesOrder,
        publicPagesOrder,
        workAreaPagesOrder,
        sharedPagesOrder,
        reorderPrivate,
        reorderPublic,
        reorderWorkArea,
        removePage
    } = useRootPagesOrder();

    const handleRowDragStart = useCallback((e: React.DragEvent, noteId: string) => {
        const block = getBlock(noteId);
        const userOwnsNote = isOwner(block?.value?.userEmail, true, user);

        if (!userOwnsNote) {
            toast.error("Only the owner can move this page");
            e.preventDefault();
            return;
        }

        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";

        // Set text/plain for compatibility with sidebar
        e.dataTransfer.setData("text/plain", noteId);

        // Get current dataSourceId for compatibility with sidebar/other views
        const currentViewData = currentView[boardId];
        const latestBoard = getBlock(boardId);
        let view;
        if (currentViewData?.id) {
            view = latestBoard?.value.viewsTypes?.find((vt: any) => vt._id === currentViewData.id);
        } else if (currentViewData?.type) {
            view = latestBoard?.value.viewsTypes?.find((vt: any) => vt.viewType === currentViewData.type);
        }
        const dataSourceId = view?.databaseSourceId;

        if (dataSourceId) {
            const normalizedDsId = dataSourceId as string;
            const datasource = getDataSource(normalizedDsId);
            e.dataTransfer.setData("application/x-board-note", JSON.stringify({
                noteId,
                dataSourceId: normalizedDsId,
                sourceBlockIds: datasource?.blockIds || []
            }));
        }

        // Set drag state in context (list view is part of board, so use "board" as source)
        setDragState({ noteId }, "board");

        // Set opacity for dragged element
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = "0.5";

            // Create a custom drag image matching the exact Page Block design
            const dragImage = document.createElement("div");
            dragImage.style.position = "absolute";
            dragImage.style.top = "-1000px";
            dragImage.className = "w-max rounded-[4px] px-1 py-0.5 shadow-sm";

            const innerLink = document.createElement("div");
            innerLink.className = "text-muted-foreground underline underline-offset-[3px] inline-flex items-center gap-1 text-[16px]";

            const iconSpan = document.createElement("span");
            iconSpan.className = "rounded px-0.5";
            iconSpan.style.fontFamily = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

            if (block?.value?.icon) {
                iconSpan.textContent = block.value.icon;
            } else {
                // Inline SVG for the FileText icon if no icon is set
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>`;
            }

            const titleNode = document.createTextNode(block?.value?.title || "New page");

            innerLink.appendChild(iconSpan);
            innerLink.appendChild(titleNode);
            dragImage.appendChild(innerLink);

            document.body.appendChild(dragImage);

            // Adjust offsets slightly so the cursor is over the item
            e.dataTransfer.setDragImage(dragImage, 15, 15);

            // Clean up the temporary element after drag starts
            setTimeout(() => {
                if (document.body.contains(dragImage)) {
                    document.body.removeChild(dragImage);
                }
            }, 0);
        }
    }, [boardId, currentView, getBlock, getDataSource, setDragState]);

    const handleRowDragEnd = useCallback((e: React.DragEvent) => {
        setDragOverNoteId(null);
        setDragPosition(null);

        // Clear drag state on drag end (handles cancelled drags)
        clearDragState();

        // Restore opacity
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = "1";
        }
    }, [clearDragState]);

    const handleRowDragOver = useCallback((e: React.DragEvent, noteId: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (dragNoteInfo?.noteId === noteId) return;

        const bounds = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - bounds.top;
        const position = offset < bounds.height / 2 ? "above" : "below";

        setDragOverNoteId(noteId);
        setDragPosition(position);
    }, [dragNoteInfo]);

    const handleRowDragLeave = useCallback(() => {
        // Only clear if leaving the drop zone entirely
        setDragOverNoteId(null);
        setDragPosition(null);
    }, []);

    const handleRowDrop = useCallback(async (e: React.DragEvent, dropTargetNoteId?: string | null, forcedGroupByValue?: any) => {
        e.preventDefault();
        e.stopPropagation();

        // Get dragged note ID from context or dataTransfer
        let effectiveDraggedNoteId: string | null = null;

        // Check if drag is from list view (board source) OR calendar
        if ((dragSource === "board" || dragSource === "calendar") && dragNoteInfo) {
            effectiveDraggedNoteId = dragNoteInfo.noteId;
        } else {
            // Check dataTransfer for sidebar/editor drops
            effectiveDraggedNoteId = e.dataTransfer.getData("text/plain");
        }

        // Determine source type for later use
        const isFromSidebar = dragSource !== "board" && dragSource !== "calendar" && e.dataTransfer.types.includes("text/plain") && !e.dataTransfer.types.includes("application/page-block-from-editor");
        const isFromEditor = e.dataTransfer.types.includes("application/page-block-from-editor");

        if (!effectiveDraggedNoteId || (effectiveDraggedNoteId === dropTargetNoteId && forcedGroupByValue === undefined)) {
            setDragOverNoteId(null);
            setDragPosition(null);
            clearDragState();
            return;
        }

        const draggedBlock = getBlock(effectiveDraggedNoteId);
        if (!draggedBlock) {
            console.error("Dragged note not found in BlockContext");
            setDragOverNoteId(null);
            setDragPosition(null);
            clearDragState();
            return;
        }

        const userOwnsNote = isOwner(draggedBlock.value?.userEmail, true, user);
        if (!userOwnsNote) {
            toast.error("Only the owner can move this page");
            setDragOverNoteId(null);
            setDragPosition(null);
            clearDragState();
            return;
        }

        // Get context data for board/datasource
        const currentViewData = currentView[boardId];
        const latestBoard = getBlock(boardId);
        let view: any;
        if (currentViewData?.id) {
            view = latestBoard?.value.viewsTypes?.find((vt: any) => vt._id === currentViewData.id);
        } else if (currentViewData?.type) {
            view = latestBoard?.value.viewsTypes?.find((vt: any) => vt.viewType === currentViewData.type);
        }

        const dataSourceId = view?.databaseSourceId;
        if (!dataSourceId) {
            console.error("Data source not found for current view");
            return;
        }
        const normalizedDsId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);
        const datasource = getDataSource(normalizedDsId);
        if (!datasource) {
            console.error("DataSource not found");
            return;
        }

        // --- Logic for sidebar/external drop ---
        // Check if it's from sidebar or editor (not from list view itself)
        if (isFromSidebar || isFromEditor) {
            console.log(`Handling ${isFromEditor ? 'editor' : 'sidebar'} -> list view drop ++ `, effectiveDraggedNoteId, "at", dropTargetNoteId);

            // Validation: Prevent parent/ancestor loops
            const isAncestorOfBoard = (noteId: string, boardId: string): boolean => {
                let currentParentId = latestBoard?.parentId;
                const visited = new Set<string>();
                while (currentParentId && !visited.has(currentParentId)) {
                    visited.add(currentParentId);
                    if (currentParentId === noteId) return true;
                    const parentBlock = getBlock(currentParentId);
                    if (!parentBlock) break;
                    currentParentId = parentBlock.parentId;
                }
                return false;
            };

            if (isAncestorOfBoard(effectiveDraggedNoteId, boardId)) {
                toast.error("Cannot move a parent page into its child board");
                clearDragState();
                return;
            }

            // Determine status property to update if grouped
            const groupByPropertyId = getGroupBy(boardId);
            let updateProps: Record<string, any> = {};
            if (groupByPropertyId) {
                if (forcedGroupByValue !== undefined) {
                    updateProps[groupByPropertyId] = forcedGroupByValue;
                } else if (dropTargetNoteId) {
                    const targetNote = filteredNotes.find(n => n._id === dropTargetNoteId);
                    if (targetNote) {
                        const targetValue = targetNote.value.databaseProperties?.[groupByPropertyId];
                        if (targetValue !== undefined) {
                            updateProps[groupByPropertyId] = targetValue;
                        }
                    }
                }
            }

            // Source info (same as before)
            const isRootNote = draggedBlock.parentType === "workspace" || draggedBlock.parentType === "workarea";
            const sourceParentId = draggedBlock.parentId;
            let sourceBlockIdArray: string[] = [];
            let sourceType = "private";
            let previousSidebarOrder: string[] = [];

            if (isRootNote) {
                if (privatePagesOrder.includes(effectiveDraggedNoteId)) {
                    previousSidebarOrder = [...privatePagesOrder];
                    sourceBlockIdArray = privatePagesOrder.filter(id => id !== effectiveDraggedNoteId);
                    sourceType = "private";
                } else if (publicPagesOrder.includes(effectiveDraggedNoteId)) {
                    previousSidebarOrder = [...publicPagesOrder];
                    sourceBlockIdArray = publicPagesOrder.filter(id => id !== effectiveDraggedNoteId);
                    sourceType = "public";
                } else if (sharedPagesOrder.includes(effectiveDraggedNoteId)) {
                    previousSidebarOrder = [...sharedPagesOrder];
                    sourceBlockIdArray = sharedPagesOrder.filter(id => id !== effectiveDraggedNoteId);
                    sourceType = "private";
                } else {
                    for (const waId in workAreaPagesOrder) {
                        if (workAreaPagesOrder[waId]?.includes(effectiveDraggedNoteId)) {
                            previousSidebarOrder = [...workAreaPagesOrder[waId]];
                            sourceBlockIdArray = workAreaPagesOrder[waId].filter(id => id !== effectiveDraggedNoteId);
                            sourceType = "workarea";
                            break;
                        }
                    }
                }
            } else {
                const parentBlock = getBlock(sourceParentId);
                if (parentBlock) {
                    previousSidebarOrder = [...(parentBlock.blockIds || [])];
                    sourceBlockIdArray = (parentBlock.blockIds || []).filter(id => id !== effectiveDraggedNoteId);
                }
                const parentVal = parentBlock?.value as any;
                sourceType = (parentVal?.pageType === "public") ? "public" : "private";
            }

            // Target blockIds
            const previousBlockIds = [...(datasource.blockIds || [])];
            const newBlockIds = [...previousBlockIds];
            if (dropTargetNoteId) {
                const targetIdx = newBlockIds.indexOf(dropTargetNoteId);
                const insertIdx = dragPosition === "above" ? targetIdx : targetIdx + 1;
                newBlockIds.splice(insertIdx, 0, effectiveDraggedNoteId);
            } else {
                newBlockIds.push(effectiveDraggedNoteId);
            }

            // Updated note
            const updatedNote: Block = {
                ...draggedBlock,
                parentId: normalizedDsId,
                parentType: "collection",
                value: {
                    ...draggedBlock.value,
                    pageType: "Viewdatabase_Note",
                    databaseProperties: {
                        ...(draggedBlock.value.databaseProperties || {}),
                        ...updateProps
                    },
                },
            };

            // Optimistic updates
            const previousLocalNotes = [...filteredNotes];
            const newLocalNotes = [...filteredNotes];
            if (dropTargetNoteId) {
                const localTargetIdx = newLocalNotes.findIndex(n => n._id === dropTargetNoteId);
                newLocalNotes.splice(dragPosition === "above" ? localTargetIdx : localTargetIdx + 1, 0, updatedNote);
            } else {
                newLocalNotes.push(updatedNote);
            }

            setLocalNotes(newLocalNotes);
            updateDataSource(normalizedDsId, { blockIds: newBlockIds });
            upsertBlocks([updatedNote]);

            if (isRootNote) {
                removePage(effectiveDraggedNoteId);
            } else {
                const parentBlock = getBlock(sourceParentId);
                if (parentBlock) {
                    upsertBlocks([{ ...parentBlock, blockIds: sourceBlockIdArray }]);
                }
            }

            // Clear drag state after successful drop
            clearDragState();

            // API Calls
            try {
                const dndResponse = await postWithAuth('/api/note/block/drag-and-drop', {
                    dragAndDropinputfieldArray: [
                        {
                            parentId: sourceParentId,
                            blockIdArray: sourceBlockIdArray,
                            workspaceId: currentWorkspace?._id,
                            typeofChild: isRootNote ? sourceType : "page"
                        },
                        {
                            parentId: normalizedDsId,
                            blockIdArray: newBlockIds,
                            workspaceId: currentWorkspace?._id,
                            typeofChild: "page"
                        }
                    ],
                    updatedBlockInfo: {
                        blockId: effectiveDraggedNoteId,
                        parentId: normalizedDsId,
                        parentType: 'collection',
                        pageType: "Viewdatabase_Note"
                    },
                });

                if (Object.keys(updateProps).length > 0) {
                    for (const propId in updateProps) {
                        await postWithAuth('/api/database/updatePropertyValue', {
                            dataSourceId: normalizedDsId,
                            blockId: effectiveDraggedNoteId,
                            propertyId: propId,
                            value: updateProps[propId],
                            workspaceName: currentWorkspace?.name || "",
                        });
                    }
                }

                if (!dndResponse.success) throw new Error("API failed");
                toast.success("Note moved to list");

                // If the page was dragged from the editor, dispatch event to remove it from editor content
                if (isFromEditor) {
                    const event = new CustomEvent("remove-page-block-from-editor", {
                        detail: { pageId: effectiveDraggedNoteId, sourceParentId: sourceParentId }
                    });
                    window.dispatchEvent(event);
                }
            } catch (error) {
                // console.error("Failed to move note from sidebar:", error);
                // toast.error("Failed to move note");
                // Rollback
                // setLocalNotes(previousLocalNotes);
                // updateDataSource(normalizedDsId, { blockIds: previousBlockIds });
                // upsertBlocks([draggedBlock]);
                // if (isRootNote) {
                //     if (sourceType === "private") reorderPrivate([...previousSidebarOrder]);
                //     else if (sourceType === "public") reorderPublic([...previousSidebarOrder]);
                // } else {
                //     const parentBlock = getBlock(sourceParentId);
                //     if (parentBlock) upsertBlocks([{ ...parentBlock, blockIds: previousSidebarOrder }]);
                // }

                // Clear drag state after failed drop
                clearDragState();
            }
        } else {
            // --- Logic for board/list sourced drops (Internal or Cross-Datasource) ---
            console.log("One List to other list Logic +++", {
                effectiveDraggedNoteId,
                normalizedDsId,
                dropTargetNoteId,
                dragPosition,
                isFromEditor,
            });
            // 1. Identify Source and Target Datasources
            const draggedBlock = getBlock(effectiveDraggedNoteId);
            const sourceDatasourceId = draggedBlock?.parentId;
            const targetDatasourceId = normalizedDsId;
            const isCrossDatasource = sourceDatasourceId && sourceDatasourceId !== targetDatasourceId;

            console.log("List Drop Logic ++", {
                effectiveDraggedNoteId,
                sourceDatasourceId,
                targetDatasourceId,
                isCrossDatasource
            });

            // 2. Prepare Optimistic Updates
            const newLocalNotes = [...filteredNotes];

            // If cross-datasource, the note is NEW to this list, so just insert it
            // If same datasource, we move it (remove then insert)
            if (!isCrossDatasource) {
                const draggedIndex = newLocalNotes.findIndex(n => n._id === effectiveDraggedNoteId);
                if (draggedIndex !== -1) {
                    newLocalNotes.splice(draggedIndex, 1);
                }
            } else {
                // Remove from source datasource locally if it exists in context
                if (sourceDatasourceId) {
                    const sourceDs = dataSources[sourceDatasourceId];
                    if (sourceDs) {
                        const newSourceBlockIds = (sourceDs.blockIds || []).filter(id => id !== effectiveDraggedNoteId);
                        updateDataSource(sourceDatasourceId, { blockIds: newSourceBlockIds });
                    }
                }
            }

            // Determine Properties to Update (e.g. Status grouping)
            const groupByPropertyId = getGroupBy(boardId);
            let internalUpdateProps: Record<string, any> = {};
            if (groupByPropertyId) {
                if (forcedGroupByValue !== undefined) {
                    internalUpdateProps[groupByPropertyId] = forcedGroupByValue;
                } else if (dropTargetNoteId) {
                    const targetNote = filteredNotes.find(n => n._id === dropTargetNoteId);
                    if (targetNote) {
                        const targetValue = targetNote.value.databaseProperties?.[groupByPropertyId];
                        if (targetValue !== undefined) {
                            internalUpdateProps[groupByPropertyId] = targetValue;
                        }
                    }
                }
            }

            // Check if we have the block to insert (we should, from getBlock)
            let movedBlock = draggedBlock;
            if (isCrossDatasource && movedBlock) {
                console.log("Cross Datasource Logic +++", {
                    movedBlock,
                    targetDatasourceId,
                    internalUpdateProps
                });
                // Update parentId and properties for the moved block
                movedBlock = {
                    ...movedBlock,
                    parentId: targetDatasourceId,
                    value: {
                        ...movedBlock.value,
                        databaseProperties: {
                            ...(movedBlock.value.databaseProperties || {}),
                            ...internalUpdateProps
                        }
                    }
                };
                // Update global block context
                upsertBlocks([movedBlock]);
            } else if (movedBlock && Object.keys(internalUpdateProps).length > 0) {
                console.log("Internal Update Props +++", {
                    movedBlock,
                    internalUpdateProps
                });
                // Internal move with property update
                movedBlock = {
                    ...movedBlock,
                    value: {
                        ...movedBlock.value,
                        databaseProperties: {
                            ...(movedBlock.value.databaseProperties || {}),
                            ...internalUpdateProps
                        }
                    }
                };
                upsertBlocks([movedBlock]);
            }

            // Insert into Local Notes (UI)
            if (movedBlock) {
                const targetIndex = dropTargetNoteId ? newLocalNotes.findIndex(n => n._id === dropTargetNoteId) : -1;
                if (targetIndex !== -1) {
                    const insertAt = dragPosition === "above" ? targetIndex : targetIndex + 1;
                    newLocalNotes.splice(insertAt, 0, movedBlock);
                } else {
                    newLocalNotes.push(movedBlock);
                }
                setLocalNotes(newLocalNotes);
            }

            // 3. Update Target Datasource BlockIds
            const currentBlockIds = [...(datasource.blockIds || [])];
            let newBlockIds = [...currentBlockIds];

            // If same datasource, remove old position first
            if (!isCrossDatasource) {
                const dragIdxInDs = newBlockIds.indexOf(effectiveDraggedNoteId);
                if (dragIdxInDs !== -1) {
                    newBlockIds.splice(dragIdxInDs, 1);
                }
            }

            // Insert at new position
            if (dropTargetNoteId) {
                const targetIdxInDs = newBlockIds.indexOf(dropTargetNoteId);
                if (targetIdxInDs !== -1) {
                    const insertIdx = dragPosition === "above" ? targetIdxInDs : targetIdxInDs + 1;
                    newBlockIds.splice(insertIdx, 0, effectiveDraggedNoteId);
                } else {
                    newBlockIds.push(effectiveDraggedNoteId);
                }
            } else {
                newBlockIds.push(effectiveDraggedNoteId);
            }

            updateDataSource(normalizedDsId, { blockIds: newBlockIds });

            // Clear drag state
            clearDragState();

            // 4. API Call
            try {
                // Prepare API Payload
                const dragAndDropPayload: any[] = [];

                // If Cross-Datasource, we need to update Source Parent too
                if (isCrossDatasource && sourceDatasourceId) {
                    const sourceDs = dataSources[sourceDatasourceId];
                    if (sourceDs && sourceDs.blockIds) {
                        const sourceBlockIds = (sourceDs.blockIds || []).filter(id => id !== effectiveDraggedNoteId);
                        dragAndDropPayload.push({
                            parentId: sourceDatasourceId,
                            blockIdArray: sourceBlockIds,
                            workspaceId: currentWorkspace?._id,
                            typeofChild: "page"
                        });
                    }
                }

                // Add Target Update
                dragAndDropPayload.push({
                    parentId: normalizedDsId,
                    blockIdArray: newBlockIds,
                    workspaceId: currentWorkspace?._id,
                    typeofChild: "page"
                });

                await postWithAuth('/api/note/block/drag-and-drop', {
                    dragAndDropinputfieldArray: dragAndDropPayload,
                    updatedBlockInfo: {
                        blockId: effectiveDraggedNoteId,
                        parentId: normalizedDsId,
                        parentType: 'collection',
                        pageType: "Viewdatabase_Note"
                    },
                });

                if (Object.keys(internalUpdateProps).length > 0) {
                    for (const propId in internalUpdateProps) {
                        await postWithAuth('/api/database/updatePropertyValue', {
                            dataSourceId: normalizedDsId,
                            blockId: effectiveDraggedNoteId,
                            propertyId: propId,
                            value: internalUpdateProps[propId],
                            workspaceName: currentWorkspace?.name || "",
                        });
                    }
                }
            } catch (error) {
                console.error("Failed to save order:", error);
                // setLocalNotes(filteredNotes);

                // Clear drag state after failed drop
                clearDragState();
            }
        }

        setDragOverNoteId(null);
        setDragPosition(null);
    }, [dragNoteInfo, dragSource, dragPosition, filteredNotes, boardId, currentView, getBlock, getDataSource, updateDataSource, upsertBlocks, currentWorkspace, getGroupBy, privatePagesOrder, publicPagesOrder, workAreaPagesOrder, sharedPagesOrder, removePage, reorderPrivate, reorderPublic, setLocalNotes, clearDragState]);

    // Get dragged note ID from context for return value (backward compatibility)
    const draggedNoteId = dragSource === "board" && dragNoteInfo ? dragNoteInfo.noteId : null;

    return {
        draggedNoteId,
        dragOverNoteId,
        dragPosition,
        handleRowDragStart,
        handleRowDragEnd,
        handleRowDragOver,
        handleRowDragLeave,
        handleRowDrop,
    };
};

