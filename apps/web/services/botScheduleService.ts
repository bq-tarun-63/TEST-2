import clientPromise from '@/lib/mongoDb/mongodb';
import { ObjectId } from 'mongodb';
import { ScheduleBotRequest, IScheduledBot } from '@/models/types/scheduledBot';

/**
 * Extract platform and meeting ID from meeting URL
 * Platform names match Vexa API convention (google_meet, not google-meet)
 */
function extractMeetingInfo(url: string): { platform: string; meetingId: string } | null {
    // Zoom: https://zoom.us/j/1234567890 or https://us05web.zoom.us/j/1234567890
    const zoomMatch = url.match(/zoom\.us\/j\/(\d+)/);
    if (zoomMatch) {
        return { platform: 'zoom', meetingId: zoomMatch[1]! };
    }

    // Google Meet: https://meet.google.com/abc-defg-hij
    const meetMatch = url.match(/meet\.google\.com\/([a-z\-]+)/);
    if (meetMatch) {
        return { platform: 'google_meet', meetingId: meetMatch[1]! };
    }

    // Teams: https://teams.microsoft.com/l/meetup-join/... or https://teams.live.com/meet/...
    const teamsMatch = url.match(/teams\.(microsoft|live)\.com\/(l\/meetup-join\/([^?]+)|meet\/(\d+))/);
    if (teamsMatch) {
        const meetingId = teamsMatch[3] || teamsMatch[4];
        return { platform: 'teams', meetingId: meetingId! };
    }

    // Webex: https://company.webex.com/meet/username or https://company.webex.com/company/j.php?MTID=...
    const webexMatch = url.match(/webex\.com\/(?:meet\/([^\/]+)|.*MTID=([^&]+))/);
    if (webexMatch) {
        return { platform: 'webex', meetingId: (webexMatch[1] || webexMatch[2])! };
    }

    return null;
}

