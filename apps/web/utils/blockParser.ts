/**
 * Block Parser Utility
 * 
 * Reconstructs ProseMirror/TipTap document from blocks stored in GlobalBlockContext
 * Ensures all block nodes have the correct blockId attribute set
 */

import type { Block } from "@/types/block";
import type { JSONContent } from "novel";
import type { IPage } from "@/types/block";

// Block node types that should have blockId attributes
// This matches BLOCK_NODE_TYPES from extensions.ts
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

/**
 * Converts an IPage value to a ProseMirror page node format
 * 
 * @param pageValue - The IPage value from block.value
 * @param blockId - The block ID to assign to this page node
 * @returns ProseMirror page node JSON
 */
function convertPageToNode(
  pageValue: IPage | any,
  blockId: string
): JSONContent {
  // Extract page properties
  const title = pageValue?.title || 'New page';
  const icon = pageValue?.icon || null;
  // Generate href from blockId (assuming it's the page ID)
  const href = `/notes/${blockId}`;

  return {
    type: 'page',
    attrs: {
      blockId: blockId,
      href: href,
      title: title,
      icon: icon,
    },
  };
}

/**
 * Checks if a value is an IPage object (has page-specific properties)
 */
function isPageValue(value: any): value is IPage {
  return (
    value &&
    typeof value === 'object' &&
    'title' in value &&
    'userId' in value &&
    !('type' in value) // Not already a ProseMirror node
  );
}

/**
 * Ensures a ProseMirror node has the correct blockId attribute set
 * Recursively processes nested content to ensure all block nodes have blockIds
 * 
 * @param node - The ProseMirror node JSON
 * @param blockId - The block ID to assign to this node (null for nested nodes without IDs)
 * @param blocks - Map of all blocks for nested block resolution
 * @returns Node with blockId properly set
 */
function ensureBlockId(
  node: JSONContent,
  blockId: string | null,
  blocks: Map<string, Block>
): JSONContent {
  if (!node || typeof node !== 'object') {
    return node;
  }

  // Create a copy to avoid mutating the original
  const processedNode: JSONContent = { ...node };

  // If this is a block node type, ensure it has the blockId attribute
  if (node.type && BLOCK_NODE_TYPES.includes(node.type)) {
    // Ensure attrs object exists
    if (!processedNode.attrs) {
      processedNode.attrs = {};
    } else {
      // Create a copy of attrs to avoid mutation
      processedNode.attrs = { ...processedNode.attrs };
    }

    // Set the blockId attribute (only if blockId is provided)
    if (blockId !== null) {
      processedNode.attrs.blockId = blockId;
    } else {
      // Preserve existing blockId if present, otherwise leave null
      // The extension will handle assigning IDs to blocks without IDs
      if (!processedNode.attrs.blockId) {
        processedNode.attrs.blockId = null;
      }
    }
  }

  // Recursively process nested content
  if (node.content && Array.isArray(node.content)) {
    processedNode.content = node.content.map((childNode) => {
      // If child is a block node type, preserve its existing blockId or leave null
      if (childNode.type && BLOCK_NODE_TYPES.includes(childNode.type)) {
        // Preserve existing blockId if present, otherwise leave null
        // The extension will handle assigning IDs to nested blocks without IDs
        const childBlockId = childNode.attrs?.blockId || null;
        return ensureBlockId(childNode, childBlockId, blocks);
      }
      // For non-block nodes, just recursively process (they don't need blockIds)
      return ensureBlockId(childNode, null, blocks);
    });
  }

  return processedNode;
}

/**
 * Reconstructs a ProseMirror document from blocks
 * 
 * @param parentBlockId - The parent block ID (page)
 * @param blocks - Map of all blocks (from GlobalBlockContext)
 * @param overrideBlockIds - Optional override for parent block's blockIds (useful for history viewing)
 * @returns ProseMirror document JSON with all blockIds properly set
 */
