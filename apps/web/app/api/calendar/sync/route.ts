import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { CalendarSyncService } from '@/services/calendarSyncService';

export const runtime = 'nodejs';

/**
 * Manually trigger calendar sync
 * POST /api/calendar/sync
 * Body: { workspaceId: string }
 */
export async function POST(req: NextRequest) {
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

        // 2. Parse request body
        const body = await req.json();
        const { workspaceId } = body;

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        // 3. Sync calendar events
        const result = await CalendarSyncService.syncCalendarEvents(
            String(user.id),
            workspaceId
        );


        return NextResponse.json({
            success: true,
            ...result,
            message: `Synced ${result.totalEvents} events, scheduled ${result.scheduledBots} bots`
        });

    } catch (error: any) {
        console.error('Error in /api/calendar/sync:', error);

        if (error.message?.includes('not found')) {
            return NextResponse.json(
                { error: 'Calendar sync not configured. Please connect your calendar first.' },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to sync calendar', details: error.message },
            { status: 500 }
        );
    }
}
