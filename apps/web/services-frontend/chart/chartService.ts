import type { BoardProperty, BoardProperties, DatabaseSource } from "@/types/board";
import type { Block } from "@/types/block";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import {
  computeRollupData,
  getRollupComparableValue,
} from "@/utils/rollupUtils";

export interface ChartGroupingHelpers {
  boardProperties: BoardProperties;
  getNotesByDataSourceId: (dataSourceId: string) => Block[];
  getDataSource: (dataSourceId: string) => DatabaseSource | undefined;
  getRelationNoteTitle: (
    noteId: string,
    linkedDatabaseId: string,
    fallbackTitle?: string,
  ) => string;
  getValidRelationIds: (ids: string[], linkedDatabaseId: string) => string[];
}

/**
 * Extract a normalized string value for grouping notes by a property.
 * Mirrors the behaviour used by list/board views (groupBy).
 */
export function getPropertyValueForGrouping(
  note: Block,
  propertyId: string,
  property: BoardProperty,
  helpers: ChartGroupingHelpers,
): string {
  const { boardProperties, getNotesByDataSourceId, getDataSource, getRelationNoteTitle } =
    helpers;

  const value = note.value.databaseProperties?.[propertyId];

  // Person: array of members
  if (property.type === "person" && Array.isArray(value)) {
    if (value.length === 0) {
      return "Unassigned";
    }
    const firstPerson = value[0];
    return firstPerson?.userName || firstPerson?.userEmail || "Unnamed User";
  }

  // Relation: note ids -> use first related note title
  if (property.type === "relation") {
    const relationLimit = property.relationLimit || "multiple";
    const linkedDatabaseId = property.linkedDatabaseId;
    const rawIds = getRelationIdsFromValue(value, relationLimit);
    const relationIds = helpers.getValidRelationIds(rawIds, linkedDatabaseId ? String(linkedDatabaseId) : "");
    if (relationIds.length === 0) {
      return "No relations";
    }
    return getRelationNoteTitle(
      relationIds[0]!,
      linkedDatabaseId ? String(linkedDatabaseId) : "",
      "New page",
    );
  }

  // Rollup: use comparable/aggregated value
  if (property.type === "rollup") {
    const rollupResult = computeRollupData(
      note,
      property,
      boardProperties,
      getNotesByDataSourceId,
      getDataSource,
    );
    if (rollupResult.state !== "ready") {
      return rollupResult.message || "—";
    }
    const rollupValue = getRollupComparableValue(rollupResult);
    if (rollupValue !== null && rollupValue !== undefined) {
      return String(rollupValue);
    }
    return "—";
  }

  // Date
  if (property.type === "date") {
    if (!value) return "Unassigned";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString();
  }

  // Checkbox
  if (property.type === "checkbox") {
    return value ? "Yes" : "No";
  }

  // Number
  if (property.type === "number") {
    if (value === null || value === undefined || value === "") {
      return "Unassigned";
    }
    return String(value);
  }

  // Status / Select / Priority
  if (
    property.type === "status"
    || property.type === "select"
    || property.type === "priority"
  ) {
    if (value === undefined || value === null) return "Unassigned";
    const options = property.options || [];
    const matchingOption = options.find(
      (opt: any) => String(opt.id) === String(value),
    );
    if (matchingOption) {
      return matchingOption.name || String(value);
    }
    return String(value);
  }

  // Multi-select
  if (property.type === "multi_select") {
    if (Array.isArray(value)) {
      if (value.length === 0) return "Unassigned";
      const firstValue = value[0];
      const options = property.options || [];
      const matchingOption = options.find(
        (opt: any) => String(opt.id) === String(firstValue),
      );
      if (matchingOption) {
        return matchingOption.name || String(firstValue);
      }
      return String(firstValue);
    }
    return value ? String(value) : "Unassigned";
  }

  // Text, email, url, phone, place, file, etc.
  if (value === undefined || value === null || value === "") {
    return "Unassigned";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : "Unassigned";
  }

  return String(value);
}

/**
 * chart data processor.
 * Computes X-axis (categorical), Y-axis (distinct count), and percentages.
 * 
 * @param records - Array of pages/notes
 * @param slicePropertyId - Property ID used for slices/X-axis (e.g., "Status")
 * @param sliceProperty - BoardProperty object for slice property
 * @param valuePropertyId - Property ID whose distinct values are counted, or "count" for record count
 * @param valueProperty - BoardProperty object for value property (null if valuePropertyId is "count")
 * @param helpers - ChartGroupingHelpers for property value extraction
 * @returns Structured chart data with slices, X-axis, Y-axis, and totalDistinct
 */
