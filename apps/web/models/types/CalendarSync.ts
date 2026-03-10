import { ObjectId } from 'mongodb';

/**
 * Calendar Sync Configuration
 * Stores user's Google Calendar connection and sync settings
 */
export interface ICalendarSync {
    _id?: ObjectId;
    userId: string;
    userEmail: string;
    workspaceId: string;

    // Google Calendar credentials
    googleCalendarId: string;      // 'primary' or specific calendar ID
    googleAccessToken: string;     // Encrypted access token
    googleRefreshToken: string;    // Encrypted refresh token
    googleTokenExpiry: Date;       // When access token expires

    // Webhook settings (for push notifications)
    channelId?: string;            // Google webhook channel ID
    resourceId?: string;           // Google webhook resource ID
    webhookExpiry?: Date;          // When webhook subscription expires

    // Sync settings
    autoScheduleBots: boolean;     // Enable/disable auto-scheduling
    onlyMeetingsWithLinks: boolean; // Only process events with meeting links
    platforms: string[];           // ['google_meet', 'zoom', 'teams']

    // Default bot settings
    defaultBotName?: string;
    defaultLanguage?: string;

    // Metadata
    isActive: boolean;
    lastSyncAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Google Calendar Event
 * Represents an event from Google Calendar API
 */
export interface GoogleCalendarEvent {
    id: string;
    summary: string;
    description?: string;
    location?: string;

    start: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };

    end: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };

    // Google Meet link (if using Google Meet)
    hangoutLink?: string;

    // Conference data for other platforms
    conferenceData?: {
        entryPoints?: Array<{
            entryPointType: string;
            uri: string;
            label?: string;
        }>;
        conferenceSolution?: {
            name: string;
            iconUri?: string;
        };
    };

    // Attendees
    attendees?: Array<{
        email: string;
        displayName?: string;
        responseStatus: string;
        organizer?: boolean;
        self?: boolean;
    }>;

    // Event status
    status: string; // 'confirmed', 'tentative', 'cancelled'

    // Organizer
    organizer?: {
        email: string;
        displayName?: string;
        self?: boolean;
    };

    // Metadata
    created: string;
    updated: string;
    htmlLink: string;
}

/**
 * Google OAuth Token Response
 */
export interface GoogleOAuthTokens {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

/**
 * Calendar Sync Request
 */
export interface CalendarSyncRequest {
    workspaceId: string;
    calendarId?: string;           // Default: 'primary'
    autoScheduleBots?: boolean;
    onlyMeetingsWithLinks?: boolean;
    platforms?: string[];
    defaultBotName?: string;
    defaultLanguage?: string;
}

/**
 * Calendar Event with Meeting Link
 */
export interface CalendarEventWithMeeting {
    eventId: string;
    summary: string;
    meetingUrl: string;
    platform: string;
    startTime: Date;
    endTime: Date;
    attendees: string[];
}
