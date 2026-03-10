import { useState, useCallback, useRef } from "react";
import { postWithAuth } from "@/lib/api-helpers";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { Block } from "@/types/block";

export const useLazyBlockLoader = () => {
    const { upsertBlocks, getBlock } = useGlobalBlocks();
    const [loading, setLoading] = useState(false);
    // Track IDs that are currently being fetched to prevent duplicate in-flight requests
    const fetchingIds = useRef<Set<string>>(new Set());

    const loadBlocks = useCallback(async (parentBlockIds: string[]) => {
        if (!parentBlockIds || parentBlockIds.length === 0) return;

        // 1. Identify all child blocks that need to be loaded
        const uniqueChildrenIds = new Set<string>();

        parentBlockIds.forEach(parentId => {
            const parentBlock = getBlock(parentId);
            if (parentBlock && parentBlock.blockIds) {
                parentBlock.blockIds.forEach(childId => {
                    uniqueChildrenIds.add(childId);
                });
            }
        });

        // 2. Filter out children that are already loaded in the global context
        // AND filter out children that are currently being fetched
        const missingChildIds = Array.from(uniqueChildrenIds).filter(childId => {
            const isLoaded = !!getBlock(childId);
            const isFetching = fetchingIds.current.has(childId);
            return !isLoaded && !isFetching;
        });

        if (missingChildIds.length === 0) {
            // console.log(`[LazyBlockLoader] All ${uniqueChildrenIds.size} nested blocks are already loaded or being fetched.`);
            return;
        }

        console.log(`[LazyBlockLoader] Need to load ${missingChildIds.length} missing nested blocks (out of ${uniqueChildrenIds.size} total children).`);

        // Mark these IDs as fetching
        missingChildIds.forEach(id => fetchingIds.current.add(id));

        setLoading(true);
        try {
            // Process in batches of 100
            const batchSize = 100;
            for (let i = 0; i < missingChildIds.length; i += batchSize) {
                const batchNumber = Math.floor(i / batchSize) + 1;
                const totalBatches = Math.ceil(missingChildIds.length / batchSize);
                const batch = missingChildIds.slice(i, i + batchSize);

                try {
                    const res = await postWithAuth(`/api/blocks/get-many`, { blockIds: batch }) as { success: boolean, blocks: Block[] };

                    if (res.success && res.blocks && Array.isArray(res.blocks)) {
                        await upsertBlocks(res.blocks);
                    }
                } catch (batchError) {
                } finally {
                    // Remove processed batch IDs from fetching set, whether success or fail, allows retry if failed
                    batch.forEach(id => fetchingIds.current.delete(id));
                }
            }
        } catch (error) {
            console.error("[LazyBlockLoader] Error in loadBlocks:", error);
            // Cleanup all remaining if major error
            missingChildIds.forEach(id => fetchingIds.current.delete(id));
        } finally {
            setLoading(false);
        }
    }, [upsertBlocks, getBlock]);

    return { loadBlocks, loading };
};
