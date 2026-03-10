"use client";

import { postWithAuth } from "@/lib/api-helpers";
import { toast } from "sonner";

/**
 * Update property schema with optimistic updates and rollback
 * @param payload - Property schema update payload
 * @param getDataSource - Function to get current data source
 * @param updateDataSource - Function to update data source optimistically
 * @param setDataSource - Function to set data source (for rollback and response update)
 * @returns Promise with updated data source
 */
export async function updatePropertySchema(
  payload: {
    dataSourceId: string;
    blockId: string;
    propertyId: string;
    newName: string;
    type: string;
    options?: any[];
    showProperty?: boolean;
    isVisibleInSlack?: boolean;
    formula?: string;
    formulaReturnType?: string;
    relationLimit?: "single" | "multiple";
    rollup?: any;
    githubPrConfig?: any;
    numberFormat?: string;
    decimalPlaces?: number;
    showAs?: "number" | "bar" | "ring";
    progressColor?: string;
    progressDivideBy?: number;
    showNumberText?: boolean;
    viewId?: string;
    formMetaData?: any;
  },
  getDataSource?: (dataSourceId: string) => any,
  updateDataSource?: (dataSourceId: string, updates: any) => void,
  setDataSource?: (dataSourceId: string, dataSource: any) => void,
): Promise<{ success: boolean; dataSource?: any; message?: string }> {
  let previousDataSource: any = null;

  try {
    if (!payload.dataSourceId) {
      throw new Error("Data source ID is required");
    }

    if (!payload.blockId) {
      throw new Error("Block ID is required");
    }

    // Get current data source for optimistic update
    if (getDataSource && updateDataSource) {
      const currentDataSource = getDataSource(payload.dataSourceId);
      if (currentDataSource) {
        previousDataSource = { ...currentDataSource };

        // Build updated property
        const currentProperty = currentDataSource.properties?.[payload.propertyId] || {};
        const updatedProperty = {
          ...currentProperty,
          name: payload.newName,
          type: payload.type,
          ...(payload.options !== undefined && { options: payload.options }),
          ...(payload.showProperty !== undefined && { showProperty: payload.showProperty }),
          ...(payload.isVisibleInSlack !== undefined && { isVisibleInSlack: payload.isVisibleInSlack }),
          ...(payload.formula !== undefined && { formula: payload.formula }),
          ...(payload.formulaReturnType !== undefined && { formulaReturnType: payload.formulaReturnType }),
          ...(payload.relationLimit !== undefined && { relationLimit: payload.relationLimit }),
          ...(payload.rollup !== undefined && { rollup: payload.rollup }),
          ...(payload.githubPrConfig !== undefined && { githubPrConfig: payload.githubPrConfig }),
          ...(payload.numberFormat !== undefined && { numberFormat: payload.numberFormat }),
          ...(payload.decimalPlaces !== undefined && { decimalPlaces: payload.decimalPlaces }),
          ...(payload.showAs !== undefined && { showAs: payload.showAs }),
          ...(payload.progressColor !== undefined && { progressColor: payload.progressColor }),
          ...(payload.progressDivideBy !== undefined && { progressDivideBy: payload.progressDivideBy }),
          ...(payload.showNumberText !== undefined && { showNumberText: payload.showNumberText }),
          ...(payload.formMetaData !== undefined && { formMetaData: payload.formMetaData }),
        };

        // Optimistic update: update data source in context first
        const updatedProps = {
          ...(currentDataSource.properties || {}),
          [payload.propertyId]: updatedProperty,
        };
        updateDataSource(payload.dataSourceId, { properties: updatedProps });
      }
    }

    // Build API request body
    const requestBody: any = {
      dataSourceId: payload.dataSourceId,
      blockId: payload.blockId,
      propertyId: payload.propertyId,
      newName: payload.newName,
      type: payload.type,
      options: payload.options || [],
      showProperty: payload.showProperty ?? true,
      isVisibleInSlack: payload.isVisibleInSlack ?? true,
    };

    // Add optional fields
    if (payload.formula !== undefined) requestBody.formula = payload.formula;
    if (payload.formulaReturnType !== undefined) requestBody.formulaReturnType = payload.formulaReturnType;
    if (payload.relationLimit !== undefined) requestBody.relationLimit = payload.relationLimit;
    if (payload.rollup !== undefined) requestBody.rollup = payload.rollup;
    if (payload.githubPrConfig !== undefined) requestBody.githubPrConfig = payload.githubPrConfig;
    if (payload.numberFormat !== undefined) requestBody.numberFormat = payload.numberFormat;
    if (payload.decimalPlaces !== undefined) requestBody.decimalPlaces = payload.decimalPlaces;
    if (payload.showAs !== undefined) requestBody.showAs = payload.showAs;
    if (payload.progressColor !== undefined) requestBody.progressColor = payload.progressColor;
    if (payload.progressDivideBy !== undefined) requestBody.progressDivideBy = payload.progressDivideBy;
    if (payload.showNumberText !== undefined) requestBody.showNumberText = payload.showNumberText;
    if (payload.viewId !== undefined) requestBody.viewId = payload.viewId;
    if (payload.formMetaData !== undefined) requestBody.formMetaData = payload.formMetaData;

    // Call API
    const res = await postWithAuth<{ success: boolean; dataSource?: any; isError?: boolean; message?: string }>(
      "/api/database/updatePropertySchema",
      requestBody
    );

    if (!(res as { success?: boolean }).success) {
      throw new Error("Failed to update property schema");
    }

    // Update data source in context from API response

    // if (setDataSource && (res as { dataSource?: any }).dataSource) {
    //   const ds = (res as { dataSource: any }).dataSource;
    //   const dsId = ds._id ? (typeof ds._id === "string" ? ds._id : ds._id.toString()) : payload.dataSourceId;
    //   if (dsId) {
    //     setDataSource(dsId, ds);
    //   }
    // }

    return res as { success: boolean; dataSource?: any; message?: string };
  } catch (error) {
    // Rollback optimistic update on error
    // if (previousDataSource && setDataSource) {
    //   setDataSource(payload.dataSourceId, previousDataSource);
    // }

    console.error("Error updating property schema:", error);
    throw error;
  }
}

