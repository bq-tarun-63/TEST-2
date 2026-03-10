"use client";

import { postWithAuth } from "@/lib/api-helpers";
import type { IFilter, ISort, IPropertyVisibility, IGroup, IAdvancedFilterGroup, IChartSettings } from "@/models/types/ViewTypes";
import type { SortItem } from "@/types/board";
import { toast } from "sonner";
import type { LayoutSettings } from "@/types/board";

// Response type for settings API calls
interface SettingsResponse {
  success: boolean;
  message?: string;
  viewType?: {
    _id?: string;
    settings?: {
      sorts?: ISort[];
      group?: IGroup;
      propertyVisibility?: IPropertyVisibility[];
      filters?: IFilter[];
      advancedFilters?: IAdvancedFilterGroup[];
      chart?: IChartSettings;
      layout?: LayoutSettings;
    };
  };
  dataSource?: any;
  isError?: boolean;
}

// Convert advanced filter groups to IAdvancedFilterGroup format
export function convertAdvancedFilterGroupsToIAdvancedFilterGroup(groups: Array<{
  id: string;
  booleanOperator: "AND" | "OR";
  rules: Array<{
    id: string;
    propertyId: string | null;
    operator: string;
    value: string | string[];
  }>;
  groups?: Array<{
    id: string;
    booleanOperator: "AND" | "OR";
    rules: Array<{
      id: string;
      propertyId: string | null;
      operator: string;
      value: string | string[];
    }>;
    groups?: any[];
  }>;
}>): IAdvancedFilterGroup[] {
  // If empty array, return empty array (will clear advanced filters)
  if (!groups || groups.length === 0) {
    return [];
  }
  return groups
    .map((group) => ({
      id: group.id,
      booleanOperator: group.booleanOperator,
      rules: group.rules
        .filter((rule) => rule.propertyId !== null && rule.propertyId !== "")
        .map((rule) => ({
          propertyId: rule.propertyId!,
          operator: rule.operator,
          value: rule.value,
          booleanOperator: (rule as any).booleanOperator, // Preserve booleanOperator if present
          nestedPropertyId: (rule as any).nestedPropertyId, // Preserve sprint nested-filter field
        })),
      groups: group.groups ? convertAdvancedFilterGroupsToIAdvancedFilterGroup(group.groups) : undefined,
    }))
    .filter((group) => group.rules.length > 0 || (group.groups && group.groups.length > 0));
}


// function to Update filters for a specific view type
export async function updateFilters(
  viewTypeId: string,
  filters: Record<string, string[]>,
  blockId: string,
  setBoardFilters?: (viewTypeId: string, filters: Record<string, string[]>) => void,
  getFilters?: (blockId: string) => Record<string, string[]>,
  getBlock?: (blockId: string) => any,
  updateBlock?: (blockId: string, updates: any) => void,
): Promise<SettingsResponse> {

  let previousFilters: Record<string, string[]> | null = null;
  let previousBlock: any = null;

  try {
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    if (!blockId) {
      throw new Error("blockId is required");
    }

    // Get current block for optimistic update
    const currentBlock = getBlock ? getBlock(blockId) : null;
    if (currentBlock && updateBlock) {
      previousBlock = { ...currentBlock };
    }

    // Optimistic update: update filters context before API call
    if (setBoardFilters && getFilters) {
      previousFilters = getFilters(blockId) || {};
      setBoardFilters(viewTypeId, filters);
    }

    // Optimistic update: update board block settings in global context
    if (currentBlock && updateBlock) {
      const optimisticViewsTypes = (currentBlock.value?.viewsTypes || []).map((v: any) => {
        const vId = typeof v._id === "string" ? v._id : String(v._id);
        if (vId === viewTypeId) {
          return {
            ...v,
            settings: {
              ...v.settings,
              filters: Object.entries(filters).map(([propertyId, values]) => ({
                propertyId,
                value: values,
              })),
            },
          };
        }
        return v;
      });

      updateBlock(blockId, {
        ...currentBlock,
        value: {
          ...currentBlock.value,
          viewsTypes: optimisticViewsTypes,
        },
      });
    }

    const res = await postWithAuth<SettingsResponse>("/api/database/settings/filter", {
      viewTypeId,
      blockId,
      filters: Object.entries(filters).map(([propertyId, values]) => ({
        propertyId,
        value: Array.isArray(values) ? values : [values],
      })),
    });

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to update filters");
    }

    return res as SettingsResponse;
  } catch (error) {
    // Rollback optimistic updates on error

    // if (previousFilters !== null && setBoardFilters && viewTypeId) {
    //   setBoardFilters(viewTypeId, previousFilters);
    // }
    // if (previousBlock && updateBlock) {
    //   updateBlock(blockId, previousBlock);
    // }

    console.error("Error updating filters:", error);
    toast.error(error instanceof Error ? error.message : "Failed to update filters");
    throw error;
  }
}


