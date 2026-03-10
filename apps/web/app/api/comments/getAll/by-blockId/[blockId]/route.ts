import { NextRequest, NextResponse } from "next/server";
import { CommentService } from "@/services/commentService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ blockId: string }> }
) {
    const { blockId } = await params;

    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    if (!blockId) {
        return NextResponse.json({ message: "Block ID is required" }, { status: 400 });
    }

    try {
        const comments = await CommentService.getCommentsByBlockId(blockId);
        return NextResponse.json({ comments });
    } catch (error: any) {
        console.error("Get comments error:", error);
        return NextResponse.json(
            { message: error.message || "Failed to fetch comments" },
            { status: 500 }
        );
    }
}
