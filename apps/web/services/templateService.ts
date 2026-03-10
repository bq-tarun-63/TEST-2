import clientPromise from "@/lib/mongoDb/mongodb";
import { IWorkspace } from "@/models/types/Workspace";
import { ObjectId } from "mongodb";
import { IBlock, IContent, IVeiwDatabase, BlockType, ParentTable, IPage } from "@/models/types/Block";
import { IDatabaseSource, PropertySchema } from "@/models/types/DatabaseSource";
import { IUser } from "@/models/types/User";
import { IPermission } from "@/models/types/Permission";

/**
 * Context for the cloning operation.
 * mappings: Maps old IDs to new IDs for Blocks, DataSources, Views, and Properties.
 */
interface CloneContext {
    idMap: Map<string, string>; // Old Block ID -> New Block ID
    sourceMap: Map<string, string>; // Old DataSource ID -> New DataSource ID
    propertyMap: Map<string, string>; // Old Property ID -> New Property ID
    viewMap: Map<string, string>; // Old View ID -> New View ID

    user: {
        id: string;
        email: string;
        name: string;
    };
    workspaceId: string;
    targetParentId: string; // Always set to workspaceId - the workspace where the template instance will be placed
    targetType?: "private" | "public" | "restricted";
}

interface TemplateDiscoveryResult {
    blocks: IBlock[];
    dataSources: IDatabaseSource[];
}