export const BotScheduleService = {
    /**
     * Schedule a bot to join a meeting at a specific time
     */
    async scheduleBot({
        userId,
        userEmail,
        requestData
    }: {
        userId: string;
        userEmail: string;
        requestData: ScheduleBotRequest;
    }): Promise<{ scheduledBotId: string; scheduledTime: string; message: string }> {
        const {
            meetingUrl,
            scheduledTime,
            platform,
            passcode,
            duration,
            botName,
            language,
            title,
            description,
            workspaceId,
            workareaId
        } = requestData;
          
        // 1. Validate required fields
        if (!meetingUrl || !scheduledTime || !workspaceId) {
            throw new Error('meetingUrl, scheduledTime, and workspaceId are required');
        }
       

        // 2. Parse and validate scheduled time
        const scheduledDate = new Date(scheduledTime);
        if (isNaN(scheduledDate.getTime())) {
            throw new Error('Invalid scheduledTime format. Use ISO 8601 format.');
        }

        // Check if time is in the future
        if (scheduledDate <= new Date()) {
            throw new Error('scheduledTime must be in the future');
        }

        // 3. Extract meeting platform and ID from URL
        const meetingInfo = extractMeetingInfo(meetingUrl);
        if (!meetingInfo) {
            throw new Error('Invalid meeting URL. Supported platforms: Zoom, Google Meet, Teams, Webex');
        }

        // 4. Connect to database
        const client = await clientPromise();
        const db = client.db();
        const scheduledBotsCollection = db.collection<IScheduledBot>('scheduled_bots');
 if(platform!=="zoom" && platform!=="google_meet" && platform!=="teams" && platform!=="webex"){
            throw new Error('Invalid platform. Supported platforms: zoom, google_meet, teams, webex');
        }
        // 5. Create scheduled bot document
        const scheduledBot: IScheduledBot = {
            userId: userEmail,
            userEmail: userEmail,
            workspaceId,
            workareaId: workareaId || "",

            meetingUrl,
            platform: platform || meetingInfo.platform,
            nativeMeetingId: meetingInfo.meetingId,
            passcode: passcode || "",

            scheduledTime: scheduledDate,
            duration: duration || 60,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

            botName: botName || 'Meeting Bot',
            language: language || 'en',

            status: 'scheduled',

            title: title || `Meeting on ${scheduledDate.toLocaleDateString()}`,
            description: description || "",

            createdAt: new Date(),
            updatedAt: new Date(),

            retryCount: 0
        };

        // 6. Insert into database
        const result = await scheduledBotsCollection.insertOne(scheduledBot);

        return {
            scheduledBotId: result.insertedId.toString(),
            scheduledTime: scheduledDate.toISOString(),
            message: `Bot scheduled to join meeting at ${scheduledDate.toLocaleString()}`
        };
    },

    /**
     * Get all scheduled bots for a user
     */
    async getScheduledBots({
        userId,
        workspaceId,
        status,
        limit = 50,
        skip = 0
    }: {
        userId: string;
        workspaceId?: string;
        status?: string;
        limit?: number;
        skip?: number;
    }): Promise<{ scheduledBots: any[]; total: number; limit: number; skip: number }> {
        const client = await clientPromise();
        const db = client.db();
        const scheduledBotsCollection = db.collection<IScheduledBot>('scheduled_bots');

        // Build query
        const query: any = {
            userId: userId
        };

        if (workspaceId) {
            query.workspaceId = workspaceId;
        }

        if (status) {
            query.status = status;
        }

        // Fetch scheduled bots
        const scheduledBots = await scheduledBotsCollection
            .find(query)
            .sort({ scheduledTime: -1 }) // Most recent first
            .skip(skip)
            .limit(limit)
            .toArray();

        // Get total count
        const total = await scheduledBotsCollection.countDocuments(query);

        return {
            scheduledBots,
            total,
            limit,
            skip
        };
    },

    /**
     * Get a specific scheduled bot by ID
     */
    async getScheduledBotById({
        botId,
        userId
    }: {
        botId: string;
        userId: string;
    }): Promise<any> {
        // Validate ID
        if (!ObjectId.isValid(botId)) {
            throw new Error('Invalid scheduled bot ID');
        }

        const client = await clientPromise();
        const db = client.db();
        const scheduledBotsCollection = db.collection<IScheduledBot>('scheduled_bots');

        // Fetch scheduled bot
        const scheduledBot = await scheduledBotsCollection.findOne({
            _id: new ObjectId(botId),
            userId: userId // Ensure user owns this
        });

        if (!scheduledBot) {
            throw new Error('Scheduled bot not found');
        }

        return scheduledBot;
    },

    /**
     * Cancel/Delete a scheduled bot
     */
    async cancelScheduledBot({
        botId,
        userId
    }: {
        botId: string;
        userId: string;
    }): Promise<{ message: string }> {
        // Validate ID
        if (!ObjectId.isValid(botId)) {
            throw new Error('Invalid scheduled bot ID');
        }

        const client = await clientPromise();
        const db = client.db();
        const scheduledBotsCollection = db.collection<IScheduledBot>('scheduled_bots');

        // Find the scheduled bot
        const scheduledBot = await scheduledBotsCollection.findOne({
            _id: new ObjectId(botId),
            userId: userId
        });

        if (!scheduledBot) {
            throw new Error('Scheduled bot not found');
        }

        // Check if bot is already active
        if (scheduledBot.status === 'active' && scheduledBot.vexaBotId) {
            // If bot is already running, we need to stop it via Vexa API
            try {
                const { getVexaService } = await import('@/services/vexaService');
                const vexaService = getVexaService();
                await vexaService.stopBot(scheduledBot.platform as any, scheduledBot.nativeMeetingId);
            } catch (error) {
                console.error('Error stopping active bot:', error);
                // Continue with cancellation even if stop fails
            }
        }

        // Update status to cancelled
        await scheduledBotsCollection.updateOne(
            { _id: new ObjectId(botId) },
            {
                $set: {
                    status: 'cancelled',
                    updatedAt: new Date()
                }
            }
        );

        return {
            message: 'Scheduled bot cancelled successfully'
        };
    }
};
