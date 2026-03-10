import { NextRequest, NextResponse } from "next/server";
import { BlockSnapshotService } from "@/services/blockSnapshotService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function POST(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const { user } = auth;
    const body = await req.json();
    const { parentId, workspaceId } = body;

    if (!parentId || !workspaceId) {
        return NextResponse.json({ message: "Missing parentId or workspaceId" }, { status: 400 });
    }

    try {
        const result = await BlockSnapshotService.createSnapshotAfterInactivity({
            parentId,
            workspaceId,
            authorId: user._id?.toString()
        });

        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error("Snapshot create error:", error);
        return NextResponse.json({ message: error.message || "Failed to create snapshot" }, { status: 500 });
    }
}
