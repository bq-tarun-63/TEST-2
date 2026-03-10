"use client";

import React, { useState, useEffect, useRef } from "react";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { ChevronRight, FileText, MoreHorizontal, Plus, Loader2, Circle } from "lucide-react";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { isOwner } from "@/services-frontend/user/userServices";
import { useAuth } from "@/hooks/use-auth";
import type { Block } from "@/types/block";
import { postWithAuth } from "@/lib/api-helpers";
import { toast } from "sonner";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { useBoard } from "@/contexts/boardContext";
import { useDragState } from "@/contexts/dragStateContext";
import { CollectionIcon } from "./icons/CollectionIcon";
import useAddRootPage from "@/hooks/use-addRootPage";
import { ObjectId } from "bson";
import type { ParentTable } from "@/types/block";

// Allowed types to appear in the sidebar
const ALLOWED_SIDEBAR_TYPES = ["page", "collection_view"];

/**
 * SidebarNode Component
 * 
 * Renders a single node in the sidebar using BlockContext for data.
 * fetch ON DEMAND: If children are missing or not loaded, it triggers a fetch.
 */
interface SidebarNodeProps {
    nodeId: string;
    depth?: number;
    onSelectEditor: (id: string) => void;
    onAddEditor: (parentId: string) => void;
    onDropdownToggle: (e: React.MouseEvent, block: Block) => void;
    openNodeIds: Set<string>;
    toggleNode: (id: string) => void;
    selectedEditor: string | null;
}

