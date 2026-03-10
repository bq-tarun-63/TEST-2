export interface BoardPropertyOption {
  id: string;
  name: string;
  color?: string;
}

export type RollupCalculationCategory = "original" | "count" | "percent" | "sum" | "average" | "min" | "max" | "median";
export type RollupCalculationValue =
  | "original"
  | "all"
  | "per_group"
  | "empty"
  | "non_empty";

export interface RollupCalculationMetadata {
  displayFormat?: "number" | "bar" | "ring";
  [key: string]: any; // Allow for future metadata fields
}

export interface RollupCalculation {
  category: RollupCalculationCategory;
  value: RollupCalculationValue;
  metadata?: RollupCalculationMetadata;
}

export interface RollupConfig {
  relationPropertyId?: string;
  relationDataSourceId?: string;
  targetPropertyId?: string;
  calculation?: RollupCalculation;
  selectedOptions?: string[];
}
export interface GitHubPrConfig {
  defaultOwner?: string;
  defaultRepo?: string;
  installationId?: number;
  statusPropertyId?: string;
  pendingStatusOptionId?: string;
  completedStatusOptionId?: string;
  autoSync?: boolean;
}

export interface BoardProperty {
  name: string;
  type:
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
  | "id"
  | "slack_comments";
  options?: BoardPropertyOption[];
  default: boolean;
  showProperty: boolean;
  isVisibleInSlack?: boolean;
  linkedDatabaseId?: string;
  syncedPropertyId?: string;
  syncedPropertyName?: string;
  relationLimit?: "single" | "multiple";
  twoWayRelation?: boolean;
  displayProperties?: string[];
  settingforForm?: Record<string, unknown>
  rollup?: RollupConfig;
  numberFormat?: string;
  decimalPlaces?: number;
  showAs?: "number" | "bar" | "ring";
  progressColor?: string;
  progressDivideBy?: number;
  showNumberText?: boolean;
  formula?: string;
  formulaReturnType?: "text" | "number" | "boolean" | "date";
  formMetaData?: {
    isFiedRequired?: boolean;
    isDescriptionRequired?: boolean;
    Description?: string;
    isLongAnswerRequired?: boolean;
    checkboxLabel?: string;
  };
  githubPrConfig?: GitHubPrConfig | null;
  specialProperty?: boolean;  // Marks this field as a special property; false by default
}

export interface BoardProperties {
  [key: string]: BoardProperty;
}

export interface BoardCreatedBy {
  userId: string;
  userName: string;
  userEmail: string;
}

export interface LayoutSettings {
  // Toggles
  showDataSourceTitle?: boolean;
  showPageIcon?: boolean;
  wrapAllContent?: boolean;

  // Enums
  openPagesIn?: "side_peek" | "center_peek";
  loadLimit?: number; // 10, 25, 50, 100
  cardPreview?: "page_content" | "cover" | "none";
  cardSize?: "small" | "medium" | "large";

  // Visual layout choice (specific to Board/Gallery/List)
  cardLayout?: "compact" | "list";
}

