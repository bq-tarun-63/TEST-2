import React from "react";
import {
  AIHighlight,
  CharacterCount,
  CodeBlockLowlight,
  Color,
  CustomKeymap,
  HighlightExtension,
  HorizontalRule,
  Mathematics,
  Placeholder,
  StarterKit,
  TaskItem,
  TaskList,
  TextStyle,
  TiptapImage,
  TiptapLink,
  TiptapUnderline,
  Embed,
  Twitter,
  UpdatedImage,
  UploadImagesPlugin,
  Youtube,
} from "novel";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { ReactNodeViewRenderer } from "@tiptap/react"
import {
  AnyExtension,
  Node,
  mergeAttributes,
  Mark,
  RawCommands,
  Extension,
  getChangedRanges,
  findChildrenInRange,
  combineTransactionSteps,
  type JSONContent,
} from "@tiptap/core";
import BoardBlock from "./selectors/boardBlock";
import { CmsBlockExtension } from "./cms-block";
import { CalloutExtension } from "./callout";
import { BookmarkExtension } from "./bookmark";
import { PageBlockExtension } from "./page-block";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { createRoot } from "react-dom/client";
import CommentBox from "./comment/commentBox";
import {
  MIN_COLUMN_PERCENT,
  applyColumnWidths,
  clampColumnCount,
  getDefaultColumnWidths,
  getGridTemplateFromWidths,
  normalizeColumnWidths,
  parseWidthsAttribute,
} from "./column-layout-utils";

import { ObjectId } from "bson";
import type {
  BlockChangesPayload,
  CreateBlockPayload,
  UpdateBlockPayload,
  DeleteBlockPayload,
  MoveBlocksPayload,
} from "@/types/block";
import { sendBlockChanges } from "@/services-frontend/block/blockServices";

import Mention from "@tiptap/extension-mention";
import MentionList, { MentionListRef } from "@/components/tailwind/mention-list"
import tippy, { type Instance, type Props } from "tippy.js"




import { Markdown as MarkdownExtension } from "tiptap-markdown";

import { cx } from "class-variance-authority";
import { common, createLowlight } from "lowlight";
import { postWithAuth, deleteWithAuth } from "@/lib/api-helpers";
import { boardDeletionGuardExtension } from "./plugins/boardDeletionGuard";
import { BlockContextMenuExtension } from "./block-context-menu/context-menu-extension";
import { CustomDragHandle } from "./extensions/custom-drag-handle";
import { TableOfContents, getHierarchicalIndexes } from "@tiptap/extension-table-of-contents";
import { TOCExtension } from "./table-of-contents";

// All node types which should get a blockId
const BLOCK_NODE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "listItem",
  "codeBlock",
  "horizontalRule",
  "taskList",
  "taskItem",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "columnLayout",
  "columnItem",
  "view_collection",
  "cmsBlock",
  "callout",
  "bookmark",
  "page",
  "image",
  "youtube",
  "twitter",
  "iframe",
  "embed",
  "toc",
];


type BlockOp = {
  id: string;
  pos: number;
  node: any;
};

type MoveOp = {
  id: string;
  fromPos: number;
  toPos: number;
};

/**
 * Get all blocks (including nested) in document order
 * Used for finding previous block IDs for nested blocks
 */
/**
 * Get all blocks (including nested) in document order
 * Used for finding previous block IDs for nested blocks
 */


/**
 * Get all blocks (including nested) in document order
 * Used for finding previous block IDs for nested blocks
 */

export function getOrderedBlocks(doc: any) {
  const blocks: { id: string; pos: number }[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.isBlock && BLOCK_NODE_TYPES.includes(node.type.name)) {
      const id = node.attrs.blockId as string | null;
      if (id) {
        blocks.push({ id, pos });
      }
    }
    return true;
  });

  return blocks;
}

/**
 * Get only top-level blocks (direct children of the doc, not nested inside other blocks)
 * This matches what the parent page's blockIds array should contain
 */
export function getTopLevelBlocks(doc: any): { id: string; pos: number }[] {
  const blocks: { id: string; pos: number }[] = [];

  doc.descendants((node: any, pos: number) => {
    const isTrackedBlock = node.isBlock && BLOCK_NODE_TYPES.includes(node.type.name);

    if (isTrackedBlock) {
      const id = node.attrs.blockId as string | null;
      if (id) {
        // Check if this is a top-level block (no parent block with blockId)
        const parentBlockId = findParentBlockId(doc, pos);
        if (parentBlockId === null) {
          // This is a top-level block
          blocks.push({ id, pos });
        }
      }
    }
    return true;
  });

  return blocks;
}

/**
 * Get blocks grouped by their parent block ID
 * Returns a map: parentId -> array of { id, pos } for blocks under that parent
 * parentId === null means top-level blocks
 */
export function getBlocksByParent(doc: any): Map<string | null, { id: string; pos: number }[]> {
  const blocksByParent = new Map<string | null, { id: string; pos: number }[]>();

  doc.descendants((node: any, pos: number) => {
    const isTrackedBlock = node.isBlock && BLOCK_NODE_TYPES.includes(node.type.name);

    if (isTrackedBlock) {
      const id = node.attrs.blockId as string | null;
      if (id) {
        const parentBlockId = findParentBlockId(doc, pos);

        if (!blocksByParent.has(parentBlockId)) {
          blocksByParent.set(parentBlockId, []);
        }
        blocksByParent.get(parentBlockId)!.push({ id, pos });
      }
    }
    return true;
  });

  return blocksByParent;
}

function findPreviousBlockId(
  orderedBlocks: { id: string; pos: number }[],
  blockId: string
): string | null {
  const index = orderedBlocks.findIndex((b) => b.id === blockId);
  if (index <= 0) return null;
  return orderedBlocks[index - 1]?.id ?? null;
}

/**
 * Find the parent block ID for a given position in the document.
 * Walks up the document tree to find the nearest parent block that has a blockId.
 * Returns null if the block is at the top level (no parent block).
 */
function findParentBlockId(doc: any, pos: number): string | null {
  try {
    const $pos = doc.resolve(pos);

    // Start from depth (parent of current node) and walk up
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);

      // Check if this node is a block type that can have a blockId
      if (node.isBlock && BLOCK_NODE_TYPES.includes(node.type.name)) {
        const parentBlockId = node.attrs.blockId as string | null;
        if (parentBlockId) {
          return parentBlockId;
        }
      }
    }

    return null; // No parent block found (top-level block)
  } catch (e) {
    console.error("Error finding parent block ID:", e);
    return null;
  }
}

