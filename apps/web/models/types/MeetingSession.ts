import type { ObjectId } from "mongodb";
import type { MeetingPlatform, SessionStatus, TranscriptSegment } from "@/types/transcription";

/**
 * Meeting Session Interface
 * Stores transcription session data in MongoDB
 */
export interface IMeetingSession {
    _id?: string | ObjectId;
    userId: string | ObjectId;              // User who requested transcription
    platform: MeetingPlatform;              // 'google_meet' | 'teams'
    meetingUrl: string;                     // Original URL provided
    nativeMeetingId: string;                // Extracted meeting code/ID
    passcode?: string;                      // Teams passcode (if applicable)
    vexaBotId?: number;                     // Bot ID from Vexa API
    status: SessionStatus;                  // Session status
    startTime?: Date;                       // When bot joined meeting
    endTime?: Date;                         // When meeting ended
    transcript?: TranscriptSegment[];       // Complete transcript
    metadata: {
        botName?: string;
        language?: string;
        participantCount?: number;
        speakers?: string[];
        totalSegments?: number;
        totalWords?: number;
        failureReason?: string;             // Reason for failure (if status is 'failed')
        confirmed?: boolean;                // Whether transcript has been confirmed
        actionItems?: any[];                // Extracted action items from transcript
        confirmedAt?: Date;                 // When transcript was confirmed
        confirmedBy?: string;               // User who confirmed the transcript
    };
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Meeting Session Class
 */
export class MeetingSession implements IMeetingSession {
    _id?: string | ObjectId;
    userId: string | ObjectId;
    platform: MeetingPlatform;
    meetingUrl: string;
    nativeMeetingId: string;
    passcode?: string;
    vexaBotId?: number;
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
        totalWords?: number;
        failureReason?: string;
        confirmed?: boolean;
        actionItems?: any[];
        confirmedAt?: Date;
        confirmedBy?: string;
    };
    createdAt: Date;
    updatedAt: Date;

    constructor(session: IMeetingSession) {
        this._id = session._id;
        this.userId = session.userId;
        this.platform = session.platform;
        this.meetingUrl = session.meetingUrl;
        this.nativeMeetingId = session.nativeMeetingId;
        this.passcode = session.passcode;
        this.vexaBotId = session.vexaBotId;
        this.status = session.status;
        this.startTime = session.startTime;
        this.endTime = session.endTime;
        this.transcript = session.transcript;
        this.metadata = session.metadata || {};
        this.createdAt = session.createdAt || new Date();
        this.updatedAt = session.updatedAt || new Date();
    }

    /**
     * Format session for API response
     */
    static formatSession(session: IMeetingSession): any {
        const formatted = { ...session };

        if (session._id) {
            formatted._id = String(session._id);
        }

        if (session.userId) {
            formatted.userId = String(session.userId);
        }

        return formatted;
    }

    /**
     * Calculate meeting duration in seconds
     */
    getDuration(): number | null {
        if (!this.startTime || !this.endTime) {
            return null;
        }
        return Math.floor((this.endTime.getTime() - this.startTime.getTime()) / 1000);
    }

    /**
     * Get unique speakers from transcript
     */
    getSpeakers(): string[] {
        if (!this.transcript || this.transcript.length === 0) {
            return [];
        }
        return [...new Set(this.transcript.map(seg => seg.speaker))];
    }

    /**
     * Get unique languages from transcript
     */
    getLanguages(): string[] {
        if (!this.transcript || this.transcript.length === 0) {
            return [];
        }
        return [...new Set(this.transcript.map(seg => seg.language))];
    }

    /**
     * Count total words in transcript
     */
    getTotalWords(): number {
        if (!this.transcript || this.transcript.length === 0) {
            return 0;
        }
        return this.transcript.reduce((total, seg) => {
            return total + seg.text.trim().split(/\s+/).length;
        }, 0);
    }

    /**
     * Update metadata with calculated values
     */
    updateMetadata(): void {
        this.metadata.totalSegments = this.transcript?.length || 0;
        this.metadata.speakers = this.getSpeakers();
        this.metadata.totalWords = this.getTotalWords();
    }
}