// function to Update advanced filters for a specific view type with optimistic updates and rollback
export async function updateAdvancedFilters(
  viewTypeId: string,
  groups: Array<{
    id: string;
    booleanOperator: "AND" | "OR";
    rules: Array<{
      id: string;
      propertyId: string | null;
      operator: string;
      value: string | string[];
    }>;
    groups?: Array<{
      id: string;
      booleanOperator: "AND" | "OR";
      rules: Array<{
        id: string;
        propertyId: string | null;
        operator: string;
        value: string | string[];
      }>;
      groups?: any[];
    }>;
  }>,
  blockId: string,
  setAdvancedFilters?: (viewTypeId: string, groups: any[]) => void,
  getAdvancedFilters?: (blockId: string) => any[],
  getBlock?: (blockId: string) => any,
  updateBlock?: (blockId: string, updates: any) => void,
): Promise<SettingsResponse> {
  let previousAdvancedFilters: any[] | null = null;
  let previousBlock: any = null;

  try {
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    if (!blockId) {
      throw new Error("blockId is required");
    }

    // Get current block for optimistic update
    const currentBlock = getBlock ? getBlock(blockId) : null;
    if (currentBlock && updateBlock) {
      previousBlock = { ...currentBlock };
    }

    // Convert to IAdvancedFilterGroup format
    const advancedFiltersArray = convertAdvancedFilterGroupsToIAdvancedFilterGroup(groups);

    // Optimistic update: update advanced filters context before API call
    if (setAdvancedFilters && getAdvancedFilters) {
      previousAdvancedFilters = getAdvancedFilters(blockId) || [];
      setAdvancedFilters(viewTypeId, groups);
    }

    // Optimistic update: update board block settings in global context
    if (currentBlock && updateBlock) {
      const optimisticViewsTypes = (currentBlock.value?.viewsTypes || []).map((v: any) => {
        const vId = typeof v._id === "string" ? v._id : String(v._id);
        if (vId === viewTypeId) {
          return {
            ...v,
            settings: {
              ...v.settings,
              advancedFilters: advancedFiltersArray,
            },
          };
        }
        return v;
      });

      updateBlock(blockId, {
        ...currentBlock,
        value: {
          ...currentBlock.value,
          viewsTypes: optimisticViewsTypes,
        },
      });
    }

    const res = await postWithAuth<SettingsResponse>("/api/database/settings/filter", {
      viewTypeId,
      blockId,
      advancedFilters: advancedFiltersArray,
    });

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to update advanced filters");
    }

    return res as SettingsResponse;
  } catch (error) {
    // Rollback optimistic updates on error

    // if (previousAdvancedFilters !== null && setAdvancedFilters && viewTypeId) {
    //   setAdvancedFilters(viewTypeId, previousAdvancedFilters);
    // }
    // if (previousBlock && updateBlock) {
    //   updateBlock(blockId, previousBlock);
    // }

    console.error("Error updating advanced filters:", error);
    toast.error(error instanceof Error ? error.message : "Failed to update advanced filters");
    throw error;
  }
}


