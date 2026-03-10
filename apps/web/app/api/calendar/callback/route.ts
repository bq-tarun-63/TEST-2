import { NextRequest, NextResponse } from 'next/server';
import { CalendarSyncService } from '@/services/calendarSyncService';

export const runtime = 'nodejs';

/**
 * Handle Google OAuth callback
 * GET /api/calendar/callback?code=xxx&state=xxx
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        // Handle OAuth errors
        if (error) {
            console.error('[Calendar Callback] OAuth error:', error);
            return NextResponse.json({
                success: false,
                error: error,
                message: 'OAuth error occurred'
            }, { status: 400 });
        }

        if (!code || !state) {
            return NextResponse.json({
                success: false,
                error: 'Missing code or state parameter'
            }, { status: 400 });
        }

        // Verify and decode state
        let userId: string;
        let workspaceId: string;

        try {
            const decodedState = CalendarSyncService.verifyState(state);
            userId = decodedState.userId;
            workspaceId = decodedState.workspaceId;
        } catch (stateError: any) {
            console.error('[Calendar Callback] State verification failed:', stateError.message);
            return NextResponse.json({
                success: false,
                error: 'Invalid state parameter (CSRF protection)',
                details: stateError.message
            }, { status: 403 });
        }

        // Exchange code for tokens
        const tokens = await CalendarSyncService.exchangeCodeForTokens(code);

        // Get user email from tokens (decode JWT)
        const tokenParts = tokens.access_token.split('.');
        let userEmail = userId; // Fallback to userId

        // Save calendar sync configuration
        await CalendarSyncService.saveCalendarSync(
            userId,
            userEmail,
            workspaceId,
            tokens,
            {
                calendarId: 'primary',
                autoScheduleBots: true,
                onlyMeetingsWithLinks: true,
                platforms: ['google_meet', 'zoom', 'teams']
            }
        );

        // Perform initial sync
        const syncResult = await CalendarSyncService.syncCalendarEvents(userId, workspaceId);

        // Setup webhook for real-time updates
        let webhookResult: any = null;
        try {
            webhookResult = await CalendarSyncService.setupWebhook(userId, workspaceId);
        } catch (webhookError: any) {
            console.error('[Calendar Callback] Webhook setup failed:', webhookError.message);
            webhookResult = { error: webhookError.message };
        }

        // Redirect to app origin (dynamic)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
        const redirectUrl = `${baseUrl}/settings?calendar=success&scheduled=${syncResult.scheduledBots}`;

        return NextResponse.redirect(redirectUrl);

    } catch (error: any) {
        console.error('[Calendar Callback] Error:', error.message);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
