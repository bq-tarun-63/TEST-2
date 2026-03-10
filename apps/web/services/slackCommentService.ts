import clientPromise from "@/lib/mongoDb/mongodb";
import { IComment, IChatMessage } from "@/models/types/comment";
import { ObjectId } from "mongodb";
import { IBlock, IPage } from "@/models/types/Block";
import { SlackService } from "./slackService";
import { SlackNotificationService } from "./slackNotificationService";

export const SlackCommentService = {
    /**
     * Create a new Slack Sync comment thread attached to one or more blocks.
     */
    async addSlackSyncComment({
        commenterName,
        commenterEmail,
        text,
        blockIds,
        commentId,
        firstMessageId,
        mediaMetaData,
        slackChannelId: injectedChannelId,
        slackThreadTs: injectedThreadTs,
    }: {
        commenterName: string;
        commenterEmail: string;
        text: string;
        blockIds: string[];
        commentId: string;
        firstMessageId?: string;
        mediaMetaData?: Array<{ id: string; name: string; url: string; size?: number; mimeType?: string; uploadedAt?: string }>;
        slackChannelId?: string;
        slackThreadTs?: string;
    }) {
        const client = await clientPromise();
        const db = client.db();
        const blocksCollection = db.collection<IBlock>("blocks");
        const commentCollection = db.collection<IComment>("comments");

        if (!blockIds || blockIds.length === 0) {
            throw new Error("At least one block ID is required");
        }

        const objectIds = blockIds.map(id => new ObjectId(id));
        const primaryBlock = await blocksCollection.findOne({ _id: objectIds[0] });

        if (!primaryBlock) {
            throw new Error("Target block not found");
        }

        // 1. Send the initial message to Slack to get the Thread TS (if not injected)
        let slackChannelId: string | undefined = injectedChannelId;
        let slackThreadTs: string | undefined = injectedThreadTs;

        try {
            if (!slackChannelId || !slackThreadTs) {
                // Find appropriate channel mapping for the workspace / block
                // For now, assume a default linked connection or channel via SlackService
                const slackClient = await SlackNotificationService.getClientForWorkspace(primaryBlock.workspaceId || "");

                if (slackClient) {
                    // Determine channel: Currently falling back to finding the user or a default channel
                    // We will send this to the specific user's DM or a workspace configured channel if defined later
                    const slackUserId = await SlackNotificationService.findSlackUserByEmail(slackClient, commenterEmail);
                    const targetChannel = slackUserId || ""; // Fallback channel logic here if needed

                    if (targetChannel) {
                        const noteTitle = (primaryBlock.value as IPage)?.title || "Untitled Note";
                        const noteUrl = `${process.env.MAIL_LINK}/${primaryBlock._id}`;

                        const response = await slackClient.chat.postMessage({
                            channel: targetChannel,
                            username: `${commenterName} (from Closot)`,
                            icon_url: "https://closot.com/favicon.ico",
                            text: `New synced thread for ${noteTitle}`,
                            blocks: [
                                {
                                    type: "section",
                                    text: {
                                        type: "mrkdwn",
                                        text: `started a synced thread on *<${noteUrl}|${noteTitle}>*:\n\n> ${text}`
                                    }
                                }
                            ]
                        });

                        if (response.ts) {
                            slackChannelId = response.channel;
                            slackThreadTs = response.ts;
                        }
                    }
                }
            }
        } catch (error) {
            console.error("[SlackCommentService] Failed to post initial thread to Slack:", error);
        }

        const firstMsgIdObj = new ObjectId(firstMessageId || new ObjectId());

        // 2. Create the Slack Sync Comment Thread
        const newComment: IComment = {
            _id: new ObjectId(commentId),
            type: "slack_sync",
            blockIds: objectIds,
            slackChannelId,
            slackThreadTs,
            chats: [{
                commentId: firstMsgIdObj,
                commenterName,
                commenterEmail,
                text,
                createdAt: new Date(),
                updatedAt: new Date(),
                slackMessageTs: slackThreadTs, // Root message TS
                ...(mediaMetaData && mediaMetaData.length > 0 ? { mediaMetaData } : {}),
            }],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await commentCollection.insertOne(newComment);

        // 3. Update ALL referenced blocks to include this comment ID
        // (Since regular comments also store IDs here, the UI will filter by type later if needed)
        await blocksCollection.updateMany(
            { _id: { $in: objectIds } },
            {
                $addToSet: { comments: commentId },
                $set: { updatedAt: new Date() }
            }
        );

        return { success: true, comment: newComment };
    },

    /**
     * Add a reply to an existing Slack Sync comment thread.
     */
    async replyToSlackSyncComment({
        commentId,
        messageId,
        commenterName,
        commenterEmail,
        text,
        mediaMetaData,
    }: {
        commentId: string;
        messageId: string;
        commenterName: string;
        commenterEmail: string;
        text: string;
        mediaMetaData?: Array<{ id: string; name: string; url: string; size?: number; mimeType?: string; uploadedAt?: string }>;
    }) {
        const client = await clientPromise();
        const db = client.db();
        const commentCollection = db.collection<IComment>("comments");
        const blocksCollection = db.collection<IBlock>("blocks");

        const thread = await commentCollection.findOne({ _id: new ObjectId(commentId), type: "slack_sync" });
        if (!thread) {
            throw new Error("Slack sync comment thread not found");
        }

        let slackMessageTs: string | undefined = undefined;

        // 1. Post reply to Slack
        if (thread.slackChannelId && thread.slackThreadTs && thread.blockIds?.length > 0) {
            try {
                const primaryBlock = await blocksCollection.findOne({ _id: thread.blockIds[0] });
                if (primaryBlock && primaryBlock.workspaceId) {
                    const slackClient = await SlackNotificationService.getClientForWorkspace(primaryBlock.workspaceId);
                    if (slackClient) {
                        const response = await slackClient.chat.postMessage({
                            channel: thread.slackChannelId,
                            thread_ts: thread.slackThreadTs,
                            username: `${commenterName} (from Closot)`,
                            icon_url: "https://closot.com/favicon.ico",
                            text: text,
                            blocks: [
                                {
                                    type: "section",
                                    text: {
                                        type: "mrkdwn",
                                        text: text
                                    }
                                }
                            ]
                        });
                        slackMessageTs = response.ts;
                    }
                }
            } catch (error) {
                console.error("[SlackCommentService] Failed to post reply to Slack:", error);
            }
        }

        const chatMessage: IChatMessage = {
            commentId: new ObjectId(messageId),
            commenterName,
            commenterEmail,
            text,
            createdAt: new Date(),
            updatedAt: new Date(),
            slackMessageTs,
            ...(mediaMetaData && mediaMetaData.length > 0 ? { mediaMetaData } : {}),
        };

        const result = await commentCollection.updateOne(
            { _id: new ObjectId(commentId) },
            { $push: { chats: chatMessage } }
        );

        if (result.matchedCount === 0) {
            throw new Error("Comment not found");
        }

        return { success: true, message: chatMessage };
    },

    /**
     * Sync an inbound message from Slack webhook to the Books App DB.
     * Called by /api/slack/events/route.ts when event.thread_ts is matched.
     */
    async syncInboundSlackReply({
        slackChannelId,
        slackThreadTs,
        slackMessageTs,
        slackUserId,
        text,
    }: {
        slackChannelId: string;
        slackThreadTs: string;
        slackMessageTs: string;
        slackUserId: string;
        text: string;
    }) {
        const client = await clientPromise();
        const db = client.db();
        const commentCollection = db.collection<IComment>("comments");

        // Find the thread
        const thread = await commentCollection.findOne({
            type: "slack_sync",
            slackThreadTs: slackThreadTs,
            slackChannelId: slackChannelId
        });

        if (!thread) {
            return { success: false, reason: "Thread not found" };
        }

        // Check if this message was already synced (to avoid infinite loops)
        const alreadyExists = thread.chats.some(c => c.slackMessageTs === slackMessageTs);
        if (alreadyExists) {
            return { success: false, reason: "Message already synced" };
        }

        let commenterName = `Slack User (via Slack)`;
        const commenterEmail = "slack-user@external.com"; // Placeholder

        try {
            // Retrieve the workspace connection to query the Slack API
            const primaryBlock = await db.collection("blocks").findOne({ _id: thread.blockIds[0] });
            if (primaryBlock && primaryBlock.workspaceId) {
                const slackClient = await SlackNotificationService.getClientForWorkspace(primaryBlock.workspaceId);
                if (slackClient) {
                    const userInfo = await slackClient.users.info({ user: slackUserId });
                    if (userInfo.user?.real_name) {
                        commenterName = `${userInfo.user.real_name} (via Slack)`;
                    } else if (userInfo.user?.name) {
                        commenterName = `${userInfo.user.name} (via Slack)`;
                    }
                }
            }
        } catch (error) {
            console.error("[SlackCommentService] Failed to fetch Slack user info for incoming reply:", error);
        }

        const chatMessage: IChatMessage = {
            commentId: new ObjectId(),
            commenterName,
            commenterEmail,
            text,
            createdAt: new Date(),
            updatedAt: new Date(),
            slackMessageTs,
        };

        await commentCollection.updateOne(
            { _id: thread._id },
            { $push: { chats: chatMessage } }
        );

        return { success: true, threadId: thread._id.toString() };
    }
};
