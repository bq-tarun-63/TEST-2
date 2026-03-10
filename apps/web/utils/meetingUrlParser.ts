import { ParsedMeetingUrl, MeetingPlatform, TranscriptionError } from '@/types/transcription';

/**
 * Parse Google Meet or Microsoft Teams meeting URLs
 * and extract platform, meeting ID, and passcode (for Teams)
 */
export function parseMeetingUrl(url: string): ParsedMeetingUrl {
    const trimmedUrl = url.trim();

    // Google Meet patterns:
    // https://meet.google.com/abc-defg-hij
    // meet.google.com/abc-defg-hij
    const googleMeetRegex = /(?:https?:\/\/)?meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i;
    const googleMatch = trimmedUrl.match(googleMeetRegex);

    if (googleMatch) {
        const meetingId = googleMatch[1];

        if (!meetingId) {
            throw new TranscriptionError(
                'Failed to extract meeting ID from Google Meet URL',
                'INVALID_URL',
                400
            );
        }

        return {
            platform: 'google_meet',
            meetingId,
            originalUrl: trimmedUrl
        };
    }

    // Microsoft Teams patterns:
    // https://teams.live.com/meet/9366473044740?p=waw4q9dPAvdIG3aknh
    // https://teams.microsoft.com/l/meetup-join/...
    const teamsLiveRegex = /(?:https?:\/\/)?teams\.live\.com\/meet\/(\d{10,15})(?:\?p=([a-zA-Z0-9]+))?/i;
    const teamsMatch = trimmedUrl.match(teamsLiveRegex);

    if (teamsMatch) {
        const meetingId = teamsMatch[1];
        const passcode = teamsMatch[2];

        if (!meetingId) {
            throw new TranscriptionError(
                'Failed to extract meeting ID from Teams URL',
                'INVALID_URL',
                400
            );
        }

        if (!passcode) {
            throw new TranscriptionError(
                'Teams meeting URL must include passcode parameter (?p=...)',
                'MISSING_PASSCODE',
                400
            );
        }

        return {
            platform: 'teams',
            meetingId,
            passcode,
            originalUrl: trimmedUrl
        };
    }

    // If no pattern matched
    throw new TranscriptionError(
        'Invalid meeting URL. Supported formats: Google Meet (meet.google.com/xxx-xxxx-xxx) or Microsoft Teams (teams.live.com/meet/...)',
        'INVALID_URL',
        400
    );
}

/**
 * Validate meeting ID format for a given platform
 */
export function validateMeetingId(platform: MeetingPlatform, meetingId: string): boolean {
    if (platform === 'google_meet') {
        // Format: abc-defg-hij (3-4-3 lowercase letters with hyphens)
        return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(meetingId);
    }

    if (platform === 'teams') {
        // Format: 10-15 digit numeric ID
        return /^\d{10,15}$/.test(meetingId);
    }

    return false;
}

/**
 * Construct meeting URL from platform and meeting ID
 */
export function constructMeetingUrl(
    platform: MeetingPlatform,
    meetingId: string,
    passcode?: string
): string {
    if (platform === 'google_meet') {
        return `https://meet.google.com/${meetingId}`;
    }

    if (platform === 'teams') {
        const baseUrl = `https://teams.live.com/meet/${meetingId}`;
        return passcode ? `${baseUrl}?p=${passcode}` : baseUrl;
    }

    throw new TranscriptionError(
        `Unsupported platform: ${platform}`,
        'INVALID_PLATFORM',
        400
    );
}

/**
 * Extract meeting ID from various URL formats
 * More lenient than parseMeetingUrl for backward compatibility
 */
export function extractMeetingId(url: string, platform: MeetingPlatform): string {
    const parsed = parseMeetingUrl(url);

    if (parsed.platform !== platform) {
        throw new TranscriptionError(
            `URL is for ${parsed.platform} but expected ${platform}`,
            'PLATFORM_MISMATCH',
            400
        );
    }

    return parsed.meetingId;
}
