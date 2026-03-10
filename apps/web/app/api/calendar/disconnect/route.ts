import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { CalendarSyncService } from '@/services/calendarSyncService';

export const runtime = 'nodejs';

/**
 * Disconnect Google Calendar
 * DELETE /api/calendar/disconnect
 * Body: { workspaceId: string }
 */
export async function DELETE(req: NextRequest) {
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

        // 3. Disconnect calendar
        await CalendarSyncService.disconnectCalendar(
            String(user.id),
            workspaceId
        );

        return NextResponse.json({
            success: true,
            message: 'Calendar disconnected successfully'
        });

    } catch (error: any) {
        console.error('Error in /api/calendar/disconnect:', error);
        return NextResponse.json(
            { error: 'Failed to disconnect calendar', details: error.message },
            { status: 500 }
        );
    }
}
