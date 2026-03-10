import type { ObjectId } from "mongodb";
import { IViewType } from "./ViewTypes";
import type { IDatabaseSource, PropertySchema } from "./DatabaseSource";

// Data source snapshot content (subset of IDatabaseSource for history)
export interface IDataSourceSnapshot {
  title?: string;
  properties: Record<string, PropertySchema>;
  settings: {};
  isSprint?: boolean;
  mainView: string;
}

// Union type for all possible history content types
export type HistoryContent =
  | IContent           // Text blocks, paragraphs, etc.
  | IPage              // Page metadata
  | IVeiwDatabase      // Collection view settings
  | IDataSourceSnapshot // Data source schema/settings
  | any;               // Fallback for unknown types

// Block history entry - stores a snapshot of block content at a specific version
export interface IBlockHistoryEntry {
  content: HistoryContent; // Typed snapshot content
  version: string; // "v1", "v2", "v3"...
  createdAt: Date; // When snapshot was created
  dead?: Date; // When this version was superseded
}
type viewId = string;

export type ContentTypes =
  | "page"            // a page / note
  | "text"            // generic rich text block (paragraph, heading, quote, etc.)
  | "todo"            // checkbox item
  | "toggle"          // toggle block (with children)
  | "column_layout"   // container for columns
  | "column"          // a single column inside a layout
  | "board"           // board view block
  | "datasource"      // datasource block
  | "embed"           // embed (URL, video, etc.)
  | "table"           // table block
  | "callout"
  | "bookmark"
  | "react_component" // your generic React component block wrapper
  | "custom"
  | "toc"
  | string;         // fallback / future types

export type BlockStatus = "alive" | "archived" | "deleted";
export type SpecialType = "page" | "collection_view";

export type ParentTable = "workspace" | "block" | "collection" | "workarea" | "page" | "collection_view" | "content";

export interface IPage {
  title: string;
  userId: string | ObjectId;
  userEmail: string;
  icon: string
  coverURL: string | null;
  pageType: "public" | "restricted" | "private" | "workarea" | "template";
  isTemplate?: boolean; //for now we will change it
  databaseProperties?: Record<string, any>; //HOLDS ONLY database pROPETIES VALUE
  publicly_published?: boolean;
  public_link_id?: string;
}
export interface IContent {
  type: ContentTypes;
  attrs?: {
    blockId?: string;
  };
  content?: any;
}

export interface IVeiwDatabase {
  title: string;//viewDatabase title
  icon: string;//viewDatabase icon
  viewsTypes: IViewType[];//viewDatabase viewsTypes
  createdBy?: {
    userId: string | ObjectId;
    userName: string;
    userEmail: string;
  };
  organizationDomain?: string;
}

export type BlockType = SpecialType | "content"
export interface IBlock {
  _id?: ObjectId;
  blockType: BlockType;
  workspaceId: string;
  workareaId?: string; // NEW: ID of parent WorkArea (if block is inside one)
  parentId: string;
  parentType: ParentTable;
  value: IContent | [] | IPage | IVeiwDatabase;
  blockIds: string[];
  status: BlockStatus;
  comments?: string[]; //array of comment ids
  // ACL Path: Array of permission document IDs inherited from ancestors
  aclIds?: string[];

  createdBy: {
    userId: string;
    userName: string;
    userEmail: string;
  };

  createdAt?: Date;
  updatedAt?: Date;
  lastSnapshotTime?: Date;
}

// Block IDs history entry - stores structural snapshots (parent's child list)
export interface IBlockIdsHistoryEntry {
  historyId: string;     // Unique ID for this structural snapshot
  blockIds: string[];    // Array of child block IDs at this point in time
  createdAt: Date;       // When this structure existed
  dead?: Date;           // When this structure was superseded
}

// Complete history document stored in history_entries collection
export interface IHistoryDocument {
  _id?: ObjectId;
  blockId: string;                           // ID of block/datasource being tracked
  type: "block" | "databaseSource";          // Type of entity
  workspaceId?: string;                      // Workspace this belongs to
  createdAt: Date;                           // When history tracking started
  updatedAt?: Date;                          // Last update to this history doc

  // Content snapshots (block value, datasource schema, etc.)
  history?: IBlockHistoryEntry[];

  // Structural snapshots (parent's child list, datasource page list)
  blockIdsHistory?: IBlockIdsHistoryEntry[];
}

export interface IHistoryEntryDocument {
  _id?: ObjectId;
  blockId: string;
  type: "block" | "databaseSource";
  workspaceId: string;
  history?: IBlockHistoryEntry[];
  blockIdsHistory?: IBlockIdsHistoryEntry[];
  createdAt: Date;
  updatedAt?: Date;
}