/**
 * Serializes a block node for storage, stripping out nested blocks that have their own blockIds.
 * Nested blocks are stored separately and referenced via blockIds array.
 * 
 * @param node - The ProseMirror node to serialize
 * @returns JSONContent with nested blocks removed
 */
function serializeBlockForStorage(node: any): JSONContent {
  const json = node.toJSON();

  // Strip out any child blocks that have blockIds (they're stored separately)
  if (json.content && Array.isArray(json.content)) {
    json.content = json.content.filter((child: any) => {
      // Keep inline nodes and blocks without blockIds
      // Remove blocks with blockIds (they're in the blockIds array)
      return !child.attrs?.blockId || child.attrs.blockId === null;
    });
  }

  return json;
}


/**
 * 1. Adds blockId attribute to all block nodes in BLOCK_NODE_TYPES
 * 2. On every transaction, only looks at changed ranges and:
 *    - assigns blockId to new blocks
 *    - detects create / update / delete / move
 *
 * This uses internal PM helpers (combineTransactionSteps, getChangedRanges, findChildrenInRange),
 * so we’re as close as possible to the editor’s own idea of “what changed”.
 */

const BlockIdAndChangeTrackerExtension = Extension.create({
  name: "blockIdAndChangeTracker",
  priority: 1000,
  addOptions() {
    return {
      noteId: "",
      workspaceId: "",
      parentId: "",
      parentTable: "page" as "workSpace" | "block" | "collection" | "workArea" | "page",
      onBlocksChanged: null as null | ((changes: BlockChangesPayload) => void),
      readOnly: false,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_NODE_TYPES,
        attributes: {
          blockId: {
            default: null,
            // Important: keep ID on split so Enter keeps ID on original block,
            // and the new line starts with same ID (we’ll fix that to a new one below)
            keepOnSplit: true,
            parseHTML: (el) => el.getAttribute("data-block-id"),
            renderHTML: (attrs) => {
              if (!attrs.blockId) return {};
              return { "data-block-id": attrs.blockId };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const extension = this; // capture extension instance

    return [
      new Plugin({
        key: new PluginKey("blockIdAndChangeTracker"),

        appendTransaction(transactions, oldState, newState) {
          // 1) Ignore transactions that didn't touch the doc OR if we are in readOnly mode
          if (extension.options.readOnly || !transactions.some((tr) => tr.docChanged)) {
            return null;
          }

          // Check if this is from parser update (should not trigger API calls)
          // Similar to BlockNote's replaceBlocks which doesn't trigger change handlers
          const isFromParser = transactions.some(
            (tr) => tr.getMeta('fromParser') === true
          );

          if (isFromParser) {
            // Skip processing - this update came from parser, blocks already exist
            // This prevents infinite loops and unnecessary API calls
            return null;
          }

          // Check if this is an undo/redo operation
          const isUndoRedo = transactions.some(
            (tr) => tr.getMeta('history$') || tr.getMeta('uiEvent') === 'undo' || tr.getMeta('uiEvent') === 'redo'
          );

          const transform = combineTransactionSteps(oldState.doc, transactions as any);
          if (!transform || !transform.steps.length) {
            return null;
          }

          const { mapping } = transform;

          const changes = getChangedRanges(transform);
          if (!changes.length) {
            return null;
          }

          const tr = newState.tr;
          let modified = false;

          const creates: BlockOp[] = [];
          const updates: BlockOp[] = [];
          const deletes: BlockOp[] = [];
          const moves: MoveOp[] = [];

          // 🔹 IDs that existed in the old doc
          const oldIds = new Set<string>();
          oldState.doc.descendants((node) => {
            if (node.isBlock && BLOCK_NODE_TYPES.includes(node.type.name)) {
              const id = node.attrs.blockId as string | null;
              if (id) oldIds.add(id);
            }
            return true;
          });

          // 🔹 Track how many times we see a given id in the NEW doc (in changed ranges)
          // const newIdSeenCount = new Map<string, number>();

          // --------------------------------------------
          // STEP 1: ensure every new block has a unique blockId
          // --------------------------------------------
          const inverseMapping = mapping.invert();

          // Track IDs we've already seen in the new doc
          const seenNewIds = new Set<string>();
          // Build a set of all IDs in the entire new document (not just changed ranges)
          // This helps us detect when a pasted block has an ID that already exists elsewhere
          const allNewIds = new Set<string>();
          newState.doc.descendants((node) => {
            if (node.isBlock && BLOCK_NODE_TYPES.includes(node.type.name)) {
              const id = node.attrs.blockId as string | null;
              if (id) allNewIds.add(id);
            }
            return true;
          });

          changes.forEach(({ newRange }) => {
            // Use nodesBetween to ensure we catch the top-level node in the range too
            newState.doc.nodesBetween(newRange.from, newRange.to, (node, pos) => {
              if (node.isBlock && BLOCK_NODE_TYPES.includes(node.type.name)) {

                let id = node.attrs.blockId as string | null;

                // Map NEW doc position back into OLD doc
                const { deleted } = inverseMapping.mapResult(pos, 1);
                const isInserted = deleted; // true => nothing existed here before

                // Check for type change - either no ID or different ID than old block at same position
                const oldPos = inverseMapping.map(pos);
                const oldNodeAtPos = oldState.doc.nodeAt(oldPos);

                if (oldNodeAtPos &&
                  oldNodeAtPos.isBlock &&
                  BLOCK_NODE_TYPES.includes(oldNodeAtPos.type.name) &&
                  oldNodeAtPos.attrs.blockId) {

                  const oldBlockId = oldNodeAtPos.attrs.blockId as string;

                  // Type change indicators:
                  // 1. Node types are different (paragraph → heading)
                  // 2. New block has a different ID than old block
                  const typesDiffer = oldNodeAtPos.type.name !== node.type.name;
                  const idsDiffer = id !== oldBlockId;

                  // It's a type change if:
                  // - Types differ OR new block has different ID
                  // - AND the old ID doesn't exist elsewhere in new doc (not a move/copy)
                  const oldIdExistsElsewhere = id === oldBlockId ? false : allNewIds.has(oldBlockId);
                  const isTypeChange = (typesDiffer || idsDiffer) && !oldIdExistsElsewhere;

                  if (isTypeChange) {
                    // This is a type change - preserve the old blockId
                    id = oldBlockId;
                    tr.setNodeMarkup(pos, undefined, {
                      ...node.attrs,
                      blockId: id,
                    });
                    modified = true;
                    seenNewIds.add(id);
                    return false; // Don't traverse children if we just fixed this node
                  }
                }

                const idExistedBefore = !!id && oldIds.has(id);

                // For container blocks (blocks that can have nested blocks), don't treat as duplicate 
                // even if seen before. They can appear in multiple changed ranges but are the same block.
                const isContainer = node.childCount > 0;
                const isDuplicate = !!id && seenNewIds.has(id) && !isContainer;

                // Count how many times this ID appears in the new document
                let idCountInNewDoc = 0;
                if (id) {
                  newState.doc.descendants((n) => {
                    if (n.isBlock && BLOCK_NODE_TYPES.includes(n.type.name) && n.attrs.blockId === id) {
                      idCountInNewDoc++;
                    }
                  });
                }

                // Special case: For page blocks, preserve the blockId if it's explicitly set
                const isPageBlock = node.type.name === "page";
                // Special case: For board blocks, blockId should always equal viewId
                const isBoardBlock = node.type.name === "view_collection";
                const isSpecialBlock = isPageBlock || isBoardBlock;

                const shouldGenerateNewId = !isUndoRedo && (
                  !id ||              // brand new node with no id
                  (!isSpecialBlock && !idExistedBefore) || // id from another doc / random paste
                  isDuplicate ||      // duplicate ID in new doc
                  (isInserted && idCountInNewDoc > 1) // pasted content with duplicate ID
                );

                if (shouldGenerateNewId) {
                  const newId = new ObjectId().toString();
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    blockId: newId,
                  });
                  modified = true;
                  seenNewIds.add(newId);
                } else if (id) {
                  // Track this ID as seen
                  seenNewIds.add(id);
                }
              }
              return true; // Continue to children
            });
          });

          // SECOND PASS: Handle container blocks that have no ID
          // Container blocks are blocks that can contain nested blocks (have children)
          // This must be done after all regular blocks are processed to avoid ID conflicts
          changes.forEach(({ newRange }) => {
            const containerBlocks = findChildrenInRange(
              newState.doc,
              newRange,
              (node) => node.isBlock && node.childCount > 0,
            );

            containerBlocks.forEach(({ node, pos }) => {
              const currentId = node.attrs.blockId as string | null;

              // Only process containers that have no ID
              if (currentId) return;

              // Get IDs of children in this new container
              const newChildIds = new Set<string>();
              node.descendants((child) => {
                if (child.isBlock && BLOCK_NODE_TYPES.includes(child.type.name) && child.attrs.blockId) {
                  newChildIds.add(child.attrs.blockId as string);
                }
                return true;
              });

              // Search for an old container of the same type that has matching children
              let matchedOldId: string | null = null;
              let bestMatchScore = 0;

              oldState.doc.descendants((oldNode, oldNodePos) => {
                if (oldNode.type.name === node.type.name &&
                  oldNode.attrs.blockId &&
                  !seenNewIds.has(oldNode.attrs.blockId)) {

                  // Get IDs of children in old container
                  const oldChildIds = new Set<string>();
                  oldNode.descendants((child) => {
                    if (child.isBlock && BLOCK_NODE_TYPES.includes(child.type.name) && child.attrs.blockId) {
                      oldChildIds.add(child.attrs.blockId as string);
                    }
                    return true;
                  });

                  // Calculate how many children match
                  let matchCount = 0;
                  newChildIds.forEach(childId => {
                    if (oldChildIds.has(childId)) matchCount++;
                  });

                  // If majority of children match (>= 50%), this is likely the same container
                  const matchScore = matchCount / Math.max(newChildIds.size, oldChildIds.size);
                  if (matchScore >= 0.5 && matchScore > bestMatchScore) {
                    bestMatchScore = matchScore;
                    matchedOldId = oldNode.attrs.blockId as string;
                  }
                }
                return true;
              });

              if (matchedOldId) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  blockId: matchedOldId,
                });
                modified = true;
                seenNewIds.add(matchedOldId);
              }
            });
          });

          // Use tr.doc as the “final” new doc, in case we just added IDs.
          const finalDoc = tr.doc;
          // const { mapping } = transform;

          // --------------------------------------------------------
          // STEP 2: walk ALL old blocks and see where they ended up
          // --------------------------------------------------------
          const seenIds = new Set<string>();

          // Pre-calculate new ID positions for accurate move tracking
          // Mapping can be unreliable for structural wraps (parent changes)
          const newIdPosMap = new Map<string, number>();
          finalDoc.descendants((node, pos) => {
            if (node.isBlock && BLOCK_NODE_TYPES.includes(node.type.name) && node.attrs.blockId) {
              newIdPosMap.set(node.attrs.blockId, pos);
            }
            return true;
          });

          oldState.doc.descendants((oldNode, oldPos) => {
            if (!oldNode.isBlock || !BLOCK_NODE_TYPES.includes(oldNode.type.name)) {
              return true;
            }

            const id = oldNode.attrs.blockId as string | null;
            if (!id) {
              return true;
            }

            const { deleted, pos: mappedPos } = mapping.mapResult(oldPos, 1);

            if (deleted) {
              // Position was deleted, but check if the block still exists elsewhere in finalDoc
              // This happens during type changes (paragraph → heading)
              // OR during moves that mapping thinks are deletes

              if (newIdPosMap.has(id)) {
                // Block still exists!
                const foundPos = newIdPosMap.get(id)!;
                const foundNode = finalDoc.nodeAt(foundPos);

                seenIds.add(id);

                const contentChanged = !oldNode.eq(foundNode);
                // It exists, but mapping said deleted -> effectively a move
                // Or just a weird map result. Treat as move if positions differ.
                // If positions are same? Unlikely if deleted=true.

                if (contentChanged && foundNode.type.name !== "page" && foundNode.type.name !== "view_collection") {
                  updates.push({ id, pos: foundPos, node: foundNode });
                }

                // If mapping said deleted, we treat it as a move to the new found position
                const oldParentId = findParentBlockId(oldState.doc, oldPos);
                const newParentId = findParentBlockId(finalDoc, foundPos);
                const moved = oldPos !== foundPos;
                if (moved || oldParentId !== newParentId) {
                  moves.push({ id, fromPos: oldPos, toPos: foundPos });
                }

                return true;
              }

              // Block really was deleted
              deletes.push({ id, pos: oldPos, node: oldNode });
              return true;
            }

            // Not deleted according to mapping.
            // But let's verify where it REALLY is using our map (Truth)
            // mappedPos might be slightly off in complex wraps

            const actualPos = newIdPosMap.get(id);

            if (actualPos === undefined) {
              // Mapping said valid, but we can't find ID in doc?
              // Must be a delete (or ID changed/lost)
              deletes.push({ id, pos: oldPos, node: oldNode });
              return true;
            }

            const newNode = finalDoc.nodeAt(actualPos) as any;

            // Should match mapped node logic, but safer
            if (
              !newNode ||
              !newNode.isBlock ||
              !BLOCK_NODE_TYPES.includes(newNode.type.name) ||
              newNode.attrs.blockId !== id
            ) {
              // Should have been caught by actualPos check, but safety first
              deletes.push({ id, pos: oldPos, node: oldNode });
              return true;
            }

            // Same block still exists
            seenIds.add(id);

            const contentChanged = !oldNode.eq(newNode);

            // DETECT PARENT CHANGE: Even if absolute position is stable, 
            // the block might have been lifted/outdented (changed container)
            const oldParentId = findParentBlockId(oldState.doc, oldPos);
            const newParentId = findParentBlockId(finalDoc, actualPos);
            const parentChanged = oldParentId !== newParentId;

            // STRICT MOVE CHECK: Compare Old Pos vs Actual New Pos
            const moved = oldPos !== actualPos;

            if (contentChanged && newNode.type.name !== "page" && newNode.type.name !== "view_collection") {
              updates.push({ id, pos: actualPos, node: newNode });
            }

            if (moved || parentChanged) {
              moves.push({ id, fromPos: oldPos, toPos: actualPos });
            }

            return true;
          });

          const deletedById = new Map<string, BlockOp>();
          deletes.forEach((d) => {
            deletedById.set(d.id, d);
          });


          // ---------------------------------------------------
          // STEP 3: any block in finalDoc with an unseen id
          //         is either a CREATE or a MOVE (delete+insert)
          // ---------------------------------------------------
          finalDoc.descendants((node, pos) => {
            if (!node.isBlock || !BLOCK_NODE_TYPES.includes(node.type.name)) {
              return true;
            }

            const id = node.attrs.blockId as string | null;
            if (!id) {
              return true;
            }

            // If STEP 2 already matched this id, skip – it's an update/move handled there.
            if (seenIds.has(id)) {
              return true;
            }

            const deleted = deletedById.get(id);

            if (deleted) {
              // 🔁 This blockId existed in deletes[] AND now appears again in finalDoc
              // → it's actually a MOVE: delete at oldPos + insert at newPos
              const oldParentId = findParentBlockId(oldState.doc, deleted.pos);
              const newParentId = findParentBlockId(finalDoc, pos);
              const moved = deleted.pos !== pos;

              if (moved || oldParentId !== newParentId) {
                moves.push({
                  id,
                  fromPos: deleted.pos,
                  toPos: pos,
                });
              }

              // Remove this from deletes so it's not treated as a "real" delete anymore
              deletedById.delete(id);
              const idx = deletes.findIndex((d) => d.id === id);
              if (idx !== -1) {
                deletes.splice(idx, 1);
              }
            } else {
              // 🆕 This ID did not exist in the old doc at all
              // → real CREATE
              creates.push({ id, pos, node });
            }

            return true;
          });


          // Pre-calculate block maps for efficiency
          const newBlocksByParent = getBlocksByParent(finalDoc);
          const oldBlocksByParent = getBlocksByParent(oldState.doc);

          // Process moves to detect parent changes and order changes
          const reparentedMoves: Array<{
            blockId: string;
            oldParentId: string | null;
            newParentId: string | null;
            oldParentBlockIds: string[]; // Old parent's blockIds after removal
            newParentBlockIds: string[]; // New parent's blockIds after addition
          }> = [];

          // Track parents that have reparenting changes to avoid double-calling API
          // These parents already have their final orders sent via reparentedMoves
          const parentsWithReparenting = new Set<string | null>();

          for (const move of moves) {
            const oldParentId = findParentBlockId(oldState.doc, move.fromPos);
            const newParentId = findParentBlockId(finalDoc, move.toPos);

            if (oldParentId !== newParentId) {
              console.log("[BlockExtension] Reparent Detected:", {
                blockId: move.id,
                oldParentId,
                newParentId
              });

              // IMPROVED: Use the ACTUAL final state from newBlocksByParent for both parents.
              const oldParentBlocksFinal = newBlocksByParent.get(oldParentId) || [];
              const oldParentBlockIds = oldParentBlocksFinal.map(b => b.id);

              const newParentBlocksFinal = newBlocksByParent.get(newParentId) || [];
              const newParentBlockIds = newParentBlocksFinal.map(b => b.id);

              reparentedMoves.push({
                blockId: move.id,
                oldParentId,
                newParentId,
                oldParentBlockIds,
                newParentBlockIds,
              });

              parentsWithReparenting.add(oldParentId);
              parentsWithReparenting.add(newParentId);
            }
          }

          // Build order updates for each parent (including top-level)
          const parentOrderUpdates = new Map<string | null, string[]>();

          // Check all parents (including null for top-level)
          for (const [parentId, newBlocks] of newBlocksByParent.entries()) {
            // Skip parents that were already handled by reparenting logic
            if (parentsWithReparenting.has(parentId)) {
              continue;
            }

            const oldBlocks = oldBlocksByParent.get(parentId) || [];
            const newOrder = newBlocks.map((b) => b.id);
            const oldOrder = oldBlocks.map((b) => b.id);

            // Check if order changed for this parent's children (semantic sequence comparison)
            // This is immune to position shifts from typing.
            const newIdSet = new Set(newOrder);
            const oldIdSet = new Set(oldOrder);
            const commonIds = oldOrder.filter((id) => newIdSet.has(id));
            const newOrderCommon = newOrder.filter((id) => oldIdSet.has(id));

            const orderChanged =
              commonIds.length !== newOrderCommon.length ||
              commonIds.some((id, idx) => id !== newOrderCommon[idx]);

            if (orderChanged) {
              parentOrderUpdates.set(parentId, newOrder);
            }
          }

          // --------------------------------
          // STEP 4: check if anything actually changed
          // --------------------------------
          const anyChanges =
            creates.length > 0 ||
            updates.length > 0 ||
            deletes.length > 0 ||
            reparentedMoves.length > 0 ||
            parentOrderUpdates.size > 0;

          if (!anyChanges) {
            return modified ? tr : null;
          }

          console.log("[BlockExtension] Transaction Summary:", {
            creates: creates.length,
            updates: updates.length,
            deletes: deletes.length,
            reparented: reparentedMoves.length,
            reorderedParents: parentOrderUpdates.size
          });

          const orderedBlocks = getOrderedBlocks(finalDoc);
          const topLevelBlocks = getTopLevelBlocks(finalDoc);

          const createPayloads: CreateBlockPayload[] = creates.map(({ id, node, pos }) => {
            const parentBlockId = findParentBlockId(finalDoc, pos);

            let blocksToSearch: { id: string; pos: number }[] = [];
            if (parentBlockId === null) {
              blocksToSearch = topLevelBlocks;
            } else {
              blocksToSearch = newBlocksByParent.get(parentBlockId) || [];
            }

            const previousBlockId = findPreviousBlockId(blocksToSearch, id);

            return {
              blockId: id,
              previousBlockId,
              parentBlockId,
              content: serializeBlockForStorage(node),
            } as any;
          });

          const updatePayloads: UpdateBlockPayload[] = updates.map(({ id, node }) => ({
            blockId: id,
            data: serializeBlockForStorage(node),
          }));

          const deletePayloads: DeleteBlockPayload[] = deletes.map(({ id, pos }) => {
            const parentBlockId = findParentBlockId(oldState.doc, pos);
            return {
              blockId: id,
              parentBlockId,
            } as any;
          });

          // Restore root-to-root move debug logic for diagnostic visibility
          for (const move of moves) {
            const oldParentId = findParentBlockId(oldState.doc, move.fromPos);
            const newParentId = findParentBlockId(finalDoc, move.toPos);

            if (oldParentId === null && newParentId === null) {
              try {
                const $pos = finalDoc.resolve(move.toPos);
                const parent = $pos.parent;
                console.log("[BlockExtension] Suspicious Root->Root Move:", {
                  blockId: move.id,
                  pos: move.toPos,
                  parentType: parent.type.name,
                  parentBlockId: parent.attrs.blockId,
                  parentHasId: !!parent.attrs.blockId
                });
              } catch (e) {
                console.error("[BlockExtension] Error debugging move:", e);
              }
            }
          }

          // Top-level move payload - filter out any blocks without valid blockIds
          const topLevelBlockIds = parentOrderUpdates.has(null) ? parentOrderUpdates.get(null)! : [];
          const validTopLevelBlockIds = topLevelBlockIds.filter(id => id && id.trim() !== '');
          const movePayload: MoveBlocksPayload | null = validTopLevelBlockIds.length > 0
            ? { blockIdArray: validTopLevelBlockIds }
            : null;

          // Nested moves (all parents except null) - filter out invalid blockIds
          const nestedMoves: Array<{ parentId: string; blockIdArray: string[] }> = [];
          for (const [parentId, blockIdArray] of parentOrderUpdates.entries()) {
            if (parentId !== null) {
              const validBlockIds = blockIdArray.filter(id => id && id.trim() !== '');
              if (validBlockIds.length > 0) {
                nestedMoves.push({ parentId, blockIdArray: validBlockIds });
              }
            }
          }

          const onBlocksChanged = extension.options.onBlocksChanged as
            | null
            | ((changes: BlockChangesPayload) => void);
          const noteId = extension.options.noteId as string | null;
          const workspaceId = extension.options.workspaceId as string;
          const parentId = extension.options.parentId as string | null;
          const parentTable = extension.options.parentTable as "workSpace" | "block" | "collection" | "workArea" | "page";

          if (onBlocksChanged && noteId) {
            onBlocksChanged({
              noteId,
              workspaceId,
              parentId: parentId,
              parentTable, // Add parentTable
              creates: createPayloads,
              updates: updatePayloads,
              deletes: deletePayloads,
              move: movePayload,
              nestedMoves: nestedMoves.length > 0 ? nestedMoves : undefined,
              reparentedMoves: reparentedMoves.length > 0 ? reparentedMoves : undefined,
            } as any); // Cast to any to include nestedMoves and reparentedMoves

          } else {
            // fallback debug
            console.log("[BLOCK DETECTOR] PAYLOAD:", {
              noteId,
              creates: createPayloads,
              updates: updatePayloads,
              deletes: deletePayloads,
              move: movePayload,
            });
          }
          // if (creates.length || updates.length || deletes.length || moves.length) {
          //   console.log("[BLOCK DETECTOR] creates:", creates);
          //   console.log("[BLOCK DETECTOR] updates:", updates);
          //   console.log("[BLOCK DETECTOR] deletes:", deletes);
          //   console.log("[BLOCK DETECTOR] moves:", moves);
          //   // persistBlockChanges(noteId, { creates, updates, deletes, moves });
          // }

          return modified ? tr : null;
        },
      }),
    ];
  },
});

