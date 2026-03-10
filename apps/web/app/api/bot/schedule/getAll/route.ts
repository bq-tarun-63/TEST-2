import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { BotScheduleService } from '@/services/botScheduleService';

interface GetAllBotsRequestBody {
    workspaceId?: string;
    status?: string;
    limit?: number;
    skip?: number;
}

export const runtime = 'nodejs';


/**
 * Get all scheduled bots for the authenticated user
 * POST /api/bot/schedule/getAll
 * Body: { workspaceId?: string, status?: string, limit?: number, skip?: number }
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
        const body: GetAllBotsRequestBody = await req.json();
        const {
            workspaceId,
            status,
            limit = 50,
            skip = 0
        } = body;

        // 3. Call service to get scheduled bots
        const result = await BotScheduleService.getScheduledBots({
            userId: user.email,
            workspaceId,
            status,
            limit,
            skip
        });

        return NextResponse.json({
            success: true,
            ...result
        });

    } catch (error: any) {
        console.error('Error in /api/bot/schedule/getAll:', error);
        return NextResponse.json(
            { error: 'Failed to fetch scheduled bots', details: error.message },
            { status: 500 }
        );
    }
}
