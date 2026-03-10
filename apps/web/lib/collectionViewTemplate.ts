import { ObjectId } from "bson";
import type { ViewType } from "@/models/types/DatabaseSource";
import { BoardProperty, DatabaseSource, View, ViewCollection } from "@/types/board";

export interface CollectionViewTemplateOptions {
  viewType: ViewType;
  title?: string;
  icon?: string;
  workspaceId: string;
  userEmail: string;
  blockId: string; // The collection_view block ID
}

/**
 * Creates a datasource with appropriate properties based on viewtype
 * For board viewtype, creates a status property with default options
 */
export function createDataSource(
  options: CollectionViewTemplateOptions
): DatabaseSource {
  const { viewType, workspaceId, userEmail, blockId } = options;

  const dataSourceId = new ObjectId().toString();
  const properties: Record<string, BoardProperty> = {};

  // For board and list viewtypes, create status property with default options
  if (viewType === "board" || viewType === "list") {
    const statusPropertyId = `prop_${new ObjectId()}`;
    const statusOptions = [
      { id: `opt_${new ObjectId()}`, name: "Todo", color: "blue" },
      { id: `opt_${new ObjectId()}`, name: "In Progress", color: "yellow" },
      { id: `opt_${new ObjectId()}`, name: "Done", color: "green" },
    ];

    properties[statusPropertyId] = {
      name: "Status",
      type: "status",
      options: statusOptions,
      default: true, // This is the default status property
      showProperty: true,
    };
  }

  // For calendar and timeline views, create date property
  if (viewType === "calendar" || viewType === "timeline") {
    const datePropertyId = `prop_${new ObjectId()}`;
    properties[datePropertyId] = {
      name: "Date",
      type: "date",
      default: true,
      showProperty: true,
    };
  }

  // For forms view, create text property
  if (viewType === "forms") {
    const textPropertyId = `prop_${new ObjectId()}`;
    properties[textPropertyId] = {
      name: "Name",
      type: "text",
      default: true,
      showProperty: true,
    };
  }

  // Create the datasource
  const dataSource: DatabaseSource = {
    _id: dataSourceId,
    title: options.title || `${viewType.charAt(0).toUpperCase() + viewType.slice(1)} View`,
    createdBy: {
      userId: userEmail,
      userName: userEmail,
      userEmail,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    properties,
    settings: {},
    workspaceId,
    isSprint: false,
    isSprintOn: false,
    blockIds: [], // Will be populated as pages are added
    mainView: blockId,
  };

  return dataSource;
}

/**
 * Creates a viewtype that references the datasource
 */
export function createViewType(
  options: CollectionViewTemplateOptions,
  dataSource: DatabaseSource,
  overrideViewType?: ViewType,
  overrideTitle?: string
): View {
  const { viewType, blockId } = options;
  const actualViewType = overrideViewType || viewType;

  const viewTypeId = new ObjectId().toString();

  // For list views, add the status property ID to propertyVisibility
  // For board views, set the status property ID as the default group
  const propertyVisibility: { propertyId: string }[] = [];
  let groupPropertyId = "";

  if (dataSource.properties) {
    // Find the status property ID
    const statusPropertyId = Object.keys(dataSource.properties).find(
      (propId) => dataSource.properties?.[propId]?.type === "status"
    );

    if (statusPropertyId) {
      if (actualViewType === "list") {
        propertyVisibility.push({ propertyId: statusPropertyId });
      } else if (actualViewType === "board") {
        groupPropertyId = statusPropertyId;
      }
    }
  }

  let group;

  if (groupPropertyId) {
    group = {
      propertyId: groupPropertyId,
      // colorColumn: "",
      // sortDirection: "ascending",
      // hideEmptyGroups: false,
    }
  }


  const viewTypeObj: View = {
    _id: viewTypeId,
    viewType: actualViewType,
    icon: "",
    title: overrideTitle || actualViewType.charAt(0).toUpperCase() + actualViewType.slice(1),
    databaseSourceId: dataSource._id,
    viewDatabaseId: blockId,
    settings: {
      propertyVisibility,
      filters: [],
      advancedFilters: [],
      group
    },
  };

  return viewTypeObj;
}

/**
 * Creates a complete collection_view template with datasource and viewtype
 * This is the main function to use when creating a new collection_view block
 * For forms viewType, creates 2 views: form view and list view for responses
 */
export function createCollectionViewTemplate(
  options: CollectionViewTemplateOptions
): {
  viewDatabase: ViewCollection;
  dataSource: DatabaseSource;
  viewType: View;
} {
  const { viewType, title, icon, userEmail, blockId } = options;

  // Step 1: Create datasource with appropriate properties
  const dataSource = createDataSource(options);

  // Step 2: Create viewtype(s) that reference the datasource
  const viewTypeObj = createViewType(options, dataSource);

  // For forms viewType, also create a list view for responses
  const viewsTypes: View[] = [viewTypeObj];
  if (viewType === "forms") {
    const responseListView = createViewType(options, dataSource, "list", "Responses");
    viewsTypes.push(responseListView);
  }

  // Step 3: Create the viewDatabase structure
  const viewDatabase: ViewCollection = {
    title: title || `${viewType.charAt(0).toUpperCase() + viewType.slice(1)} View`,
    icon: icon || "",
    viewsTypes,
    createdBy: {
      userId: userEmail,
      userName: userEmail,
      userEmail,
    },
  };

  return {
    viewDatabase,
    dataSource,
    viewType: viewTypeObj,
  };
}

/**
 * Serializes a datasource for API transmission
 * Converts ObjectIds to strings and dates to ISO strings for JSON
 */
export function serializeDataSourceForAPI(dataSource: DatabaseSource): any {
  return {
    _id: dataSource._id.toString(),
    ...(dataSource.title && { title: dataSource.title }),
    createdBy: {
      userId: typeof dataSource.createdBy.userId === "string"
        ? dataSource.createdBy.userId
        : dataSource.createdBy.userId,
      userName: dataSource.createdBy.userName || "",
      userEmail: dataSource.createdBy.userEmail,
    },
    createdAt: dataSource.createdAt.toISOString(),
    updatedAt: dataSource.updatedAt?.toISOString(),
    properties: dataSource.properties || {},
    settings: dataSource.settings || {},
    ...(dataSource.workspaceId && { workspaceId: dataSource.workspaceId }),
    isSprint: dataSource.isSprint ?? false,
    isSprintOn: dataSource.isSprintOn ?? false,
    ...(dataSource.pairedDataSourceId && { pairedDataSourceId: dataSource.pairedDataSourceId }),
    ...(dataSource.lastSprintId !== undefined && { lastSprintId: dataSource.lastSprintId }),
    blockIds: dataSource.blockIds || [],
    mainView: dataSource.mainView || "board",
  };
}

/**
 * Serializes viewDatabase for API transmission
 * Converts ObjectIds in viewsTypes to strings
 */
export function serializeViewDatabaseForAPI(viewDatabase: ViewCollection): any {
  return {
    ...viewDatabase,
    viewsTypes: viewDatabase.viewsTypes?.map((vt) => ({
      ...vt,
      _id: vt._id || undefined,
      databaseSourceId: vt.databaseSourceId || undefined,
      viewDatabaseId: vt.viewDatabaseId || undefined,
    })) || [],
  };
}

