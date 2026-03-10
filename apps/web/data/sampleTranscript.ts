/**
 * Sample transcript data with 3 speakers discussing tasks
 */

import type { TranscriptSegment } from '@/types/transcription';

export const sampleTranscript: TranscriptSegment[] = [
    {
        start: 0,
        end: 5.2,
        text: "Hey everyone, thanks for joining. Let's discuss the project updates.",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:00Z",
        absolute_end_time: "2026-01-09T10:00:05.2Z"
    },
    {
        start: 5.5,
        end: 12.3,
        text: "Sure Tarun. I've completed the API integration for the payment gateway.",
        speaker: "Atharv",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:05.5Z",
        absolute_end_time: "2026-01-09T10:00:12.3Z"
    },
    {
        start: 12.8,
        end: 18.5,
        text: "Great work Atharv! And Nikita, how's the UI design coming along?",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:12.8Z",
        absolute_end_time: "2026-01-09T10:00:18.5Z"
    },
    {
        start: 19.0,
        end: 26.7,
        text: "I've finished the dashboard mockups. I'll share them in Figma by end of day.",
        speaker: "Nikita",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:19Z",
        absolute_end_time: "2026-01-09T10:00:26.7Z"
    },
    {
        start: 27.2,
        end: 35.8,
        text: "Perfect. Now let's assign the remaining tasks. Atharv, can you handle the database optimization?",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:27.2Z",
        absolute_end_time: "2026-01-09T10:00:35.8Z"
    },
    {
        start: 36.1,
        end: 42.5,
        text: "Yes, I'll optimize the queries and add indexing. Should be done by Friday.",
        speaker: "Atharv",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:36.1Z",
        absolute_end_time: "2026-01-09T10:00:42.5Z"
    },
    {
        start: 43.0,
        end: 51.2,
        text: "Excellent. Nikita, I need you to implement the responsive design for mobile devices.",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:43Z",
        absolute_end_time: "2026-01-09T10:00:51.2Z"
    },
    {
        start: 51.8,
        end: 58.3,
        text: "Got it. I'll make sure it works on all screen sizes. I'll finish it by next Tuesday.",
        speaker: "Nikita",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:51.8Z",
        absolute_end_time: "2026-01-09T10:00:58.3Z"
    },
    {
        start: 59.0,
        end: 67.5,
        text: "And I'll work on the deployment pipeline and set up CI/CD. Target is Monday next week.",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:00:59Z",
        absolute_end_time: "2026-01-09T10:01:07.5Z"
    },
    {
        start: 68.0,
        end: 73.2,
        text: "Sounds good! Should I also add unit tests for the API endpoints?",
        speaker: "Atharv",
        language: "en",
        absolute_start_time: "2026-01-09T10:01:08Z",
        absolute_end_time: "2026-01-09T10:01:13.2Z"
    },
    {
        start: 73.8,
        end: 79.5,
        text: "Yes please, that would be great. Make sure we have at least 80% coverage.",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:01:13.8Z",
        absolute_end_time: "2026-01-09T10:01:19.5Z"
    },
    {
        start: 80.0,
        end: 86.3,
        text: "I can help with testing too. I'll write the E2E tests for the user flows.",
        speaker: "Nikita",
        language: "en",
        absolute_start_time: "2026-01-09T10:01:20Z",
        absolute_end_time: "2026-01-09T10:01:26.3Z"
    },
    {
        start: 87.0,
        end: 93.8,
        text: "Perfect! Let's summarize the tasks then. Atharv - database optimization and unit tests.",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:01:27Z",
        absolute_end_time: "2026-01-09T10:01:33.8Z"
    },
    {
        start: 94.2,
        end: 100.5,
        text: "Nikita - responsive design and E2E testing. And I'll handle the deployment.",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:01:34.2Z",
        absolute_end_time: "2026-01-09T10:01:40.5Z"
    },
    {
        start: 101.0,
        end: 105.7,
        text: "Confirmed! I'll start working on it right away.",
        speaker: "Atharv",
        language: "en",
        absolute_start_time: "2026-01-09T10:01:41Z",
        absolute_end_time: "2026-01-09T10:01:45.7Z"
    },
    {
        start: 106.2,
        end: 110.8,
        text: "Me too. I'll send updates in our Slack channel.",
        speaker: "Nikita",
        language: "en",
        absolute_start_time: "2026-01-09T10:01:46.2Z",
        absolute_end_time: "2026-01-09T10:01:50.8Z"
    },
    {
        start: 111.5,
        end: 117.2,
        text: "Great! Let's sync up again on Thursday to review progress. Thanks everyone!",
        speaker: "Tarun",
        language: "en",
        absolute_start_time: "2026-01-09T10:01:51.5Z",
        absolute_end_time: "2026-01-09T10:01:57.2Z"
    }
];

/**
 * Extracted action items from the transcript
 */
export interface ActionItem {
    assignee: string;
    task: string;
    deadline?: string;
    status: 'pending' | 'confirmed' | 'completed';
}

export const extractedTasks: ActionItem[] = [
    {
        assignee: "Atharv",
        task: "Database optimization and add indexing",
        deadline: "Friday",
        status: "pending"
    },
    {
        assignee: "Atharv",
        task: "Add unit tests for API endpoints (80% coverage)",
        deadline: "Friday",
        status: "pending"
    },
    {
        assignee: "Nikita",
        task: "Implement responsive design for mobile devices",
        deadline: "Next Tuesday",
        status: "pending"
    },
    {
        assignee: "Nikita",
        task: "Write E2E tests for user flows",
        deadline: "Next Tuesday",
        status: "pending"
    },
    {
        assignee: "Tarun",
        task: "Set up deployment pipeline and CI/CD",
        deadline: "Monday next week",
        status: "pending"
    }
];
