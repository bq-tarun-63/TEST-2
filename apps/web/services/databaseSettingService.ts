import clientPromise from "@/lib/mongoDb/mongodb";
import { ObjectId } from "mongodb";
import { IViewType, IPropertyVisibility, ISort, IFilter, IGroup, IAdvancedFilterGroup, IChartSettings, ILayoutSettings } from "@/models/types/ViewTypes";
import { IBlock, IVeiwDatabase } from "@/models/types/Block";
export const DatabaseSettingService = {
  /**
   * Update property visibility for a specific view type
   * @param blockId - The ID of the collection_view block
   * @param viewTypeId - The ID of the view type to update
   * @param propertyVisibility - Array of property visibility configurations
   * @returns Updated view type
   */
  async updatePropertyVisibility({
    blockId,
    viewTypeId,
    propertyVisibility,
  }: {
    blockId: string;
    viewTypeId: string;
    propertyVisibility: IPropertyVisibility[];
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) {
      throw new Error("Block ID is required");
    }
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    // Validate propertyVisibility
    if (!Array.isArray(propertyVisibility)) {
      throw new Error("Property visibility must be an array");
    }

    const viewTypeObjectId = new ObjectId(viewTypeId);

    // Get the collection_view block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      blockType: 'collection_view'
    });

    if (!block) {
      throw new Error("View block not found");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes || [];

    // Find the viewType index
    const viewTypeIndex = viewTypes.findIndex((vt: any) => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (viewTypeIndex === -1) {
      throw new Error("View type not found in block");
    }

    // Update the specific viewType's property visibility
    const updatedViewTypes = [...viewTypes];
    const existingViewType = updatedViewTypes[viewTypeIndex];
    if (!existingViewType) throw new Error("View type not found");
    const existingSettings = existingViewType.settings || {};

    updatedViewTypes[viewTypeIndex] = {
      ...existingViewType,
      settings: {
        ...existingSettings,
        propertyVisibility: propertyVisibility,
      }
    };

    // Update block value
    const updatedValue = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    // Update the block
    const updateResult = await blocksColl.findOneAndUpdate(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    );

    if (!updateResult) {
      throw new Error("Failed to update property visibility");
    }

    // Return the updated viewType
    // Return the updated viewType
    const updatedBlock = updateResult.value as IVeiwDatabase;
    const updatedViewType = updatedBlock.viewsTypes[viewTypeIndex];

    return {
      success: true,
      viewType: updatedViewType,
    };
  },

  /**
   * Update sorts for a specific view type
   * @param blockId - The ID of the collection_view block
   * @param viewTypeId - The ID of the view type to update
   * @param sorts - Array of sort configurations
   * @returns Updated view type
   */
  async updateSorts({
    blockId,
    viewTypeId,
    sorts,
  }: {
    blockId: string;
    viewTypeId: string;
    sorts: ISort[];
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) {
      throw new Error("Block ID is required");
    }
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    // Validate sorts
    if (!Array.isArray(sorts)) {
      throw new Error("Sorts must be an array");
    }

    const viewTypeObjectId = new ObjectId(viewTypeId);

    // Get the collection_view block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      blockType: 'collection_view'
    });

    if (!block) {
      throw new Error("View block not found");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes || [];

    // Find the viewType index
    const viewTypeIndex = viewTypes.findIndex((vt: any) => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (viewTypeIndex === -1) {
      throw new Error("View type not found in block");
    }

    // Update the specific viewType's sort settings
    const updatedViewTypes = [...viewTypes];
    const existingViewType = updatedViewTypes[viewTypeIndex];
    if (!existingViewType) throw new Error("View type not found");
    const existingSettings = existingViewType.settings || {};

    updatedViewTypes[viewTypeIndex] = {
      ...existingViewType,
      settings: {
        ...existingSettings,
        sorts: sorts,
      }
    };

    // Update block value
    const updatedValue = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    // Update the block
    const updateResult = await blocksColl.findOneAndUpdate(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    );

    if (!updateResult) {
      throw new Error("Failed to update sorts");
    }

    // Return the updated viewType
    // Return the updated viewType
    const updatedBlock = updateResult.value as IVeiwDatabase;
    const updatedViewType = updatedBlock.viewsTypes[viewTypeIndex];

    return {
      success: true,
      viewType: updatedViewType,
    };
  },



  /**
   * Toggle lock status for a specific view type
   * @param blockId - The ID of the collection_view block
   * @param viewTypeId - The ID of the view type to toggle lock
   * @param isLocked - Optional: explicitly set lock state. If not provided, toggles current state
   * @returns Updated view type
   */
  async toggleLock({
    blockId,
    viewTypeId,
    isLocked,
  }: {
    blockId: string;
    viewTypeId: string;
    isLocked?: boolean;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) {
      throw new Error("Block ID is required");
    }
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    const viewTypeObjectId = new ObjectId(viewTypeId);

    // Get the collection_view block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      blockType: 'collection_view'
    });

    if (!block) {
      throw new Error("View block not found");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes || [];

    // Find the viewType index
    const viewTypeIndex = viewTypes.findIndex((vt: any) => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (viewTypeIndex === -1) {
      throw new Error("View type not found in block");
    }

    // Determine new lock state
    const updatedViewTypes = [...viewTypes];
    const existingViewType = updatedViewTypes[viewTypeIndex];
    if (!existingViewType) throw new Error("View type not found");
    const newLockState =
      isLocked !== undefined ? isLocked : !existingViewType.isLocked;

    // Update the specific viewType's lock status
    updatedViewTypes[viewTypeIndex] = {
      ...existingViewType,
      isLocked: newLockState,
    };

    // Update block value
    const updatedValue = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    // Update the block
    const updateResult = await blocksColl.findOneAndUpdate(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    );

    if (!updateResult) {
      throw new Error("Failed to toggle lock");
    }

    // Return the updated viewType
    // Return the updated viewType
    const updatedBlock = updateResult.value as IVeiwDatabase;
    const updatedViewType = updatedBlock.viewsTypes[viewTypeIndex] as IViewType;

    return {
      success: true,
      viewType: updatedViewType,
      isLocked: updatedViewType.isLocked,
    };
  },

  /**
   * Update filters for a specific view type
   * @param viewTypeId - The ID of the view type to update
   * @param filters - Array of filter configurations
   * @returns Updated view type
   */
  async updateFilters({
    blockId,
    viewTypeId,
    filters,
  }: {
    blockId: string;
    viewTypeId: string;
    filters: IFilter[];
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) {
      throw new Error("Block ID is required");
    }
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    // Validate filters
    if (!Array.isArray(filters)) {
      throw new Error("Filters must be an array");
    }

    const viewTypeObjectId = new ObjectId(viewTypeId);

    // Get the collection_view block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      blockType: 'collection_view'
    });

    if (!block) {
      throw new Error("View block not found");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes || [];

    // Find the viewType index
    const viewTypeIndex = viewTypes.findIndex((vt: any) => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (viewTypeIndex === -1) {
      throw new Error("View type not found in block");
    }

    // Regular filters only - advanced filters are stored separately in advancedFilters field
    // Ensure no advanced filters (with isAdvanced flag) are in the regular filters array
    const mergedFilters = filters.filter((f: IFilter) => !f.isAdvanced);

    // Update the specific viewType's filter settings
    const updatedViewTypes = [...viewTypes];
    const existingViewType = updatedViewTypes[viewTypeIndex];
    if (!existingViewType) throw new Error("View type not found");
    const existingSettings = existingViewType.settings || {};

    updatedViewTypes[viewTypeIndex] = {
      ...existingViewType,
      settings: {
        ...existingSettings,
        filters: mergedFilters
      }
    };

    // Update block value
    const updatedValue = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    // Update the block
    const updateResult = await blocksColl.findOneAndUpdate(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    );

    if (!updateResult) {
      throw new Error("Failed to update filters");
    }

    // Return the updated viewType
    // Return the updated viewType
    const updatedBlock = updateResult.value as IVeiwDatabase;
    const updatedViewType = updatedBlock.viewsTypes[viewTypeIndex];

    return {
      success: true,
      viewType: updatedViewType,
    };
  },

  /**
   * Update advanced filters for a specific view type
   * @param viewTypeId - The ID of the view type to update
   * @param advancedFilters - Array of advanced filter groups
   * @returns Updated view type
   */
  async updateAdvancedFilters({
    blockId,
    viewTypeId,
    advancedFilters,
  }: {
    blockId: string;
    viewTypeId: string;
    advancedFilters: IAdvancedFilterGroup[];
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) throw new Error("Block ID is required");
    if (!viewTypeId) throw new Error("View type ID is required");
    if (!Array.isArray(advancedFilters)) throw new Error("Advanced filters must be an array");

    // Get the collection_view block
    const block = await blocksColl.findOne({ _id: new ObjectId(blockId) });
    if (!block || block.blockType !== "collection_view") {
      throw new Error("View block not found or block type is not collection_view");
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

    if (viewTypeIndex === -1) {
      throw new Error("View type not found in block");
    }

    // Merge with existing settings
    const existingViewType = viewTypes[viewTypeIndex]!;
    const existingSettings = existingViewType.settings || {};
    const updatedSettings = {
      ...existingSettings,
      advancedFilters: advancedFilters,
    };

    const updatedViewTypes = [...viewTypes];
    updatedViewTypes[viewTypeIndex] = {
      ...existingViewType,
      settings: updatedSettings
    };

    const updatedValue: IVeiwDatabase = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    const updateResult = await blocksColl.findOneAndUpdate(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    );

    if (!updateResult) {
      throw new Error("Failed to update advanced filters");
    }

    const updatedBlockValue = updateResult.value as IVeiwDatabase;
    const updatedViewType = updatedBlockValue.viewsTypes?.[viewTypeIndex];

    return {
      success: true,
      viewType: updatedViewType,
    };
  },

  /**
   * Update group settings for a specific view type
   * @param viewTypeId - The ID of the view type to update
   * @param group - Group configuration or null to remove grouping
   * @returns Updated view type
   */
  /**
   * Update group settings for a specific view type
   * @param blockId - The ID of the collection_view block
   * @param viewTypeId - The ID of the view type to update
   * @param group - Group configuration or null to remove grouping
   * @returns Updated view type
   */
  async updateGroup({
    blockId,
    viewTypeId,
    group,
  }: {
    blockId: string;
    viewTypeId: string;
    group: IGroup | null;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) {
      throw new Error("Block ID is required");
    }
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    const viewTypeObjectId = new ObjectId(viewTypeId);

    // Get the collection_view block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      blockType: 'collection_view'
    });

    if (!block) {
      throw new Error("View block not found");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes || [];

    // Find the viewType index
    const viewTypeIndex = viewTypes.findIndex((vt: any) => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (viewTypeIndex === -1) {
      throw new Error("View type not found in block");
    }

    // Update the specific viewType's group settings
    const updatedViewTypes = [...viewTypes];
    const existingViewType = updatedViewTypes[viewTypeIndex];
    if (!existingViewType) throw new Error("View type not found");
    const existingSettings = existingViewType.settings || {};

    updatedViewTypes[viewTypeIndex] = {
      ...existingViewType,
      settings: {
        ...existingSettings,
        group: group || undefined, // Set to undefined if null to remove grouping
      }
    };

    // Update block value
    const updatedValue = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    // Update the block
    const updateResult = await blocksColl.findOneAndUpdate(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    );

    if (!updateResult) {
      throw new Error("Failed to update group");
    }

    // Return the updated viewType
    // Return the updated viewType
    const updatedBlock = updateResult.value as IVeiwDatabase;
    const updatedViewType = updatedBlock.viewsTypes[viewTypeIndex];

    return {
      success: true,
      viewType: updatedViewType,
    };
  },

  /**
   * Get viewType settings by ID
   * @param blockId - The ID of the collection_view block
   * @param viewTypeId - The ID of the view type to retrieve
   * @returns View type with settings
   */
  async getViewTypeById({ blockId, viewTypeId }: { blockId: string; viewTypeId: string }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) {
      throw new Error("Block ID is required");
    }
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    const viewTypeObjectId = new ObjectId(viewTypeId);

    // Get the collection_view block
    const block = await blocksColl.findOne({
      _id: new ObjectId(blockId),
      blockType: 'collection_view'
    });

    if (!block) {
      throw new Error("View block not found");
    }

    const viewValue = block.value as IVeiwDatabase;
    const viewTypes = viewValue.viewsTypes || [];

    // Find the viewType
    const viewType = viewTypes.find((vt: any) => {
      if (!vt._id) return false;
      const vtId = typeof vt._id === "string" ? new ObjectId(vt._id) : vt._id;
      return vtId.equals(viewTypeObjectId);
    });

    if (!viewType) {
      throw new Error("View type not found");
    }

    return {
      success: true,
      viewType: {
        _id: viewType._id,
        settings: viewType.settings || {},
        isLocked: viewType.isLocked || false,
      },
    };
  },

  /**
   * Update chart settings for a specific view type
   * @param viewTypeId - The ID of the view type to update
   * @param chartSettings - Chart configuration settings
   * @returns Updated view type
   */
  async updateChartSettings({
    blockId,
    viewTypeId,
    chartSettings,
  }: {
    blockId: string;
    viewTypeId: string;
    chartSettings: IChartSettings;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) throw new Error("Block ID is required");
    if (!viewTypeId) throw new Error("View type ID is required");

    // Get the collection_view block
    const block = await blocksColl.findOne({ _id: new ObjectId(blockId) });
    if (!block || block.blockType !== "collection_view") {
      throw new Error("View block not found or block type is not collection_view");
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

    if (viewTypeIndex === -1) {
      throw new Error("View type not found in block");
    }

    // Merge with existing settings
    const existingViewType = viewTypes[viewTypeIndex];
    if (!existingViewType) throw new Error("View type not found");

    const existingSettings = existingViewType.settings || {};
    const updatedSettings = {
      ...existingSettings,
      chart: chartSettings
    };

    const updatedViewTypes = [...viewTypes];
    updatedViewTypes[viewTypeIndex] = {
      ...existingViewType,
      settings: updatedSettings
    };

    const updatedValue: IVeiwDatabase = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    const updateResult = await blocksColl.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      }
    );

    const updatedBlock = await blocksColl.findOne({ _id: new ObjectId(blockId) });
    if (!updatedBlock) {
      throw new Error("Block not found after update");
    }

    const updatedViewType = (updatedBlock.value as IVeiwDatabase)?.viewsTypes?.[viewTypeIndex];

    return {
      success: true,
      viewType: updatedViewType,
    };
  },

  /**
   * Update layout settings for a specific view type
   * @param viewTypeId - The ID of the view type to update
   * @param layoutSettings - Layout configuration settings (partial update)
   * @returns Updated view type
   */
  async updateLayoutSettings({
    blockId,
    viewTypeId,
    layoutSettings,
  }: {
    blockId: string;
    viewTypeId: string;
    layoutSettings: Partial<ILayoutSettings>;
  }) {
    const client = await clientPromise();
    const db = client.db();
    const blocksColl = db.collection<IBlock>("blocks");

    // Validate inputs
    if (!blockId) throw new Error("Block ID is required");
    if (!viewTypeId) throw new Error("View type ID is required");

    // Get the collection_view block
    const block = await blocksColl.findOne({ _id: new ObjectId(blockId) });
    if (!block || block.blockType !== "collection_view") {
      throw new Error("View block not found or block type is not collection_view");
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

    if (viewTypeIndex === -1) {
      throw new Error("View type not found in block");
    }

    // Merge with existing settings
    const existingViewType = viewTypes[viewTypeIndex];
    if (!existingViewType) throw new Error("View type not found");

    const existingSettings = existingViewType.settings || {};
    const existingLayout = existingSettings.layout || {};

    // Merge existing layout with new layout settings
    const updatedLayout = {
      ...existingLayout,
      ...layoutSettings
    };

    const updatedSettings = {
      ...existingSettings,
      layout: updatedLayout,
    };

    const updatedViewTypes = [...viewTypes];
    updatedViewTypes[viewTypeIndex] = {
      ...existingViewType,
      settings: updatedSettings
    };

    const updatedValue: IVeiwDatabase = {
      ...viewValue,
      viewsTypes: updatedViewTypes
    };

    const updateResult = await blocksColl.updateOne(
      { _id: new ObjectId(blockId) },
      {
        $set: {
          value: updatedValue,
          updatedAt: new Date()
        }
      }
    );

    const updatedBlock = await blocksColl.findOne({ _id: new ObjectId(blockId) });
    if (!updatedBlock) {
      throw new Error("Block not found after update");
    }

    const updatedViewType = (updatedBlock.value as IVeiwDatabase)?.viewsTypes?.[viewTypeIndex];

    return {
      success: true,
      viewType: updatedViewType,
    };
  },
};