export function reconstructDocumentFromBlocks(
  parentBlockId: string,
  blocks: Map<string, Block>,
  overrideBlockIds?: string[] | null
): JSONContent {
  // Get the parent block
  const parentBlock = blocks.get(parentBlockId);

  if (!parentBlock) {
    return createEmptyDocument();
  }

  // Get the ordered list of child block IDs (use override if provided, otherwise use parent block's blockIds)
  const blockIds = overrideBlockIds !== undefined ? (overrideBlockIds || []) : (parentBlock.blockIds || []);

  if (blockIds.length === 0) {
    return createEmptyDocument();
  }

  // Helper function to recursively process a block
  function processBlock(blockId: string): JSONContent | null {
    const block = blocks.get(blockId);

    if (!block) {
      return null;
    }

    // Handle page blocks
    if (block.blockType === 'page') {
      const pageValue = block.value;
      if (isPageValue(pageValue)) {
        return convertPageToNode(pageValue, block._id);
      } else if (pageValue && typeof pageValue === 'object' && 'type' in pageValue && pageValue.type === 'page') {
        return ensureBlockId(pageValue as JSONContent, block._id, blocks);
      } else {
        return {
          type: 'page',
          attrs: {
            blockId: block._id,
            href: `/notes/${block._id}`,
            title: 'New page',
            icon: null,
          },
        };
      }
    }

    // Handle collection_view blocks
    if (block.blockType === 'collection_view') {
      const viewDatabase = block.value;
      if (viewDatabase && typeof viewDatabase === 'object' && 'viewsTypes' in viewDatabase) {
        return {
          type: 'view_collection',
          attrs: {
            blockId: block._id,
            component: 'board',
          },
        };
      } else {
        return {
          type: 'view_collection',
          attrs: {
            blockId: block._id,
            component: 'board',
          },
        };
      }
    }

    // Handle content blocks
    if (block.blockType !== 'content') {
      return null;
    }

    // Extract the ProseMirror node from block.value
    let nodeContent = block.value;
    let processedNode: JSONContent;

    if (nodeContent && typeof nodeContent === 'object') {
      if ('type' in nodeContent) {
        processedNode = ensureBlockId(nodeContent as JSONContent, block._id, blocks);
      } else if ('content' in nodeContent && nodeContent.content) {
        const nested = nodeContent.content;
        if (nested && typeof nested === 'object' && 'type' in nested) {
          processedNode = ensureBlockId(nested as JSONContent, block._id, blocks);
        } else if (Array.isArray(nested) && nested.length > 0 && nested[0] && 'type' in nested[0]) {
          processedNode = ensureBlockId(nested[0] as JSONContent, block._id, blocks);
        } else {
          processedNode = { type: 'paragraph', attrs: { blockId: block._id } };
        }
      } else {
        processedNode = { type: 'paragraph', attrs: { blockId: block._id } };
      }
    } else {
      processedNode = { type: 'paragraph', attrs: { blockId: block._id } };
    }

    // RECURSIVE STEP: Process nested children
    // Allow any block to have nested children if it has blockIds
    if (block.blockIds && block.blockIds.length > 0) {

      const inlineContent = processedNode.content || [];
      const contentBlocks: JSONContent[] = [];

      const layoutTypes = ['columnLayout', 'columnItem', 'row', 'table', 'tableRow', 'view_collection'];
      const isLayout = processedNode.type && layoutTypes.includes(processedNode.type);

      // 1. Add inline content (wrapped in paragraph)
      if (inlineContent.length > 0 && !isLayout) {
        contentBlocks.push({
          type: 'paragraph',
          content: inlineContent
        });
      }

      // 2. Recursively process children
      for (const childId of block.blockIds) {
        // RECURSION: Call processBlock for each child
        const childNode = processBlock(childId);
        if (childNode) {
          contentBlocks.push(childNode);
        }
      }

      // Set content
      if (contentBlocks.length > 0) {
        processedNode.content = contentBlocks;
      } else if (!isLayout) {
        processedNode.content = [{ type: 'paragraph' }];
      }
    }

    return processedNode;
  }

  // Reconstruct content array from blocks
  const content: JSONContent[] = [];

  for (const blockId of blockIds) {
    const processedNode = processBlock(blockId);
    if (processedNode) {
      content.push(processedNode);
    }
  }

  // Return the reconstructed document
  const doc = {
    type: 'doc',
    content: content.length > 0 ? content : [{
      type: 'paragraph',
      attrs: { blockId: null }
    }]
  };

  return doc;
}

/**
 * Reconstructs a ProseMirror document from blocks array (alternative method)
 * Use this when you have the blocks array directly from API response
 * 
 * @param parentBlockId - The parent block ID (page)
 * @param blocksArray - Array of blocks from API
 * @param overrideBlockIds - Optional override for parent block's blockIds (useful for history viewing)
 * @returns ProseMirror document JSON
 */
export function reconstructDocumentFromBlocksArray(
  parentBlockId: string,
  blocksArray: Block[],
  overrideBlockIds?: string[] | null
): JSONContent {
  // Find the parent block
  const parentBlock = blocksArray.find(b => b._id === parentBlockId);

  if (!parentBlock) {
    return createEmptyDocument();
  }

  // Use override if provided, otherwise use parent block's blockIds
  const blockIds = overrideBlockIds !== undefined ? (overrideBlockIds || []) : (parentBlock.blockIds || []);

  if (blockIds.length === 0) {
    return createEmptyDocument();
  }

  // Create a map for quick lookup
  const blocksMap = new Map(blocksArray.map(b => [b._id, b]));

  // Use the main reconstruction function with the map and override
  return reconstructDocumentFromBlocks(parentBlockId, blocksMap, overrideBlockIds);
}

/**
 * Creates an empty ProseMirror document
 */
function createEmptyDocument(): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { blockId: null }
      }
    ]
  };
}

/**
 * Validates if a document has meaningful content
 */
export function hasContent(doc: JSONContent): boolean {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) {
    return false;
  }

  // Check if it's just an empty paragraph
  if (
    doc.content.length === 1 &&
    doc.content[0]?.type === 'paragraph' &&
    (!doc.content[0]?.content || doc.content[0].content.length === 0)
  ) {
    return false;
  }

  return true;
}

/**
 * Gets block IDs in order from a parent block
 */
export function getBlockOrder(
  parentBlockId: string,
  blocks: Map<string, Block>
): string[] {
  const parentBlock = blocks.get(parentBlockId);
  return parentBlock?.blockIds || [];
}
