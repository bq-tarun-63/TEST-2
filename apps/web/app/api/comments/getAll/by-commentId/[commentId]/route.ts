import { NextRequest, NextResponse } from "next/server";
import { CommentService } from "@/services/commentService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ commentId: string }> }
) {
    const { commentId } = await params;

    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    if (!commentId) {
        return NextResponse.json({ message: "Comment ID is required" }, { status: 400 });
    }

    try {
        const comment = await CommentService.getCommentById(commentId);
        if (!comment) {
            return NextResponse.json({ message: "Comment not found" }, { status: 404 });
        }
        return NextResponse.json({ comment });
    } catch (error: any) {
        console.error("Get comment error:", error);
        return NextResponse.json(
            { message: error.message || "Failed to fetch comment" },
            { status: 500 }
        );
    }
}
