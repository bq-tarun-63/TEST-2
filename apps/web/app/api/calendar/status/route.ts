import { NextRequest, NextResponse } from 'next/server';
import { CalendarSyncService } from '@/services/calendarSyncService';
import clientPromise from '@/lib/mongoDb/mongodb';
import { ICalendarSync } from '@/models/types/CalendarSync';
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export const runtime = 'nodejs';

/**
 * GET /api/calendar/status
 * Check Google Calendar connection status
 * 
 * Query params:
 * - workspaceId: string (required)
 * - userId: string (optional, from headers)
 */
export async function GET(req: NextRequest) {
    try {
       const auth = await getAuthenticatedUser();
          if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
          }
       const {workspaceId, user} = auth;
        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }
        const userId = user.id;
        if (!userId) {
            return NextResponse.json(
                { error: 'User not authenticated' },
                { status: 401 }
            );
        }

        // Get calendar sync from database
        const client = await clientPromise();
        const db = client.db();
        const calendarSync = await db.collection<ICalendarSync>('calendar_syncs').findOne({
            userId,
            workspaceId,
            isActive: true
        });

        if (!calendarSync) {
            return NextResponse.json({
                connected: false,
                message: 'No calendar connected',
                workspaceId,
                userId
            });
        }

        // Calculate webhook status
        const now = new Date();
        const webhookExpiry = calendarSync.webhookExpiry ? new Date(calendarSync.webhookExpiry) : null;
        const webhookActive = webhookExpiry ? webhookExpiry > now : false;
        const webhookExpiresIn = webhookExpiry
            ? Math.floor((webhookExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null;

        // Get scheduled bots count
        const scheduledBotsCount = await db.collection('scheduled_bots').countDocuments({
            userId,
            workspaceId,
            status: 'scheduled'
        });

        return NextResponse.json({
            connected: true,
            userId,
            userEmail: calendarSync.userEmail,
            workspaceId,
            calendarId: calendarSync.googleCalendarId,
            autoScheduleBots: calendarSync.autoScheduleBots,
            onlyMeetingsWithLinks: calendarSync.onlyMeetingsWithLinks,
            platforms: calendarSync.platforms,
            webhook: {
                active: webhookActive,
                channelId: calendarSync.channelId || null,
                resourceId: calendarSync.resourceId || null,
                expiresAt: webhookExpiry?.toISOString() || null,
                expiresInDays: webhookExpiresIn
            },
            scheduledBots: {
                count: scheduledBotsCount
            },
            lastSyncAt: calendarSync.lastSyncAt?.toISOString() || null,
            createdAt: calendarSync.createdAt.toISOString(),
            updatedAt: calendarSync.updatedAt.toISOString()
        });

    } catch (error: any) {
        console.error('[Calendar Status] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get calendar status' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/calendar/status
 * Same as GET but accepts body parameters (easier for Postman)
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { workspaceId } = body;
        const userId = req.headers.get('x-user-email');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        if (!userId) {
            return NextResponse.json(
                { error: 'User not authenticated' },
                { status: 401 }
            );
        }

        // Get calendar sync from database
        const client = await clientPromise();
        const db = client.db();
        const calendarSync = await db.collection<ICalendarSync>('calendar_syncs').findOne({
            userId,
            workspaceId,
            isActive: true
        });

        if (!calendarSync) {
            return NextResponse.json({
                connected: false,
                message: 'No calendar connected',
                workspaceId,
                userId
            });
        }

        // Calculate webhook status
        const now = new Date();
        const webhookExpiry = calendarSync.webhookExpiry ? new Date(calendarSync.webhookExpiry) : null;
        const webhookActive = webhookExpiry ? webhookExpiry > now : false;
        const webhookExpiresIn = webhookExpiry
            ? Math.floor((webhookExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null;

        // Get scheduled bots count
        const scheduledBotsCount = await db.collection('scheduled_bots').countDocuments({
            userId,
            workspaceId,
            status: 'scheduled'
        });

        // Get recent scheduled bots
        const recentBots = await db.collection('scheduled_bots').find({
            userId,
            workspaceId,
            status: 'scheduled'
        })
            .sort({ scheduledTime: 1 })
            .limit(5)
            .toArray();

        return NextResponse.json({
            connected: true,
            userId,
            userEmail: calendarSync.userEmail,
            workspaceId,
            calendarId: calendarSync.googleCalendarId,
            autoScheduleBots: calendarSync.autoScheduleBots,
            onlyMeetingsWithLinks: calendarSync.onlyMeetingsWithLinks,
            platforms: calendarSync.platforms,
            webhook: {
                active: webhookActive,
                channelId: calendarSync.channelId || null,
                resourceId: calendarSync.resourceId || null,
                expiresAt: webhookExpiry?.toISOString() || null,
                expiresInDays: webhookExpiresIn,
                status: webhookActive ? '✅ Active' : '⚠️ Expired or Not Set'
            },
            scheduledBots: {
                total: scheduledBotsCount,
                recent: recentBots.map(bot => ({
                    id: bot._id?.toString(),
                    title: bot.title,
                    meetingUrl: bot.meetingUrl,
                    platform: bot.platform,
                    scheduledTime: bot.scheduledTime,
                    status: bot.status
                }))
            },
            lastSyncAt: calendarSync.lastSyncAt?.toISOString() || null,
            createdAt: calendarSync.createdAt.toISOString(),
            updatedAt: calendarSync.updatedAt.toISOString(),
            message: '✅ Calendar connected and working!'
        });

    } catch (error: any) {
        console.error('[Calendar Status] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get calendar status' },
            { status: 500 }
        );
    }
}
