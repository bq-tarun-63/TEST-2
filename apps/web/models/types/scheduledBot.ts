import { ObjectId } from 'mongodb';

/**
 * Scheduled Meeting Bot
 * Represents a meeting where a bot should join at a specific time
 */
export interface IScheduledBot {
    _id?: ObjectId;
    userId: string;                      // User who scheduled the bot
    userEmail: string;
    workspaceId: string;
    workareaId?: string;

    // Meeting details
    meetingUrl: string;                  // Full meeting URL
    platform: 'zoom' | 'google_meet' | 'teams' | 'webex';
    nativeMeetingId: string;             // Extracted meeting ID
    passcode?: string;                   // For Teams meetings

    // Schedule
    scheduledTime: Date;                 // When bot should join
    duration?: number;                   // Expected duration in minutes
    timezone?: string;                   // User's timezone

    // Bot configuration
    botName?: string;                    // Custom bot name
    language?: string;                   // Transcription language

    // Status
    status: 'scheduled' | 'starting' | 'active' | 'completed' | 'failed' | 'cancelled';
    vexaBotId?: number;                  // Bot ID from Vexa (when started)
    sessionId?: string;                  // Meeting session ID (when created)

    // Metadata
    title?: string;                      // Meeting title
    description?: string;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
    startedAt?: Date;                    // When bot actually joined
    completedAt?: Date;                  // When bot left

    // Error handling
    failureReason?: string;
    retryCount?: number;
}

/**
 * Request to schedule a bot
 */
export interface ScheduleBotRequest {
    meetingUrl: string;
    scheduledTime: string;               // ISO 8601 format
    platform?: 'zoom' | 'google_meet' | 'teams' | 'webex';
    passcode?: string;
    duration?: number;
    botName?: string;
    language?: string;
    title?: string;
    description?: string;
    workspaceId: string;
    workareaId?: string;
}

/**
 * Response when scheduling a bot
 */
export interface ScheduleBotResponse {
    success: boolean;
    scheduledBotId: string;
    scheduledTime: string;
    message: string;
}
