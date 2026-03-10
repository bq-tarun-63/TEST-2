import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { MeetingSessionService } from '@/services/meetingSessionService';
import type { ListSessionsResponse, SessionStatus } from '@/types/transcription';
import { TranscriptionError } from '@/types/transcription';

/**
 * GET /api/transcription/sessions
 * List all transcription sessions for the authenticated user
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Authenticate user
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        // 2. Parse query parameters
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status') as SessionStatus | null;
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        // 3. Validate parameters
        if (limit < 1 || limit > 100) {
            return NextResponse.json(
                { error: 'Limit must be between 1 and 100' },
                { status: 400 }
            );
        }

        if (offset < 0) {
            return NextResponse.json(
                { error: 'Offset must be non-negative' },
                { status: 400 }
            );
        }

        // 4. Get sessions from database
        const { sessions: rawSessions, total } = await MeetingSessionService.getUserSessions(
            auth.user.email,
            {
                status: status || undefined,
                limit,
                offset
            }
        );

        // 5. Format sessions to ensure proper types
        const sessions = rawSessions.map(s => ({
            ...s,
            _id: s._id?.toString() || '',
            userId: s.userId?.toString() || ''
        }));

        // 6. Return response
        const response: ListSessionsResponse = {
            sessions,
            total,
            limit,
            offset
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('[List Sessions Error]', error);

        if (error instanceof TranscriptionError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
            );
        }

        return NextResponse.json(
            { error: 'Failed to list sessions' },
            { status: 500 }
        );
    }
}
