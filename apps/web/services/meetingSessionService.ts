import { ObjectId, type Collection } from "mongodb";
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import type { IMeetingSession } from "@/models/types/MeetingSession";
import type { TranscriptSegment, SessionStatus, MeetingPlatform } from "@/types/transcription";

/**
 * Meeting Session Service
 * Database operations for meeting transcription sessions
 */
export const MeetingSessionService = {
    /**
     * Get the meeting sessions collection
     */
    async getCollection(): Promise<Collection<IMeetingSession>> {
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        return metadataDb.collection<IMeetingSession>("meetingSessions");
    },

    /**
     * Create a new meeting session
     */
    async createSession(session: Omit<IMeetingSession, '_id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const sessionsColl = await this.getCollection();

        const newSession: IMeetingSession = {
            ...session,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await sessionsColl.insertOne(newSession as any);
        return result.insertedId.toString();
    },

    /**
     * Get session by ID
     */
    async getSessionById(sessionId: string): Promise<IMeetingSession | null> {
        const sessionsColl = await this.getCollection();
        return sessionsColl.findOne({ _id: new ObjectId(sessionId) });
    },

    /**
     * Get session by meeting ID and platform
     */
    async getSessionByMeetingId(
        platform: MeetingPlatform,
        nativeMeetingId: string
    ): Promise<IMeetingSession | null> {
        const sessionsColl = await this.getCollection();
        return sessionsColl.findOne({
            platform,
            nativeMeetingId,
            status: { $in: ['starting', 'active', 'stopping'] } // Only active sessions
        });
    },

    /**
     * Update session status
     */
    async updateSessionStatus(
        sessionId: string,
        status: SessionStatus,
        additionalData?: Partial<IMeetingSession>
    ): Promise<void> {
        const sessionsColl = await this.getCollection();

        const updateData: any = {
            status,
            updatedAt: new Date()
        };

        if (additionalData) {
            Object.assign(updateData, additionalData);
        }

        await sessionsColl.updateOne(
            { _id: new ObjectId(sessionId) },
            { $set: updateData }
        );
    },

    /**
     * Update session with transcript
     */
    async updateTranscript(
        sessionId: string,
        transcript: TranscriptSegment[],
        status?: SessionStatus
    ): Promise<void> {
        const sessionsColl = await this.getCollection();

        const updateData: any = {
            transcript,
            updatedAt: new Date()
        };

        if (status) {
            updateData.status = status;
        }

        // Calculate metadata
        const speakers = [...new Set(transcript.map(seg => seg.speaker))];
        const languages = [...new Set(transcript.map(seg => seg.language))];
        const totalWords = transcript.reduce((total, seg) => {
            return total + seg.text.trim().split(/\s+/).length;
        }, 0);

        updateData['metadata.totalSegments'] = transcript.length;
        updateData['metadata.speakers'] = speakers;
        updateData['metadata.totalWords'] = totalWords;

        await sessionsColl.updateOne(
            { _id: new ObjectId(sessionId) },
            { $set: updateData }
        );
    },

    /**
     * Get all sessions for a user
     */
    async getUserSessions(
        userId: string,
        options?: {
            status?: SessionStatus;
            limit?: number;
            offset?: number;
        }
    ): Promise<{ sessions: IMeetingSession[]; total: number }> {
        const sessionsColl = await this.getCollection();

        const query: any = { userId };
        if (options?.status) {
            query.status = options.status;
        }

        const total = await sessionsColl.countDocuments(query);

        const sessions = await sessionsColl
            .find(query)
            .sort({ createdAt: -1 })
            .skip(options?.offset || 0)
            .limit(options?.limit || 20)
            .toArray();

        return { sessions, total };
    },

    /**
     * Delete a session
     */
    async deleteSession(sessionId: string): Promise<void> {
        const sessionsColl = await this.getCollection();
        await sessionsColl.deleteOne({ _id: new ObjectId(sessionId) });
    },

    /**
     * Set Vexa bot ID for a session
     */
    async setVexaBotId(sessionId: string, vexaBotId: number): Promise<void> {
        const sessionsColl = await this.getCollection();
        await sessionsColl.updateOne(
            { _id: new ObjectId(sessionId) },
            {
                $set: {
                    vexaBotId,
                    updatedAt: new Date()
                }
            }
        );
    },

    /**
     * Set meeting start time
     */
    async setStartTime(sessionId: string, startTime: Date): Promise<void> {
        const sessionsColl = await this.getCollection();
        await sessionsColl.updateOne(
            { _id: new ObjectId(sessionId) },
            {
                $set: {
                    startTime,
                    status: 'active',
                    updatedAt: new Date()
                }
            }
        );
    },

    /**
     * Set meeting end time
     */
    async setEndTime(sessionId: string, endTime: Date): Promise<void> {
        const sessionsColl = await this.getCollection();
        await sessionsColl.updateOne(
            { _id: new ObjectId(sessionId) },
            {
                $set: {
                    endTime,
                    status: 'completed',
                    updatedAt: new Date()
                }
            }
        );
    }
};
