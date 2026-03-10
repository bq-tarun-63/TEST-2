import { type NextRequest, NextResponse } from "next/server";
import { CommentService } from "@/services/commentService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function DELETE(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;
    const body = await req.json();

    // commentId is the Thread ID.
    const { commentId } = body;

    if (!commentId) {
        return NextResponse.json({ message: "commentId is required" }, { status: 400 });
    }

    try {
        // Delete entire thread
        await CommentService.deleteComment({
            commentId,
            userId: user._id?.toString(),
            userEmail: user.email
        });
        return NextResponse.json({ message: "Thread deleted successfully" });
    } catch (error: any) {
        console.error("Delete comment error:", error);
        return NextResponse.json({ message: error.message || "Failed to delete" }, { status: 500 });
    }
}