//schema of view type 
export interface View {
  _id?: string;
  viewType: "board" | "table" | "list" | "calendar" | "timeline" | "list_sprint" | "forms" | "chart" | "gallery";
  title: string;
  icon: string;
  formIcon?: string; // Form page icon 
  formCoverImage?: string; // Form page cover image
  formTitle?: string;
  formDescription?: string;
  isPublicForm?: "private" | "public" | "workspace-only";
  formAnonymousResponses?: boolean;
  formAccessToSubmission?: "no_access" | "can_view_own";
  databaseSourceId?: string; // Reference to IDatabaseSource
  settings?: {
    sorts?: SortItem[];
    group?: { propertyId: string; sortDirection?: "ascending" | "descending"; hideEmptyGroups?: boolean; colorColumn?: boolean };
    propertyVisibility?: Array<{ propertyId: string }>;
    filters?: Array<{ propertyId: string; value: any }>;
    advancedFilters?: AdvancedFilterGroup[];
    chart?: {
      chartType?: "vertical_bar" | "horizontal_bar" | "line" | "donut";
      xAxis?: {
        propertyId?: string;
        sortDirection?: "ascending" | "descending" | "high_to_low" | "low_to_high";
        omitZeroValues?: boolean;
      };
      yAxis?: {
        whatToShow?: "count" | string;
        groupBy?: string;
        referenceLines?: Array<{
          value: number;
          label?: string;
          style?: "solid" | "dashed";
          color?: string;
        }>;
      };
      style?: {
        color?: string;
        height?: "small" | "medium" | "large";
        gridLines?: "none" | "horizontal" | "vertical" | "both";
        axisName?: "both" | "x-axis" | "y-axis";
        dataLabels?: boolean;
        caption?: string;
        showCaption?: boolean;
        // Line chart specific
        smoothLine?: boolean;
        gradientArea?: boolean;
        legend?: boolean;
        // Donut chart specific
        showValueInCenter?: boolean;
        donutDataLabel?: "none" | "value" | "name" | "nameAndValue";
      };
    };
    layout?: LayoutSettings;
  };
  description?: string;
  viewDatabaseId?: string;
  isLocked?: boolean;
}

export interface AdvancedFilterGroup {
  id: string;
  booleanOperator: "AND" | "OR"; // How this group combines with other groups
  rules: AdvancedFilterRule[];
  groups?: AdvancedFilterGroup[]; // Nested groups
}

export interface AdvancedFilterRule {
  propertyId: string;
  operator: string;
  value: any;
  booleanOperator?: "AND" | "OR";
}

export interface ViewCollection {
  // _id: string;
  title: string;
  icon?: string; // Icon from IVeiwDatabase
  viewsTypes: View[];
  createdBy?: BoardCreatedBy; // Optional, can be set from IVeiwDatabase
  organizationDomain?: string;
  // createdAt?: string; // Optional, can be generated
  // updatedAt?: string; // Optional, can be generated
  // properties?: BoardProperties; // Optional, can be empty object
  // defaultDataSourceId?: string; // Reference to the default datasource created with the board
}

export interface Comment {
  commentId: string;
  commenterName: string;
  commenterEmail: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  mediaMetaData?: Array<{
    id: string;
    name: string;
    url: string;
    size?: number;
    mimeType?: string;
    uploadedAt?: string;
  }>;
}

export interface Note {
  // define fields once you know what note contains
  // e.g.
  _id: string;
  id?: string;
  title: string;
  content: string;
  description: string;
  noteType: string;
  databaseProperties: Record<string, any>;
  formulaErrors?: Record<string, string>;
  contentPath: string;
  commitSha: string;
  comments: Comment[];
}

export type Priority = "Low" | "Medium" | "High";

export interface BoardCollectionResponse {
  success: boolean;
  collection: {
    viewCollection: ViewCollection;
    note: Note[];
  };
  message: string;
}

export interface DeletePropertyResponse {
  success: boolean;
  message: string;
}

export interface BoardCollectionResponse {
  success: boolean;
  collection: {
    viewCollection: ViewCollection;
    note: Note[];
  };
  message: string;
}

export interface DeletePropertyResponse {
  success: boolean;
  message: string;
}


export interface SortItem {
  propertyId: string;
  direction: "ascending" | "descending";
}

// Database Source type (frontend representation)
export interface DatabaseSource {
  _id: string;
  title?: string; // Name/title of the data source
  icon?: string; // Emoji or icon for the data source
  createdBy: {
    userId: string;
    userName: string;
    userEmail: string;
  };
  createdAt: Date;
  updatedAt?: Date;
  properties: Record<string, BoardProperty>;
  settings: {};
  pairedDataSourceId?: string;
  workspaceId?: string;
  isSprint?: boolean;
  isSprintOn?: boolean;  // Whether sprint mode is active for this datasource; false by default
  lastSprintId?: number; // Auto-incrementing counter for sprint page IDs
  blockIds: string[];
  mainView: string;
}
