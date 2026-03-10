import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { BlockService } from "@/services/blockServices";
import { PermissionService } from "@/services/PermissionService";

export const runtime = "nodejs";

interface ShareBlockRequestBody {
    blockId: string;
    workspaceId: string;
    sharedWith: Array<{
        email: string;
        permission: "viewer" | "editor" | "admin";
    }>;
}

export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        const body = (await req.json()) as ShareBlockRequestBody;
        const { blockId, workspaceId, sharedWith } = body;
        if (!blockId || !workspaceId || !Array.isArray(sharedWith) || sharedWith.length === 0) {
            return NextResponse.json(
                { message: "blockId, workspaceId, and non-empty sharedWith array are required" },
                { status: 400 },
            );
        }

        // Check if user has admin permission to share this block
        const canShare = await PermissionService.checkAccess({
            userId: String(auth.user.id),
            blockId: String(blockId),
            requiredRole: 'admin'
        });

        if (!canShare) {
            return NextResponse.json(
                { message: "You don't have permission to share this block. Admin access required." },
                { status: 403 }
            );
        }

        // Validate permission values
        const validPermissions = ["viewer", "editor", "admin"];
        for (const entry of sharedWith) {
            if (!validPermissions.includes(entry.permission)) {
                return NextResponse.json(
                    { message: `Invalid permission: ${entry.permission}. Must be viewer, editor, or admin` },
                    { status: 400 },
                );
            }
        }

        const result = await BlockService.shareBlock({
            userId: String(auth.user.id),
            userEmail: auth.user.email || "",
            blockId,
            workspaceId,
            sharedWith,
        });

        return NextResponse.json(result, { status: 200 });
    } catch (error: any) {
        console.error("Error in /api/note/block/share:", error);

        // Handle permission errors
        if (error.message?.includes("Forbidden")) {
            return NextResponse.json({ message: error.message }, { status: 403 });
        }

        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: 500 });
    }
}
