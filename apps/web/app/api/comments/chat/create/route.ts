import { type NextRequest, NextResponse } from "next/server";
import { CommentService } from "@/services/commentService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { ObjectId } from "mongodb";

export async function POST(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;
    const body = await req.json();

    const {
        commentId, // Thread ID
        messageId, // New Message ID
        text,
        mediaMetaData
    } = body;

    if (!user?._id || !user?.name || !user?.email || !text || !commentId) {
        return NextResponse.json({ message: "Missing required fields: text, commentId" }, { status: 400 });
    }

    try {
        const result = await CommentService.addChatMessage({
            commentId,
            messageId: messageId || new ObjectId().toString(),
            commenterName: user.name,
            commenterEmail: user.email,
            text,
            mediaMetaData: mediaMetaData || undefined
        });
        return NextResponse.json({ message: "Reply added successfully", comment: result.comment });
    } catch (error: any) {
        console.error("Add reply error:", error);
        return NextResponse.json({ message: error.message || "Failed to add reply" }, { status: 500 });
    }
}
