"use client";

import { deleteWithAuth, postWithAuth, getWithAuth } from "@/lib/api-helpers";
import { BoardProperty, BoardPropertyOption, DatabaseSource, Note, RollupConfig } from "@/types/board";
import { toast } from "sonner";
import { useBoard } from "@/contexts/boardContext";
import { useNotifications } from "@/hooks/use-notifications";
import { Members } from "@/types/workspace";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { updatePropertyVisibility } from "@/services-frontend/boardServices/databaseSettingsService";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { generatePropertyId, createDefaultOptions } from "@/lib/propertyIdGenerator";

export const useDatabaseProperties = (
    board: Block,
    note: Block,
    onUpdate: (updatedNote: Block) => void,
) => {
    const { getCurrentDataSource, setDataSource, updateDataSource, currentView, dataSources, setPropertyVisibility, getPropertyVisibility, getNotesByDataSourceId, getDataSource } = useBoard();
    const { getBlock, updateBlock } = useGlobalBlocks();
    const { notifyNoteAssigned } = useNotifications();
    const { currentWorkspace } = useWorkspaceContext();

    // Helper to get current dataSourceId from current view ID (not type)
    // IMPORTANT: Always match by view ID first, only use type as fallback
    const getCurrentDataSourceId = (): string | null => {
        const currentViewData = currentView[board._id];
        // Get board from global block context
        const latestBoard = getBlock(board._id) || board;

        let view;
        if (currentViewData?.id) {
            // Prioritize ID match - if currentViewData.id exists, ONLY match by ID
            view = latestBoard.value?.viewsTypes?.find((vt) => vt._id === currentViewData.id);
        } else if (currentViewData?.type) {
            // Only fallback to type if no ID is available
            view = latestBoard.value?.viewsTypes?.find((vt) => vt.viewType === currentViewData.type);
        }

        const dsId = view?.databaseSourceId;
        return dsId ? (typeof dsId === "string" ? dsId : String(dsId)) : null;
    };

    const handleAddProperty = async (
        type: string,
        options?: any,
        linkedDatabaseId?: string,
        relationConfig?: { relationLimit?: "single" | "multiple"; twoWayRelation?: boolean },
        customName?: string,
        rollupConfig?: RollupConfig,
        specialProperty?: boolean
    ): Promise<{ id: string; name: string; reversePropertyId?: string; options?: any[] } | null> => {

        console.log("........Adding property:", { type, options, linkedDatabaseId, relationConfig, customName, rollupConfig });

        // Get current data source to compare keys before adding
        const currentDataSource = getCurrentDataSource(board._id);
        console.log(".............Current Data Source before adding property:", currentDataSource);

        if (!currentDataSource) {
            toast.error("Data source not found!");
            return null;
        }

        const dataSourceId = currentDataSource._id;

        console.log("........current datasource id:", dataSourceId);
        if (!dataSourceId) {
            toast.error("Data source not found for current view!");
            return null;
        }

        // Store previous state for rollback
        const prevDataSource = { ...currentDataSource };

        const prevKeys = Object.keys(currentDataSource.properties || {});
        console.log("........Previous Property Keys:", prevKeys);

        // Generate property ID matching backend format: prop_<ObjectId>
        const propertyId = generatePropertyId();
        const propertyName = customName || type;

        const existingPropsOfSameType = Object.entries(currentDataSource.properties || {})
            .filter(([_, prop]) => prop.type === type && prop.default === true);
        const shouldBeDefault = existingPropsOfSameType.length === 0;

        // Create property schema matching backend structure
        const propertySchema: BoardProperty = {
            name: propertyName,
            type: type as BoardProperty["type"],
            default: shouldBeDefault,
            showProperty: true,
            ...(specialProperty ? { specialProperty: true } : {}),
        };

        // Set options based on type (backend will normalize IDs)
        if (type === "status" || type === "priority") {
            // Use default options for status and priority
            propertySchema.options = createDefaultOptions(type);
        } else if (options && options.length > 0) {
            // Pass options as-is, backend will normalize IDs
            propertySchema.options = options;
        }

        // Relation-specific fields
        if (type === "relation") {
            if (linkedDatabaseId) {
                propertySchema.linkedDatabaseId = linkedDatabaseId;
            }
            propertySchema.relationLimit = relationConfig?.relationLimit || "multiple";
            // twoWayRelation is sent in API payload but not stored in property schema
        }

        // Rollup-specific fields
        if (type === "rollup" && rollupConfig) {
            propertySchema.rollup = {
                relationPropertyId: rollupConfig.relationPropertyId,
                relationDataSourceId: rollupConfig.relationDataSourceId,
                targetPropertyId: rollupConfig.targetPropertyId,
                calculation: rollupConfig.calculation ?? { category: "original", value: "original" },
                selectedOptions: rollupConfig.selectedOptions,
            };
        }

        // Optimistically update datasource with new property (matching backend structure)
        const optimisticDataSource = {
            ...currentDataSource,
            properties: {
                ...currentDataSource.properties,
                [propertyId]: propertySchema,
            },
        };
        setDataSource(dataSourceId, optimisticDataSource as any);

        try {
            console.log("Calling API to create property:", { type, boardId: board._id, noteId: note._id, propertyId });

            // Build request payload
            const payload: any = {
                propertyId: propertyId, // Required by API
                dataSourceId: dataSourceId,
                blockId: board._id, // Optional for audit
                name: propertyName,
                type,
                options: propertySchema.options || [],
                ...(specialProperty ? { specialProperty: true } : {}),
            };

            // For relation properties, add linkedDatabaseId and relation config
            if (type === "relation") {
                if (linkedDatabaseId) {
                    payload.linkedDatabaseId = linkedDatabaseId;
                }
                if (relationConfig?.relationLimit) {
                    payload.relationLimit = relationConfig.relationLimit;
                }
                if (relationConfig?.twoWayRelation !== undefined) {
                    payload.twoWayRelation = relationConfig.twoWayRelation;
                }
            }

            // For rollup properties, add rollup config
            if (type === "rollup" && rollupConfig) {
                payload.rollup = {
                    relationPropertyId: rollupConfig.relationPropertyId,
                    relationDataSourceId: rollupConfig.relationDataSourceId,
                    targetPropertyId: rollupConfig.targetPropertyId,
                    calculation: rollupConfig.calculation ?? { category: "original", value: "original" },
                    selectedOptions: rollupConfig.selectedOptions,
                };
            }

            const res = await postWithAuth(`/api/database/createProperty`, payload);

            if (!res.success) {
                // Rollback on error
                // setDataSource(dataSourceId, prevDataSource);
                // toast.error("Failed to add property!");
                // return null;
            }

            console.log("New Property Response:", res);
            
            if (type === "relation" && res.dataSource) {
                const dsId = typeof res.dataSource._id === "string"
                    ? res.dataSource._id
                    : res.dataSource._id?.toString?.() || dataSourceId;
                setDataSource(dsId, res.dataSource);
            }
            
            // Update reverse datasource if two-way relation was created
            if (res.reverseDataSource && res.reverseProperty) {
                const reverseDs = res.reverseDataSource;
                const reverseDsId = reverseDs._id ? (typeof reverseDs._id === "string" ? reverseDs._id : reverseDs._id.toString()) : null;
                if (reverseDsId) {
                    // Update reverse datasource in context
                    setDataSource(reverseDsId, reverseDs as any);

                    // Fetch full reverse datasource to ensure consistency
                    try {
                        const reverseDsRes = await getWithAuth(`/api/database/getdataSource/${reverseDsId}`) as { success?: boolean; collection?: { dataSource?: any } };
                        if (reverseDsRes?.success && reverseDsRes.collection?.dataSource) {
                            const fullReverseDs = reverseDsRes.collection.dataSource;
                            const normalizedReverseId = typeof fullReverseDs._id === "string" ? fullReverseDs._id : fullReverseDs._id?.toString?.() || reverseDsId;
                            setDataSource(normalizedReverseId, fullReverseDs);
                        }
                    } catch (err) {
                        console.error("Failed to fetch updated reverse data source:", err);
                        // Continue even if fetch fails - we already have the datasource from the response
                    }
                }
            }


            const createdId = propertyId;

            // Add the new property to property visibility for the current view
            if (createdId) {
                const currentViewData = currentView[board._id];
                if (currentViewData && currentViewData.id) {
                    const latestBoard = getBlock(board._id) || board;
                    const viewObj = latestBoard.value?.viewsTypes?.find((vt) => {
                        return vt._id === currentViewData.id || vt.viewType === currentViewData.type;
                    });

                    const viewTypeId = viewObj?._id || null;
                    if (viewTypeId) {
                        const currentVisibility = getPropertyVisibility(board._id) || [];
                        if (!currentVisibility.includes(createdId)) {
                            const newVisibilityId = [...currentVisibility, createdId];

                            // updatePropertyVisibility handles optimistic update and rollback internally
                            await updatePropertyVisibility(
                                viewTypeId,
                                newVisibilityId,
                                board._id,
                                setPropertyVisibility,
                                getPropertyVisibility,
                                getBlock,
                                updateBlock,
                            );
                        }
                    }
                }
            }

            toast.success(`Property "${res.property?.name || propertyName}" added successfully!`);
            return createdId ? {
                id: createdId,
                name: res.property?.name || propertyName,
                reversePropertyId: res.reverseProperty?.id || res.property?.syncedPropertyId,
                options: res.property?.options
            } : null;
        } catch (err) {
            // Rollback on error
            // setDataSource(dataSourceId, prevDataSource);
            console.error("Error adding property:", err);
            toast.error("Error adding property!");
            return null;
        }
    };

    const handleUpdateProperty = async (key: string, value: any = "", customNote?: Block) => {
        const targetNote = customNote || note;

        const dataSource = getCurrentDataSource(board._id);
        if (!dataSource) {
            toast.error("Data source not found for current view!");
            return;
        }

        console.log("Prinfting the handleUpdate Proerpty value  ++ ", key, value, dataSource, targetNote);
        // Optimistic update - update both local state and context immediately
        const updatedProps = { ...targetNote.value.databaseProperties, [key]: value };
        const optimisticNote = { ...targetNote, value: { ...targetNote.value, databaseProperties: updatedProps } };

        onUpdate(optimisticNote);

        console.log("Printing the optimistmic Note ++ ", optimisticNote);
        // Update block in global block context immediately so changes are reflected across all views
        updateBlock(targetNote._id, { ...targetNote, value: { ...targetNote.value, databaseProperties: updatedProps } });

        // Optimistically update two-way relations
        const propertySchema = dataSource.properties?.[key];
        const propertyType = propertySchema?.type;

        console.log("Printing the property schema ++ ", propertySchema);
        if (propertyType === "relation" && propertySchema?.syncedPropertyId && propertySchema?.linkedDatabaseId) {
            console.log("Printing the property schema ++ 2", propertySchema);
            const linkedDatabaseId = typeof propertySchema.linkedDatabaseId === "string"
                ? propertySchema.linkedDatabaseId
                : String(propertySchema.linkedDatabaseId);
            const syncedPropertyId = propertySchema.syncedPropertyId;

            // Get old and new relation IDs
            const oldValue = targetNote.value.databaseProperties?.[key];
            const oldRelationIds = Array.isArray(oldValue) ? oldValue.map(String) : (oldValue ? [String(oldValue)] : []);
            const newRelationIds = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);

            // Determine which relations were added and removed
            const addedRelationIds = newRelationIds.filter(id => !oldRelationIds.includes(id));
            const removedRelationIds = oldRelationIds.filter(id => !newRelationIds.includes(id));

            // Get the linked datasource to check the reverse property's relationLimit
            const linkedDataSource = getDataSource(linkedDatabaseId);
            if (linkedDataSource && linkedDataSource.properties[syncedPropertyId]) {
                const reverseProperty = linkedDataSource.properties[syncedPropertyId];
                const reverseRelationLimit = reverseProperty.relationLimit || "multiple";

                // Update added relations
                for (const relatedBlockId of addedRelationIds) {
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

                                const blocksToUnlink = oldLinkedBlockIds.filter(id => id !== targetNote._id);

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
                                            dataSourceId: dataSource._id,
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
                            newReverseValue = targetNote._id;
                        } else {
                            // For multiple relations, add current note ID to array
                            const currentArray = Array.isArray(currentReverseValue)
                                ? currentReverseValue.map(String)
                                : (currentReverseValue ? [String(currentReverseValue)] : []);

                            if (!currentArray.includes(targetNote._id)) {
                                newReverseValue = [...currentArray, targetNote._id];
                            }
                        }

                        // Update the related block optimistically
                        if (newReverseValue !== undefined) {
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
                        }
                    }
                }

                // Update removed relations
                for (const relatedBlockId of removedRelationIds) {
                    const relatedBlock = getBlock(relatedBlockId);
                    if (relatedBlock && relatedBlock.value) {
                        const relatedProps = (relatedBlock.value as any).databaseProperties || {};
                        const currentReverseValue = relatedProps[syncedPropertyId];

                        let newReverseValue;
                        if (reverseRelationLimit === "single") {
                            // For single relation, clear if it was pointing to this note
                            if (String(currentReverseValue) === targetNote._id) {
                                newReverseValue = null;
                            }
                        } else {
                            // For multiple relations, remove current note ID from array
                            const currentArray = Array.isArray(currentReverseValue)
                                ? currentReverseValue.map(String)
                                : (currentReverseValue ? [String(currentReverseValue)] : []);

                            newReverseValue = currentArray.filter(id => String(id) !== targetNote._id);
                        }

                        // Update the related block optimistically
                        if (newReverseValue !== undefined) {
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
                        }
                    }
                }
            }
        }

        try {
            console.log("Updating property value:", { key, value, dataSource, noteId: targetNote._id });
            const res = await postWithAuth(`/api/database/updatePropertyValue`, {
                dataSourceId: dataSource._id,
                blockId: targetNote._id,
                propertyId: key,
                value: value || "",
                workspaceName: currentWorkspace?.name || "",
            });

            // Get property type from current data source
            const propertyType = dataSource?.properties?.[key]?.type

            if (propertyType === "person") {
                console.log("propertyType is person", propertyType);
                const assignedUsers = value;
                const assignedUsersEmail = assignedUsers.map((user: Members) => user.userEmail);
                const notificationOnAssigned = res.notificationOnAssigned;
                if (notificationOnAssigned) {
                    console.log("------------>notificationOnAssigned", notificationOnAssigned);
                    notifyNoteAssigned(notificationOnAssigned);
                }
            }

            if (!res.success) {
                // Rollback on error
                onUpdate(targetNote);
                updateBlock(targetNote._id, targetNote);
                toast.error("Failed to change property value!");
                return;
            }

            console.log("Property Value Update Response", res);


            // Make API calls to persist reverse relation updates
            if (propertyType === "relation" && propertySchema?.syncedPropertyId && propertySchema?.linkedDatabaseId) {
                console.log("propertyType is relation ++ ", propertyType);
                const linkedDatabaseId = typeof propertySchema.linkedDatabaseId === "string"
                    ? propertySchema.linkedDatabaseId
                    : String(propertySchema.linkedDatabaseId);
                const syncedPropertyId = propertySchema.syncedPropertyId;

                console.log("linkedDatabaseId is relation ++ ", linkedDatabaseId);
                console.log("syncedPropertyId is relation ++ ", syncedPropertyId);

                // Get old and new relation IDs
                const oldValue = targetNote.value.databaseProperties?.[key];
                const oldRelationIds = Array.isArray(oldValue) ? oldValue.map(String) : (oldValue ? [String(oldValue)] : []);
                const newRelationIds = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);

                // Determine which relations were added and removed
                const addedRelationIds = newRelationIds.filter(id => !oldRelationIds.includes(id));
                const removedRelationIds = oldRelationIds.filter(id => !newRelationIds.includes(id));

                console.log("addedRelationIds is relation ++ ", addedRelationIds);
                console.log("removedRelationIds is relation ++ ", removedRelationIds);
                // Get the linked datasource to check the reverse property's relationLimit
                const linkedDataSource = getDataSource(linkedDatabaseId);
                console.log("linkedDataSource is relation ++ ", linkedDataSource);
                if (linkedDataSource && linkedDataSource.properties[syncedPropertyId]) {
                    const reverseProperty = linkedDataSource.properties[syncedPropertyId];
                    const reverseRelationLimit = reverseProperty.relationLimit || "multiple";

                    console.log("reverseProperty is relation ++ ", reverseProperty);
                    console.log("reverseRelationLimit is relation ++ ", reverseRelationLimit);
                    // Update added relations via API
                    for (const relatedBlockId of addedRelationIds) {
                        const relatedBlock = getBlock(relatedBlockId);
                        console.log("relatedBlock is relation ++ ", relatedBlock);
                        if (relatedBlock && relatedBlock.value) {
                            console.log("relatedBlock.value is relation ++ ", relatedBlock.value);
                            const relatedProps = (relatedBlock.value as any).databaseProperties || {};
                            const currentReverseValue = relatedProps[syncedPropertyId];

                            console.log("currentReverseValue is relation ++ ", currentReverseValue);
                            let newReverseValue;
                            if (reverseRelationLimit === "single") {
                                // If there are existing values, we are overwriting them. We must clean up ALL the old related blocks!
                                if (currentReverseValue) {
                                    const oldLinkedBlockIds = Array.isArray(currentReverseValue)
                                        ? currentReverseValue.map(String)
                                        : [String(currentReverseValue)];

                                    const blocksToUnlink = oldLinkedBlockIds.filter(id => id !== targetNote._id);

                                    for (const oldLinkedBlockId of blocksToUnlink) {
                                        const oldLinkedBlock = getBlock(oldLinkedBlockId);

                                        if (oldLinkedBlock && oldLinkedBlock.value) {
                                            const oldLinkedProps = (oldLinkedBlock.value as any).databaseProperties || {};
                                            const oldForwardValue = oldLinkedProps[key];

                                            let newOldForwardValue;
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
                                                dataSourceId: dataSource._id,
                                                blockId: oldLinkedBlockId,
                                                propertyId: key,
                                                value: newOldForwardValue,
                                                workspaceName: currentWorkspace?.name || "",
                                            }).catch(err => {
                                                console.error(`Failed to cleanup orphaned API forward relation on block ${oldLinkedBlockId}`, err);
                                            });
                                        }
                                    }
                                }
                                newReverseValue = targetNote._id;
                                console.log("newReverseValue is relation ++ ", newReverseValue);
                            } else {
                                const currentArray = Array.isArray(currentReverseValue)
                                    ? currentReverseValue.map(String)
                                    : (currentReverseValue ? [String(currentReverseValue)] : []);

                                if (!currentArray.includes(targetNote._id)) {
                                    newReverseValue = [...currentArray, targetNote._id];
                                } else {
                                    newReverseValue = currentArray;
                                }
                                console.log("newReverseValue is relation ++ ", newReverseValue);
                            }

                            // Make API call to persist reverse relation
                            if (newReverseValue !== undefined) {
                                console.log("newReverseValue is relation ++ ", newReverseValue);
                                console.log("currentReverseValue is relation ++ ", currentReverseValue);
                                try {
                                    await postWithAuth(`/api/database/updatePropertyValue`, {
                                        dataSourceId: linkedDatabaseId,
                                        blockId: relatedBlockId,
                                        propertyId: syncedPropertyId,
                                        value: newReverseValue,
                                        workspaceName: currentWorkspace?.name || "",
                                    });
                                    console.log(`Updated reverse relation for block ${relatedBlockId}`);
                                } catch (err) {
                                    console.error(`Failed to update reverse relation for block ${relatedBlockId}:`, err);
                                    // Continue even if one reverse update fails
                                }
                            }
                        }
                    }

                    // Update removed relations via API
                    for (const relatedBlockId of removedRelationIds) {
                        const relatedBlock = getBlock(relatedBlockId);
                        if (relatedBlock && relatedBlock.value) {
                            const relatedProps = (relatedBlock.value as any).databaseProperties || {};
                            const currentReverseValue = relatedProps[syncedPropertyId];

                            let newReverseValue;
                            if (reverseRelationLimit === "single") {
                                if (String(currentReverseValue) === targetNote._id) {
                                    newReverseValue = null;
                                }
                            } else {
                                const currentArray = Array.isArray(currentReverseValue)
                                    ? currentReverseValue.map(String)
                                    : (currentReverseValue ? [String(currentReverseValue)] : []);

                                newReverseValue = currentArray.filter(id => String(id) !== targetNote._id);
                            }

                            console.log("newReverseValue is relation ++ ", newReverseValue)
                            console.log("currentReverseValue is relation ++ ", currentReverseValue)

                            // Make API call to persist reverse relation removal
                            if (newReverseValue !== undefined) {
                                try {
                                    await postWithAuth(`/api/database/updatePropertyValue`, {
                                        dataSourceId: linkedDatabaseId,
                                        blockId: relatedBlockId,
                                        propertyId: syncedPropertyId,
                                        value: newReverseValue,
                                        workspaceName: currentWorkspace?.name || "",
                                    });
                                    console.log(`Removed reverse relation for block ${relatedBlockId}`);
                                } catch (err) {
                                    console.error(`Failed to remove reverse relation for block ${relatedBlockId}:`, err);
                                    // Continue even if one reverse update fails
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            // Rollback on error
            onUpdate(targetNote);
            updateBlock(targetNote._id, targetNote);
            toast.error("Could not update property value!");
            console.error("Failed to update property value:", err);
        }
    };

    const handleRenameProperty = async (
        key: string,
        newName: string,
        newOptions?: BoardPropertyOption[],
        relationConfig?: { relationLimit?: "single" | "multiple"; twoWayRelation?: boolean; linkedDatabaseId?: string },
        rollupConfig?: RollupConfig
    ) => {
        if (!newName.trim()) return;

        // Get property from current data source, fallback to board.properties
        const currentDataSource = getCurrentDataSource(board._id);
        if (!currentDataSource) {
            toast.error("Data source not found!");
            return;
        }

        const property = currentDataSource.properties?.[key]
        if (!property) return;

        // Store previous state for rollback
        const prevDataSource = { ...currentDataSource };

        // Optimistically update datasource property
        const updatedProperty = {
            ...property,
            name: newName,
            ...(newOptions ? { options: newOptions } : {}),
            ...(property.type === "relation" && relationConfig ? {
                ...(relationConfig.relationLimit ? { relationLimit: relationConfig.relationLimit } : {}),
                ...(relationConfig.twoWayRelation !== undefined ? { twoWayRelation: relationConfig.twoWayRelation } : {}),
                ...(relationConfig.linkedDatabaseId ? { linkedDatabaseId: relationConfig.linkedDatabaseId } : {}),
            } : {}),
            ...(property.type === "rollup" && rollupConfig ? { rollup: rollupConfig } : {}),
        };

        const optimisticDataSource = {
            ...currentDataSource,
            properties: {
                ...currentDataSource.properties,
                [key]: updatedProperty,
            },
        };
        setDataSource(currentDataSource._id, optimisticDataSource);

        try {
            const payload: Record<string, any> = {
                dataSourceId: currentDataSource._id,
                blockId: board._id,
                propertyId: key,
                newName,
                type: property.type,
                options: newOptions ? newOptions : property.options,
                showProperty: property.showProperty
            };

            if (property.type === "formula") {
                payload.formula = property.formula ?? "";
                payload.formulaReturnType = property.formulaReturnType ?? "text";
            }

            // For relation properties, add relation config
            if (property.type === "relation" && relationConfig) {
                if (relationConfig.relationLimit) {
                    payload.relationLimit = relationConfig.relationLimit;
                }
                if (relationConfig.twoWayRelation !== undefined) {
                    payload.twoWayRelation = relationConfig.twoWayRelation;
                }
                if (relationConfig.linkedDatabaseId) {
                    payload.linkedDatabaseId = relationConfig.linkedDatabaseId;
                }
            }
            if (property.type === "rollup") {
                const nextRollup = rollupConfig ?? (property as any).rollup;
                if (nextRollup) {
                    const relationDataSourceId =
                        typeof nextRollup.relationDataSourceId === "string"
                            ? nextRollup.relationDataSourceId
                            : nextRollup.relationDataSourceId?.toString?.();
                    payload.rollup = {
                        relationPropertyId: nextRollup.relationPropertyId,
                        relationDataSourceId,
                        targetPropertyId: nextRollup.targetPropertyId,
                        calculation: nextRollup.calculation ?? { category: "original", value: "original" },
                        selectedOptions: nextRollup.selectedOptions,
                    };
                }
            }

            const res = await postWithAuth(`/api/database/updatePropertySchema`, payload);

            if (!res.success) {
                // Rollback on error
                setDataSource(currentDataSource._id, prevDataSource);
                toast.error("Failed to rename property!");
                return;
            }

        } catch (err) {
            // Rollback on error
            setDataSource(currentDataSource._id, prevDataSource);
            console.error("Error renaming property:", err);
            toast.error("Could not rename property!");
        }
    };

    const handleDeleteProperty = async (key: string) => {
        // Get dataSourceId from current view
        // const dataSourceId = getCurrentDataSourceId();
        // if (!dataSourceId) {
        //     toast.error("Data source not found for current view!");
        //     return;
        // }

        // Get current data source
        const currentDataSource = getCurrentDataSource(board._id);
        if (!currentDataSource) {
            toast.error("Data source not found!");
            return;
        }

        // Store previous state for rollback
        const prevDataSource = { ...currentDataSource };
        // const prevNote = { ...note };
        // Get previous notes as blocks from global block context
        // const prevNotesBlocks = getNotesByDataSourceId(dataSourceId);
        // const prevNotes = prevNotesBlocks.map(block => ({ ...block }));

        // Optimistically remove property from datasource
        const { [key]: deletedProperty, ...remainingProperties } = currentDataSource.properties || {};
        const optimisticDataSource = {
            ...currentDataSource,
            properties: remainingProperties,
        };
        setDataSource(currentDataSource._id, optimisticDataSource);

        // Optimistically remove property from note
        // const { [key]: deletedValue, ...remainingProps } = note.value.databaseProperties || {};
        // const optimisticNote: Block = {
        //     ...note,
        //     value: {
        //         ...note.value,
        //         databaseProperties: remainingProps,
        //     },
        // };
        // onUpdate(optimisticNote);
        // Update block in global block context
        // updateBlock(note._id, { ...note, value: { ...note.value, databaseProperties: remainingProps } } as any);

        // Optimistically update all notes in context (update blocks individually)
        // const blocksToUpdate = getNotesByDataSourceId(dataSourceId);
        // blocksToUpdate.forEach((block) => {
        //     if (block._id === note._id) {
        //         // Already updated above
        //         return;
        //     }
        //     const { [key]: _, ...rest } = (block.value as any).databaseProperties || {};
        //     updateBlock(block._id, { ...block, value: { ...block.value, databaseProperties: rest } } as any);
        // });

        try {
            const res = await deleteWithAuth("/api/database/deleteProperty", {
                body: JSON.stringify({
                    dataSourceId: currentDataSource._id,
                    propertyId: key,
                    blockId: board._id
                }),
            });

            const response = res as { success: boolean; dataSource?: DatabaseSource; notes?: Block[] };

            if (!response.success) {
                // Rollback on error
                setDataSource(currentDataSource._id, prevDataSource);
                onUpdate(note);
                updateBlock(note._id, note);
                toast.error("Failed to delete property!");
                return;
            }

            // // Update data source in context from API response (replaces optimistic update)
            // if (response.dataSource) {
            //     const ds = response.dataSource;
            //     const dsId = ds._id ? (typeof ds._id === "string" ? ds._id : ds._id.toString()) : currentDataSource._id;
            //     setDataSource(dsId, ds);
            // }

            // // Update notes (blocks) in global block context from API response (replaces optimistic update)
            // if (response.notes && Array.isArray(response.notes)) {
            //     response.notes.forEach((updatedNote: Note) => {
            //         // Update block in global block context
            //         updateBlock(updatedNote._id, updatedNote as any);
            //     });
            // }

            toast.success("Property deleted successfully!");
        } catch (err) {
            // Rollback on error
            setDataSource(currentDataSource._id, prevDataSource);
            onUpdate(note);
            updateBlock(note._id, note);
            console.error("Failed to delete property:", err);
            toast.error("Failed to delete property!");
        }
    };

    return {
        handleAddProperty,
        handleUpdateProperty,
        handleRenameProperty,
        handleDeleteProperty,
    };
};
