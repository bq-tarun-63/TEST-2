import { ObjectId } from "bson";

/**
 * Utility functions for generating property and option IDs
 * These match the backend format: prop_<ObjectId> and opt_<ObjectId>
 * Uses the same ObjectId from bson package as collectionViewTemplate.ts
 */

/**
 * Generates a property ID in the format: prop_<ObjectId>
 * Matches backend format: prop_${new ObjectId()}
 * Same approach as collectionViewTemplate.ts line 28
 */
export function generatePropertyId(): string {
  return `prop_${new ObjectId()}`;
}

/**
 * Generates an option ID in the format: opt_<ObjectId>
 * Matches backend format: opt_${new ObjectId()}
 * Same approach as collectionViewTemplate.ts lines 30-32
 */
export function generateOptionId(): string {
  return `opt_${new ObjectId()}`;
}

/**
 * Normalizes option IDs to ensure they use proper format
 * If an option already has a valid ID (opt_ followed by 24 hex chars), it's kept
 * Otherwise, a new ID is generated
 * 
 * @param opts - Array of options to normalize
 * @returns Array of options with normalized IDs
 */
export function normalizeOptionIds<T extends { id?: string }>(
  opts: T[] | undefined
): T[] {
  if (!opts) return [];
  
  return opts.map((opt) => {
    // Check if option ID is already in proper format (opt_ followed by 24 hex chars)
    if (opt.id && opt.id.startsWith("opt_") && opt.id.length > 4) {
      const idPart = opt.id.substring(4);
      // Validate if it's a valid format (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(idPart)) {
        return opt; // Already has proper ID
      }
    }
    // Generate new proper ID
    return {
      ...opt,
      id: generateOptionId(),
    };
  });
}

/**
 * Creates default options for a property type
 * Matches backend default options
 * 
 * @param type - Property type (status, priority, etc.)
 * @returns Array of default options with generated IDs
 */
export function createDefaultOptions(
  type: "status" | "priority" | "select" | "multi_select"
): Array<{ id: string; name: string; color: string }> {
  if (type === "status") {
    return [
      { id: generateOptionId(), name: "Todo", color: "blue" },
      { id: generateOptionId(), name: "In Progress", color: "yellow" },
      { id: generateOptionId(), name: "Done", color: "green" },
    ];
  }
  
  if (type === "priority") {
    return [
      { id: generateOptionId(), name: "Low", color: "green" },
      { id: generateOptionId(), name: "Medium", color: "yellow" },
      { id: generateOptionId(), name: "High", color: "red" },
    ];
  }
  
  // For select and multi_select, return empty array (options should be provided)
  return [];
}

