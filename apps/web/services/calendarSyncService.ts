import { google } from 'googleapis';
import clientPromise from '@/lib/mongoDb/mongodb';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import {
    ICalendarSync,
    GoogleCalendarEvent,
    GoogleOAuthTokens,
    CalendarEventWithMeeting
} from '@/models/types/CalendarSync';
import { BotScheduleService } from './botScheduleService';
import { IScheduledBot } from '@/models/types/scheduledBot'

/**
 * Google Calendar Sync Service
 * Handles OAuth, event fetching, and auto-scheduling from Google Calendar
 */
export class CalendarSyncService {
    private static oauth2Client: any;

    /**
     * Initialize Google OAuth2 Client
     */
    private static getOAuth2Client() {
        if (!this.oauth2Client) {
            this.oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CALENDAR_CLIENT_ID,
                process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
                process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`
            );
        }
        return this.oauth2Client;
    }

    /**
     * Sign state to prevent CSRF
     */
    static signState(data: any): string {
        const json = JSON.stringify(data);
        const encodedData = Buffer.from(json).toString('base64');
        const secret = process.env.ENCRYPTION_KEY;
        if (!secret) {
            throw new Error('ENCRYPTION_KEY environment variable is not set');
        }

        const hmac = crypto.createHmac('sha256', secret);
        const signature = hmac.update(encodedData).digest('base64');

        // Return data.signature
        return `${encodedData}.${signature}`;
    }

    /**
     * Verify and decode state
     */
    static verifyState(state: string): { userId: string; workspaceId: string } {
        if (!state || !state.includes('.')) {
            throw new Error('Invalid state format');
        }

        const [encodedData, signature] = state.split('.');
        const secret = process.env.ENCRYPTION_KEY;
        if (!secret) {
            throw new Error('ENCRYPTION_KEY environment variable is not set');
        }

        const hmac = crypto.createHmac('sha256', secret);
        const expectedSignature = hmac.update(encodedData!).digest('base64');

        // Constant time comparison to prevent timing attacks
        // Use Buffer for proper base64 decoding, then convert to Uint8Array for timingSafeEqual
        const signatureBuffer = new Uint8Array(Buffer.from(signature!, 'base64'));
        const expectedBuffer = new Uint8Array(Buffer.from(expectedSignature, 'base64'));

        if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
            throw new Error('Invalid state signature (CSRF detected)');
        }

        return JSON.parse(Buffer.from(encodedData!, 'base64').toString('utf-8'));
    }

    /**
     * Generate Google OAuth URL for user to authorize
     */
    static getAuthUrl(userId: string, workspaceId: string): string {
        const oauth2Client = this.getOAuth2Client();

        // Store signed state for verification in callback
        const state = this.signState({ userId, workspaceId });

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent', // Force to get refresh token
            scope: [
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/calendar.events.readonly'
            ],
            state
        });
    }

    /**
     * Exchange authorization code for tokens
     */
    static async exchangeCodeForTokens(code: string): Promise<GoogleOAuthTokens> {
        const oauth2Client = this.getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        return tokens as GoogleOAuthTokens;
    }

    /**
     * Encrypt sensitive data before storing in DB
     */
    private static encrypt(text: string): string {
        const algorithm = 'aes-256-cbc' as const;
        const keyString = process.env.ENCRYPTION_KEY;
        if (!keyString) {
            throw new Error('ENCRYPTION_KEY environment variable is not set');
        }
        const key = Buffer.from(keyString, 'utf-8').subarray(0, 32);
        const iv = crypto.randomBytes(16);
        // @ts-expect-error - TypeScript has issues with Buffer types but this works correctly at runtime
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt sensitive data from DB
     */
    private static decrypt(text: string): string {
        const algorithm = 'aes-256-cbc' as const;
        const keyString = process.env.ENCRYPTION_KEY;
        if (!keyString) {
            throw new Error('ENCRYPTION_KEY environment variable is not set');
        }
        const key = Buffer.from(keyString, 'utf-8').subarray(0, 32);
        const parts = text.split(':');
        const iv = Buffer.from(parts[0]!, 'hex');
        const encryptedText = parts[1]!;
        // @ts-expect-error - TypeScript has issues with Buffer types but this works correctly at runtime
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Save calendar sync configuration
     */
    static async saveCalendarSync(
        userId: string,
        userEmail: string,
        workspaceId: string,
        tokens: GoogleOAuthTokens,
        settings: {
            calendarId?: string;
            autoScheduleBots?: boolean;
            onlyMeetingsWithLinks?: boolean;
            platforms?: string[];
            defaultBotName?: string;
            defaultLanguage?: string;
        }
    ): Promise<string> {
        const client = await clientPromise();
        const db = client.db();
        const calendarSyncCollection = db.collection<ICalendarSync>('calendar_syncs');

        // tokens.expires_in is in seconds (e.g., 3600 for 1 hour)
        // Convert to milliseconds and add to current timestamp
        const expiryDate = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

        const calendarSync: ICalendarSync = {
            userId,
            userEmail,
            workspaceId,
            googleCalendarId: settings.calendarId || 'primary',
            googleAccessToken: this.encrypt(tokens.access_token),
            googleRefreshToken: tokens.refresh_token ? this.encrypt(tokens.refresh_token) : '',
            googleTokenExpiry: expiryDate,
            autoScheduleBots: settings.autoScheduleBots ?? true,
            onlyMeetingsWithLinks: settings.onlyMeetingsWithLinks ?? true,
            platforms: settings.platforms || ['google_meet', 'zoom', 'teams'],
            defaultBotName: settings.defaultBotName,
            defaultLanguage: settings.defaultLanguage || 'en',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await calendarSyncCollection.updateOne(
            { userId, workspaceId },
            { $set: calendarSync },
            { upsert: true }
        );

        return result.upsertedId?.toString() || userId;
    }

    /**
     * Get calendar sync for user
     */
    static async getCalendarSync(userId: string, workspaceId: string): Promise<ICalendarSync | null> {
        const client = await clientPromise();
        const db = client.db();
        const calendarSyncCollection = db.collection<ICalendarSync>('calendar_syncs');

        return await calendarSyncCollection.findOne({ userId, workspaceId, isActive: true });
    }

    /**
     * Refresh access token if expired
     */
    static async refreshAccessToken(calendarSync: ICalendarSync): Promise<string> {
        try {
            const oauth2Client = this.getOAuth2Client();

            oauth2Client.setCredentials({
                refresh_token: this.decrypt(calendarSync.googleRefreshToken)
            });

            const { credentials } = await oauth2Client.refreshAccessToken();

            if (!credentials.access_token) {
                throw new Error('No access token received from Google');
            }

            // Update tokens in database
            const client = await clientPromise();
            const db = client.db();
            const calendarSyncCollection = db.collection<ICalendarSync>('calendar_syncs');

            // credentials.expiry_date is a timestamp in milliseconds (not seconds to add!)
            // If not provided, default to 1 hour from now
            const expiryDate = credentials.expiry_date
                ? new Date(credentials.expiry_date)
                : new Date(Date.now() + 3600 * 1000);

            await calendarSyncCollection.updateOne(
                { _id: calendarSync._id },
                {
                    $set: {
                        googleAccessToken: this.encrypt(credentials.access_token),
                        googleTokenExpiry: expiryDate,
                        updatedAt: new Date()
                    }
                }
            );

            console.log(`[CalendarSync] ✅ Token refreshed successfully for user ${calendarSync.userId}`);

            return credentials.access_token;
        } catch (error: any) {
            console.error('[CalendarSync] Token refresh failed:', error.message);

            // If refresh token is invalid, mark calendar sync as inactive
            if (error.message?.includes('invalid_grant') || error.message?.includes('Token has been expired or revoked')) {
                const client = await clientPromise();
                const db = client.db();
                await db.collection<ICalendarSync>('calendar_syncs').updateOne(
                    { _id: calendarSync._id },
                    { $set: { isActive: false, updatedAt: new Date() } }
                );

                throw new Error('Calendar connection expired. Please reconnect your calendar.');
            }

            throw error;
        }
    }

    /**
     * Get valid access token (refresh if needed)
     */
    static async getValidAccessToken(calendarSync: ICalendarSync): Promise<string> {
        const now = new Date();

        // Check if token is missing or invalid
        if (!calendarSync.googleAccessToken || !calendarSync.googleTokenExpiry) {
            throw new Error('Calendar sync has no valid tokens. Please reconnect your calendar.');
        }

        // Refresh if token is expired OR will expire in less than 5 minutes
        const timeUntilExpiry = calendarSync.googleTokenExpiry.getTime() - now.getTime();
        const isExpiredOrExpiringSoon = timeUntilExpiry < 5 * 60 * 1000; // 5 minutes buffer

        if (isExpiredOrExpiringSoon) {
            console.log(`[CalendarSync] Token expired or expiring soon (${Math.floor(timeUntilExpiry / 1000)}s remaining), refreshing...`);
            return await this.refreshAccessToken(calendarSync);
        }

        return this.decrypt(calendarSync.googleAccessToken);
    }

    /**
     * Fetch calendar events
     */
    static async fetchCalendarEvents(
        userId: string,
        workspaceId: string,
        timeMin?: Date,
        timeMax?: Date
    ): Promise<GoogleCalendarEvent[]> {
        const calendarSync = await this.getCalendarSync(userId, workspaceId);

        if (!calendarSync) {
            throw new Error('Calendar sync not found for user');
        }

        const accessToken = await this.getValidAccessToken(calendarSync);
        const oauth2Client = this.getOAuth2Client();
        oauth2Client.setCredentials({ access_token: accessToken });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const response = await calendar.events.list({
            calendarId: calendarSync.googleCalendarId,
            timeMin: (timeMin || new Date()).toISOString(),
            timeMax: timeMax?.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 50
        });

        return response.data.items as GoogleCalendarEvent[];
    }

    /**
     * Extract meeting link from calendar event
     */
    static extractMeetingLink(event: GoogleCalendarEvent): CalendarEventWithMeeting | null {
        let meetingUrl: string | null = null;
        let platform: string | null = null;

        // Check for Google Meet hangout link
        if (event.hangoutLink) {
            meetingUrl = event.hangoutLink;
            platform = 'google_meet';
        }

        // Check conference data for other platforms
        if (!meetingUrl && event.conferenceData?.entryPoints) {
            for (const entryPoint of event.conferenceData.entryPoints) {
                if (entryPoint.entryPointType === 'video' && entryPoint.uri) {
                    meetingUrl = entryPoint.uri;

                    // Detect platform from URL
                    if (entryPoint.uri.includes('zoom.us')) {
                        platform = 'zoom';
                    } else if (entryPoint.uri.includes('teams.microsoft.com') || entryPoint.uri.includes('teams.live.com')) {
                        platform = 'teams';
                    } else if (entryPoint.uri.includes('meet.google.com')) {
                        platform = 'google_meet';
                    }
                    break;
                }
            }
        }

        // Check description for meeting links
        if (!meetingUrl && event.description) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urls = event.description.match(urlRegex);

            if (urls) {
                for (const url of urls) {
                    if (url.includes('zoom.us')) {
                        meetingUrl = url;
                        platform = 'zoom';
                        break;
                    } else if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) {
                        meetingUrl = url;
                        platform = 'teams';
                        break;
                    } else if (url.includes('meet.google.com')) {
                        meetingUrl = url;
                        platform = 'google_meet';
                        break;
                    }
                }
            }
        }

        if (!meetingUrl || !platform) {
            return null;
        }

        const startTime = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date!);
        const endTime = event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date!);

        return {
            eventId: event.id,
            summary: event.summary,
            meetingUrl,
            platform,
            startTime,
            endTime,
            attendees: event.attendees?.map(a => a.email) || []
        };
    }

    /**
     * Auto-schedule bot from calendar event
     */
    static async scheduleFromCalendarEvent(
        event: GoogleCalendarEvent,
        userId: string,
        userEmail: string,
        workspaceId: string
    ): Promise<string | null> {
        const calendarSync = await this.getCalendarSync(userId, workspaceId);

        if (!calendarSync || !calendarSync.autoScheduleBots) {
            return null;
        }

        const meetingData = this.extractMeetingLink(event);

        if (!meetingData) {
            if (calendarSync.onlyMeetingsWithLinks) {
                return null; // Skip events without meeting links
            }
            throw new Error('No meeting link found in calendar event');
        }

        // Check if platform is enabled
        if (!calendarSync.platforms.includes(meetingData.platform)) {
            return null;
        }

        // Check if event is in the future
        if (meetingData.startTime <= new Date()) {
            return null;
        }

        // Check if bot is already scheduled for this meeting
        const client = await clientPromise();
        const db = client.db();
        const existingBot = await db.collection<IScheduledBot>('scheduled_bots').findOne({
            meetingUrl: meetingData.meetingUrl,
            status: { $in: ['scheduled', 'starting', 'active'] }
        });

        if (existingBot) {
            console.log(`[CalendarSync] Bot already scheduled for meeting: ${meetingData.meetingUrl}, skipping...`);
            return existingBot._id.toString();
        }

        // Schedule the bot
        const result = await BotScheduleService.scheduleBot({
            userId,
            userEmail,
            requestData: {
                meetingUrl: meetingData.meetingUrl,
                scheduledTime: meetingData.startTime.toISOString(),
                workspaceId,
                platform: meetingData.platform as 'zoom' | 'google_meet' | 'teams' | 'webex',
                duration: Math.ceil((meetingData.endTime.getTime() - meetingData.startTime.getTime()) / 60000), // Duration in minutes
                botName: calendarSync.defaultBotName || 'Calendar Bot',
                language: calendarSync.defaultLanguage || 'en',
                title: event.summary,
                description: `Auto-scheduled from Google Calendar event: ${event.summary}`
            }
        });


        return result.scheduledBotId;
    }

    /**
     * Sync calendar events and auto-schedule bots
     */
    static async syncCalendarEvents(userId: string, workspaceId: string): Promise<{
        totalEvents: number;
        scheduledBots: number;
        skippedEvents: number;
    }> {
        const events = await this.fetchCalendarEvents(userId, workspaceId);

        let scheduledBots = 0;
        let skippedEvents = 0;

        const calendarSync = await this.getCalendarSync(userId, workspaceId);
        if (!calendarSync) {
            throw new Error('Calendar sync not found');
        }

        for (const event of events) {
            try {
                const botId = await this.scheduleFromCalendarEvent(
                    event,
                    userId,
                    calendarSync.userEmail,
                    workspaceId
                );

                if (botId) {
                    scheduledBots++;
                } else {
                    skippedEvents++;
                }
            } catch (error) {
                console.error(`[CalendarSync] Error scheduling event ${event.id}:`, error);
                skippedEvents++;
            }
        }

        // Update last sync time
        const client = await clientPromise();
        const db = client.db();
        await db.collection<ICalendarSync>('calendar_syncs').updateOne(
            { userId, workspaceId },
            { $set: { lastSyncAt: new Date(), updatedAt: new Date() } }
        );

        return {
            totalEvents: events.length,
            scheduledBots,
            skippedEvents
        };
    }

    /**
     * Setup Google Calendar webhook (push notifications)
     */
    static async setupWebhook(userId: string, workspaceId: string): Promise<{
        channelId: string;
        resourceId: string;
        expiration: Date;
    }> {
        const calendarSync = await this.getCalendarSync(userId, workspaceId);

        if (!calendarSync) {
            throw new Error('Calendar sync not found');
        }

        const accessToken = await this.getValidAccessToken(calendarSync);
        const oauth2Client = this.getOAuth2Client();
        oauth2Client.setCredentials({ access_token: accessToken });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // Generate unique channel ID
        const channelId = `calendar-${userId}-${workspaceId}-${Date.now()}`;

        // Webhook URL (use ngrok URL or production URL)
        const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/google-calendar`;



        // Setup push notification channel
        const response = await calendar.events.watch({
            calendarId: calendarSync.googleCalendarId,
            requestBody: {
                id: channelId,
                type: 'web_hook',
                address: webhookUrl,
                // Webhook expires after 7 days (max allowed by Google)
                expiration: (Date.now() + 7 * 24 * 60 * 60 * 1000).toString()
            }
        });

        const resourceId = response.data.resourceId!;
        const expiration = new Date(parseInt(response.data.expiration!));

        // Save webhook details to database
        const client = await clientPromise();
        const db = client.db();
        await db.collection<ICalendarSync>('calendar_syncs').updateOne(
            { userId, workspaceId },
            {
                $set: {
                    channelId,
                    resourceId,
                    webhookExpiry: expiration,
                    updatedAt: new Date()
                }
            }
        );

        console.log(`[CalendarSync] ✅ Webhook setup successful for user ${userId}, expires in 7 days`);

        return { channelId, resourceId, expiration };
    }

    /**
     * Renew webhook (should be called before expiry)
     */
    static async renewWebhook(userId: string, workspaceId: string): Promise<void> {
        const calendarSync = await this.getCalendarSync(userId, workspaceId);

        if (!calendarSync) {
            throw new Error('Calendar sync not found');
        }

        // Stop old webhook if exists
        if (calendarSync.channelId && calendarSync.resourceId) {
            try {
                await this.stopWebhook(userId, workspaceId);
            } catch (error) {
                console.error('[CalendarSync] Error stopping old webhook:', error);
            }
        }

        // Setup new webhook
        await this.setupWebhook(userId, workspaceId);
    }

    /**
     * Stop webhook
     */
    static async stopWebhook(userId: string, workspaceId: string): Promise<void> {
        const calendarSync = await this.getCalendarSync(userId, workspaceId);

        if (!calendarSync || !calendarSync.channelId || !calendarSync.resourceId) {
            return;
        }

        const accessToken = await this.getValidAccessToken(calendarSync);
        const oauth2Client = this.getOAuth2Client();
        oauth2Client.setCredentials({ access_token: accessToken });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        try {
            await calendar.channels.stop({
                requestBody: {
                    id: calendarSync.channelId,
                    resourceId: calendarSync.resourceId
                }
            });
        } catch (error) {
            console.error('[CalendarSync] Error stopping webhook:', error);
        }

        // Clear webhook details from database
        const client = await clientPromise();
        const db = client.db();
        await db.collection<ICalendarSync>('calendar_syncs').updateOne(
            { userId, workspaceId },
            {
                $unset: {
                    channelId: '',
                    resourceId: '',
                    webhookExpiry: ''
                },
                $set: {
                    updatedAt: new Date()
                }
            }
        );
    }

    /**
     * Disconnect calendar sync
     */
    static async disconnectCalendar(userId: string, workspaceId: string): Promise<void> {
        // Stop webhook first
        await this.stopWebhook(userId, workspaceId);

        const client = await clientPromise();
        const db = client.db();
        const calendarSyncCollection = db.collection<ICalendarSync>('calendar_syncs');

        await calendarSyncCollection.updateOne(
            { userId, workspaceId },
            { $set: { isActive: false, updatedAt: new Date() } }
        );
    }
}
