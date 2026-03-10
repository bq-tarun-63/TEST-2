import type { ObjectId } from "mongodb";
export interface IJoinRequest {
  userId: ObjectId;
  userEmail?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
}
export interface IWorkspaceNotification {
  notificationId: ObjectId;
  requesterName: string;
  requesterId: ObjectId;
  requesterEmail: string;
  type: string; // e.g., "join-request", "permit-request"
  message: string;
  read: boolean;
  createdAt: Date;
}
export interface IWorkspaceMember {
  userId: ObjectId;
  userEmail: string;
  userName: string;
  role: "owner" | "admin" | "member";
  joinedAt: Date;
}
export interface IWorkspaceGroup {
  _id?: string | ObjectId;
  id?: string;
  name: string;
  createdAt: Date;
  members: IWorkspaceMember[];
}
export interface IWorkspace {
  _id?: string | ObjectId;
  name: string;
  slug: string;
  orgDomain: string; // directly store the organization's domain
  createdAt: Date;
  ownerId: ObjectId; // ✅ Workspace owner
  members: IWorkspaceMember[]; // ✅ Accepted members
  requests?: IJoinRequest[]; // ✅ Join requests
  notifications?: IWorkspaceNotification[];
  type: "public" | 'private';
  allowedDomains?: string[];
  icon?: string;
  diplayAnalytics?: boolean;
  Profiles?: boolean;
  HoverCards?: boolean;
  groups?: IWorkspaceGroup[];

  // Sidebar Ordering
  publicPageIds: string[];
}

export interface IWorkspaceGroup {
  _id?: string | ObjectId;
  id?: string;
  name: string;
  createdAt: Date;
  members: IWorkspaceMember[];
}


