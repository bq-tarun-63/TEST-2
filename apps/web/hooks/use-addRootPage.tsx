import { useAuth } from "@/hooks/use-auth";
import { postWithAuth } from "@/lib/api-helpers";
import { Members } from "@/types/workspace";
import { ObjectId } from "bson";
import { useState } from "react";
import { toast } from "sonner";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { Comment } from "@/types/board";
import { useGlobalBlocks } from "@/contexts/blockContext";
import type { Block } from "@/types/block";
import { useBoard } from "@/contexts/boardContext";
import { generateSprintPageAndBoard } from "@/lib/createSprintPage";

export interface Node {
  id: string;
  noteId: string;
  title: string;
  parentId: string | null;
  gitPath: string;
  commitSha: string;
  createdAt: string;
  updatedAt: string;
  content: string;
  icon?: string;
  children: { _id: string; title: string; icon?: string }[];
  isPublicNote: boolean;
  userEmail?: string;
  isPublish?: boolean;
  isRestrictedPage?: boolean;
  isTemplate?: boolean;
  workAreaId: string;
}

export interface Page extends Node {
  databaseViewId?: string;
  databaseProperties?: Record<string, string>;
  description?: string;
  assign?: Members[];
  noteType?: string;
  contentPath?: string;
  comments: Comment[];
}


