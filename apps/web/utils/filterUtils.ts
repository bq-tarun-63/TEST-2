import { BoardProperty } from "@/types/board";
import { IAdvancedFilterGroup, IAdvancedFilterRule } from "@/models/types/ViewTypes";

/**
 * Extracts initial property values from regular and advanced filters
 * to pre-populate a new page's databaseProperties so it is visible in the filtered view.
 *
 * @param regularFilters  - Record<propId, string[]> from getFilters(boardId).
 *                          Values are option IDs (status/select), user IDs (person),
 *                          page IDs (relation), or raw strings (text/number/etc.).
 * @param advancedFilters - IAdvancedFilterGroup[] from getAdvancedFilters(boardId).
 *                          Values for status/select are option IDs; for person, user IDs.
 * @param boardProperties - The datasource property schema.
 * @param existingProps   - Properties already set (e.g. from group-by column).
 *                          These will NOT be overwritten.
 * @param workspaceMembers - Array of workspace member objects (for person ID → object lookup).
 */
export function getInitialPropertiesFromFilters(
    regularFilters: Record<string, string[]>,
    advancedFilters: IAdvancedFilterGroup[],
    boardProperties: Record<string, BoardProperty>,
    existingProps: Record<string, any> = {},
    workspaceMembers: any[] = [],
    getNotesByDataSourceId?: (dataSourceId: string) => any[],
    getDataSource?: (dataSourceId: string) => any
): Record<string, any> {
    const result: Record<string, any> = { ...existingProps };

    // ─── 1. Process regular filters ────────────────────────────────────────
    // Regular filter values are already in the format notes use:
    //   status/select/priority → option name string
    //   person → userName string (but notes store [{userId, userName, userEmail}])
    //   multi_select → array of option name strings
    //   relation → note title string (but notes store [noteId])
    //   text/number/email/url/phone/checkbox/date → raw value string
    Object.entries(regularFilters).forEach(([propId, values]) => {
        // Skip if already set by group-by or a previous source
        if (result[propId] !== undefined) return;

        const prop = boardProperties[propId];
        if (!prop || !values || values.length === 0) return;

        // Skip computed properties that can't be set directly
        if (prop.type === "rollup" || prop.type === "formula" || prop.type === "id") return;

        const firstValue = values[0];
        if (firstValue === undefined || firstValue === null || firstValue === "") return;

        result[propId] = formatRegularFilterValue(prop, firstValue, workspaceMembers);
    });

    // ─── 2. Process advanced filters ───────────────────────────────────────
    // Only extract values from "equals" and "contains" operators (positive matches).
    // Advanced filter values for status/select/priority are stored as option IDs,
    // for person as user IDs. We need to convert them.
    advancedFilters.forEach((group) => {
        if (!group.rules) return;

        group.rules.forEach((rule: IAdvancedFilterRule) => {
            if (!rule || !rule.propertyId) return;

            // Skip if already set
            if (result[rule.propertyId] !== undefined) return;

            // ─── Sprint-only: nestedPropertyId cross-relation resolution ──────────
            // When filter rule uses nestedPropertyId, it means the filter is dynamic
            // (e.g. "Sprint.status = Current"). For new page creation, we resolve the
            // actual Sprint page ID that currently matches the nested property value.
            if (rule.nestedPropertyId) {
                const prop = boardProperties[rule.propertyId];
                if (prop?.type === "relation" && prop.linkedDatabaseId && getNotesByDataSourceId && getDataSource) {
                    const linkedDatabaseId = String(prop.linkedDatabaseId);
                    const linkedDataSource = getDataSource(linkedDatabaseId);

                    // Only apply for Sprint datasources
                    if (linkedDataSource?.isSprint) {
                        const linkedSprintNotes = getNotesByDataSourceId(linkedDatabaseId);
                        const filterVal = Array.isArray(rule.value) ? rule.value[0] : rule.value;
                        const nestedOperator = rule.operator || "equals";

                        // Only positive-match operators make sense for pre-population
                        if (nestedOperator !== "equals" && nestedOperator !== "contains") {
                            return; // Do not fall through to generic handling
                        }

                        // Find the Sprint page where the nested property matches the filter value
                        const matchingSprintPage = linkedSprintNotes.find((n: any) => {
                            const nestedVal = n.value?.databaseProperties?.[rule.nestedPropertyId!];
                            if (nestedVal === undefined || nestedVal === null) return false;

                            const strNested = String(nestedVal).trim().toLowerCase();
                            const strFilter = String(filterVal).trim().toLowerCase();

                            if (nestedOperator === "contains") {
                                return strNested.includes(strFilter);
                            }
                            return strNested === strFilter;
                        });

                        if (matchingSprintPage) {
                            // Set the new task's Sprint relation to the actual Sprint page ID
                            result[rule.propertyId] = [String(matchingSprintPage._id)];
                        }
                        return; // Don't fall through to generic handling
                    }
                }
            }

            // Only positive-match operators make sense for pre-population
            if (rule.operator !== "equals" && rule.operator !== "contains") return;

            const prop = boardProperties[rule.propertyId];
            if (!prop) return;

            // Skip computed properties
            if (prop.type === "rollup" || prop.type === "formula" || prop.type === "id") return;

            const rawValue = Array.isArray(rule.value) ? rule.value[0] : rule.value;
            if (rawValue === undefined || rawValue === null || rawValue === "") return;

            result[rule.propertyId] = formatAdvancedFilterValue(prop, rawValue, workspaceMembers);
        });
    });

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regular filter values are already stored as display values (names/titles).
// We just need to convert to the format notes expect.
// ─────────────────────────────────────────────────────────────────────────────
function formatRegularFilterValue(
    prop: BoardProperty,
    value: string,
    workspaceMembers: any[]
): any {
    switch (prop.type) {
        case "status":
        case "select":
        case "priority":
            // Filters and notes both store option ID
            return value;

        case "multi_select":
            // Notes store arrays of option IDs
            return [value];

        case "person": {
            // Regular filters now store userId, and notes store [{userId, userName, userEmail}]
            const member = workspaceMembers.find(
                (m) => String(m.userId || m.id || m._id) === String(value)
            );
            if (member) {
                return [{
                    userId: member.userId || member.id || member._id,
                    userName: member.userName || member.name || "",
                    userEmail: member.userEmail || member.email || "",
                }];
            }
            // Fallback: store with just the userId
            return [{ userId: value, userName: "", userEmail: "" }];
        }

        case "relation":
            // Regular filters now store page IDs, notes also store [pageId]
            return [value];

        case "checkbox":
            // Filter now stores "true"/"false" directly
            return value === "true";

        case "number":
            return isNaN(Number(value)) ? value : Number(value);

        case "date":
        case "text":
        case "email":
        case "url":
        case "phone":
        case "id":
            return value;

        default:
            return value;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced filter values store IDs for status/select/multi_select/person.
// Notes also store option IDs — no conversion needed for option-based types.
// ─────────────────────────────────────────────────────────────────────────────
function formatAdvancedFilterValue(
    prop: BoardProperty,
    value: any,
    workspaceMembers: any[]
): any {
    switch (prop.type) {
        case "status":
        case "select":
        case "priority":
            // Both advanced filters and notes store option ID — return as-is
            return value;

        case "multi_select":
            // Notes store arrays of option IDs
            return [value];

        case "person": {
            // Advanced filters store userId → notes store [{userId, userName, userEmail}]
            const member = workspaceMembers.find(
                (m) => String(m.userId || m.id || m._id) === String(value)
            );
            if (member) {
                return [{
                    userId: member.userId || member.id || member._id,
                    userName: member.userName || member.name || "",
                    userEmail: member.userEmail || member.email || "",
                }];
            }
            return [{ userId: value, userName: "", userEmail: "" }];
        }

        case "relation":
            // Advanced filters store note IDs → notes also store [noteId]
            return [String(value)];

        case "checkbox":
            if (String(value) === "true") return true;
            if (String(value) === "false") return false;
            return value;

        case "number":
            return isNaN(Number(value)) ? value : Number(value);

        case "id":
        case "text":
        case "email":
        case "url":
        case "phone":
            return value;

        case "date":
            return value;

        default:
            return value;
    }
}