export const TemplateService = {
    /**
     * Main Entry Point: Instantiate a template block hierarchy.
     * Creates a deep copy of the template block, its children, and any referenced databases/rows.
     */
    async instantiateTemplate(
        templateBlockId: string,
        user: IUser,
        workspaceId: string,
        targetType?: "private" | "public" | "restricted"
    ): Promise<IBlock> {

        const client = await clientPromise();
        const db = client.db();
        const blocksColl = db.collection<IBlock>("blocks");
        const dataSourcesColl = db.collection<IDatabaseSource>("databaseSources");

        // 1. DISCOVERY PHASE
        const discovery = await this.discoverTemplateScope(templateBlockId, blocksColl, dataSourcesColl);

        // 2. MAPPING PHASE
        const context: CloneContext = {
            idMap: new Map(),
            sourceMap: new Map(),
            propertyMap: new Map(),
            viewMap: new Map(),
            user: {
                id: user.id || String(user._id),
                email: user.email || "",
                name: user.name || "Unknown",
            },
            workspaceId,
            targetParentId: workspaceId, // Parent is always workspace
            targetType
        };

        this.generateMappings(discovery, context);

        // 3. TRANSFORMATION PHASE
        const newDataSources = this.transformDataSources(discovery.dataSources, context);
        const newBlocks = this.transformBlocks(discovery.blocks, context, templateBlockId, []); // ACLs will be set recursively

        // Create permissions for every block in the hierarchy (Stacking approach)
        // ----------------------------------------------------------------------
        const permissionsColl = db.collection<IPermission>("permissions");

        // Start with empty ACLs - the root template block will create its own permission
        // and descendants will inherit from it through the stacking approach
        const baseAcls: string[] = [];

        const newPermissions: IPermission[] = [];
        const visitedBlockIds = new Set<string>();

        // Helper: Recursive ACL generation
        const processBlockACLs = (blockId: string, parentAcls: string[]) => {
            if (visitedBlockIds.has(blockId)) return;
            visitedBlockIds.add(blockId);

            const block = newBlocks.find(b => String(b._id) === blockId);
            if (!block) return;

            let currentAcls = parentAcls;

            // Strict Rule: Only Pages and Collection Views act as Permission Boundaries with ACLs.
            // Content blocks do NOT have ACL lists (empty) and do NOT generate new permissions.
            if (block.blockType === 'page' || block.blockType === 'collection_view') {
                // 1. Create unique permission for this boundary
                const newPermId = new ObjectId();
                const permission: IPermission = {
                    _id: newPermId,
                    subjects: [{
                        id: context.user.id,
                        role: "owner"
                    }],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                newPermissions.push(permission);

                // 2. Stack ACLs
                currentAcls = [...parentAcls, String(newPermId)];
                block.aclIds = currentAcls;
            } else {
                // Content block: No ACLs
                block.aclIds = [];
                // currentAcls remains as parentAcls for inheritance flow
            }

            // 3. Recurse to Children (Direct Blocks)
            // Note: newBlocks contains 'parentId'. We find children by scanning newBlocks (slow O(N^2) but mostly fine for templates)
            // Optimization: Build lookup map if needed. O(N) is better.
            const children = newBlocks.filter(b => b.parentId === blockId && b.parentType !== 'collection');
            children.forEach(child => processBlockACLs(String(child._id), currentAcls));

            // 4. Recurse to 'Rows' if this is a Collection View
            // Bridge: View -> DataSource -> Row
            if (block.blockType === 'collection_view' && block.value?.databaseSourceId) {
                const sourceId = String(block.value.databaseSourceId);
                const source = newDataSources.find(s => String(s._id) === sourceId);
                if (source && source.blockIds) {
                    source.blockIds.forEach(rowId => {
                        processBlockACLs(rowId, currentAcls);
                    });
                }
            }
        };

        // Start from Root
        const newRootId = context.idMap.get(templateBlockId);
        if (newRootId) {
            processBlockACLs(newRootId, baseAcls);
        }

        // Insert unique permissions
        if (newPermissions.length > 0) {
            await permissionsColl.insertMany(newPermissions);
        }

        // 4. PERSISTENCE PHASE
        if (newBlocks.length > 0) {
            await blocksColl.insertMany(newBlocks);
        }
        if (newDataSources.length > 0) {
            await dataSourcesColl.insertMany(newDataSources);
        }

        const rootBlock = newBlocks.find(b => String(b._id) === newRootId);
        if (!rootBlock) throw new Error("Root block not found in transformed blocks");

        // 5. UPDATE PAGE LISTS (Public/Private)
        // Add the new root block to appropriate page list based on targetType
        if (targetType === "public") {
            // Add to workspace publicPageIds
            const workspacesColl = db.collection<IWorkspace>("workspaces");
            await workspacesColl.updateOne(
                { _id: new ObjectId(workspaceId) },
                {
                    $addToSet: { publicPageIds: newRootId },
                    $set: { updatedAt: new Date() }
                }
            );
        } else if (targetType === "private") {
            // Add to user's workspace-specific privatePageIds
            const usersColl = db.collection<IUser>("users");

            // Use user._id directly (already an ObjectId from the API)
            const userObjectId = user._id!;

            const res = await usersColl.updateOne(
                { _id: userObjectId, "workspaceSettings.workspaceId": workspaceId },
                {
                    $addToSet: { "workspaceSettings.$.privatePageIds": newRootId } as any,
                    $set: { updatedAt: new Date() }
                }
            );

            // If no matching workspace settings found, create new entry
            if (res.matchedCount === 0) {
                await usersColl.updateOne(
                    { _id: userObjectId },
                    {
                        $push: { workspaceSettings: { workspaceId, privatePageIds: [newRootId] } } as any,
                        $set: { updatedAt: new Date() }
                    }
                );
            }
        }

        return rootBlock;
    },

    /**
     * Recursive discovery of all blocks and dependencies involved in the template.
     */
    async discoverTemplateScope(
        rootBlockId: string,
        blocksColl: any,
        dataSourcesColl: any
    ): Promise<TemplateDiscoveryResult> {
        const blocks: IBlock[] = [];
        const dataSources: IDatabaseSource[] = [];

        const visitedBlocks = new Set<string>();
        const visitedSources = new Set<string>();

        // Queue for BFS traversal
        const queue: string[] = [rootBlockId];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visitedBlocks.has(currentId)) continue;
            visitedBlocks.add(currentId);

            const block = await blocksColl.findOne({ _id: new ObjectId(currentId) });
            if (!block) {
                console.warn(`⚠️ [TEMPLATE] Block ${currentId} not found during discovery.`);
                continue;
            }

            blocks.push(block);

            // Add direct children (from blockIds array) to queue
            if (block.blockIds && block.blockIds.length > 0) {
                queue.push(...block.blockIds);
            }

            // Check for Internal Database Dependency (collection_view)
            if (block.blockType === "collection_view") {
                const viewValue = block.value as IVeiwDatabase;
                //
                if (viewValue.viewsTypes) {
                    for (const viewType of viewValue.viewsTypes) {
                        const sourceId = String(viewType.databaseSourceId);

                        if (sourceId && !visitedSources.has(sourceId)) {
                            visitedSources.add(sourceId);

                            // Fetch the DataSource
                            const source = await dataSourcesColl.findOne({ _id: new ObjectId(sourceId) });
                            if (source) {
                                dataSources.push(source);

                                // CRITICAL: A DataSource has ROWS (Pages). We must find them.
                                // Rows are blocks where parentId == sourceId.
                                // Unlike normal children, they are NOT in a 'blockIds' array on the parent block, 
                                // but typically the DataSource itself maintains a list of row IDs or we search by parentId.
                                // `IDatabaseSource` has a `blockIds` field which stores the row order.

                                if (source.blockIds && source.blockIds.length > 0) {
                                    // These are the Row Page IDs
                                    queue.push(...source.blockIds);
                                } else {
                                    // Fallback: search for any block with parentId === sourceID (safety net)
                                    // In a high-volume system this might be slow, but for templates it's safer.
                                    const rowBlocks = await blocksColl.find({ parentId: sourceId }).toArray();
                                    for (const row of rowBlocks) {
                                        queue.push(String(row._id));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Potential Future Enhancement: Scan 'content' for nested block references (like synced blocks)
        }

        return { blocks, dataSources };
    },

    /**
     * Generate new IDs for all entities and map Old -> New.
     */
    generateMappings(discovery: TemplateDiscoveryResult, context: CloneContext) {
        // 1. Map Blocks
        for (const block of discovery.blocks) {
            context.idMap.set(String(block._id), new ObjectId().toHexString());
        }

        // 2. Map DataSources
        for (const source of discovery.dataSources) {
            context.sourceMap.set(String(source._id), new ObjectId().toHexString());

            // 3. Map Properties within DataSources
            if (source.properties) {
                for (const propId of Object.keys(source.properties)) {
                    // Generate a new Property ID (e.g. "prop_<ObjectId>")
                    const newPropId = `prop_${new ObjectId().toHexString()}`;
                    context.propertyMap.set(propId, newPropId);
                }
            }
        }
    },

    /**
     * Create new DataSource objects with updated IDs and Property IDs.
     */
    transformDataSources(sources: IDatabaseSource[], context: CloneContext): IDatabaseSource[] {
        return sources.map(oldSource => {
            const newId = context.sourceMap.get(String(oldSource._id));
            if (!newId) throw new Error("Source ID mapping missing");

            // Remap Properties
            const newProperties: Record<string, PropertySchema> = {};
            if (oldSource.properties) {
                for (const [oldPropId, schema] of Object.entries(oldSource.properties)) {
                    const newPropId = context.propertyMap.get(oldPropId);
                    if (newPropId) {
                        // Deep Clone Schema
                        const newSchema = { ...schema };

                        // If schema has rollup/relation settings, they references OTHER properties/sources.
                        // This is complex. For now, we attempt to remap if the target is also in our context.
                        if (newSchema.relationLimit && newSchema.linkedDatabaseId) {
                            const linkedNewId = context.sourceMap.get(String(newSchema.linkedDatabaseId));
                            if (linkedNewId) {
                                newSchema.linkedDatabaseId = new ObjectId(linkedNewId);
                            }
                            // Note: syncedPropertyId for relations would also need mapping if we were doing robust 2-way relation cloning.
                            // For this implementation, we focus on SELF-contained templates.
                        }

                        if (newSchema.rollup && newSchema.rollup.targetPropertyId) {
                            const mappedTarget = context.propertyMap.get(newSchema.rollup.targetPropertyId);
                            if (mappedTarget) newSchema.rollup.targetPropertyId = mappedTarget;
                        }

                        newProperties[newPropId] = newSchema;
                    }
                }
            }

            // Remap Rows (blockIds)
            const newBlockIds = (oldSource.blockIds || []).map(oldRowId => context.idMap.get(oldRowId)).filter(Boolean) as string[];

            // Fix for Bug: Using correct collection name reference in logs/comments only, functional change is in IDs
            return {
                ...oldSource,
                _id: new ObjectId(newId),
                workspaceId: context.workspaceId,
                createdBy: {
                    userId: context.user.id,
                    userName: context.user.name,
                    userEmail: context.user.email
                },
                createdAt: new Date(),
                updatedAt: new Date(),
                properties: newProperties,
                blockIds: newBlockIds,
                // Reset settings that might be specific to the old instance
            };
        });
    },

    /**
     * Create new Block objects with updated IDs, Parents, and Content.
     */
    transformBlocks(blocks: IBlock[], context: CloneContext, oldRootId: string, aclIds: string[]): IBlock[] {
        return blocks.map(oldBlock => {
            const oldId = String(oldBlock._id);
            const newId = context.idMap.get(oldId)!;

            // Determine New Parent
            let newParentId: string;
            let newParentType: ParentTable = oldBlock.parentType;

            if (oldId === oldRootId) {
                // This is the root block of the template. Point it to the User's target.
                newParentId = context.targetParentId;
                // The parentType for a root page creation usually depends on where we put it.
                // If it's a workspace root, parentType depends on how workspace stores items.
                // Usually, workspace root pages have parentType="workspace".
                // But we leave it as is unless we know for sure.
            } else {
                // For children, find the mapped parent ID
                const mappedParentBlock = context.idMap.get(oldBlock.parentId);
                const mappedParentSource = context.sourceMap.get(oldBlock.parentId);

                if (mappedParentBlock) {
                    newParentId = mappedParentBlock;
                } else if (mappedParentSource) {
                    newParentId = mappedParentSource;
                    // If parent was a DataSource, parentType should remain "collection" (or whatever it was)
                } else {
                    console.warn(`⚠️ [TEMPLATE] Orphaned block ${oldId}. Parent ${oldBlock.parentId} not in scope.`);
                    newParentId = oldBlock.parentId; // Fallback (dangerous)
                }
            }

            // Remap Children (blockIds)
            const newChildIds = (oldBlock.blockIds || []).map(childId => context.idMap.get(childId)).filter(Boolean) as string[];

            // Deep Clone & Transform Value/Content
            const newValue = this.transformBlockValue(oldBlock.value, context, oldBlock.blockType);

            // Handle Page Type and isTemplate for Root
            if (oldId === oldRootId && context.targetType && (oldBlock.blockType === "page" || !oldBlock.blockType)) {
                if (newValue) {
                    (newValue as IPage).pageType = context.targetType;
                    (newValue as IPage).isTemplate = false;
                }
            }

            return {
                _id: new ObjectId(newId),
                blockType: oldBlock.blockType,
                workspaceId: context.workspaceId,
                parentId: newParentId,
                parentType: newParentType,
                blockIds: newChildIds,
                status: "alive",
                createdBy: {
                    userId: context.user.id,
                    userName: context.user.name,
                    userEmail: context.user.email
                },
                createdAt: new Date(),
                updatedAt: new Date(),
                value: newValue,
                aclIds: aclIds, // Apply calculated ACLs
                lastSnapshotTime: new Date()
            };
        });
    },

    /**
     * Transform the 'value' field of a block (Page Metadata, Content, or View Settings).
     */
    transformBlockValue(value: any, context: CloneContext, type: BlockType): any {
        if (!value) return value;
        const newValue = JSON.parse(JSON.stringify(value)); // Deep copy first

        // 1. Handle Collection Views (Boards, Tables)
        if (type === "collection_view") {
            const viewDb = newValue as IVeiwDatabase;
            if (viewDb.viewsTypes) {
                viewDb.viewsTypes = viewDb.viewsTypes.map((vt: any) => {
                    // Remap Database Source ID
                    const mappedSource = context.sourceMap.get(String(vt.databaseSourceId));
                    if (mappedSource) {
                        vt.databaseSourceId = new ObjectId(mappedSource);
                    }

                    // Remap View ID (Assign new one)
                    vt._id = new ObjectId(); // Always new View ID
                    context.viewMap.set(String(vt._id), vt._id.toHexString()); // Track if needed

                    // Remap Property IDs in View Settings
                    if (vt.settings) {
                        // Remap Filters
                        if (vt.settings.filters && Array.isArray(vt.settings.filters)) {
                            vt.settings.filters = vt.settings.filters.map((filter: any) => ({
                                ...filter,
                                propertyId: context.propertyMap.get(filter.propertyId) || filter.propertyId
                            }));
                        }

                        // Remap Advanced Filters
                        if (vt.settings.advancedFilters && Array.isArray(vt.settings.advancedFilters)) {
                            vt.settings.advancedFilters = this.remapAdvancedFilterGroups(vt.settings.advancedFilters, context);
                        }

                        // Remap Sorts
                        if (vt.settings.sorts && Array.isArray(vt.settings.sorts)) {
                            vt.settings.sorts = vt.settings.sorts.map((sort: any) => ({
                                ...sort,
                                propertyId: context.propertyMap.get(sort.propertyId) || sort.propertyId
                            }));
                        }

                        // Remap Group
                        if (vt.settings.group && vt.settings.group.propertyId) {
                            vt.settings.group = {
                                ...vt.settings.group,
                                propertyId: context.propertyMap.get(vt.settings.group.propertyId) || vt.settings.group.propertyId
                            };
                        }

                        // Remap Property Visibility
                        if (vt.settings.propertyVisibility && Array.isArray(vt.settings.propertyVisibility)) {
                            vt.settings.propertyVisibility = vt.settings.propertyVisibility.map((pv: any) => ({
                                ...pv,
                                propertyId: context.propertyMap.get(pv.propertyId) || pv.propertyId
                            }));
                        }

                        // Remap Chart Settings
                        if (vt.settings.chart) {
                            const chart = vt.settings.chart;

                            // Remap X-Axis property
                            if (chart.xAxis && chart.xAxis.propertyId) {
                                chart.xAxis.propertyId = context.propertyMap.get(chart.xAxis.propertyId) || chart.xAxis.propertyId;
                            }

                            // Remap Y-Axis properties
                            if (chart.yAxis) {
                                // Remap whatToShow if it's a propertyId (not "count")
                                if (chart.yAxis.whatToShow && chart.yAxis.whatToShow !== "count") {
                                    chart.yAxis.whatToShow = context.propertyMap.get(chart.yAxis.whatToShow) || chart.yAxis.whatToShow;
                                }

                                // Remap groupBy property
                                if (chart.yAxis.groupBy) {
                                    chart.yAxis.groupBy = context.propertyMap.get(chart.yAxis.groupBy) || chart.yAxis.groupBy;
                                }
                            }
                        }
                    }

                    return vt;
                });
            }
            return viewDb;
        }

        // 2. Handle Content Blocks (Text, Page Content)
        if (newValue.content) {
            // ProseMirror JSON traversal
            newValue.content = this.transformProseMirrorContent(newValue.content, context);
        }

        // 3. Handle Page Properties (Remap database property IDs)
        if (newValue.databaseProperties && typeof newValue.databaseProperties === 'object') {
            const newProps: Record<string, any> = {};
            for (const [oldPropId, propValue] of Object.entries(newValue.databaseProperties)) {
                const newPropId = context.propertyMap.get(oldPropId);
                // Use new ID if mapped, otherwise keep old ID (for external databases)
                newProps[newPropId || oldPropId] = propValue;
            }
            newValue.databaseProperties = newProps;
        }

        return newValue;
    },

    /**
     * Recursive traversal of ProseMirror content to update IDs (View IDs, Linked Pages).
     */
    transformProseMirrorContent(content: any, context: CloneContext): any {
        if (Array.isArray(content)) {
            return content.map(node => this.transformProseMirrorContent(node, context));
        }

        if (typeof content === 'object' && content !== null) {
            const node = { ...content }; // Shallow copy node

            // A. React Components (e.g. Inline Views)
            if (node.type === "react_component" && node.attrs) {
                // If this component references a View ID we cloned, ideally we'd update it.
                // But collection_views are usually Blocks themselves, processed above.
                // Inline views often refer to blockIds.
                if (node.attrs.blockId) {
                    const mappedBlockId = context.idMap.get(node.attrs.blockId);
                    if (mappedBlockId) node.attrs.blockId = mappedBlockId;
                }
            }

            // B. Links / Mentions (attrs.href or attrs.id)
            if (node.attrs) {
                // Example: check for internal links "/page/OLD_ID"
                // This logic depends on your specific link format.
            }

            // Recurse into children
            if (node.content) {
                node.content = this.transformProseMirrorContent(node.content, context);
            }
            return node;
        }

        return content;
    },

    /**
     * Helper: Recursively remap property IDs in advanced filter groups
     */
    remapAdvancedFilterGroups(groups: any[], context: CloneContext): any[] {
        return groups.map(group => {
            const newGroup = { ...group };

            // Remap rules in this group
            if (newGroup.rules && Array.isArray(newGroup.rules)) {
                newGroup.rules = newGroup.rules.map((rule: any) => ({
                    ...rule,
                    propertyId: context.propertyMap.get(rule.propertyId) || rule.propertyId
                }));
            }

            // Recursively remap nested groups
            if (newGroup.groups && Array.isArray(newGroup.groups)) {
                newGroup.groups = this.remapAdvancedFilterGroups(newGroup.groups, context);
            }

            return newGroup;
        });
    }
};
