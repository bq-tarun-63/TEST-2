"use client";

import { useCallback, useRef } from "react";

// Block types
export type BlockType =
  | "paragraph"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "listItem"
  | "blockquote"
  | "codeBlock"
  | "horizontalRule"
  | "taskList"
  | "taskItem"
  | "table"
  | "tableRow"
  | "tableCell"
  | "tableHeader"
  | "columnLayout"
  | "columnItem"
  | "view_collection"
  | "cmsBlock"
  | "callout"
  | "bookmark"
  | "page"          // Special: appears in sidebar
  | "datasource"    // Special: appears in sidebar (future)
  | "view"          // Special: appears in sidebar (future)
  | "image"
  | "toc";

// Special block types that should appear in sidebar as children
export const SPECIAL_BLOCK_TYPES: BlockType[] = ["page", "datasource", "view"];

export interface BlockTypeRegistry {
  // Register a block with its type
  registerBlock: (blockId: string, type: BlockType) => void;

  // Unregister a block
  unregisterBlock: (blockId: string) => void;

  // Get the type of a specific block
  getBlockType: (blockId: string) => BlockType | null;

  // Check if a block is a special type (page, datasource, view)
  isSpecialBlock: (blockId: string) => boolean;

  // Get all special blocks from a list of block IDs
  getSpecialBlocks: (blockIds: string[]) => Array<{ id: string; type: BlockType }>;

  // Get all registered blocks of a specific type
  getBlocksByType: (type: BlockType) => string[];

  // Clear all registered blocks (useful for cleanup)
  clear: () => void;

  // Get all registered blocks (for debugging)
  getAllBlocks: () => Map<string, BlockType>;
}

/**
 * Hook to manage block type registry
 * Tracks what type each block is so we can identify special blocks
 * that should appear in the sidebar (page, datasource, view, etc.)
 */
export function useBlockTypeRegistry(): BlockTypeRegistry {
  // Use a ref to maintain the registry across renders without causing re-renders
  const registryRef = useRef<Map<string, BlockType>>(new Map());

  const registerBlock = useCallback((blockId: string, type: BlockType) => {
    registryRef.current.set(blockId, type);
    console.log(`[BlockTypeRegistry] Registered: ${blockId} -> ${type}`);
  }, []);

  const unregisterBlock = useCallback((blockId: string) => {
    const existed = registryRef.current.delete(blockId);
    if (existed) {
      console.log(`[BlockTypeRegistry] Unregistered: ${blockId}`);
    }
  }, []);

  const getBlockType = useCallback((blockId: string): BlockType | null => {
    return registryRef.current.get(blockId) || null;
  }, []);

  const isSpecialBlock = useCallback((blockId: string): boolean => {
    const type = registryRef.current.get(blockId);
    return type ? SPECIAL_BLOCK_TYPES.includes(type) : false;
  }, []);

  const getSpecialBlocks = useCallback((blockIds: string[]): Array<{ id: string; type: BlockType }> => {
    const result: Array<{ id: string; type: BlockType }> = [];

    for (const id of blockIds) {
      const type = registryRef.current.get(id);
      if (type && SPECIAL_BLOCK_TYPES.includes(type)) {
        result.push({ id, type });
      }
    }

    return result;
  }, []);

  const getBlocksByType = useCallback((type: BlockType): string[] => {
    const result: string[] = [];

    for (const [id, blockType] of registryRef.current.entries()) {
      if (blockType === type) {
        result.push(id);
      }
    }

    return result;
  }, []);

  const clear = useCallback(() => {
    console.log("[BlockTypeRegistry] Clearing all blocks");
    registryRef.current.clear();
  }, []);

  const getAllBlocks = useCallback((): Map<string, BlockType> => {
    return new Map(registryRef.current);
  }, []);

  return {
    registerBlock,
    unregisterBlock,
    getBlockType,
    isSpecialBlock,
    getSpecialBlocks,
    getBlocksByType,
    clear,
    getAllBlocks,
  };
}

// Optional: Create a context-based version if needed for sharing across components
import { createContext, useContext, type ReactNode } from "react";

const BlockTypeRegistryContext = createContext<BlockTypeRegistry | null>(null);

export function BlockTypeRegistryProvider({ children }: { children: ReactNode }) {
  const registry = useBlockTypeRegistry();

  return (
    <BlockTypeRegistryContext.Provider value={registry}>
      {children}
    </BlockTypeRegistryContext.Provider>
  );
}

export function useBlockTypeRegistryContext(): BlockTypeRegistry {
  const ctx = useContext(BlockTypeRegistryContext);
  if (!ctx) {
    throw new Error("useBlockTypeRegistryContext must be used within BlockTypeRegistryProvider");
  }
  return ctx;
}
