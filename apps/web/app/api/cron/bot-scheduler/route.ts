import { NextRequest, NextResponse } from 'next/server';
import { botScheduler } from '@/services/botSchedulerService';

/**
 * Cron endpoint to trigger bot scheduler
 * GET /api/cron/bot-scheduler
 */
export const dynamic = 'force-dynamic'; // Force API to always run
export const revalidate = 0; // Disable caching
export const runtime = 'nodejs'; // Use Node.js runtime (not Edge)
export const fetchCache = 'force-no-store'; // Never cache fetch requests

export async function GET(req: NextRequest) {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`🔔 [Cron API] Request ${requestId} received at:`, new Date().toISOString());

    try {
        // Verify cron secret to prevent unauthorized access
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Check for bots immediately (awaiting to ensure execution in serverless/dev)
        console.log('🔍 [Cron API] Checking for bots...');
        await botScheduler.checkAndStartBots();

        return NextResponse.json({
            success: true,
            message: 'Bot check completed',
            timestamp: new Date().toISOString(),
            requestId: requestId
        }, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

    } catch (error: any) {
        console.error('[Cron] Error in bot scheduler:', error);
        return NextResponse.json(
            { error: 'Scheduler error', details: error.message },
            { status: 500 }
        );
    }
}
