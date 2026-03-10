import clientPromise from "@/lib/mongoDb/mongodb";
import { ObjectId } from "mongodb";
import type { AnyBulkWriteOperation } from "mongodb";
import {
  IDatabaseSource,
  PropertyType,
  PropertyOption,
  PropertySchema,
  ViewType,
  GitHubPrConfig,
} from "@/models/types/DatabaseSource";
import { IViewType } from "@/models/types/ViewTypes";
import { IBlock, IPage, IVeiwDatabase } from "@/models/types/Block";
import { AuditService } from "./auditService";
import { sendEmail } from "@/lib/emailNotification/sendEmailNotification";
import { getNoteAssignationHtml } from "@/lib/emailNotification/emailTemplate/noteAssignationTemplate";
import { INotification } from "@/models/types/Notification";
import { IUser } from "@/models/types/User";
import { IWorkspace } from "@/models/types/Workspace";
import { createFormulaRuntime } from "@/lib/formula/evaluator";
import { GitHubIntegrationService } from "./githubIntegrationService";

export async function checkDefault(
  viewId: string,
  type: PropertyType,
  source?: IDatabaseSource,
): Promise<boolean> {
  const client = await clientPromise();
  const db = client.db();

  // Get source if not passed
  let databaseSource: IDatabaseSource | null = source || null;
  if (!databaseSource) {
    // Query blocks collection for collection_view block
    const blocksColl = db.collection<IBlock>("blocks");
    const viewBlock = await blocksColl.findOne({
      _id: new ObjectId(viewId),
      blockType: 'collection_view'
    });
    if (!viewBlock) {
      return false;
    }
    const viewValue = viewBlock.value as IVeiwDatabase;
    if (!viewValue.viewsTypes || viewValue.viewsTypes.length === 0) {
      return false;
    }
    const databaseSourceId = viewValue.viewsTypes[0]?.databaseSourceId;
    if (!databaseSourceId) {
      return false;
    }
    const sourcesCollection = db.collection<IDatabaseSource>("databaseSources");
    databaseSource = await sourcesCollection.findOne({ _id: databaseSourceId });
  }

  if (!databaseSource) return false;

  // get all properties from source
  const properties = Object.values(databaseSource.properties || {});

  // count how many of this type exist
  const sameTypeProps = properties.filter((p) => p.type === type && p.default === true);

  // first occurrence if only 1 exists
  return sameTypeProps.length < 1;
}

// Helper function to get database source from view
async function getDatabaseSourceFromView(viewId: string): Promise<IDatabaseSource | null> {
  const client = await clientPromise();
  const db = client.db();
  const blocksColl = db.collection<IBlock>("blocks");
  const databaseSourcesCollection = db.collection<IDatabaseSource>("databaseSources");

  const viewBlock = await blocksColl.findOne({
    _id: new ObjectId(viewId),
    blockType: 'collection_view'
  });
  if (!viewBlock) {
    return null;
  }
  const viewValue = viewBlock.value as IVeiwDatabase;
  if (!viewValue.viewsTypes || viewValue.viewsTypes.length === 0) {
    return null;
  }

  // Get databaseSourceId from first view type (all should have same source)
  const databaseSourceId = viewValue.viewsTypes[0]?.databaseSourceId;
  if (!databaseSourceId) {
    return null;
  }

  const source = await databaseSourcesCollection.findOne({ _id: databaseSourceId });
  return source;
}

function buildFormulaRuntime(source: IDatabaseSource) {
  const propertyDefinitions: Record<string, { id: string; name: string; type: string; options?: PropertyOption[] }> =
    {};

  const sourceProperties = source.properties || {};
  Object.entries(sourceProperties).forEach(([id, property]) => {
    if (property) {
      propertyDefinitions[id] = {
        id,
        name: property.name,
        type: property.type,
        options: property.options,
      };
    }
  });

  return createFormulaRuntime(propertyDefinitions);
}

type GitHubPrValueInput = {
  owner?: string;
  repo?: string;
  pullNumber?: number | string;
  number?: number | string;
  installationId?: number;
};

type GitHubPrPreparedValue = {
  persistedValue: Record<string, any>;
  statusUpdate?: { propertyId: string; value: string };
};

function resolveUserIdForGithub(currentUser: IUser): string {
  if (currentUser.id) {
    return currentUser.id;
  }
  if (typeof currentUser._id === "string") {
    return currentUser._id;
  }
  if (currentUser._id) {
    return currentUser._id.toString();
  }
  throw new Error("Current user identifier is required for GitHub PR sync.");
}

function normalizeGithubPrValue(
  rawValue: unknown,
  config?: GitHubPrConfig,
): { owner: string; repo: string; pullNumber: number; installationId?: number } {
  if (!rawValue || typeof rawValue !== "object") {
    throw new Error("GitHub PR property value must be an object.");
  }
  const value = rawValue as GitHubPrValueInput;

  const owner = (value.owner ?? config?.defaultOwner)?.trim();
  const repo = (value.repo ?? config?.defaultRepo)?.trim();
  const pullNumberSource = value.pullNumber ?? value.number;
  const pullNumber = Number(pullNumberSource);

  if (!owner || !repo || pullNumberSource === undefined || Number.isNaN(pullNumber)) {
    throw new Error("GitHub PR value must include owner, repo, and pullNumber.");
  }

  return {
    owner,
    repo,
    pullNumber,
    installationId: value.installationId ?? config?.installationId,
  };
}

function pickStatusOptionName(
  options: PropertyOption[] | undefined,
  preferredId?: string,
  fallbackNames: string[] = [],
): string | undefined {
  if (!options || options.length === 0) {
    return undefined;
  }
  if (preferredId) {
    const match = options.find((opt) => opt.id === preferredId);
    if (match) {
      return match.name;
    }
  }
  if (fallbackNames.length > 0) {
    const lowerFallbacks = fallbackNames.map((n) => n.toLowerCase());
    const fallback = options.find((opt) => lowerFallbacks.includes(opt.name.toLowerCase()));
    if (fallback) {
      return fallback.name;
    }
  }
  return undefined;
}

