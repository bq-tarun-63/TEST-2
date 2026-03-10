import type { ObjectId } from "mongodb";

/**
 * WorkArea Member Interface
 * Represents a member of a workarea with their role
 */
export interface IWorkAreaMember {
  userId: ObjectId;
  userEmail: string;
  userName: string;
  role: "owner" | "admin" | "member"; // WorkArea-specific roles (simpler than workspace)
  joinedAt: Date;
}

/**
 * Group Access Interface
 * Represents which workspace groups have access to this workarea and their permission level
 */
export interface IWorkAreaGroupAccess {
  groupId: ObjectId; // Reference to workspace group _id
  groupName?: string; // Denormalized for easier queries (can be updated)
  permission: "full" | "edit" | "comment" | "view";
  grantedAt: Date;
  grantedBy: ObjectId; // User who granted this access
}

/**
 * WorkArea Join Request Interface
 * For closed workareas, users can request to join
 */
export interface IWorkAreaJoinRequest {
  userId: ObjectId;
  userEmail: string;
  userName: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  reviewedBy?: ObjectId; // User who reviewed the request
  reviewedAt?: Date;
}

/**
 * Main WorkArea Interface
 * Represents a workarea within a workspace (like Books by ReventLabs 's teamspaces)
 */
export interface IWorkArea {
  _id?: string | ObjectId;
  id?: string;

  // Basic Info
  name: string;
  description?: string;
  icon?: string;

  // Parent Workspace (required)
  workspaceId: ObjectId; // Parent workspace
  orgDomain: string; // For quick filtering (denormalized from workspace)

  // Access Control
  accessLevel: "open" | "private";
  // open: Accessible by all workspace members (inherits workspace permissions)
  // private: Only visible and accessible to invited members

  // Ownership
  ownerId: ObjectId; // WorkArea owner (usually workspace owner/admin)

  // Membership
  members: IWorkAreaMember[]; // WorkArea-specific members
  requests?: IWorkAreaJoinRequest[]; // Join requests (for closed workareas)

  // Group Access (references to workspace groups)
  groupAccess?: IWorkAreaGroupAccess[]; // Groups that have access to this workarea

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy?: ObjectId; // User who created the workarea
  blockId?: string;
  pageIds?: string[]; // Order of pages in this workarea
}