// Extension to ensure block-level drag works correctly inside column nodes
// This intercepts selection changes and ensures block nodes are selected, not column nodes
const columnDragHandleExtension = Extension.create({
  name: "columnDragHandle",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("columnDragHandle"),
        appendTransaction: (transactions, oldState, newState) => {
          // Check if a node selection was made and if it's a column node
          const selection = newState.selection;

          // Check if this is a node selection (used for dragging)
          if (selection && (selection as any).node) {
            const selectedNode = (selection as any).node;

            // If the selected node is a column node, we need to select a block inside it instead
            if (selectedNode.type.name === "columnItem" || selectedNode.type.name === "columnLayout") {
              const $from = newState.doc.resolve(selection.from);

              // Find the first block node inside the column
              let blockNode: any = null;
              let blockPos: number | null = null;

              // Walk down to find the first non-column block
              selectedNode.forEach((node: any, offset: number) => {
                if (!blockNode && node.type.name !== "columnItem" && node.type.name !== "columnLayout") {
                  blockNode = node;
                  blockPos = selection.from + offset + 1;
                }
              });

              // If we found a block node, select it instead
              if (blockNode && blockPos !== null) {
                const tr = newState.tr;
                // Try to create a selection that selects the block node
                try {
                  // Access NodeSelection through the selection constructor
                  const NodeSelection = (selection.constructor as any);
                  const blockSelection = NodeSelection.create(newState.doc, blockPos);
                  tr.setSelection(blockSelection);
                  return tr;
                } catch (e) {
                  // If that doesn't work, try selecting the content range
                  try {
                    const $blockPos = newState.doc.resolve(blockPos);
                    const blockSelection = newState.selection.constructor.create(
                      newState.doc,
                      blockPos,
                      blockPos + (blockNode.nodeSize as number)
                    );
                    tr.setSelection(blockSelection);
                    return tr;
                  } catch (e2) {
                    // If all else fails, just return the transaction as-is
                    return tr;
                  }
                }
              }
            }
          }

          return null;
        },
      }),
    ];
  },
});

