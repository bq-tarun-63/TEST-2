import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { MeetingSessionService } from '@/services/meetingSessionService';
import type { GetTranscriptResponse } from '@/types/transcription';
import { TranscriptionError } from '@/types/transcription';

/**
 * GET /api/transcription/[sessionId]
 * Get complete transcript for a session
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
    try {
        const { sessionId } = await params;

        // 1. Authenticate user 
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        // 2. Get session from database
        const meetingSession = await MeetingSessionService.getSessionById(sessionId);

        if (!meetingSession) {
            return NextResponse.json(
                { error: 'Session not found' },
                { status: 404 }
            );
        }

        // 3. Verify user owns this session
        if (meetingSession.userId !== auth.user.email) {
            return NextResponse.json(
                { error: 'Forbidden: You do not own this session' },
                { status: 403 }
            );
        }

        // 4. Calculate duration
        let duration: number | null = null;
        if (meetingSession.startTime && meetingSession.endTime) {
            duration = Math.floor(
                (meetingSession.endTime.getTime() - meetingSession.startTime.getTime()) / 1000
            );
        }

        // 5. Get metadata
        const transcript = meetingSession.transcript || [];
        const speakers = [...new Set(transcript.map(s => s.speaker))];
        const languages = [...new Set(transcript.map(s => s.language))];
        const totalWords = transcript.reduce((total, seg) => {
            return total + seg.text.trim().split(/\s+/).length;
        }, 0);

        // 6. Return response
        const response: GetTranscriptResponse = {
            sessionId,
            platform: meetingSession.platform,
            meetingUrl: meetingSession.meetingUrl,
            status: meetingSession.status,
            startTime: meetingSession.startTime?.toISOString() || null,
            endTime: meetingSession.endTime?.toISOString() || null,
            duration,
            transcript,
            metadata: {
                speakers,
                languages,
                totalWords,
                totalSegments: transcript.length
            }
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('[Get Transcript Error]', error);

        if (error instanceof TranscriptionError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        return NextResponse.json(
            { error: 'Failed to get transcript' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/transcription/[sessionId]
 * Delete a session and its transcript
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;

        // 1. Authenticate user
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        // 2. Get session from database
        const meetingSession = await MeetingSessionService.getSessionById(sessionId);

        if (!meetingSession) {
            return NextResponse.json(
                { error: 'Session not found' },
                { status: 404 }
            );
        }

        // 3. Verify user owns this session
        if (meetingSession.userId !== auth.user.email) {
            return NextResponse.json(
                { error: 'Forbidden: You do not own this session' },
                { status: 403 }
            );
        }

        // 4. Delete from database
        await MeetingSessionService.deleteSession(sessionId);

        // 5. Return success
        return NextResponse.json({
            success: true,
            message: 'Session deleted successfully'
        });

    } catch (error: any) {
        console.error('[Delete Session Error]', error);

        if (error instanceof TranscriptionError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        return NextResponse.json(
            { error: 'Failed to delete session' },
            { status: 500 }
        );
    }
}
