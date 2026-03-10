import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectToDatabase from '@/lib/mongoDb/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Get user session
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { id } = params;

        // Validate ObjectId
        if (!ObjectId.isValid(id)) {
            return NextResponse.json(
                { error: 'Invalid transcription ID' },
                { status: 400 }
            );
        }

        // Connect to MongoDB
        const client = await connectToDatabase();
        const db = client.db();

        // Get transcription
        const transcription = await db.collection('whisper_transcriptions').findOne({
            _id: new ObjectId(id),
            userId: session.user.email,
        });

        if (!transcription) {
            return NextResponse.json(
                { error: 'Transcription not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            id: transcription._id.toString(),
            title: transcription.title,
            transcript: transcription.transcript,
            segments: transcription.segments,
            duration: transcription.duration,
            wordCount: transcription.wordCount,
            source: transcription.source,
            status: transcription.status,
            workspaceId: transcription.workspaceId,
            workareaId: transcription.workareaId,
            metadata: transcription.metadata,
            createdAt: transcription.createdAt,
            updatedAt: transcription.updatedAt,
        });
    } catch (error: any) {
        console.error('Error fetching transcription:', error);
        return NextResponse.json(
            { error: 'Failed to fetch transcription', details: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Get user session
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { id } = params;

        // Validate ObjectId
        if (!ObjectId.isValid(id)) {
            return NextResponse.json(
                { error: 'Invalid transcription ID' },
                { status: 400 }
            );
        }

        // Connect to MongoDB
        const client = await connectToDatabase();
        const db = client.db();

        // Delete transcription
        const result = await db.collection('whisper_transcriptions').deleteOne({
            _id: new ObjectId(id),
            userId: session.user.email,
        });

        if (result.deletedCount === 0) {
            return NextResponse.json(
                { error: 'Transcription not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Transcription deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting transcription:', error);
        return NextResponse.json(
            { error: 'Failed to delete transcription', details: error.message },
            { status: 500 }
        );
    }
}
