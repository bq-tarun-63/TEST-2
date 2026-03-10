import { NextRequest, NextResponse } from "next/server";
import { SlackService } from "@/services/slackService";

export async function POST(req: NextRequest) {
    // 1. Get headers for verification
    const signature = req.headers.get("x-slack-signature");
    const timestamp = req.headers.get("x-slack-request-timestamp");

    // We need the RAW body text for the signature to match exactly
    const rawBody = await req.text();

    if (!signature || !timestamp) {
        return NextResponse.json({ error: "Missing Slack headers" }, { status: 400 });
    }

    // 2. Verify the signature
    const isValid = SlackService.verifySignature(rawBody, signature, timestamp);
    if (!isValid) {
        console.error("[Slack Events] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 3. Parse the valid body
    const body = JSON.parse(rawBody);

    // 4. Handle Slack's "URL Verification" challenge
    if (body.type === "url_verification") {
        return NextResponse.json({ challenge: body.challenge });
    }
    const { event, team_id } = body;
    if (event?.type === "link_shared") {
        console.log(`[Slack Events] Unfurling links for team: ${team_id}`);
        await SlackService.handleLinkUnfurl(event, team_id);
    }

    // Handle inbound Slack thread replies to sync back to the App
    if (event?.type === "message" && event.thread_ts && !event.bot_id) {
        console.log(`[Slack Events] Received thread reply in channel ${event.channel}, thread ${event.thread_ts}`);

        // Import our sync service conditionally or at top level. 
        // Best to use dynamic import here to avoid circular dependencies if any exist, 
        // but we'll import it directly to be safe.
        const { SlackCommentService } = require("@/services/slackCommentService");

        try {
            await SlackCommentService.syncInboundSlackReply({
                slackChannelId: event.channel,
                slackThreadTs: event.thread_ts,
                slackMessageTs: event.ts,
                slackUserId: event.user,
                text: event.text,
            });
            console.log(`[Slack Events] Successfully synced reply to thread ${event.thread_ts}`);
        } catch (error) {
            console.error(`[Slack Events] Failed to sync inbound reply:`, error);
        }
    }

    // 5. Handle actual events (we will add 'link_shared' here next)
    console.log(`[Slack Events] Received event: ${body.event?.type}`);

    return NextResponse.json({ ok: true });
}