export interface ChartDataResult {
  slices: Array<{
    key: string;      // slice label, ex: "Todo"
    count: number;    // Y-axis value (distinct count or record count)
    percent: number;  // count / totalDistinct
  }>;
  xAxis: string[];     // Distinct values of sliceProperty
  yAxis: number[];    // Y-axis values for each slice
  totalDistinct: number; // Global distinct count of valueProperty (or total records if "count")
}

export function processChartData(
  records: Block[],
  slicePropertyId: string,
  sliceProperty: BoardProperty,
  valuePropertyId: string | "count",
  valueProperty: BoardProperty | null,
  helpers: ChartGroupingHelpers,
): ChartDataResult {
  // X-AXIS: Distinct values of sliceProperty across all records
  const sliceValueSet = new Set<string>();
  const grouped: Record<string, Block[]> = {};

  // Initialize grouped with all property options (if available)
  if (
    sliceProperty.type === "status" ||
    sliceProperty.type === "select" ||
    sliceProperty.type === "multi_select" ||
    sliceProperty.type === "priority"
  ) {
    const options = sliceProperty.options || [];
    options.forEach((option: any) => {
      const optionName = option.name || String(option);
      grouped[optionName] = [];
      sliceValueSet.add(optionName);
    });
  }

  // Always include "Unassigned" for notes without values
  grouped["Unassigned"] = [];
  sliceValueSet.add("Unassigned");

  // Group records by slice property
  records.forEach((record) => {
    const groupKey = getPropertyValueForGrouping(
      record,
      slicePropertyId,
      sliceProperty,
      helpers,
    );

    if (!grouped[groupKey]) {
      grouped[groupKey] = [];
      sliceValueSet.add(groupKey);
    }
    grouped[groupKey].push(record);
  });

  // X-axis: distinct values of sliceProperty (maintain order)
  const xAxis = Array.from(sliceValueSet);

  // GLOBAL DISTINCT: Calculate total distinct values of valueProperty across ALL records
  // Excludes "Unassigned" from distinct count
  let globalDistinctCount = 0;
  if (valuePropertyId === "count") {
    // If "count", global distinct is total number of records
    globalDistinctCount = records.length;
  } else if (valueProperty) {
    // Otherwise, count distinct values of valueProperty across all records
    const globalDistinctValues = new Set<string>();
    records.forEach((record) => {
      const val = getPropertyValueForGrouping(
        record,
        valuePropertyId,
        valueProperty,
        helpers,
      );
      // Ignore null, undefined, empty string, and "Unassigned"
      if (val && val !== "Unassigned" && val.trim() !== "") {
        globalDistinctValues.add(val);
      }
    });
    globalDistinctCount = globalDistinctValues.size;
  }

  // Y-AXIS: Calculate distinct count (or record count) for each slice
  const slices: Array<{ key: string; count: number; percent: number }> = [];
  const yAxis: number[] = [];

  xAxis.forEach((sliceKey) => {
    const groupNotes = grouped[sliceKey] || [];

    let count = 0;
    if (valuePropertyId === "count") {
      // If "count", count records in this slice
      count = groupNotes.length;
    } else if (valueProperty) {
      // Otherwise, count distinct values of valueProperty within this slice
      // Excludes "Unassigned" from distinct count
      const distinctValues = new Set<string>();
      groupNotes.forEach((note) => {
        const val = getPropertyValueForGrouping(
          note,
          valuePropertyId,
          valueProperty,
          helpers,
        );
        // Ignore null, undefined, empty string, and "Unassigned"
        if (val && val !== "Unassigned" && val.trim() !== "") {
          distinctValues.add(val);
        }
      });
      count = distinctValues.size;
    }

    // Calculate percent: count / globalDistinctCount
    const percent = globalDistinctCount > 0 ? (count / globalDistinctCount) * 100 : 0;

    slices.push({ key: sliceKey, count, percent });
    yAxis.push(count);
  });

  return {
    slices,
    xAxis,
    yAxis,
    totalDistinct: globalDistinctCount,
  };
}

