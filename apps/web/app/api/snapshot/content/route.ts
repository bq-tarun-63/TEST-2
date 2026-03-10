import { NextRequest, NextResponse } from "next/server";
import { BlockSnapshotService } from "@/services/blockSnapshotService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function POST(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { parentId, version } = body;

    if (!parentId || typeof version !== 'number') {
        return NextResponse.json({ message: "Missing parentId or version (number)" }, { status: 400 });
    }

    try {
        // version is 1-based, index is 0-based
        const result = await BlockSnapshotService.getParentContentAtVersion({
            parentId,
            versionIndex: version - 1
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Snapshot content fetch error:", error);
        return NextResponse.json({ message: error.message || "Failed to fetch version content" }, { status: 500 });
    }
}