//TODO I am using cx here to get tailwind autocomplete working, idk if someone else can write a regex to just capture the class key in objects
const aiHighlight = AIHighlight;
// Board delete confirmation is implemented in ./plugins/boardDeletionGuard
//You can overwrite the placeholder with your own configuration
const placeholder = Placeholder;
const tiptapLink = TiptapLink.configure({
  HTMLAttributes: {
    class: cx(
      "text-muted-foreground underline underline-offset-[3px] hover:text-primary transition-colors cursor-pointer",
    ),
  },
});

const tiptapImage = TiptapImage.extend({
  addProseMirrorPlugins() {
    return [
      UploadImagesPlugin({
        imageClass: cx("opacity-40 rounded-lg border border-stone-200"),
      }),
    ];
  },
}).configure({
  allowBase64: true,
  HTMLAttributes: {
    class: cx("rounded-lg border border-muted"),
  },
});

const updatedImage = UpdatedImage.configure({
  HTMLAttributes: {
    class: cx("rounded-lg border border-muted"),
  },
});

const taskList = TaskList.configure({
  HTMLAttributes: {
    class: cx("not-prose"),
  },
});
const taskItem = TaskItem.configure({
  HTMLAttributes: {
    class: cx("flex gap-2 items-start my-4"),
  },
  nested: true,
});

