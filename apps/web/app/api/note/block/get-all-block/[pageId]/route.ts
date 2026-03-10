import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { BlockService } from "@/services/blockServices";
import { PermissionService } from "@/services/PermissionService";

export const runtime = "nodejs";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    try {
        const auth = await getAuthenticatedUser(req, { includeWorkspace: true });
        console.log("Auth result:", { isError: isAuthError(auth), workspaceId: isAuthError(auth) ? null : auth.workspaceId });

        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }
        const { workspaceId } = auth;
        const { pageId } = await params;

        if (!pageId || !workspaceId) {
            return NextResponse.json(
                { message: "pageId and workspaceId are required" },
                { status: 400 }
            );
        }

        // Check if user has permission to view this page
        const canView = await PermissionService.checkAccess({
            userId: String(auth.user.id),
            blockId: String(pageId),
            requiredRole: 'viewer',
            workspaceId: String(workspaceId)
        });

        if (!canView) {
            return NextResponse.json(
                { message: "You don't have permission to view this page" },
                { status: 403 }
            );
        }

        const result = await BlockService.getOnlineContentForPage(pageId, workspaceId, String(auth.user.id));
        console.log("Result from BlockService:", { blocksCount: result.blocks.length, blockIdsCount: result.blockIds.length });

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        console.error("Error in /api/note/block/get-all-block:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
