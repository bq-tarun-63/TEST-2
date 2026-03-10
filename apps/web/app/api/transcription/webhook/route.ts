import { NextRequest, NextResponse } from 'next/server';
import { MeetingSessionService } from '@/services/meetingSessionService';
import { getVexaService } from '@/services/vexaService';
import type { VexaTranscriptResponse } from '@/types/transcription';

/**
 * POST /api/transcription/webhook
 * Receive webhook notifications from Vexa when meetings complete
 */
export async function POST(req: NextRequest) {
    try {
        // 1. Verify webhook authenticity (optional but recommended)
        const apiKey = req.headers.get('X-API-Key');
        const authHeader = req.headers.get('Authorization');
        const expectedKey = process.env.VEXA_API_KEY;

        // DEBUG: Log all headers to see what Vexa sends
        // Temporarily make auth optional for debugging
        if (apiKey && apiKey !== expectedKey) {
            console.warn('[Webhook] Invalid API key received:', apiKey);
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // 2. Parse webhook payload - Vexa sends nested structure
        const webhookPayload: any = await req.json();

        // Extract meeting data from nested structure
        const eventType = webhookPayload.event_type;
        const meetingData = webhookPayload.meeting;
        const statusChange = webhookPayload.status_change;
        // Validate required fields
        if (!meetingData || !meetingData.platform || !meetingData.native_meeting_id) {
            console.error('[Webhook] Invalid payload - missing required fields');
            return NextResponse.json({
                success: false,
                error: 'Invalid payload structure'
            }, { status: 400 });
        }

        // 3. Find matching session in database
        const session = await MeetingSessionService.getSessionByMeetingId(
            meetingData.platform as any,
            meetingData.native_meeting_id
        );

        if (!session) {
            console.warn('[Webhook] No matching session found for meeting:', meetingData.native_meeting_id);
            // Return 200 anyway to acknowledge receipt
            return NextResponse.json({
                success: true,
                message: 'No matching session found'
            });
        }

        // 4. Update session based on webhook status
        const vexaStatus = meetingData.status?.toLowerCase();
        // Handle different status transitions
        if (vexaStatus === 'active') {
            // Bot successfully joined the meeting
            if (session.status === 'starting') {
                if (meetingData.start_time) {
                    await MeetingSessionService.setStartTime(
                        session._id!.toString(),
                        new Date(meetingData.start_time)
                    );
                } else {
                    // If no start_time, just update status
                    await MeetingSessionService.updateSessionStatus(
                        session._id!.toString(),
                        'active'
                    );
                }
            }

        } else if (vexaStatus === 'completed' || vexaStatus === 'ended') {
            // Meeting completed successfully
            console.log('[Webhook] Meeting completed, fetching transcript');

            // Fetch transcript from Vexa API (webhook doesn't include segments)
            try {
                const vexaService = getVexaService();
                const transcriptData = await vexaService.getTranscript(
                    meetingData.platform,
                    meetingData.native_meeting_id
                );

                await MeetingSessionService.updateTranscript(
                    session._id!.toString(),
                    transcriptData.segments || [],
                    'completed'
                );

                console.log('[Webhook] Transcript saved, segments:', transcriptData.segments?.length || 0);
            } catch (error) {
                console.error('[Webhook] Failed to fetch transcript:', error);
                // Still mark as completed even if transcript fetch fails
                await MeetingSessionService.updateSessionStatus(
                    session._id!.toString(),
                    'completed'
                );
            }

            // Set end time
            if (meetingData.end_time) {
                await MeetingSessionService.setEndTime(
                    session._id!.toString(),
                    new Date(meetingData.end_time)
                );
            } else {
                await MeetingSessionService.setEndTime(
                    session._id!.toString(),
                    new Date()
                );
            }

            console.log('[Webhook] Meeting completed successfully:', session._id?.toString());

        } else if (vexaStatus === 'failed' || vexaStatus === 'rejected' || vexaStatus === 'error') {
            // Bot failed to join or was rejected
            console.log('[Webhook] Bot failed/rejected, updating status');

            await MeetingSessionService.updateSessionStatus(
                session._id!.toString(),
                'failed',
                {
                    endTime: new Date(),
                    metadata: {
                        ...session.metadata,
                        failureReason: `Bot ${vexaStatus}: ${statusChange?.reason || meetingData.status}`
                    }
                }
            );

            console.log('[Webhook] Bot failed/rejected:', session._id?.toString(), vexaStatus);

        } else if (vexaStatus === 'joining' || vexaStatus === 'awaiting_admission') {
            // Bot is in the process of joining - keep as 'starting'
            console.log('[Webhook] Bot is joining/awaiting admission, keeping status as starting');
            // No status update needed - already 'starting'

        } else {
            // Unknown status, log for debugging
            console.warn('[Webhook] Unknown status received:', {
                vexaStatus,
                statusChange,
                meetingData
            });
        }

        // 6. TODO: Notify user (email, push notification, etc.)
        // This is where you would trigger user notifications
        // For example:
        // await notifyUser(session.userId, {
        //   message: 'Your meeting transcript is ready!',
        //   sessionId: session._id.toString()
        // });

        // 7. Return 200 OK to acknowledge receipt
        return NextResponse.json({
            success: true,
            sessionId: session._id?.toString()
        });

    } catch (error: any) {
        console.error('[Webhook Error]', error);

        // Always return 200 to Vexa to prevent retries
        // Log the error for debugging
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 200 });
    }
}
