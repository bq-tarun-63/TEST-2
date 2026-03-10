import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { parseMeetingUrl } from '@/utils/meetingUrlParser';
import { getVexaService } from '@/services/vexaService';
import { MeetingSessionService } from '@/services/meetingSessionService';
import type { StartTranscriptionRequest, StartTranscriptionResponse } from '@/types/transcription';
import { TranscriptionError } from '@/types/transcription';

/**
 * POST /api/transcription/start
 * Start a transcription bot for a meeting
 */
export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate user
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        const userEmail = auth.user.email;

        // 2. Parse request body
        const body: StartTranscriptionRequest = await req.json();
        const { meetingUrl, language, botName } = body;

        if (!meetingUrl) {
            return NextResponse.json(
                { error: 'Meeting URL is required' },
                { status: 400 }
            );
        }

        // 3. Parse meeting URL to extract platform and meeting ID
        const parsed = parseMeetingUrl(meetingUrl);

        // 4. Check if bot already exists for this meeting
        const existingSession = await MeetingSessionService.getSessionByMeetingId(
            parsed.platform,
            parsed.meetingId
        );

        if (existingSession) {
            // Only block if session is actively running
            // Allow restart if previous attempt failed or completed
            if (['starting', 'active', 'stopping'].includes(existingSession.status)) {
                return NextResponse.json(
                    {
                        error: 'Bot already active for this meeting',
                        sessionId: existingSession._id?.toString(),
                        status: existingSession.status
                    },
                    { status: 409 }
                );
            }

            // If previous session failed/completed, we can start a new one
            // The old session will remain in history
            console.log(`[Start] Previous session ${existingSession.status}, allowing new bot`);
        }

        // 5. Create session in database (status: starting)
        const sessionId = await MeetingSessionService.createSession({
            userId: userEmail, // Using email from header
            platform: parsed.platform,
            meetingUrl: parsed.originalUrl,
            nativeMeetingId: parsed.meetingId,
            passcode: parsed.passcode,
            status: 'starting',
            metadata: {
                botName: botName || 'TranscriptionBot',
                language: language || 'en'
            }
        });

        // 6. Request bot from Vexa API
        const vexaService = getVexaService();
        const botResponse = await vexaService.startBot({
            platform: parsed.platform,
            nativeMeetingId: parsed.meetingId,
            passcode: parsed.passcode,
            language: language || 'en',
            botName: botName || 'TranscriptionBot'
        });

        // 7. Update session with Vexa bot ID
        await MeetingSessionService.setVexaBotId(sessionId, botResponse.id);

        // 8. If bot has already started, update start time
        if (botResponse.start_time) {
            await MeetingSessionService.setStartTime(
                sessionId,
                new Date(botResponse.start_time)
            );
        }

        // 9. Return response
        const response: StartTranscriptionResponse = {
            sessionId,
            status: 'starting',
            platform: parsed.platform,
            meetingId: parsed.meetingId,
            estimatedJoinTime: 10 // Bot typically joins in ~10 seconds
        };

        return NextResponse.json(response, { status: 201 });

    } catch (error: any) {
        console.error('[Start Transcription Error]', error);

        if (error instanceof TranscriptionError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        return NextResponse.json(
            { error: 'Failed to start transcription' },
            { status: 500 }
        );
    }
}
