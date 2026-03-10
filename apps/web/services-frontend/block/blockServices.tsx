import { postWithAuth, deleteWithAuth } from "@/lib/api-helpers";
import type {
  BlockChangesPayload,
  CreateBlockPayload,
  CreateBlocksParams,
  UpdateBlockPayload,
  DeleteBlockPayload,
  MoveBlocksPayload,
  ParentTable,
  PageType,
} from "@/types/block";

export interface GlobalBlocksContext {
  addBlock: (block: any) => void;
  updateBlock: (blockId: string, updates: any) => void;
  removeBlock: (blockId: string) => void;
  upsertBlocks: (blocks: any[]) => Promise<void>;
  getBlock: (blockId: string) => any;
}

//
// 1) Low-level APIs – one endpoint per operation
//

export async function createBlocks(
  params: CreateBlocksParams
) {
  if (!params.blocks.length) return;

  // Transform blocks to backend format (keep content as-is, just rename fields)
  const transformedBlocks = params.blocks.map(block => ({
    _id: block.blockId,
    blockType: 'content' as const, // Default to content type
    value: block.content, // Pass ProseMirror JSON as-is
    insertAfterBlockID: block.previousBlockId,
  }));

  return postWithAuth("/api/note/block/batch-create", {
    parentId: params.parentId,
    workspaceId: params.workspaceId,
    workareaId: params.workareaId || null,
    blocks: transformedBlocks,
    parentTable: params.parentTable,
  });
}

export async function updateBlocks(
  parentId: string,
  workspaceId: string,
  blocks: UpdateBlockPayload[],
) {
  if (!blocks.length) return;

  // Transform blocks to backend format
  const transformedBlocks = blocks.map(block => ({
    _id: block.blockId,
    content: block.data, // Backend uses 'content' field for updates
  }));

  return postWithAuth("/api/note/block/batch-update", {
    parentId,
    workspaceId,
    blocks: transformedBlocks,
  });
}

// New function to handle updates with individual parent IDs
async function updateBlocksWithParents(
  workspaceId: string,
  blocks: Array<UpdateBlockPayload & { parentId: string; parentTable: string }>
) {
  if (!blocks.length) return;

  // Group blocks by their parent for efficient API calls
  const groupedByParent = new Map<string, typeof blocks>();

  blocks.forEach(block => {
    const key = block.parentId;
    if (!groupedByParent.has(key)) {
      groupedByParent.set(key, []);
    }
    groupedByParent.get(key)!.push(block);
  });

  // Send updates grouped by parent
  const promises = Array.from(groupedByParent.entries()).map(([parentId, parentBlocks]) => {
    const transformedBlocks = parentBlocks.map(block => ({
      _id: block.blockId,
      content: block.data,
    }));

    return postWithAuth("/api/note/block/batch-update", {
      parentId,
      workspaceId,
      blocks: transformedBlocks,
    });
  });

  return Promise.all(promises);
}

// Debounce state for updateBlocks
let updateTimer: NodeJS.Timeout | null = null;
const pendingUpdates = new Map<string, UpdateBlockPayload>();
let pendingFlag: boolean = false;
let globalBlocksRef: GlobalBlocksContext | undefined;

function debouncedUpdateBlocks(
  parentId: string,
  workspaceId: string,
  blocks: UpdateBlockPayload[],
  globalBlocks?: GlobalBlocksContext
): void {
  if (globalBlocks) {
    globalBlocksRef = globalBlocks;
  }

  // accumulate updates (last write wins)
  blocks.forEach(block => {
    pendingUpdates.set(block.blockId, block);
  });

  pendingFlag = true;

  // reset debounce timer
  if (updateTimer) clearTimeout(updateTimer);

  updateTimer = setTimeout(() => {

    if (!pendingFlag) return;

    if (pendingUpdates.size === 0) return;

    const finalUpdates = Array.from(pendingUpdates.values()).filter(u => {
      // Check if block still exists in context
      if (globalBlocksRef) {
        const block = globalBlocksRef.getBlock(u.blockId);
        // If block is not found, it means it was pdeleted locally.
        // We should NOT send an update for it, as that would "resurrect" it.
        if (!block) {
          return false;
        }
      }
      return true;
    });

    // Update Context immediately before API call
    if (globalBlocksRef) {
      console.log('[BlockService] Updating context with debounced blocks:', finalUpdates.length);
      finalUpdates.forEach(u => {
        globalBlocksRef!.updateBlock(u.blockId, { value: u.data });
      });
    }

    // Get parentId for each block from context (for nested blocks)
    const blocksWithParent = finalUpdates.map(u => {
      const block = globalBlocksRef?.getBlock(u.blockId);
      return {
        ...u,
        parentId: block?.parentId || parentId,
        parentTable: block?.parentType || 'page'
      };
    });

    // flush through queue so ordering stays intact
    blockSyncQueue = blockSyncQueue
      .then(() => updateBlocksWithParents(workspaceId, blocksWithParent))
      .catch((err) => console.error("Block update sync error:", err));

    // clear state
    pendingUpdates.clear();
    pendingFlag = false;

  }, 2000);
}

