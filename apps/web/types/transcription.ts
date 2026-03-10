/**
 * Vexa API Types and Interfaces
 */

export type MeetingPlatform = 'google_meet' | 'teams';

export type SessionStatus =
    | 'starting'    // Bot requested, not yet joined
    | 'active'      // Bot in meeting, transcribing
    | 'stopping'    // Stop requested, bot leaving
    | 'completed'   // Meeting ended, transcript available
    | 'failed';     // Error occurred

/**
 * Transcript segment from Vexa API
 */
export interface TranscriptSegment {
    start: number;                    // Relative time from meeting start (seconds)
    end: number;                      // Relative time from meeting start (seconds)
    text: string;                     // Transcribed text
    speaker: string;                  // Speaker name
    language: string;                 // Language code (e.g., 'en')
    absolute_start_time: string;      // ISO timestamp
    absolute_end_time: string;        // ISO timestamp
    created_at?: string;              // When segment was created
}

/**
 * Meeting session stored in our database
 */
export interface MeetingSession {
    _id: string;                      // MongoDB ObjectId
    userId: string;                   // User who requested transcription
    platform: MeetingPlatform;
    meetingUrl: string;               // Original URL provided by user
    nativeMeetingId: string;          // Extracted meeting code/ID
    passcode?: string;                // Teams passcode (if applicable)
    vexaBotId?: number;               // Bot ID from Vexa API
    status: SessionStatus;
    startTime?: Date;
    endTime?: Date;
    transcript?: TranscriptSegment[];
    metadata: {
        botName?: string;
        language?: string;
        participantCount?: number;
        speakers?: string[];
        totalSegments?: number;
        failureReason?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Vexa API Response Types
 */

// Response from POST /bots
export interface VexaBotResponse {
    id: number;
    user_id: number;
    platform: string;
    native_meeting_id: string;
    constructed_meeting_url: string;
    status: string;
    bot_container_id: string;
    start_time: string | null;
    end_time: string | null;
    data: Record<string, any>;
    created_at: string;
    updated_at: string;
}

// Response from GET /transcripts
export interface VexaTranscriptResponse {
    id: number;
    platform: string;
    native_meeting_id: string;
    constructed_meeting_url: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
    segments: TranscriptSegment[];
}

// Response from GET /bots/status
export interface VexaBotStatus {
    id: number;
    platform: string;
    native_meeting_id: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
}

/**
 * API Request/Response Types
 */

// POST /api/transcription/start
export interface StartTranscriptionRequest {
    meetingUrl: string;
    language?: string;
    botName?: string;
}

export interface StartTranscriptionResponse {
    sessionId: string;
    status: SessionStatus;
    platform: MeetingPlatform;
    meetingId: string;
    estimatedJoinTime: number;        // Seconds until bot joins (~10)
}

// POST /api/transcription/stop/:sessionId
export interface StopTranscriptionResponse {
    sessionId: string;
    status: SessionStatus;
    transcript: TranscriptSegment[];
    duration: number;                 // Meeting duration in seconds
    summary: {
        totalSegments: number;
        speakers: string[];
        languages: string[];
    };
}

// GET /api/transcription/status/:sessionId
export interface TranscriptionStatusResponse {
    sessionId: string;
    status: SessionStatus;
    startTime: string | null;
    duration: number | null;
    segmentCount: number;
    latestSegments: TranscriptSegment[];
}

// GET /api/transcription/:sessionId
export interface GetTranscriptResponse {
    sessionId: string;
    platform: MeetingPlatform;
    meetingUrl: string;
    status: SessionStatus;
    startTime: string | null;
    endTime: string | null;
    duration: number | null;
    transcript: TranscriptSegment[];
    metadata: {
        speakers: string[];
        languages: string[];
        totalWords: number;
        totalSegments: number;
    };
}

// GET /api/transcription/sessions
export interface ListSessionsResponse {
    sessions: MeetingSession[];
    total: number;
    limit: number;
    offset: number;
}

/**
 * Parsed meeting URL result
 */
export interface ParsedMeetingUrl {
    platform: MeetingPlatform;
    meetingId: string;
    passcode?: string;              // Only for Teams
    originalUrl: string;
}

/**
 * Error types
 */
export class TranscriptionError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500
    ) {
        super(message);
        this.name = 'TranscriptionError';
    }
}
