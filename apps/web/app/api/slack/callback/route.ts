import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { ISlackConnection } from '@/models/types/SlackConnection';
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import { ObjectId } from 'mongodb';
const crypto = require('crypto');

export async function GET(req: NextRequest) {
  try {
    // 1. Get OAuth code and state from Slack
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
    }

    // 2. Verify state signature (CSRF protection)
    let userId: string;
    let workspaceId: string;

    try {
      const decoded = verifyState(state);
      userId = decoded.userId;
      workspaceId = decoded.workspaceId;
    } catch (error: any) {
      console.error('[Slack Callback] State verification failed:', error.message);
      return NextResponse.json({ error: 'Invalid state (CSRF protection)' }, { status: 403 });
    }

    const client = new WebClient();
    const result = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.SLACK_REDIRECT_URI!
    });

    const slackData = result as any;
    const metadataClient = await clusterManager.getMetadataClient();
    const metadataDb = metadataClient.db();

    // Fetch user email for attribution
    const usersCollection = metadataDb.collection("users");
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    const userEmail = user?.email || "";

    const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");

    const connection: ISlackConnection = {
      userId,
      userEmail,
      workspaceId,
      slackTeamId: slackData.team.id,
      slackTeamName: slackData.team.name,
      slackUserId: slackData.authed_user.id,
      slackAccessToken: slackData.access_token,
      slackScopes: slackData.scope.split(','),
      slackBotUserId: slackData.bot_user_id || "",
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    };

    await slackCollection.updateOne(
      { userId, slackTeamId: slackData.team.id },
      { $set: connection },
      { upsert: true }
    );

    console.log(`[Slack Callback] ✅ Connected ${slackData.team.name} for user ${userId}`);

    const baseUrl = process.env.DOMAIN || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(`${baseUrl}/organization/workspace?slack=success`);



  } catch (error: any) {
    console.error('[Slack Callback] Error:', error);
    const baseUrl = process.env.DOMAIN || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(`${baseUrl}/settings?tab=integrations&slack=error&message=${encodeURIComponent(error.message)}`);
  }
}

// Helper: Verify state signature
function verifyState(state: string): { userId: string; workspaceId: string } {
  // Normalize: browser/Slack might decode '+' as ' '
  const normalizedState = state.replace(/ /g, '+');

  if (!normalizedState || !normalizedState.includes('.')) {
    throw new Error('Invalid state format');
  }

  const [encodedData, signature] = normalizedState.split('.');
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = hmac.update(encodedData!).digest('base64');

  // Use Buffer for proper base64 decoding, then convert to Uint8Array for timingSafeEqual
  const signatureBuffer = new Uint8Array(Buffer.from(signature!, 'base64'));
  const expectedBuffer = new Uint8Array(Buffer.from(expectedSignature, 'base64'));

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid state signature');
  }

  return JSON.parse(Buffer.from(encodedData!, 'base64').toString('utf-8'));
}