const horizontalRule = HorizontalRule.configure({
  HTMLAttributes: {
    class: cx("mt-4 mb-6 border-t border-muted-foreground"),
  },
});

const starterKit = StarterKit.configure({
  bulletList: {
    HTMLAttributes: {
      class: cx("list-disc list-outside leading-3 -mt-2"),
    },
  },
  orderedList: {
    HTMLAttributes: {
      class: cx("list-decimal list-outside leading-3 -mt-2"),
    },
  },
  listItem: {
    HTMLAttributes: {
      class: cx("leading-tight -mb-1"),
    },
  },
  blockquote: {
    HTMLAttributes: {
      class: cx("border-l-4 border-primary"),
    },
  },
  codeBlock: {
    HTMLAttributes: {
      class: cx("rounded-md bg-muted text-muted-foreground border p-5 font-mono font-medium"),
    },
  },
  code: {
    HTMLAttributes: {
      class: cx("rounded-md bg-muted  px-1.5 py-1 font-mono font-medium"),
      spellcheck: "false",
    },
  },
  paragraph: {
    HTMLAttributes: {
      class: cx("mt-0 leading-tight mb-2 rounded-md"),
    },
  },
  heading: {
    HTMLAttributes: {
      class: cx("font-semibold mb-2 rounded-md"),
    },
  },
  horizontalRule: false,
  dropcursor: {
    color: "#DBEAFE",
    width: 4,
  },
  gapcursor: false,
});

