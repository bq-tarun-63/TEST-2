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

    const { commentId, messageId, noteId } = body;

    if (!commentId || !messageId) {
        return NextResponse.json({ message: "commentId (thread) and messageId (message) are required" }, { status: 400 });
    }

    try {
        await CommentService.deleteChatMessage({
            commentId: commentId,
            messageId: messageId,
            userId: user._id?.toString(),
            userEmail: user.email,
            userName: user.name,
            noteId
        });
        return NextResponse.json({ message: "Message deleted successfully" });
    } catch (error: any) {
        console.error("Delete chat message error:", error);
        return NextResponse.json({ message: error.message || "Failed to delete message" }, { status: 500 });
    }
}