export async function deleteBlocks(
  noteId: string,
  blocks: DeleteBlockPayload[],
  workspaceId: string,
  parentId: string | null,
) {
  if (!blocks.length) return;

  // Use the single block delete API for each block
  const promises = blocks.map((block) =>
    deleteWithAuth("/api/note/block/delete/permanent-delete", {
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blockId: block.blockId,
        workspaceId,
      }),
    })
  );

  return Promise.all(promises);
}

export async function moveBlocks(
  parentId: string,
  workspaceId: string,
  move: MoveBlocksPayload | null,
  globalBlocks?: GlobalBlocksContext,
) {
  if (!move || !move.blockIdArray.length) return;

  // Dynamically determine all required properties based on context
  let typeofChild: "public" | "private" | "workarea" = "private";
  let parentType: ParentTable = "page";
  let pageType: PageType = "private";

  if (globalBlocks && parentId) {
    const parentBlock = globalBlocks.getBlock(parentId);

    if (parentBlock) {
      const parentValue = parentBlock.value as any;

      // Case 1: Parent is the workspace itself (root level)
      if (parentId === workspaceId) {
        parentType = "workspace";
        // Determine public vs private
        if (parentValue?.pageType === "public") {
          typeofChild = "public";
          pageType = "public";
        } else {
          typeofChild = "private";
          pageType = "private";
        }
      }
      // Case 2: Parent is a work area
      else if (parentBlock.parentType === "workarea" || parentBlock?.workAreaId) {
        parentType = "workarea";
        typeofChild = "workarea";
        pageType = "workarea"; // Work areas have their own pageType
      }
      // Case 3: Parent is a page or collection_view (top-level page)
      else if (parentBlock.blockType === "page" || parentBlock.blockType === "collection_view") {
        parentType = "page";

        // Determine page type (public, private, shared, restricted)
        if (parentValue?.pageType === "public") {
          typeofChild = "public";
          pageType = "public";
        } else if (parentValue?.pageType === "shared") {
          // Shared pages - API may default to private if not explicitly supported
          typeofChild = "private";
          pageType = "private";
        } else if (parentValue?.pageType === "restricted") {
          typeofChild = "private";
          pageType = "private";
        } else if (parentValue?.pageType === "workarea") {
          typeofChild = "workarea";
          pageType = "workarea";
        } else {
          // Default to private
          typeofChild = "private";
          pageType = "private";
        }
      }
      // Case 4: Parent is a nested block (column, list, callout, etc.)
      else if (parentBlock.blockType === "content") {
        parentType = "block";

        // For nested blocks, inherit page type from root page
        const rootPage = findRootPage(parentId, globalBlocks);
        if (rootPage) {
          const rootValue = rootPage.value as any;

          if (rootValue?.pageType === "public") {
            typeofChild = "public";
            pageType = "public";
          } else if (rootValue?.pageType === "shared" || rootValue?.pageType === "restricted") {
            // Shared/restricted pages default to private for nested content
            typeofChild = "private";
            pageType = "private";
          } else {
            typeofChild = "private";
            pageType = "private";
          }
        }
      }
    }
  }

  // Determine the representative block for updatedBlockInfo
  // For simple reordering, the first block is typically the one being repositioned
  const primaryBlockId = move.blockIdArray[0];

  return postWithAuth("/api/note/block/drag-and-drop", {
    dragAndDropinputfieldArray: [
      {
        parentId,
        workspaceId,
        blockIdArray: move.blockIdArray,
        typeofChild,
      },
    ],
    updatedBlockInfo: {
      blockId: primaryBlockId,
      parentType,
      parentId,
      pageType,
    }
  });
}

