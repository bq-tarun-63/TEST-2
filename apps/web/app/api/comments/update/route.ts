import { type NextRequest, NextResponse } from "next/server";
import { CommentService } from "@/services/commentService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function POST(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;
    const body = await req.json();
    const { commentId, messageId, text, noteId } = body;

    if (!commentId || !messageId || !text) {
        return NextResponse.json({ message: "commentId, messageId and text are required" }, { status: 400 });
    }

    try {
        const result = await CommentService.updateChatMessage({
            commentId: commentId,
            messageId: messageId,
            text,
            userId: user._id?.toString(),
            userEmail: user.email,
            userName: user.name,
            noteId
        });
        return NextResponse.json({ message: "Comment updated successfully", comment: result.comment });
    } catch (error: any) {
        console.error("Update comment error:", error);
        return NextResponse.json({ message: error.message || "Failed to update" }, { status: 500 });
    }
}
export async function PUT(req: NextRequest) {
    return POST(req);
}
