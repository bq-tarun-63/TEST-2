import { ObjectId } from "mongodb";

export interface IActivityLog {
  _id?: ObjectId;
  noteId: string;
  userId: string;
  userEmail: string;
  userName: string;
  noteName: string;
  workspaceId?: string;
  organizationDomain?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SHARE' | 'REORDER' | 'LOGIN' | 'JOIN' | 'LEAVE' | 'ASSIGN' | 'REMOVE' | 'RESTORE' | 'PERMANENT_DELETE';
  field: 'title' | 'emoji' | 'content' | 'changeVisibility' | 'chat' | 'comment' | 'mention' | 'note' | 'property' | 'property-value' | 'view' | 'view-title' | 'view-type' | 'block' | 'workspace' | 'permission' | 'user' | 'group' | 'workspace-settings' | 'workarea' | 'cover';
  serviceType: 'GITHUB' | 'MONGODB';
  timestamp: Date;
  oldValue?: any; // we will show this emoji and titile changes not anything else
  newValue: any;
}