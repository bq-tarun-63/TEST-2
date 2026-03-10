import { ObjectId, type Collection } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import type { IBlock, IHistoryEntryDocument, IBlockHistoryEntry, ParentTable } from "@/models/types/Block";
import { IDatabaseSource } from "@/models/types/DatabaseSource";

/**
 * Get collections for a parent block and its history container
 */
async function getParentBlockCollections(parentId: string, workspaceId?: string): Promise<{
    parentBlock: IBlock | any | null; // Allow IDatabaseSource
    blocksColl: Collection<IBlock>;
    historyColl: Collection<IHistoryEntryDocument>;
    parentCollectionName: string;
}> {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const blocksColl = metadataDb.collection<IBlock>("blocks");
    const historyColl = metadataDb.collection<IHistoryEntryDocument>("history_entries");

    let parentCollectionName = "blocks";
    let parentBlock: IBlock | any | null = await blocksColl.findOne({ _id: new ObjectId(parentId) });

    if (!parentBlock) {
        // Fallback: Check if it's a Database Source (Collection)
        // User reports "view-database" issues, which usually map to databaseSources
        const dataSourcesColl = metadataDb.collection<IDatabaseSource>("databaseSources");
        parentBlock = await dataSourcesColl.findOne({ _id: new ObjectId(parentId) });
        if (parentBlock) {
            parentCollectionName = "databaseSources";
        }
    }

    return { parentBlock, blocksColl, historyColl, parentCollectionName };
}

/**
 * Calculate next version number for a block
 */
function getNextVersion(history: IBlockHistoryEntry[] | undefined): string {
    if (!history || history.length === 0) {
        return "v1";
    }

    const versions = history
        .map((entry) => entry.version)
        .filter((v) => v && v.startsWith("v"))
        .map((v) => parseInt(v.replace("v", ""), 10))
        .filter((n) => !isNaN(n));

    if (versions.length === 0) {
        return "v1";
    }

    const maxVersion = Math.max(...versions);
    return `v${maxVersion + 1}`;
}

/**
 * Infer block type based on content properties
 */
function inferBlockType(content: any): "page" | "collection_view" | "content" {
    if (!content) return "content";
    if (content.pageType) return "page";
    if (content.viewsTypes) return "collection_view";
    return "content";
}

