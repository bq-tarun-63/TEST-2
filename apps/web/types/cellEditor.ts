import type { Block } from "./block";
import type { Members } from "@/types/workspace";
import type { BoardProperty } from "./board";

export interface CellEditorProps {
  value: any;
  property: BoardProperty & {
    id: string;
    placeholder?: string;
  };
  note: Block;
  boardId: string;
  onUpdate: (noteId: string, propertyId: string, value: any) => void;
  onClose: () => void;
  position: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  workspaceMembers?: Members[];
}

export interface EditingCell {
  noteId: string;
  propertyId: string;
  position: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export type PropertyEditorType =
  | "select"
  | "multi_select"
  | "text"
  | "number"
  | "status"
  | "person"
  | "date"
  | "checkbox"
  | "priority"
  | "formula"
  | "relation"
  | "rollup"
  | "github_pr"
  | "url"
  | "phone"
  | "email"
  | "place"
  | "file"
  | "id";

export interface PropertyEditorConfig {
  type: PropertyEditorType;
  component: React.ComponentType<CellEditorProps>;
  canEdit: boolean;
  placeholder?: string;
}