/**
 * Helper function to find the root page of a nested block
 * Walks up the parent chain until it finds a page-level block
 *
 * @param blockId - The ID of the block to start searching from
 * @param globalBlocks - The global blocks context
 * @returns The root page block, or null if not found
 */
function findRootPage(blockId: string, globalBlocks: GlobalBlocksContext): any {
  let currentBlock = globalBlocks.getBlock(blockId);
  const visited = new Set<string>(); // Prevent infinite loops
  const maxDepth = 50; // Safety limit to prevent infinite recursion
  let depth = 0;

  while (currentBlock && !visited.has(currentBlock._id) && depth < maxDepth) {
    visited.add(currentBlock._id);
    depth++;

    // Found a page or collection_view - this is the root
    if (currentBlock.blockType === "page" || currentBlock.blockType === "collection_view") {
      return currentBlock;
    }

    // Hit workspace or workarea - we've gone too far up
    if (currentBlock.parentType === "workspace" || currentBlock.parentType === "workarea") {
      return null;
    }

    // Move up to the parent
    if (currentBlock.parentId) {
      currentBlock = globalBlocks.getBlock(currentBlock.parentId);
    } else {
      // No parent - we're at the top
      break;
    }
  }

  return null;
}

/**
 * Handle reparenting: when a block moves from one parent to another
 * Updates old parent's blockIds, new parent's blockIds, and the block's parentId/parentType
 */
async function handleReparenting(
  reparentedMoves: Array<{
    blockId: string;
    oldParentId: string | null;
    newParentId: string | null;
    oldParentBlockIds: string[];
    newParentBlockIds: string[];
  }>,
  noteId: string,
  workspaceId: string,
  globalBlocks?: GlobalBlocksContext,
) {
  if (!reparentedMoves.length) return;

  const parentUpdates = new Map<string, {
    parentId: string;
    workspaceId: string;
    blockIdArray: string[];
    typeofChild: "public" | "private" | "workarea";
  }>();

  const blockUpdates: Array<{
    blockId: string;
    newParentId: string | null;
    newParentType: ParentTable;
    pageType: PageType;
  }> = [];

  for (const move of reparentedMoves) {
    const effectiveNewParentId = move.newParentId || noteId;

    // Determine the new parent type and page type
    let newParentType: ParentTable = "page";
    let pageType: PageType = "private";

    if (globalBlocks) {
      const newParent = globalBlocks.getBlock(effectiveNewParentId);
      if (newParent) {
        const parentValue = newParent.value as any;

        // Determine parent type
        if (effectiveNewParentId === workspaceId) {
          newParentType = "workspace";
        } else if (newParent.parentType === "workarea" || parentValue?.workAreaId) {
          newParentType = "workarea";
        } else if (newParent.blockType === "page" || newParent.blockType === "collection_view") {
          newParentType = "page";
        } else if (newParent.blockType === "content") {
          newParentType = "block";
        }

        // Determine page type
        if (newParentType === "workarea") {
          pageType = "workarea";
        } else if (parentValue?.pageType === "public") {
          pageType = "public";
        } else if (newParentType === "block") {
          // For nested blocks, inherit from root page
          const rootPage = findRootPage(effectiveNewParentId, globalBlocks);
          if (rootPage?.value?.pageType === "public") {
            pageType = "public";
          }
        }
      }
    } else {
      // Fallback when no globalBlocks
      newParentType = move.newParentId === null || move.newParentId === noteId ? "page" : "block";
    }

    blockUpdates.push({
      blockId: move.blockId,
      newParentId: move.newParentId,
      newParentType,
      pageType,
    });

    const effectiveOldParentId = move.oldParentId || noteId;

    // Determine typeofChild for parents (for dragAndDropinputfieldArray)
    const getTypeofChild = (parentId: string): "public" | "private" | "workarea" => {
      if (globalBlocks) {
        const parent = globalBlocks.getBlock(parentId);
        if (parent) {
          const parentValue = parent.value as any;

          // Check for workarea
          if (parent.parentType === "workarea" || parentValue?.workAreaId) {
            return "workarea";
          }

          // Check for public
          if (parentValue?.pageType === "public") {
            return "public";
          }
        }
      }
      return "private";
    };

    parentUpdates.set(effectiveOldParentId, {
      parentId: effectiveOldParentId,
      workspaceId,
      blockIdArray: move.oldParentBlockIds,
      typeofChild: getTypeofChild(effectiveOldParentId),
    });

    parentUpdates.set(effectiveNewParentId, {
      parentId: effectiveNewParentId,
      workspaceId,
      blockIdArray: move.newParentBlockIds,
      typeofChild: getTypeofChild(effectiveNewParentId),
    });

    // Optimistic updates
    if (globalBlocks) {
      const oldParent = globalBlocks.getBlock(effectiveOldParentId);
      if (oldParent) {
        globalBlocks.updateBlock(effectiveOldParentId, { blockIds: move.oldParentBlockIds });
      }
      const newParent = globalBlocks.getBlock(effectiveNewParentId);
      if (newParent) {
        globalBlocks.updateBlock(effectiveNewParentId, { blockIds: move.newParentBlockIds });
      }
      const movedBlock = globalBlocks.getBlock(move.blockId);
      if (movedBlock) {
        globalBlocks.updateBlock(move.blockId, {
          parentId: effectiveNewParentId,
          parentType: newParentType,
        });
      }
    }
  }

  // Group block updates by blockId to avoid duplicates
  const uniqueBlockUpdates = new Map<string, typeof blockUpdates[0]>();
  blockUpdates.forEach(update => {
    uniqueBlockUpdates.set(update.blockId, update);
  });

  // Send API calls
  for (const blockUpdate of uniqueBlockUpdates.values()) {
    try {
      await postWithAuth("/api/note/block/drag-and-drop", {
        dragAndDropinputfieldArray: Array.from(parentUpdates.values()),
        updatedBlockInfo: {
          blockId: blockUpdate.blockId,
          parentId: blockUpdate.newParentId || noteId,
          parentType: blockUpdate.newParentType,
          pageType: blockUpdate.pageType,
        },
      });
    } catch (error) {
      console.error(`Failed to reparent block ${blockUpdate.blockId}:`, error);
    }
  }
}

