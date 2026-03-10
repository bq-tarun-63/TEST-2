import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { CalendarSyncService } from '@/services/calendarSyncService';

export const runtime = 'nodejs';

/**
 * Initiate Google Calendar OAuth flow
 * GET /api/calendar/connect?workspaceId=xxx
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Authenticate user
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json(
                { error: auth.error },
                { status: auth.status }
            );
        }
        const { user } = auth;

        // 2. Get workspace ID from query params
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        // 3. Generate Google OAuth URL
        const authUrl = CalendarSyncService.getAuthUrl(
            String(user.id),
            workspaceId
        );

        // 4. Redirect to Google OAuth
        return NextResponse.redirect(authUrl);

    } catch (error: any) {
        console.error('Error in /api/calendar/connect:', error);
        return NextResponse.json(
            { error: 'Failed to initiate calendar connection', details: error.message },
            { status: 500 }
        );
    }
}