// function to Update sorts for a specific view type with optimistic updates and rollback
export async function updateSorts(
  viewTypeId: string,
  sorts: SortItem[],
  blockId: string,
  setBoardSortBy?: (viewTypeId: string, sorts: SortItem[]) => void,
  getSortBy?: (blockId: string) => SortItem[],
  getBlock?: (blockId: string) => any,
  updateBlock?: (blockId: string, updates: any) => void,
): Promise<SettingsResponse> {

  let previousSorts: SortItem[] | null = null;
  let previousBlock: any = null;

  try {
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    if (!blockId) {
      throw new Error("blockId is required");
    }

    // Get current block for optimistic update
    const currentBlock = getBlock ? getBlock(blockId) : null;
    if (currentBlock && updateBlock) {
      previousBlock = { ...currentBlock };
    }

    // Optimistic update: update sorts context before API call
    if (setBoardSortBy && getSortBy) {
      previousSorts = getSortBy(blockId) || [];
      setBoardSortBy(viewTypeId, sorts);
    }

    // Optimistic update: update board block settings in global context
    if (currentBlock && updateBlock) {
      const optimisticViewsTypes = (currentBlock.value?.viewsTypes || []).map((v: any) => {
        const vId = typeof v._id === "string" ? v._id : String(v._id);
        if (vId === viewTypeId) {
          return {
            ...v,
            settings: {
              ...v.settings,
              sorts: sorts.map((s) => ({
                propertyId: s.propertyId,
                direction: s.direction,
              })),
            },
          };
        }
        return v;
      });

      updateBlock(blockId, {
        ...currentBlock,
        value: {
          ...currentBlock.value,
          viewsTypes: optimisticViewsTypes,
        },
      });
    }

    const res = await postWithAuth<SettingsResponse>("/api/database/settings/sort", {
      viewTypeId,
      blockId,
      sorts: sorts.map((s) => ({
        propertyId: s.propertyId,
        direction: s.direction,
      })),
    });

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to update sorts");
    }

    return res as SettingsResponse;
  } catch (error) {
    // Rollback optimistic updates on error

    // if (previousSorts !== null && setBoardSortBy && viewTypeId) {
    //   setBoardSortBy(viewTypeId, previousSorts);
    // }
    // if (previousBlock && updateBlock) {
    //   updateBlock(blockId, previousBlock);
    // }

    console.error("Error updating sorts:", error);
    toast.error(error instanceof Error ? error.message : "Failed to update sorts");
    throw error;
  }
}


// function to update propety visibility with optimistic updates and rollback
export async function updatePropertyVisibility(
  viewTypeId: string,
  propertyIds: string[],
  blockId: string,
  setPropertyVisibility?: (viewTypeId: string, propertyIds: string[]) => void,
  getPropertyVisibility?: (blockId: string) => string[],
  getBlock?: (blockId: string) => any,
  updateBlock?: (blockId: string, updates: any) => void,
): Promise<SettingsResponse> {

  let previousVisibility: string[] | null = null;
  let previousBlock: any = null;

  try {
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    if (!blockId) {
      throw new Error("blockId is required");
    }

    // Get current block for optimistic update
    const currentBlock = getBlock ? getBlock(blockId) : null;
    if (currentBlock && updateBlock) {
      previousBlock = { ...currentBlock };
    }

    // Optimistic update: update property visibility context before API call
    if (
      setPropertyVisibility &&
      getPropertyVisibility
    ) {
      previousVisibility = getPropertyVisibility(blockId) || [];
      setPropertyVisibility(viewTypeId, propertyIds);
    }

    // Optimistic update: update board block settings in global context
    if (currentBlock && updateBlock) {
      const optimisticViewsTypes = (currentBlock.value?.viewsTypes || []).map((v: any) => {
        const vId = typeof v._id === "string" ? v._id : String(v._id);
        if (vId === viewTypeId) {
          return {
            ...v,
            settings: {
              ...v.settings,
              propertyVisibility: propertyIds.map((id) => ({ propertyId: id })),
            },
          };
        }
        return v;
      });

      updateBlock(blockId, {
        ...currentBlock,
        value: {
          ...currentBlock.value,
          viewsTypes: optimisticViewsTypes,
        },
      });
    }

    const res = await postWithAuth<SettingsResponse>("/api/database/settings/propertyVisibility", {
      blockId,
      viewTypeId,
      propertyVisibility: propertyIds.map((propertyId) => ({ propertyId })),
    });

    if ((res as { isError?: boolean })?.isError) {
      throw new Error(
        (res as { message?: string }).message || "Failed to update property visibility"
      );
    }

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to update property visibility");
    }

    return res as SettingsResponse;
  } catch (error) {
    // Rollback optimistic updates on error
    // if (
    //   previousVisibility !== null &&
    //   setPropertyVisibility &&
    //   viewTypeId
    // ) {
    //   setPropertyVisibility(viewTypeId, previousVisibility);
    // }

    // if (previousBlock && updateBlock) {
    //   updateBlock(blockId, previousBlock);
    // }

    console.error("Error updating property visibility:", error);
    toast.error(error instanceof Error ? error.message : "Failed to update property visibility");
    throw error;
  }
}


