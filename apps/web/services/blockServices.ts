import { ObjectId, type Collection } from "mongodb";
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import type { IBlock, IPage, ParentTable, BlockStatus } from "@/models/types/Block";
import type { IWorkspace } from "@/models/types/Workspace";
import type { IWorkArea } from "@/models/types/WorkArea";
import type { IUser } from "@/models/types/User";
import { DragAndDropinputfield, inputUpdateBlockInfo } from "@/app/api/note/block/drag-and-drop/route";
import { IDatabaseSource } from "@/models/types/DatabaseSource";
import { PermissionService } from "@/services/PermissionService";
import type { IPermission, PermissionRole } from "@/models/types/Permission";
import { AuditService } from "./auditService";
import { sendEmail } from "@/lib/emailNotification/sendEmailNotification";
import { getNoteSharedHtml } from "@/lib/emailNotification/emailTemplate/noteSharedTemplate";
import { SlackNotificationService } from "./slackNotificationService";
import { BlockSnapshotService } from "@/services/blockSnapshotService";
export interface BlockCreateInput {
  _id?: string; // Optional: if provided, use it; otherwise MongoDB will generate
  blockType: 'content' | 'page' | 'collection_view';
  value: any | IPage;
  insertAfterBlockID?: string | null;
}

export type BlockUpdateInput =
  | {
    _id: string; // Block _id (ObjectId as string)
    content: any;
  }


async function getParentBlock(
  parentId: string,
  workspaceId: string,
): Promise<{
  parentBlock: IBlock | IWorkArea | null | IDatabaseSource;
  blocksColl: Collection<IBlock>;
  isWorkArea?: boolean;
}> {
  const metadataClient = await clusterManager.getMetadataClient();
  const metadataDb = metadataClient.db();
  const blocksColl = metadataDb.collection<IBlock>("blocks");
  const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");

  // First, try to find parent in blocks collection
  const parentBlock = await blocksColl.findOne({
    _id: new ObjectId(parentId),
    status: "alive",
  });

  if (parentBlock) {
    return { parentBlock, blocksColl, isWorkArea: false };
  }

  // If not found in blocks, check workarea collection
  const parentWorkArea = await workAreasColl.findOne({
    _id: new ObjectId(parentId),
  });

  if (parentWorkArea) {
    return { parentBlock: parentWorkArea as any, blocksColl, isWorkArea: true };
  }

  // Not found in either collection
  return { parentBlock: null, blocksColl, isWorkArea: false };
}

