import { NextRequest, NextResponse } from "next/server";
import { SlackCommentService } from "@/services/slackCommentService";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            commenterName,
            commenterEmail,
            text,
            blockIds,
            commentId,
            mediaMetaData,
            firstMessageId
        } = body;

        if (!blockIds || !commenterName || !commenterEmail || !text || !commentId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const result = await SlackCommentService.addSlackSyncComment({
            commenterName,
            commenterEmail,
            text,
            blockIds,
            commentId,
            firstMessageId,
            mediaMetaData
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[POST /api/slack-comments/create] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
