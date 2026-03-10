import { ViewCollection } from "./board";

export type BlockContentJSON = any; // this will be node.toJSON()

export type CreateBlockPayload = {
  blockId: string;
  previousBlockId: string | null;   // null => block is at top
  content: BlockContentJSON;        // full node.toJSON()
};

export type UpdateBlockPayload = {
  blockId: string;
  data: BlockContentJSON;           // full node.toJSON()
};

export type DeleteBlockPayload = {
  blockId: string;
};

export type MoveBlocksPayload = {
  blockIdArray: string[]; // ordered list of all blockIds in the note
};

export type BlockChangesPayload = {
  noteId: string;
  workspaceId: string;
  parentId: string | null;

  creates: CreateBlockPayload[];
  updates: UpdateBlockPayload[];
  deletes: DeleteBlockPayload[];
  move: MoveBlocksPayload | null;
};

/**
 * Block schema types - matching backend API
 */

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
  | string;           // fallback / future types

export type BlockStatus = "alive" | "archived" | "deleted";

export type ParentTable = "workspace" | "block" | "collection"  | "page" | "workarea" | "content";

export type BlockType = "page" | "content" | "collection_view";

export type PageType = "public" | "restricted" | "private" | "workarea" | "Viewdatabase_Note";

/**
 * Parameters for creating blocks via API
 * Used by frontend services to send block creation requests
 */
export interface CreateBlocksParams {
  parentId: string | null;
  workspaceId: string;
  workareaId: string | null;
  blocks: CreateBlockPayload[];
  parentTable: ParentTable;
}



// Page block value
export interface IPage {
  title: string;
  userId: string; // User who owns/created the note
  userEmail: string;
  icon: string;
  coverUrl: string | null;
  pageType: PageType;
  isTemplate?: boolean;
  databaseProperties?: Record<string, any>
}

// Content block value
export interface IContent {
  type: ContentTypes;
  attrs?: {
    blockId?: string;
  };
  content?: any;
}

// Block history entry - stores a snapshot of block content at a specific version
export interface IBlockHistoryEntry {
  content: any; // ProseMirror node JSON snapshot
  version: string; // "v1", "v2", "v3"...
  createdAt: Date; // When snapshot was created
  dead?: Date; // When this version was superseded
}

// Main Block interface
export interface Block {
  _id: string;
  blockType: BlockType;
  workspaceId: string;
  workareaId: string | null;
  parentId: string;
  parentType: ParentTable;
  value: IContent | IPage | ViewCollection | any; 
  blockIds?: string[];
  status: BlockStatus;
  comments?: string[]; //array of comment ids
}

// API response structure for workspace data
export interface WorkspaceResponse {
  workspaceId: string;
  blocks: Block[];
  private_pages: string[];
  public_pages: string[];
  workArea: string[];
  shared_pages_manual_sort: string[];
  sidebar_order: string[];
}
