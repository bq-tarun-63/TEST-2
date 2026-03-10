import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { BlockService } from "@/services/blockServices";
import { PermissionService } from "@/services/PermissionService";
export const runtime = "nodejs";

interface PermanentDeleteBlockRequestBody {
    blockId: string;
    workspaceId: string;
}

export async function DELETE(req: NextRequest) {
    try {
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        const body = (await req.json()) as PermanentDeleteBlockRequestBody;
        const { blockId, workspaceId } = body;

        if (!blockId || !workspaceId) {
            return NextResponse.json(
                { message: "blockId and workspaceId are required" },
                { status: 400 },
            );
        }
        const canDelete = await PermissionService.checkAccess({ userId: String(auth.user.id), blockId, workspaceId, requiredRole: "editor" });
        if (!canDelete) {
            return NextResponse.json(
                { message: "Forbidden: Requires editor access to delete blocks" },
                { status: 403 },
            );
        }
        await BlockService.permanentDelete({
            userId: String(auth.user.id),
            blockId,
            workspaceId,
        });

        return NextResponse.json({ success: true, message: "Block permanently deleted" }, { status: 200 });
    } catch (error: any) {
        console.error("Error in /api/note/block/permanent-delete:", error);

        // Handle permission errors
        if (error.message?.includes("Forbidden")) {
            return NextResponse.json({ message: error.message }, { status: 403 });
        }

        // Handle "not in trash" errors
        if (error.message?.includes("trash")) {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }

        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: 500 });
    }
}
