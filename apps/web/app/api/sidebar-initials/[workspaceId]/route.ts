import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { SidebarService } from "@/services/sidebarService";
import { BlockService } from "@/services/blockServices";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
    try {
        const auth = await getAuthenticatedUser(req, { includeWorkspace: true });
        const { workspaceId } = await params;
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }
        if (!workspaceId) {
            return NextResponse.json(
                { message: "workspaceId is required" },
                { status: 400 },
            );
        }

        const sidebarData = await SidebarService.getLeftSidebarInitials({
            userId: auth.user.id!,
            workspaceId,
        });
        const pages = await BlockService.getAllPagesAndCollectionViews({ workspaceId, userId: auth.user.id! });
        return NextResponse.json({ sidebarData, pages }, { status: 200 });
    } catch (error) {
        console.error("Error in /api/sidebar/initials:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
