import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { BlockSnapshotService } from "@/services/blockSnapshotService";
import { PermissionService } from "@/services/PermissionService";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }
        const { user } = auth;

        const { blockId, version, workspaceId } = await req.json();

        if (!blockId || !version) {
            return NextResponse.json({
                error: "blockId and version are required"
            }, { status: 400 });
        }

        // Permission Check: User must have 'editor' or higher access to the block
        const canEdit = await PermissionService.checkAccess({
            userId: String(user._id),
            blockId: String(blockId),
            requiredRole: "editor",
            workspaceId
        });

        if (!canEdit) {
            return NextResponse.json({
                error: "You do not have permission to restore this block"
            }, { status: 403 });
        }

        // Perform Restoration
        const result = await BlockSnapshotService.restoreVersion({
            parentId: blockId,
            version
        });

        return NextResponse.json({
            success: true,
            message: `Restored to version ${version}`,
            details: result
        }, { status: 200 });

    } catch (error) {
        console.error("Error restoring version:", error);
        return NextResponse.json({
            error: "Internal server error during restoration",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
