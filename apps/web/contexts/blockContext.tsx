"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Block } from "@/types/block";

/**
 * Global Block Context
 *
 * Stores ALL blocks in the workspace with their metadata.
 *
 * Responsibilities:
 * - Store all blocks with full metadata (Map<blockId, Block>)
 * - Maintain parent-child relationships (children index)
 * - Provide fast lookups by blockId
 * - Get children of any block
 * - Load blocks from API response
 */

interface BlockContextValue {
  // Global block storage
  blocks: Map<string, Block>;

  // Get a single block by ID
  getBlock: (blockId: string) => Block | undefined;

  // Get children of a block (returns blockIds[])
  getChildren: (blockId: string) => string[];

  // Get all children blocks with full data
  getChildrenBlocks: (blockId: string) => Block[];

  // Update a single block
  updateBlock: (blockId: string, updates: Partial<Block>) => void;

  // Load blocks from API response (replaces all)
  loadBlocks: (blocks: Block[]) => void;

  // Upsert blocks: Update if exists, add if not
  upsertBlocks: (blocks: Block[]) => Promise<void>;

  // Add a single block
  addBlock: (block: Block) => void;

  // Remove a block
  removeBlock: (blockId: string) => void;

  // Check if block exists
  hasBlock: (blockId: string) => boolean;

  // Get all blocks as array
  getAllBlocks: () => Block[];

  // Get block order for a specific page (from blockIds)
  getBlockOrder: (pageId: string) => string[];

  // Update block order for a page
  updateBlockOrder: (pageId: string, newOrder: string[]) => void;
}

const BlockContext = createContext<BlockContextValue | null>(null);

export function useGlobalBlocks() {
  const ctx = useContext(BlockContext);
  if (!ctx) throw new Error("useGlobalBlocks must be used within GlobalBlockProvider");
  return ctx;
}

interface GlobalBlockProviderProps {
  children: React.ReactNode;
  initialBlocks?: Block[];
}

export const GlobalBlockProvider: React.FC<GlobalBlockProviderProps> = ({
  children,
  initialBlocks = []
}) => {
  // Main storage: Map<blockId, Block>
  const [blocksMap, setBlocksMap] = useState<Map<string, Block>>(() => {
    const map = new Map<string, Block>();
    initialBlocks.forEach(block => map.set(block._id, block));
    return map;
  });

  const blocksRef = useRef(blocksMap);
  blocksRef.current = blocksMap;

  useEffect(() => {
    console.log('[GlobalBlockContext] Total blocks:', blocksMap.size,blocksMap);
  }, [blocksMap]);

  // Get a single block
  const getBlock = useCallback((blockId: string): Block | undefined => {
    return blocksRef.current.get(blockId);
  }, []);

  // Get children block IDs from a block's blockIds array
  const getChildren = useCallback((blockId: string): string[] => {
    const block = blocksRef.current.get(blockId);
    return block?.blockIds || [];
  }, []);

  // Get children blocks with full data
  const getChildrenBlocks = useCallback((blockId: string): Block[] => {
    const childIds = getChildren(blockId);
    return childIds
      .map(id => blocksRef.current.get(id))
      .filter((b): b is Block => b !== undefined);
  }, [getChildren]);

  // Update a block
  const updateBlock = useCallback((blockId: string, updates: Partial<Block>) => {
    console.log('............[GlobalBlockContext] Updating block:', blockId, updates);
    setBlocksMap(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(blockId);
      if (existing) {
        newMap.set(blockId, { ...existing, ...updates });
      }
      return newMap;
    });
  }, []);

  // Load blocks from API (replaces all blocks)
  const loadBlocks = useCallback((blocks: Block[]) => {
    console.log('[GlobalBlockContext] Loading', blocks.length, 'blocks');
    const newMap = new Map<string, Block>();
    blocks.forEach(block => newMap.set(block._id, block));
    setBlocksMap(newMap);
  }, []);

  // Upsert blocks: Update if exists, add if not 
  const upsertBlocks = useCallback((blocks: Block[]): Promise<void> => {
    return new Promise((resolve) => {  
      const newMap = new Map(blocksRef.current);
      blocks.forEach(block => {
        newMap.set(block._id, block);
      });
      blocksRef.current = newMap;  
      setBlocksMap(newMap);     
      setTimeout(() => resolve(), 0);
    });
  }, []);

  // Add a single block
  const addBlock = useCallback((block: Block) => {
    console.log('[GlobalBlockContext] Adding block:', block._id);
    setBlocksMap(prev => {
      const newMap = new Map(prev);
      newMap.set(block._id, block);
      return newMap;
    });
  }, []);

  // Remove a block
  const removeBlock = useCallback((blockId: string) => {
    console.log('[GlobalBlockContext] Removing block:', blockId);
    setBlocksMap(prev => {
      const newMap = new Map(prev);
      newMap.delete(blockId);
      return newMap;
    });
  }, []);

  // Check if block exists
  const hasBlock = useCallback((blockId: string): boolean => {
    return blocksRef.current.has(blockId);
  }, []);

  // Get all blocks as array
  const getAllBlocks = useCallback((): Block[] => {
    return Array.from(blocksRef.current.values());
  }, []);

  // LEGACY: Get block order for a specific page
  const getBlockOrder = useCallback((pageId: string): string[] => {
    const page = blocksRef.current.get(pageId);
    return page?.blockIds || [];
  }, []);

  // LEGACY: Update block order for a page
  const updateBlockOrder = useCallback((pageId: string, newOrder: string[]) => {
    console.log('[GlobalBlockContext] Updating block order for page:', pageId, newOrder);
    updateBlock(pageId, { blockIds: newOrder });
  }, [updateBlock]);

  const value: BlockContextValue = {
    blocks: blocksMap,
    getBlock,
    getChildren,
    getChildrenBlocks,
    updateBlock,
    loadBlocks,
    upsertBlocks,
    addBlock,
    removeBlock,
    hasBlock,
    getAllBlocks,
    getBlockOrder,
    updateBlockOrder,
  };

  return (
    <BlockContext.Provider value={value}>
      {children}
    </BlockContext.Provider>
  );
};