function computeStatusUpdateForGithubPr(
  config: GitHubPrConfig | undefined,
  sourceProperties: Record<string, PropertySchema>,
  prState: { merged: boolean; state: "open" | "closed" },
): { propertyId: string; value: string } | undefined {
  // If no statusPropertyId is configured, try to find a default status property
  let statusPropertyId = config?.statusPropertyId;
  if (!statusPropertyId) {
    // Look for a property named "Status" (case-insensitive) or the first status property
    const statusProp = Object.entries(sourceProperties).find(
      ([_, prop]) => prop.type === "status" && prop.name.toLowerCase() === "status",
    );
    if (statusProp) {
      statusPropertyId = statusProp[0];
      console.log(
        `[GitHub PR Sync] Auto-detected status property: ${statusPropertyId} (${statusProp[1].name})`,
      );
    } else {
      // Fallback to any status property
      const anyStatusProp = Object.entries(sourceProperties).find(
        ([_, prop]) => prop.type === "status",
      );
      if (anyStatusProp) {
        statusPropertyId = anyStatusProp[0];
        console.log(
          `[GitHub PR Sync] Auto-detected first status property: ${statusPropertyId} (${anyStatusProp[1].name})`,
        );
      }
    }
  }

  if (!statusPropertyId) {
    console.log(
      "[GitHub PR Sync] No status property found in database. Please add a status property or configure statusPropertyId in GitHub PR settings.",
    );
    return undefined;
  }

  const targetProperty = sourceProperties[statusPropertyId];
  if (!targetProperty || targetProperty.type !== "status") {
    console.warn(
      `[GitHub PR Sync] Status property '${statusPropertyId}' is missing or not a status type. Found: ${targetProperty?.type || "missing"}`,
    );
    return undefined;
  }

  const options = targetProperty.options || [];
  console.log(
    `[GitHub PR Sync] Computing status update. PR state: ${prState.state}, merged: ${prState.merged}. Available options:`,
    options.map((o) => o.name),
  );

  const pendingName = pickStatusOptionName(
    options,
    config?.pendingStatusOptionId,
    ["pending", "todo", "in progress", "open"],
  );
  const completedName = pickStatusOptionName(
    options,
    config?.completedStatusOptionId,
    ["completed", "complete", "done", "merged", "closed"],
  );

  console.log(
    `[GitHub PR Sync] Resolved options - pending: "${pendingName}", completed: "${completedName}"`,
  );

  const isCompleteState = prState.merged || prState.state === "closed";
  const desiredName = isCompleteState ? completedName ?? pendingName : pendingName ?? completedName;

  if (!desiredName) {
    console.warn(
      `[GitHub PR Sync] Unable to resolve a status option for GitHub PR sync. PR state: ${prState.state}, merged: ${prState.merged}, pendingName: ${pendingName}, completedName: ${completedName}`,
    );
    return undefined;
  }

  console.log(
    `[GitHub PR Sync] Status update computed: propertyId=${statusPropertyId}, value="${desiredName}", PR state=${prState.state}, merged=${prState.merged}, isCompleteState=${isCompleteState}`,
  );

  return {
    propertyId: statusPropertyId,
    value: desiredName,
  };
}

async function prepareGithubPrValue({
  rawValue,
  config,
  currentUserId,
  sourceProperties,
}: {
  rawValue: unknown;
  config?: GitHubPrConfig;
  currentUserId: string;
  sourceProperties: Record<string, PropertySchema>;
}): Promise<GitHubPrPreparedValue> {
  const normalized = normalizeGithubPrValue(rawValue, config);
  console.log(
    `[GitHub PR] Preparing PR value. Normalized:`,
    JSON.stringify(normalized, null, 2),
    `Config:`,
    JSON.stringify(config, null, 2),
  );

  let prStatus;
  try {
    prStatus = await GitHubIntegrationService.getPullRequestStatus({
      userId: currentUserId,
      owner: normalized.owner,
      repo: normalized.repo,
      pullNumber: normalized.pullNumber,
      installationId: normalized.installationId ?? config?.installationId,
    });
    console.log(`[GitHub PR] Fetched PR status:`, {
      number: prStatus.number,
      state: prStatus.state,
      merged: prStatus.merged,
      title: prStatus.title,
    });
  } catch (error) {
    console.error(`[GitHub PR] Failed to fetch PR status:`, error);
    throw error;
  }

  const persistedValue = {
    owner: normalized.owner,
    repo: normalized.repo,
    pullNumber: normalized.pullNumber,
    installationId: normalized.installationId,
    number: prStatus.number,
    title: prStatus.title,
    url: prStatus.htmlUrl,
    state: prStatus.state,
    merged: prStatus.merged,
    draft: prStatus.draft,
    headSha: prStatus.headSha,
    baseSha: prStatus.baseSha,
    lastSyncedAt: new Date().toISOString(),
    prUpdatedAt: prStatus.updatedAt,
  };

  const statusUpdate = computeStatusUpdateForGithubPr(config, sourceProperties, {
    merged: prStatus.merged,
    state: prStatus.state,
  });

  console.log(`[GitHub PR] Prepared value. Status update:`, statusUpdate);

  return { persistedValue, statusUpdate };
}


