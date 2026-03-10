import { type NextRequest, NextResponse } from "next/server";
import { CommentService } from "@/services/commentService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { ObjectId } from "mongodb";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;
    const body = await req.json();

    // Extract new payload fields
    const {
        text,
        blockIds, // Array of block IDs
        commentId, // Thread ID
        firstMessageId, // Message ID
        mediaMetaData
    } = body;

    if (!user?._id || !user?.name || !user?.email || !text || !blockIds || !commentId) {
        return NextResponse.json({ message: "Missing required fields: text, blockIds, commentId" }, { status: 400 });
    }

    try {
        // Enforce Authorization: Check if the user has access to these blocks
        for (const blockId of blockIds) {
            const hasAccess = await PermissionService.checkAccess({
                userId: user._id.toString(),
                blockId: String(blockId),
                requiredRole: "viewer",
            });

            if (!hasAccess) {
                return NextResponse.json({ message: `Forbidden: You do not have access to block ${blockId}` }, { status: 403 });
            }
        }

        const comment = await CommentService.addComment({
            commenterName: user.name,
            commenterEmail: user.email,
            text,
            blockIds,
            commentId,
            firstMessageId: firstMessageId || new ObjectId().toString(),
            mediaMetaData: mediaMetaData || undefined
        });

        return NextResponse.json({ message: "Comment added successfully", comment });
    } catch (error: any) {
        console.error("Add comment error:", error);
        return NextResponse.json({ message: error.message || "Failed to add comment" }, { status: 500 });
    }
}
