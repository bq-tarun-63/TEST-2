import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { getVexaService } from '@/services/vexaService';
import { MeetingSessionService } from '@/services/meetingSessionService';
import type { StopTranscriptionResponse } from '@/types/transcription';
import { TranscriptionError } from '@/types/transcription';

/**
 * POST /api/transcription/stop/[sessionId]
 * Manually stop a transcription bot and retrieve complete transcript
 */
export async function POST(
    req: NextRequest,
    { params }: { params: { sessionId: string } }
) {
    try {
        const { sessionId } = params;

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

        // 4. Check if session is already completed
        if (meetingSession.status === 'completed') {
            return NextResponse.json(
                { error: 'Session already completed' },
                { status: 400 }
            );
        }

        // 5. Update status to stopping
        await MeetingSessionService.updateSessionStatus(sessionId, 'stopping');

        // 6. Stop bot via Vexa API
        const vexaService = getVexaService();
        await vexaService.stopBot(
            meetingSession.platform,
            meetingSession.nativeMeetingId
        );

        // 7. Get complete transcript
        const transcriptData = await vexaService.getTranscript(
            meetingSession.platform,
            meetingSession.nativeMeetingId
        );

        // 8. Update session with transcript and mark as completed
        await MeetingSessionService.updateTranscript(
            sessionId,
            transcriptData.segments,
            'completed'
        );

        // 9. Set end time
        if (transcriptData.end_time) {
            await MeetingSessionService.setEndTime(
                sessionId,
                new Date(transcriptData.end_time)
            );
        } else {
            await MeetingSessionService.setEndTime(sessionId, new Date());
        }

        // 10. Get updated session for response
        const updatedSession = await MeetingSessionService.getSessionById(sessionId);

        if (!updatedSession) {
            throw new Error('Failed to retrieve updated session');
        }

        // 11. Calculate summary
        const speakers = [...new Set(transcriptData.segments.map(s => s.speaker))];
        const languages = [...new Set(transcriptData.segments.map(s => s.language))];

        const duration = updatedSession.startTime && updatedSession.endTime
            ? Math.floor((updatedSession.endTime.getTime() - updatedSession.startTime.getTime()) / 1000)
            : 0;

        // 12. Return response
        const response: StopTranscriptionResponse = {
            sessionId,
            status: 'completed',
            transcript: transcriptData.segments,
            duration,
            summary: {
                totalSegments: transcriptData.segments.length,
                speakers,
                languages
            }
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('[Stop Transcription Error]', error);

        if (error instanceof TranscriptionError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        return NextResponse.json(
            { error: 'Failed to stop transcription' },
            { status: 500 }
        );
    }
}
