import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectToDatabase from '@/lib/mongoDb/mongodb';

export async function POST(req: NextRequest) {
    try {
        // Get user session
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Parse request body
        const body = await req.json();
        const {
            title,
            transcript,
            segments,
            duration,
            wordCount,
            workspaceId,
            workareaId,
            source = 'whisperlivekit',
            status = 'completed',
        } = body;

        // Validate required fields
        if (!title || !transcript || !workspaceId) {
            return NextResponse.json(
                { error: 'Missing required fields: title, transcript, workspaceId' },
                { status: 400 }
            );
        }

        // Connect to MongoDB
        const client = await connectToDatabase();
        const db = client.db();

        // Create transcription document
        const transcriptionDoc = {
            userId: session.user.email,
            workspaceId,
            workareaId: workareaId || null,
            title,
            transcript,
            segments: segments || [],
            duration: duration || 0,
            wordCount: wordCount || transcript.split(/\s+/).length,
            source, // 'whisperlivekit' or 'web-speech-api'
            status,
            metadata: {
                speakerCount: segments ? new Set(segments.map((s: any) => s.speaker).filter(Boolean)).size : 0,
                hasSpeakerDiarization: segments?.some((s: any) => s.speaker) || false,
                segmentCount: segments?.length || 0,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Insert into database
        const result = await db.collection('whisper_transcriptions').insertOne(transcriptionDoc);

        return NextResponse.json({
            success: true,
            transcriptId: result.insertedId.toString(),
            message: 'Transcription saved successfully',
        });
    } catch (error: any) {
        console.error('Error saving transcription:', error);
        return NextResponse.json(
            { error: 'Failed to save transcription', details: error.message },
            { status: 500 }
        );
    }
}
