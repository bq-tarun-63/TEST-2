import { NextRequest, NextResponse } from "next/server";
import { BlockSnapshotService } from "@/services/blockSnapshotService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function POST(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { parentId } = body;

    if (!parentId) {
        return NextResponse.json({ message: "Missing parentId" }, { status: 400 });
    }

    try {
        const history = await BlockSnapshotService.getParentHistory(parentId);

        // Format history to match 'commit' style interface for frontend compatibility
        const commits = history.map((entry, index) => ({

            version: index + 1,
            date: entry.createdAt,
            message: `Version ${index + 1}`,
            blockIds: entry.blockIds,
            createdAt: entry.createdAt,
            dead: entry.dead,
        }));

        return NextResponse.json({ success: true, commits });
    } catch (error: any) {
        console.error("Snapshot history error:", error);
        return NextResponse.json({ message: error.message || "Failed to fetch history" }, { status: 500 });
    }
}
