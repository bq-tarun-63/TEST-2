import { NextRequest, NextResponse } from "next/server";
import { CommentService } from "@/services/commentService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { IComment } from "@/models/types/comment";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    try {
        const body = await req.json();
        const { commentIds } = body;

        if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0) {
            return NextResponse.json({ message: "Invalid or empty commentIds array" }, { status: 400 });
        }

        const comments: IComment[] = await CommentService.getCommentsByIds(commentIds);

        // Filter comments to only return ones the user has access to
        const authorizedComments: IComment[] = [];
        for (const comment of comments) {
            let hasAccess = false;
            if (comment.blockIds && comment.blockIds.length > 0) {
                // If they have access to at least one block associated with the comment, they can read it
                for (const blockId of comment.blockIds) {
                    const access = await PermissionService.checkAccess({
                        userId: user._id?.toString() || "",
                        blockId: blockId.toString(),
                        requiredRole: "viewer",
                    });
                    if (access) {
                        hasAccess = true;
                        break;
                    }
                }
            }
            if (hasAccess) {
                authorizedComments.push(comment);
            }
        }

        return NextResponse.json({ comments: authorizedComments });
    } catch (error: any) {
        console.error("Get comments by IDs error:", error);
        return NextResponse.json(
            { message: error.message || "Failed to fetch comments" },
            { status: 500 }
        );
    }
}
