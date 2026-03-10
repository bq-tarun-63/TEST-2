import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { BotScheduleService } from '@/services/botScheduleService';

export const runtime = 'nodejs';

/**
 * Get a specific scheduled bot by ID
 * GET /api/bot/schedule/get/[id]
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        // 2. Get ID from params
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { error: 'Bot ID is required' },
                { status: 400 }
            );
        }

        // 3. Call service to get scheduled bot
        const scheduledBot = await BotScheduleService.getScheduledBotById({
            botId: id,
            userId: user.email
        });

        return NextResponse.json({
            success: true,
            scheduledBot,
            message: 'Scheduled bot retrieved successfully'
        });

    } catch (error: any) {
        console.error('Error in /api/bot/schedule/get/[id]:', error);

        // Handle not found errors
        if (error.message?.includes('not found')) {
            return NextResponse.json(
                {
                    success: false,
                    error: error.message
                },
                { status: 404 }
            );
        }

        // Handle invalid ID errors
        if (error.message?.includes('Invalid')) {
            return NextResponse.json(
                {
                    success: false,
                    error: error.message
                },
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch scheduled bot',
                details: error.message
            },
            { status: 500 }
        );
    }
}
