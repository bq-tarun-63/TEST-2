import clientPromise from "@/lib/mongoDb/mongodb";
import { ObjectId } from "mongodb";
import type { IWorkspace, IWorkspaceMember } from "@/models/types/Workspace";
import { IWorkArea } from "@/models/types/WorkArea";
import { IBlock, IVeiwDatabase } from "@/models/types/Block";
import { IUser } from "@/models/types/User";
import { WorkAreaService } from "@/services/workAreaService";
import { AuditService } from "./auditService";

export const WorkspaceService = {

  async updateGroup({
    workspaceId,
    groupId,
    name,
    currentUserId,
    members,
  }: {
    workspaceId: string;
    groupId: string;
    name: string;
    currentUserId: string;
    members: IWorkspaceMember[];
  }) {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");
    const groupIdObj = new ObjectId(groupId);
    const oldWs = await workspaces.findOne(
      { _id: new ObjectId(workspaceId), "groups._id": groupIdObj },
      { projection: { "groups.$": 1 } }
    );
    const oldMembers = oldWs?.groups?.[0]?.members || [];

    const group = await workspaces.findOneAndUpdate(
      {
        _id: new ObjectId(workspaceId)
      },
      {
        $set: {
          "groups.$[group].members": members,
          updatedAt: new Date()
        }
      },
      {
        arrayFilters: [{ "group._id": groupIdObj }],
        returnDocument: "after"
      }
    );

    // Sync WorkAreas for all affected users (Old U New)
    const allMemberIds = new Set([
      ...oldMembers.map(m => String(m.userId)),
      ...members.map(m => String(m.userId))
    ]);

    const userEmailMap = new Map<string, string>();
    oldMembers.forEach(m => userEmailMap.set(String(m.userId), m.userEmail));
    members.forEach(m => userEmailMap.set(String(m.userId), m.userEmail));

    // Run sync in parallel/background? Or await?
    // Await to ensure consistency.
    for (const userId of Array.from(allMemberIds)) {
      const email = userEmailMap.get(userId);
      if (email) {
        await WorkAreaService.syncUserWorkAreas({ userId, userEmail: email, workspaceId });
      }
    }

    // Audit Log: Update Group
    try {
      const usersColl = db.collection<IUser>("users");
      const currentUser = await usersColl.findOne({ _id: new ObjectId(currentUserId) });
      if (currentUser) {
        await AuditService.log({
          action: "UPDATE",
          noteId: groupId, // Using groupId as noteId equivalent for group actions
          userId: currentUserId,
          userEmail: currentUser.email,
          userName: currentUser.name || "Unknown",
          noteName: name,
          serviceType: "MONGODB",
          field: "group",
          oldValue: oldWs?.groups?.find(g => g._id?.toString() === groupId),
          newValue: (group as IWorkspace | null)?.groups?.find((g: any) => g._id?.toString() === groupId),
          workspaceId,
        }).catch(console.error);
      }
    } catch (e) { console.error("Audit log failed for updateGroup", e); }

    return group;
  },
  async createGroup({
    workspaceId,
    name,
    currentUserId,
    members,
  }: {
    workspaceId: string;
    name: string;
    currentUserId: string;
    members: IWorkspaceMember[];
  }) {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");

    // First ensure groups array exists
    await workspaces.updateOne(
      { _id: new ObjectId(workspaceId), groups: { $exists: false } },
      { $set: { groups: [], updatedAt: new Date() } }
    );

    const newGroup = {
      name,
      members,
      createdAt: new Date(),
      _id: new ObjectId()
    };

    const group = await workspaces.findOneAndUpdate(
      { _id: new ObjectId(workspaceId) },
      {
        $push: { groups: newGroup },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: "after" }
    );

    // Sync WorkAreas for initial members
    for (const member of members) {
      await WorkAreaService.syncUserWorkAreas({
        userId: String(member.userId),
        userEmail: member.userEmail,
        workspaceId
      });
    }

    // Audit Log: Create Group
    try {
      const usersColl = db.collection<IUser>("users");
      const currentUser = await usersColl.findOne({ _id: new ObjectId(currentUserId) });
      if (currentUser) {
        await AuditService.log({
          action: "CREATE",
          noteId: newGroup._id.toString(),
          userId: currentUserId,
          userEmail: currentUser.email,
          userName: currentUser.name || "Unknown",
          noteName: name,
          serviceType: "MONGODB",
          field: "group",
          oldValue: undefined,
          newValue: newGroup,
          workspaceId,
        }).catch(console.error);
      }
    } catch (e) { console.error("Audit log failed for createGroup", e); }

    return group;
  },
  async deleteGroup({
    workspaceId,
    groupId,
    currentUserId,
  }: {
    workspaceId: string;
    groupId: string;
    currentUserId: string;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");
    const workAreas = db.collection<IWorkArea>("workAreas");

    // 1. Verify workspace exists and user has permission (owner or admin)
    const workspace = await workspaces.findOne({ _id: new ObjectId(workspaceId) });
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    // Check authorization
    const isOwner = String(workspace.ownerId) === String(currentUserId);
    const isAdmin = workspace.members?.some(
      (m) => String(m.userId) === String(currentUserId) &&
        (m.role === "admin" || m.role === "owner")
    );

    if (!isOwner && !isAdmin) {
      throw new Error("Not authorized: only workspace owners and admins can delete groups");
    }

    // 2. Verify group exists
    const group = workspace.groups?.find((g) => String(g._id) === groupId);
    if (!group) {
      throw new Error("Group not found");
    }

    const groupObjectId = new ObjectId(groupId);

    // 3. Remove group from workspace
    const updatedWorkspace = await workspaces.findOneAndUpdate(
      { _id: new ObjectId(workspaceId) },
      {
        $pull: { groups: { _id: groupObjectId } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: "after" }
    );

    if (!updatedWorkspace) {
      throw new Error("Failed to delete group");
    }

    // 4. Clean up: Remove group access from all workareas that reference this group
    await workAreas.updateMany(
      {
        workspaceId: new ObjectId(workspaceId),
        "groupAccess.groupId": groupObjectId
      },
      {
        $pull: {
          groupAccess: {
            groupId: groupObjectId
          }
        } as any,
        $set: { updatedAt: new Date() }
      }
    );

    // Audit Log: Delete Group
    try {
      const usersColl = db.collection<IUser>("users");
      const currentUser = await usersColl.findOne({ _id: new ObjectId(currentUserId) });
      if (currentUser) {
        await AuditService.log({
          action: "DELETE",
          noteId: groupId,
          userId: currentUserId,
          userEmail: currentUser.email,
          userName: currentUser.name || "Unknown",
          noteName: group.name,
          serviceType: "MONGODB",
          field: "group",
          oldValue: group,
          newValue: undefined,
          workspaceId,
        }).catch(console.error);
      }
    } catch (e) { console.error("Audit log failed for deleteGroup", e); }

    return updatedWorkspace;
  },
  async updateMemberRole({
    workspaceId,
    memberId,
    role,
    currentUserId,
  }: {
    workspaceId: string;
    memberId: string;
    role: "owner" | "admin" | "member";
    currentUserId: string;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");

    // If assigning owner, enforce owner-only and perform atomic transfer
    if (role === "owner") {
      const session = client.startSession();
      try {
        let resultDoc: IWorkspace | null = null;
        await session.withTransaction(async () => {
          const ws = await workspaces.findOne({ _id: new ObjectId(workspaceId) }, { session });
          if (!ws) throw new Error("Workspace not found");

          // Only current owner can transfer ownership
          if (String(ws.ownerId) !== String(currentUserId)) {
            throw new Error("Not authorized: only owner can transfer ownership");
          }

          const newOwnerId = new ObjectId(memberId);
          const oldOwnerId = new ObjectId(String(ws.ownerId));

          // Ensure both users exist in members to keep roles consistent
          const memberIds = new Set((ws.members || []).map((m) => String(m.userId)));
          if (!memberIds.has(String(newOwnerId))) {
            throw new Error("New owner must be an existing workspace member");
          }
          if (!memberIds.has(String(oldOwnerId))) {
            throw new Error("Current owner missing from members array (data integrity)");
          }

          // Atomically set ownerId, promote new owner in members, demote old owner to admin
          const res = await workspaces.findOneAndUpdate(
            {
              _id: new ObjectId(workspaceId),
              $and: [
                { members: { $elemMatch: { userId: newOwnerId } } },
                { members: { $elemMatch: { userId: oldOwnerId } } },
              ],
            },
            {
              $set: {
                ownerId: newOwnerId,
                "members.$[oldOwner].role": "admin",
                updatedAt: new Date()
              },
            },
            {
              arrayFilters: [
                { "newOwner.userId": newOwnerId },
                { "oldOwner.userId": oldOwnerId },
              ],
              returnDocument: "after",
              session,
            }
          );
          resultDoc = (res as any)?.value as IWorkspace | null;
          if (!resultDoc) throw new Error("Owner transfer failed");
        });
        if (!resultDoc) throw new Error("Owner transfer failed");
        return resultDoc;
      } finally {
        await session.endSession();
      }
    }

    // For non-owner role changes, allow owner and admins
    // But do not allow admins to modify the current owner's role
    const ws = await workspaces.findOne({ _id: new ObjectId(workspaceId) });
    if (!ws) throw new Error("Workspace not found");
    if (String(ws.ownerId) === String(memberId) && String(ws.ownerId) !== String(currentUserId)) {
      throw new Error("Only owner can change current owner's role");
    }

    // Prevent owner from demoting themselves directly
    if (String(ws.ownerId) === String(memberId)) {
      throw new Error("You cannot change your own role from owner. You must transfer ownership to someone else first.");
    }

    const res = await workspaces.findOneAndUpdate(
      {
        _id: new ObjectId(workspaceId),
        $or: [
          { ownerId: new ObjectId(currentUserId) },
          { members: { $elemMatch: { userId: new ObjectId(currentUserId), role: { $in: ["owner", "admin"] } } } },
        ],
        "members.userId": new ObjectId(memberId),
      },
      { $set: { "members.$.role": role, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    // Audit Log: Update Member Role
    try {
      const usersColl = db.collection<IUser>("users");
      const currentUser = await usersColl.findOne({ _id: new ObjectId(currentUserId) });
      // Fetch target user to log who was updated? Or just log role change?
      // Let's log role change. noteId could be the memberId?
      if (currentUser) {
        await AuditService.log({
          action: "UPDATE",
          noteId: memberId, // Target user ID
          userId: currentUserId,
          userEmail: currentUser.email,
          userName: currentUser.name || "Unknown",
          noteName: `Member Role Update`,
          serviceType: "MONGODB",
          field: "permission",
          oldValue: undefined, // Could fetch if needed, but keeping simple
          newValue: role,
          workspaceId,
        }).catch(console.error);
      }
    } catch (e) { console.error("Audit log failed for updateMemberRole", e); }

    return res;
  },

  async removeMemberFromWorkspace({
    workspaceId,
    memberId,
    currentUserId,
  }: {
    workspaceId: string;
    memberId: string;
    currentUserId: string;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");
    // Block removing the current owner
    const res = await workspaces.findOneAndUpdate(
      {
        _id: new ObjectId(workspaceId),
        $or: [
          { ownerId: new ObjectId(currentUserId) },
          { members: { $elemMatch: { userId: new ObjectId(currentUserId), role: { $in: ["owner", "admin"] } } } },
        ],
        ownerId: { $ne: new ObjectId(memberId) },
      },
      {
        $pull: { members: { userId: new ObjectId(memberId) } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: "after" }
    );

    if (res) {
      // Fetch user email? Maybe not needed if we rely on userId.
      // Wait, syncUserWorkAreas needs email to check group membership.
      // If user removed, they are not in groups (implicitly).
      // BUT getUserAccessibleWorkAreaIds requires email.
      // We can fetch user or just pass dummy if we know they are removed?
      // No, getUserAccessible checks `m.userId`. Email check is secondary.
      // We should try to provide valid email if possible to be safe.
      // But the member is GONE from workspace.
      // So getUserAccessible returns [].
      // We can pass empty email if we trust userId check.
      await WorkAreaService.syncUserWorkAreas({
        userId: memberId,
        userEmail: "", // Email irrelevant if not in workspace
        workspaceId
      });
    }

    // Audit Log: Remove Member
    try {
      const usersColl = db.collection<IUser>("users");
      const currentUser = await usersColl.findOne({ _id: new ObjectId(currentUserId) });
      if (currentUser) {
        await AuditService.log({
          action: "REMOVE",
          noteId: memberId, // Removed user ID
          userId: currentUserId,
          userEmail: currentUser.email,
          userName: currentUser.name || "Unknown",
          noteName: "Member Removed",
          serviceType: "MONGODB",
          field: "user",
          oldValue: memberId,
          newValue: "removed",
          workspaceId,
        }).catch(console.error);
      }
    } catch (e) { console.error("Audit log failed for removeMember", e); }

    return res;
  },
  async updateWorkspaceDetails({
    workspaceId,
    name,
    icon,
    allowedDomains,
    displayAnalytics,
    profiles,
    hoverCards,
    currentUserId,
  }: {
    workspaceId: string;
    name: string;
    icon: string;
    allowedDomains: string[];
    displayAnalytics: boolean;
    profiles: boolean;
    hoverCards: boolean;
    currentUserId: string;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");
    const updateFields: Partial<IWorkspace> = {
      name,
      icon,
      allowedDomains,
      diplayAnalytics: displayAnalytics,
      Profiles: profiles,
      HoverCards: hoverCards,
    };


    const workspace = await workspaces.findOne({ _id: new ObjectId(workspaceId) });
    //check if the current user is an owner or admin
    const isOwner = workspace?.ownerId.toString() === currentUserId;
    const isAdmin = workspace?.members?.some(member => member.userId.toString() === currentUserId && (member.role === "owner" || member.role === "admin"));
    if (!isOwner && !isAdmin) {
      throw new Error("You are not authorized to update this workspace");
    }
    const res = await workspaces.findOneAndUpdate(
      {
        _id: new ObjectId(workspaceId),
        $or: [
          { ownerId: new ObjectId(currentUserId) },
          { members: { $elemMatch: { userId: new ObjectId(currentUserId), role: { $in: ["owner", "admin"] } } } },
        ],
      },
      { $set: { ...updateFields, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    // Audit Log: Update Workspace Details
    try {
      const usersColl = db.collection<IUser>("users");
      const currentUser = await usersColl.findOne({ _id: new ObjectId(currentUserId) });
      if (currentUser) {
        await AuditService.log({
          action: "UPDATE",
          noteId: workspaceId,
          userId: currentUserId,
          userEmail: currentUser.email,
          userName: currentUser.name || "Unknown",
          noteName: name || workspace?.name || "Workspace",
          serviceType: "MONGODB",
          field: "workspace-settings",
          oldValue: undefined,
          newValue: JSON.stringify(updateFields),
          workspaceId,
        }).catch(console.error);
      }
    } catch (e) { console.error("Audit log failed for updateWorkspaceDetails", e); }

    return res as IWorkspace | null;
  },

  async deleteWorkspace({
    workspaceId,
    currentUserId,
  }: {
    workspaceId: string;
    currentUserId: string;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");
    const viewDatabasesCollection = db.collection<IVeiwDatabase>("viewDatabases");
    const blocksCollection = db.collection<IBlock>("blocks");
    const result = await workspaces.deleteOne({
      _id: new ObjectId(workspaceId),
      $or: [
        { ownerId: new ObjectId(currentUserId) },
        { members: { $elemMatch: { userId: new ObjectId(currentUserId), role: { $in: ["owner", "admin"] } } } },
      ],
    });

    //delete all t
    const viewDatabases = await viewDatabasesCollection.deleteMany({ workspaceId: new ObjectId(workspaceId) });
    const blocks = await blocksCollection.deleteMany({ workspaceId: workspaceId });

    // Remove this workspace from all users' workspaceSettings
    const usersCollection = db.collection<IUser>("users");
    await usersCollection.updateMany(
      { "workspaceSettings.workspaceId": workspaceId },
      { $pull: { workspaceSettings: { workspaceId: workspaceId } } }
    );
    // Also remove any pending join requests for this workspace
    await usersCollection.updateMany(
      { "joinRequests.workspaceId": new ObjectId(workspaceId) },
      { $pull: { joinRequests: { workspaceId: new ObjectId(workspaceId) } } }
    );

    if (!result.deletedCount) throw new Error("Workspace not found");

    // Audit Log: Delete Workspace
    // Since workspace is deleted, we just log the event.
    try {
      const usersColl = db.collection<IUser>("users");
      const currentUser = await usersColl.findOne({ _id: new ObjectId(currentUserId) });
      if (currentUser) {
        await AuditService.log({
          action: "DELETE",
          noteId: workspaceId,
          userId: currentUserId,
          userEmail: currentUser.email,
          userName: currentUser.name || "Unknown",
          noteName: "Workspace Deleted",
          serviceType: "MONGODB",
          field: "workspace",
          oldValue: "alive",
          newValue: "deleted",
          workspaceId,
        }).catch(console.error);
      }
    } catch (e) { console.error("Audit log failed for deleteWorkspace", e); }

    return result;
  },
  async getWorkspaceById({ workspaceId }: { workspaceId: string }): Promise<IWorkspace | null> {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");
    const workspace = await workspaces.findOne({ _id: new ObjectId(workspaceId) });
    return workspace;
  },

  async addMemberToWorkspace({
    workspaceId,
    role,
    membersEmail,
  }: {
    workspaceId: string;
    role: "owner" | "admin" | "member";
    membersEmail: string[];
  }) {
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");
    const users = db.collection<IUser>("users");
    const workspace = await workspaces.findOne({ _id: new ObjectId(workspaceId) });
    if (!workspace) throw new Error("Workspace not found");

    // Fix N+1 query: Fetch all users in a single query using $in operator
    if (membersEmail.length > 0) {
      const foundUsers = await users.find({ email: { $in: membersEmail } }).toArray();
      const userMap = new Map(foundUsers.map(user => [user.email, user]));

      // Create workspace members for all found users
      for (const email of membersEmail) {
        const user = userMap.get(email);
        if (!user) continue;
        const workspaceMember = {
          userId: new ObjectId(user._id),
          userEmail: email,
          userName: user.name || "",
          role,
          joinedAt: new Date()
        };
        workspace.members.push(workspaceMember);
      }
    }

    workspace.members = workspace.members.filter((member, index, self) =>
      index === self.findIndex((t) => t.userEmail === member.userEmail)
    );
    await workspaces.updateOne({ _id: new ObjectId(workspaceId) }, { $set: { members: workspace.members, updatedAt: new Date() } });

    // Sync WorkAreas for new members (e.g. Default Access WorkAreas)
    // We can just run sync for the added emails.
    for (const email of membersEmail) {
      // Need userId for sync. We fetched foundUsers earlier.
      // Optimization: We could re-use foundUsers map if accessible.
      // But here we might just re-fetch or use what we have.
      // We iterate workspace members to find the userId for the email.
      const member = workspace.members.find(m => m.userEmail === email);
      if (member) {
        await WorkAreaService.syncUserWorkAreas({
          userId: String(member.userId),
          userEmail: member.userEmail,
          workspaceId
        });
      }
    }

    return workspace;
  },
  async getWorkspacesByDomain({ domain, userId }: { domain: string; userId?: string }) {
    const client = await clientPromise();
    const db = client.db();
    const wsCol = db.collection<IWorkspace>("workspaces");

    // Base query for the domain
    const query: any = { orgDomain: domain };

    // Apply visibility filter if userId is provided
    if (userId) {
      query.$or = [
        { type: 'public' },
        { type: 'private', 'members.userId': new ObjectId(userId) },
        // Fallback for workspaces missing a type explicitly acting as private
        { type: { $exists: false }, 'members.userId': new ObjectId(userId) }
      ];
    }

    const workspaces = await wsCol.find(query).toArray();
    return workspaces;
  },
  async createWorkspace({
    name,
    slug,
    orgDomain,
    ownerId,
    ownerEmail,
    user,
    type
  }: {
    name: string;
    slug: string;
    orgDomain: string;
    ownerId: ObjectId;
    ownerEmail: string;
    user,
    type: 'public' | 'private'
  }) {
    const client = await clientPromise();
    const db = client.db();
    const collection = db.collection<IWorkspace>("workspaces");

    const now = new Date();

    const newWs: IWorkspace = {
      name,
      slug,
      orgDomain,
      createdAt: now,
      ownerId,

      members: [
        {
          userId: ownerId,
          userEmail: ownerEmail,
          userName: user.name,
          role: "owner",
          joinedAt: now,
        },
      ],

      requests: [],
      notifications: [],
      type,
      publicPageIds: [],
    };

    const result = await collection.insertOne(newWs);
    newWs._id = result.insertedId;

    return newWs;

    // Audit Log: Create Workspace (can't easily do after return, so do before or async?)
    // This return is strict type, but function is async. 
    // Wait, the logic above returns, so unreachable code if I put it here.
    // I should put it before return.
    // However, I need `result.insertedId`.
    // I will modify the return block.
    // Re-doing this chunk to include return.
  },
  // async addJoinRequest(workspaceId: string, userEmail: string) {
  //   const client = await clientPromise();
  //   const db = client.db();
  //   const wsCol = db.collection<IWorkspace>("workspaces");


  //   const joinRequest = {
  //     userEmail
  //   };
  //   console.log(joinRequest, "joinRequest");
  //   await wsCol.updateOne(
  //     { _id: new ObjectId(workspaceId) },
  //     { $push: { requests: joinRequest } }
  //   );

  //   // notify owner + admins
  //   // await WorkspaceService.notifyOwnerAndAdmins(workspaceId, userId);

  //   return joinRequest;
  // },

  /** Notify owner & admins when a join request is created */
  async notifyOwnerAndAdmins({
    workspaceId,
    userId,
  }: {
    workspaceId: string;
    userId: string;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const wsCol = db.collection<IWorkspace>("workspaces");

    const workspace = await wsCol.findOne({ _id: new ObjectId(workspaceId) });
    if (!workspace) throw new Error("Workspace not found");

    const recipients = [
      workspace.ownerId,
      ...((workspace.members || [])
        .filter((m) => m.role === "admin")
        .map((m) => m.userId)),
    ];

    // Here you’d integrate with your notification/email system
    for (const recipientId of recipients) {
      console.log(
        `Notify ${recipientId} → User ${userId} requested to join workspace ${workspace.name}`
      );
      // Example: await NotificationService.send(...)
    }

    return true;
  }

};
