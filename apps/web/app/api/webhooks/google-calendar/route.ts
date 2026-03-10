import { NextRequest, NextResponse } from 'next/server';
import { CalendarSyncService } from '@/services/calendarSyncService';
import clientPromise from '@/lib/mongoDb/mongodb';
import { ICalendarSync } from '@/models/types/CalendarSync';

export const runtime = 'nodejs';

/**
 * Google Calendar Webhook Handler
 * POST /api/webhooks/google-calendar
 * 
 * Receives push notifications from Google Calendar when events change
 */
export async function POST(req: NextRequest) {
    try {
        // Get webhook headers
        const channelId = req.headers.get('x-goog-channel-id');
        const resourceId = req.headers.get('x-goog-resource-id');
        const resourceState = req.headers.get('x-goog-resource-state');
        const resourceUri = req.headers.get('x-goog-resource-uri');



        // Verify this is a valid webhook
        if (!channelId || !resourceId) {
            console.error('[Calendar Webhook] Missing required headers');
            return NextResponse.json(
                { error: 'Invalid webhook request' },
                { status: 400 }
            );
        }

        // Handle sync message (initial verification)
        if (resourceState === 'sync') {
            return NextResponse.json({ success: true });
        }

        // Find the calendar sync configuration for this webhook
        const client = await clientPromise();
        const db = client.db();
        const calendarSyncCollection = db.collection<ICalendarSync>('calendar_syncs');

        const calendarSync = await calendarSyncCollection.findOne({
            channelId,
            resourceId,
            isActive: true
        });

        if (!calendarSync) {
            // Return 200 to prevent Google from retrying
            // This is likely an old/expired webhook channel
            console.error(`[Calendar Webhook] No matching calendar sync found for channelId: ${channelId}, resourceId: ${resourceId}`);
            return NextResponse.json(
                {
                    success: false,
                    error: 'Calendar sync not found - likely old webhook channel',
                    channelId,
                    resourceId
                },
                { status: 200 }  // Return 200 to prevent retries
            );
        }

        // Handle different resource states
        if (resourceState === 'exists') {
            // Trigger sync for this user
            const syncResult = await CalendarSyncService.syncCalendarEvents(
                calendarSync.userId,
                calendarSync.workspaceId
            );


            return NextResponse.json({
                success: true,
                message: 'Calendar synced successfully',
                ...syncResult
            });
        }

        // Acknowledge other states
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[Calendar Webhook] Error processing webhook:', error);

        // Return 200 to prevent Google from retrying
        // Log error for debugging
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 200 }
        );
    }
}

/**
 * Handle webhook verification (GET request)
 */
export async function GET(req: NextRequest) {
    // Google may send GET requests to verify the endpoint
    return NextResponse.json({
        success: true,
        message: 'Google Calendar webhook endpoint'
    });
}
