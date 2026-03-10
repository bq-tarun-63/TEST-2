import { NextRequest, NextResponse } from "next/server";
import { SlackService } from "@/services/slackService";

export async function POST(req: NextRequest) {
    try {
        console.log("1234---------------------------------------------1234")
        // We need the RAW body for signature verification
        const rawBody = await req.text();
        const signature = req.headers.get("x-slack-signature") || "";
        const timestamp = req.headers.get("x-slack-request-timestamp") || "";

        console.log(`[Slack Interactions] Verification: sig=${signature.substring(0, 10)}... ts=${timestamp} bodyLen=${rawBody.length}`);

        // 1. Verify Request
        const isValid = SlackService.verifySignature(rawBody, signature, timestamp);
        if (!isValid) {
            console.error("[Slack Interactions] Invalid signature");
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        // 2. Parse Form Data
        const params = new URLSearchParams(rawBody);
        const payloadString = params.get("payload");
        const command = params.get("command");

        if (payloadString) {
            const payload = JSON.parse(payloadString);
            console.log(`[Slack Interactions] Received interaction: type=${payload.type}, callback_id=${payload.callback_id}`);

            if (payload.type === "message_action") {
                console.log(`[Slack Interactions] Message action detected: ${payload.callback_id}`);
                if (payload.callback_id === "save_to_books" || payload.callback_id === "report_a_bug") {
                    console.log(`[Slack Interactions] Calling handleSaveToBooks for message action`);
                    await SlackService.handleSaveToBooks(payload);
                } else {
                    console.log(`[Slack Interactions] Unrecognized message action callback_id: ${payload.callback_id}`);
                }
            } else if (payload.type === "shortcut") {
                console.log(`[Slack Interactions] Global shortcut detected: ${payload.callback_id}`);
                if (payload.callback_id === "save_to_books" || payload.callback_id === "report_a_bug") {
                    console.log(`[Slack Interactions] Calling handleSaveToBooks for global shortcut`);
                    await SlackService.handleSaveToBooks(payload);
                } else {
                    console.log(`[Slack Interactions] Unrecognized global shortcut callback_id: ${payload.callback_id}`);
                }
            } else if (payload.type === "block_actions") {
                console.log(`[Slack Interactions] Block actions received`);
                // Check if this is a request to load properties based on database selection
                if (payload.actions && payload.actions.length > 0) {
                    const action = payload.actions[0];
                    if (action.action_id === "database_dropdown" || action.action_id === "trigger_property_load") {
                        console.log(`[Slack Interactions] Triggering modal update for properties`);
                        await SlackService.updateModalWithProperties(payload);
                    }
                }
            } else if (payload.type === "view_submission") {
                // Return 200 OK immediately so Slack's 3.0s Modal limit doesn't time out
                // and sever the TCP connection, which kills Next.js background promises!
                SlackService.handleModalSubmission(payload).catch(error => {
                    console.error("[Slack Interactions] Background Error handling modal submission:", error);
                });
            }
        } else if (command === "/books") {
            const payload = Object.fromEntries(params.entries());
            const response = await SlackService.handleSlashCommand(payload);
            return NextResponse.json(response);
        }

        return new Response(null, { status: 200 });
    } catch (error: any) {
        console.error("[Slack Interactions] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
