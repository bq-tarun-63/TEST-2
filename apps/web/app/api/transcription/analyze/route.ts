import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAuthError } from '@/lib/utils/auth';
import { generateWithGemini } from '@/llm-system/ai-models';
import type { TranscriptSegment } from '@/types/transcription';

/**
 * POST /api/transcription/analyze
 * Use Gemini AI to analyze transcript and extract tasks
 */
export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate user
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        // 2. Get transcript from request
        const body = await req.json();
        const { transcript } = body;

        if (!transcript || !Array.isArray(transcript)) {
            return NextResponse.json(
                { error: 'Transcript array is required' },
                { status: 400 }
            );
        }

        // 3. Format transcript for AI analysis
        const formattedTranscript = formatTranscriptForAI(transcript);

        // 4. Create prompt for task extraction
        const prompt = createTaskExtractionPrompt(formattedTranscript);

        // 5. Generate response using Gemini (via your LLM system)
        const aiResponse = await generateWithGemini(prompt, 'zap', 'Extract tasks and action items from this meeting transcript in JSON format');

        // 6. Get the response text
        const responseText = await aiResponse.text();

        // 7. Parse AI response to extract structured tasks
        const tasks = parseAIResponse(responseText);

        // 8. Return extracted tasks
        return NextResponse.json({
            success: true,
            tasks,
            rawResponse: responseText,
            transcriptLength: transcript.length
        });

    } catch (error: any) {
        console.error('[AI Analysis Error]', error);
        return NextResponse.json(
            {
                error: 'Failed to analyze transcript',
                details: error.message
            },
            { status: 500 }
        );
    }
}

/**
 * Format transcript segments for AI analysis
 */
function formatTranscriptForAI(segments: TranscriptSegment[]): string {
    return segments
        .map((seg, index) => {
            const timestamp = formatTimestamp(seg.start);
            return `[${timestamp}] ${seg.speaker}: ${seg.text}`;
        })
        .join('\n');
}

/**
 * Format seconds to MM:SS
 */
function formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Create prompt for Gemini to extract tasks
 */
function createTaskExtractionPrompt(transcript: string): string {
    return `You are an AI assistant that analyzes meeting transcripts and extracts action items and tasks.

Analyze the following meeting transcript and extract all tasks, action items, and assignments.

For each task, identify:
1. **Assignee**: The person responsible for the task
2. **Task**: Clear description of what needs to be done
3. **Deadline**: When it should be completed (if mentioned)
4. **Priority**: High, Medium, or Low (infer from context)

MEETING TRANSCRIPT:
${transcript}

Please provide the output in the following JSON format:
{
  "tasks": [
    {
      "assignee": "Person Name",
      "task": "Task description",
      "deadline": "Deadline if mentioned",
      "priority": "High/Medium/Low",
      "context": "Brief context from conversation"
    }
  ],
  "summary": "Brief summary of the meeting",
  "participants": ["List of all speakers"]
}

IMPORTANT: Return ONLY valid JSON, no additional text or markdown formatting.`;
}

/**
 * Parse AI response and extract structured tasks
 */
function parseAIResponse(aiResponse: string): any {
    try {
        // Remove markdown code blocks if present
        let cleanedResponse = aiResponse.trim();

        // Remove ```json and ``` markers
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '');
        cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
        cleanedResponse = cleanedResponse.trim();

        // Parse JSON
        const parsed = JSON.parse(cleanedResponse);

        return {
            tasks: parsed.tasks || [],
            summary: parsed.summary || '',
            participants: parsed.participants || []
        };
    } catch (error) {
        console.error('[Parse Error]', error);
        console.error('[AI Response]', aiResponse);

        // Fallback: return raw response
        return {
            tasks: [],
            summary: 'Failed to parse AI response',
            participants: [],
            rawResponse: aiResponse
        };
    }
}

/**
 * Task interface
 */
export interface AIExtractedTask {
    assignee: string;
    task: string;
    deadline?: string;
    priority: 'High' | 'Medium' | 'Low';
    context?: string;
}