// function to Update group for a specific view type with optimistic updates and rollback
export async function updateGroup(
  viewTypeId: string,
  group: IGroup | null,
  blockId: string,
  setGroupBy?: (viewTypeId: string, propertyId: string | undefined) => void,
  getGroupBy?: (blockId: string) => string | undefined,
  getBlock?: (blockId: string) => any,
  updateBlock?: (blockId: string, updates: any) => void,
): Promise<SettingsResponse> {

  let previousGroupBy: string | undefined | null = null;
  let previousBlock: any = null;

  try {
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    if (!blockId) {
      throw new Error("blockId is required");
    }

    // Get current block for optimistic update
    const currentBlock = getBlock ? getBlock(blockId) : null;
    if (currentBlock && updateBlock) {
      previousBlock = { ...currentBlock };
    }

    // Optimistic update: update groupBy context before API call
    if (setGroupBy && getGroupBy) {
      previousGroupBy = getGroupBy(blockId);
      setGroupBy(viewTypeId, group?.propertyId);
    }

    // Optimistic update: update board block settings in global context
    if (currentBlock && updateBlock) {
      const optimisticViewsTypes = (currentBlock.value?.viewsTypes || []).map((v: any) => {
        const vId = typeof v._id === "string" ? v._id : String(v._id);
        if (vId === viewTypeId) {
          return {
            ...v,
            settings: {
              ...v.settings,
              group: group || null,
            },
          };
        }
        return v;
      });

      updateBlock(blockId, {
        ...currentBlock,
        value: {
          ...currentBlock.value,
          viewsTypes: optimisticViewsTypes,
        },
      });
    }

    const res = await postWithAuth<SettingsResponse>("/api/database/settings/group", {
      viewTypeId,
      blockId,
      group: group || null,
    });

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to update group");
    }

    return res as SettingsResponse;
  } catch (error) {
    // Rollback optimistic updates on error

    // if (previousGroupBy !== null && previousGroupBy !== undefined && setGroupBy && viewTypeId) {
    //   setGroupBy(viewTypeId, previousGroupBy);
    // }
    // if (previousBlock && updateBlock) {
    //   updateBlock(blockId, previousBlock);
    // }

    console.error("Error updating group:", error);
    toast.error(error instanceof Error ? error.message : "Failed to update group");
    throw error;
  }
}


//  *Update group settings for a specific view type using propertyId with optimistic updates and rollback
export async function updateGroupByPropertyId(
  viewTypeId: string,
  propertyId: string | undefined | null,
  blockId: string,
  sortDirection?: "ascending" | "descending",
  hideEmptyGroups?: boolean,
  colorColumn?: boolean,
  setGroupBy?: (viewTypeId: string, propertyId: string | undefined) => void,
  getGroupBy?: (blockId: string) => string | undefined,
  getBlock?: (blockId: string) => any,
  updateBlock?: (blockId: string, updates: any) => void,
): Promise<SettingsResponse> {

  const group: IGroup | null = propertyId
    ? {
      propertyId,
      sortDirection,
      hideEmptyGroups,
      colorColumn: colorColumn,
    }
    : null;
  return updateGroup(viewTypeId, group, blockId, setGroupBy, getGroupBy, getBlock, updateBlock);
}


/**
 * Toggle lock status for a specific view type
 * @param viewTypeId - The ID of the view type
 * @param isLocked - boolean indicating if the view should be locked
 * @returns Promise<SettingsResponse & { isLocked?: boolean }>
 */
export async function toggleLock(
  viewTypeId: string,
  isLocked: boolean
): Promise<SettingsResponse & { isLocked?: boolean }> {
  try {
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    const res = await postWithAuth<SettingsResponse & { isLocked?: boolean }>(
      "/api/database/settings/lock",
      {
        viewTypeId,
        isLocked,
      }
    );

    if ((res as { isError?: boolean })?.isError) {
      throw new Error((res as { message?: string }).message || "Failed to toggle lock");
    }

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to toggle lock");
    }

    return res as SettingsResponse & { isLocked?: boolean };
  } catch (error) {
    console.error("Error toggling lock:", error);
    toast.error(error instanceof Error ? error.message : "Failed to toggle lock");
    throw error;
  }
}