export default function useAddRootPage() {
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspaceContext();
  const { addBlock, updateBlock, getBlock } = useGlobalBlocks();
  const { dataSources, updateDataSource, getDataSource } = useBoard();

  let newPageID = "";

  const addRootPage = async (newBlockId: string, newBlock: Block, dataSourceId: string, view_databaseId: string, insertAfterBlockId?: string | null) => {
    setError(null);
    // If viewId is provided, this is a datasource - create page block like sidebar
    if (dataSourceId) {
      if (!currentWorkspace?._id) {
        toast.error("Workspace not found");
        setError("Workspace not found");
        return { page: {} as Block, newPageID: "", error: "Workspace not found" };
      }
      // Step 4: Optimistic Updates - Add block to global context
      addBlock(newBlock);

      //  Update datasource in board context with new page block ID
      const currentDataSource = dataSources[dataSourceId];
      let originalDataSourceBlockIds: string[] = [];
      let finalInsertAfterId = insertAfterBlockId;

      if (currentDataSource) {
        originalDataSourceBlockIds = currentDataSource.blockIds || [];

        // If no insertAfterBlockId provided, default to the last block in the datasource
        if (finalInsertAfterId === undefined) {
          finalInsertAfterId = originalDataSourceBlockIds.length > 0
            ? originalDataSourceBlockIds[originalDataSourceBlockIds.length - 1]
            : null;
        }

        updateDataSource(dataSourceId, {
          blockIds: [...originalDataSourceBlockIds, newBlockId]
        });
      }
      console.log("Printing the DataSource ", dataSources);

      // Step 6: Call API to create the page block
      try {
        let blocksPayload: any[] = [
          {
            _id: newBlockId,
            blockType: "page",
            value: newBlock.value,
            insertAfterBlockID: finalInsertAfterId || null,
          }
        ];

        let sprintBoardBlock: Block | null = null;

        // INTERCEPT SPRINTS DATASOURCE:
        // Automatically spawn the nested Task Tracking board if isSprint & tasks linked
        if (currentDataSource?.isSprint) {
          // ─── Fast path: read paired datasource ID directly from top-level field ───
          let tasksDataSourceId: string | undefined =
            currentDataSource.pairedDataSourceId;

          // ─── Fallback for older Sprints created before this setting existed ───────
          let syncedSprintRelationId: string | undefined;
          if (!tasksDataSourceId) {
            const sprintProps = Object.values(currentDataSource.properties || {});
            const relationProp = sprintProps.find(p => p.type === 'relation' && p.linkedDatabaseId);
            if (relationProp?.linkedDatabaseId) {
              tasksDataSourceId = typeof relationProp.linkedDatabaseId === "string"
                ? relationProp.linkedDatabaseId
                : String(relationProp.linkedDatabaseId);
              syncedSprintRelationId = relationProp.syncedPropertyId;
            }
          } else {
            // Fast path: still need syncedPropertyId — find the matching relation prop
            const sprintProps = Object.values(currentDataSource.properties || {});
            const relationProp = sprintProps.find(
              p => p.type === 'relation' && String(p.linkedDatabaseId) === tasksDataSourceId
            );
            syncedSprintRelationId = relationProp?.syncedPropertyId;
          }

          if (tasksDataSourceId && syncedSprintRelationId) {
            // Retrieve properties from the linked Tasks datasource
            const tasksDataSource = getDataSource(tasksDataSourceId);

            if (tasksDataSource) {
              const tasksProps = Object.keys(tasksDataSource.properties || {});
              const assigneePropId = tasksProps.find(id => tasksDataSource.properties[id]?.type === "person") || "";
              const dueDatePropId = tasksProps.find(id => tasksDataSource.properties[id]?.type === "date" && tasksDataSource.properties[id]?.name.toLowerCase().includes("due")) || "";
              const statusPropId = tasksProps.find(id => tasksDataSource.properties[id]?.type === "status") || "";
              const createdPropId = tasksProps.find(id => tasksDataSource.properties[id]?.type === "date" && tasksDataSource.properties[id]?.name.toLowerCase().includes("created")) || "";

              // Extract Sprints Data Source Status schema and search for "Future"
              const sprintPropsKeys = Object.keys(currentDataSource.properties || {});
              const sprintStatusPropId = sprintPropsKeys.find(id => currentDataSource.properties[id]?.type === "status") || "";
              let futureStatusId = "";

              if (sprintStatusPropId) {
                const statusOptions = currentDataSource.properties[sprintStatusPropId]?.options || [];
                const futureOpt = statusOptions.find((opt: any) => opt.name === "Future");
                if (futureOpt) {
                  futureStatusId = futureOpt.id;
                }
              }

              // ── Sprint ID counter ─────────────────────────────────
              // Find the "id"-type property in the Sprints datasource
              const sprintIdPropId = sprintPropsKeys.find(
                id => currentDataSource.properties[id]?.type === "id"
              ) || "";
              const lastSprintId = currentDataSource.lastSprintId ?? 0;
              const nextSprintId = lastSprintId + 1;

              const generatedSprint = generateSprintPageAndBoard({
                workspaceId: currentWorkspace._id,
                userEmail: user?.email || "Unknown",
                sprintsBlockId: currentDataSource.mainView || dataSourceId,
                sprintsDataSourceId: dataSourceId,
                tasksDataSourceId: tasksDataSourceId,
                assigneePropertyId: assigneePropId,
                dueDatePropertyId: dueDatePropId,
                statusPropertyId: statusPropId,
                sprintRelationId: syncedSprintRelationId,
                createdPropertyId: createdPropId,
                sprintName: newBlock.value?.title || "New Sprint",
                pageId: newBlockId,
                sprintStatusPropertyId: sprintStatusPropId,
                sprintStatusId: futureStatusId || undefined,
                sprintIdPropertyId: sprintIdPropId || undefined,
              });

              // Inject the numeric sprint ID into the newly created page's properties
              if (sprintIdPropId) {
                if (!generatedSprint.pageBlock.value.databaseProperties) {
                  generatedSprint.pageBlock.value.databaseProperties = {};
                }
                generatedSprint.pageBlock.value.databaseProperties[sprintIdPropId] = nextSprintId;
              }

              // Overwrite the simple block payload generated by UI default with the enhanced DB note payload
              blocksPayload = [
                {
                  _id: generatedSprint.pageBlock._id,
                  blockType: "page",
                  value: generatedSprint.pageBlock.value,
                  insertAfterBlockID: finalInsertAfterId || null,
                }
              ];

              sprintBoardBlock = generatedSprint.boardBlock;

              // Overwrite the local newBlock so the store catches the properly typed Template payload
              newBlock = generatedSprint.pageBlock;
              addBlock(newBlock); // refresh over the initial global context add
              
              // Optimistic update in the board context
              updateDataSource(dataSourceId, { lastSprintId: nextSprintId });

              // Fire-and-forget to backend (non-blocking)
              postWithAuth("/api/database/update", {
                blockId: currentDataSource.mainView || dataSourceId,
                dataSourceId,
                lastSprintId: nextSprintId,
              }).catch(err => {
                console.error("Failed to persist lastSprintId:", err);
              });
            }
          }
        }

        await postWithAuth("/api/note/block/batch-create", {
          view_databaseId: view_databaseId,
          parentId: dataSourceId,
          workspaceId: currentWorkspace._id,
          parentTable: "collection", // Datasource is a block
          blocks: blocksPayload,
        });

        // Add the secondary board block into the global context so it correctly exists on first open
        if (sprintBoardBlock) {
          await postWithAuth("/api/note/block/batch-create", {
            view_databaseId: dataSourceId,
            parentId: newBlockId,
            workspaceId: currentWorkspace._id,
            parentTable: "page",
            blocks: [
              {
                _id: sprintBoardBlock._id,
                blockType: "collection_view",
                value: sprintBoardBlock.value,
                insertAfterBlockID: null,
              }
            ],
          });

          addBlock(sprintBoardBlock);
        }

        // Step 7: Optimistically check and persist reverse relations
        if (newBlock.value && newBlock.value.databaseProperties && currentDataSource?.properties) {
          const props = newBlock.value.databaseProperties;
          for (const key of Object.keys(props)) {
            const propertySchema = currentDataSource.properties[key];
            const propertyType = propertySchema?.type;
            const value = props[key];

            if (propertyType === "relation" && propertySchema?.syncedPropertyId && propertySchema?.linkedDatabaseId) {
              const linkedDatabaseId = typeof propertySchema.linkedDatabaseId === "string"
                ? propertySchema.linkedDatabaseId
                : String(propertySchema.linkedDatabaseId);
              const syncedPropertyId = propertySchema.syncedPropertyId;

              const newRelationIds = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);

              const linkedDataSource = getDataSource(linkedDatabaseId);
              if (linkedDataSource && linkedDataSource.properties[syncedPropertyId]) {
                const reverseProperty = linkedDataSource.properties[syncedPropertyId];
                const reverseRelationLimit = reverseProperty.relationLimit || "multiple";

                for (const relatedBlockId of newRelationIds) {
                  const relatedBlock = getBlock(relatedBlockId);
                  if (relatedBlock && relatedBlock.value) {
                    const relatedProps = (relatedBlock.value as any).databaseProperties || {};
                    const currentReverseValue = relatedProps[syncedPropertyId];

                    let newReverseValue;
                    if (reverseRelationLimit === "single") {
                      // If there are existing values, we are overwriting them. We must clean up ALL the old related blocks!
                      if (currentReverseValue) {
                        const oldLinkedBlockIds = Array.isArray(currentReverseValue)
                          ? currentReverseValue.map(String)
                          : [String(currentReverseValue)];

                        const blocksToUnlink = oldLinkedBlockIds.filter(id => id !== newBlockId);

                        for (const oldLinkedBlockId of blocksToUnlink) {
                          const oldLinkedBlock = getBlock(oldLinkedBlockId);

                          if (oldLinkedBlock && oldLinkedBlock.value) {
                            const oldLinkedProps = (oldLinkedBlock.value as any).databaseProperties || {};
                            const oldForwardValue = oldLinkedProps[key];

                            let newOldForwardValue;
                            // Check if the forward property (on Note A) is array or string
                            if (propertySchema?.relationLimit === "single") {
                              newOldForwardValue = null;
                            } else {
                              const oldForwardArray = Array.isArray(oldForwardValue)
                                ? oldForwardValue.map(String)
                                : (oldForwardValue ? [String(oldForwardValue)] : []);
                              newOldForwardValue = oldForwardArray.filter(id => id !== relatedBlockId);
                            }

                            // Optimistically clear it on the old block
                            updateBlock(oldLinkedBlockId, {
                              ...oldLinkedBlock,
                              value: {
                                ...oldLinkedBlock.value,
                                databaseProperties: {
                                  ...oldLinkedProps,
                                  [key]: newOldForwardValue,
                                },
                              },
                            });

                            // Persist the cleanup to the server
                            postWithAuth(`/api/database/updatePropertyValue`, {
                              dataSourceId: currentDataSource?._id || view_databaseId,
                              blockId: oldLinkedBlockId,
                              propertyId: key,
                              value: newOldForwardValue,
                              workspaceName: currentWorkspace?.name || "",
                            }).catch(err => {
                              console.error(`Failed to cleanup orphaned forward relation on block ${oldLinkedBlockId}`, err);
                            });
                          }
                        }
                      }
                      // For single relation, replace with current note ID
                      newReverseValue = newBlockId;
                    } else {
                      const currentArray = Array.isArray(currentReverseValue)
                        ? currentReverseValue.map(String)
                        : (currentReverseValue ? [String(currentReverseValue)] : []);

                      if (!currentArray.includes(newBlockId)) {
                        newReverseValue = [...currentArray, newBlockId];
                      }
                    }

                    if (newReverseValue !== undefined) {
                      // Optimistic Update
                      updateBlock(relatedBlockId, {
                        ...relatedBlock,
                        value: {
                          ...relatedBlock.value,
                          databaseProperties: {
                            ...relatedProps,
                            [syncedPropertyId]: newReverseValue,
                          },
                        },
                      });

                      // Persist reverse relation back to server
                      postWithAuth(`/api/database/updatePropertyValue`, {
                        dataSourceId: linkedDatabaseId,
                        blockId: relatedBlockId,
                        propertyId: syncedPropertyId,
                        value: newReverseValue,
                        workspaceName: currentWorkspace?.name || "",
                      }).catch((err) => {
                        console.error(`Failed to update reverse relation for ${relatedBlockId}:`, err);
                      });
                    }
                  }
                }
              }
            }
          }
        }

      } catch (apiErr) {
        console.error("Failed to create page block:", apiErr);
        toast.error("Failed to create page");

        // Rollback: Restore datasource blockIds in both contexts
        // if (currentDataSource) {
        //   updateDataSource(dataSourceId, { blockIds: originalDataSourceBlockIds });
        // }

        const errorMsg = apiErr instanceof Error ? apiErr.message : "Failed to create page";
        setError(errorMsg);
      }
    } else {
      toast.error("Page creation requires a datasource (viewId)");
      setError("Page creation requires a datasource (viewId)");
    }
  }
  return { newPageID, addRootPage, error };
}
