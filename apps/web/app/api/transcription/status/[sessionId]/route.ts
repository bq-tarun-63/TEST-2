import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { getVexaService } from '@/services/vexaService';
import { MeetingSessionService } from '@/services/meetingSessionService';
import type { TranscriptionStatusResponse } from '@/types/transcription';
import { TranscriptionError } from '@/types/transcription';

/**
 * GET /api/transcription/status/[sessionId]
 * Get current status and latest transcript segments
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        // Await params for Next.js 15 compatibility
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

        // 4. If session is active/starting, check if bot is still running
        let latestSegments = meetingSession.transcript || [];

        if (meetingSession.status === 'active' || meetingSession.status === 'starting') {
            try {
                const vexaService = getVexaService();

                // Try to get transcript - if this fails with 404, bot doesn't exist
                const transcriptData = await vexaService.getTranscript(
                    meetingSession.platform,
                    meetingSession.nativeMeetingId
                );

                // Bot exists and is running!
                latestSegments = transcriptData.segments;

                // Update session with latest transcript
                if (transcriptData.segments.length > 0) {
                    await MeetingSessionService.updateTranscript(
                        sessionId,
                        transcriptData.segments
                    );
                }

                // If bot just started, update status to active
                if (meetingSession.status === 'starting' && transcriptData.start_time) {
                    await MeetingSessionService.setStartTime(
                        sessionId,
                        new Date(transcriptData.start_time)
                    );
                    meetingSession.status = 'active';
                    meetingSession.startTime = new Date(transcriptData.start_time);
                }

            } catch (error: any) {
                console.error('[Get Latest Status Error]', error);

                // If we get a 404 or similar error, bot doesn't exist (rejected/failed)
                if (error instanceof TranscriptionError && error.statusCode === 404) {
                    console.warn('[Status Check] Bot not found (404), marking as failed');
                    await MeetingSessionService.updateSessionStatus(
                        sessionId,
                        'failed',
                        {
                            endTime: new Date(),
                            metadata: {
                                ...meetingSession.metadata,
                                failureReason: 'Bot was rejected, removed, or failed to join'
                            }
                        }
                    );

                    // Update local session object for response
                    meetingSession.status = 'failed';
                    meetingSession.endTime = new Date();
                }
                // For other errors (network issues, etc.), continue with cached data
            }
        }

        // 5. Calculate duration
        let duration: number | null = null;
        if (meetingSession.startTime) {
            const endTime = meetingSession.endTime || new Date();
            duration = Math.floor((endTime.getTime() - meetingSession.startTime.getTime()) / 1000);
        }

        // 6. Return response with latest 10 segments
        const response: TranscriptionStatusResponse = {
            sessionId,
            status: meetingSession.status,
            startTime: meetingSession.startTime?.toISOString() || null,
            duration,
            segmentCount: latestSegments.length,
            latestSegments: latestSegments.slice(-10) // Last 10 segments
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('[Get Status Error]', error);

        if (error instanceof TranscriptionError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        return NextResponse.json(
            { error: 'Failed to get transcription status' },
            { status: 500 }
        );
    }
}