export const DatabaseService = {
  async getDataSourceById({ dataSourceId }: { dataSourceId: string }) {
    const client = await clientPromise();
    const db = client.db();
    const dataSourceCollection = db.collection<IDatabaseSource>("databaseSources");
    const blocksColl = db.collection<IBlock>("blocks");

    const dataSource = await dataSourceCollection.findOne({ _id: new ObjectId(dataSourceId) });
    if (!dataSource) {
      throw new Error("Data source not found");
    }

    // Fetch database rows as blocks instead of notes
    const blocks = await blocksColl.find({
      _id: { $in: dataSource.blockIds.map((id) => new ObjectId(id)) },
      blockType: 'page',
      status: 'alive'
    }).toArray();

    return { dataSource, blocks };
  },

  async getAllDataSourcesByWorkspace({ workspaceId }: { workspaceId: string }) {
    const client = await clientPromise();
    const db = client.db();
    const dataSourceCollection = db.collection<IDatabaseSource>("databaseSources");

    if (!workspaceId) {
      throw new Error("Workspace ID is required");
    }

    const dataSources = await dataSourceCollection
      .find({ workspaceId: workspaceId })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    return dataSources;
  },

  async getPublicFormView({ blockId, viewId, userId }: { blockId: string; viewId: string; userId?: string }) {
    if (!blockId || !viewId) {
      throw new Error("blockId and viewId are required");
    }

    const client = await clientPromise();
    const db = client.db();
    const blocksCollection = db.collection<IBlock>("blocks");

    const block = await blocksCollection.findOne({ _id: new ObjectId(blockId) });

    if (!block) {
      throw new Error("Block not found");
    }

    if (block.blockType !== "collection_view") {
      throw new Error("Invalid block type");
    }

    const databaseValue = block.value as IVeiwDatabase;
    if (!databaseValue.viewsTypes) {
      throw new Error("No views found");
    }

    // Find the view
    const view = databaseValue.viewsTypes.find(v => v._id === viewId || v._id?.toString() === viewId);

    if (!view) {
      throw new Error("View not found");
    }

    const isPublic = view.isPublicForm === 'public';
    const isWorkspaceOnly = view.isPublicForm === 'workspace-only';

    // If undefined, empty, or 'private' - strictly deny unless explicitly public or workspace-only
    if (!isPublic && !isWorkspaceOnly) {
      throw new Error("Form is not public");
    }

    if (isWorkspaceOnly) {
      // Check for user login
      if (!userId) {
        throw new Error("Form is workspace-only, login required");
      }

      // Manual check for workspace membership
      const workspacesCollection = db.collection<IWorkspace>("workspaces");
      const workspace = await workspacesCollection.findOne({ _id: new ObjectId(block.workspaceId) });

      if (!workspace) {
        throw new Error("Workspace not found");
      }

      const isOwner = workspace.ownerId.toString() === userId;
      // Check if user is in members array
      const isMember = workspace.members?.some(m => m.userId.toString() === userId);

      if (!isOwner && !isMember) {
        throw new Error("Unauthorized access to workspace form");
      }
    }

    if (!view.databaseSourceId) {
      throw new Error("DataSource ID missing in view");
    }

    const dataSourceCollection = db.collection<IDatabaseSource>("databaseSources");
    const dataSource = await dataSourceCollection.findOne({
      _id: new ObjectId(view.databaseSourceId)
    });

    if (!dataSource) {
      throw new Error("DataSource not found");
    }

    return {
      success: true,
      view,
      dataSource,
      workspaceId: block.workspaceId
    };
  },
  async updateViewType({
    blockId,
    viewTypeId,
    icon,
    title,
    newViewType,
    formIcon,
    formCoverImage,
    formTitle,
    formDescription,
    isPublicForm,
    formAnonymousResponses,
    formAccessToSubmission,
  }: {
    blockId: string;
    viewTypeId: string;
    icon: string;
    title: string;
    newViewType?: string;
    formIcon?: string;
    formCoverImage?: string;
    formTitle?: string;
    formDescription?: string;
    isPublicForm?: "private" | "public" | "workspace-only";
    formAnonymousResponses?: boolean;
    formAccessToSubmission?: "no_access" | "can_view_own";
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");
    const block = await blocksColl.findOne({ _id: new ObjectId(blockId) });
    if (!block) {
      throw new Error("Block not found");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes;

    if (!viewTypes) {
      throw new Error("View types not found");
    }
    const viewTypeObjectId = new ObjectId(viewTypeId);
    const viewTypeIndex = viewTypes.findIndex(vt => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (viewTypeIndex !== -1) {
      const existingViewType = viewTypes[viewTypeIndex]!;
      // Use newViewType if provided, otherwise keep existing viewType
      const finalViewType: IViewType["viewType"] = (newViewType as IViewType["viewType"]) || existingViewType.viewType;

      // Store only minimal data in block
      const updatedViewTypes = [...viewTypes];
      updatedViewTypes[viewTypeIndex] = {
        ...existingViewType,
        viewType: finalViewType,
        icon,
        title,
        databaseSourceId: existingViewType.databaseSourceId,
        viewDatabaseId: new ObjectId(blockId),

        ...(formIcon !== undefined && { formIcon }),
        ...(formCoverImage !== undefined && { formCoverImage }),
        ...(formTitle !== undefined && { formTitle }),
        ...(formDescription !== undefined && { formDescription }),
        ...(isPublicForm !== undefined && { isPublicForm }),
        ...(formAnonymousResponses !== undefined && { formAnonymousResponses }),
        ...(formAccessToSubmission !== undefined && { formAccessToSubmission }),
      };

      const updatedValue: IVeiwDatabase = {
        ...viewValue,
        viewsTypes: updatedViewTypes
      };

      // Update block
      await blocksColl.updateOne(
        { _id: new ObjectId(blockId) },
        {
          $set: {
            value: updatedValue,
            updatedAt: new Date()
          }
        }
      );

      // Fetch updated block
      const updatedBlock = await blocksColl.findOne({ _id: new ObjectId(blockId) });
      if (!updatedBlock) {
        throw new Error("Block not found after update");
      }
      return { success: true, view: updatedBlock };
    } else {
      throw new Error("View type not found");
    }
  },

  async updateViewDataSource({ blockId, viewTypeId, dataSourceId }: { blockId: string; viewTypeId: string; dataSourceId: string }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");
    const viewTypesCollection = db.collection<IViewType>("viewTypes");

    // Get the collection_view block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      blockType: 'collection_view'
    });
    if (!block) {
      throw new Error("View block not found");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes;
    if (!viewTypes) {
      throw new Error("View types not found");
    }

    const viewTypeObjectId = new ObjectId(viewTypeId);
    const existingViewTypeIndex = viewTypes.findIndex(vt => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (existingViewTypeIndex === -1) {
      throw new Error("View type not found");
    }

    const newDataSourceId = new ObjectId(dataSourceId);

    // Update the specific viewType in the array
    const updatedViewTypes = [...viewTypes];
    if (!updatedViewTypes[existingViewTypeIndex]) {
      throw new Error("View type not found");
    }
    updatedViewTypes[existingViewTypeIndex] = {
      ...updatedViewTypes[existingViewTypeIndex],
      databaseSourceId: newDataSourceId,
      viewDatabaseId: new ObjectId(blockId), // Ensure viewDatabaseId is set
      settings: {}
    };

    // Update block value
    const updatedValue: IVeiwDatabase = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    await blocksColl.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      }
    );

    // Audit Log
    if (viewValue.createdBy) {
      AuditService.log({
        action: "UPDATE",
        noteId: blockId,
        userId: viewValue.createdBy.userId.toString(),
        userEmail: viewValue.createdBy.userEmail,
        userName: viewValue.createdBy.userName,
        noteName: viewValue.title,
        serviceType: "MONGODB",
        field: "view-type",
        oldValue: undefined,
        newValue: dataSourceId,
        workspaceId: block.workspaceId,
      }).catch(console.error);
    }

    // Fetch updated block
    const updatedBlock = await blocksColl.findOne({ _id: new ObjectId(blockId) });
    if (!updatedBlock) {
      throw new Error("Block not found after update");
    }

    const updatedViewValue = updatedBlock.value as IVeiwDatabase;
    return {
      success: true,
      view: {
        ...updatedBlock,
        value: updatedViewValue
      }
    };
  },

  async deleteViewType({ blockId, viewTypeId }: { blockId: string; viewTypeId: string }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");
    // Get the collection_view block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
    });
    if (!block || block.blockType !== "collection_view") {
      throw new Error("View block not found or block type is not collection_view");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes;
    if (!viewTypes) {
      throw new Error("View types not found");
    }

    const viewTypeObjectId = new ObjectId(viewTypeId);
    const viewTypeToDelete = viewTypes.find(vt => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (!viewTypeToDelete) {
      throw new Error("View type not found");
    }

    // Delete from viewTypes collection

    // Remove from block's viewsTypes array
    const updatedViewsTypes = viewTypes.filter(vt => {
      if (!vt._id) return true;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return !vtId.equals(viewTypeObjectId);
    });

    const updatedValue: IVeiwDatabase = {
      ...viewValue,
      viewsTypes: updatedViewsTypes
    };

    const update = await blocksColl.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      }
    );

    const updatedBlock = await blocksColl.findOne({ _id: new ObjectId(blockId) });

    if (!update || !updatedBlock) {
      throw new Error("Failed to delete view type");
    }

    // Log audit
    if (viewValue.createdBy) {
      console.log('AuditService.log - DELETE view type:', {
        action: 'DELETE',
        blockId: blockId.toString(),
        userId: viewValue.createdBy.userId.toString()
      });
      await AuditService.log({
        action: "DELETE",
        noteId: blockId.toString(),
        userId: viewValue.createdBy.userId.toString(),
        userEmail: viewValue.createdBy.userEmail,
        userName: viewValue.createdBy.userName,
        noteName: viewValue.title,
        serviceType: "MONGODB",
        field: "view-type",
        oldValue: undefined,
        newValue: viewTypeToDelete.viewType,
        workspaceId: block.workspaceId,
        organizationDomain: viewValue.organizationDomain || "",
      });
    }



    const updatedViewValue = updatedBlock.value as IVeiwDatabase;
    return {
      success: true,
      view: {
        ...updatedBlock,
        value: updatedViewValue
      }
    };
  },
  async reOrderSchema({ dataSourceId, order, userId, userEmail, userName, viewId }: { dataSourceId: string; order: string[]; userId: string; userEmail: string; userName: string; viewId?: string }) {
    const client = await clientPromise();
    const db = client.db();
    const databaseSourcesCollection = db.collection<IDatabaseSource>("databaseSources");

    const databaseSource = await databaseSourcesCollection.findOne({
      _id: new ObjectId(dataSourceId),
    });
    if (!databaseSource) {
      throw new Error("Database source not found");
    }

    // Step 1: Create a new object in the requested order (from source, not view)
    const reordered: Record<string, any> = {};
    const sourceProperties = databaseSource.properties || {};

    for (const propId of order) {
      if (sourceProperties[propId]) {
        reordered[propId] = sourceProperties[propId];
      }
    }

    // Step 2: Append any properties not listed in order[] (to not lose them)
    for (const [propId, value] of Object.entries(sourceProperties)) {
      if (!reordered[propId]) {
        reordered[propId] = value;
      }
    }

    // Step 3: Save reordered properties in IDatabaseSource (not in IVeiwDatabase)
    const update = await databaseSourcesCollection.updateOne(
      { _id: new ObjectId(dataSourceId) },
      { $set: { properties: reordered, updatedAt: new Date() } }
    );

    if (!update.modifiedCount) {
      throw new Error("Failed to reorder schema");
    }

    // Fetch updated data source
    const updatedDataSource = await databaseSourcesCollection.findOne({
      _id: new ObjectId(dataSourceId),
    });
    if (!updatedDataSource) {
      throw new Error("Failed to retrieve updated data source");
    }

    // Log audit (viewId is optional for audit purposes)
    await AuditService.log({
      action: "REORDER",
      noteId: dataSourceId,
      userId,
      userEmail,
      userName,
      noteName: databaseSource?.title || "New DataSource",
      serviceType: "MONGODB",
      field: "property",
      oldValue: undefined,
      newValue: reordered,
      workspaceId: databaseSource?.workspaceId,
      organizationDomain: undefined,
    });

    return {
      success: true,
      dataSource: updatedDataSource
    };
  },

  async addViewType({ viewId, blockId, addToViewType, viewTypeValue }: { viewId: string; blockId: string; addToViewType: ViewType | ""; viewTypeValue: IViewType }) {
    const client = await clientPromise();
    const db = client.db();
    const blockCollection = await db.collection<IBlock>("blocks");
    if (addToViewType == "") {
      throw new Error("View type not found");
    }
    // Get block first to access existing databaseSourceId
    const block = await blockCollection.findOne({
      _id: new ObjectId(blockId),
    });
    if (!block) {
      throw new Error("Block not found");
    }
    const viewValue = block.value as IVeiwDatabase;
    const newViewType: IViewType = viewTypeValue;

    // Add new viewType to existing viewsTypes array
    const updatedViewsTypes = [...(viewValue.viewsTypes || []), newViewType];

    // Update block value with new viewsTypes
    const updatedValue: IVeiwDatabase = {
      ...viewValue,
      viewsTypes: updatedViewsTypes
    };

    const update = await blockCollection.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      },
    );
    if (!update.matchedCount) {
      throw new Error("Failed to add view type");
    }

    // Fetch updated block
    const updatedBlock = await blockCollection.findOne({ _id: new ObjectId(blockId) });
    if (!updatedBlock) {
      throw new Error("Block not found after update");
    }

    const updatedViewValue = updatedBlock.value as IVeiwDatabase;

    // Log audit with data from block level and value level
    if (updatedViewValue.createdBy) {
      await AuditService.log({
        action: "CREATE",
        noteId: blockId.toString(),
        userId: updatedViewValue.createdBy.userId.toString(),
        userEmail: updatedViewValue.createdBy.userEmail,
        userName: updatedViewValue.createdBy.userName,
        noteName: updatedViewValue.title,
        serviceType: "MONGODB",
        field: "view-type",
        oldValue: undefined,
        newValue: newViewType,
        workspaceId: updatedBlock.workspaceId,
        organizationDomain: updatedViewValue.organizationDomain || "",
      });
    }

    return {
      success: true,
      view: {
        ...updatedBlock,
        value: updatedViewValue
      }
    };
  },
  async updateViewNameOrIcon({ blockId, title, icon }: { blockId: string; title?: string; icon?: string }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // First, get the view to check for defaultDataSourceId
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      blockType: 'collection_view'
    });

    if (!block) {
      throw new Error("View block not found");
    }

    const viewValue = block.value as IVeiwDatabase;

    // Build updated value with only the provided fields (isolated update)
    const updatedValue: IVeiwDatabase = {
      ...viewValue,
      ...(title !== undefined && { title }),
      ...(icon !== undefined && { icon }),
    };

    const updatedBlock = await blocksColl.findOneAndUpdate(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!updatedBlock) {
      throw new Error("Block not found after update");
    }

    const updatedViewValue = updatedBlock.value as IVeiwDatabase;

    // Log audit
    if (updatedViewValue.createdBy) {
      AuditService.log({
        action: "UPDATE",
        noteId: blockId,
        userId: updatedViewValue.createdBy.userId.toString(),
        userEmail: updatedViewValue.createdBy.userEmail,
        userName: updatedViewValue.createdBy.userName,
        noteName: updatedViewValue.title,
        serviceType: "MONGODB",
        field: "view",
        oldValue: undefined,
        newValue: title ?? icon,
        workspaceId: updatedBlock.workspaceId,
        organizationDomain: updatedViewValue.organizationDomain,
      }).catch(console.error);
    }
    return { success: true, view: updatedBlock };
  },

  async deletePropertyfromDataSource({ dataSourceId, propertyId, userId, userEmail, userName }: { dataSourceId: string; propertyId: string; userId: string; userEmail: string; userName: string }) {
    const client = await clientPromise();
    const db = client.db();
    const databaseSourcesCollection = db.collection<IDatabaseSource>("databaseSources");

    // Verify data source exists
    const dataSource = await databaseSourcesCollection.findOne({ _id: new ObjectId(dataSourceId) });
    if (!dataSource) {
      throw new Error("Data source not found");
    }

    // Verify property exists
    if (!dataSource.properties || !dataSource.properties[propertyId]) {
      throw new Error("Property not found in data source");
    }

    // Delete property from IDatabaseSource
    const result = await databaseSourcesCollection.updateOne(
      { _id: new ObjectId(dataSourceId) },
      {
        $unset: { [`properties.${propertyId}`]: "" },
        $set: { updatedAt: new Date() }
      },
    );
    if (result.modifiedCount === 0) {
      throw new Error("Failed to delete property");
    }

    // Delete the property from blocks collection (page blocks with parentId = dataSourceId)
    const blocksColl = db.collection<IBlock>("blocks");
    await blocksColl.updateMany(
      {
        parentId: dataSourceId,
        blockType: 'page',
        "value.databaseProperties": { $exists: true, $ne: {} },
      },
      { $unset: { [`value.databaseProperties.${propertyId}`]: "" } },
    );

    // Fetch updated data source
    const updatedDataSource = await databaseSourcesCollection.findOne({ _id: new ObjectId(dataSourceId) });
    if (!updatedDataSource) {
      throw new Error("Failed to retrieve updated data source");
    }

    // Fetch updated blocks
    const updatedBlocks = await blocksColl.find({
      parentId: dataSourceId,
      blockType: 'page'
    }).toArray();

    // Formula support removed - no recalculation needed

    // Log audit for property deletion
    console.log('AuditService.log - DELETE property:', {
      action: 'DELETE',
      dataSourceId: dataSourceId,
      userId,
      userEmail,
      userName,
      resource: dataSource?.title || "Unknown Data Source",
      source: 'MONGODB'
    });
    await AuditService.log({
      action: "DELETE",
      noteId: dataSourceId,
      userId,
      userEmail,
      userName,
      noteName: dataSource?.title || "Unknown Data Source",
      serviceType: "MONGODB",
      field: "property",
      oldValue: undefined,
      newValue: propertyId,
      workspaceId: dataSource?.workspaceId,
      organizationDomain: undefined,
    });

    return {
      success: true,
      dataSource: updatedDataSource,
      blocks: updatedBlocks
    };
  },

  async updateDatabaseSourceDetails({ dataSourceId, icon, title, isSprintOn, pairedDataSourceId, lastSprintId, userId, userEmail, userName }: { dataSourceId: string; icon?: string; title?: string; isSprintOn?: boolean; pairedDataSourceId?: string; lastSprintId?: number; userId: string; userEmail: string; userName: string }) {
    const client = await clientPromise();
    const db = client.db();
    const databaseSourcesCollection = db.collection<IDatabaseSource>("databaseSources");

    const dataSource = await databaseSourcesCollection.findOne({ _id: new ObjectId(dataSourceId) });
    if (!dataSource) {
      throw new Error("Data source not found");
    }

    const updateData: any = { updatedAt: new Date() };
    if (icon !== undefined) updateData.icon = icon;
    if (title !== undefined) updateData.title = title;
    if (isSprintOn !== undefined) updateData.isSprintOn = isSprintOn;
    if (pairedDataSourceId !== undefined) updateData.pairedDataSourceId = pairedDataSourceId;
    if (lastSprintId !== undefined) updateData.lastSprintId = lastSprintId;

    if (Object.keys(updateData).length <= 1) { // Only updatedAt
      return { success: true, dataSource };
    }

    const result = await databaseSourcesCollection.updateOne(
      { _id: new ObjectId(dataSourceId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      throw new Error("Failed to update data source details");
    }

    const updatedDataSource = await databaseSourcesCollection.findOne({ _id: new ObjectId(dataSourceId) });

    // Log audit
    await AuditService.log({
      action: "UPDATE",
      noteId: dataSourceId,
      userId,
      userEmail,
      userName,
      noteName: updatedDataSource?.title || "Database Source",
      serviceType: "MONGODB",
      field: "title",
      oldValue: { icon: dataSource.icon, title: dataSource.title },
      newValue: { icon, title },
      workspaceId: dataSource.workspaceId,
      organizationDomain: undefined,
    });

    return {
      success: true,
      dataSource: updatedDataSource
    };
  },

  async addPropertyToDataSource({ dataSourceId, propertyData, userId, userEmail, userName, blockId }: {
    dataSourceId: string;
    propertyData: {
      propertyId: string;
      name: string;
      type: PropertyType;
      options?: PropertyOption[];
      linkedDatabaseId?: ObjectId;
      syncedPropertyId?: string;
      syncedPropertyName?: string;
      relationLimit?: "single" | "multiple";
      displayProperties?: string[];
      twoWayRelation?: boolean;
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
      githubPrConfig?: GitHubPrConfig;
      specialProperty?: boolean;
      numberFormat?: string;
      decimalPlaces?: number;
      showAs?: "number" | "bar" | "ring";
      progressColor?: string;
      progressDivideBy?: number;
      showNumberText?: boolean;
    };
    userId: string;
    userEmail: string;
    userName: string;
    blockId?: string;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");
    const databaseSourcesCollection = db.collection<IDatabaseSource>("databaseSources");

    // Get database source directly
    const databaseSource = await databaseSourcesCollection.findOne({
      _id: new ObjectId(dataSourceId),
    });
    if (!databaseSource) {
      throw new Error("Database source not found");
    }

    // Get block for audit if blockId provided
    let block: IBlock | null = null;
    if (blockId) {
      block = await blocksColl.findOne({
        _id: new ObjectId(blockId),
      });
    }

    const propertyId = propertyData.propertyId;

    // Create property schema
    const propertySchema: PropertySchema = {
      name: propertyData.name,
      type: propertyData.type,
    };

    // Normalize option IDs to ensure they use proper ObjectId format
    // const normalizeOptions = (opts: PropertyOption[] | undefined): PropertyOption[] => {
    //   if (!opts) return [];
    //   return opts.map((opt) => {
    //     // Check if option ID is already in proper format (opt_ followed by ObjectId)
    //     if (opt.id && opt.id.startsWith("opt_") && opt.id.length > 4) {
    //       const idPart = opt.id.substring(4);
    //       // Validate if it's a valid ObjectId format (24 hex characters)
    //       if (/^[0-9a-fA-F]{24}$/.test(idPart)) {
    //         return opt; // Already has proper ID
    //       }
    //     }
    //     // Generate new proper ObjectId-based ID
    //     return {
    //       ...opt,
    //       id: `opt_${new ObjectId()}`,
    //     };
    //   });
    // };

    // // Set default options based on type
    // if (propertyData.type === "status") {
    //   propertySchema.options = [
    //     { id: `opt_${new ObjectId()}`, name: "In Progress", color: "green" },
    //     { id: `opt_${new ObjectId()}`, name: "Todo", color: "blue" },
    //     { id: `opt_${new ObjectId()}`, name: "Done", color: "gray" },
    //   ];
    // }
    // if (propertyData.type === "priority") {
    //   propertySchema.options = [
    //     { id: `opt_${new ObjectId()}`, name: "Low", color: "green" },
    //     { id: `opt_${new ObjectId()}`, name: "Medium", color: "yellow" },
    //     { id: `opt_${new ObjectId()}`, name: "High", color: "red" },
    //   ];
    // }
    // if (propertyData.type === "select" || propertyData.type === "multi_select") {
    //   propertySchema.options = normalizeOptions(propertyData.options);
    // }
    propertySchema.options = propertyData.options;
    // Relation-specific fields
    if (propertyData.type === "relation") {
      if (propertyData.linkedDatabaseId) {
        propertySchema.linkedDatabaseId = propertyData.linkedDatabaseId;
      }
      if (propertyData.syncedPropertyId) {
        propertySchema.syncedPropertyId = propertyData.syncedPropertyId;
      }
      if (propertyData.syncedPropertyName) {
        propertySchema.syncedPropertyName = propertyData.syncedPropertyName;
      }
      propertySchema.relationLimit = propertyData.relationLimit || "multiple";
      if (propertyData.displayProperties) {
        propertySchema.displayProperties = propertyData.displayProperties;
      }
    }
    if (propertyData.type === "rollup") {
      propertySchema.rollup = {
        relationPropertyId: propertyData.rollup?.relationPropertyId,
        relationDataSourceId: propertyData.rollup?.relationDataSourceId,
        targetPropertyId: propertyData.rollup?.targetPropertyId,
        calculation: propertyData.rollup?.calculation || { category: "original", value: "original" },
        selectedOptions: propertyData.rollup?.selectedOptions,
      };
      if (propertyData.numberFormat !== undefined) propertySchema.numberFormat = propertyData.numberFormat;
      if (propertyData.decimalPlaces !== undefined) propertySchema.decimalPlaces = propertyData.decimalPlaces;
      if (propertyData.showAs !== undefined) propertySchema.showAs = propertyData.showAs;
      if (propertyData.progressColor !== undefined) propertySchema.progressColor = propertyData.progressColor;
      if (propertyData.progressDivideBy !== undefined) propertySchema.progressDivideBy = propertyData.progressDivideBy;
      if (propertyData.showNumberText !== undefined) propertySchema.showNumberText = propertyData.showNumberText;
    }

    if (propertyData.githubPrConfig) {
      propertySchema.githubPrConfig = propertyData.githubPrConfig;
    }

    if (propertyData.specialProperty) {
      propertySchema.specialProperty = true;
    }

    propertySchema.showProperty = propertySchema.showProperty ?? true;

    // Check if this is the first property of this type
    const isDefault = await checkDefault(dataSourceId, propertyData.type, databaseSource);
    propertySchema.default = isDefault;

    // Update properties in IDatabaseSource (not in IVeiwDatabase)
    const updatedProperties = {
      ...databaseSource.properties,
      [propertyId]: propertySchema,
    };

    const updateResult = await databaseSourcesCollection.updateOne(
      { _id: new ObjectId(dataSourceId) },
      {
        $set: {
          properties: updatedProperties,
          updatedAt: new Date(),
        },
      },
    );

    if (updateResult.modifiedCount === 0) {
      throw new Error("Failed to add property to database source");
    }

    // Get updated source
    const updatedSource = await databaseSourcesCollection.findOne({
      _id: new ObjectId(dataSourceId),
    });
    if (!updatedSource) {
      throw new Error("Failed to retrieve updated database source");
    }

    // Formula support removed - no recalculation needed

    // Log audit for property creation (use block if available, otherwise use dataSource)
    if (block) {
      const blockValue = block.value as IVeiwDatabase;
      await AuditService.log({
        action: "CREATE",
        noteId: blockId || "",
        userId,
        userEmail,
        userName,
        noteName: propertyData.name,
        serviceType: "MONGODB",
        field: "property",
        oldValue: undefined,
        newValue: propertyData.name,
        workspaceId: block.workspaceId,
        organizationDomain: blockValue.organizationDomain || "",
      });
    }

    // Handle two-way relation: create reverse property in linked datasource
    let reverseProperty: PropertySchema | null = null;
    let reverseDataSource: IDatabaseSource | null = null;

    if (propertyData.type === "relation" && propertyData.linkedDatabaseId) {
      try {
        // Get the linked datas
        const linkedDataSource = await databaseSourcesCollection.findOne({
          _id: propertyData.linkedDatabaseId,
        });

        if (!linkedDataSource) {
          console.warn("Linked datasource not found for two-way relation");
        } else {
          // Get the current datasource title for the reverse property name
          const currentDataSourceTitle = databaseSource.title || "linkedDatasource";

          // Create reverse property schema
          const reversePropertyId = `prop_${new ObjectId()}`;
          const reversePropertySchema: PropertySchema = {
            name: currentDataSourceTitle, // Use current datasource title as property name
            type: "relation",
            linkedDatabaseId: new ObjectId(dataSourceId), // Swap: link back to current datasource
            syncedPropertyId: propertyId, // Reference to the original property
            syncedPropertyName: propertyData.name, // Reference to the original property name
            relationLimit: propertyData.relationLimit || "multiple",
            showProperty: propertyData.twoWayRelation || false,
            twoWayRelation: propertyData.twoWayRelation,
            formMetaData: {
              isFiedRequired: false,
              isDescriptionRequired: false,
              isLongAnswerRequired: false,
            },
          };

          // Check if this is the first relation property in the linked datasource
          const isDefaultReverse = await checkDefault(
            propertyData.linkedDatabaseId.toString(),
            "relation",
            linkedDataSource
          );
          reversePropertySchema.default = isDefaultReverse;

          // Update properties in linked datasource
          const updatedReverseProperties = {
            ...linkedDataSource.properties,
            [reversePropertyId]: reversePropertySchema,
          };

          const reverseUpdateResult = await databaseSourcesCollection.updateOne(
            { _id: propertyData.linkedDatabaseId },
            {
              $set: {
                properties: updatedReverseProperties,
                updatedAt: new Date(),
              },
            },
          );

          if (reverseUpdateResult.modifiedCount > 0) {
            // Get updated linked datasource
            const updatedLinkedSource = await databaseSourcesCollection.findOne({
              _id: propertyData.linkedDatabaseId,
            });

            if (updatedLinkedSource) {
              reverseProperty = reversePropertySchema;
              reverseDataSource = updatedLinkedSource;

              // Update the original property with synced property info
              propertySchema.syncedPropertyId = reversePropertyId;
              propertySchema.syncedPropertyName = currentDataSourceTitle;
              propertySchema.showProperty = true; // Original property is always visible

              // Update the original datasource with synced property info
              const finalUpdatedProperties = {
                ...updatedSource.properties,
                [propertyId]: propertySchema,
              };

              await databaseSourcesCollection.updateOne(
                { _id: new ObjectId(dataSourceId) },
                {
                  $set: {
                    properties: finalUpdatedProperties,
                    updatedAt: new Date(),
                  },
                },
              );

              // Get final updated source
              const finalUpdatedSource = await databaseSourcesCollection.findOne({
                _id: new ObjectId(dataSourceId),
              });

              if (finalUpdatedSource) {
                return {
                  property: propertySchema,
                  dataSource: finalUpdatedSource,
                  reverseProperty: reversePropertySchema,
                  reverseDataSource: updatedLinkedSource,
                };
              }
            }
          }
        }
      } catch (error) {
        console.error("Error creating two-way relation:", error);
        // Continue even if two-way relation fails - the main property is already created

      }
    }

    return {
      property: propertySchema,
      dataSource: updatedSource, // Return updated data source with new properties
      reverseProperty: reverseProperty || undefined,
      reverseDataSource: reverseDataSource || undefined,
    };
  },



  async updatePropertyValue({ dataSourceId, blockId, propertyId, value, currentUser, workspaceName }: {
    dataSourceId: string;
    blockId: string;
    propertyId: string;
    value: any;
    currentUser: IUser;
    workspaceName?: string;
  }) {
    if (!currentUser.name) {
      throw new Error("Current user name is required");
    }
    const client = await clientPromise();
    const db = client.db();
    const databaseSourcesCollection = db.collection<IDatabaseSource>("databaseSources");
    const blocksCollection = db.collection<IBlock>("blocks");
    const notifications = db.collection<INotification>("notifications");
    const users = db.collection<IUser>("users");

    // Get database source directly
    const databaseSource = await databaseSourcesCollection.findOne({
      _id: new ObjectId(dataSourceId),
    });
    if (!databaseSource) {
      throw new Error("Data source not found");
    }

    // Verify property exists in source
    const sourceProperties = databaseSource.properties || {};
    if (!sourceProperties[propertyId]) {
      throw new Error("Property not found in database source");
    }

    const propertySchema = databaseSource.properties?.[propertyId];

    // Find the block
    const block = await blocksCollection.findOne({
      _id: new ObjectId(blockId),
    });

    if (!block) {
      throw new Error("Block not found");
    }

    // Verify the block belongs to this data source (parentId check)
    if (block.parentId !== dataSourceId) {
      throw new Error("Block not found in this data source");
    }

    // Check if the property is of type "person"
    const propertyType = databaseSource.properties?.[propertyId]?.type;
    let valueToPersist: any = value;
    const additionalPropertyValues: Record<string, any> = {};

    if (propertyType === "github_pr") {
      const currentUserId = resolveUserIdForGithub(currentUser);
      console.log(
        `[GitHub PR] Updating PR property. Config:`,
        JSON.stringify(propertySchema?.githubPrConfig, null, 2),
      );
      const { persistedValue, statusUpdate } = await prepareGithubPrValue({
        rawValue: value,
        config: propertySchema?.githubPrConfig,
        currentUserId,
        sourceProperties,
      });
      valueToPersist = persistedValue;
      if (statusUpdate) {
        if (statusUpdate.propertyId !== propertyId) {
          console.log(
            `[GitHub PR] Applying status update: ${statusUpdate.propertyId} = "${statusUpdate.value}" (current propertyId: ${propertyId})`,
          );
          additionalPropertyValues[statusUpdate.propertyId] = statusUpdate.value;
          console.log(
            `[GitHub PR] Additional property values to apply:`,
            JSON.stringify(additionalPropertyValues, null, 2),
          );
        } else {
          console.log(
            `[GitHub PR] Status update skipped - same propertyId (${statusUpdate.propertyId} === ${propertyId}). Status property cannot be the same as GitHub PR property.`,
          );
        }
      } else {
        console.log(`[GitHub PR] No status update computed - check logs above for reason`);
      }
    }
    let notificationOnAssigned;

    // Cast block value to IPage to access properties
    const pageValue = block.value as IPage;
    const currentProperties = pageValue.databaseProperties || {};

    if (propertyType === "person") {
      let assignedUsers = currentProperties[propertyId] || [];

      // Normalize to array if a single object
      if (!Array.isArray(assignedUsers) && assignedUsers) {
        assignedUsers = [assignedUsers];
      }

      // Ensure value is an array
      const newValues = Array.isArray(value) ? value : [value];

      // Extract newly assigned users that weren't previously assigned
      const newlyAssignedUsers = newValues.filter(
        (user: any) => !assignedUsers.some((u: any) => u.userEmail === user.userEmail)
      );

      // Send email notifications only to newly assigned users
      console.log("newlyAssignedUsers", newlyAssignedUsers);
      newlyAssignedUsers.forEach((user: any) => {
        const subject = `📄 A Note Has Been Assigned To You`;
        // Use block title if available
        const title = pageValue.title || "New page";
        const link = `${process.env.MAIL_LINK}/${block._id}`;
        const assignTemplate = getNoteAssignationHtml(title, link, currentUser.name || "");

        sendEmail({
          to: user.userEmail,
          subject,
          html: assignTemplate,
        });
      });
      const notification: INotification = {
        sentTo: newlyAssignedUsers,
        createdAt: new Date(),
        noteId: block._id,
        noteTitle: pageValue.title || "New page",
        workspaceId: new ObjectId(block.workspaceId || ""),
        workspaceName: workspaceName || "",
        type: "ASSIGN",
        createdBy: {
          userId: new ObjectId(currentUser.id),
          userName: currentUser.name || "",
          userEmail: currentUser.email || "",
        },
      };
      notificationOnAssigned = notification;
      const result = await notifications.insertOne(notification);
      if (!result.insertedId) {
        throw new Error("Failed to add notification");
      }
      // Bulk update all users with notification - optimized to avoid N+1 queries
      if (newlyAssignedUsers.length > 0) {
        const bulkOps: AnyBulkWriteOperation<IUser>[] = newlyAssignedUsers.map((user) => ({
          updateOne: {
            filter: { _id: new ObjectId(String(user.userId)) },
            update: { $addToSet: { notifications: result.insertedId } },
          },
        }));
        await users.bulkWrite(bulkOps, { ordered: false });
      }


    }
    const updatedProperties = {
      ...currentProperties,
      ...additionalPropertyValues,
      [propertyId]: valueToPersist,
    };

    // Update block value
    const updatedValue = {
      ...pageValue,
      databaseProperties: updatedProperties,
    };

    const persistedValue = updatedProperties[propertyId];

    const updateResult = await blocksCollection.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date(),
        },
      },
    );

    if (updateResult.modifiedCount === 0) {
      throw new Error("Failed to update property value");
    }

    // Return updated page
    const updatedBlock = await blocksCollection.findOne({
      _id: new ObjectId(blockId),
    });
    if (!updatedBlock) {
      throw new Error("Failed to retrieve updated page");
    }
    //log audit for property value update
    // Updated to use AuditService
    try {
      await AuditService.log({
        action: 'UPDATE',
        noteId: blockId,
        userId: currentUser.id || "unknown", // Fallback if undefined
        userEmail: currentUser.email || "unknown",
        userName: currentUser.name || "Unknown",
        // Cast value safely to access title
        noteName: (updatedBlock?.value as any)?.title || "Property Update",
        serviceType: "MONGODB",
        field: "property-value",
        oldValue: undefined,
        newValue: persistedValue,
        workspaceId: undefined
      });
    } catch (e) { console.error("Audit log failed for updatePropertyValue", e); }

    return {
      page: updatedBlock, // Return the full block as page for now (or adjust return type if needed)
      propertyId,
      value: persistedValue,
      updatedAt: new Date(),
      notificationOnAssigned,
    };
  },

  async updatePropertySchema({ dataSourceId, propertyId, newName, type, options, showProperty, specialProperty,isVisibleInSlack, blockId, numberFormat, decimalPlaces, showAs, progressColor, progressDivideBy, showNumberText, formula, formulaReturnType, relationLimit, rollup, githubPrConfig, formMetaData, userId, userEmail, userName }: {
    dataSourceId: string;
    propertyId: string;
    newName: string;
    type: PropertyType;
    options?: PropertyOption[];
    showProperty?: boolean;
    specialProperty?: boolean;
    isVisibleInSlack?: boolean;
    blockId?: string;
    // Number property settings
    numberFormat?: string;
    decimalPlaces?: number;
    showAs?: "number" | "bar" | "ring";
    progressColor?: string;
    progressDivideBy?: number;
    showNumberText?: boolean;
    // Formula property settings
    formula?: string;
    formulaReturnType?: "text" | "number" | "boolean" | "date";
    // Relation property settings
    relationLimit?: "single" | "multiple";
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
    githubPrConfig?: GitHubPrConfig | null;
    // Form metadata
    formMetaData?: {
      isFiedRequired?: boolean;
      isDescriptionRequired?: boolean;
      Description?: string;
      isLongAnswerRequired?: boolean;
      checkboxLabel?: string;
    };
    userId?: string;
    userEmail?: string;
    userName?: string;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const databaseSourcesCollection = db.collection<IDatabaseSource>("databaseSources");
    const blocksCollection = db.collection<IBlock>("blocks");
    // Get database source directly
    const databaseSource = await databaseSourcesCollection.findOne({
      _id: new ObjectId(dataSourceId),
    });
    if (!databaseSource) {
      throw new Error("Data source not found");
    }

    // Verify property exists
    if (!databaseSource.properties || !databaseSource.properties[propertyId]) {
      throw new Error("Property not found in database source");
    }

    // Get view for audit if viewId provided
    let view: IBlock | null = null;
    if (blockId) {
      view = await blocksCollection.findOne({ _id: new ObjectId(blockId) });
    }

    const sourceProperties = databaseSource.properties || {};
    let isDefault = sourceProperties[propertyId]?.default;
    const defaultType = sourceProperties[propertyId]?.type;
    if (defaultType != type) {
      isDefault = await checkDefault(dataSourceId, type, databaseSource);
    }

    // Update property in source (not in view)
    const existingProperty = sourceProperties[propertyId];
    if (!existingProperty) {
      throw new Error("Property not found");
    }

    // Normalize option IDs to ensure they use proper ObjectId format
    const normalizeOptions = (opts: PropertyOption[] | undefined): PropertyOption[] => {
      if (!opts) return [];
      return opts.map((opt) => {
        // Check if option ID is already in proper format (opt_ followed by ObjectId)
        if (opt.id && opt.id.startsWith("opt_") && opt.id.length > 4) {
          const idPart = opt.id.substring(4);
          // Validate if it's a valid ObjectId format (24 hex characters)
          if (/^[0-9a-fA-F]{24}$/.test(idPart)) {
            return opt; // Already has proper ID
          }
        }
        // Generate new proper ObjectId-based ID
        return {
          ...opt,
          id: `opt_${new ObjectId()}`,
        };
      });
    };

    const normalizedOptions = options !== undefined
      ? normalizeOptions(options)
      : existingProperty.options
        ? normalizeOptions(existingProperty.options)
        : [];

    const updatedProperty: PropertySchema = {
      ...existingProperty,
      name: newName.trim(),
      type: type,
      default: isDefault,
      showProperty: showProperty ?? existingProperty.showProperty ?? true,
      isVisibleInSlack: isVisibleInSlack ?? existingProperty.isVisibleInSlack ?? true,
      options: normalizedOptions,
      specialProperty: specialProperty !== undefined ? specialProperty : existingProperty.specialProperty ?? false,
    };

    // Only add number property settings if type is "number"
    if (type === "number") {
      updatedProperty.numberFormat = numberFormat !== undefined ? numberFormat : existingProperty.numberFormat;
      updatedProperty.decimalPlaces = decimalPlaces !== undefined ? decimalPlaces : existingProperty.decimalPlaces;
      updatedProperty.showAs = showAs !== undefined ? showAs : existingProperty.showAs;
      updatedProperty.progressColor = progressColor !== undefined ? progressColor : existingProperty.progressColor;
      updatedProperty.progressDivideBy = progressDivideBy !== undefined ? progressDivideBy : existingProperty.progressDivideBy;
      updatedProperty.showNumberText = showNumberText !== undefined ? showNumberText : existingProperty.showNumberText;
    } else if (type !== "rollup") {
      // Remove number settings if type is not "number" or "rollup"
      // (rollup properties can also have number display settings)
      delete updatedProperty.numberFormat;
      delete updatedProperty.decimalPlaces;
      delete updatedProperty.showAs;
      delete updatedProperty.progressColor;
      delete updatedProperty.progressDivideBy;
      delete updatedProperty.showNumberText;
    }

    // Only add formula property settings if type is "formula"
    if (type === "formula") {
      updatedProperty.formula = formula !== undefined ? formula : existingProperty.formula;
      updatedProperty.formulaReturnType = formulaReturnType !== undefined ? formulaReturnType : existingProperty.formulaReturnType;
    } else {
      // Remove formula settings if type is not "formula"
      delete updatedProperty.formula;
      delete updatedProperty.formulaReturnType;
    }

    // Only add relation property settings if type is "relation"
    if (type === "relation") {
      updatedProperty.relationLimit = relationLimit !== undefined ? relationLimit : existingProperty.relationLimit;
    } else {
      // Remove relation settings if type is not "relation"
      delete updatedProperty.relationLimit;
    }

    // Only add rollup settings if type is "rollup"
    if (type === "rollup") {
      // Normalize calculation (might be old string format from database)
      const normalizeCalc = (calc: any): { category: "original" | "count" | "percent"; value: "original" | "all" | "per_group" | "empty" | "non_empty"; metadata?: any } => {
        if (!calc) return { category: "original", value: "original" };
        if (typeof calc === "object" && "category" in calc && "value" in calc) {
          return calc;
        }
        // Old string format - convert to object
        return { category: "original", value: "original" };
      };

      const normalizedRollupCalc = normalizeCalc(rollup?.calculation);
      const normalizedExistingCalc = normalizeCalc(existingProperty.rollup?.calculation);

      updatedProperty.rollup = {
        relationPropertyId: rollup?.relationPropertyId ?? existingProperty.rollup?.relationPropertyId,
        relationDataSourceId: rollup?.relationDataSourceId ?? existingProperty.rollup?.relationDataSourceId,
        targetPropertyId: rollup?.targetPropertyId ?? existingProperty.rollup?.targetPropertyId,
        calculation: rollup?.calculation ? normalizedRollupCalc : normalizedExistingCalc,
        selectedOptions: rollup?.selectedOptions ?? existingProperty.rollup?.selectedOptions,
      };

      // Rollup properties can have number display settings (for showing the calculated result)
      // Keep number settings if provided, otherwise preserve existing ones
      updatedProperty.numberFormat = numberFormat !== undefined ? numberFormat : existingProperty.numberFormat;
      updatedProperty.decimalPlaces = decimalPlaces !== undefined ? decimalPlaces : existingProperty.decimalPlaces;
      updatedProperty.showAs = showAs !== undefined ? showAs : existingProperty.showAs;
      updatedProperty.progressColor = progressColor !== undefined ? progressColor : existingProperty.progressColor;
      updatedProperty.progressDivideBy = progressDivideBy !== undefined ? progressDivideBy : existingProperty.progressDivideBy;
      updatedProperty.showNumberText = showNumberText !== undefined ? showNumberText : existingProperty.showNumberText;
    } else {
      delete updatedProperty.rollup;
    }

    if (githubPrConfig !== undefined) {
      if (githubPrConfig === null) {
        delete updatedProperty.githubPrConfig;
      } else {
        updatedProperty.githubPrConfig = githubPrConfig;
      }
    }

    // Handle form metadata
    if (formMetaData !== undefined) {
      const nextCheckboxLabel =
        formMetaData.checkboxLabel !== undefined
          ? (formMetaData.checkboxLabel?.trim?.() ?? "")
          : existingProperty.formMetaData?.checkboxLabel;

      updatedProperty.formMetaData = {
        isFiedRequired: formMetaData.isFiedRequired ?? existingProperty.formMetaData?.isFiedRequired ?? false,
        isDescriptionRequired: formMetaData.isDescriptionRequired ?? existingProperty.formMetaData?.isDescriptionRequired ?? false,
        Description: formMetaData.Description ?? existingProperty.formMetaData?.Description ?? "",
        isLongAnswerRequired: formMetaData.isLongAnswerRequired ?? existingProperty.formMetaData?.isLongAnswerRequired ?? false,
      };

      // Always set checkboxLabel if it was provided, even if empty
      if (formMetaData.checkboxLabel !== undefined) {
        updatedProperty.formMetaData.checkboxLabel = nextCheckboxLabel || "";
      } else if (existingProperty.formMetaData?.checkboxLabel !== undefined) {
        // Preserve existing checkboxLabel if not provided
        updatedProperty.formMetaData.checkboxLabel = existingProperty.formMetaData.checkboxLabel;
      }
    } else {
      // Preserve existing formMetaData if not provided
      if (existingProperty.formMetaData) {
        updatedProperty.formMetaData = existingProperty.formMetaData;
      }
    }

    const updatedProperties = {
      ...sourceProperties,
      [propertyId]: updatedProperty,
    };

    // Update IDatabaseSource (not IVeiwDatabase)
    const updateResult = await databaseSourcesCollection.updateOne(
      { _id: new ObjectId(dataSourceId) },
      {
        $set: {
          properties: updatedProperties,
          updatedAt: new Date(),
        },
      },
    );

    if (updateResult.modifiedCount === 0) {
      throw new Error("Failed to update property schema");
    }

    // Fetch the updated data source
    const updatedDataSource = await databaseSourcesCollection.findOne({
      _id: new ObjectId(dataSourceId),
    });
    if (!updatedDataSource) {
      throw new Error("Failed to retrieve updated data source");
    }

    // Audit Log: Update Property Schema
    if (userId && userEmail) {
      AuditService.log({
        action: "UPDATE",
        noteId: dataSourceId,
        userId: userId,
        userEmail: userEmail,
        userName: userName || "Unknown",
        noteName: updatedDataSource.title || "Database",
        serviceType: "MONGODB",
        field: "property",
        oldValue: undefined,
        newValue: JSON.stringify({ propertyId, newName, type }),
        workspaceId: String(updatedDataSource.workspaceId),
      }).catch(console.error);
    }

    // Log audit if view is available
    return {
      dataSource: updatedDataSource,
      propertyId,
      newName: newName.trim(),
      updatedAt: new Date(),
    };
  },
};
