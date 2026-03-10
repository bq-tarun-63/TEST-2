import clientPromise from '@/lib/mongoDb/mongodb';
import { getVexaService } from '@/services/vexaService';
import { MeetingSessionService } from '@/services/meetingSessionService';
import { ObjectId } from 'mongodb';
import { IScheduledBot } from '@/models/types/scheduledBot';

/**
 * Bot Scheduler Service
 * Checks for scheduled bots and starts them at the right time
 */
export class BotSchedulerService {
    private static instance: BotSchedulerService;

    private constructor() { }

    static getInstance(): BotSchedulerService {
        if (!BotSchedulerService.instance) {
            BotSchedulerService.instance = new BotSchedulerService();
        }
        return BotSchedulerService.instance;
    }


    /**
     * Check for bots that should start now
     */
    public async checkAndStartBots() {
        try {
            const client = await clientPromise();
            const db = client.db();
            const scheduledBotsCollection = db.collection<IScheduledBot>('scheduled_bots');

            // Find bots scheduled to start in the next 2 minutes
            const now = new Date();
            const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);

            const botsToStart = await scheduledBotsCollection
                .find({
                    status: 'scheduled',
                    scheduledTime: {
                        $gte: now,
                        $lte: twoMinutesFromNow
                    }
                })
                .toArray();

            console.log(`[BotScheduler] Found ${botsToStart.length} bots to start`);

            // Start each bot
            for (const bot of botsToStart) {
                await this.startBot(bot);
            }

        } catch (error) {
            console.error('[BotScheduler] Error checking bots:', error);
        }
    }

    /**
     * Start a single bot
     */
    private async startBot(scheduledBot: any) {
        const client = await clientPromise();
        const db = client.db();

        const scheduledBotsCollection = db.collection<IScheduledBot>('scheduled_bots');

        try {
            console.log(`[BotScheduler] Starting bot for meeting: ${scheduledBot.nativeMeetingId}`);

            // 1. Update status to 'starting'
            await scheduledBotsCollection.updateOne(
                { _id: scheduledBot._id },
                {
                    $set: {
                        status: 'starting',
                        updatedAt: new Date()
                    }
                }
            );

            // 2. Create meeting session
            const sessionId = await MeetingSessionService.createSession({
                userId: scheduledBot.userId,
                meetingUrl: scheduledBot.meetingUrl,
                platform: scheduledBot.platform,
                nativeMeetingId: scheduledBot.nativeMeetingId,
                passcode: scheduledBot.passcode,
                status: 'starting',
                metadata: {
                    botName: scheduledBot.botName || 'Meeting Bot',
                    language: scheduledBot.language || 'en'
                }
            });

            // 3. Start Vexa bot
            const vexaService = getVexaService();
            const botResponse = await vexaService.startBot({
                platform: scheduledBot.platform,
                nativeMeetingId: scheduledBot.nativeMeetingId,
                passcode: scheduledBot.passcode,
                language: scheduledBot.language || 'en',
                botName: scheduledBot.botName || 'Meeting Bot'
            });

            // 4. Update session with bot ID
            await MeetingSessionService.setVexaBotId(
                sessionId,
                botResponse.id
            );

            // 5. Update scheduled bot status
            await scheduledBotsCollection.updateOne(
                { _id: scheduledBot._id },
                {
                    $set: {
                        status: 'active',
                        vexaBotId: botResponse.id,
                        sessionId: sessionId,
                        startedAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            );

            console.log(`[BotScheduler] ✅ Bot started successfully: ${botResponse.id}`);

        } catch (error: any) {
            console.error(`[BotScheduler] ❌ Error starting bot:`, error);

            // Update status to failed
            await scheduledBotsCollection.updateOne(
                { _id: scheduledBot._id },
                {
                    $set: {
                        status: 'failed',
                        failureReason: error.message,
                        updatedAt: new Date()
                    },
                    $inc: {
                        retryCount: 1
                    }
                }
            );

            // Retry if not exceeded max retries
            if ((scheduledBot.retryCount || 0) < 3) {
                // Schedule retry in 5 minutes
                const retryTime = new Date(Date.now() + 5 * 60 * 1000);
                await scheduledBotsCollection.updateOne(
                    { _id: scheduledBot._id },
                    {
                        $set: {
                            status: 'scheduled',
                            scheduledTime: retryTime,
                            updatedAt: new Date()
                        }
                    }
                );
                console.log(`[BotScheduler] Scheduled retry at ${retryTime.toISOString()}`);
            }
        }
    }

    /**
     * Cleanup completed bots (runs daily)
     */
    async cleanupOldBots() {
        try {
            const client = await clientPromise();
            const db = client.db();
            const scheduledBotsCollection = db.collection<IScheduledBot>('scheduled_bots');

            // Delete bots completed more than 30 days ago
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            const result = await scheduledBotsCollection.deleteMany({
                status: { $in: ['completed', 'cancelled', 'failed'] },
                updatedAt: { $lt: thirtyDaysAgo }
            });

            console.log(`[BotScheduler] Cleaned up ${result.deletedCount} old bots`);

        } catch (error) {
            console.error('[BotScheduler] Error cleaning up old bots:', error);
        }
    }
}

// Export singleton instance
export const botScheduler = BotSchedulerService.getInstance();
