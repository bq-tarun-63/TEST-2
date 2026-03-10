import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectToDatabase from '@/lib/mongoDb/mongodb';

export async function GET(req: NextRequest) {
    try {
        // Get user session
        const session = await getServerSession();
        if (!session?.user?.email) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get query parameters
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get('workspaceId');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Connect to MongoDB
        const client = await connectToDatabase();
        const db = client.db();

        // Build query
        const query: any = {
            userId: session.user.email,
        };

        if (workspaceId) {
            query.workspaceId = workspaceId;
        }

        // Get transcriptions
        const transcriptions = await db
            .collection('whisper_transcriptions')
            .find(query)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();

        // Get total count
        const total = await db.collection('whisper_transcriptions').countDocuments(query);

        return NextResponse.json({
            transcriptions: transcriptions.map((t) => ({
                id: t._id.toString(),
                title: t.title,
                wordCount: t.wordCount,
                duration: t.duration,
                source: t.source,
                status: t.status,
                createdAt: t.createdAt,
                metadata: t.metadata,
            })),
            total,
            limit,
            offset,
        });
    } catch (error: any) {
        console.error('Error fetching transcriptions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch transcriptions', details: error.message },
            { status: 500 }
        );
    }
}