const codeBlockLowlight = CodeBlockLowlight.configure({
  // configure lowlight: common /  all / use highlightJS in case there is a need to specify certain language grammars only
  // common: covers 37 language grammars which should be good enough in most cases
  lowlight: createLowlight(common),
});

const embed = Embed.configure({
  HTMLAttributes: {
    class: cx("rounded-lg"),
  },
  inline: false,
  defaultHeight: 320,
  defaultWidth: 480,
  minWidth: 240,
  maxWidth: 960,
  minHeight: 160,
});

const youtube = Youtube.configure({
  HTMLAttributes: {
    class: cx("rounded-lg border border-muted"),
  },
  inline: false,
});

const twitter = Twitter.configure({
  HTMLAttributes: {
    class: cx("not-prose"),
  },
  inline: false,
});


const mathematics = Mathematics.configure({
  HTMLAttributes: {
    class: cx("text-foreground rounded p-1 hover:bg-accent cursor-pointer"),
  },
  katexOptions: {
    throwOnError: false,
  },
});

const characterCount = CharacterCount.configure();

const markdownExtension = MarkdownExtension.configure({
  html: true,
  tightLists: true,
  tightListClass: "tight",
  bulletListMarker: "-",
  linkify: false,
  breaks: false,
  transformPastedText: false,
  transformCopiedText: false,
});

const table = Table.configure({
  resizable: true,
  HTMLAttributes: {
    class: cx("table-auto border border-collapse w-full"),
  },
})

const mergeStyleStrings = (existing: string | null | undefined, addition: string) => {
  const base = existing?.trim();
  if (!base) {
    return addition;
  }
  if (base.endsWith(";")) {
    return `${base} ${addition}`;
  }
  return `${base}; ${addition}`;
};

