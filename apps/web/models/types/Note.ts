import type { ObjectId } from "mongodb";

// export interface INote {
//   title: string;
//   userId: string | ObjectId; // User who owns/created the note (establishes ownership relationship)
//   userEmail: string;
//   icon: string
//   coverUrl?: string | null;
//   sharedWith: Array<{ email: string ; access: "read" | "write" }>;
//   isPublicNote: boolean;
//   isRestrictedPage?:boolean;
//   isTemplate?: boolean;
//   imageStatusId?: ObjectId; // Reference to the image status document for images used in this note
//   workspaceId?: string;
// }
  // noteType: 'original' | 'review' | 'approved' | 'Viewdatabase_Note'; // New field to track the type of the note

 // database specific
//  databaseProperties?: Record<string, any>;
//   formulaErrors?: Record<string, string>;
//   databaseViewId?: ObjectId;
//   createdAt: Date;
//   updatedAt: Date;
//   clusterName?: string;
  // organizationDomain?: string;  // new field
  // isPublic: 0 | 1 | 2;
// blockIdsHistory?: Array<{
  //   historyId: string; // Unique ID for this history entry
  //   blockIds: string[]; // Block order at this time
  //   createdAt: Date; // When snapshot was created
  //   dead?: Date; // When superseded
  // }>;
  
  // rootParentId?: string | ObjectId;
  // tree?: Array<{ _id: string; title: string; icon: string; userId?: string; userEmail?: string; children?: any[]}>;

 // Organization & Workspace info
 // order?: number;
  // children?: Array<{ _id: string; title: string; icon: string; coverUrl?: string | null; userId?: string; userEmail?: string ,isRestrictedPage?:boolean }>;
  // parentId: string | null;
  // contentPath: string; // Path to the content file in GitHub
  // commitSha: string;
  // isPublish: boolean;
 
  // approvalStatus: "pending" | "approved" | "rejected" | "Publish" | "accepted";
  // publishedNoteId?: ObjectId | "";
  // databaseNoteId?: ObjectId;
  // cluster-specific
  // workAreaId?: string; // WorkArea (formerly teamspace) that this note belongs to
  // Ordered list of block IDs that make up this note's content
  // blockIds?: string[];
  // History of blockIds changes (structure snapshots)

  
  // Last time snapshots were created (used to detect changed blocks)
  // lastSnapshotTime?: Date;
  // blockId?: string;
// }



// export class Note implements INote {
//   _id?: string | ObjectId;
//   id?: string;
//   title: string;
//   userId: string | ObjectId;
//   userEmail: string;
//   parentId: string | null;
//   contentPath: string;
//   commitSha: string;
//   createdAt: Date;
//   updatedAt: Date;
//   order?: number;
//   icon: string;
//   coverUrl?: string | null;
//   children?: Array<{ _id: string; title: string; icon: string; coverUrl?: string | null; userId?: string; userEmail?: string ,isRestrictedPage?:boolean }>;
//   isPublish: boolean = false;
//   isPublic: 0 | 1 | 2;
//   sharedWith: Array<{ email: string ; access: "read" | "write" }>;
//   approvalStatus: "pending" | "approved" | "rejected" | "Publish" | "accepted";
//   publishedNoteId?: ObjectId | "";
//   isPublicNote: boolean;
//   isRestrictedPage?:boolean;
//   isTemplate?: boolean;

//   rootParentId?: string | ObjectId;
//   tree?: Array<{ _id: string; title: string; icon: string; userId?: string; userEmail?: string; children?: any[] }>;
//   imageStatusId?: ObjectId; // Reference to the image status document for images used in this note
//    noteType: 'original' | 'review' | 'approved' | 'Viewdatabase_Note'; // New field to track the type of the note
//   // Organization & Workspace info
//   organizationDomain: string;  // new field
//   workspaceId: string;     // new field

//   // database specific
//   databaseProperties?: Record<string, any>;
//   formulaErrors?: Record<string, string>;
//   databaseViewId?: ObjectId;
//   databaseNoteId?: ObjectId;
//   // Ordered list of block IDs that make up this note's content
//   blockIds?: string[];
//   // History of blockIds changes (structure snapshots)
//   blockIdsHistory?: Array<{
//     historyId: string;
//     blockIds: string[];
//     createdAt: Date;
//     dead?: Date;
//   }>;
//   // Last time snapshots were created
//   lastSnapshotTime?: Date;
//   constructor(note: INote) {
//     this._id = note._id;
//     this.id = note.id;
//     this.title = note.title;
//     this.userId = note.userId;
//     this.userEmail = note.userEmail;
//     this.parentId = note.parentId;
//     this.contentPath = note.contentPath;
//     this.commitSha = note.commitSha;
//     this.createdAt = note.createdAt || new Date();
//     this.updatedAt = note.updatedAt || new Date();
//     this.order = note.order ?? 0;
//     this.children = note.children || [];
//     this.icon = note.icon || "";
//     this.coverUrl = note.coverUrl || null;
//     this.isPublic = note.isPublic ?? 0;
//     this.sharedWith = note.sharedWith ?? [];
//     this.publishedNoteId = note.publishedNoteId ?? "";
//     this.isPublish = note.isPublish || false;
//     this.isPublicNote = note.isPublicNote || false;
//     this.isTemplate = note.isTemplate ?? false;
//     this.rootParentId = note.rootParentId;
//     this.tree = note.tree;
//     this.imageStatusId = note.imageStatusId;
//     this.noteType = note.noteType;
//     this.isRestrictedPage=note.isRestrictedPage;
//     this.databaseProperties = note.databaseProperties;
//     this.formulaErrors = note.formulaErrors;
//     this.databaseViewId = note.databaseViewId;
//     this.blockIds = note.blockIds ?? [];
//     this.blockIdsHistory = note.blockIdsHistory ?? [];
//     this.lastSnapshotTime = note.lastSnapshotTime;
//   }

//   // Convert MongoDB _id to string id for response
//   static formatNote(note: INote): INote {
//     const formattedNote = { ...note };

//     if (note._id) {
//       formattedNote.id = String(note._id);
//     }

//     return formattedNote;
//   }
// }
