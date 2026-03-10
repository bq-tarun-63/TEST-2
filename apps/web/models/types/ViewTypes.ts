import { ObjectId } from "mongodb";
import { ViewType } from "./DatabaseSource";

export type SortDirection = "ascending" | "descending" | "high_to_low" | "low_to_high";

export interface IFilter {
  propertyId: string;
  value: any;
  // Advanced filter fields (optional for backward compatibility)
  operator?: string; // "contains", "equals", "not_equals", "is_empty", "is_not_empty", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal"
  booleanOperator?: "AND" | "OR"; // Used to combine multiple rules
  isAdvanced?: boolean; // Flag to identify advanced filters
  // Allow disabling filters without deleting
}
export interface ISort {
  propertyId: string;
  direction: SortDirection;
}
export interface IGroup {
  propertyId: string;
  sortDirection?: SortDirection;
  hideEmptyGroups?: boolean;
  colorColumn?: boolean;
}
export interface IPropertyVisibility {
  propertyId: string;
}

// Advanced filter group structure
export interface IAdvancedFilterGroup {
  id: string;
  booleanOperator: "AND" | "OR"; // How this group combines with other groups
  rules: IAdvancedFilterRule[];
  groups?: IAdvancedFilterGroup[]; // Nested groups
}

export interface IAdvancedFilterRule {
  propertyId: string;
  operator: string; // "contains", "equals", "greater_than", etc.
  value: any;
  booleanOperator?: "AND" | "OR"; // Operator connecting this rule to the previous one (for flat rule lists)
  // Sprint-only: when the relation targets a datasource with isSprint=true,
  // this enables cross-relation property lookup (e.g. Sprint.status = "Current")
  nestedPropertyId?: string;
}

export interface IChartSettings {
  chartType?: IChartType;
  xAxis?: {
    propertyId?: string;
    sortDirection?: SortDirection;
    omitZeroValues?: boolean;
  };
  yAxis?: {
    whatToShow?: "count" | string; // "count" or propertyId
    groupBy?: string; // propertyId to group by
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
}

export interface ILayoutSettings {
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

export interface IViewTypeSettings {
  sorts?: ISort[];
  group?: IGroup; // Primary group (single property)
  propertyVisibility?: IPropertyVisibility[]; // Which properties are visible and their order
  filters?: IFilter[]; // Regular filters only
  advancedFilters?: IAdvancedFilterGroup[]; // Advanced filters (separate from regular filters)
  chart?: IChartSettings; // Chart-specific settings (only for chart view type)
  layout?: ILayoutSettings;
}

/**
 * View Type Interface
 * Represents a single view (board, table, list, etc.) of a database
 */
export type IChartType = "verticalBar" | "horizontalBar" | "donut" | "line";

export interface IViewType {
  _id?: string;
  viewType: ViewType;
  icon: string;
  title: string;
  formTitle?: string;
  formDescription?: string;
  databaseSourceId: ObjectId; // Reference to the data source
  viewDatabaseId: ObjectId; // Links back to the IVeiwDatabase (parent collection)
  description?: string;
  formIcon?: string; // Form page icon
  formCoverImage?: string; // Form page cover 
  // View configuration and settings
  settings?: IViewTypeSettings;
  // View-specific metadata
  isLocked?: boolean; // Is this view locked from editing?
  isPublicForm?: "private" | "public" | "workspace-only";
  formAnonymousResponses?: boolean;
  formAccessToSubmission?: "no_access" | "can_view_own";
}

export default IViewType;