// function to Update chart settings for a specific view type with optimistic updates and rollback
export async function updateChartSettings(
  viewTypeId: string,
  chartSettings: IChartSettings,
  blockId: string,
  setChartSettings?: (viewTypeId: string, chartSettings: IChartSettings | undefined) => void,
  getChartSettings?: (blockId: string) => IChartSettings | undefined,
  getBlock?: (blockId: string) => any,
  updateBlock?: (blockId: string, updates: any) => void,
): Promise<SettingsResponse> {

  let previousChartSettings: IChartSettings | undefined | null = null;
  let previousBlock: any = null;

  try {
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    if (!blockId) {
      throw new Error("blockId is required");
    }

    // Get current block for optimistic update
    const currentBlock = getBlock ? getBlock(blockId) : null;
    if (currentBlock && updateBlock) {
      previousBlock = { ...currentBlock };
    }

    // Optimistic update: update chart settings context before API call
    if (setChartSettings && getChartSettings) {
      previousChartSettings = getChartSettings(blockId);
      setChartSettings(viewTypeId, chartSettings);
    }

    // Optimistic update: update board block settings in global context
    if (currentBlock && updateBlock) {
      const optimisticViewsTypes = (currentBlock.value?.viewsTypes || []).map((v: any) => {
        const vId = typeof v._id === "string" ? v._id : String(v._id);
        if (vId === viewTypeId) {
          return {
            ...v,
            settings: {
              ...v.settings,
              chart: chartSettings,
            },
          };
        }
        return v;
      });

      updateBlock(blockId, {
        ...currentBlock,
        value: {
          ...currentBlock.value,
          viewsTypes: optimisticViewsTypes,
        },
      });
    }

    const res = await postWithAuth<SettingsResponse>("/api/database/settings/chart", {
      viewTypeId,
      blockId,
      chartSettings,
    });

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to update chart settings");
    }

    return res as SettingsResponse;
  } catch (error) {
    // Rollback optimistic updates on error

    // if (previousChartSettings !== null && setChartSettings && viewTypeId) {
    //   setChartSettings(viewTypeId, previousChartSettings);
    // }
    // if (previousBlock && updateBlock) {
    //   updateBlock(blockId, previousBlock);
    // }

    console.error("Error updating chart settings:", error);
    toast.error(error instanceof Error ? error.message : "Failed to update chart settings");
    throw error;
  }
}


// function to Update layout settings for a specific view type with optimistic updates and rollback
export async function updateLayoutSettings(
  viewTypeId: string,
  layoutSettings: Partial<LayoutSettings>,
  blockId: string,
  setLayoutSettings?: (viewTypeId: string, layoutSettings: LayoutSettings | undefined) => void,
  getLayoutSettings?: (blockId: string) => LayoutSettings | undefined,
  getBlock?: (blockId: string) => any,
  updateBlock?: (blockId: string, updates: any) => void,
): Promise<SettingsResponse> {
  let previousLayoutSettings: LayoutSettings | undefined | null = null;
  let previousBlock: any = null;

  try {
    if (!viewTypeId) {
      throw new Error("View type ID is required");
    }

    if (!blockId) {
      throw new Error("blockId is required");
    }

    // Get current block for optimistic update
    const currentBlock = getBlock ? getBlock(blockId) : null;
    if (currentBlock && updateBlock) {
      previousBlock = { ...currentBlock };
    }

    // Optimistic update: update layout settings context before API call
    if (setLayoutSettings && getLayoutSettings) {
      previousLayoutSettings = getLayoutSettings(blockId);
      setLayoutSettings(viewTypeId, { ...previousLayoutSettings, ...layoutSettings });
    }

    // Optimistic update: update board block settings in global context
    if (currentBlock && updateBlock) {
      const optimisticViewsTypes = (currentBlock.value?.viewsTypes || []).map((v: any) => {
        const vId = typeof v._id === "string" ? v._id : String(v._id);
        if (vId === viewTypeId) {
          return {
            ...v,
            settings: {
              ...v.settings,
              layout: { ...(v.settings?.layout || {}), ...layoutSettings },
            },
          };
        }
        return v;
      });

      updateBlock(blockId, {
        ...currentBlock,
        value: {
          ...currentBlock.value,
          viewsTypes: optimisticViewsTypes,
        },
      });
    }

    const res = await postWithAuth<SettingsResponse>("/api/database/settings/layout", {
      viewTypeId,
      blockId,
      layoutSettings,
    });

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to update layout settings");
    }

    return res as SettingsResponse;
  } catch (error) {
    console.error("Error updating layout settings:", error);
    toast.error(error instanceof Error ? error.message : "Failed to update layout settings");
    throw error;
  }
}


/**
 * Export all update functions for convenience
 */
export const DatabaseSettingsAPI = {
  updateFilters,
  updateSorts,
  updatePropertyVisibility,
  updateGroup,
  updateGroupByPropertyId,
  toggleLock,
  updateChartSettings,
  updateLayoutSettings,
};


