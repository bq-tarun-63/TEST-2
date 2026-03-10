import { ObjectId } from "mongodb";

/**
 * Allowed property types
 */
export type PropertyType =
  | "title"
  | "text"
  | "status"
  | "relation"
  | "rollup"
  | "comments"
  | "person"
  | "date"
  | "checkbox"
  | "number"
  | "formula"
  | "priority"
  | "select"
  | "multi_select"
  | "github_pr"
  | "url"
  | "phone"
  | "email"
  | "file"
  | "id"
  | "slack_comments";

export interface PropertyOption {
  id: string;       // internal option id (UUID/string)
  name: string;     // display name ("In Progress", "Done", etc.)
  color?: string;   // optional color
}
export interface IFormMetaData {
  isFiedRequired: boolean;
  isDescriptionRequired: boolean;
  Description?: string;
  isLongAnswerRequired: boolean;
  checkboxLabel?: string;
}
export interface GitHubPrConfig {
  /**
   * Optional defaults that can be reused when a row does not specify repo info explicitly
   */
  defaultOwner?: string;
  defaultRepo?: string;
  installationId?: number;
  /**
   * Status property + options that should be updated when PR state changes
   */
  statusPropertyId?: string;
  pendingStatusOptionId?: string;
  completedStatusOptionId?: string;
  autoSync?: boolean;
}

export interface PropertySchema {
  name: string;              // "Status", "Assign", etc.
  type: PropertyType;
  options?: PropertyOption[];  // For select/multi_select/status/priorityS
  default?: boolean;          // Is this a default property?
  showProperty?: boolean;     // Should this property be shown?
  isVisibleInSlack?: boolean; // Should this property be visible in Slack?
  linkedDatabaseId?: ObjectId;        // Which database source to link to (IDatabaseSource._id)
  syncedPropertyId?: string;           // Property ID in the linked database (for two-way sync)
  syncedPropertyName?: string;         // Property name in the linked database (for two-way sync)
  relationLimit?: "single" | "multiple";  // Allow single relation or multiple relations
  displayProperties?: string[];
  SettingforForm?: Record<string, unknown>;
  twoWayRelation?: boolean;
  // Property IDs to show from related records
  rollup?: {
    relationPropertyId?: string;
    relationDataSourceId?: ObjectId;
    targetPropertyId?: string;
    calculation?: {
      category: "original" | "count" | "percent";
      value: "original" | "all" | "per_group" | "empty" | "non_empty";
      metadata?: {
        displayFormat?: "number" | "bar" | "ring";
        [key: string]: any;
      };
    };
    selectedOptions?: string[];
  };
  // Number property specific settings
  numberFormat?: string;     // "number", "percent", "currency"
  decimalPlaces?: number;   // 0-6 decimal places
  showAs?: "number" | "bar" | "ring";  // How to display the number
  progressColor?: string;    // Color for bar/ring display
  progressDivideBy?: number; // Divide value by this for percentage (default: 100)
  showNumberText?: boolean;  // Show number text on bar/ring
  // Formula property specific settings
  formula?: string;          // Formula expression
  formulaReturnType?: "text" | "number" | "boolean" | "date";  // Return type of formula
  formMetaData?: IFormMetaData;
  githubPrConfig?: GitHubPrConfig;
  specialProperty?: boolean;  // Marks this field as a special property; false by default
}

/**
 * Database note properties (stored in note properties)
 */
export interface DatabaseNoteProperties {
  [propertyId: string]: any;  // key = propertyId, value depends on property type
}

/**
 * View definition (board/table/list/etc.)
 */
export type ViewType = "board" | "table" | "list" | "calendar" | "timeline" | "list_sprint" | "forms" | "chart" | "gallery";



export interface IDatabaseSource {
  _id: ObjectId;
  icon?: string;
  title?: string; // Name/title of the data source
  createdBy: {
    userId: string | ObjectId;
    userName: string;
    userEmail: string;
  };
  createdAt: Date;
  updatedAt?: Date;
  properties: Record<string, PropertySchema>;
  settings: {};
  workspaceId?: string;
  isSprint?: boolean;
  isSprintOn?: boolean;  // Whether sprint mode is active for this datasource; false by default
  pairedDataSourceId?: string; // The ID of the datasource paired via Sprint relation (Tasks ↔ Sprints)
  lastSprintId?: number; // Auto-incrementing counter for sprint page IDs
  blockIds: string[];
  mainView: string;
  // Inherited from source (for filtering)
}