export function SidebarNode({
    nodeId,
    depth = 0,
    onSelectEditor,
    onAddEditor,
    onDropdownToggle,
    openNodeIds,
    toggleNode,
    selectedEditor
}: SidebarNodeProps) {
    const { getBlock, getChildrenBlocks, loadBlocks, upsertBlocks, hasBlock } = useGlobalBlocks();
    const {
        privatePagesOrder,
        publicPagesOrder,
        sharedPagesOrder,
        workAreaPagesOrder,
        addPrivatePage,
        addPublicPage,
        addSharedPage,
        addWorkAreaPage,
        removePage,
        reorderPrivate,
        reorderPublic,
        reorderWorkArea,
    } = useRootPagesOrder();
    const { currentWorkspace } = useWorkspaceContext();
    const { user } = useAuth();
    const { getDataSource, updateDataSource, currentView, currentDataSource } = useBoard();
    const { addRootPage } = useAddRootPage();
    const { setDragState, clearDragState, dragSource } = useDragState();
    const pathname = usePathname();
    const [isHovered, setIsHovered] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const dragNodeRef = useRef<HTMLLIElement>(null);

    // O(1) Lookup from Context
    const block = getBlock(nodeId);
    // Fetch children on demand when expanding
    // useEffect(() => {
    //     // Only proceed if node is open and we have blockIds to check
    //     if (openNodeIds.has(nodeId) && block?.blockIds) {
    //         const childIds = block.blockIds;
    //         // Identify which children are missing from our context
    //         const missingChildren = childIds.filter(id => !hasBlock(id));

    //         if (missingChildren.length > 0 && !isLoading) {
    //             setIsLoading(true);
    //             fetch(`/api/note/block/get-all-block/${nodeId}`)
    //                 .then((res) => {
    //                     if (!res.ok) throw new Error("Failed to fetch");
    //                     return res.json();
    //                 })
    //                 .then((data) => {
    //                     if (data.blocks && Array.isArray(data.blocks)) {
    //                         upsertBlocks(data.blocks);
    //                     }
    //                 })
    //                 .catch((err) => {
    //                     console.error("Error fetching children for node", nodeId, err);
    //                 })
    //                 .finally(() => {
    //                     setIsLoading(false);
    //                 });
    //         }
    //     }
    // }, [openNodeIds, nodeId, block?.blockIds]);

    const [dropPos, setDropPos] = useState<"top" | "bottom" | "center" | "none">("none");

    // Drag and Drop handlers for reordering children
    const handleDragStart = (e: React.DragEvent) => {
        // Only owner can drag their notes
        if (!userOwnsNote) {
            e.preventDefault();
            toast.error("Only the owner can move this page");
            return;
        }

        e.stopPropagation(); // Prevent parent nodes from being dragged
        setIsDragging(true); // Set local state to show opacity on dragging node
        e.dataTransfer.effectAllowed = "move"; // Tell browser this is a move operation
        e.dataTransfer.setData("text/plain", nodeId); // Store "page-a-123"

        // ✅ FIX: Set custom drag image to prevent ID text from showing while dragging
        if (dragNodeRef.current) {
            dragNodeRef.current.style.opacity = "0.5";
            // Use the actual sidebar element as the drag image instead of default text
            e.dataTransfer.setDragImage(dragNodeRef.current, 0, 0);
        }
        setDragState({ noteId: nodeId }, "sidebar");
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.stopPropagation();
        setIsDragging(false);
        setDropPos("none");

        // Restore opacity
        if (dragNodeRef.current) {
            dragNodeRef.current.style.opacity = "1";
        }

        // Clear drag state on drag end (handles cancelled drags)
        clearDragState();
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";

        // Log for debugging editor drags
        const isFromEditor = e.dataTransfer.types.includes("application/page-block-from-editor");
        if (isFromEditor) {
            console.log("Dragging over sidebar from editor");
        }

        if (dragNodeRef.current) {
            const rect = dragNodeRef.current.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const h = rect.height;

            if (y < h * 0.25) setDropPos("top");
            else if (y > h * 0.75) setDropPos("bottom");
            else setDropPos("center");
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropPos("none");
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const finalDropPos = dropPos;
        setDropPos("none");

        const draggedNodeId = e.dataTransfer.getData("text/plain");

        // --- OWNERSHIP CHECK ---
        // Only the owner of the dragged note can drop it anywhere
        const draggedBlock = getBlock(draggedNodeId);
        if (draggedBlock) {
            const isDraggedNoteOwner = isOwner(draggedBlock.value?.userEmail, true, user);
            if (!isDraggedNoteOwner) {
                toast.error("Only the owner can move this page");
                setDropPos("none");
                clearDragState();
                return;
            }
        }
        // -----------------------

        const targetNodeId = nodeId;

        // Check if this is from the editor
        const isFromEditor = e.dataTransfer.types.includes("application/page-block-from-editor");

        // Check if this is from the board
        const boardDataRaw = e.dataTransfer.getData("application/x-board-note");
        const isFromBoard = !!boardDataRaw;
        let boardData: { noteId: string; columnId: string; dataSourceId: string; sourceBlockIds?: string[] } | null = null;
        if (isFromBoard && dragSource === "board") {
            try {
                boardData = JSON.parse(boardDataRaw);
                console.log("Detected board → sidebar drop: ++ ", boardData);
            } catch (err) {
                console.error("Failed to parse board drop data:", err);
            }
        }

        // Check if this is from the calendar
        const calendarDataRaw = e.dataTransfer.getData("application/x-calendar-note");
        const isFromCalendar = !!calendarDataRaw;
        let calendarData: { noteId: string; dataSourceId: string; sourceBlockIds?: string[] } | null = null;
        if (isFromCalendar && dragSource === "calendar") {
            try {
                calendarData = JSON.parse(calendarDataRaw);
                console.log("Detected calendar → sidebar drop:", calendarData);
            } catch (err) {
                console.error("Failed to parse calendar drop data:", err);
            }
        }

        if (draggedNodeId === targetNodeId) {
            return; // Can't drop on itself
        }

        const targetBlock = getBlock(targetNodeId);

        if (!draggedBlock || !targetBlock) {
            return;
        }

        // --- Edge Case: Prevent dropping parent into its own descendant (circular reference) ---
        // Only check when dropping INTO a note (center position) for sidebar → sidebar drops
        if (!isFromBoard && !isFromEditor && finalDropPos === "center") {
            // Check if target is a descendant of dragged note
            const isDescendantOf = (potentialDescendantId: string, ancestorId: string): boolean => {
                let currentId: string | undefined = potentialDescendantId;
                const visited = new Set<string>(); // Prevent infinite loops

                while (currentId && !visited.has(currentId)) {
                    visited.add(currentId);
                    const block = getBlock(currentId);
                    if (!block) break;

                    if (block.parentId === ancestorId) {
                        return true; // Found: target's ancestor is the dragged note
                    }
                    currentId = block.parentId;
                }
                return false;
            };

            if (isDescendantOf(targetNodeId, draggedNodeId)) {
                console.warn("Cannot drop parent into its own descendant");
                toast.error("Cannot move a parent page into its child");
                // Clear drag state after failed drop
                clearDragState();
                return;
            }
        }

        // --- Handle Board → Sidebar Drop ---
        if (isFromBoard && boardData) {
            console.log("Processing board → sidebar drop ++ ");

            // Destination Parent (where it's going in sidebar)
            let destParentId: string | null = targetBlock.parentId;
            let destIsRoot = !destParentId || (currentWorkspace?._id === destParentId) || targetBlock.parentType === "workarea";

            if (finalDropPos === "center") {
                // Dropping INTO the target node
                destParentId = targetNodeId;
                destIsRoot = false;
            }
            console.log("Printing the parentId and destIsRoot ++", destParentId, destIsRoot);

            // Determine destination type
            let destType = "private";
            let destOrder: string[] = [];
            let destParentBlock: Block | null = null;

            if (destIsRoot) {
                if (privatePagesOrder.includes(targetNodeId)) {
                    destOrder = [...privatePagesOrder];
                    destType = "private";
                } else if (publicPagesOrder.includes(targetNodeId)) {
                    destOrder = [...publicPagesOrder];
                    destType = "public";
                } else if (sharedPagesOrder.includes(targetNodeId)) {
                    destOrder = [...sharedPagesOrder];
                    destType = "private";
                } else {
                    for (const waId in workAreaPagesOrder) {
                        if (workAreaPagesOrder[waId]?.includes(targetNodeId)) {
                            destOrder = [...workAreaPagesOrder[waId]];
                            destType = "workarea";
                            break;
                        }
                    }
                    if (destOrder.length === 0) {
                        destOrder = [...privatePagesOrder];
                        destType = "private";
                    }
                }
            } else {
                console.log("Printing from the child ++ ")
                destParentBlock = destParentId ? (getBlock(destParentId) || null) : null;
                console.log("Printing from the child ++ 1", destParentBlock)

                destOrder = destParentBlock?.blockIds ? [...destParentBlock.blockIds] : [];
                console.log("Printing from the child ++ 2", destOrder)

                const pVal = destParentBlock?.value;
                destType = (pVal?.pageType === "public") ? "public" : (pVal?.pageType === "workarea") ? "workarea" : "private";
                console.log("Printing from the child ++ 3", destType, pVal);

            }

            // Calculate new order in destination
            const newDestOrder = [...destOrder];
            if (finalDropPos === "top") {
                const targetIdx = newDestOrder.indexOf(targetNodeId);
                if (targetIdx !== -1) {
                    newDestOrder.splice(targetIdx, 0, draggedNodeId);
                } else {
                    newDestOrder.unshift(draggedNodeId);
                }
            } else if (finalDropPos === "bottom") {
                const targetIdx = newDestOrder.indexOf(targetNodeId);
                if (targetIdx !== -1) {
                    newDestOrder.splice(targetIdx + 1, 0, draggedNodeId);
                } else {
                    newDestOrder.push(draggedNodeId);
                }
            } else if (finalDropPos === "center") {
                newDestOrder.unshift(draggedNodeId);
            }

            console.log("New Destination page order ++ ", newDestOrder, destType);

            // Store previous state for rollback
            const previousDestOrder = destIsRoot
                ? (destType === "private" ? [...privatePagesOrder]
                    : destType === "public" ? [...publicPagesOrder]
                        : destType === "workarea" ? [...(workAreaPagesOrder[destParentId || ""] || [])]
                            : [...privatePagesOrder])
                : [...(destParentBlock?.blockIds || [])];

            const previousDatasourceBlockIds = boardData?.dataSourceId
                ? [...(getDataSource(boardData.dataSourceId)?.blockIds || [])]
                : [];

            // OPTIMISTIC UPDATES - Do this BEFORE API call

            // 1. Update local sidebar state
            if (destIsRoot) {
                if (destType === "private") {
                    reorderPrivate(newDestOrder);
                } else if (destType === "public") {
                    reorderPublic(newDestOrder);
                } else if (destType === "workarea") {
                    const newMap = { ...workAreaPagesOrder, [destParentId || currentWorkspace?._id || ""]: newDestOrder };
                    reorderWorkArea(newMap);
                }
            } else {
                // Update parent block's blockIds in context
                const parentBlock = getBlock(destParentId!);
                if (parentBlock) {
                    const updatedParent: Block = {
                        ...parentBlock,
                        blockIds: newDestOrder
                    };
                    console.log("Printing the parentBlock and UpdatedParent ++ ", parentBlock, updatedParent);
                    upsertBlocks([updatedParent]);
                }
            }

            let newParentType = "page"; // Default to 'page' for child items (as they are under a page)
            if (destIsRoot) {
                if (destType === "workarea") {
                    newParentType = "workarea";
                    console.log("new Parent Type workarea", newParentType);
                }
                else newParentType = "workspace";
            }

            // 2. Update dragged block in context
            const updatedDraggedBlock = {
                ...draggedBlock,
                parentId: destParentId || currentWorkspace?._id || "",
                parentType: newParentType as any,
                workareaId: destType === "workarea" ? targetBlock.workareaId : null,
            };

            upsertBlocks([updatedDraggedBlock]);

            // 3. Remove from datasource blockIds
            if (boardData?.dataSourceId) {
                const datasource = getDataSource(boardData.dataSourceId);
                if (datasource) {
                    const updatedBlockIds = datasource.blockIds?.filter(id => id !== draggedNodeId) || [];
                    updateDataSource(boardData.dataSourceId, { blockIds: updatedBlockIds });
                    console.log("✅ Removed note from datasource blockIds (optimistic):", draggedNodeId);
                }
            }

            // Build API payload
            const apiPayload: any = [];

            // Update source datasource (remove note from board)
            if (boardData?.dataSourceId) {
                const datasource = getDataSource(boardData.dataSourceId);
                const updatedSourceBlockIds = datasource?.blockIds?.filter(id => id !== draggedNodeId) || [];
                apiPayload.push({
                    parentId: boardData.dataSourceId,
                    blockIdArray: updatedSourceBlockIds,
                    workspaceId: currentWorkspace?._id,
                    typeofChild: "page",
                });
            }

            // Update destination parent
            apiPayload.push({
                parentId: destParentId || currentWorkspace?._id || "",
                blockIdArray: newDestOrder,
                workspaceId: currentWorkspace?._id,
                // sending the workarea_page for workarea pages as workrea is for whole workarea reodering
                typeofChild: destType === "workarea" ? "workarea_page" : destType,
            });
            
            // else {
            //     apiPayload.push({
            //         parentId: destParentId,
            //         blockIdArray: newDestOrder,
            //         workspaceId: currentWorkspace?._id,
            //         typeofChild: destType === "workarea" ? "workarea_page" : destType,
            //     });
            // }

            // Clear drag state after successful drop
            clearDragState();

            // Call drag-and-drop API
            try {
                const response = await postWithAuth("/api/note/block/drag-and-drop", {
                    dragAndDropinputfieldArray: apiPayload,
                    updatedBlockInfo: {
                        blockId: draggedNodeId,
                        parentType: destIsRoot
                            ? (destType === "workarea" ? "workarea" : "workspace")
                            : "page",
                        parentId: destParentId || currentWorkspace?._id,
                        pageType: destType === "public" ? "public" : destType === "workarea" ? "workarea" : "private",
                        workareaId: destType === "workarea" ? targetBlock.workareaId : null,
                    }
                });

                if (!response.success) {
                    throw new Error("Failed to move note from board to sidebar");
                }

                toast.success("Note moved to sidebar");
                console.log("✅ Board → sidebar drop successful");


            } catch (error) {
                console.error("Failed to move note from board to sidebar:", error);
                toast.error("Failed to move note");

                // Clear drag state after failed drop
                clearDragState();
                // ROLLBACK optimistic updates on error

                // 1. Rollback sidebar state
                // if (destIsRoot) {
                //     if (destType === "private") {
                //         reorderPrivate(previousDestOrder);
                //     } else if (destType === "public") {
                //         reorderPublic(previousDestOrder);
                //     } else if (destType === "workarea") {
                //         const rollbackMap = { ...workAreaPagesOrder, [destParentId || currentWorkspace?._id || ""]: previousDestOrder };
                //         reorderWorkArea(rollbackMap);
                //     }
                // } else {
                //     const parentBlock = getBlock(destParentId!);
                //     if (parentBlock) {
                //         const revertedParent: Block = {
                //             ...parentBlock,
                //             blockIds: previousDestOrder
                //         };
                //         upsertBlocks([revertedParent]);
                //     }
                // }

                // // 2. Rollback dragged block
                // upsertBlocks([draggedBlock]);

                // // 3. Rollback datasource blockIds
                // if (boardData?.dataSourceId) {
                //     updateDataSource(boardData.dataSourceId, { blockIds: previousDatasourceBlockIds });
                // }
            }

            return;
        }

        // --- Handle Calendar → Sidebar Drop ---
        if (isFromCalendar && calendarData) {
            console.log("Processing calendar → sidebar drop");

            // Destination Parent (where it's going in sidebar)
            let destParentId: string | null = targetBlock.parentId;
            let destIsRoot = !destParentId || (currentWorkspace?._id === destParentId) || targetBlock.parentType === "workarea";

            if (finalDropPos === "center") {
                console.log("Printing the finalDropPos === center ++ ", targetNodeId);
                destParentId = targetNodeId;
                destIsRoot = false;
            }
            console.log("Printing the destParentId and destIsRoot ++ ", destParentId, destIsRoot);

            // Determine destination type
            let destType = "private";
            let destOrder: string[] = [];
            let destParentBlock: Block | null = null;

            console.log("Printing the destIsRoot ++ ", destIsRoot, targetNodeId, privatePagesOrder, publicPagesOrder);
            if (destIsRoot) {
                if (privatePagesOrder.includes(targetNodeId)) {
                    destOrder = [...privatePagesOrder];
                    destType = "private";
                } else if (publicPagesOrder.includes(targetNodeId)) {
                    destOrder = [...publicPagesOrder];
                    destType = "public";
                } else if (sharedPagesOrder.includes(targetNodeId)) {
                    destOrder = [...sharedPagesOrder];
                    destType = "private";
                } else {
                    for (const waId in workAreaPagesOrder) {
                        if (workAreaPagesOrder[waId]?.includes(targetNodeId)) {
                            destOrder = [...workAreaPagesOrder[waId]];
                            destType = "workarea";
                            break;
                        }
                    }
                    if (destOrder.length === 0) {
                        destOrder = [...privatePagesOrder];
                        destType = "private";
                    }
                }
            } else {
                destParentBlock = destParentId ? (getBlock(destParentId) || null) : null;
                destOrder = destParentBlock?.blockIds ? [...destParentBlock.blockIds] : [];
                const pVal = destParentBlock?.value;
                destType = (pVal?.pageType === "public") ? "public" : (pVal?.pageType === "workarea") ? "workarea" : "private";
            }
            console.log("Printing the destParentBlock and destOrder and destType ++ ", destParentBlock, destOrder, destType);

            // Calculate new order in destination
            const newDestOrder = [...destOrder];
            if (finalDropPos === "top") {
                const targetIdx = newDestOrder.indexOf(targetNodeId);
                if (targetIdx !== -1) {
                    newDestOrder.splice(targetIdx, 0, draggedNodeId);
                } else {
                    newDestOrder.unshift(draggedNodeId);
                }
            } else if (finalDropPos === "bottom") {
                const targetIdx = newDestOrder.indexOf(targetNodeId);
                if (targetIdx !== -1) {
                    newDestOrder.splice(targetIdx + 1, 0, draggedNodeId);
                } else {
                    newDestOrder.push(draggedNodeId);
                }
            } else if (finalDropPos === "center") {
                newDestOrder.unshift(draggedNodeId);
            }

            // Store previous state for rollback
            const previousDestOrder = destIsRoot
                ? (destType === "private" ? [...privatePagesOrder]
                    : destType === "public" ? [...publicPagesOrder]
                        : destType === "workarea" ? [...(workAreaPagesOrder[destParentId || ""] || [])]
                            : [...privatePagesOrder])
                : [...(destParentBlock?.blockIds || [])];

            const previousDatasourceBlockIds = calendarData?.dataSourceId
                ? [...(getDataSource(calendarData.dataSourceId)?.blockIds || [])]
                : [];

            // OPTIMISTIC UPDATES

            // 1. Update local sidebar state
            if (destIsRoot) {
                if (destType === "private") {
                    reorderPrivate(newDestOrder);
                } else if (destType === "public") {
                    reorderPublic(newDestOrder);
                } else if (destType === "workarea") {
                    const newMap = { ...workAreaPagesOrder, [destParentId || currentWorkspace?._id || ""]: newDestOrder };
                    reorderWorkArea(newMap);
                }
            } else {
                const parentBlock = getBlock(destParentId!);
                if (parentBlock) {
                    const updatedParent: Block = {
                        ...parentBlock,
                        blockIds: newDestOrder
                    };
                    upsertBlocks([updatedParent]);
                }
            }

            let newParentType = "page"; // Default to 'page' for child items (as they are under a page)
            if (destIsRoot) {
                if (destType === "workarea") {
                    newParentType = "workarea";
                    console.log("new Parent Type workarea", newParentType);
                }
                else newParentType = "workspace";
            }

            // 2. Update dragged block in context
            const updatedDraggedBlock: Block = {
                ...draggedBlock,
                parentId: destParentId || currentWorkspace?._id || "",
                parentType: newParentType as any,
                workareaId: destType === "workarea" ? targetBlock.workareaId : null,
            };

            upsertBlocks([updatedDraggedBlock]);

            // 3. Remove from datasource blockIds
            if (calendarData?.dataSourceId) {
                const datasource = getDataSource(calendarData.dataSourceId);
                if (datasource) {
                    const updatedBlockIds = datasource.blockIds?.filter(id => id !== draggedNodeId) || [];
                    updateDataSource(calendarData.dataSourceId, { blockIds: updatedBlockIds });
                    console.log("✅ Removed note from calendar datasource (optimistic):", draggedNodeId);
                }
            }

            // Build API payload
            const apiPayload: any = [];

            // Update source datasource (remove note from calendar)
            if (calendarData?.dataSourceId) {
                const datasource = getDataSource(calendarData.dataSourceId);
                const updatedSourceBlockIds = datasource?.blockIds?.filter(id => id !== draggedNodeId) || [];
                apiPayload.push({
                    parentId: calendarData.dataSourceId,
                    blockIdArray: updatedSourceBlockIds,
                    workspaceId: currentWorkspace?._id,
                    typeofChild: "page",
                });
            }

            // Update destination parent
            //if (destIsRoot) {
                apiPayload.push({
                    parentId: destParentId ||currentWorkspace?._id || "",
                    blockIdArray: newDestOrder,
                    workspaceId: currentWorkspace?._id,
                    // sending the workarea_page for workarea pages as workrea is for whole workarea reodering
                    typeofChild: destType === "workarea" ? "workarea_page" : destType,
                });
            // } 
            // else {
            //     apiPayload.push({
            //         parentId: destParentId,
            //         blockIdArray: newDestOrder,
            //         workspaceId: currentWorkspace?._id,
            //         typeofChild: destType === "workarea" ? "workarea" : destType,
            //     });
            // }

            // Clear drag state after successful drop
            clearDragState();

            // Call drag-and-drop API
            try {
                const response = await postWithAuth("/api/note/block/drag-and-drop", {
                    dragAndDropinputfieldArray: apiPayload,
                    updatedBlockInfo: {
                        blockId: draggedNodeId,
                        parentType: destIsRoot
                            ? (destType === "workarea" ? "workarea" : "workspace")
                            : "page",
                        parentId: destParentId || currentWorkspace?._id,
                        pageType: destType === "public" ? "public" : destType === "workarea" ? "workarea" : "private",
                        workareaId: destType === "workarea" ? targetBlock.workareaId : null,
                    }
                });

                if (!response.success) {
                    throw new Error("Failed to move note from calendar to sidebar");
                }

                toast.success("Note moved to sidebar");
                console.log("✅ Calendar → sidebar drop successful");



            } catch (error) {
                console.error("Failed to move note from calendar to sidebar:", error);
                toast.error("Failed to move note");

                // Clear drag state after successful drop
                clearDragState();
                // ROLLBACK optimistic updates on error

                // 1. Rollback sidebar state
                // if (destIsRoot) {
                //     if (destType === "private") {
                //         reorderPrivate(previousDestOrder);
                //     } else if (destType === "public") {
                //         reorderPublic(previousDestOrder);
                //     } else if (destType === "workarea") {
                //         const rollbackMap = { ...workAreaPagesOrder, [destParentId || currentWorkspace?._id || ""]: previousDestOrder };
                //         reorderWorkArea(rollbackMap);
                //     }
                // } else {
                //     const parentBlock = getBlock(destParentId!);
                //     if (parentBlock) {
                //         const revertedParent: Block = {
                //             ...parentBlock,
                //             blockIds: previousDestOrder
                //         };
                //         upsertBlocks([revertedParent]);
                //     }
                // }

                // // 2. Rollback dragged block
                // upsertBlocks([draggedBlock]);

                // // 3. Rollback datasource blockIds
                // if (calendarData?.dataSourceId) {
                //     updateDataSource(calendarData.dataSourceId, { blockIds: previousDatasourceBlockIds });
                // }
            }

            return;
        }

        // --- 1. Identify Contexts ---

        // Source Parent (where it's coming from)
        const sourceParentId = draggedBlock.parentId;
        // ✅ Get fresh source parent block for editor drags
        const sourceParentBlock = sourceParentId ? getBlock(sourceParentId) : null;
        console.log("Printing the DraggedBlock ++ ", draggedBlock);
        // Root if no parent OR parent is the workspace
        const sourceIsRoot = !sourceParentId || draggedBlock?.parentType === "workspace" || draggedBlock.parentType === "workarea";

        console.log("=== DRAG DEBUG START ===");
        console.log("Dragged Node ID:", draggedNodeId);
        console.log("Target Node ID:", targetNodeId);
        console.log("Source Parent ID:", sourceParentId);
        console.log("Source Is Root:", sourceIsRoot);
        console.log("Is From Editor:", isFromEditor);
        console.log("Current Workspace ID:", currentWorkspace?._id);

        console.log("Source Parent ID:", sourceParentId);
        console.log("Source Parent Block:", sourceParentBlock);
        console.log("Source Is Root:", sourceIsRoot);

        // Destination Parent (where it's going)
        // We are dropping ON 'targetBlock', making it a sibling.
        // So destination parent is targetBlock's parent.
        let destParentId: string | null = targetBlock.parentId;
        let destParentBlock = destParentId ? getBlock(destParentId) : null;
        let destIsRoot = !destParentId || (currentWorkspace?._id === destParentId) || targetBlock.parentType === "workarea";

        // *** Drag-to-Child Logic ***
        if (finalDropPos === "center") {
            // We are dropping INTO the target, making it the new parent
            destParentId = targetNodeId;
            destParentBlock = targetBlock;
            destIsRoot = false; // By definition, dropping into a block is not root
        }

        console.log("Destination Parent ID:", destParentId);
        console.log("Destination Parent Block:", destParentBlock);
        console.log("Destination Is Root:", destIsRoot);
        // --- 2. Calculate New Orders ---
        let sourceType = "private"; // Track source type explicitly

        // Get Source Order Array (current IDs)
        let sourceOrder: string[] = [];
        if (sourceIsRoot) {
            // Robustly find which list the dragged node belongs to
            if (privatePagesOrder.includes(draggedNodeId)) {
                sourceOrder = [...privatePagesOrder];
                sourceType = "private";
                console.log("Source Order (Private):", sourceOrder);
            } else if (publicPagesOrder.includes(draggedNodeId)) {
                sourceOrder = [...publicPagesOrder];
                sourceType = "public";
                console.log("Source Order (Public):", sourceOrder);
            } else if (sharedPagesOrder.includes(draggedNodeId)) {
                sourceOrder = [...sharedPagesOrder];
                sourceType = "shared";
                console.log("Source Order (Shared):", sourceOrder);
            } else {
                // Check work areas
                console.log("Checking work areas for dragged node...");
                console.log("Work Area Pages Order:", workAreaPagesOrder);
                console.log("Source Parent ID (should be work area ID):", sourceParentId);
                for (const waId in workAreaPagesOrder) {
                    console.log(`Checking work area ${waId}:`, workAreaPagesOrder[waId]);
                    if (workAreaPagesOrder[waId] && workAreaPagesOrder[waId].includes(draggedNodeId)) {
                        sourceOrder = [...(workAreaPagesOrder[waId] || [])];
                        sourceType = "workarea";
                        console.log("✅ Found in work area:", waId);
                        console.log("Source Order (WorkArea):", sourceOrder);
                        break;
                    }
                }
                // Fallback (though if not found, index will be -1 and error caught later)
                if (sourceOrder.length === 0) {
                    console.warn("⚠️ Dragged node not found in any work area, falling back to private pages");
                    sourceOrder = [...privatePagesOrder];
                }
            }
        } else {
            sourceOrder = sourceParentBlock?.blockIds ? [...sourceParentBlock.blockIds] : [];
            const pVal = sourceParentBlock?.value as any;
            sourceType = pVal?.pageType === "public" ? "public" : pVal.pageType === "workarea" ? "workarea" : "private";
            console.log("Source Type of child Drag", sourceType);
        }

        // Get Dest Order Array (target IDs)
        let destOrder: string[] = [];
        let destType = "private"; // Default for API
        if (destIsRoot) {
            // Robustly determine destination list based on target node
            if (privatePagesOrder.includes(targetNodeId)) {
                destOrder = [...privatePagesOrder];
                destType = "private";
                console.log("Dest Order (Private):", destOrder);
            } else if (publicPagesOrder.includes(targetNodeId)) {
                destOrder = [...publicPagesOrder];
                destType = "public";
                console.log("Dest Order (Public):", destOrder);
            } else if (sharedPagesOrder.includes(targetNodeId)) {
                destOrder = [...sharedPagesOrder];
                // destType = "shared"; // API might not support 'shared' explicitly as type? defaulting to private or specific shared handler? 
                // Context reorderShared exists. API payload 'typeofChild' might need 'shared'?
                // For now assuming private/public/workarea are main types. 
                destType = "private";
            } else {
                let found = false;
                console.log("Workarea Order:", workAreaPagesOrder);
                for (const waId in workAreaPagesOrder) {
                    if (workAreaPagesOrder[waId] && workAreaPagesOrder[waId].includes(targetNodeId)) {
                        destOrder = [...workAreaPagesOrder[waId],];
                        destType = "workarea"; // API uses workarea
                        found = true;
                        console.log("Found Block in the workarea ", waId, destOrder)
                        break;
                    }
                }
                if (!found) {
                    console.log("Not Found in Workarea Order");
                    destOrder = [...privatePagesOrder];
                    destType = "private";
                }
            }
        } else {
            destOrder = destParentBlock?.blockIds ? [...destParentBlock.blockIds] : [];
            const pVal = destParentBlock?.value as any;
            destType = (pVal?.pageType === "public") ? "public" : (pVal?.pageType === "workarea") ? "workarea" : "private";

            // If dropping into center, destType inherits from the NEW parent (targetBlock)
            if (finalDropPos === "center" && destParentBlock) {
                const tVal = destParentBlock.value as any;
                destType = (tVal?.pageType === "public") ? "public" : (tVal?.pageType === "workarea") ? "workarea" : "private";
            }

            console.log("Dest Order (Parent): and destType ", destOrder, destType);
        }

        let draggedIndex = sourceOrder.indexOf(draggedNodeId);
        let targetIndex = destOrder.indexOf(targetNodeId);

        console.log("=== INDEX CALCULATION ===");
        console.log("Source Order:", sourceOrder);
        console.log("Dest Order:", destOrder);
        console.log("Dragged Node ID:", draggedNodeId);
        console.log("Target Node ID:", targetNodeId);
        console.log("Dragged Index in Source:", draggedIndex);
        console.log("Target Index in Dest:", targetIndex);

        // ✅ For editor drags, the page might not be in sourceOrder (blockIds)
        // This is expected - the page exists in editor content but might not be in blockIds yet
        if (isFromEditor && draggedIndex === -1) {
            console.log("Editor drag: Page not in source blockIds, treating as new insertion");
            // Set draggedIndex to -1 to signal this is a cross-parent move
        }

        if (finalDropPos === "bottom") targetIndex++;

        console.log("Source Order Length:", sourceOrder.length, "Dest Order Length:", destOrder.length);
        console.log("Dragged Index:", draggedIndex, "Target Index:", targetIndex);
        console.log("Dest Type:", destType);

        // Only error if it's a same-parent move and dragged node isn't found
        if (draggedIndex === -1 && sourceParentId === destParentId && !isFromEditor) {
            console.error("❌ ERROR: Dragged node not found in source list");
            console.error("Source Parent ID:", sourceParentId);
            console.error("Dest Parent ID:", destParentId);
            console.error("Source Order:", sourceOrder);
            console.error("Dragged Node ID:", draggedNodeId);
            console.error("Source Type:", sourceType);
            console.error("Source Is Root:", sourceIsRoot);
            return;
        }

        // --- 3. Modify Arrays ---


        // If same list, perform move in single array operation to be safe
        let newDestOrder: string[] = [];

        // Check if we are moving within the SAME list or across lists
        let isSameList = sourceParentId === destParentId;

        if (sourceIsRoot && destIsRoot) {
            // For root pages, same parent (workspace) doesn't mean same list (private/public)
            // We compare the Order Arrays to see if they are the same instance or content
            // (Simple way: check if sourceList contains targetNode)
            isSameList = sourceOrder.includes(targetNodeId);
        }

        // ✅ For editor drags with draggedIndex === -1, force cross-parent logic
        if (isFromEditor && draggedIndex === -1) {
            isSameList = false;
        }

        if (isSameList) {
            // Same Parent Reorder (Same List)
            console.log("Same List Reorder");
            newDestOrder = [...sourceOrder];

            // ✅ Guard against -1 index (shouldn't happen now, but defensive)
            if (draggedIndex >= 0) {
                const [moved] = newDestOrder.splice(draggedIndex, 1);

                let adjustedTargetIndex = newDestOrder.indexOf(targetNodeId);
                if (finalDropPos === "bottom") adjustedTargetIndex++;

                if (moved) {
                    newDestOrder.splice(adjustedTargetIndex, 0, moved);
                }
            } else {
                console.error("Dragged index is -1 in same list reorder - should not happen");
                return;
            }

            // Apply Optimistic Update for Same Parent
            if (sourceIsRoot) {
                const val = draggedBlock.value as any;
                console.log("Printing value for optimistic update ", val, draggedBlock);
                if (val.pageType === "public") reorderPublic(newDestOrder);
                else if (draggedBlock.parentType === "workarea") {
                    const newMap = { ...workAreaPagesOrder, [draggedBlock.parentId]: newDestOrder };
                    reorderWorkArea(newMap);
                }
                else reorderPrivate(newDestOrder);
            } else if (sourceParentBlock) {
                const updatedParentBlock = { ...sourceParentBlock, blockIds: newDestOrder };
                upsertBlocks([updatedParentBlock]);
            }


        } else {
            // Cross Parent Move
            // Remove from source
            if (sourceIsRoot) {
                removePage(draggedNodeId); // Optimistically remove from all root lists
            } else if (sourceParentBlock) {
                // ✅ For editor drags, get fresh blockIds before filtering
                const freshSourceBlock = getBlock(sourceParentId!);
                const freshSourceBlockIds = freshSourceBlock?.blockIds || [];
                const newSourceOrder = freshSourceBlockIds.filter(id => id !== draggedNodeId);

                console.log("Removing from source parent:", sourceParentId);
                console.log("Fresh source blockIds:", freshSourceBlockIds);
                console.log("New source order after removal:", newSourceOrder);

                const updatedSourceBlock = { ...freshSourceBlock!, blockIds: newSourceOrder };
                upsertBlocks([updatedSourceBlock]);
            }

            // Insert into destination
            newDestOrder = [...destOrder];
            newDestOrder.splice(targetIndex, 0, draggedNodeId);

            if (destIsRoot) {
                // Determine which root list to add to based on 'destType'
                // We derived 'destType' from target sibling. 
                if (destType === "public") addPublicPage(draggedNodeId, targetIndex);
                else if (destType === "workarea") {
                    // Need workAreaId
                    const waId = targetBlock.workareaId;
                    console.log("Adding page to workarea", waId, "block", draggedNodeId, 'TargetBlock', targetBlock);
                    if (waId) addWorkAreaPage(waId, draggedNodeId, targetIndex);
                }
                else addPrivatePage(draggedNodeId, targetIndex); // Default private
            } else if (destParentBlock) {
                const updatedDestBlock = { ...destParentBlock, blockIds: newDestOrder };
                upsertBlocks([updatedDestBlock]);
            }
        }

        // Update Dragged Block ParentID and ParentType
        if (draggedBlock.parentId !== destParentId) {
            let newParentType = "page"; // Default to 'page' for child items (as they are under a page)
            if (destIsRoot) {
                if (destType === "workarea") {
                    newParentType = "workarea";
                    console.log("new Parent Type workarea", newParentType);
                }
                else newParentType = "workspace";
            }

            const updatedDraggedBlock = {
                ...draggedBlock,
                parentId: (destParentId || currentWorkspace?._id) as string,
                parentType: newParentType as any,
                workareaId: destType === "workarea" ? targetBlock.workareaId : null,
            };

            // Also need to handle PageType changes if moving Public <-> Private?
            if (destType === "public") {
                const val = updatedDraggedBlock.value as any || {};
                updatedDraggedBlock.value = { ...val, pageType: "public" };
            } else if (destType === "private") {
                const val = updatedDraggedBlock.value as any || {};
                updatedDraggedBlock.value = { ...val, pageType: "private" };
            } else if (destType === "workarea") {
                console.log("Dest type = workarea", updatedDraggedBlock)
                const val = updatedDraggedBlock.value as any || {};
                updatedDraggedBlock.value = { ...val, pageType: "workarea" };
            }

            upsertBlocks([updatedDraggedBlock]);
        }

        // --- 4. API Persistence ---

        // Construct Batch Payload
        const apiPayload: any[] = [];

        // 1. Source Update (Only if different list/parent)
        if (!isSameList) {
            // ✅ Get fresh source blockIds for API payload (especially important for editor drags)
            let freshSourceBlockIds: string[] = [];
            if (sourceIsRoot) {
                // For root, use the already computed sourceOrder
                freshSourceBlockIds = sourceOrder.filter(id => id !== draggedNodeId);
            } else if (sourceParentId) {
                // For nested pages, get fresh blockIds
                const freshSourceBlock = getBlock(sourceParentId);
                console.log("Source Parent Block 1 ", freshSourceBlock)

                freshSourceBlockIds = (freshSourceBlock?.blockIds || []).filter(id => id !== draggedNodeId);
            }
            console.log("Source Parent Block Ids ", freshSourceBlockIds)
            apiPayload.push({
                parentId: sourceParentId || currentWorkspace?._id, // If root, parent is workspace
                workspaceId: currentWorkspace?._id,
                blockIdArray: freshSourceBlockIds,
                typeofChild: sourceIsRoot ? sourceType : (
                    // inherited from parent
                    // sending the workarea_page for workarea pages as workrea is for whole workarea reodering
                    (sourceParentBlock?.value as any)?.pageType === "public" ? "public" :
                        (sourceParentBlock?.value as any)?.pageType === "workarea" ? "workarea_page" : "private"
                )
            });
        }

        // 2. Dest Update
        apiPayload.push({
            parentId: destParentId || currentWorkspace?._id,
            workspaceId: currentWorkspace?._id,
            blockIdArray: newDestOrder,
            // sending the workarea_page for workarea pages as workrea is for whole workarea reodering
            typeofChild: destType === "workarea" ? "workarea_page" : destType, // 'workarea_page', 'public', 'private'
        });

        // Clear drag state after successful drop (sidebar→sidebar, editor→sidebar)
        clearDragState();
        try {
            if (!currentWorkspace?._id) {
                toast.error("Workspace not found");
                return;
            }

            const response = await postWithAuth("/api/note/block/drag-and-drop", {
                dragAndDropinputfieldArray: apiPayload,
                updatedBlockInfo: {
                    blockId: draggedNodeId,
                    parentType: destIsRoot
                        ? (destType === "workarea" ? "workarea" : "workspace")
                        : "page",
                    parentId: destParentId || currentWorkspace?._id,
                    pageType: (destType === "workarea" ? "workarea" : destType === "public" ? "public" : "private"),
                    workareaId: destType === "workarea" ? destParentId : null,
                }
            });

            if ("error" in response) {
                console.error("Error reordering children:", response.error);
                toast.error("Failed to reorder pages");
                // Rollback TODO: Complex rollback logic needed or just reload?
                // For now, reloading page is safer if failed.
                window.location.reload();
            } else {
                toast.success("Pages reordered successfully");
                // Clear drag state after successful drop (sidebar→sidebar, editor→sidebar)
                clearDragState();
                // If the page was dragged from the editor, dispatch event to remove it from editor content
                if (isFromEditor) {
                    const event = new CustomEvent("remove-page-block-from-editor", {
                        detail: { pageId: draggedNodeId, sourceParentId: draggedBlock.parentId }
                    });
                    window.dispatchEvent(event);
                }
            }
        } catch (err) {
            // Clear drag state after failed drop (sidebar→sidebar, editor→sidebar)
            clearDragState();
            console.error("Reorder failed:", err);
            toast.error("Failed to reorder pages");
            // window.location.reload(); // Rollback mechanism
        }
    };

    // Helper to get fresh block state if needed? already used getBlock() inside handleDrop.


    // If block is missing (e.g. deleted or not loaded yet), don't render
    if (!block) return null;

    const value = block.value || {};
    const blockType = block.blockType;
    const contentType = value.type; // For content blocks that might be "board"

    // Filter: Only show allowed types
    // Note: strict check on blockType OR specific content types like 'board'
    const isAllowed =
        ALLOWED_SIDEBAR_TYPES.includes(blockType) ||
        contentType === "board" ||
        (value.isTemplate === true); // Templates are usually pages but explicit check helps

    if (!isAllowed) return null;

    // Resolve Children for Rendering
    // We use the same O(1) lookup helper from context which maps blockIds -> Blocks
    const allChildren = getChildrenBlocks(nodeId);

    // Filter children for sidebar visualization
    const validChildren = allChildren.filter(child => {
        const cVal = child.value || {};
        const cType = child.blockType;
        const cContentType = cVal.type;
        return ALLOWED_SIDEBAR_TYPES.includes(cType) || cContentType === "board";
    });

    const isCollectionView = blockType === "collection_view";
    const views = isCollectionView ? (value as any).viewsTypes as any[] : [];

    const hasChildren = (block.blockIds && block.blockIds.length > 0) || (isCollectionView && views && views.length > 0);
    const isOpen = openNodeIds.has(nodeId);

    // UX Calculations
    const userOwnsNote = isOwner(value.userEmail, true, user);
    const isPublicNote = value.pageType === "public";
    const showGreenLine = userOwnsNote && isPublicNote;

    // Path matching for active state
    // Highlight if directly selected OR if a child view is selected (v:viewId:nodeId)
    const isActive = selectedEditor === nodeId || (isCollectionView && selectedEditor?.startsWith("v:") && selectedEditor?.endsWith(`:${nodeId}`));
    // const isActivePath = pathname?.includes(nodeId); // Optional: highlight path

    return (
        <li
            ref={dragNodeRef}
            className={clsx(
                "select-none relative", // Added relative for absolute positioning of lines
                isDragging && "opacity-50"
            )}
            draggable={userOwnsNote}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drop Indicators */}
            {/* Drop Indicators */}
            {dropPos === "top" && (
                <div
                    className="absolute top-0 right-0 h-0.5 bg-blue-500 z-50 pointer-events-none"
                    style={{ left: `${depth * 12 + 4}px` }}
                />
            )}
            {dropPos === "bottom" && (
                <div
                    className="absolute bottom-0 right-0 h-0.5 bg-blue-500 z-50 pointer-events-none"
                    style={{ left: `${depth * 12 + 4}px` }}
                />
            )}
            <div
                className={clsx(
                    "group flex gap-2 pl-1 pr-2 items-center justify-between p-1 cursor-pointer transition-colors duration-200",
                    showGreenLine ? "rounded-r-lg" : "rounded-lg",
                    isActive ? "font-bold dark:bg-[#2c2c2c] bg-gray-100" : (
                        dropPos === "center" ? "bg-blue-50 dark:bg-blue-900/20" : // Highlight on hover center
                            "hover:bg-gray-100 dark:hover:bg-[#2c2c2c]"
                    ),
                    showGreenLine && "border-l-4"
                )}
                style={{
                    paddingLeft: `${depth * 12 + 4}px`, // Indentation
                    borderLeftColor: showGreenLine ? "rgb(63 135 85)" : undefined,
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelectEditor(nodeId);
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Left Section: Icon + Title + Arrow */}
                <div className="flex gap-1.5 items-center relative flex-1 min-w-0 pr-2 overflow-hidden">

                    {/* Arrow / Icon Toggle */}
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                        {isLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                        ) : (hasChildren) && (isHovered || isOpen) ? (
                            <button
                                type="button"
                                className={clsx(
                                    "rounded-sm transition-all duration-200",
                                    "hover:bg-black/5 dark:hover:bg-white/10"
                                )}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleNode(nodeId);
                                }}
                            >
                                <ChevronRight
                                    className={clsx(
                                        "h-4 w-4 text-gray-500 transition-transform duration-200",
                                        isOpen && "rotate-90"
                                    )}
                                />
                            </button>
                        ) : (
                            <div className="flex items-center justify-center">
                                {value.icon ? (
                                    <span className="text-md">{value.icon}</span>
                                ) : block?.blockType === "collection_view" ? (
                                    <CollectionIcon className="w-4 h-4 text-gray-400" />
                                ) : (
                                    <FileText className="w-4 h-4 text-gray-400" />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <span className={clsx(
                        "truncate text-sm text-[#5F5E5B] dark:text-[#9B9B9B]",
                        isActive && "text-gray-900 dark:text-white"
                    )}>
                        {value.title || "New page"}
                    </span>
                </div>

                {/* Right Section: Actions (Menu, Add) */}
                {!isLoading && (
                    <div className={clsx(
                        "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                    )}>
                        <button
                            type="button"
                            className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDropdownToggle(e, block);
                            }}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </button>

                        <button
                            type="button"
                            className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isCollectionView) {
                                    // For collection_view blocks, create a page in the datasource
                                    const boardId = nodeId;
                                    let dsId: string | undefined;

                                    // If a view is currently selected for this board, use its datasource
                                    const activeView = currentView[boardId];
                                    if (activeView?.id) {
                                        const view = views.find((v: any) => v._id === activeView.id);
                                        dsId = view?.databaseSourceId
                                            ? (typeof view.databaseSourceId === "string" ? view.databaseSourceId : String(view.databaseSourceId))
                                            : undefined;
                                    }

                                    // Fallback: use currentDataSource for this board (set by board context)
                                    if (!dsId) {
                                        dsId = currentDataSource[boardId];
                                    }

                                    // Fallback: use the first view's datasource
                                    if (!dsId && views.length > 0) {
                                        const firstView = views[0];
                                        dsId = firstView?.databaseSourceId
                                            ? (typeof firstView.databaseSourceId === "string" ? firstView.databaseSourceId : String(firstView.databaseSourceId))
                                            : undefined;
                                    }

                                    if (!dsId) {
                                        toast.error("No datasource found for this collection");
                                        return;
                                    }

                                    const newPageId = new ObjectId().toString();
                                    const newBlock: Block = {
                                        _id: newPageId,
                                        blockType: "page",
                                        value: {
                                            title: "",
                                            pageType: "Viewdatabase_Note",
                                            databaseProperties: {},
                                            icon: "",
                                            coverUrl: null,
                                            userId: user?.email || "",
                                            userEmail: user?.email || "",
                                        },
                                        workareaId: null,
                                        parentId: dsId,
                                        parentType: "collection" as ParentTable,
                                        workspaceId: currentWorkspace?._id || "",
                                        status: "alive",
                                        blockIds: [],
                                    };

                                    addRootPage(newPageId, newBlock, dsId, boardId);
                                } else {
                                    onAddEditor(nodeId);
                                }
                            }}
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* Recursive Children */}
            {isOpen && hasChildren && (
                <ul className="flex flex-col">
                    {validChildren.map(child => (
                        <SidebarNode
                            key={child._id}
                            nodeId={child._id}
                            depth={depth + 1}
                            onSelectEditor={onSelectEditor}
                            onAddEditor={onAddEditor}
                            onDropdownToggle={onDropdownToggle}
                            openNodeIds={openNodeIds}
                            toggleNode={toggleNode}
                            selectedEditor={selectedEditor}
                        />
                    ))}
                    {isCollectionView && views && views.map(view => {
                        const viewId = view._id;
                        const virtualId = `v:${viewId}:${nodeId}`;
                        const isViewActive = selectedEditor === virtualId || (selectedEditor === nodeId && (views[0]?._id) === viewId);

                        return (
                            <li
                                key={viewId}
                                className={clsx(
                                    "group flex gap-2 pl-1 pr-2 items-center p-1 cursor-pointer transition-colors duration-200 rounded-lg",
                                    isViewActive ? "font-bold dark:bg-[#2c2c2c] bg-gray-100" : "hover:bg-gray-100 dark:hover:bg-[#2c2c2c]"
                                )}
                                style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectEditor(virtualId);
                                }}
                            >
                                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                    <Circle className="w-1.5 h-1.5 fill-gray-400 text-gray-400" />
                                </div>
                                <span className={clsx(
                                    "truncate text-sm text-[#5F5E5B] dark:text-[#9B9B9B]",
                                    isViewActive && "text-gray-900 dark:text-white"
                                )}>
                                    {view.title || "Untitled View"}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Empty State (if expanded, loaded, but no valid displayable children) */}
            {isOpen && !isLoading && hasChildren && validChildren.length === 0 && (
                <div
                    className="text-xs text-gray-400 py-1 pl-4 italic select-none"
                    style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                >
                    No pages inside
                </div>
            )}
        </li>
    );
}
