import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { BotScheduleService } from '@/services/botScheduleService';
import { ScheduleBotRequest } from '@/models/types/scheduledBot';

export const runtime = 'nodejs';

/**
 * Schedule a bot to join a meeting at a specific time
 * POST /api/bot/schedule/create
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
        const body: ScheduleBotRequest = await req.json();

        // 3. Call service to schedule bot
        const result = await BotScheduleService.scheduleBot({
            userId: String(user.id),
            userEmail: user.email,
            requestData: body
        });

        return NextResponse.json({
            success: true,
            ...result
        }, { status: 201 });

    } catch (error: any) {
        console.error('Error in /api/bot/schedule/create:', error);

        // Handle validation errors
        if (error.message?.includes('required') ||
            error.message?.includes('Invalid') ||
            error.message?.includes('must be')) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to schedule bot', details: error.message },
            { status: 500 }
        );
    }
}
