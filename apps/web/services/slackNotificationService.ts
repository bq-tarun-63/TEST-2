import { WebClient } from '@slack/web-api';
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import { ISlackConnection } from '@/models/types/SlackConnection';

export const SlackNotificationService = {

    normalizeEmail(email: string): string {
        const normalized = email.toLowerCase();
        if (normalized.endsWith('@reventlabs.com')) {
            return normalized.replace('@reventlabs.com', '@betaque.com');
        }
        return normalized;
    },

    /**
     * Find a Slack user ID by their email address
     */
    async findSlackUserByEmail(client: WebClient, email: string): Promise<string | null> {
        const normalizedEmail = this.normalizeEmail(email);
        console.log(`[Slack Notification] Looking up user: ${normalizedEmail} (original: ${email})`);
        try {
            const response = await client.users.lookupByEmail({ email: normalizedEmail });
            console.log(`[Slack Notification] Lookup result for ${normalizedEmail}: ${response.user?.id || 'NOT FOUND'}`);
            return response.user?.id || null;
        } catch (error: any) {
            if (error.data?.error === 'users_not_found') {
                console.warn(`[Slack Notification] User not found in Slack: ${normalizedEmail}`);
                return null;
            }
            console.error(`[Slack Notification] Error looking up user ${normalizedEmail}:`, error);
            return null;
        }
    },

    /**
     * Get an authorized WebClient for a workspace
     */
    async getClientForWorkspace(workspaceId: string): Promise<WebClient | null> {
        console.log(`[Slack Notification] Getting client for workspace: ${workspaceId}`);
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const slackCollection = metadataDb.collection<ISlackConnection>("slackConnections");

        const connection = await slackCollection.findOne({ workspaceId, isActive: true });
        if (!connection) {
            console.warn(`[Slack Notification] No connection found for workspace: ${workspaceId}`);
            return null;
        }

        console.log(`[Slack Notification] Found Slack connection for workspace: ${workspaceId} (Team: ${connection.slackTeamName})`);
        return new WebClient(connection.slackAccessToken);
    },

    async notifyShare({
        workspaceId,
        recipientEmail,
        senderName,
        noteTitle,
        noteIcon,
        noteUrl
    }: {
        workspaceId: string;
        recipientEmail: string;
        senderName: string;
        noteTitle: string;
        noteIcon?: string;
        noteUrl: string;
    }) {
        const client = await this.getClientForWorkspace(workspaceId);
        if (!client) return;

        const slackUserId = await this.findSlackUserByEmail(client, recipientEmail);
        if (!slackUserId) return;

        const iconPrefix = noteIcon ? `${noteIcon} ` : "📄 ";

        await client.chat.postMessage({
            channel: slackUserId,
            text: `${senderName} shared a note with you: ${noteTitle}`,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `👋 *${senderName}* shared a note with you:\n*${iconPrefix}<${noteUrl}|${noteTitle}>*`
                    }
                }
            ]
        });
    },

    async notifyMention({
        workspaceId,
        recipientEmail,
        senderName,
        noteTitle,
        noteIcon,
        noteUrl
    }: {
        workspaceId: string;
        recipientEmail: string;
        senderName: string;
        noteTitle: string;
        noteIcon?: string;
        noteUrl: string;
    }) {
        const client = await this.getClientForWorkspace(workspaceId);
        if (!client) return;

        const slackUserId = await this.findSlackUserByEmail(client, recipientEmail);
        if (!slackUserId) return;

        const iconPrefix = noteIcon ? `${noteIcon} ` : "💬 ";

        try {
            await client.chat.postMessage({
                channel: slackUserId,
                text: `${senderName} mentioned you in: ${noteTitle}`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `✨ *${senderName}* mentioned you in *${iconPrefix}<${noteUrl}|${noteTitle}>*`
                        }
                    }
                ]
            });
        } catch (error) {
            console.error(`[Slack Notification] Failed to send mention:`, error);
        }
    },

    async notifyComment({
        workspaceId,
        recipientEmail,
        commenterName,
        noteTitle,
        noteIcon,
        noteUrl,
        commentText
    }: {
        workspaceId: string;
        recipientEmail: string;
        commenterName: string;
        noteTitle: string;
        noteIcon?: string;
        noteUrl: string;
        commentText: string;
    }) {
        const client = await this.getClientForWorkspace(workspaceId);
        if (!client) return;

        const slackUserId = await this.findSlackUserByEmail(client, recipientEmail);
        if (!slackUserId) return;

        const iconPrefix = noteIcon ? `${noteIcon} ` : "💭 ";

        await client.chat.postMessage({
            channel: slackUserId,
            text: `${commenterName} commented on ${noteTitle}`,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `🗨️ *${commenterName}* commented on *${iconPrefix}<${noteUrl}|${noteTitle}>*:\n> ${commentText}`
                    }
                }
            ]
        });
    }
};
