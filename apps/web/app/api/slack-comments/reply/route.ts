import { NextRequest, NextResponse } from "next/server";
import { SlackCommentService } from "@/services/slackCommentService";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            commentId,
            messageId,
            commenterName,
            commenterEmail,
            text,
            mediaMetaData
        } = body;

        if (!commentId || !messageId || !commenterName || !commenterEmail || !text) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const result = await SlackCommentService.replyToSlackSyncComment({
            commentId,
            messageId,
            commenterName,
            commenterEmail,
            text,
            mediaMetaData
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[POST /api/slack-comments/reply] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