const columnItem = Node.create({
  name: "columnItem",
  content: "block+",
  defining: true,
  isolating: true,
  draggable: false, // Prevent column item itself from being dragged - only blocks inside should be draggable
  addAttributes() {
    return {
      width: {
        default: 100,
        parseHTML: (el) => {
          const w = parseFloat(el.getAttribute("data-width") || "100");
          return Number.isFinite(w) ? w : 100;
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column-item"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, style, ...rest } = HTMLAttributes;
    const widthValue = Math.min(Math.max(width ?? 100, 0), 100);

    const baseStyle = [
      "display: block",
      "box-sizing: border-box",
      "overflow-wrap: anywhere",
      "word-break: break-word",
      "width: 100%",
      "min-width: 0",
      "max-width: 100%",
      "padding-left: 30px",
      "padding-right: 10px",
      "margin: 0px !important",
      "line-height: 1.4",
      "min-height: 100%",
      // Prevent any influence on grid sizing
      "overflow: hidden",
    ].join("; ");


    return [
      "div",
      mergeAttributes(rest, {
        "data-type": "column-item",
        "data-width": widthValue,
        style: mergeStyleStrings(style, baseStyle),
      }),
      0,
    ];
  },
});

const columnLayout = Node.create({
  name: "columnLayout",
  group: "block",
  content: "columnItem+",
  defining: true,
  isolating: true,
  draggable: false, // Prevent column layout itself from being dragged - only blocks inside should be draggable
  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (el) => {
          const c = parseInt(el.getAttribute("data-columns") || "2", 10);
          return Number.isFinite(c) ? c : 2;
        },
      },
      widths: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-widths"),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column-layout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { columns, widths, style, ...rest } = HTMLAttributes;
    const columnCount = clampColumnCount(columns ?? 2);
    const parsedWidths = parseWidthsAttribute(widths, columnCount);
    const normalizedWidths = normalizeColumnWidths(columnCount, parsedWidths);
    const template = getGridTemplateFromWidths(normalizedWidths);
    const baseStyle = [
      "display: grid",
      `--column-template: ${template}`,
      "grid-template-columns: var(--column-template)",
      "min-width: 100%",
      "box-sizing: border-box",
      "align-items: start",
      "justify-content: start",
      "overflow-x: auto",
      "scrollbar-width: thin",
      // Prevent any content-based resizing
      "grid-auto-rows: min-content",
      // CSS custom property for sidebar width that can be overridden
      "--sidebar-width: 15rem",
    ].join("; ");


    return [
      "div",
      mergeAttributes(rest, {
        "data-type": "column-layout",
        "data-columns": columnCount,
        "data-widths": normalizedWidths.join(","),
        style: mergeStyleStrings(style, baseStyle),
      }),
      0,
    ];
  },
});

type ColumnResizeState = {
  view: EditorView;
  nodePos: number;
  columnIndex: number;
  startX: number;
  containerWidth: number;
  startWidths: number[];
  pairTotal: number;
  layoutEl: HTMLElement;
};

const HANDLE_ACTIVE_WIDTH = 12;

const getColumnBoundaryIndex = (layoutEl: HTMLElement, clientX: number) => {
  const columnItems = Array.from(
    layoutEl.querySelectorAll(':scope > div[data-type="column-item"]'),
  ) as HTMLElement[];
  if (columnItems.length < 2) {
    return -1;
  }

  for (let index = 0; index < columnItems.length - 1; index += 1) {
    const currentItem = columnItems[index];
    const nextItem = columnItems[index + 1];
    if (!currentItem || !nextItem) {
      continue;
    }
    const current = currentItem.getBoundingClientRect();
    const next = nextItem.getBoundingClientRect();
    const boundaryStart = current.right;
    const boundaryEnd = next.left;
    const halfGap = Math.max(HANDLE_ACTIVE_WIDTH, Math.abs(boundaryEnd - boundaryStart) / 2);
    if (clientX >= boundaryStart - halfGap && clientX <= boundaryEnd + halfGap) {
      return index;
    }
  }
  return -1;
};

const createColumnResizePlugin = () => {
  let resizeState: ColumnResizeState | null = null;

  const stopResizing = () => {
    if (resizeState?.layoutEl) {
      resizeState.layoutEl.removeAttribute("data-resizing");
    }
    resizeState = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!resizeState) {
      return;
    }
    event.preventDefault();
    const { view, nodePos, columnIndex, startX, containerWidth, startWidths, pairTotal } = resizeState;
    if (!containerWidth) {
      return;
    }
    const deltaPx = event.clientX - startX;
    const deltaPercent = (deltaPx / containerWidth) * 100;
    const nextWidths = [...startWidths];
    const leftStart = startWidths[columnIndex];
    const rightStart = startWidths[columnIndex + 1];
    if (typeof leftStart !== "number" || typeof rightStart !== "number") {
      stopResizing();
      return;
    }
    const pairSum = Math.max(pairTotal, leftStart + rightStart, 0.1);
    let leftWidth = leftStart + deltaPercent;
    const minWidth = Math.min(pairSum / 2, MIN_COLUMN_PERCENT);
    leftWidth = Math.max(minWidth, Math.min(pairSum - minWidth, leftWidth));
    const rightWidth = pairSum - leftWidth;
    nextWidths[columnIndex] = parseFloat(leftWidth.toFixed(2));
    nextWidths[columnIndex + 1] = parseFloat(rightWidth.toFixed(2));
    applyColumnWidths(view, nodePos, nextWidths);
    const template = getGridTemplateFromWidths(nextWidths);
    resizeState.layoutEl.style.setProperty("--column-template", template);
    resizeState.layoutEl.style.setProperty("grid-template-columns", "var(--column-template)");
  };

  const handlePointerUp = () => {
    stopResizing();
  };

  return new Plugin({
    key: new PluginKey("columnResize"),
    props: {
      handleDOMEvents: {
        pointerdown(view, event) {
          if (!(event instanceof PointerEvent) || event.button !== 0) {
            return false;
          }
          if (resizeState) {
            stopResizing();
          }
          const target = event.target as HTMLElement | null;
          if (!target) {
            return false;
          }
          const layoutEl = target.closest('div[data-type="column-layout"]') as HTMLElement | null;
          if (!layoutEl) {
            return false;
          }

          const boundaryIndex = getColumnBoundaryIndex(layoutEl, event.clientX);
          if (boundaryIndex === -1) {
            return false;
          }

          const domPos = view.posAtDOM(layoutEl, 0);
          let nodePos = domPos;
          let node = view.state.doc.nodeAt(nodePos);
          if (!node || node.type.name !== "columnLayout") {
            nodePos = domPos - 1;
            node = view.state.doc.nodeAt(nodePos);
          }
          if (!node || node.type.name !== "columnLayout" || nodePos < 0) {
            return false;
          }

          const columnCount = node.childCount;
          if (columnCount < 2) {
            return false;
          }
          const widths = parseWidthsAttribute(node.attrs.widths, columnCount);
          const containerWidth = layoutEl.getBoundingClientRect().width;
          if (!containerWidth) {
            return false;
          }

          const leftWidth = widths[boundaryIndex] ?? 0;
          const rightWidth = widths[boundaryIndex + 1] ?? 0;
          const pairTotal = Math.max(leftWidth + rightWidth, 0.1);

          resizeState = {
            view,
            nodePos,
            columnIndex: boundaryIndex,
            startX: event.clientX,
            containerWidth,
            startWidths: widths,
            pairTotal,
            layoutEl,
          };

          layoutEl.setAttribute("data-resizing", "true");

          if (typeof window !== "undefined") {
            window.addEventListener("pointermove", handlePointerMove, { passive: false });
            window.addEventListener("pointerup", handlePointerUp, { passive: false });
          }

          event.preventDefault();
          event.stopPropagation();
          return true;
        },
      },
    },
    view() {
      return {
        destroy() {
          stopResizing();
        },
      };
    },
  });
};

const columnResizeExtension = Extension.create({
  name: "columnResize",

  addProseMirrorPlugins() {
    return [createColumnResizePlugin()];
  },
});

const viewCollectionBlock = Node.create({
  name: "view_collection",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      component: {
        default: "board",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="view_collection"]', // Add proper parsing
        getAttrs: (dom) => ({
          viewId: (dom as HTMLElement).getAttribute('data-view-id'),
          component: (dom as HTMLElement).getAttribute('data-component') || 'board',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        'data-type': 'view_collection',
        'data-view-id': HTMLAttributes.viewId,
        'data-component': HTMLAttributes.component,
      })
    ];
  },

  addNodeView() {
    console.log("addNodeView");
    return ReactNodeViewRenderer(BoardBlock);
  },

})

