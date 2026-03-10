import axios, { AxiosInstance } from 'axios';
import {
    VexaBotResponse,
    VexaTranscriptResponse,
    VexaBotStatus,
    MeetingPlatform,
    TranscriptionError
} from '@/types/transcription';

/**
 * Vexa API Service
 * Wrapper for all Vexa API interactions
 */
export class VexaService {
    private client: AxiosInstance;
    private apiKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.VEXA_API_KEY || '';
        this.baseUrl = process.env.VEXA_API_BASE_URL || '';

        if (!this.apiKey || !this.baseUrl) {
            throw new Error('VEXA_API_KEY and VEXA_API_BASE_URL must be set in environment variables');
        }

        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey
            },
            timeout: 30000 // 30 second timeout
        });
    }

    /**
     * Request a bot to join a meeting
     * POST /bots
     */
    async startBot(params: {
        platform: MeetingPlatform;
        nativeMeetingId: string;
        passcode?: string;
        language?: string;
        botName?: string;
    }): Promise<VexaBotResponse> {
        try {
            const payload: any = {
                platform: params.platform,
                native_meeting_id: params.nativeMeetingId,
                language: params.language || 'en',
                bot_name: params.botName || 'TranscriptionBot'
            };

            // Add passcode only for Teams meetings and only if provided
            if (params.platform === 'teams' && params.passcode) {
                payload.passcode = params.passcode;
            }

            // Remove null/undefined values from payload
            Object.keys(payload).forEach(key => {
                if (payload[key] === null || payload[key] === undefined) {
                    delete payload[key];
                }
            });

            console.log('[VexaService] Starting bot with payload:', JSON.stringify(payload, null, 2));

            const response = await this.client.post<VexaBotResponse>('/bots', payload);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to start bot');
        }
    }

    /**
     * Stop a bot and remove it from meeting
     * DELETE /bots/{platform}/{native_meeting_id}
     */
    async stopBot(platform: MeetingPlatform, nativeMeetingId: string): Promise<VexaBotResponse> {
        try {
            const response = await this.client.delete<VexaBotResponse>(
                `/bots/${platform}/${nativeMeetingId}`
            );
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to stop bot');
        }
    }

    /**
     * Get transcript for a meeting
     * GET /transcripts/{platform}/{native_meeting_id}
     */
    async getTranscript(
        platform: MeetingPlatform,
        nativeMeetingId: string
    ): Promise<VexaTranscriptResponse> {
        try {
            const response = await this.client.get<VexaTranscriptResponse>(
                `/transcripts/${platform}/${nativeMeetingId}`
            );
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to get transcript');
        }
    }

    /**
     * Get status of all running bots
     * GET /bots/status
     */
    async getBotStatus(): Promise<VexaBotStatus[]> {
        try {
            const response = await this.client.get<VexaBotStatus[]>('/bots/status');
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to get bot status');
        }
    }

    /**
     * Update bot configuration (e.g., change language)
     * PUT /bots/{platform}/{native_meeting_id}/config
     */
    async updateBotConfig(
        platform: MeetingPlatform,
        nativeMeetingId: string,
        config: { language?: string }
    ): Promise<any> {
        try {
            const response = await this.client.put(
                `/bots/${platform}/${nativeMeetingId}/config`,
                config
            );
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to update bot config');
        }
    }

    /**
     * List all meetings for the authenticated user
     * GET /meetings
     */
    async listMeetings(): Promise<any[]> {
        try {
            const response = await this.client.get('/meetings');
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to list meetings');
        }
    }

    /**
     * Update meeting metadata
     * PATCH /meetings/{platform}/{native_meeting_id}
     */
    async updateMeetingData(
        platform: MeetingPlatform,
        nativeMeetingId: string,
        data: {
            name?: string;
            participants?: string[];
            languages?: string[];
            notes?: string;
        }
    ): Promise<any> {
        try {
            const response = await this.client.patch(
                `/meetings/${platform}/${nativeMeetingId}`,
                { data }
            );
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to update meeting data');
        }
    }

    /**
     * Delete meeting transcripts and anonymize data
     * DELETE /meetings/{platform}/{native_meeting_id}
     */
    async deleteMeeting(platform: MeetingPlatform, nativeMeetingId: string): Promise<any> {
        try {
            const response = await this.client.delete(`/meetings/${platform}/${nativeMeetingId}`);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to delete meeting');
        }
    }

    /**
     * Set webhook URL for the user
     * PUT /user/webhook
     */
    async setWebhookUrl(webhookUrl: string): Promise<any> {
        try {
            const response = await this.client.put('/user/webhook', { webhook_url: webhookUrl });
            return response.data;
        } catch (error: any) {
            throw this.handleError(error, 'Failed to set webhook URL');
        }
    }

    /**
     * Handle API errors and convert to TranscriptionError
     */
    private handleError(error: any, defaultMessage: string): TranscriptionError {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status || 500;

            // Log full error response for debugging
            console.error('[VexaService] API Error Response:', {
                status,
                data: error.response?.data,
                headers: error.response?.headers
            });

            // Extract error message - handle both string and object formats
            let message = defaultMessage;
            const errorData = error.response?.data;

            if (errorData) {
                if (typeof errorData === 'string') {
                    message = errorData;
                } else if (errorData.detail) {
                    message = typeof errorData.detail === 'string'
                        ? errorData.detail
                        : JSON.stringify(errorData.detail);
                } else if (errorData.message) {
                    message = typeof errorData.message === 'string'
                        ? errorData.message
                        : JSON.stringify(errorData.message);
                } else {
                    message = JSON.stringify(errorData);
                }
            }

            return new TranscriptionError(message, 'VEXA_API_ERROR', status);
        }

        return new TranscriptionError(
            error.message || defaultMessage,
            'UNKNOWN_ERROR',
            500
        );
    }
}

// Singleton instance
let vexaServiceInstance: VexaService | null = null;

export function getVexaService(): VexaService {
    if (!vexaServiceInstance) {
        vexaServiceInstance = new VexaService();
    }
    return vexaServiceInstance;
}
