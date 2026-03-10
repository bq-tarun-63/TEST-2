import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { MeetingSessionService } from '@/services/meetingSessionService';
import type { TranscriptSegment } from '@/types/transcription';

/**
 * POST /api/transcription/confirm/[sessionId]
 * Confirm transcript and extract action items
 */
export async function POST(
    req: NextRequest) {
    try {
     
        const body = await req.json();
        const { confirmed, actionItems ,sessionId } = body;

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

        // 4. Get confirmation data from request
       
        // 5. Extract action items from transcript if not provided
        let extractedTasks = actionItems;

        if (!extractedTasks && meetingSession.transcript) {
            extractedTasks = extractActionItems(meetingSession.transcript);
        }

        // 6. Update session with confirmation status
        await MeetingSessionService.updateSessionStatus(
            sessionId,
            meetingSession.status,
            {
                metadata: {
                    ...meetingSession.metadata,
                    confirmed,
                    actionItems: extractedTasks,
                    confirmedAt: new Date(),
                    confirmedBy: auth.user.email
                }
            }
        );

        // 7. Return response
        return NextResponse.json({
            success: true,
            sessionId,
            confirmed,
            actionItems: extractedTasks,
            message: 'Transcript confirmed successfully'
        });

    } catch (error: any) {
        console.error('[Confirm Transcript Error]', error);
        return NextResponse.json(
            { error: 'Failed to confirm transcript' },
            { status: 500 }
        );
    }
}

/**
 * Extract action items from transcript segments
 * Uses simple keyword matching to identify tasks and assignees
 */
function extractActionItems(segments: TranscriptSegment[]): ActionItem[] {
    const actionItems: ActionItem[] = [];
    const taskKeywords = ['will', 'can you', 'need you to', 'should', 'handle', 'work on', 'finish', 'complete'];
    const deadlineKeywords = ['by', 'friday', 'monday', 'tuesday', 'wednesday', 'thursday', 'next week', 'tomorrow', 'today'];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (!segment) continue;
        const text = segment.text.toLowerCase();

        // Check if this segment contains task assignment keywords
        const hasTaskKeyword = taskKeywords.some(keyword => text.includes(keyword));

        if (hasTaskKeyword) {
            // Try to extract assignee (look for names in the text or use speaker)
            const assignee = extractAssignee(segment, segments, i);

            // Extract the task description
            const task = segment.text.trim();

            // Try to find deadline
            const deadline = extractDeadline(text, segments, i);

            if (assignee && task) {
                actionItems.push({
                    assignee,
                    task,
                    deadline,
                    status: 'pending'
                });
            }
        }
    }

    return actionItems;
}

/**
 * Extract assignee from context
 */
function extractAssignee(
    segment: TranscriptSegment,
    allSegments: TranscriptSegment[],
    currentIndex: number
): string | null {
    const text = segment.text.toLowerCase();

    // Common names to look for
    const names = ['atharv', 'tarun', 'nikita', 'nikaita'];

    for (const name of names) {
        if (text.includes(name)) {
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
    }

    // If mentioned in next segment, use that speaker
    if (currentIndex + 1 < allSegments.length) {
        const nextSegment = allSegments[currentIndex + 1];
        if (nextSegment &&
            (nextSegment.text.toLowerCase().includes('yes') ||
                nextSegment.text.toLowerCase().includes('got it') ||
                nextSegment.text.toLowerCase().includes('sure'))) {
            return nextSegment.speaker;
        }
    }

    return null;
}

/**
 * Extract deadline from text
 */
function extractDeadline(text: string, allSegments: TranscriptSegment[], currentIndex: number): string | undefined {
    const deadlinePatterns = [
        /by (friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i,
        /next (week|monday|tuesday|wednesday|thursday|friday)/i,
        /(tomorrow|today|tonight)/i,
        /end of (day|week|month)/i
    ];

    for (const pattern of deadlinePatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[0];
        }
    }

    // Check next segment for deadline
    if (currentIndex + 1 < allSegments.length) {
        const nextSegment = allSegments[currentIndex + 1];
        if (!nextSegment) return undefined;
        const nextText = nextSegment.text.toLowerCase();
        for (const pattern of deadlinePatterns) {
            const match = nextText.match(pattern);
            if (match) {
                return match[0];
            }
        }
    }

    return undefined;
}

/**
 * Action Item interface
 */
export interface ActionItem {
    assignee: string;
    task: string;
    deadline?: string;
    status: 'pending' | 'confirmed' | 'completed';
}
