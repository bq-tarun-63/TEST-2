import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { SlackService } from "@/services/slackService";

export async function GET() {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    try {
        const connection = await SlackService.getConnectionByUserId(String(auth.user._id));
        if (!connection) {
            return NextResponse.json({ connected: false });
        }

        return NextResponse.json({
            connected: true,
            slackTeamName: connection.slackTeamName,
            slackUserId: connection.slackUserId,
            updatedAt: connection.updatedAt,
            createdAt: connection.createdAt,
        });
    } catch (error) {
        console.error("Failed to fetch Slack connection status:", error);
        return NextResponse.json({ message: "Failed to fetch Slack connection status" }, { status: 500 });
    }
}

export async function DELETE() {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    try {
        await SlackService.deleteConnection(String(auth.user._id));
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to disconnect Slack:", error);
        return NextResponse.json({ message: "Failed to disconnect Slack" }, { status: 500 });
    }
}