//

async function sendBlockChangesInternal(
  payload: BlockChangesPayload & {
    nestedMoves?: Array<{ parentId: string; blockIdArray: string[] }>;
    reparentedMoves?: Array<{
      blockId: string;
      oldParentId: string | null;
      newParentId: string | null;
      oldParentBlockIds: string[];
      newParentBlockIds: string[];
    }>;
  },
  globalBlocks?: GlobalBlocksContext
) {
  const { creates, updates, deletes, move, nestedMoves, reparentedMoves, noteId, workspaceId, parentId } = payload;
  const parentTable = 'page';

  try {
    // 1. CREATE blocks
    if (creates.length) {
      // Filter out page references that point to existing pages
      // Page references should not be created as separate blocks
      console.log("Create Array , ", creates);
      const filteredCreates = creates.filter(c => {
        const content = c.content as any;

        // Check if this is a page reference node
        if (content?.type === "page") {
          const href = content?.attrs?.href;

          // Extract the page ID from href
          if (href && href.startsWith('/notes/')) {
            const referencedPageId = href.replace('/notes/', '');

            // If the referenced page exists, this is just a reference
            // Don't create a block for it - it's inline content
            if (globalBlocks) {
              const existingPage = globalBlocks.getBlock(referencedPageId);

              // If the referenced page exists as a real page, skip this create
              if (existingPage && existingPage.blockType === 'page') {
                console.log(`[BlockService] Skipping page reference create for ${c.blockId} (references existing page ${referencedPageId})`);
                return false;
              }
            }
          }
        }

        return true;
      });

      // If all creates were filtered out, skip this section
      if (filteredCreates.length === 0) {
        console.log("[BlockService] All creates were page references, skipping create step");
      } else {
        // Optimistic Context Update (SYNCHRONOUS for creates to prevent race conditions)
        // CRITICAL: Use addBlock (synchronous) instead of upsertBlocks (async) to ensure
        // blocks are immediately available in context before callbacks update parent's blockIds
        if (globalBlocks) {
          // Local cache to store new blocks before adding them to context
          // This allows us to link parent-child relationships in memory before committing to state
          const createdBlocksMap = new Map<string, any>();

          // Pass 1: Create block objects and handle cleanup
          filteredCreates.forEach(c => {
            const effectiveParentId = (c as any).parentBlockId || noteId;
            const effectiveParentTable = effectiveParentId === noteId ? parentTable : 'block';

            const newBlock = {
              _id: c.blockId,
              blockType: 'content',
              workspaceId,
              parentId: effectiveParentId,
              parentType: effectiveParentTable,
              value: c.content,
              status: 'alive',
              blockIds: []
            };

            // SAFETY CHECK: Handle reparenting during create (edge case)
            // If this block ID accidentally already exists under a different parent (e.g. from a past failed sync),
            // we must remove it from the old parent's list first.
            const existingBlock = globalBlocks.getBlock(c.blockId);
            if (existingBlock && existingBlock.parentId && existingBlock.parentId !== effectiveParentId) {
              const oldParent = globalBlocks.getBlock(existingBlock.parentId);
              if (oldParent && oldParent.blockIds) {
                const updatedOldParentBlockIds = oldParent.blockIds.filter(id => id !== c.blockId);
                globalBlocks.updateBlock(existingBlock.parentId, { blockIds: updatedOldParentBlockIds });
              }
            }

            // Store in local map - do NOT add to context yet
            createdBlocksMap.set(c.blockId, newBlock);
          });

          // Pass 2: Link children to parents (update blockIds)
          const modifiedParentBlockIds = new Map<string, string[]>();

          filteredCreates.forEach(c => {
            const effectiveParentId = (c as any).parentBlockId || noteId;

            // Update parent's blockIds (works for both nested blocks and root page)
            // We use the batched map 'modifiedParentBlockIds' to prevent race conditions
            {

              // Try to find parent in our new batch first, then global context
              const parentBlock = createdBlocksMap.get(effectiveParentId);
              const isParentNew = !!parentBlock;
              let currentBlockIds: string[] = [];

              if (isParentNew) {
                // If parent is new, we operate directly on the object which updates for subsequent iterations
                currentBlockIds = [...(parentBlock.blockIds || [])];
              } else {
                // If parent is existing, check our local modified map first
                if (modifiedParentBlockIds.has(effectiveParentId)) {
                  currentBlockIds = [...modifiedParentBlockIds.get(effectiveParentId)!];
                } else {
                  const existingParent = globalBlocks.getBlock(effectiveParentId);
                  if (existingParent) {
                    currentBlockIds = [...(existingParent.blockIds || [])];
                  } else {
                    // Parent not found, skip
                    return;
                  }
                }
              }

              // Remove if exists
              let newBlockIds = currentBlockIds.filter(id => id !== c.blockId);

              // Insert at correct position
              if (!c.previousBlockId) {
                newBlockIds.unshift(c.blockId);
              } else {
                const idx = newBlockIds.indexOf(c.previousBlockId);
                if (idx !== -1) {
                  newBlockIds.splice(idx + 1, 0, c.blockId);
                } else {
                  // Fallback to end
                  newBlockIds.push(c.blockId);
                }
              }

              // Apply update
              if (isParentNew) {
                // Direct mutation of the object in our local map
                parentBlock.blockIds = newBlockIds;
              } else {
                // Existing parent: update via context
                modifiedParentBlockIds.set(effectiveParentId, newBlockIds);
              }
            }
          });

          // Apply batched updates to existing parents
          modifiedParentBlockIds.forEach((ids, pid) => {
            globalBlocks.updateBlock(pid, { blockIds: ids });
          });

          // Pass 3: Add all new blocks to context (now correctly linked)
          createdBlocksMap.forEach(block => {
            globalBlocks.addBlock(block);
          });
        }

        // Group by parentId to handle nested creations
        const groupedByParent = new Map<string | null, CreateBlockPayload[]>();

        for (const block of filteredCreates) {
          const blockParentId = (block as any).parentBlockId || null;
          if (!groupedByParent.has(blockParentId)) {
            groupedByParent.set(blockParentId, []);
          }
          groupedByParent.get(blockParentId)!.push(block);
        }

        // Process creation within layers to ensure parents exist before children
        const processCreationLayers = async () => {
          const newBlockIds = new Set(filteredCreates.map(c => c.blockId));
          let currentLayerIds: (string | null)[] = [];

          // 1. Start with Top Level (null) and Existing Parents
          if (groupedByParent.has(null)) currentLayerIds.push(null);

          for (const pid of groupedByParent.keys()) {
            if (pid !== null && !newBlockIds.has(pid)) {
              currentLayerIds.push(pid);
            }
          }

          while (currentLayerIds.length > 0) {
            const nextLayerIds: string[] = [];


            for (const pid of currentLayerIds) {
              const blocks = groupedByParent.get(pid);
              if (!blocks) continue;

              const isTopLevel = pid === null;
              const targetParentId = isTopLevel ? (parentId || noteId) : pid!;
              // Use 'content' for nested blocks to match recent fixes
              const targetTable = isTopLevel ? parentTable : 'block';

              // Resolve workareaId
              const pBlock = globalBlocks?.getBlock(targetParentId);
              const waId = pBlock?.workareaId || null;

              try {
                await createBlocks({
                  parentId: targetParentId,
                  workspaceId,
                  workareaId: waId,
                  blocks,
                  parentTable: targetTable
                });
                // Success: Add children that are parents to the next layer
                blocks.forEach(b => {
                  if (groupedByParent.has(b.blockId)) nextLayerIds.push(b.blockId);
                });
              } catch (err) {
                console.error('Create blocks sequence error:', err);
              }

              // Remove executed group to avoid reprocessing
              groupedByParent.delete(pid);
            }


            currentLayerIds = nextLayerIds;
          }

          // Handle any remaining orphans (safeguard)
          if (groupedByParent.size > 0) {
            console.warn('[BlockService] Orphaned creation groups found:', Array.from(groupedByParent.keys()));
            for (const [pid, blocks] of groupedByParent.entries()) {
              const pBlock = globalBlocks?.getBlock(pid!);
              createBlocks({
                parentId: pid!,
                workspaceId,
                workareaId: pBlock?.workareaId,
                blocks,
                parentTable: 'block'
              }).catch(e => console.error('Orphan create error', e));
            }
          }
        };

        // Execute the sequence
        await processCreationLayers();
      }
    }

    // 2. UPDATE existing blocks
    if (updates.length) {
      // Pass globalBlocks to debounced function, do NOT update immediately
      debouncedUpdateBlocks(parentId || noteId, workspaceId, updates, globalBlocks);
    }

    // 3. DELETE blocks
    if (deletes.length) {
      // Optimistic Context Update (Immediate for deletes)
      if (globalBlocks) {
        deletes.forEach(d => {
          globalBlocks.removeBlock(d.blockId);
        });
      }

      // Send delete request to API
      deleteBlocks(noteId, deletes, workspaceId, parentId || null)
        .catch(err => console.error("Delete blocks error:", err));
    }

    // 4. MOVE: final order of remaining blocks
    // 4a. Top-level move (parent page's blockIds)
    if (move && move.blockIdArray.length) {
      // Optimistic Context Update (Immediate for moves)
      // if (globalBlocks) {
      //    // Update the parent's blockIds. 
      //    // We assume the parent is the note/page for now.
      //    globalBlocks.updateBlock(parentId || noteId, { blockIds: move.blockIdArray });
      // }
      await moveBlocks(parentId || noteId, workspaceId, move, globalBlocks);
    }

    // 4b. Handle reparenting (blocks moving between parents)
    if (reparentedMoves && reparentedMoves.length > 0) {
      await handleReparenting(reparentedMoves, noteId, workspaceId, globalBlocks);
    }

    // 4c. Nested block moves (blocks within their parent containers, no parent change)
    if (nestedMoves && nestedMoves.length > 0) {
      for (const nestedMove of nestedMoves) {
        await moveBlocks(
          nestedMove.parentId,
          workspaceId,
          { blockIdArray: nestedMove.blockIdArray },
          globalBlocks
        );
      }
    }
  } catch (err) {
    console.error("Failed to sync blocks:", err);
  }
}

//
// 3) Optional: queue to preserve order across multiple editor transactions
//

let blockSyncQueue: Promise<unknown> = Promise.resolve();

/**
 * Public function used by the extension.
 * It enqueues each payload so they run strictly in sequence.
 */
export function sendBlockChanges(payload: BlockChangesPayload, globalBlocks?: GlobalBlocksContext) {
  blockSyncQueue = blockSyncQueue
    .then(() => sendBlockChangesInternal(payload, globalBlocks))
    .catch((err) => {
      console.error("Block sync error:", err);
    });

  return blockSyncQueue;
}
