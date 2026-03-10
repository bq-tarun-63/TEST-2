import { useState } from "react";
import { Column } from "@/components/tailwind/board/boardView/boardView"
import { postWithAuth } from "@/lib/api-helpers";
import { useBoard } from "@/contexts/boardContext";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { toast } from "sonner";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { useDragState } from "@/contexts/dragStateContext";

export const useNoteDragAndDrop = (
  columns: Column[],
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>,
  board: Block
) => {
  const { dragNoteInfo, dragSource, setDragState, clearDragState } = useDragState();

  const [hoverTarget, setHoverTarget] = useState<{
    noteId?: string;
    columnId: string;
    position?: "above" | "below";
  } | null>(null);

  const { currentView, getDataSource, updateDataSource, dataSources } = useBoard();
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

  const handleNoteDragStart = (noteId: string, columnId: string) => {
    setDragState({ noteId, columnId }, "board");
  };

  const handleNoteDragOver = (targetNoteId: string, targetColumnId: string, position: "above" | "below") => {
    // Allow hover target to be set even without dragNoteInfo (for sidebar → board drags)
    if (dragNoteInfo && dragNoteInfo.noteId === targetNoteId) return;

    setHoverTarget({ noteId: targetNoteId, columnId: targetColumnId, position });
  };

  const handleNoteDragLeave = () => {
    // Clear hoverTarget when leaving a card (but keep column-level target if it exists)
    if (hoverTarget?.noteId) {
      // If we have a card target, clear it but keep column target
      setHoverTarget({ columnId: hoverTarget.columnId });
    }
  };

  const handleNoteDrop = async (
    event?: React.DragEvent,
    targetColumnId?: string
  ) => {
    console.log("Printing the handleNoteDrop ++ ", dragNoteInfo, dragSource, event);
    const effectiveHoverTarget = hoverTarget || (targetColumnId ? { columnId: targetColumnId } : null);

    console.log("Printing the handleNoteDrop ++ ", dragNoteInfo, dragSource, event, effectiveHoverTarget);
    // Check if this is a sidebar → board drop (drag from sidebar, no dragNoteInfo set)
    if ((dragSource === "sidebar" || dragSource === "editor") && event) {
      const draggedNoteId = event.dataTransfer.getData("text/plain");
      const isFromEditor = event.dataTransfer.types.includes("application/page-block-from-editor");

      // Only handle if it's from sidebar (not from editor and has text/plain)
      if (draggedNoteId && !isFromEditor && effectiveHoverTarget) {
        console.log("Handling sidebar → board drop ++ ", draggedNoteId, "to column", effectiveHoverTarget.columnId);

        // Get the dragged note from BlockContext
        const draggedBlock = getBlock(draggedNoteId);
        if (!draggedBlock) {
          console.error("Dragged note not found in BlockContext");
          setHoverTarget(null);
          clearDragState();
          return;
        }

        // Edge case: Prevent dragging parent pages (pages with children) to board
        // if (draggedBlock.blockIds && draggedBlock.blockIds.length > 0) {
        //   console.warn("Cannot drag parent page with children to board");
        //   toast.error("Cannot move a page with sub-pages to board");
        //   setHoverTarget(null);
        //   return;
        // }

        // Edge case: Prevent dropping a page that is an ancestor of the board (circular reference)
        const isAncestorOfBoard = (noteId: string, boardBlock: Block): boolean => {
          let currentParentId = boardBlock.parentId;
          const visited = new Set<string>(); // Prevent infinite loops

          while (currentParentId && !visited.has(currentParentId)) {
            visited.add(currentParentId);
            if (currentParentId === noteId) {
              return true; // Found the note in the board's ancestor chain
            }
            const parentBlock = getBlock(currentParentId);
            if (!parentBlock) break;
            currentParentId = parentBlock.parentId;
          }
          return false;
        };

        if (isAncestorOfBoard(draggedNoteId, board)) {
          console.warn("Cannot drag ancestor page into its descendant board");
          toast.error("Cannot move a parent page into its child board");
          setHoverTarget(null);
          clearDragState();
          return;
        }

        console.log("Printing the Dragged Block ++ ", draggedBlock);
        // Get dataSourceId and status property
        const currentViewData = currentView[board._id];
        const latestBoard = board;

        console.log("Printing the currentViewData and latestBoard ++ ", currentViewData, latestBoard);

        let view: any;
        if (currentViewData?.id) {
          view = latestBoard.value.viewsTypes?.find((vt: any) => vt._id === currentViewData.id);
        } else if (currentViewData?.type) {
          view = latestBoard.value.viewsType?.find((vt: any) => vt.viewType === currentViewData.type);
        }

        console.log("Printing the ++ view ", view);


        const dataSourceId = view?.databaseSourceId;
        if (!dataSourceId) {
          console.error("Data source not found for current view");
          setHoverTarget(null);
          clearDragState();
          return;
        }
        const normalizedDsId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);

        // Get datasource and target column
        const datasource = getDataSource(normalizedDsId);
        if (!datasource) {
          console.error("DataSource not found");
          setHoverTarget(null);
          clearDragState();
          return;
        }

        console.log("printing the Data Source ++ ", datasource, normalizedDsId)

        const targetColumn = columns.find((col) => col.id === effectiveHoverTarget.columnId);
        if (!targetColumn) {
          console.error("Target column not found");
          setHoverTarget(null);
          clearDragState();
          return;
        }
        console.log("printing the targetColumn ++ ", targetColumn)

        const statusPropId = targetColumn.propId;
        const newStatusValue = targetColumn.optionValue !== undefined
          ? targetColumn.optionValue
          : targetColumn.optionId;

        // Determine if dragged note is root-level or child
        const isRootNote = draggedBlock.parentType === "workspace" || draggedBlock.parentType === "workarea";
        const sourceParentId = draggedBlock.parentId;
        console.log("printing the isRootNote,sourceParentId ++ ", isRootNote, sourceParentId)

        // Calculate source blockIdArray after removing the dragged note
        let sourceBlockIdArray: string[] = [];
        let sourceType = "private";
        let previousSidebarOrder: string[] = [];

        if (isRootNote) {
          // Root-level note - find which list it's in
          if (privatePagesOrder.includes(draggedNoteId)) {
            previousSidebarOrder = [...privatePagesOrder];
            sourceBlockIdArray = privatePagesOrder.filter(id => id !== draggedNoteId);
            sourceType = "private";
          } else if (publicPagesOrder.includes(draggedNoteId)) {
            previousSidebarOrder = [...publicPagesOrder];
            sourceBlockIdArray = publicPagesOrder.filter(id => id !== draggedNoteId);
            sourceType = "public";
          } else if (sharedPagesOrder.includes(draggedNoteId)) {
            previousSidebarOrder = [...sharedPagesOrder];
            sourceBlockIdArray = sharedPagesOrder.filter(id => id !== draggedNoteId);
            sourceType = "private"; // shared uses private type
          } else {
            // Check workarea pages
            for (const waId in workAreaPagesOrder) {
              const workAreaPages = workAreaPagesOrder[waId];
              if (workAreaPages && workAreaPages.includes(draggedNoteId)) {
                previousSidebarOrder = [...workAreaPages];
                sourceBlockIdArray = workAreaPages.filter(id => id !== draggedNoteId);
                sourceType = "workarea";
                break;
              }
            }
          }
        } else {
          // Child note - get parent's blockIds
          const parentBlock = getBlock(sourceParentId);
          if (parentBlock) {
            previousSidebarOrder = [...(parentBlock.blockIds || [])];
            sourceBlockIdArray = (parentBlock.blockIds || []).filter(id => id !== draggedNoteId);
          }
          const parentVal = parentBlock?.value as any;
          sourceType = (parentVal?.pageType === "public" || parentVal?.isPublicNote) ? "public" : "private";
        }

        console.log("Source info:", { isRootNote, sourceParentId, sourceType, sourceBlockIdArray });

        // Store previous state for rollback
        const previousBlockIds = [...(datasource.blockIds || [])];
        const previousColumns = columns;

        try {
          // 1. Add to datasource blockIds
          const newBlockIds = [...(datasource.blockIds || [])];

          console.log("Printing the newBlockIds and datasource.blockIds ++ ", newBlockIds, datasource.blockIds);
          // Calculate insert position
          if (effectiveHoverTarget.noteId) {
            const targetIdx = newBlockIds.indexOf(effectiveHoverTarget.noteId);
            if (targetIdx !== -1) {
              const insertIdx = effectiveHoverTarget.position === "above" ? targetIdx : targetIdx + 1;
              newBlockIds.splice(insertIdx, 0, draggedNoteId);
            } else {
              newBlockIds.push(draggedNoteId);
            }
          } else {
            newBlockIds.push(draggedNoteId);
          }

          // 2. Update note with status property, parentId, parentType, and pageType
          const updatedNote: Block = {
            ...draggedBlock,
            parentId: normalizedDsId,
            parentType: "collection",
            value: {
              ...draggedBlock.value,
              pageType: "Viewdatabase_Note",
              databaseProperties: {
                ...(draggedBlock.value.databaseProperties || {}),
                [statusPropId]: newStatusValue,
              },
            },
          };

          console.log("Printing the updatedNote ++ ", updatedNote)

          // 3. Optimistic update - add to board columns
          setColumns((prevCols) => {
            return prevCols.map((col) => {
              if (col.id === effectiveHoverTarget.columnId) {
                const newCards = [...col.cards];
                if (effectiveHoverTarget.noteId) {
                  const idx = newCards.findIndex((c) => c._id === effectiveHoverTarget.noteId);
                  if (idx !== -1) {
                    const insertIdx = effectiveHoverTarget.position === "above" ? idx : idx + 1;
                    newCards.splice(insertIdx, 0, updatedNote);
                  } else {
                    newCards.push(updatedNote);
                  }
                } else {
                  newCards.push(updatedNote);
                }
                return { ...col, cards: newCards, count: newCards.length };
              }
              return col;
            });
          });

          // Update datasource blockIds
          updateDataSource(normalizedDsId, { blockIds: newBlockIds });

          // Update block in global context
          upsertBlocks([updatedNote]);

          // 4. Optimistic update - remove from sidebar
          if (isRootNote) {
            // Remove from root-level sidebar lists
            removePage(draggedNoteId);
          } else {
            // Remove from parent's blockIds
            const parentBlock = getBlock(sourceParentId);
            if (parentBlock) {
              const updatedParent: Block = {
                ...parentBlock,
                blockIds: sourceBlockIdArray
              };
              upsertBlocks([updatedParent]);
            }
          }

          // Clear drag state after successful drop
          clearDragState();
          setHoverTarget(null);
          // 5. Call API to update parent (remove from sidebar)
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
              parentId: normalizedDsId,
              parentType: 'collection',
              pageType: "Viewdatabase_Note"
            },
          });

          // 5. Call API to set status property
          const statusUpdateResponse = await postWithAuth('/api/database/updatePropertyValue', {
            dataSourceId: normalizedDsId,
            blockId: draggedNoteId,
            propertyId: statusPropId,
            value: newStatusValue,
            workspaceName: currentWorkspace?.name || "",

          });

          // 6. Call API to update blockIds order
          // const reorderResponse = await postWithAuth('/api/database/reorderNotes', {
          //   dataSourceId: normalizedDsId,
          //   blockIds: newBlockIds,
          // });

          if (!parentUpdateResponse.success || !statusUpdateResponse.success) {
            throw new Error("Failed to complete sidebar → board drop");
          }

          console.log("✅ Sidebar → board drop successful ++ ");
          toast.success("Note moved to board ++ ");


        } catch (error) {
          console.error("Failed to move note from sidebar to board:", error);
          toast.error("Failed to move note to board");

          // Rollback optimistic updates
          //   updateDataSource(normalizedDsId, { blockIds: previousBlockIds });
          //   setColumns(previousColumns);

          //   // Rollback sidebar state
          //   if (isRootNote) {
          //     // Restore to the appropriate sidebar list
          //     if (sourceType === "private") {
          //       reorderPrivate(previousSidebarOrder);
          //     } else if (sourceType === "public") {
          //       reorderPublic(previousSidebarOrder);
          //     } else if (sourceType === "workarea") {
          //       const newMap = { ...workAreaPagesOrder, [sourceParentId]: previousSidebarOrder };
          //       reorderWorkArea(newMap);
          //     }
          //   } else {
          //     // Restore parent's blockIds
          //     const parentBlock = getBlock(sourceParentId);
          //     if (parentBlock) {
          //       const restoredParent: Block = {
          //         ...parentBlock,
          //         blockIds: previousSidebarOrder
          //       };
          //       upsertBlocks([restoredParent]);
          //     }
          //   }

          //   // Restore the dragged block to original state
          //   upsertBlocks([draggedBlock]);
          // }
          clearDragState();
          setHoverTarget(null);
          return;
        }
      }

      // --- Handle Sidebar → Board Drop ---
      if (draggedNoteId && dragSource === "sidebar" && effectiveHoverTarget) {
        console.log("Handling sidebar → board drop ++ ", draggedNoteId, "to column", effectiveHoverTarget.columnId);
      }

      // --- Handle Editor → Board Drop ---
      if (draggedNoteId && isFromEditor && effectiveHoverTarget) {
        console.log("Handling editor → board drop ++ ", draggedNoteId, "to column", effectiveHoverTarget.columnId);

        // Get the dragged note from BlockContext
        const draggedBlock = getBlock(draggedNoteId);
        if (!draggedBlock) {
          console.error("Dragged note not found in BlockContext");
          setHoverTarget(null);
          clearDragState();
          return;
        }
        console.log("draggedBlock  ++ ", draggedBlock);

        // Edge case: Prevent dragging parent pages (pages with children) to board
        // if (draggedBlock.blockIds && draggedBlock.blockIds.length > 0) {
        //   console.warn("Cannot drag parent page with children to board");
        //   toast.error("Cannot move a page with sub-pages to board");
        //   setHoverTarget(null);
        //   return;
        // }

        // Edge case: Prevent dropping a page that is an ancestor of the board
        const isAncestorOfBoard = (noteId: string, boardBlock: Block): boolean => {
          let currentParentId = boardBlock.parentId;
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

        if (isAncestorOfBoard(draggedNoteId, board)) {
          console.warn("Cannot drag ancestor page into its descendant board");
          toast.error("Cannot move a parent page into its child board");
          setHoverTarget(null);
          clearDragState();
          return;
        }

        // Get dataSourceId and status property
        const currentViewData = currentView[board._id];
        const latestBoard = board;

        let view: any;
        if (currentViewData?.id) {
          view = latestBoard.value.viewsTypes?.find((vt: any) => vt._id === currentViewData.id);
        } else if (currentViewData?.type) {
          view = latestBoard.value.viewsType?.find((vt: any) => vt.viewType === currentViewData.type);
        }

        const dataSourceId = view?.databaseSourceId;
        if (!dataSourceId) {
          console.error("Data source not found for current view");
          setHoverTarget(null);
          clearDragState();
          return;
        }
        const normalizedDsId = typeof dataSourceId === "string" ? dataSourceId : String(dataSourceId);

        const datasource = getDataSource(normalizedDsId);
        if (!datasource) {
          console.error("DataSource not found");
          setHoverTarget(null);
          clearDragState();
          return;
        }

        const targetColumn = columns.find((col) => col.id === effectiveHoverTarget.columnId);
        if (!targetColumn) {
          console.error("Target column not found");
          setHoverTarget(null);
          clearDragState();
          return;
        }

        const statusPropId = targetColumn.propId;
        const newStatusValue = targetColumn.optionValue !== undefined
          ? targetColumn.optionValue
          : targetColumn.optionId;

        // Source is the editor parent (the page containing this block in the editor)
        const sourceParentId = draggedBlock.parentId;
        const sourceParentBlock = getBlock(sourceParentId);

        // Calculate source blockIdArray after removing the dragged note
        const previousSourceBlockIds = sourceParentBlock?.blockIds ? [...sourceParentBlock.blockIds] : [];
        const newSourceBlockIds = previousSourceBlockIds.filter(id => id !== draggedNoteId);

        // Store previous state for rollback
        const previousDatasourceBlockIds = [...(datasource.blockIds || [])];
        const previousColumns = columns;

        try {
          // 1. Add to datasource blockIds
          const newBlockIds = [...(datasource.blockIds || [])];
          if (effectiveHoverTarget.noteId) {
            const targetIdx = newBlockIds.indexOf(effectiveHoverTarget.noteId);
            if (targetIdx !== -1) {
              const insertIdx = effectiveHoverTarget.position === "above" ? targetIdx : targetIdx + 1;
              newBlockIds.splice(insertIdx, 0, draggedNoteId);
            } else {
              newBlockIds.push(draggedNoteId);
            }
          } else {
            newBlockIds.push(draggedNoteId);
          }

          // 2. Update note with status property, parentId, parentType, and pageType
          const updatedNote: Block = {
            ...draggedBlock,
            parentId: normalizedDsId,
            parentType: "collection",
            value: {
              ...draggedBlock.value,
              pageType: "Viewdatabase_Note",
              databaseProperties: {
                ...(draggedBlock.value.databaseProperties || {}),
                [statusPropId]: newStatusValue,
              },
            },
          };

          // 3. Optimistic update - add to board columns
          setColumns((prevCols) => {
            return prevCols.map((col) => {
              if (col.id === effectiveHoverTarget.columnId) {
                const newCards = [...col.cards];
                if (effectiveHoverTarget.noteId) {
                  const idx = newCards.findIndex((c) => c._id === effectiveHoverTarget.noteId);
                  if (idx !== -1) {
                    const insertIdx = effectiveHoverTarget.position === "above" ? idx : idx + 1;
                    newCards.splice(insertIdx, 0, updatedNote);
                  } else {
                    newCards.push(updatedNote);
                  }
                } else {
                  newCards.push(updatedNote);
                }
                return { ...col, cards: newCards, count: newCards.length };
              }
              return col;
            });
          });

          // Update datasource blockIds
          updateDataSource(normalizedDsId, { blockIds: newBlockIds });

          // Update block in global context
          upsertBlocks([updatedNote]);

          // 4. Optimistic update - remove from editor parent's blockIds
          if (sourceParentBlock) {
            const updatedSourceParent: Block = {
              ...sourceParentBlock,
              blockIds: newSourceBlockIds
            };
            upsertBlocks([updatedSourceParent]);
          }

          setHoverTarget(null);
          // Clear drag state after successful drop
          clearDragState();

          // 5. Call API to update parent (remove from editor)
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
              parentId: normalizedDsId,
              parentType: 'collection',
              pageType: "Viewdatabase_Note"
            },
          });

          // 6. Call API to set status property
          const statusUpdateResponse = await postWithAuth('/api/database/updatePropertyValue', {
            dataSourceId: normalizedDsId,
            blockId: draggedNoteId,
            propertyId: statusPropId,
            value: newStatusValue,
            workspaceName: currentWorkspace?.name || "",
          });

          if (!parentUpdateResponse.success || !statusUpdateResponse.success) {
            throw new Error("Failed to complete editor → board drop");
          }

          console.log("✅ Editor → board drop successful");
          toast.success("Note moved to board");

          // Dispatch event to remove from editor content
          const event = new CustomEvent("remove-page-block-from-editor", {
            detail: { pageId: draggedNoteId, sourceParentId: sourceParentId }
          });
          window.dispatchEvent(event);


        } catch (error) {
          console.error("Failed to move note from editor to board:", error);
          toast.error("Failed to move note to board");

          // Rollback optimistic updates
          //   updateDataSource(normalizedDsId, { blockIds: previousDatasourceBlockIds });
          //   setColumns(previousColumns);

          //   // Restore editor parent's blockIds
          //   if (sourceParentBlock) {
          //     const restoredSourceParent: Block = {
          //       ...sourceParentBlock,
          //       blockIds: previousSourceBlockIds
          //     };
          //     upsertBlocks([restoredSourceParent]);
          //   }

          //   // Restore the dragged block to original state
          //   upsertBlocks([draggedBlock]);
          // }
          clearDragState();
          setHoverTarget(null);
          return;
        }
      }
    }

    console.log("Printing the handleNoteDrop ++ 2", dragNoteInfo, dragSource, effectiveHoverTarget);
    // Handle board-to-board OR calendar-to-board drops
    if (!dragNoteInfo || !effectiveHoverTarget || (dragSource !== "board" && dragSource !== "calendar")) {
      clearDragState();
      setHoverTarget(null);
      return;
    }

    console.log("Reorder Note ++ 1", dragNoteInfo, effectiveHoverTarget);

    let draggedNote: Block | undefined = columns
      .find((col) => col.id === dragNoteInfo.columnId)
      ?.cards.find((card) => card._id === dragNoteInfo.noteId);

    // If dragging from calendar, the note won't be in columns
    // We need to fetch it from global blocks
    if (dragSource === "calendar" && !draggedNote) {
      draggedNote = getBlock(dragNoteInfo.noteId);
    }

    let isCrossBoardMove = false;
    let sourceDatasourceId = "";

    // Check if the note is coming from other board or datasource
    if (!draggedNote) {
      const block = getBlock(dragNoteInfo.noteId);
      if (block) {
        draggedNote = block;
        sourceDatasourceId = block.parentId || "";
        isCrossBoardMove = true;
      }
    } else {
      sourceDatasourceId = draggedNote.parentId || "";
    }

    const targetColumn = columns.find((col) => col.id === effectiveHoverTarget.columnId);

    console.log("Reorder Note ++ 2", draggedNote, targetColumn, { isCrossBoardMove });

    if (!draggedNote || !targetColumn) {
      clearDragState();
      setHoverTarget(null);
      return;
    }

    // Get target dataSourceId from current view
    const currentViewData = currentView[board._id];
    let view;
    if (currentViewData?.id) {
      view = board.value.viewsTypes?.find((vt) => vt._id === currentViewData.id);
    } else if (currentViewData?.type) {
      view = board.value.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
    }
    const targetDatasourceId = view?.databaseSourceId ? String(view.databaseSourceId) : null;

    if (!targetDatasourceId) {
      console.error("Target data source not found");
      clearDragState();
      setHoverTarget(null);
      return;
    }

    // If it's a cross-board move, verify the source datasource exists
    if (isCrossBoardMove && sourceDatasourceId) {
      const sourceDs = dataSources[sourceDatasourceId];
      if (!sourceDs || !sourceDs.blockIds?.includes(draggedNote._id)) {
        // Fallback or error if datasource sync is inconsistent
        console.warn("Source datasource sync inconsistent", { sourceDatasourceId, noteId: draggedNote._id });
      }
    }

    // --- Perform Optimistic Updates ---

    // Store previous states for rollback
    const previousColumns = columns;
    const previousSourceBlockIds = sourceDatasourceId ? [...(dataSources[sourceDatasourceId]?.blockIds || [])] : [];
    const previousTargetBlockIds = [...(dataSources[targetDatasourceId]?.blockIds || [])];
    const previousNote = { ...draggedNote };

    // Use optionValue if available (handles Person objects and Unassigned empty strings), fallback to optionName
    const newStatusValue = targetColumn.optionValue !== undefined
      ? targetColumn.optionValue
      : (targetColumn.optionName === "Unassigned" ? "" : targetColumn.optionName);

    try {
      // 1. Update Columns (UI)
      setColumns((prev) => {
        const newCols = prev.map(c => ({ ...c, cards: [...c.cards] }));

        // Remove from old column (if it exists in current board)
        const sourceCol = newCols.find(c => c.id === dragNoteInfo.columnId);
        if (sourceCol) {
          sourceCol.cards = sourceCol.cards.filter(card => card._id !== draggedNote!._id);
          sourceCol.count = sourceCol.cards.length;
        }

        // Add to new column
        const destCol = newCols.find(c => c.id === effectiveHoverTarget.columnId);
        if (destCol) {
          const optimisticNote: Block = {
            ...draggedNote,
            parentId: targetDatasourceId,
            value: {
              ...draggedNote.value,
              databaseProperties: {
                ...draggedNote.value.databaseProperties,
                [targetColumn.propId]: newStatusValue
              }
            }
          };

          if (effectiveHoverTarget.noteId) {
            const idx = destCol.cards.findIndex(c => c._id === effectiveHoverTarget.noteId);
            const insertAt = effectiveHoverTarget.position === "above" ? idx : idx + 1;
            destCol.cards.splice(insertAt === -1 ? destCol.cards.length : insertAt, 0, optimisticNote);
          } else {
            destCol.cards.push(optimisticNote);
          }
          destCol.count = destCol.cards.length;
        }
        return newCols;
      });

      // 2. Update Datasources (Context)
      let newTargetBlockIds = [...previousTargetBlockIds];
      // If moving within the same datasource, remove the node first to avoid duplication during reorder
      if (sourceDatasourceId === targetDatasourceId) {
        newTargetBlockIds = newTargetBlockIds.filter(id => id !== draggedNote!._id);
      }

      // Insert into target blockIds
      const targetInsertNoteId = effectiveHoverTarget!.noteId;
      if (targetInsertNoteId) {
        const idx = newTargetBlockIds.indexOf(targetInsertNoteId);
        const insertAt = effectiveHoverTarget!.position === "above" ? idx : idx + 1;
        newTargetBlockIds.splice(insertAt === -1 ? newTargetBlockIds.length : insertAt, 0, draggedNote!._id);
      } else {
        newTargetBlockIds.push(draggedNote!._id);
      }

      // If cross-datasource, remove from source
      if (sourceDatasourceId && sourceDatasourceId !== targetDatasourceId) {
        const newSourceBlockIds = previousSourceBlockIds.filter(id => id !== draggedNote!._id);
        updateDataSource(sourceDatasourceId, { blockIds: newSourceBlockIds });
      }

      updateDataSource(targetDatasourceId, { blockIds: newTargetBlockIds });

      // 3. Update Note Block (Global Context)
      const updatedNote: Block = {
        ...draggedNote!,
        parentId: targetDatasourceId,
        value: {
          ...draggedNote!.value,
          databaseProperties: {
            ...draggedNote!.value.databaseProperties,
            [targetColumn!.propId]: newStatusValue
          }
        }
      };
      upsertBlocks([updatedNote]);

      // --- API Calls ---

      const dragAndDropPayload: any = {
        dragAndDropinputfieldArray: [],
        updatedBlockInfo: {
          blockId: draggedNote!._id,
          parentId: targetDatasourceId,
          parentType: 'collection',
          pageType: "Viewdatabase_Note"
        }
      };

      // If moved across datasources, we need to send the updated source list too
      if (sourceDatasourceId && sourceDatasourceId !== targetDatasourceId) {
        const sourceDs = dataSources[sourceDatasourceId];
        if (sourceDs && sourceDs.blockIds) {
          dragAndDropPayload.dragAndDropinputfieldArray.push({
            parentId: sourceDatasourceId,
            blockIdArray: previousSourceBlockIds.filter(id => id !== draggedNote!._id),
            workspaceId: currentWorkspace?._id,
            typeofChild: "page"
          });
        }
      }

      dragAndDropPayload.dragAndDropinputfieldArray.push({
        parentId: targetDatasourceId,
        blockIdArray: newTargetBlockIds,
        workspaceId: currentWorkspace?._id,
        typeofChild: "page"
      });

      const reorderRes = await postWithAuth('/api/note/block/drag-and-drop', dragAndDropPayload);

      if (!reorderRes.success) {
        throw new Error("Reorder API call failed during move");
      }

      const propRes = await postWithAuth('/api/database/updatePropertyValue', {
        dataSourceId: targetDatasourceId,
        blockId: draggedNote!._id,
        propertyId: targetColumn!.propId,
        value: newStatusValue,
        workspaceName: currentWorkspace?.name || ""
      });

      if (!propRes.success) {
        throw new Error("Property update API call failed during move");
      }

      console.log("✅ Move successful");
      clearDragState();
      setHoverTarget(null);

    } catch (err) {
      console.error("Move failed:", err);
      toast.error("Failed to move note");
      // Rollback
      setColumns(previousColumns);
      if (sourceDatasourceId) updateDataSource(sourceDatasourceId, { blockIds: previousSourceBlockIds });
      updateDataSource(targetDatasourceId, { blockIds: previousTargetBlockIds });
      upsertBlocks([previousNote as Block]);
      clearDragState();
      setHoverTarget(null);
    }
  };

  const handleColumnDragOver = (targetColumnId: string) => {
    // Allow hover target to be set even without dragNoteInfo (for sidebar → board drags)
    // Only set if we don't already have a specific card target
    if (!hoverTarget?.noteId) {
      setHoverTarget({ columnId: targetColumnId });
    }
  };

  const handleColumnDragLeave = () => {
    // Clear hoverTarget when leaving column (but only if it's a column-level target, not card-level)
    if (hoverTarget && !hoverTarget.noteId) {
      setHoverTarget(null);
    }
  };

  return { handleNoteDragStart, handleNoteDragOver, handleNoteDragLeave, handleNoteDrop, handleColumnDragOver, handleColumnDragLeave, hoverTarget };
};