const commentMark = Mark.create({

  name: "commentMark",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-comment-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          "data-comment-id": HTMLAttributes.commentId,
          class: "bg-yellow-200 dark:bg-yellow-600 rounded-sm cursor-pointer",
        },
        this.options.HTMLAttributes
      ),
      0,
    ];
  },

  addCommands() {
    return {
      addCommentMark:
        (commentId: string) =>
          ({ chain }) => {
            return chain()
              .setMark(this.name, { commentId })
              .run();
          },
      removeCommentMark:
        () =>
          ({ chain }) => {
            return chain().unsetMark(this.name).run();
          },
    } as Partial<RawCommands>
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("comment-icon-plugin"),
        props: {
          decorations: (state) => {
            const decorations: any[] = [];
            const { doc } = state;

            doc.descendants((node, pos) => {
              const mark = node.marks?.find((m) => m.type.name === "commentMark");
              if (mark) {
                const deco = Decoration.widget(pos + node.nodeSize, () => {
                  const span = document.createElement("span");
                  const root = createRoot(span);
                  root.render(React.createElement(CommentBox, { commentId: mark.attrs.commentId }))
                  return span;
                });
                decorations.push(deco);
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
})

type BlockOrderCallbacks = {
  setOrderFromArray: (arr: string[]) => void;
  insertAfter: (newId: string, previousId: string | null) => void;
  removeId: (id: string) => void;
  moveToOrder: (newOrder: string[]) => void;
  replaceId: (oldId: string, newId: string) => void;
};

type GlobalBlocksContext = {
  addBlock: (block: any) => void;
  updateBlock: (blockId: string, updates: any) => void;
  removeBlock: (blockId: string) => void;
  upsertBlocks: (blocks: any[]) => Promise<void>;
  getBlock: (blockId: string) => any;
};

// Helper function to create the block tracker extension with noteId
export const createBlockTrackerExtension = (
  noteId: string,
  workspaceId: string,
  parentId?: string | null,
  parentTable?: "workSpace" | "block" | "collection" | "workArea" | "page",
  callbacks?: BlockOrderCallbacks,
  globalBlocks?: GlobalBlocksContext,
  readOnly: boolean = false
) => {
  return BlockIdAndChangeTrackerExtension.configure({
    noteId,
    workspaceId,
    parentId,
    parentTable: parentTable || "page",
    readOnly,
    onBlocksChanged: (payload) => {
      console.log('[BlockTracker] onBlocksChanged', {
        nestedMovesCount: payload.nestedMoves?.length,
        nestedMoves: payload.nestedMoves,
        creates: payload.creates?.length
      });
      // Send block changes to the server
      sendBlockChanges(payload, globalBlocks);

      if (callbacks) {
        const { creates, deletes, move, reparentedMoves } = payload;


        // 1. Handle deletes
        // Only update page-level block order for top-level blocks
        deletes.forEach((d) => {
          const isTopLevel = !(d as any).parentBlockId;
          if (isTopLevel) {
            callbacks.removeId(d.blockId);
          }
        });

        // 2. Handle reparenting (moving between parents)
        // This is crucial for drag-and-drop between root and containers
        if (reparentedMoves) {
          reparentedMoves.forEach((m) => {
            // If moved FROM top-level (oldParentId is null), remove from top-level list
            if (m.oldParentId === null) {
              callbacks.removeId(m.blockId);
            }

            // If moved TO top-level (newParentId is null), add to top-level list
            if (m.newParentId === null) {
              const newOrder = m.newParentBlockIds;
              const index = newOrder.indexOf(m.blockId);
              const prevId = index > 0 ? newOrder[index - 1] : null;
              callbacks.insertAfter(m.blockId, prevId);
            }
          });
        }

        // 3. Handle creates
        // We rely on 'sendBlockChanges' (blockServices.tsx) to handle the optimistic updates
        // for creates. It has been patched to handle batching and prevent race conditions
        // for both root-level and nested blocks.
        if (creates.length > 0) {
          // Logic handled in blockServices.ts
        }

        // THEN handle move to set the final order
        // During pure drag-and-drop: no creates/deletes, only this runs
        // During add/delete: this runs after creates/deletes to finalize order
        if (move && move.blockIdArray && move.blockIdArray.length > 0) {
          callbacks.moveToOrder(move.blockIdArray);
        }
      }
    },
  });
};

const BlockBackgroundColorExtension = Extension.create({
  name: "blockBackgroundColor",
  addGlobalAttributes() {
    return [
      {
        types: BLOCK_NODE_TYPES.filter((type) => type !== "page" && type !== "view_collection" && type !== "cmsBlock"),
        attributes: {
          backgroundColor: {
            default: null,
            // Prevent background color from being copied to new block on split (Enter key)
            keepOnSplit: false,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes) => {
              if (!attributes.backgroundColor) {
                return {};
              }
              return {
                style: `background-color: ${attributes.backgroundColor}`,
              };
            },
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockBackgroundColor"),
        props: {
          decorations: (state) => {
            const decorations: any[] = [];

            state.doc.descendants((node, pos) => {
              if (
                node.isBlock &&
                BLOCK_NODE_TYPES.includes(node.type.name) &&
                node.attrs.backgroundColor
              ) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    style: `background-color: ${node.attrs.backgroundColor}`,
                  })
                );
              }
              // Don't recurse if we found a block with backgroundColor, unless we want nested colors
              // But Tiptap descendants recurses anyway.
              return true;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const TableOfContentsExtension = TableOfContents.configure({
  getIndex: getHierarchicalIndexes,
  onUpdate: (content) => {
    return content;
  },
  scrollParent: () => window,
});

export const defaultExtensions: AnyExtension[] = [
  starterKit,
  placeholder,
  tiptapLink,
  tiptapImage,
  updatedImage,
  // TaskList,
  // TaskItem,
  taskList,
  taskItem,
  horizontalRule,
  aiHighlight,
  codeBlockLowlight,
  embed,
  youtube,
  twitter,
  mathematics,
  characterCount,
  TiptapUnderline,
  markdownExtension,
  HighlightExtension,
  TextStyle,
  Color,
  CustomKeymap,
  table,
  TableRow,
  TableHeader,
  TableCell,
  columnItem,
  columnLayout,
  columnResizeExtension,
  // Custom extension to render drag handles correctly in all layouts (including columns)
  CustomDragHandle.configure({
    handleClass: "drag-handle",
  }),
  viewCollectionBlock,
  boardDeletionGuardExtension,
  CmsBlockExtension,
  CalloutExtension,
  BookmarkExtension,
  PageBlockExtension,
  BlockContextMenuExtension,
  // mention,
  commentMark,
  BlockBackgroundColorExtension,
  TableOfContentsExtension,
  TOCExtension,
];