export const BlockService = {

  async getBlocksByIds({
    blockIds
  }: {
    blockIds: string[];
  }) {
    if (!blockIds || blockIds.length === 0) {
      return [];
    }
    const client = await clusterManager.getMetadataClient();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");
    const blocks = await blocksColl.find({
      _id: { $in: blockIds.map(id => new ObjectId(id)) },
      status: "alive",
    }).toArray();
    return blocks;
  },

  async batchCreateBlocks({
    userId,
    parentId,
    workspaceId,
    blocks,
    parentTable,
    dataSourceDetail,
    workareaId,
    view_databaseId,
    userName,
    userEmail,
    isTemplate,
  }: {
    userId: string;
    parentId: string;
    workspaceId: string;
    blocks: BlockCreateInput[];
    parentTable: ParentTable;
    dataSourceDetail?: IDatabaseSource;
    workareaId?: string;
    view_databaseId?: string;
    userName: string;
    userEmail: string;
    isTemplate?: boolean;
  }): Promise<void> {
    if (!userId || !parentId || !workspaceId || !Array.isArray(blocks) || blocks.length === 0) {
      throw new Error("userId, parentId, workspaceId, and non-empty blocks array are required");
    }
    const client = await clusterManager.getMetadataClient();
    const db = client.db();

    // Fetch parent block from the correct collection based on parentTable
    let parentBlock: IBlock | IWorkArea | IDatabaseSource | null = null;
    let blocksColl: Collection<IBlock>;
    let aclSourceBlock: IBlock | null = null; // For getting ACLs when parent doesn't have them
    switch (parentTable) {
      case "collection": {
        // Parent is a database source (collection view)
        const dataSourceColl = db.collection<IDatabaseSource>("dataSources");
        parentBlock = await dataSourceColl.findOne({ _id: new ObjectId(parentId) });
        blocksColl = db.collection<IBlock>("blocks");

        // For collections, ACLs come from the view_databaseId block, not the dataSource
        if (view_databaseId) {
          aclSourceBlock = await blocksColl.findOne({
            _id: new ObjectId(view_databaseId),
            status: "alive",
          });
        }
        break;
      }

      case "workarea": {
        // Parent is a workarea
        const workAreasColl = db.collection<IWorkArea>("workAreas");
        parentBlock = await workAreasColl.findOne({ _id: new ObjectId(parentId) });
        blocksColl = db.collection<IBlock>("blocks");
        break;
      }

      case "workspace": {
        // Parent is workspace - no need to fetch, just get blocks collection
        parentBlock = null; // Workspace doesn't have a document to fetch
        blocksColl = db.collection<IBlock>("blocks");
        break;
      }

      case "block":
      case "page":
      default: {
        // Parent is a regular block
        blocksColl = db.collection<IBlock>("blocks");
        parentBlock = await blocksColl.findOne({
          _id: new ObjectId(parentId),
          status: "alive",
        });
        break;
      }
    }

    // Extract ACL IDs directly from parent block (no redundant DB call)
    let inheritedAclIds: string[] = [];

    if (parentTable === "workspace" || parentTable === "workarea") {
      // Root blocks in workspace/workarea - no inherited ACLs
      inheritedAclIds = [];
    } else if (parentTable === "collection" && aclSourceBlock) {
      // For collections, inherit ACLs from the view_databaseId block
      inheritedAclIds = aclSourceBlock.aclIds || [];
    } else if (parentBlock && 'aclIds' in parentBlock) {
      // Inherit ACLs from parent block
      inheritedAclIds = parentBlock.aclIds || [];
    } else {
      // Fallback: parent not found or doesn't have ACLs
      inheritedAclIds = [];
    }
    //find workareaId if not provided
    // Determine workareaId for new blocks
    if (parentTable === "workarea") {
      // Direct child of workarea
      workareaId = parentId;
    } else if (parentBlock && 'workareaId' in parentBlock && parentBlock.workareaId) {
      // Inherit from parent block (only IBlock has workareaId)
      workareaId = parentBlock.workareaId;
    }
    else {
      workareaId = undefined;
    }

    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const permissionsColl = metadataDb.collection<IPermission>("permissions");

    //Prepare bulk operations for all blocks
    const operations = await Promise.all(blocks.map(async (b) => {
      const _id = b._id ? new ObjectId(b._id) : new ObjectId();

      // Create a new permission document for this block with the creator as owner
      const newPermission: IPermission = {
        subjects: [{
          id: userId,
          role: "owner" as PermissionRole
        }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const permissionResult = await permissionsColl.insertOne(newPermission);
      const newPermissionId = String(permissionResult.insertedId);

      // Combine inherited ACLs with the new permission
      const blockAclIds = [...inheritedAclIds, newPermissionId];

      return {
        updateOne: {
          filter: { _id },
          update: {
            $setOnInsert: {
              blockType: b.blockType,
              workspaceId: workspaceId,
              workareaId: workareaId,
              parentId: String(parentId),
              parentType: parentTable,
              blockIds: [],
              aclIds: blockAclIds,
              createdAt: new Date(),
              createdBy: {
                userId: userId,
                userName: userName,
                userEmail: userEmail,
              },
            },
            $set: {
              value: b.value,
              status: "alive" as BlockStatus, // Always set to alive (creates new OR restores deleted)
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      };
    }));

    // Execute bulk write
    await blocksColl.bulkWrite(operations, { ordered: false });

    // Collect IDs for parent update
    const allBlockIds = operations.map((op) => op.updateOne.filter._id.toString());

    // Update Parent based on parentTable
    const parentObjectId = new ObjectId(parentId);
    //here add blockID into blockIDs of respective parent block
    switch (parentTable) {
      case "block":
      case "page": {
        console.log("-----------fasfasfas------------", parentBlock);
        if (parentBlock && 'blockIds' in parentBlock) {
          console.log("33333333parentBlock", parentBlock);
          const currentBlockIds = parentBlock.blockIds || [];
          let newBlockIds = [...currentBlockIds];

          // Determine insertion position based on insertAfterBlockID
          // Note: We assume all blocks in this batch have the same insertAfterBlockID
          const insertAfterBlockID = blocks[0]?.insertAfterBlockID;

          // Filter out any IDs that are already present to avoid duplicates
          const idsToInsert = allBlockIds.filter(id => !newBlockIds.includes(id));

          if (idsToInsert.length > 0) {
            if (insertAfterBlockID === null || insertAfterBlockID === undefined) {
              // Insert at the beginning (index 0)
              newBlockIds = [...idsToInsert, ...newBlockIds];
            } else {
              // Find the index of insertAfterBlockID
              const insertIndex = newBlockIds.indexOf(insertAfterBlockID);

              if (insertIndex !== -1) {
                // Insert after the found block
                newBlockIds.splice(insertIndex + 1, 0, ...idsToInsert);
              } else {
                // If insertAfterBlockID not found, append to end as fallback
                newBlockIds.push(...idsToInsert);
              }
            }
          }

          await blocksColl.updateOne(
            { _id: parentBlock._id },
            { $set: { blockIds: newBlockIds, updatedAt: new Date() } }
          );
        }
        if (dataSourceDetail) {
          const dataSourceColl = metadataDb.collection<IDatabaseSource>("databaseSources");
          const { _id, ...replacementDoc } = dataSourceDetail;

          // CRITICAL: Set updatedAt so snapshot system knows data source changed
          await dataSourceColl.replaceOne(
            { _id: new ObjectId(_id) },
            {
              ...replacementDoc as any,
              updatedAt: new Date()  // Always update timestamp when modifying data source
            },
            { upsert: true }
          );

          // Trigger Initial Snapshot for the Data Source
          try {
            // Create initial history entry immediately
            await BlockSnapshotService.createSnapshotAfterInactivity({
              parentId: String(dataSourceDetail._id),
              workspaceId: workspaceId,
              authorId: userId
            });
          } catch (e) {
            console.error(`[batchCreateBlocks] Failed to trigger initial snapshot for dataSource ${dataSourceDetail._id}:`, e);
          }
        }
        break;
      }
      case "collection": {
        const dataSourceColl = metadataDb.collection<IDatabaseSource>("databaseSources");
        const parentBlock = await dataSourceColl.findOne({ _id: parentObjectId });
        if (!parentBlock) {
          throw new Error("Parent block not found");
        }
        const currentBlockIds = parentBlock.blockIds || [];
        let newBlockIds = [...currentBlockIds];

        // Determine insertion position based on insertAfterBlockID
        // Note: We assume all blocks in this batch have the same insertAfterBlockID
        const insertAfterBlockID = blocks[0]?.insertAfterBlockID;

        // Filter out any IDs that are already present to avoid duplicates
        const idsToInsert = allBlockIds.filter(id => !newBlockIds.includes(id));

        if (idsToInsert.length > 0) {
          if (insertAfterBlockID === null || insertAfterBlockID === undefined) {
            // Insert at the beginning (index 0)
            newBlockIds = [...idsToInsert, ...newBlockIds];
          } else {
            // Find the index of insertAfterBlockID
            const insertIndex = newBlockIds.indexOf(insertAfterBlockID);

            if (insertIndex !== -1) {
              // Insert after the found block
              newBlockIds.splice(insertIndex + 1, 0, ...idsToInsert);
            } else {
              // If insertAfterBlockID not found, append to end as fallback
              newBlockIds.push(...idsToInsert);
            }
          }
        }

        await dataSourceColl.updateOne(
          { _id: parentBlock._id },
          { $set: { blockIds: newBlockIds, updatedAt: new Date() } }
        );
        break;
      }

      case "workspace": {
        const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
        const workspace = await workspacesColl.findOne({ _id: parentObjectId });
        if (workspace) {
          const publicIdsToAdd: string[] = [];
          const privateIdsToAdd: string[] = [];
          const templateIdsToAdd: string[] = [];
          blocks.forEach((b, index) => {
            const blockId = allBlockIds[index]!;
            const pageType = (b.value as any)?.pageType;
            if (pageType === "private") {
              privateIdsToAdd.push(blockId);
            } else if (pageType === "public") {
              publicIdsToAdd.push(blockId);
            }
            else if (pageType === "template") {
              templateIdsToAdd.push(blockId);
            }
          });

          if (publicIdsToAdd.length > 0) {
            await workspacesColl.updateOne(
              { _id: parentObjectId },
              {
                $push: { publicPageIds: { $each: publicIdsToAdd } },
                $set: { updatedAt: new Date() }
              }
            );
          }

          if (privateIdsToAdd.length > 0) {
            const usersColl = metadataDb.collection<IUser>("users");
            const res = await usersColl.updateOne(
              { _id: new ObjectId(userId), "workspaceSettings.workspaceId": workspaceId },
              {
                $push: { "workspaceSettings.$.privatePageIds": { $each: privateIdsToAdd } } as any,
                $set: { updatedAt: new Date() }
              }
            );
            if (res.matchedCount === 0) {
              await usersColl.updateOne(
                { _id: new ObjectId(userId) },
                {
                  $push: { workspaceSettings: { workspaceId, privatePageIds: privateIdsToAdd } } as any,
                  $set: { updatedAt: new Date() }
                }
              );
            }
          }

          // Track template blocks in user's workspace-specific templatePageIds
          if (isTemplate && templateIdsToAdd.length > 0) {
            console.log(`---------------------------------------------------fsadfsdfsdfsdf---------Adding ${templateIdsToAdd.length} template(s) to user ${userId} in workspace ${workspaceId}`);
            const usersColl = metadataDb.collection<IUser>("users");
            const res = await usersColl.updateOne(
              { _id: new ObjectId(userId), "workspaceSettings.workspaceId": workspaceId },
              {
                $push: { "workspaceSettings.$.templatePageIds": { $each: templateIdsToAdd } } as any,
                $set: { updatedAt: new Date() }
              }
            );
            if (res.matchedCount === 0) {
              await usersColl.updateOne(
                { _id: new ObjectId(userId) },
                {
                  $push: { workspaceSettings: { workspaceId, templatePageIds: templateIdsToAdd } } as any,
                  $set: { updatedAt: new Date() }
                }
              );
            }
            console.log(`✅ Added ${templateIdsToAdd.length} template(s) to user ${userId} in workspace ${workspaceId}`);
          }
        }
        break;
      }

      case "workarea": {
        const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");
        const workArea = await workAreasColl.findOne({ _id: parentObjectId });
        if (workArea) {
          if (allBlockIds.length > 0) {
            await workAreasColl.updateOne(
              { _id: parentObjectId },
              {
                $push: { pageIds: { $each: allBlockIds } },
                $set: { updatedAt: new Date() }
              }
            );
          }
        }
        break;
      }

      default:
        console.warn(`[batchCreateBlocks] ParentTable type ${parentTable} handling not fully implemented or parent not found.`);
        break;
    }

    // Audit Log for Batch Create
    // Log primarily for the first block or the batch action to avoid spamming
    // or log for each "Page" created.
    // For now, let's log a summary if possible, or just log creation.
    // Since we have userEmail and userName passed in, we can log.
    if (blocks.length > 0) {
      // Filter for pages to log significant creations
      const pageBlocks = blocks.filter(b => b.blockType === 'page' || b.blockType === 'collection_view');
      if (pageBlocks.length > 0) {
        for (const b of pageBlocks) {
          const title = (b.value as IPage)?.title || "New page";
          await AuditService.log({
            action: "CREATE",
            noteId: b._id || "unknown", // _id might be generated in map if not passed, but here we can't easily access the generated ID if it wasn't in input. 
            // Wait, the input `blocks` has `_id` as optional.
            // If it was optional, we generated it inside the map.
            // We can't access it here easily unless we change the logic to generate IDs beforehand or capture them.
            // In the map loop above: const _id = b._id ? new ObjectId(b._id) : new ObjectId();
            // We didn't save these generated IDs back to `blocks` objects generally.
            // BUT `allBlockIds` has the list of string IDs!
            // `pageBlocks` is a filtered subset of `blocks`. We don't know which ID matches which block easily unless we rely on index.
            // Simplification: Just log the Parent update or log "Content Created" on the parent.
            // Or better: Let's rely on the fact that for significant creates, the frontend usually sends the ID.
            // If not, we log "New Page" on the parent.  
            userId: userId,
            userEmail: userEmail,
            userName: userName,
            noteName: title,
            serviceType: "MONGODB",
            field: "block",
            oldValue: undefined,
            newValue: "Created",
            workspaceId: workspaceId,
            organizationDomain: undefined // We don't have this readily available without fetching parent details again or passing it
          }).catch(console.error);
        }
      } else {
        // It's content blocks (text inside a page)
        await AuditService.log({
          action: "UPDATE",
          noteId: parentId,
          userId: userId,
          userEmail: userEmail,
          userName: userName,
          noteName: "Page Content",
          serviceType: "MONGODB",
          field: "content",
          oldValue: undefined,
          newValue: `Added ${blocks.length} blocks`,
          workspaceId: workspaceId,
        }).catch(console.error);
      }
    }
  },

  async batchUpdateBlocks({
    userId,
    parentId,
    workspaceId,
    updates,
    blockIdArray,
    workareaId
  }: {
    userId: string;
    parentId: string;
    workspaceId: string;
    updates: BlockUpdateInput[];
    blockIdArray: string[];
    workareaId?: string;
  }): Promise<void> {
    if (!userId || !parentId || !Array.isArray(updates) || updates.length === 0) {
      throw new Error("userId, parentId and non-empty updates array are required");
    }

    // Permission check is now handled at API level
    const { parentBlock, blocksColl } = await getParentBlock(parentId, workspaceId);

    const bulk = blocksColl.initializeUnorderedBulkOp();

    for (const u of updates) {
      if (!u._id) continue;
      if (!u.content) continue;

      bulk
        .find({ _id: new ObjectId(u._id), parentId: parentId })
        .upsert()
        .updateOne({
          $set: {
            parentId: parentId,
            value: u.content,
            status: "alive",
            updatedAt: new Date(),
          },
          $setOnInsert: {
            _id: new ObjectId(u._id),
            blockType: "content",
            workspaceId: workspaceId,
            parentType: "block",
          },
        });
    }

    const internalBulk: any = bulk as any;
    if (internalBulk.s && internalBulk.s.currentBatch && internalBulk.s.currentBatch.operations.length > 0) {
      await bulk.execute();

      // Update Parent updatedAt
      try {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const parentObjectId = new ObjectId(parentId);
        const { parentBlock, isWorkArea } = await getParentBlock(parentId, workspaceId);

        if (isWorkArea) {
          const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");
          await workAreasColl.updateOne(
            { _id: new ObjectId(parentId) },
            { $set: { updatedAt: new Date() } }
          );
        } else if (parentBlock) {
          // Check if parent is a block/page/collection
          if ('blockIds' in parentBlock || 'pageType' in (parentBlock as any) || (parentBlock as any).blockType === 'collection_view') {
            // For blocks/pages
            await blocksColl.updateOne(
              { _id: parentObjectId },
              { $set: { updatedAt: new Date() } }
            );
          } else if ((parentBlock as any).type === 'datasource' || (parentBlock as any).blockIds) {
            // For DataSources (collections)
            const dataSourceColl = metadataDb.collection<IDatabaseSource>("databaseSources");
            await dataSourceColl.updateOne(
              { _id: parentObjectId },
              { $set: { updatedAt: new Date() } }
            );
          }
        }
      } catch (e) {
        console.error("Failed to update parent updatedAt in batchUpdateBlocks", e);
      }

      // Audit Log for Updates
      // Since we don't have the full user details (email/name) in arguments (only userId), 
      // we might need to fetch them OR update the signature?
      // `batchUpdateBlocks` only has `userId`. 
      // We can try to fetch user, or just log with userId.
      // AuditService.log requires userEmail and userName.
      // We should probably fetch the user.
      try {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const usersColl = metadataDb.collection<IUser>("users");
        const user = await usersColl.findOne({ _id: new ObjectId(userId) });
        if (user) {
          const distinctBlockIds = Array.from(new Set(updates.map(u => u._id)));
          // Log "Update" on the first block or parent?
          // Since this is batch update, it usually happens on a single page (parentId).
          await AuditService.log({
            action: "UPDATE",
            noteId: parentId,
            userId: userId,
            userEmail: user.email,
            userName: user.name || "Unknown",
            noteName: "Page Content",
            serviceType: "MONGODB",
            field: "content",
            oldValue: undefined,
            newValue: `Updated ${distinctBlockIds.length} blocks`,
            workspaceId: workspaceId,
          });
        }
      } catch (err) {
        console.error("Failed to log audit for batchUpdateBlocks", err);
      }
    }
  },

  /**
   * Helper function to remove a block's ID from its parent's blockIds/pageIds array
   * Handles different parent types: workspace (public/private), workarea, block, or collection
   * Also removes from templatePageIds if the block is a template
   */
  async removeBlockFromParent(blockId: string, block: IBlock, userId?: string): Promise<void> {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();

    const { parentId, parentType, workspaceId } = block;

    // If parent is workspace, need to determine if it's in public or private pages
    if (parentType === "workspace") {
      const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
      const workspace = await workspacesColl.findOne({ _id: new ObjectId(workspaceId) });

      if (!workspace) {
        throw new Error("Workspace not found");
      }

      // Check if block is in publicPageIds
      if (workspace.publicPageIds && workspace.publicPageIds.includes(blockId)) {
        await workspacesColl.updateOne(
          { _id: new ObjectId(workspaceId) },
          {
            $pull: { publicPageIds: blockId },
            $set: { updatedAt: new Date() }
          }
        );
      } else {
        // Remove from User's privatePageIds
        const usersColl = metadataDb.collection<IUser>("users");
        if (userId) {
          await usersColl.updateOne(
            { _id: new ObjectId(userId), "workspaceSettings.workspaceId": workspaceId },
            {
              $pull: { "workspaceSettings.$.privatePageIds": blockId } as any,
              $set: { updatedAt: new Date() }
            }
          );
        } else {
          // Fallback: Remove from all users having this workspace setting
          await usersColl.updateMany(
            { "workspaceSettings.workspaceId": workspaceId },
            {
              $pull: { "workspaceSettings.$.privatePageIds": blockId } as any,
              $set: { updatedAt: new Date() }
            }
          );
        }
      }
    }
    // If parent is workarea
    else if (parentType === "workarea") {
      const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");
      await workAreasColl.updateOne(
        { _id: new ObjectId(parentId) },
        {
          $pull: { pageIds: blockId },
          $set: { updatedAt: new Date() }
        } // WorkArea uses pageIds, not blockIds!
      );
    }
    // If parent is a regular block or page
    else if (parentType === "block" || parentType === "page" || parentType === "content") {
      const blocksColl = metadataDb.collection<IBlock>("blocks");
      await blocksColl.updateOne(
        { _id: new ObjectId(parentId) },
        {
          $pull: { blockIds: blockId },
          $set: { updatedAt: new Date() }
        }
      );
    }
    // If parent is a collection (database source)
    else if (parentType === "collection" || parentType === "collection_view") {
      const dataSourceColl = metadataDb.collection<IDatabaseSource>("databaseSources");
      await dataSourceColl.updateOne(
        { _id: new ObjectId(parentId) },
        {
          $pull: { blockIds: blockId },
          $set: { updatedAt: new Date() }
        }
      );
    }

    // ALWAYS remove from ALL user workspace settings lists (for ALL users in workspace)
    // This handles: privatePageIds, sharedPageIds, templatePageIds
    // Reason: Pages can be shared with multiple users, workarea pages appear in sharedPageIds
    const usersColl = metadataDb.collection<IUser>("users");
    await usersColl.updateMany(
      { "workspaceSettings.workspaceId": workspaceId },
      {
        $pull: {
          "workspaceSettings.$.privatePageIds": blockId,
          "workspaceSettings.$.sharedPageIds": blockId,
          "workspaceSettings.$.templatePageIds": blockId
        } as any,
        $set: { updatedAt: new Date() }
      }
    );
  },

  /**
   * Move a block to trash (soft delete - only changes status)
   * Does NOT remove from parent's list - UI filters by status
   */
  async moveToTrash({
    userId,
    blockId,
    workspaceId,
  }: {
    userId: string;
    blockId: string;
    workspaceId: string;
  }): Promise<void> {
    if (!userId || !blockId || !workspaceId) {
      throw new Error("userId, blockId, and workspaceId are required");
    }

    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const blocksColl = metadataDb.collection<IBlock>("blocks");

    // Fetch block first to verify it exists and get data for audit log
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      workspaceId: workspaceId,
      status: "alive"
    });

    if (!block) {
      throw new Error("Block not found or already deleted");
    }


    // Soft delete: ONLY change status, don't remove from parent
    await blocksColl.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          status: "deleted" as BlockStatus,
          updatedAt: new Date(),
        }
      }
    );

    // Update parent's updatedAt to reflect the logical removal (soft delete) of a child
    try {
      if (block.parentType === "block" || block.parentType === "page") {
        await blocksColl.updateOne(
          { _id: new ObjectId(block.parentId) },
          { $set: { updatedAt: new Date() } }
        );
      } else if (block.parentType === "collection" || block.parentType === "collection_view") {
        const dataSourceColl = metadataDb.collection<IDatabaseSource>("databaseSources");
        await dataSourceColl.updateOne(
          { _id: new ObjectId(block.parentId) },
          { $set: { updatedAt: new Date() } }
        );
      } else if (block.parentType === "workspace") {
        const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
        await workspacesColl.updateOne(
          { _id: new ObjectId(block.workspaceId) },
          { $set: { updatedAt: new Date() } }
        );
      } else if (block.parentType === "workarea") {
        const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");
        await workAreasColl.updateOne(
          { _id: new ObjectId(block.parentId) },
          { $set: { updatedAt: new Date() } }
        );
      }
    } catch (e) {
      console.error("Failed to update parent updatedAt on moveToTrash", e);
    }



    // Audit Log
    const usersColl = metadataDb.collection<IUser>("users");
    const user = await usersColl.findOne({ _id: new ObjectId(userId) });

    if (user) {
      const title = (block.value as IPage)?.title || "New page";
      await AuditService.log({
        action: "DELETE",
        noteId: blockId,
        userId: userId,
        userEmail: user.email,
        userName: user.name || "Unknown",
        noteName: title,
        serviceType: "MONGODB",
        field: "block",
        oldValue: "alive",
        newValue: "deleted",
        workspaceId: workspaceId,
      }).catch(console.error);
    }
  },

  /**
   * Restore a block from trash (change status back to alive)
   */
  async restoreFromTrash({
    userId,
    blockId,
    workspaceId,
  }: {
    userId: string;
    blockId: string;
    workspaceId: string;
  }): Promise<void> {
    if (!userId || !blockId || !workspaceId) {
      throw new Error("userId, blockId, and workspaceId are required");
    }

    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const blocksColl = metadataDb.collection<IBlock>("blocks");

    // Fetch deleted block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      workspaceId: workspaceId,
      status: "deleted"
    });

    if (!block) {
      throw new Error("Block not found in trash");
    }


    // Restore: ONLY change status back to alive
    await blocksColl.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          status: "alive" as BlockStatus,
          updatedAt: new Date(),
        }
      }
    );

    // Update parent's updatedAt to reflect restore
    try {
      if (block.parentType === "block" || block.parentType === "page") {
        await blocksColl.updateOne(
          { _id: new ObjectId(block.parentId) },
          { $set: { updatedAt: new Date() } }
        );
      } else if (block.parentType === "collection" || block.parentType === "collection_view") {
        const dataSourceColl = metadataDb.collection<IDatabaseSource>("databaseSources");
        await dataSourceColl.updateOne(
          { _id: new ObjectId(block.parentId) },
          { $set: { updatedAt: new Date() } }
        );
      } else if (block.parentType === "workspace") {
        const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
        await workspacesColl.updateOne(
          { _id: new ObjectId(block.workspaceId) },
          { $set: { updatedAt: new Date() } }
        );
      } else if (block.parentType === "workarea") {
        const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");
        await workAreasColl.updateOne(
          { _id: new ObjectId(block.parentId) },
          { $set: { updatedAt: new Date() } }
        );
      }
    } catch (e) {
      console.error("Failed to update parent updatedAt on restoreFromTrash", e);
    }



    // Audit Log
    const usersColl = metadataDb.collection<IUser>("users");
    const user = await usersColl.findOne({ _id: new ObjectId(userId) });

    if (user) {
      const title = (block.value as IPage)?.title || "New page";
      await AuditService.log({
        action: "RESTORE",
        noteId: blockId,
        userId: userId,
        userEmail: user.email,
        userName: user.name || "Unknown",
        noteName: title,
        serviceType: "MONGODB",
        field: "block",
        oldValue: "deleted",
        newValue: "alive",
        workspaceId: workspaceId,
      }).catch(console.error);
    }
  },

  /**
   * Permanently delete a block (hard delete - removes from parent and database)
   * Can only delete blocks that are already in trash (status: "deleted")
   */
  async permanentDelete({
    userId,
    blockId,
    workspaceId,
  }: {
    userId: string;
    blockId: string;
    workspaceId: string;
  }): Promise<void> {
    if (!userId || !blockId || !workspaceId) {
      throw new Error("userId, blockId, and workspaceId are required");
    }

    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const blocksColl = metadataDb.collection<IBlock>("blocks");
    const permissionsColl = metadataDb.collection<IPermission>("permissions");

    // Fetch block - must be in trash
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      workspaceId: workspaceId,
      // status: "deleted"
    });

    if (!block) {
      throw new Error("Block not found");
    }

    // Helper function to recursively delete all descendants
    const deleteDescendants = async (parentBlockId: string): Promise<void> => {
      const parentBlock = await blocksColl.findOne({ _id: new ObjectId(parentBlockId) });
      if (!parentBlock || !parentBlock.blockIds || parentBlock.blockIds.length === 0) {
        return;
      }

      for (const childId of parentBlock.blockIds) {
        // Recursively delete children of this child
        await deleteDescendants(childId);

        // Delete child's own permission (last in aclIds)
        const childBlock = await blocksColl.findOne({ _id: new ObjectId(childId) });
        if (childBlock?.aclIds && childBlock.aclIds.length > 0) {
          const ownPermissionId = childBlock.aclIds[childBlock.aclIds.length - 1];
          await permissionsColl.deleteOne({ _id: new ObjectId(ownPermissionId) });
        }

        // Delete child block document
        await blocksColl.deleteOne({ _id: new ObjectId(childId) });
      }
    };

    // 1. Remove block from parent's list
    await this.removeBlockFromParent(blockId, block, userId);

    // 2. Recursively delete all descendants
    await deleteDescendants(blockId);

    // 3. Delete block's own permission (last in aclIds)
    if (block.aclIds && block.aclIds.length > 0) {
      const ownPermissionId = block.aclIds[block.aclIds.length - 1];
      await permissionsColl.deleteOne({ _id: new ObjectId(ownPermissionId!) });
    }

    // 4. Delete the block document itself
    await blocksColl.deleteOne({ _id: new ObjectId(blockId) });

    // Audit Log
    const usersColl = metadataDb.collection<IUser>("users");
    const user = await usersColl.findOne({ _id: new ObjectId(userId) });

    if (user) {
      const title = (block.value as IPage)?.title || "New page";
      await AuditService.log({
        action: "PERMANENT_DELETE",
        noteId: blockId,
        userId: userId,
        userEmail: user.email,
        userName: user.name || "Unknown",
        noteName: title,
        serviceType: "MONGODB",
        field: "block",
        oldValue: "deleted",
        newValue: "permanently_deleted",
        workspaceId: workspaceId,
      }).catch(console.error);
    }
  },

  /**
   * @deprecated Use moveToTrash instead
   * Delete a block (soft delete by setting status to 'deleted')
   * Requires admin permission on the block
   */
  async deleteBlock({
    userId,
    blockId,
    workspaceId,
  }: {
    userId: string;
    blockId: string;
    workspaceId: string;
  }): Promise<void> {
    // Redirect to moveToTrash for backward compatibility
    return this.moveToTrash({ userId, blockId, workspaceId });
  },


  /**
   * Share a block with other users by creating a permission boundary
   * Requires admin permission on the block
   */
  async shareBlock({
    userId,
    userEmail,
    blockId,
    workspaceId,
    sharedWith,
  }: {
    userId: string;
    userEmail: string;
    blockId: string;
    workspaceId: string;
    sharedWith: Array<{
      email: string;
      permission: "viewer" | "editor" | "admin";
    }>;
  }): Promise<{ message: string; permissionId: string }> {
    if (!userId || !blockId || !workspaceId || !Array.isArray(sharedWith) || sharedWith.length === 0) {
      throw new Error("userId, blockId, workspaceId, and non-empty sharedWith array are required");
    }

    // Permission check is now handled at API level
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const blocksColl = metadataDb.collection<IBlock>("blocks");
    const usersColl = metadataDb.collection<IUser>("users");

    // Verify block exists
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      workspaceId: workspaceId,
      status: "alive"
    });

    if (!block) {
      throw new Error("Block not found");
    }

    // Normalize emails to lowercase
    const normalizedSharedWith = sharedWith.map((entry) => ({
      email: entry.email.toLowerCase(),
      permission: entry.permission,
    }));

    // Prepare subjects for permission document
    const subjects: Array<{ id: string; role: "viewer" | "editor" | "admin" | "owner" }> = [];

    // Fetch workspace to get name for email
    const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
    const workspace = await workspacesColl.findOne({ _id: new ObjectId(workspaceId) });
    const workspaceName = workspace?.name || "Workspace";

    // Process each user to share with
    for (const entry of normalizedSharedWith) {
      // Find or create user
      let user = await usersColl.findOne({ email: entry.email });

      if (!user) {
        // Create new user if doesn't exist
        const newUser = {
          email: entry.email,
          name: entry.email.split('@')[0] || "Unknown",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const result = await usersColl.insertOne(newUser);
        user = { ...newUser, _id: result.insertedId };
      }

      // Add to subjects list
      subjects.push({
        id: String(user._id),
        role: entry.permission as "viewer" | "editor" | "admin",
      });

      // Send email notification
      const link = `${process.env.MAIL_LINK}/${blockId}`;
      const blockName = (block.value as IPage)?.title || "New page";
      const blockIcon = (block.value as IPage)?.icon || "";

      // Fetch sender name if possible
      let displayName = userEmail;
      try {
        const senderUser = await usersColl.findOne({ _id: new ObjectId(userId) });
        if (senderUser && senderUser.name) {
          displayName = senderUser.name;
        }
      } catch (e) {
        console.error("Failed to fetch sender name:", e);
      }

      try {
        await sendEmail({
          to: entry.email,
          subject: "📄 A Note Has Been Shared With You",
          html: getNoteSharedHtml(link, displayName, workspaceName, blockName),
        });

        // Also notify via Slack if possible
        await SlackNotificationService.notifyShare({
          workspaceId,
          recipientEmail: entry.email,
          senderName: displayName,
          noteTitle: blockName,
          noteIcon: blockIcon,
          noteUrl: link
        });
      } catch (error) {
        console.error(`Failed to send share notifications to ${entry.email}:`, error);
        // Continue execution even if notification fails
      }
    }

    // Get the block's aclIds array
    if (!block.aclIds || block.aclIds.length === 0) {
      throw new Error("Block has no permission ACLs");
    }

    // Get the last permission ID from the block's aclIds array
    const lastPermissionId = block.aclIds[block.aclIds.length - 1]!;

    const permissionsColl = metadataDb.collection<IPermission>("permissions");

    // Fetch the last permission document
    const lastPermission = await permissionsColl.findOne({
      _id: new ObjectId(lastPermissionId)
    });

    if (!lastPermission) {
      throw new Error("Last permission document not found");
    }

    // Add new subjects to the existing permission's subjects array
    // Avoid duplicates by checking if user already exists
    // Separate new users from existing ones
    const existingSubjectIds = new Set(lastPermission.subjects.map(s => s.id));
    const newSubjects = subjects.filter(s => !existingSubjectIds.has(s.id));
    const existingSubjectsToUpdate = subjects.filter(s => existingSubjectIds.has(s.id));

    const bulkOps: any[] = [];

    // Op 1: Add new subjects
    if (newSubjects.length > 0) {
      bulkOps.push({
        updateOne: {
          filter: { _id: new ObjectId(lastPermissionId) },
          update: {
            $push: { subjects: { $each: newSubjects } },
            $set: { updatedAt: new Date() }
          }
        }
      });
    }

    // Op 2: Update existing subjects
    for (const subject of existingSubjectsToUpdate) {
      bulkOps.push({
        updateOne: {
          filter: {
            _id: new ObjectId(lastPermissionId),
            "subjects.id": subject.id
          },
          update: {
            $set: { "subjects.$.role": subject.role, updatedAt: new Date() }
          }
        }
      });
    }

    if (bulkOps.length > 0) {
      await permissionsColl.bulkWrite(bulkOps);
    }

    // Sync to User's sharedPageIds (Add block to their Sidebar)
    if (newSubjects.length > 0) {
      // Check parent access for valid subjects
      // We check if the block has a parent and verify user access to it
      const parentId = (block as any).parentId;

      for (const subject of newSubjects) {
        let userHasParentAccess = false;

        if (parentId) {
          try {
            // Check if user has access to the parent block (viewer role is sufficient to see it in tree)
            userHasParentAccess = await PermissionService.checkAccess({
              userId: subject.id,
              blockId: parentId,
              requiredRole: 'viewer'
            });
          } catch (e) {
            console.error("Error checking parent access for sidebar sync", e);
          }
        }

        if (!userHasParentAccess) {
          const usersColl = metadataDb.collection<IUser>("users");
          const res = await usersColl.updateOne(
            { _id: new ObjectId(subject.id), "workspaceSettings.workspaceId": workspaceId },
            { $addToSet: { "workspaceSettings.$.sharedPageIds": blockId } as any }
          );
          if (res.matchedCount === 0) {
            await usersColl.updateOne(
              { _id: new ObjectId(subject.id) },
              { $push: { workspaceSettings: { workspaceId, sharedPageIds: [blockId], privatePageIds: [] } } as any }
            );
          }
        } else {
          console.log(`User ${subject.id} already has access to parent ${parentId}, skipping addition to sharedPageIds`);
        }
      }
    }

    return {
      message: "Block sharing settings updated successfully",
      permissionId: lastPermissionId,
    };
  },

  async logShareAudit({
    userId,
    userEmail,
    blockId,
    workspaceId,
    sharedWith
  }: {
    userId: string;
    userEmail: string;
    blockId: string;
    workspaceId: string;
    sharedWith: Array<{ email: string; permission: string }>
  }) {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const usersColl = metadataDb.collection<IUser>("users");
    const user = await usersColl.findOne({ _id: new ObjectId(userId) });
    const blocksColl = metadataDb.collection<IBlock>("blocks");
    const block = await blocksColl.findOne({ _id: new ObjectId(blockId) });

    if (user && block) {
      const title = (block.value as IPage)?.title || "New page";
      await AuditService.log({
        action: "SHARE",
        noteId: blockId,
        userId,
        userEmail,
        userName: user.name || "Unknown",
        noteName: title,
        serviceType: "MONGODB",
        field: "permission",
        oldValue: undefined,
        newValue: JSON.stringify(sharedWith),
        workspaceId: workspaceId,
      }).catch(console.error);
    }
  },


  /**
   * Fetches all blocks for a parent and their nested children recursively
   * Returns the complete tree with all blockIds arrays
   */
  async getOnlineContentForPage(
    parentId: string,
    workspaceId: string,
    userId?: string // Optional userId to fetch permissions
  ): Promise<{
    blocks: IBlock[];
    blockIds: string[];
    fetchTime: string;
    permission?: PermissionRole | null;
  }> {
    const { parentBlock, blocksColl } = await getParentBlock(parentId, workspaceId);

    // Initialize permission
    let permission: PermissionRole | null = null;
    if (userId) {
      permission = await PermissionService.getUserRole({
        userId,
        blockId: parentId,
        workspaceId
      });
    }

    if (!parentBlock) {
      return {
        blocks: [],
        blockIds: [],
        fetchTime: new Date().toISOString(),
        permission
      };
    }

    const blockIds = ('blockIds' in parentBlock ? parentBlock.blockIds : parentBlock.pageIds) ?? [];

    if (!Array.isArray(blockIds) || blockIds.length === 0) {
      return {
        blocks: [],
        blockIds: [],
        fetchTime: new Date().toISOString(),
        permission
      };
    }

    // Fetch all blocks recursively
    const allBlocks: IBlock[] = [];
    const processedIds = new Set<string>(); // Prevent infinite loops
    const idsToFetch = [...blockIds];

    while (idsToFetch.length > 0) {
      // Get next batch of IDs to fetch
      const currentBatch = idsToFetch.splice(0, 100); // Process in batches of 100
      const currentBatchObjectIds = currentBatch
        .filter((id) => !processedIds.has(id))
        .map((id) => new ObjectId(id));

      if (currentBatchObjectIds.length === 0) continue;

      // Fetch blocks
      const fetchedBlocks = await blocksColl
        .find({
          _id: { $in: currentBatchObjectIds },
          status: "alive",
        })
        .toArray();

      // Add to results
      for (const block of fetchedBlocks) {
        const blockIdStr = String(block._id);
        if (!processedIds.has(blockIdStr)) {
          allBlocks.push(block);
          processedIds.add(blockIdStr);

          // If this block has children, queue them for fetching
          // Only recurse for content blocks (nested content)
          if (block.blockType === "content" && block.blockIds && block.blockIds.length > 0) {
            for (const childId of block.blockIds) {
              if (!processedIds.has(childId)) {
                idsToFetch.push(childId);
              }
            }
          }
        }
      }
    }

    return {
      blocks: allBlocks,
      blockIds,
      fetchTime: new Date().toISOString(),
      permission
    };
  },

  /**
   * Fetches all root pages and collection views for a workspace
   */
  async getAllPagesAndCollectionViews({ workspaceId, userId }: { workspaceId: string, userId: string }): Promise<IBlock[]> {
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }

    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    // 1. Get User Settings for WorkArea IDs
    const usersColl = metadataDb.collection<IUser>("users");
    const user = await usersColl.findOne({ _id: new ObjectId(userId) });
    const userSettings = user?.workspaceSettings?.find(w => w.workspaceId === workspaceId);
    const userWorkAreaIds = userSettings?.workAreaIds || [];
    const userSharedPageIds = userSettings?.sharedPageIds || [];
    const userTemplatePageIds = userSettings?.templatePageIds || [];

    // 2. Resolve Homepages for these WorkAreas
    // Optimization: We rely on the `workareaId` being correctly set on all blocks (including root pages)
    // inside a WorkArea. Thus, we don't need to fetch the WorkArea document to find its `blockId`.

    const blocksColl = metadataDb.collection<IBlock>("blocks");

    return blocksColl
      .find({
        workspaceId: workspaceId,
        status: "alive",
        $or: [
          // 1. Collection Views (Send all irrespective of owner)
          { blockType: "collection_view" },
          // 2. Public / Restricted Pages
          { "value.pageType": { $in: ["public", "restricted"] } },
          // 3. WorkArea Pages & Homepages (Content inside WorkArea)
          { workareaId: { $in: userWorkAreaIds } },
          // 4. Shared Pages (Explicitly shared with user)
          { _id: { $in: userSharedPageIds.map(id => new ObjectId(id)) } },
          // 5. Template Pages (Explicitly shared with user)
          { _id: { $in: userTemplatePageIds.map(id => new ObjectId(id)) } },
          // 6. Private Pages Owned by Me
          { "value.pageType": "private", "createdBy.userId": userId }
        ]
      })
      .toArray();
  },

  async dragAndDropBlocks({
    dragAndDropinputfieldArray,
    updatedBlockInfo,
    userId,
  }: {
    dragAndDropinputfieldArray: DragAndDropinputfield[];
    updatedBlockInfo?: inputUpdateBlockInfo;
    userId: string;
  }) {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
    for (const dragAndDropinputfield of dragAndDropinputfieldArray) {
      const { parentId, workspaceId, blockIdArray, typeofChild } = dragAndDropinputfield;
      if (
        !dragAndDropinputfield.parentId ||
        !Array.isArray(dragAndDropinputfield.blockIdArray)
      ) {
        throw new Error("parentId and blockIdArray are required");
      }

      if (parentId == workspaceId) {
        if (typeofChild == "public") {
          await workspacesColl.updateOne(
            { _id: new ObjectId(workspaceId) },
            { $set: { publicPageIds: blockIdArray, updatedAt: new Date() } }
          );
        } else if (typeofChild == "private") {
          const usersColl = metadataDb.collection<IUser>("users");
          const res = await usersColl.updateOne(
            { _id: new ObjectId(userId), "workspaceSettings.workspaceId": workspaceId },
            { $set: { "workspaceSettings.$.privatePageIds": blockIdArray, updatedAt: new Date() } }
          );
          if (res.matchedCount === 0) {
            await usersColl.updateOne(
              { _id: new ObjectId(userId) },
              {
                $push: { workspaceSettings: { workspaceId, privatePageIds: blockIdArray } } as any,
                $set: { updatedAt: new Date() }
              }
            );
          }
        } else if (typeofChild == "template") {
          const usersColl = metadataDb.collection<IUser>("users");
          const res = await usersColl.updateOne(
            { _id: new ObjectId(userId), "workspaceSettings.workspaceId": workspaceId },
            { $set: { "workspaceSettings.$.templatePageIds": blockIdArray, updatedAt: new Date() } }
          );
          if (res.matchedCount === 0) {
            await usersColl.updateOne(
              { _id: new ObjectId(userId) },
              {
                $push: { workspaceSettings: { workspaceId, templatePageIds: blockIdArray } } as any,
                $set: { updatedAt: new Date() }
              }
            );
          }
        } else if (typeofChild == "workarea") {
          await workspacesColl.updateOne(
            { _id: new ObjectId(workspaceId) },
            { $set: { workAreaIds: blockIdArray, updatedAt: new Date() } }
          );
        } else {
          throw new Error("Invalid typeofChild");
        }
        continue;
      }// for workareads root pages
      else if (parentId == null) {
        //it means user shuffle the private public or workarea sequence shuffle the sidebar sequence
        const usersColl = metadataDb.collection<IUser>("users");
        const res = await usersColl.updateOne(
          { _id: new ObjectId(userId), "workspaceSettings.workspaceId": workspaceId },
          { $set: { "workspaceSettings.$.sidebarOrder": blockIdArray, updatedAt: new Date() } as any }
        );
        if (res.matchedCount === 0) {
          await usersColl.updateOne(
            { _id: new ObjectId(userId) },
            {
              $push: { workspaceSettings: { workspaceId, sidebarOrder: blockIdArray, privatePageIds: [], sharedPageIds: [] } } as any,
              $set: { updatedAt: new Date() }
            }
          );
        }
        continue;
      }
      const { parentBlock, blocksColl, isWorkArea } = await getParentBlock(parentId, workspaceId);

      if (isWorkArea) {
        const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");
        await workAreasColl.updateOne(
          { _id: new ObjectId(parentId) },
          {
            $set: {
              pageIds: blockIdArray,
              updatedAt: new Date(),
            },
          }
        );
        continue;
      }

      if (parentBlock) {
        await blocksColl.updateOne(
          { _id: new ObjectId(parentId) },
          {
            $set: {
              blockIds: blockIdArray,
              updatedAt: new Date(),
            },
          }
        );

        continue;
      }

      const dataSourceColl = metadataDb.collection<IDatabaseSource>("databaseSources");
      const dataSource = await dataSourceColl.findOneAndUpdate(
        { _id: new ObjectId(parentId) },
        {
          $set: {
            blockIds: blockIdArray,
            updatedAt: new Date(),
          },
        }
      );
      if (!dataSource) {
        throw new Error("Parent not found in Blocks, Workspaces, dataSource or WorkAreas");
      }
    }


    if (updatedBlockInfo) {
      const blockColl = metadataDb.collection<IBlock>("blocks");

      // Fetch the moved block BEFORE updating to get old parent info
      const movedBlock = await blockColl.findOne({
        _id: new ObjectId(updatedBlockInfo.blockId)
      });

      if (!movedBlock) {
        throw new Error("Block to move not found");
      }

      // Check if parent changed (requires ACL update)
      const parentChanged = (
        String(movedBlock.parentId) !== String(updatedBlockInfo.parentId) ||
        movedBlock.parentType !== updatedBlockInfo.parentType
      );

      // Get OLD parent's ACL chain BEFORE updating
      let oldAncestorAclIds: string[] = [];
      if (parentChanged) {
        oldAncestorAclIds = await PermissionService.initializeBlockACL(
          String(movedBlock.parentId),
          movedBlock.parentType
        );
      }

      // Update block metadata
      const updates = {
        parentType: updatedBlockInfo.parentType,
        parentId: updatedBlockInfo.parentId
      };

      // specific check for pageType update
      if (updatedBlockInfo.pageType) {
        updates["value.pageType"] = updatedBlockInfo.pageType;
      }
       
      if(updatedBlockInfo.workareaId){
        updates["workareaId"] = updatedBlockInfo.workareaId;
      }
      await blockColl.updateOne(
        { _id: new ObjectId(updatedBlockInfo.blockId) },
        {
          $set: { ...updates, updatedAt: new Date() }
        }
      );

      // Update ACL if parent changed
      if (parentChanged) {
        console.log(`Parent changed for block ${updatedBlockInfo.blockId}, updating ACL...`);

        // Get NEW parent's ACL chain AFTER updating
        const newAncestorAclIds = await PermissionService.initializeBlockACL(
          String(updatedBlockInfo.parentId),
          updatedBlockInfo.parentType
        );

        await this.updateSubtreeACL({
          blockId: String(updatedBlockInfo.blockId),
          oldAncestorAclIds,
          newAncestorAclIds
        });

        console.log(`ACL update completed for block ${updatedBlockInfo.blockId}`);
      }

      // Audit Log: Move Block
      try {
        const usersColl = metadataDb.collection<IUser>("users");
        const user = await usersColl.findOne({ _id: new ObjectId(userId) });
        if (user) {
          AuditService.log({
            action: "UPDATE",
            noteId: updatedBlockInfo.blockId,
            userId: userId,
            userEmail: user.email,
            userName: user.name || "Unknown",
            noteName: (movedBlock as any).content || "Block",
            serviceType: "MONGODB",
            field: "block", // or 'parent'
            oldValue: JSON.stringify({ parentId: movedBlock.parentId }),
            newValue: JSON.stringify({ parentId: updatedBlockInfo.parentId }),
            workspaceId: String(movedBlock.workspaceId),
          }).catch(console.error);
        }
      } catch (e) { console.error("Audit log failed for dragAndDropBlocks", e); }
    }
  },

  /**
   * Update ACL for a moved block and all its descendants
   * Replaces old ancestor chain with new ancestor chain while preserving own ACLs
   */
  async updateSubtreeACL({
    blockId,
    oldAncestorAclIds,
    newAncestorAclIds,
    newWorkareaId
  }: {
    blockId: string;
    oldAncestorAclIds: string[];  // Old parent's full ancestor chain to remove
    newAncestorAclIds: string[];  // New parent's full ancestor chain to add
    newWorkareaId?: string | null;
  }): Promise<void> {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const blocksColl = metadataDb.collection<IBlock>("blocks");

    // 1. Fetch the block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      status: "alive"
    });

    if (!block) {
      console.log(`Block ${blockId} not found, skipping ACL update`);
      return;
    }

    // 2. Calculate new ACL for this block
    const currentAcls = block.aclIds || [];

    // Remove old ancestor ACLs (everything that came from old parent chain)
    const ownAcls = currentAcls.filter(
      aclId => !oldAncestorAclIds.includes(aclId)
    );

    // Add new ancestor ACLs at the beginning (parent ACLs come first)
    const newAcls = [...newAncestorAclIds, ...ownAcls];

    console.log(`Updating ACL for block ${blockId}:`, {
      old: currentAcls,
      new: newAcls,
      removed: oldAncestorAclIds,
      added: newAncestorAclIds,
      kept: ownAcls
    });

    // 3. Update this block's ACL and workareaId
    const updates: any = {
      aclIds: newAcls
    };

    if (newWorkareaId !== undefined) {
      updates.workareaId = newWorkareaId;
    }

    await blocksColl.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: { ...updates, updatedAt: new Date() }
      }
    );

    // 4. Recursively update all children
    if (block.blockIds && block.blockIds.length > 0) {
      // For children, the old chain includes old ancestors + this block's own ACLs
      const oldChainForChildren = [...oldAncestorAclIds, ...ownAcls];

      // For children, the new chain includes new ancestors + this block's own ACLs
      const newChainForChildren = [...newAncestorAclIds, ...ownAcls];

      console.log(`Recursively updating ${block.blockIds.length} children of block ${blockId}`);

      // Process children in parallel for performance
      await Promise.all(
        block.blockIds.map(childId =>
          this.updateSubtreeACL({
            blockId: String(childId),
            oldAncestorAclIds: oldChainForChildren,
            newAncestorAclIds: newChainForChildren,
            newWorkareaId
          })
        )
      );
    }

    console.log(`ACL update complete for block ${blockId} and its descendants`);
  },

  async updateCover({ blockId, coverUrl, userId, userEmail, userName }: { blockId: string; coverUrl: string; userId: string; userEmail: string; userName?: string; }) {
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();
    const blockColl = metadataDb.collection<IBlock>("blocks");
    const block = await blockColl.findOne({ _id: new ObjectId(blockId) });
    if (!block) {
      throw new Error("Block not found");
    }
    if (!block.value || Array.isArray(block.value) || !('coverURL' in block.value)) {
      throw new Error("Block is not a page or does not support covers");
    }
    block.value.coverURL = coverUrl;
    await blockColl.updateOne({ _id: new ObjectId(blockId) }, { $set: { value: block.value, updatedAt: new Date() } });

    // Audit Log: Update Cover
    if (userId && userEmail) {
      AuditService.log({
        action: "UPDATE",
        noteId: blockId,
        userId: userId,
        userEmail: userEmail,
        userName: userName || "Unknown",
        noteName: (block.value as any).title || "Block",
        serviceType: "MONGODB",
        field: "cover",
        oldValue: undefined,
        newValue: coverUrl,
        workspaceId: String(block.workspaceId),
      }).catch(console.error);
    }

    return { url: coverUrl };
  },
  async updateChildrenOrder({
    parentId,
    childIds,
  }: {
    parentId: string;
    childIds: string[];

  }): Promise<void> {
    const client = await clusterManager.getMetadataClient();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");
    const dataSourcesColl = db.collection<IDatabaseSource>("databaseSources");

    // 1. Try updating Block
    const blockUpdate = await blocksColl.updateOne(
      { _id: new ObjectId(parentId) },
      {
        $set: {
          blockIds: childIds,
          updatedAt: new Date()
        }
      }
    );

    if (blockUpdate.matchedCount > 0) {
      return;
    }

    // 2. Try updating DataSource
    const dsUpdate = await dataSourcesColl.updateOne(
      { _id: new ObjectId(parentId) },
      {
        $set: {
          blockIds: childIds,
          updatedAt: new Date()
        }
      }
    );

    if (dsUpdate.matchedCount > 0) {
      return;
    }

    throw new Error("Parent not found in Blocks or DataSources");
  },
};
