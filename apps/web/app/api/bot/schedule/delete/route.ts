import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { BotScheduleService } from '@/services/botScheduleService';

export const runtime = 'nodejs';

interface DeleteBotRequestBody {
    botId: string;
}

/**
 * Cancel/Delete a scheduled bot
 * DELETE /api/bot/schedule/delete
 * Body: { botId: string }
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
        const body: DeleteBotRequestBody = await req.json();
        const { botId } = body;

        if (!botId) {
            return NextResponse.json(
                { error: 'botId is required' },
                { status: 400 }
            );
        }

        // 3. Call service to cancel scheduled bot
        const result = await BotScheduleService.cancelScheduledBot({
            botId,
            userId: user.email
        });

        return NextResponse.json({
            success: true,
            ...result
        });

    } catch (error: any) {
        console.error('Error in /api/bot/schedule/delete:', error);

        // Handle not found errors
        if (error.message?.includes('not found') || error.message?.includes('Invalid')) {
            return NextResponse.json(
                { error: error.message },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to cancel scheduled bot', details: error.message },
            { status: 500 }
        );
    }
}