export const BlockSnapshotService = {
    /**
     * Create snapshots for all changed blocks under a parent (Recursive for Content)
     * Called when inactivity timer fires
     */
    async createSnapshotAfterInactivity({
        parentId,
        workspaceId,
        authorId,
    }: {
        parentId: string;
        workspaceId: string;
        authorId?: string;
    }): Promise<{
        historyId: string;
        snapshotCount: number;
        changedBlockIds: string[];
    }> {
        const now = new Date();

        // 1. Get parent block and collections
        const { parentBlock, blocksColl, historyColl, parentCollectionName } = await getParentBlockCollections(parentId, workspaceId);

        if (!parentBlock) {
            throw new Error("Parent block not found");
        }

        // 2. Determine last snapshot time
        // If lastSnapshotTime is missing, default to 0 to ensure we snapshot at least once (initial creation)
        const lastSnapshotTime = parentBlock.lastSnapshotTime || new Date(0);

        // 3. Get all current blocks (Recursive BFS)
        const initialBlockIds = parentBlock.blockIds || [];
        if (initialBlockIds.length === 0) {
            return { historyId: "", snapshotCount: 0, changedBlockIds: [] };
        }

        // BFS to find ALL descendant blocks (stopping at Page/Collection boundaries)
        const allDescendantBlocks: IBlock[] = [];
        const processedIds = new Set<string>();
        const idsToFetch = [...initialBlockIds];

        // We fetch in batches to avoid massive single queries
        while (idsToFetch.length > 0) {
            const currentBatch = idsToFetch.splice(0, 100);
            const currentBatchObjectIds = currentBatch
                .filter(id => !processedIds.has(id))
                .map(id => new ObjectId(id));

            if (currentBatchObjectIds.length === 0) continue;

            const fetchedBlocks = await blocksColl.find({ _id: { $in: currentBatchObjectIds } }).toArray();

            for (const block of fetchedBlocks) {
                const blockIdStr = String(block._id);
                if (!processedIds.has(blockIdStr)) {
                    allDescendantBlocks.push(block);
                    processedIds.add(blockIdStr);

                    // RECURSION RULES:
                    // 1. Content blocks: Recurse into their children
                    if (block.blockType === "content" && block.blockIds && block.blockIds.length > 0) {
                        for (const childId of block.blockIds) {
                            if (!processedIds.has(childId)) {
                                idsToFetch.push(childId);
                            }
                        }
                    }

                    // 2. Collection View blocks: Follow the data source and snapshot database pages
                    // This ensures we capture when rows are added/removed/renamed in embedded databases
                    else if (block.blockType === "collection_view") {
                        const metadataClient = await clusterManager.getMetadataClient();
                        const metadataDb = metadataClient.db();
                        const dataSourcesColl = metadataDb.collection<IDatabaseSource>("databaseSources");

                        // Extract data source IDs from the collection view's viewsTypes
                        const viewDatabase = block.value as any;
                        if (viewDatabase?.viewsTypes && Array.isArray(viewDatabase.viewsTypes)) {
                            for (const viewType of viewDatabase.viewsTypes) {
                                if (viewType.databaseSourceId) {
                                    const dataSource = await dataSourcesColl.findOne({
                                        _id: new ObjectId(viewType.databaseSourceId)
                                    });

                                    if (dataSource && dataSource.blockIds) {
                                        // Add all database page IDs to the snapshot queue
                                        // We'll snapshot their titles/properties but NOT recurse into their content
                                        for (const pageId of dataSource.blockIds) {
                                            if (!processedIds.has(pageId)) {
                                                idsToFetch.push(pageId);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 3. Page blocks: STOP - don't recurse into nested pages
                    // (This is intentional - nested pages have their own independent snapshots)
                }
            }
        }

        // 4. Find blocks that changed since last snapshot
        // We now check ALL descendants we found, not just direct children
        const changedBlocks = allDescendantBlocks.filter((block) => {
            const blockUpdatedAt = block.updatedAt || block.createdAt || new Date(0);
            return blockUpdatedAt > lastSnapshotTime;
        });

        if (changedBlocks.length === 0) {
            return { historyId: "", snapshotCount: 0, changedBlockIds: [] };
        }

        const historyId = uuidv4();
        const historyType = parentCollectionName === "databaseSources" ? "databaseSource" : "block";

        // 7. Update parent's structural history in history_entries
        const parentHistoryDoc = await historyColl.findOne({ blockId: parentId }) || {
            blockId: parentId,
            type: historyType,
            workspaceId,
            blockIdsHistory: [],
            history: [], // Initialize content history
            createdAt: now
        } as any; // Cast to any to avoid strict type checks temporarily during migration, or type properly as IHistoryEntryDocument

        const blockIdsHistory = parentHistoryDoc.blockIdsHistory || [];
        const lastHistEntry = blockIdsHistory[blockIdsHistory.length - 1];
        if (lastHistEntry) {
            lastHistEntry.dead = now;
        }

        // Calculate consistent version number based on structure history length
        // This ensures version numbers align with the blockIdsHistory index
        const structureVersion = blockIdsHistory.length + 1;
        const newVersionStr = `v${structureVersion}`;

        blockIdsHistory.push({
            historyId,
            blockIds: [...initialBlockIds], // Store only direct children structure at root level
            createdAt: now,
        });

        // ALSO update the 'history' array for the parent block to keep versions in sync
        const parentContentHistory = parentHistoryDoc.history || [];
        const lastContentEntry = parentContentHistory[parentContentHistory.length - 1];
        if (lastContentEntry) {
            lastContentEntry.dead = now;
        }

        parentContentHistory.push({
            content: parentBlock.value, // Snapshot current content even if unchanged
            version: newVersionStr,
            createdAt: now
        });

        await historyColl.updateOne(
            { blockId: parentId },
            {
                $set: {
                    type: historyType,
                    blockIdsHistory,
                    history: parentContentHistory, // Update history as well
                    workspaceId,
                    // updatedAt: now // Field not in schema but good practice
                },
                $setOnInsert: { createdAt: now }
            },
            { upsert: true }
        );

        // 8. Snapshot changed blocks
        // Using bulkWrite for efficiency if many blocks changed could be better, but loop is safer for now with complex logic
        for (const block of changedBlocks) {
            const blockIdStr = String(block._id);
            const historyDoc = await historyColl.findOne({ blockId: blockIdStr }) || {
                blockId: blockIdStr,
                type: "block",
                workspaceId,
                history: [],
                createdAt: now
            };

            const history = historyDoc.history || [];
            const lastEntry = history[history.length - 1];
            if (lastEntry) {
                lastEntry.dead = now;
            }

            const nextVersion = getNextVersion(history);
            history.push({
                content: JSON.parse(JSON.stringify(block.value)),
                // If it's a content block, we must also snapshot its structure (blockIds) strictly speaking?
                // The current schema stores 'blockIds' in 'blockIdsHistory' only for parent containers?
                // Wait, standard blocks store content in 'history'. But if they have children (blockIds), that structure
                // needs to be preserved too. 
                // However, the original code only saved 'content' (block.value).
                // If we restore, we need 'blockIds'. 
                // Let's check `getParentContentAtVersion` restore logic below. It expects `childBlockIds` from `getParentBlockIdsAtTimestamp`.
                // `getParentBlockIdsAtTimestamp` looks at `blockIdsHistory` collection.
                // So if a generic content block has children, we need to save its structure in `blockIdsHistory` too!
                // The original code DID NOT do this for children. It only did it for the main Parent.
                // WE MUST FIX THIS: If the changed block has children, we must update its `blockIdsHistory` as well.
                version: nextVersion,
                createdAt: now,
            });

            await historyColl.updateOne(
                { blockId: blockIdStr },
                {
                    $set: {
                        type: "block",
                        history,
                        workspaceId
                    },
                    $setOnInsert: { createdAt: now }
                },
                { upsert: true }
            );

            // snapshot structure for this block if it has children
            if (block.blockIds && block.blockIds.length > 0) {
                const childHistoryDoc = await historyColl.findOne({ blockId: blockIdStr }) || {
                    blockId: blockIdStr,
                    type: "block",
                    workspaceId,
                    blockIdsHistory: [],
                    createdAt: now
                };

                const childBlockIdsHistory = childHistoryDoc.blockIdsHistory || [];
                const lastChildEntry = childBlockIdsHistory[childBlockIdsHistory.length - 1];
                if (lastChildEntry) {
                    lastChildEntry.dead = now;
                }

                childBlockIdsHistory.push({
                    historyId,
                    blockIds: [...block.blockIds],
                    createdAt: now,
                });

                await historyColl.updateOne(
                    { blockId: blockIdStr },
                    { $set: { type: "block", blockIdsHistory: childBlockIdsHistory } }
                );
            }
        }

        // 8.5. Snapshot Data Sources for collection_view blocks
        // CRITICAL: We check ALL collection_view blocks, not just changed ones!
        // Why? When you add/remove rows in a database:
        //   - The data source changes (blockIds updated)
        //   - The collection_view block does NOT change (view settings stay the same)
        //   - If we only checked changedBlocks, we'd never snapshot the data source
        // This ensures data sources are snapshotted whenever their content changes,
        // even if the view block itself hasn't changed.
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const dataSourcesColl = metadataDb.collection<IDatabaseSource>("databaseSources");

        const collectionViewBlocks = allDescendantBlocks.filter(b => b.blockType === "collection_view");

        for (const cvBlock of collectionViewBlocks) {
            const viewDatabase = cvBlock.value as any;
            if (viewDatabase?.viewsTypes && Array.isArray(viewDatabase.viewsTypes)) {
                for (const viewType of viewDatabase.viewsTypes) {
                    if (viewType.databaseSourceId) {
                        const dataSourceId = String(viewType.databaseSourceId);
                        const dataSource = await dataSourcesColl.findOne({
                            _id: new ObjectId(dataSourceId)
                        });

                        if (dataSource) {
                            // Check if data source has changed since last snapshot
                            const dsUpdatedAt = dataSource.updatedAt || dataSource.createdAt || new Date(0);

                            if (dsUpdatedAt > lastSnapshotTime) {
                                // Snapshot the data source structure
                                const dsHistoryDoc = await historyColl.findOne({ blockId: dataSourceId }) || {
                                    blockId: dataSourceId,
                                    type: "databaseSource",
                                    workspaceId,
                                    history: [],
                                    blockIdsHistory: [],
                                    createdAt: now
                                };

                                // Snapshot content (properties, settings, etc.)
                                const dsHistory = dsHistoryDoc.history || [];
                                const lastDsEntry = dsHistory[dsHistory.length - 1];
                                if (lastDsEntry) {
                                    lastDsEntry.dead = now;
                                }

                                const nextDsVersion = getNextVersion(dsHistory);
                                dsHistory.push({
                                    content: {
                                        title: dataSource.title,
                                        properties: dataSource.properties,
                                        settings: dataSource.settings,
                                        isSprint: dataSource.isSprint,
                                        isSprintOn: dataSource.isSprintOn ?? false,
                                        mainView: dataSource.mainView
                                    },
                                    version: nextDsVersion,
                                    createdAt: now,
                                });

                                // Snapshot structure (blockIds - the list of pages in the database)
                                const dsBlockIdsHistory = dsHistoryDoc.blockIdsHistory || [];
                                const lastDsStructEntry = dsBlockIdsHistory[dsBlockIdsHistory.length - 1];
                                if (lastDsStructEntry) {
                                    lastDsStructEntry.dead = now;
                                }

                                dsBlockIdsHistory.push({
                                    historyId,
                                    blockIds: [...(dataSource.blockIds || [])],
                                    createdAt: now,
                                });

                                await historyColl.updateOne(
                                    { blockId: dataSourceId },
                                    {
                                        $set: {
                                            type: "databaseSource",
                                            history: dsHistory,
                                            blockIdsHistory: dsBlockIdsHistory,
                                            workspaceId
                                        },
                                        $setOnInsert: { createdAt: now }
                                    },
                                    { upsert: true }
                                );
                            }
                        }
                    }
                }
            }
        }

        // 9. Update parent block's lastSnapshotTime
        await blocksColl.updateOne(
            { _id: new ObjectId(parentId) },
            { $set: { lastSnapshotTime: now, updatedAt: now } }
        );

        return {
            historyId,
            snapshotCount: changedBlocks.length,
            changedBlockIds: changedBlocks.map((b) => String(b._id)),
        };
    },

    /**
     * Get block content at a specific version
     */
    async getBlockContentAtVersion({
        blockId,
        version,
    }: {
        blockId: string;
        version: string;
    }): Promise<any | null> {
        const { historyColl } = await getParentBlockCollections(blockId);
        const historyDoc = await historyColl.findOne({ blockId });
        if (!historyDoc || !historyDoc.history) return null;

        const entry = historyDoc.history.find((h) => h.version === version);
        return entry?.content || null;
    },

    /**
     * Get block content at a specific timestamp
     */
    async getBlockContentAtTimestamp({
        blockId,
        timestamp,
    }: {
        blockId: string;
        timestamp: Date;
    }): Promise<any> {
        const { blocksColl, historyColl } = await getParentBlockCollections(blockId);
        const historyDoc = await historyColl.findOne({ blockId });

        if (historyDoc && historyDoc.history) {
            const entry = historyDoc.history.find(
                (h) => h.createdAt <= timestamp && (h.dead === undefined || h.dead > timestamp)
            );
            if (entry) return entry.content;
        }

        // Fallback to current block value
        const block = await blocksColl.findOne({ _id: new ObjectId(blockId) });
        return block?.value || null;
    },

    /**
     * Get parent structure at a specific timestamp
     */
    async getParentBlockIdsAtTimestamp({
        parentId,
        timestamp,
    }: {
        parentId: string;
        timestamp: Date;
    }): Promise<string[]> {
        const { parentBlock, historyColl } = await getParentBlockCollections(parentId);
        const historyDoc = await historyColl.findOne({ blockId: parentId });

        if (historyDoc && historyDoc.blockIdsHistory) {
            const entry = historyDoc.blockIdsHistory.find(
                (h) => h.createdAt <= timestamp && (h.dead === undefined || h.dead > timestamp)
            );
            if (entry) return entry.blockIds;
        }

        return parentBlock?.blockIds || [];
    },

    /**
     * Get all structural history entries for a parent
     */
    async getParentHistory(parentId: string): Promise<any[]> {
        const { historyColl } = await getParentBlockCollections(parentId);
        const doc = await historyColl.findOne({ blockId: parentId });
        return doc?.blockIdsHistory || [];
    },

    /**
     * Reconstruct the content of a parent block at a specific version (based on structure index)
     */
    async getParentContentAtVersion({
        parentId,
        versionIndex,
    }: {
        parentId: string;
        versionIndex: number; // 0-indexed
    }): Promise<{
        blocks: IBlock[];
        blockIds: string[];
        dataSources: any[];  // Historical data source objects
        fetchTime: string;
    }> {
        const { historyColl, parentBlock, blocksColl } = await getParentBlockCollections(parentId);
        const historyDoc = await historyColl.findOne({ blockId: parentId });

        if (!historyDoc || !historyDoc.blockIdsHistory) {
            throw new Error("No history found");
        }

        const historyEntry = historyDoc.blockIdsHistory[versionIndex];
        if (!historyEntry) {
            throw new Error(`Version index ${versionIndex} not found`);
        }

        const timestamp = historyEntry.createdAt;
        const rootBlockIds = historyEntry.blockIds || [];
        const workspaceId = historyDoc.workspaceId || parentBlock?.workspaceId || "";

        // Determine parentType for the children based on the parent block
        let childParentType: ParentTable = "block";
        if (parentBlock) {
            if (parentBlock.blockType === "page") {
                childParentType = "page";
            } else {
                childParentType = "block";
            }
        }

        const recoveredBlocks: IBlock[] = [];
        const idsToFetch = [...rootBlockIds];
        const processedIds = new Set<string>();
        const dataSources: any[] = []; // Collect historical data sources

        // Optimized Batched BFS for Restoration
        while (idsToFetch.length > 0) {
            const currentBatch = idsToFetch.splice(0, 100);
            const batchIds = currentBatch.filter(id => !processedIds.has(id));

            if (batchIds.length === 0) continue;

            // Fetch History Docs for ALL in batch
            const batchHistoryDocs = await historyColl.find({
                blockId: { $in: batchIds }
            }).toArray();

            // Also fetch current blocks for static metadata fallback (createdBy, workareaId)
            const batchCurrentBlocks = await blocksColl.find({
                _id: { $in: batchIds.map(id => new ObjectId(id)) }
            }).toArray();
            const currentBlockMap = new Map(batchCurrentBlocks.map(b => [String(b._id), b]));
            const historyDocMap = new Map(batchHistoryDocs.map(d => [d.blockId, d]));

            for (const id of batchIds) {
                processedIds.add(id);

                const histDoc = historyDocMap.get(id);
                const currentBlock = currentBlockMap.get(id);

                let content: any = null;
                let childBlockIds: string[] = [];
                let blockType: any = "content"; // Default

                // Logic to find valid entry in history arrays
                if (histDoc) {
                    // 1. Content
                    if (histDoc.history) {
                        const contentEntry = histDoc.history.find(
                            (h) => h.createdAt <= timestamp && (h.dead === undefined || h.dead > timestamp)
                        );
                        if (contentEntry) content = contentEntry.content;
                    }

                    // 2. Structure (Children)
                    if (histDoc.blockIdsHistory) {
                        const structureEntry = histDoc.blockIdsHistory.find(
                            (h) => h.createdAt <= timestamp && (h.dead === undefined || h.dead > timestamp)
                        );
                        if (structureEntry) childBlockIds = structureEntry.blockIds || [];
                    }
                }

                // Fallback to current if no history (approximate best effort for strict missing data)
                // Or if block didn't exist back then? If it didn't exist, we probably shouldn't return it.
                // But if the parent *referenced* it in `blockIds`, it likely existed.
                if (content === null && currentBlock) {
                    content = currentBlock.value;
                    blockType = currentBlock.blockType;
                    // If fallback to current content, we probably strictly shouldn't fallback to current children 
                    // unless we are sure. But consistently, if history is missing, we check current.
                    if (childBlockIds.length === 0) childBlockIds = currentBlock.blockIds || [];
                } else if (content) {
                    blockType = inferBlockType(content);
                }

                // If completely missing, skip (it might have been deleted and cleaned up, or data corruption)
                if (content === null && !currentBlock) continue;

                const recoveredBlock: IBlock = {
                    _id: new ObjectId(id),
                    blockType,

                    parentId, // This isn't strictly accurate for nested items (parentId would be their actual parent), but for restoration flat list it might be okay or we should track specific parent.
                    // Ideally we should track the parent from the loop, but in a BFS flat list return, the frontend usually re-nests based on blockIds map.
                    parentType: childParentType, // Approximate
                    value: content,
                    blockIds: childBlockIds,
                    createdBy: currentBlock?.createdBy || { userId: "", userName: "", userEmail: "" },
                    workareaId: currentBlock?.workareaId,
                    // PRESERVE ACLS: Since we don't snapshot permissions, we must keep the current ones
                    aclIds: currentBlock?.aclIds,
                    // PRESERVE WORKSPACE: Keep logic consistent
                    workspaceId: currentBlock?.workspaceId || workspaceId,
                    status: "alive",
                    createdAt: timestamp,
                    updatedAt: timestamp,
                };

                recoveredBlocks.push(recoveredBlock);

                // RECURSION RULES: Match the creation logic
                // 1. Content blocks: Recurse into their children
                if (blockType === "content" && childBlockIds.length > 0) {
                    for (const childId of childBlockIds) {
                        if (!processedIds.has(childId)) {
                            idsToFetch.push(childId);
                        }
                    }
                }

                // 2. Collection View blocks: Follow the data source and restore database pages
                else if (blockType === "collection_view") {
                    const metadataClient = await clusterManager.getMetadataClient();
                    const metadataDb = metadataClient.db();

                    // Extract data source IDs from the restored collection view's viewsTypes
                    const viewDatabase = content as any;
                    if (viewDatabase?.viewsTypes && Array.isArray(viewDatabase.viewsTypes)) {
                        for (const viewType of viewDatabase.viewsTypes) {
                            if (viewType.databaseSourceId) {
                                const dataSourceId = String(viewType.databaseSourceId);

                                // CRITICAL FIX: Restore data source from HISTORICAL snapshot, not current state
                                const dsHistoryDoc = await historyColl.findOne({ blockId: dataSourceId });

                                let historicalBlockIds: string[] = [];
                                let historicalDataSourceContent: any = null;

                                if (dsHistoryDoc) {
                                    // 1. Get historical content (schema, properties, settings)
                                    if (dsHistoryDoc.history) {
                                        const dsContentEntry = dsHistoryDoc.history.find(
                                            (h) => h.createdAt <= timestamp && (h.dead === undefined || h.dead > timestamp)
                                        );
                                        if (dsContentEntry) {
                                            historicalDataSourceContent = dsContentEntry.content;
                                        }
                                    }

                                    // 2. Get historical blockIds (page list)
                                    if (dsHistoryDoc.blockIdsHistory) {
                                        dsHistoryDoc.blockIdsHistory.forEach((h: any, i: number) => {
                                        });

                                        // Find the blockIds structure valid at the target timestamp
                                        const dsStructureEntry = dsHistoryDoc.blockIdsHistory.find(
                                            (h) => h.createdAt <= timestamp && (h.dead === undefined || h.dead > timestamp)
                                        );

                                        if (dsStructureEntry) {
                                            historicalBlockIds = dsStructureEntry.blockIds || [];
                                        } else {
                                        }
                                    }
                                }

                                // Fallback to current data source if no history found
                                const dataSourcesColl = metadataDb.collection<IDatabaseSource>("databaseSources");
                                const currentDataSource = await dataSourcesColl.findOne({
                                    _id: new ObjectId(dataSourceId)
                                });

                                if (historicalBlockIds.length === 0 && currentDataSource?.blockIds) {
                                    historicalBlockIds = currentDataSource.blockIds;
                                }

                                if (!historicalDataSourceContent && currentDataSource) {
                                    historicalDataSourceContent = {
                                        title: currentDataSource.title,
                                        properties: currentDataSource.properties,
                                        settings: currentDataSource.settings,
                                        isSprint: currentDataSource.isSprint,
                                        isSprintOn: currentDataSource.isSprintOn ?? false,
                                        mainView: currentDataSource.mainView
                                    };
                                }

                                // Add historical data source to the response
                                if (historicalDataSourceContent) {
                                    dataSources.push({
                                        _id: dataSourceId,
                                        ...historicalDataSourceContent,
                                        blockIds: historicalBlockIds,
                                        workspaceId: currentDataSource?.workspaceId || workspaceId,
                                        createdBy: currentDataSource?.createdBy || { userId: "", userName: "", userEmail: "" },
                                        createdAt: timestamp,
                                        updatedAt: timestamp
                                    });
                                }

                                // Add historical database page IDs to the restoration queue
                                for (const pageId of historicalBlockIds) {
                                    if (!processedIds.has(pageId)) {
                                        idsToFetch.push(pageId);
                                    }
                                }
                            }
                        }
                    }
                }

                // 3. Page blocks: STOP - don't recurse into nested pages
                // (Nested pages have their own independent snapshots)
            }
        }

        return {
            blocks: recoveredBlocks,
            blockIds: rootBlockIds,
            dataSources,  // Include historical data sources
            fetchTime: timestamp.toISOString(),
        };
    },
    /**
     * Restore a specific version structure and content
 
     */

    async getSnapshot(parentId: string, version: string) {
        // Convert "v3" -> 2 (0-based index)
        const versionIndex = (typeof version === 'string' && version.startsWith('v'))
            ? parseInt(version.substring(1)) - 1
            : Number(version) - 1;

        return this.getParentContentAtVersion({
            parentId,
            versionIndex
        });
    },

    /**
     * Restore a specific version structure and content
     */
    async restoreVersion({
        parentId,
        version
    }: {
        parentId: string;
        version: string;
    }) {
        const RestoredContent = await this.getSnapshot(parentId, version);

        // Check if we got valid content (either blocks or at least a blockIds list)
        if (!RestoredContent || (RestoredContent.blocks.length === 0 && RestoredContent.blockIds.length === 0)) {
            throw new Error("No snapshot found for the given parentId and version");
        }

        const { blocks, blockIds, dataSources, fetchTime } = RestoredContent;

        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");
        const dataSourcesColl = metadataDb.collection<IDatabaseSource>("databaseSources");

        // 1. update all the blocks with the new restored-content
        if (blocks.length > 0) {
            const blockOps = blocks.map(block => {
                // Ensure _id is an ObjectId to avoid "immutable field" errors
                const blockId = new ObjectId(String(block._id));
                return {
                    replaceOne: {
                        filter: { _id: blockId },
                        replacement: {
                            ...block,
                            _id: blockId, // Explicitly set as ObjectId
                            updatedAt: new Date() // Force update timestamp
                        },
                        upsert: true
                    }
                };
            });
            await blocksColl.bulkWrite(blockOps);
        }
        // 2. update all the dataSources with the new restored-content
        if (dataSources && dataSources.length > 0) {
            const dsOps = dataSources.map(ds => {
                // Ensure _id is an ObjectId to avoid "immutable field" errors
                const dsId = new ObjectId(String(ds._id));
                return {
                    replaceOne: {
                        filter: { _id: dsId },
                        replacement: {
                            ...ds,
                            _id: dsId, // Explicitly set as ObjectId
                            updatedAt: new Date()
                        },
                        upsert: true
                    }
                };
            });
            await dataSourcesColl.bulkWrite(dsOps);
        }

        // 3. update the parent with the new restored-blockIds and new restored-content
        await blocksColl.updateOne(
            { _id: new ObjectId(parentId) },
            {
                $set: {
                    blockIds: blockIds,
                    updatedAt: new Date()
                }
            }
        );

        return {
            restoredBlockCount: blocks.length,
            restoredDataSourceCount: dataSources ? dataSources.length : 0,
            timestamp: new Date(fetchTime)
        };
    }
}