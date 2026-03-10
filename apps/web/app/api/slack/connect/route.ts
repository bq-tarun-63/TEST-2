import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

const crypto = require('crypto');

export async function GET(req: NextRequest) {
    try {
        const auth = await getAuthenticatedUser(req,
            { includeWorkspace: true }
        );
        if (isAuthError(auth)) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });

        }
        const { user, workspaceId } = auth;

        const clientId = process.env.SLACK_CLIENT_ID;
        const redirectUri = process.env.SLACK_REDIRECT_URI
        const state = signState({ userId: String(user._id), workspaceId });
        const scopes = [
            'links:read',
            'links:write',
            'chat:write',
            'commands',
            'channels:read',
            'users:read',
            'users:read.email'
        ].join(',');
        const slackAuthUri = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}`
        return NextResponse.redirect(slackAuthUri);
    }
    catch (error: any) {
        console.error('slack Connect error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


function signState(data: any): string {
    const json = JSON.stringify(data);
    const encodedData = Buffer.from(json).toString('base64');
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
    }

    const hmac = crypto.createHmac('sha256', secret);
    const signature = hmac.update(encodedData).digest('base64');
    return `${encodedData}.${signature}`;
}