import type { ObjectId } from "mongodb";

/**
 * Permission document stored in the permissions collection.
 * Each permission doc can grant access to multiple subjects (users) with specific roles.
 * Blocks reference these permission docs via their aclIds array.
 */
export interface IPermission {
    _id?: ObjectId;
    subjects: Array<{
        id: string; // User ID or Email
        role: "viewer" | "editor" | "admin" | "owner";
    }>;
    createdAt?: Date;
    updatedAt?: Date;
}

export type PermissionRole = "viewer" | "editor" | "admin" | "owner";

/**
 * Role hierarchy for permission evaluation.
 * Higher roles inherit all permissions from lower roles.
 */
export const ROLE_HIERARCHY: Record<PermissionRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
    owner: 4,
};

/**
 * Check if a role has sufficient permissions for a required action.
 */
export function hasPermission(userRole: PermissionRole, requiredRole: PermissionRole): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
