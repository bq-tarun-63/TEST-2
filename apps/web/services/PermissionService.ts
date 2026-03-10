import { ObjectId, type Collection } from "mongodb";
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import type { IBlock } from "@/models/types/Block";
import type { IPermission, PermissionRole } from "@/models/types/Permission";
import { hasPermission, ROLE_HIERARCHY } from "@/models/types/Permission";
import type { IWorkspace, IWorkspaceMember } from "@/models/types/Workspace";
import type { IWorkArea, IWorkAreaMember } from "@/models/types/WorkArea";

/**
 * PermissionService handles all permission-related operations
 * using the ACL Path approach with layered permission checks
 */
export const PermissionService = {
    /**
     * Check if a user has access to a block with a specific role requirement
     * Implements layered permission checking: Block -> WorkArea -> Workspace
     * Optimized to minimize database calls
     */
    async checkAccess(

        { userId, blockId, requiredRole, workspaceId, workareaId }: {
            userId: string,
            blockId: string,
            requiredRole: PermissionRole,
            workspaceId?: string,
            workareaId?: string | null | undefined,
        }
    ): Promise<boolean> {
        console.log("1------ checkAccess START", { userId, blockId, requiredRole, workspaceId, workareaId });

        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");
        const permissionsColl = metadataDb.collection<IPermission>("permissions");
        const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
        const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");

        // Step 1: Fetch the target block
        console.log("2------ Fetching block with id:", blockId);
        const block = await blocksColl.findOne({
            _id: new ObjectId(blockId),
            status: "alive"
        });

        if (block) {
            console.log("3------ Block found", { blockType: block.blockType, workspaceId: block.workspaceId, workareaId: block.workareaId });

            // Step 2: Check block-level permissions via aclIds
            console.log("4------ Checking block-level ACL permissions", { aclIdsCount: block.aclIds?.length || 0 });
            if (block.aclIds && block.aclIds.length > 0) {
                const aclObjectIds = block.aclIds.map(id => new ObjectId(id));
                const permissions = await permissionsColl
                    .find({ _id: { $in: aclObjectIds } })
                    .toArray();

                console.log("4------ Found ACL permissions", { permissionCount: permissions.length });
                for (const permission of permissions) {
                    const userSubject = permission.subjects.find(s => s.id === userId);
                    if (userSubject) {
                        console.log("4------ User found in ACL", { userRole: userSubject.role, requiredRole });
                        const hasRequiredRole = hasPermission(userSubject.role, requiredRole);
                        console.log("4------ ACL permission check result:", hasRequiredRole);

                        if (hasRequiredRole) {
                            console.log("4------ ✅ User has required role via ACL - returning true");
                            return true;
                        }
                    }
                }
                console.log("4------ User not found in any ACL or insufficient permissions");
            }

            // Check if this is a private page - if so, only ACL permissions matter
            console.log("5------ Checking if block is a private page");
            if (block.blockType === 'page' && typeof block.value === 'object' && !Array.isArray(block.value)) {
                const pageValue = block.value as any;
                if ((pageValue.pageType === 'private' && block.workareaId === null)) {
                    console.log("5------ ❌ Block is a private page and ACL didn't grant access - returning false");
                    // For private pages, if ACL check didn't grant access, deny access
                    // Don't check WorkArea or Workspace permissions
                    return false;
                }
            }
            console.log("5------ Block is not a private page, continuing to workspace/workarea checks");
        } else {
            console.log("3------ Block NOT found - will check workspace/workarea permissions");
        }
        if (block) {
            workspaceId = block.workspaceId;
            workareaId = block.workareaId;
            console.log("6------ Using block's workspaceId and workareaId", { workspaceId, workareaId });
        }

        // Step 3: Fetch workspace and workarea in parallel (if block is in a workarea)
        console.log("7------ Fetching workspace and workarea", { workspaceId, workareaId });
        const fetchPromises: Promise<any>[] = [
            workspacesColl.findOne({ _id: new ObjectId(workspaceId) })
        ];

        // Use workareaId field to determine if we need to fetch WorkArea
        if (workareaId) {
            console.log("7------ Block is in a workarea, fetching workarea data");
            fetchPromises.push(
                workAreasColl.findOne({ _id: new ObjectId(workareaId) })
            );
        }

        const [workspace, workArea] = await Promise.all(fetchPromises);

        if (!workspace) {
            console.log("8------ ❌ Workspace NOT found - returning false");
            return false;
        }
        ''

        // Step 4: Check WorkArea permissions if block is in a WorkArea
        if (workArea) {
            console.log("9------ Checking WorkArea permissions", { workareaId: workArea._id });

            // Check if user is a direct member of the workarea
            const member = workArea.members.find(
                m => String(m.userId) === userId
            );

            if (member) {
                console.log("9------ User found in workarea members", { memberRole: member.role, requiredRole });
                const hasRequiredRole = hasPermission(this.mapWorkAreaRole(member.role), requiredRole);
                console.log("9------ WorkArea member permission check result:", hasRequiredRole);

                if (hasRequiredRole) {
                    console.log("9------ ✅ User has required role as workarea member - returning true");
                    return true;
                }
            } else {
                console.log("9------ User NOT found in workarea members");
            }

            // Check if user belongs to any group that has access to this workarea
            console.log("10------ Checking workarea group access", {
                groupAccessCount: workArea.groupAccess?.length || 0,
                workspaceGroupsCount: workspace.groups?.length || 0
            });
            if (workArea.groupAccess && workArea.groupAccess.length > 0 && workspace.groups) {
                for (const groupAccess of workArea.groupAccess) {
                    // Find the group in workspace
                    const group = workspace.groups.find(
                        g => String(g._id) === String(groupAccess.groupId)
                    );

                    if (group) {
                        console.log("10------ Checking group", { groupId: groupAccess.groupId, permission: groupAccess.permission });
                        // Check if user is a member of this group
                        const isGroupMember = group.members.some(
                            m => String(m.userId) === userId
                        );

                        if (isGroupMember) {
                            console.log("10------ User is member of group");
                            // Map group permission to role and check
                            const groupRole = this.mapGroupPermissionToRole(groupAccess.permission);
                            const hasRequiredRole = hasPermission(groupRole, requiredRole);
                            console.log("10------ Group permission check", { groupRole, requiredRole, hasRequiredRole });

                            if (hasRequiredRole) {
                                console.log("10------ ✅ User has required role via workarea group - returning true");
                                return true;
                            }
                        }
                    }
                }
                console.log("10------ No matching workarea group access found");
            }

            // If block belongs to a workarea, check if it's open
            if (workArea.accessLevel === "open") {
                console.log("10------ WorkArea is OPEN - falling back to workspace permission check");
                // Fall through to Step 5 to check workspace permissions
            } else {
                // Private workarea and explicit checks failed
                console.log("10------ ❌ WorkArea is PRIVATE and user has no access - returning false");
                return false;
            }
        } else {
            console.log("9------ Block is NOT in a workarea, skipping workarea checks");
        }
        // Step 5: Check Workspace-level permissions
        console.log("11------ Checking Workspace-level permissions");

        // Check if user is workspace owner
        console.log("11------ Checking if user is workspace owner");
        if (String(workspace.ownerId) === userId) {
            console.log("11------ ✅ User IS workspace owner - returning true");
            return true;
        }
        console.log("11------ User is NOT workspace owner");

        // Check if user is a workspace member
        console.log("12------ Checking workspace members", { memberCount: workspace.members?.length || 0 });
        const workspaceMember = workspace.members.find(
            m => String(m.userId) === userId
        );

        if (workspaceMember) {
            console.log("12------ User found in workspace members", { memberRole: workspaceMember.role, requiredRole });
            const hasRequiredRole = hasPermission(this.mapWorkspaceRole(workspaceMember.role), requiredRole);
            console.log("12------ Workspace member permission check result:", hasRequiredRole);

            if (hasRequiredRole) {
                console.log("12------ ✅ User has required role as workspace member - returning true");
                return true;
            }
        } else {
            console.log("12------ User NOT found in workspace members");
        }

        // Check if user belongs to any workspace group (for workspace-level access)
        console.log("13------ Checking workspace groups", { groupCount: workspace.groups?.length || 0 });
        if (workspace.groups && workspace.groups.length > 0) {
            for (const group of workspace.groups) {
                const isGroupMember = group.members.some(
                    m => String(m.userId) === userId
                );

                if (isGroupMember) {
                    console.log("13------ User is member of workspace group", { groupId: group._id });
                    // Groups at workspace level typically grant at least viewer access
                    // You may want to add group-level roles in the future
                    if (requiredRole === "viewer") {
                        console.log("13------ ✅ User is workspace group member and viewer access required - returning true");
                        return true;
                    }
                }
            }
            console.log("13------ No matching workspace group access found");
        }

        // Step 6: Check workspace type for public access
        console.log("14------ Checking if workspace is public", { workspaceType: workspace.type, requiredRole });
        if (workspace.type === "public" && requiredRole === "viewer") {
            console.log("14------ ✅ Workspace is public and viewer access required - returning true");
            return true;
        }

        console.log("15------ ❌ No access granted through any permission layer - returning false");
        return false;
    },

    /**
     * Get the effective role for a user on a specific block
     * Traverses all permission layers (Block ACLs -> WorkArea -> Workspace)
     * Returns the highest role found or null if no access
     * Implements "Closest Permission Wins" for ACLs
     */
    async getUserRole({
        userId,
        blockId,
        workspaceId,
        workareaId
    }: {
        userId: string,
        blockId: string,
        workspaceId?: string,
        workareaId?: string | null | undefined,
    }): Promise<PermissionRole | null> {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");
        const permissionsColl = metadataDb.collection<IPermission>("permissions");
        const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
        const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");

        let highestRole: PermissionRole | null = null;
        let highestRoleLevel = 0;

        const updatedRole = (newRole: PermissionRole) => {
            const level = ROLE_HIERARCHY[newRole];
            if (level > highestRoleLevel) {
                highestRole = newRole;
                highestRoleLevel = level;
            }
        };

        // Step 1: Fetch the target block
        const block = await blocksColl.findOne({
            _id: new ObjectId(blockId),
            status: "alive"
        });

        if (block) {
            // Step 2: Check block-level permissions via aclIds
            if (block.aclIds && block.aclIds.length > 0) {
                const aclObjectIds = block.aclIds.map(id => new ObjectId(id));
                const permissions = await permissionsColl
                    .find({ _id: { $in: aclObjectIds } })
                    .toArray();

                const permissionMap = new Map(permissions.map(p => [String(p._id!), p]));

                // Iterate REVERSE (Leaf -> Root) to implement "Closest Permission Wins"
                for (let i = block.aclIds.length - 1; i >= 0; i--) {
                    const aclId = block.aclIds[i];
                    if (!aclId) continue;
                    const permission = permissionMap.get(aclId);

                    if (permission) {
                        const userSubject = permission.subjects.find(s => s.id === userId);
                        if (userSubject) {
                            // Found explicit permission - this is the effective role from ACLs
                            // STOP here. Do not check parents or other ACLs.
                            return userSubject.role;
                        }
                    }
                }
            }

            // Check if this is a private page - if so, only ACL permissions matter
            if (block.blockType === 'page' && typeof block.value === 'object' && !Array.isArray(block.value)) {
                const pageValue = block.value as any;
                if ((pageValue.pageType === 'private' && block.workareaId === null)) {
                    // For private pages, only ACL matters. If we found a role, we returned it above.
                    // If not, return null (no access)
                    return highestRole;
                }
            }
            workspaceId = block.workspaceId;
            workareaId = block.workareaId;
        }

        // Step 3: Fetch workspace and workarea
        const fetchPromises: Promise<any>[] = [
            workspacesColl.findOne({ _id: new ObjectId(workspaceId) })
        ];

        if (workareaId) {
            fetchPromises.push(
                workAreasColl.findOne({ _id: new ObjectId(workareaId) })
            );
        }

        const [workspace, workArea] = await Promise.all(fetchPromises);

        if (!workspace) return highestRole;

        // Step 4: Check WorkArea permissions
        if (workArea) {
            // Direct member
            const member = workArea.members.find(
                m => String(m.userId) === userId
            );
            if (member) {
                updatedRole(this.mapWorkAreaRole(member.role));
            }

            // Group access
            if (workArea.groupAccess && workArea.groupAccess.length > 0 && workspace.groups) {
                for (const groupAccess of workArea.groupAccess) {
                    const group = workspace.groups.find(
                        g => String(g._id) === String(groupAccess.groupId)
                    );
                    if (group && group.members.some(m => String(m.userId) === userId)) {
                        updatedRole(this.mapGroupPermissionToRole(groupAccess.permission));
                    }
                }
            }

            // If workarea is OPEN, we check workspace permissions below (fallthrough)
            // If PRIVATE, we ONLY fallthrough if we haven't found a role yet?
            if (workArea.accessLevel !== "open") {
                return highestRole;
            }
        }

        // Step 5: Check Workspace-level permissions
        // Owner
        if (String(workspace.ownerId) === userId) {
            return "owner"; // Max role, return immediately
        }

        // Member
        const workspaceMember = workspace.members?.find(
            m => String(m.userId) === userId
        );
        if (workspaceMember) {
            updatedRole(this.mapWorkspaceRole(workspaceMember.role));
        }

        // Workspace Groups
        if (workspace.groups && workspace.groups.length > 0) {
            for (const group of workspace.groups) {
                if (group.members.some(m => String(m.userId) === userId)) {
                    updatedRole("viewer");
                }
            }
        }

        // Public Workspace
        if (workspace.type === "public") {
            updatedRole("viewer");
        }

        return highestRole;
    },
    mapGroupPermissionToRole(permission: "full" | "edit" | "comment" | "view"): PermissionRole {
        switch (permission) {
            case "full": return "owner";
            case "edit": return "editor";
            case "comment": return "editor"; // Comment implies edit access
            case "view": return "viewer";
            default: return "viewer";
        }
    },

    /**
     * Initialize ACL IDs for a new block
     * Inherits from parent block or starts fresh for root blocks
     */
    async initializeBlockACL(
        parentId?: string,
        parentType?: string
    ): Promise<string[]> {
        if (!parentId || parentType === "workspace" || parentType === "workarea") {
            // Root block in workspace/workarea - no inherited ACLs
            return [];
        }

        // Inherit aclIds from parent block
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");

        const parentBlock = await blocksColl.findOne({
            _id: new ObjectId(parentId),
            status: "alive"
        });

        return parentBlock?.aclIds || [];
    },

    /**
     * Add a new permission boundary to a block and its subtree
     */
    async addPermissionBoundary(
        blockId: string,
        subjects: Array<{ id: string; role: PermissionRole }>,
        name?: string
    ): Promise<string> {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const permissionsColl = metadataDb.collection<IPermission>("permissions");
        const blocksColl = metadataDb.collection<IBlock>("blocks");

        // Create new permission document
        const newPermission: IPermission = {
            subjects,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await permissionsColl.insertOne(newPermission);
        const permissionId = String(result.insertedId);

        // Add permission ID to block and all descendants
        await this.addAclIdToSubtree(blockId, permissionId);

        return permissionId;
    },

    /**d
     * Recursively add an ACL ID to a block and all its descendants
     */
    async addAclIdToSubtree(blockId: string, aclId: string): Promise<void> {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");

        const block = await blocksColl.findOne({
            _id: new ObjectId(blockId),
            status: "alive"
        });

        if (!block) return;

        // Add ACL ID to current block
        const currentAclIds = block.aclIds || [];
        if (!currentAclIds.includes(aclId)) {
            await blocksColl.updateOne(
                { _id: block._id },
                {
                    $set: {
                        aclIds: [...currentAclIds, aclId],
                        updatedAt: new Date()
                    }
                }
            );
        }

        // Recursively process children
        if (block.blockIds && block.blockIds.length > 0) {
            for (const childId of block.blockIds) {
                await this.addAclIdToSubtree(childId, aclId);
            }
        }
    },

    /**
     * Recompute ACL path for a block and its descendants after a move
     */
    async recomputeACLPath(blockId: string, newParentId?: string): Promise<void> {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");

        // Get new parent's ACL IDs
        let newAclIds: string[] = [];
        if (newParentId) {
            const parentBlock = await blocksColl.findOne({
                _id: new ObjectId(newParentId),
                status: "alive"
            });
            newAclIds = parentBlock?.aclIds || [];
        }

        // Update block and all descendants
        await this.updateSubtreeAcls(blockId, newAclIds);
    },

    /**
     * Recursively update ACL IDs for a subtree
     */
    async updateSubtreeAcls(blockId: string, newAclIds: string[]): Promise<void> {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");

        const block = await blocksColl.findOne({
            _id: new ObjectId(blockId),
            status: "alive"
        });

        if (!block) return;

        // Update current block's ACL IDs
        await blocksColl.updateOne(
            { _id: block._id },
            {
                $set: {
                    aclIds: newAclIds,
                    updatedAt: new Date()
                }
            }
        );

        // Recursively update children
        if (block.blockIds && block.blockIds.length > 0) {
            for (const childId of block.blockIds) {
                await this.updateSubtreeAcls(childId, newAclIds);
            }
        }
    },

    /**
     * Helper: Map WorkArea role to Permission role
     */
    mapWorkAreaRole(role: "owner" | "admin" | "member"): PermissionRole {
        switch (role) {
            case "owner": return "owner";
            case "admin": return "admin";
            case "member": return "editor";
            default: return "viewer";
        }
    },

    /**
     * Helper: Map Workspace role to Permission role
     */
    mapWorkspaceRole(role: "owner" | "admin" | "member"): PermissionRole {
        switch (role) {
            case "owner": return "owner";
            case "admin": return "admin";
            case "member": return "editor";
            default: return "viewer";
        }
    },

    /**
     * Check if user has access to a workspace with specific role requirement
     * Used for workspace-level operations like creating workareas, managing settings
     * 
     * Edge cases handled:
     * - Workspace doesn't exist
     * - User is not a member
     * - Workspace owner always has access
     * - Group membership grants access
     * - Public workspaces grant viewer access to anyone
     * - Deleted/suspended workspaces (if status field exists)
     */
    async checkWorkspaceAccess({
        userId,
        workspaceId,
        requiredRole
    }: {
        userId: string;
        workspaceId: string;
        requiredRole: PermissionRole;
    }): Promise<boolean> {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");

        // Fetch workspace
        const workspace = await workspacesColl.findOne({
            _id: new ObjectId(workspaceId)
        });

        if (!workspace) {
            return false;
        }

        // Edge case: Check workspace status if it exists (future-proofing)
        if ((workspace as any).status && (workspace as any).status !== "active") {
            return false;
        }

        // Check if user is workspace owner (always has full access)
        if (String(workspace.ownerId) === userId) {
            return true;
        }

        // Check if user is a workspace member with required role
        if (workspace.members && workspace.members.length > 0) {
            const member = workspace.members.find(
                m => String(m.userId) === userId
            );

            if (member && hasPermission(this.mapWorkspaceRole(member.role), requiredRole)) {
                return true;
            }
        }

        // Check workspace groups (if user belongs to any group)
        if (workspace.groups && workspace.groups.length > 0) {
            for (const group of workspace.groups) {
                if (group.members && group.members.length > 0) {
                    const isGroupMember = group.members.some(
                        m => String(m.userId) === userId
                    );

                    if (isGroupMember) {
                        // Groups typically grant at least viewer access
                        // For more granular control, you could add group-level roles
                        if (requiredRole === "viewer") {
                            return true;
                        }
                    }
                }
            }
        }

        // Check if workspace is public and user only needs viewer access
        if (workspace.type === "public" && requiredRole === "viewer") {
            return true;
        }

        return false;
    },

    /**
     * Check if user has access to a workarea with specific role requirement
     * Used for workarea-level operations like updating, managing members
     * 
     * Edge cases handled:
     * - WorkArea doesn't exist
     * - User is not a member
     * - WorkArea owner always has access
     * - Workspace owner/admin can manage all workareas
     * - Group-based access via groupAccess
     * - Different accessLevel behaviors (open/closed/private/default)
     * - Workspace doesn't exist (orphaned workarea)
     */
    async checkWorkAreaAccess({
        userId,
        workAreaId,
        requiredRole
    }: {
        userId: string;
        workAreaId: string;
        requiredRole: PermissionRole;
    }): Promise<boolean> {
        console.log("1------ checkWorkAreaAccess START", { userId, workAreaId, requiredRole });

        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");
        const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");

        // Fetch workarea
        console.log("2------ Fetching workarea from database");
        const workArea = await workAreasColl.findOne({
            _id: new ObjectId(workAreaId)
        });

        if (!workArea) {
            console.log("3------ WorkArea NOT FOUND - returning false");
            return false;
        }
        console.log("3------ WorkArea found", { ownerId: workArea.ownerId, accessLevel: workArea.accessLevel });

        // Check if user is workarea owner (always has full access)
        console.log("4------ Checking if user is workarea owner");
        if (String(workArea.ownerId) === userId) {
            console.log("4------ ✅ User IS workarea owner - returning true");
            return true;
        }
        console.log("4------ User is NOT workarea owner");

        // Check if user is a workarea member with required role
        console.log("5------ Checking workarea members", { memberCount: workArea.members?.length || 0 });
        if (workArea.members && workArea.members.length > 0) {
            const member = workArea.members.find(
                m => String(m.userId) === userId
            );

            if (member) {
                console.log("5------ User found in workarea members", { memberRole: member.role, requiredRole });
                const hasRequiredRole = hasPermission(this.mapWorkAreaRole(member.role), requiredRole);
                console.log("5------ Permission check result:", hasRequiredRole);

                if (hasRequiredRole) {
                    console.log("5------ ✅ User has required role as workarea member - returning true");
                    return true;
                }
            } else {
                console.log("5------ User NOT found in workarea members");
            }
        }

        // Fetch parent workspace for additional checks
        console.log("6------ Fetching parent workspace", { workspaceId: workArea.workspaceId });
        const workspace = await workspacesColl.findOne({
            _id: new ObjectId(workArea.workspaceId)
        });

        // Edge case: Orphaned workarea (workspace doesn't exist)
        if (!workspace) {
            console.log("7------ ❌ Orphaned workarea (workspace not found) - returning false");
            // Only workarea owner and members can access orphaned workareas
            return false;
        }
        console.log("7------ Workspace found", { workspaceOwnerId: workspace.ownerId });

        // Check if user is workspace owner or admin (can manage all workareas)
        console.log("8------ Checking if user is workspace owner");
        if (String(workspace.ownerId) === userId) {
            console.log("8------ ✅ User IS workspace owner - returning true");
            return true;
        }
        console.log("8------ User is NOT workspace owner");

        console.log("9------ Checking workspace members for admin role", { memberCount: workspace.members?.length || 0 });
        if (workspace.members && workspace.members.length > 0) {
            const workspaceMember = workspace.members.find(
                m => String(m.userId) === userId
            );

            if (workspaceMember) {
                console.log("9------ User found in workspace members", { role: workspaceMember.role });
                if (workspaceMember.role === "owner" || workspaceMember.role === "admin") {
                    console.log("9------ ✅ User is workspace admin/owner - returning true");
                    return true;
                }
            } else {
                console.log("9------ User NOT found in workspace members");
            }
        }

        // Check workarea group access
        console.log("10------ Checking group access", {
            groupAccessCount: workArea.groupAccess?.length || 0,
            workspaceGroupsCount: workspace.groups?.length || 0
        });
        if (workArea.groupAccess && workArea.groupAccess.length > 0 && workspace.groups) {
            for (const groupAccess of workArea.groupAccess) {
                const group = workspace.groups.find(
                    g => String(g._id) === String(groupAccess.groupId)
                );

                if (group && group.members && group.members.length > 0) {
                    console.log("10------ Checking group", { groupId: groupAccess.groupId, permission: groupAccess.permission });
                    const isGroupMember = group.members.some(
                        m => String(m.userId) === userId
                    );

                    if (isGroupMember) {
                        console.log("10------ User is member of group");
                        const groupRole = this.mapGroupPermissionToRole(groupAccess.permission);
                        const hasRequiredRole = hasPermission(groupRole, requiredRole);
                        console.log("10------ Group permission check", { groupRole, requiredRole, hasRequiredRole });

                        if (hasRequiredRole) {
                            console.log("10------ ✅ User has required role via group - returning true");
                            return true;
                        }
                    }
                }
            }
            console.log("10------ No matching group access found");
        }

        // Handle accessLevel-based access
        console.log("11------ Checking accessLevel-based access", { requiredRole, accessLevel: workArea.accessLevel });

        if (workArea.accessLevel === "open") {
            console.log("11------ WorkArea is open - checking workspace membership");
            // Check if user is a workspace member
            // If they are a member, we map their workspace role to check if it meets requirement
            if (workspace.members && workspace.members.length > 0) {
                const workspaceMember = workspace.members.find(
                    m => String(m.userId) === userId
                );

                if (workspaceMember) {
                    console.log("11------ User is workspace member", { role: workspaceMember.role });
                    // Map workspace role to permission role
                    const mappedRole = this.mapWorkspaceRole(workspaceMember.role);
                    const hasRequiredRole = hasPermission(mappedRole, requiredRole);

                    if (hasRequiredRole) {
                        console.log("11------ ✅ User has required role via workspace membership in OPEN workarea");
                        return true;
                    }
                }
            }
        } else {
            console.log("11------ WorkArea is private - workspace membership not sufficient");
        }

        console.log("12------ ❌ No access granted - returning false");
        return false;
    },

    /**
     * Check if user can manage workspace (create workareas, manage settings, etc)
     * Shorthand for checking if user is workspace owner or admin
     * 
     * Edge cases handled:
     * - All cases from checkWorkspaceAccess
     * - Specifically checks for admin role or higher
     */
    async canManageWorkspace({
        userId,
        workspaceId
    }: {
        userId: string;
        workspaceId: string;
    }): Promise<boolean> {
        return await this.checkWorkspaceAccess({
            userId,
            workspaceId,
            requiredRole: "admin"
        });
    },

    /**
     * Check access for database operations
     * Validates that blockId contains the dataSourceId, then checks permissions
     * 
     * @param userId - User ID to check
     * @param blockId - Collection view block ID
     * @param dataSourceId - Database source ID to validate
     * @param requiredRole - Required permission role
     * @returns Promise<boolean> - true if user has access and dataSource matches
     */
    async checkAccessForDataSource({
        userId,
        blockId,
        dataSourceId,
        requiredRole
    }: {
        userId: string;
        blockId: string;
        dataSourceId: string;
        requiredRole: PermissionRole;
    }): Promise<boolean> {
        console.log("checkAccessForDataSource START", { userId, blockId, dataSourceId, requiredRole });

        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");

        // 1. Fetch the block
        const block = await blocksColl.findOne({
            _id: new ObjectId(blockId),
            blockType: 'collection_view',
            status: 'alive'
        });

        if (!block) {
            console.log("checkAccessForDataSource: Block not found");
            return false;
        }

        // 2. Verify the block contains this dataSourceId (type-safe check)
        if (block.value && typeof block.value === 'object' && !Array.isArray(block.value) && 'viewsTypes' in block.value) {
            const viewDatabase = block.value as any; // Cast to access viewsTypes
            const hasDataSource = viewDatabase.viewsTypes?.some((vt: any) =>
                vt.databaseSourceId?.toString() === dataSourceId
            );

            if (!hasDataSource) {
                console.log("checkAccessForDataSource: dataSourceId not found in block");
                return false;
            }
        } else {
            console.log("checkAccessForDataSource: Block is not a valid collection_view");
            return false;
        }

        console.log("checkAccessForDataSource: Block validated, checking permissions");

        // 2. Check permissions on the validated block
        return await this.checkAccess({
            userId,
            blockId,
            requiredRole,
            workspaceId: block.workspaceId,
            workareaId: block.workareaId
        });
    },


};
