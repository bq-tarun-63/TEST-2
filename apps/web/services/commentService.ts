import clientPromise from "@/lib/mongoDb/mongodb";
import { IComment, IChatMessage } from "@/models/types/comment";
import { ObjectId } from "mongodb";
import { AuditService } from "./auditService";
import { IBlock, IPage } from "@/models/types/Block";
import { SlackNotificationService } from "./slackNotificationService";
import { PermissionService } from "./PermissionService";

export const CommentService = {
    /**
     * Create a new comment thread attached to one or more blocks.
     */
    async addComment({
        commenterName,
        commenterEmail,
        text,
        blockIds,
        commentId, // The Thread ID (provided by frontend optimistically)
        firstMessageId, // The ID of the first message in the thread
        mediaMetaData,
    }: {
        commenterName: string;
        commenterEmail: string;
        text: string;
        blockIds: string[];
        commentId: string;
        firstMessageId?: string; // Optional, generate if missing
        mediaMetaData?: Array<{ id: string; name: string; url: string; size?: number; mimeType?: string; uploadedAt?: string }>;
    }) {
        const client = await clientPromise();
        const db = client.db();
        const blocksCollection = db.collection<IBlock>("blocks");
        const commentCollection = db.collection<IComment>("comments");

        if (!blockIds || blockIds.length === 0) {
            throw new Error("At least one block ID is required");
        }

        const objectIds = blockIds.map(id => new ObjectId(id));

        // Create the Comment Thread
        const newComment: IComment = {
            _id: new ObjectId(commentId),
            type: "block",
            blockIds: objectIds,
            chats: [{
                commentId: new ObjectId(firstMessageId || new ObjectId()),
                commenterName,
                commenterEmail,
                text,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...(mediaMetaData && mediaMetaData.length > 0 ? { mediaMetaData } : {}),
            }],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await commentCollection.insertOne(newComment);

        // Update ALL referenced blocks to include this comment ID
        await blocksCollection.updateMany(
            { _id: { $in: objectIds } },
            {
                $addToSet: { comments: commentId },
                $set: { updatedAt: new Date() }
            }
        );

        // --- Slack Notifications (Non-blocking) ---
        (async () => {
            try {
                const primaryBlock = await blocksCollection.findOne({ _id: objectIds[0] });
                if (primaryBlock) {
                    const workspaceId = primaryBlock.workspaceId;
                    const noteTitle = (primaryBlock.value as IPage)?.title || "Untitled Note";
                    const noteIcon = (primaryBlock.value as IPage)?.icon || "";
                    const noteUrl = `${process.env.MAIL_LINK}/${primaryBlock._id}`;
                    const creatorEmail = primaryBlock.createdBy.userEmail;

                    if (creatorEmail && creatorEmail !== commenterEmail) {
                        await SlackNotificationService.notifyComment({
                            workspaceId,
                            recipientEmail: creatorEmail,
                            commenterName,
                            noteTitle,
                            noteIcon,
                            noteUrl,
                            commentText: text
                        });
                    }
                }
            } catch (error) {
                console.error("[Comment Service] Failed to send Slack notifications for new comment:", error);
            }
        })();

        // Audit Log
        const primaryBlock = await blocksCollection.findOne({ _id: objectIds[0] });
        let noteTitle = "New page";
        if (primaryBlock && primaryBlock.blockType === "page" && primaryBlock.value && "title" in (primaryBlock.value as any)) {
            noteTitle = (primaryBlock.value as any).title;
        }

        await AuditService.log({
            action: "CREATE",
            noteId: blockIds[0] || "",
            userId: commenterEmail,
            userEmail: commenterEmail,
            userName: commenterName,
            noteName: noteTitle,
            serviceType: "MONGODB",
            field: "comment",
            oldValue: undefined,
            newValue: text,
            workspaceId: primaryBlock?.workspaceId,
        });

        return { success: true, comment: newComment };
    },

    /**
     * Add a reply to an existing comment thread.
     */
    async addChatMessage({
        commentId, // Thread ID
        messageId, // ID for the new message
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

        const thread = await commentCollection.findOne({ _id: new ObjectId(commentId) });
        if (!thread) {
            throw new Error("Comment thread not found");
        }

        if (thread.type === "slack_sync") {
            const { SlackCommentService } = require("./slackCommentService");
            const result = await SlackCommentService.replyToSlackSyncComment({
                commentId,
                messageId,
                commenterName,
                commenterEmail,
                text,
                mediaMetaData
            });
            // Normalize return to match expected "comment" prop
            if (result.success && result.message) {
                return { success: true, comment: result.message };
            }
            return result as any;
        }

        const chatMessage: IChatMessage = {
            commentId: new ObjectId(messageId),
            commenterName,
            commenterEmail,
            text,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...(mediaMetaData && mediaMetaData.length > 0 ? { mediaMetaData } : {}),
        };

        const result = await commentCollection.updateOne(
            { _id: new ObjectId(commentId) },
            {
                $push: { chats: chatMessage },
                $set: { updatedAt: new Date() }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error("Comment thread not found");
        }

        // --- Slack Notifications (Non-blocking) ---
        (async () => {
            try {
                const updatedThread = await commentCollection.findOne({ _id: new ObjectId(commentId) });
                if (updatedThread && updatedThread.blockIds?.[0]) {
                    const blocksCollection = db.collection<IBlock>("blocks");
                    const block = await blocksCollection.findOne({ _id: updatedThread.blockIds[0] });

                    if (block) {
                        const workspaceId = block.workspaceId;
                        const noteTitle = (block.value as IPage)?.title || "Untitled Note";
                        const noteIcon = (block.value as IPage)?.icon || "";
                        const noteUrl = `${process.env.MAIL_LINK}/${block._id}`;

                        const participants = Array.from(new Set(
                            [
                                ...updatedThread.chats.map(c => c.commenterEmail),
                                block.createdBy.userEmail
                            ].filter(email => email && email !== commenterEmail)
                        ));

                        for (const email of participants) {
                            await SlackNotificationService.notifyComment({
                                workspaceId,
                                recipientEmail: email,
                                commenterName,
                                noteTitle,
                                noteIcon,
                                noteUrl,
                                commentText: text
                            });
                        }
                    }
                }
            } catch (error) {
                console.error("[Comment Service] Failed to send Slack notifications for reply:", error);
            }
        })();

        return { success: true, comment: chatMessage };
    },



    /**
     * Delete a full comment thread.
     */
    async deleteComment({
        commentId,
        userId,
        userEmail
    }: {
        commentId: string;
        userId?: string;
        userEmail?: string;
    }) {
        const client = await clientPromise();
        const db = client.db();
        const commentCollection = db.collection<IComment>("comments");
        const blocksCollection = db.collection<IBlock>("blocks");

        const comment = await commentCollection.findOne({ _id: new ObjectId(commentId) });
        if (!comment) return { success: false, message: "Comment not found" };

        // Enforce Authorization: Must be thread creator OR block admin
        let isAuthorized = false;
        if (userEmail && comment.chats && comment.chats.length > 0 && comment.chats[0]?.commenterEmail === userEmail) {
            isAuthorized = true;
        }
        if (!isAuthorized && userId && comment.blockIds && comment.blockIds.length > 0) {
            for (const blockObjectId of comment.blockIds) {
                const hasAdmin = await PermissionService.checkAccess({
                    userId,
                    blockId: blockObjectId.toString(),
                    requiredRole: "admin"
                });
                if (hasAdmin) {
                    isAuthorized = true;
                    break;
                }
            }
        }
        if (!isAuthorized) {
            throw new Error("Forbidden: You do not have permission to delete this comment thread");
        }

        if (comment.blockIds && comment.blockIds.length > 0) {
            await blocksCollection.updateMany(
                { _id: { $in: comment.blockIds } },
                {
                    $pull: { comments: commentId },
                    $set: { updatedAt: new Date() }
                }
            );
        }

        await commentCollection.deleteOne({ _id: new ObjectId(commentId) });

        if (userEmail) {
            await AuditService.log({
                action: "DELETE",
                noteId: comment.blockIds?.[0]?.toString() || "unknown",
                userId: userEmail,
                userEmail: userEmail,
                userName: "unknown",
                noteName: "Comment Thread",
                serviceType: "MONGODB",
                field: "comment",
                oldValue: "Deleted Comment Thread",
                workspaceId: undefined
            });
        }

        return { success: true };
    },

    /**
     * Delete a specific chat message from a thread.
     */
    async deleteChatMessage({
        commentId, // Thread ID
        messageId, // Message ID
        userId,
        userEmail,
        userName,
        noteId
    }: {
        commentId: string;
        messageId: string;
        userId?: string;
        userEmail?: string;
        userName?: string;
        noteId?: string;
    }) {
        const client = await clientPromise();
        const db = client.db();
        const commentCollection = db.collection<IComment>("comments");

        // Audit Log Prep
        const comment = await commentCollection.findOne({ _id: new ObjectId(commentId) });
        const messageToDelete = comment?.chats?.find(c => c.commentId.toString() === messageId);

        if (!messageToDelete) return { success: false, message: "Chat message not found" };

        // Enforce Authorization: Must be message creator OR block admin
        let isAuthorized = false;
        if (userEmail && messageToDelete.commenterEmail === userEmail) {
            isAuthorized = true;
        }
        if (!isAuthorized && userId && comment?.blockIds && comment.blockIds.length > 0) {
            for (const blockObjectId of comment.blockIds) {
                const hasAdmin = await PermissionService.checkAccess({
                    userId,
                    blockId: blockObjectId.toString(),
                    requiredRole: "admin"
                });
                if (hasAdmin) {
                    isAuthorized = true;
                    break;
                }
            }
        }
        if (!isAuthorized) {
            throw new Error("Forbidden: You do not have permission to delete this chat message");
        }

        const updateResult = await commentCollection.updateOne(
            { _id: new ObjectId(commentId) },
            {
                $pull: { chats: { commentId: new ObjectId(messageId) } } as any,
                $set: { updatedAt: new Date() }
            }
        );

        if (updateResult.modifiedCount === 0) {
            // Not found
        }

        if (noteId && userId && userEmail && userName) {
            await AuditService.log({
                action: "DELETE",
                noteId,
                userId,
                userEmail,
                userName,
                noteName: "Note-Name", // Ideally fetched
                serviceType: "MONGODB",
                field: "comment",
                oldValue: messageToDelete?.text || "Chat message",
                newValue: undefined,
                workspaceId: undefined,
            });
        }

        return { success: true };
    },

    /**
     * Update a specific chat message text.
     */
    async updateChatMessage({
        commentId, // Thread ID
        messageId, // Message ID
        text,
        userId,
        userEmail,
        userName,
        noteId
    }: {
        commentId: string;
        messageId: string;
        text: string;
        userId?: string;
        userEmail?: string;
        userName?: string;
        noteId?: string;
    }) {
        const client = await clientPromise();
        const db = client.db();
        const commentCollection = db.collection<IComment>("comments");

        const chat = await commentCollection.findOne({ _id: new ObjectId(commentId) });
        if (!chat) throw new Error("Chat not found");

        const chatMessage = chat.chats.find(c => c.commentId.toString() === messageId);
        if (!chatMessage) throw new Error("Chat message not found");

        const oldText = chatMessage.text;
        const now = new Date();

        const result = await commentCollection.updateOne(
            {
                _id: new ObjectId(commentId),
                "chats.commentId": new ObjectId(messageId)
            },
            {
                $set: {
                    "chats.$.text": text,
                    "chats.$.updatedAt": now,
                    updatedAt: now
                }
            }
        );

        if (result.matchedCount === 0) {
            throw new Error("Chat or message not found during update");
        }

        if (noteId && userId && userEmail && userName) {
            await AuditService.log({
                action: "UPDATE",
                noteId,
                userId,
                userEmail,
                userName,
                noteName: "Note-Name",
                serviceType: "MONGODB",
                field: "comment",
                oldValue: oldText,
                newValue: text,
                workspaceId: undefined,
            });
        }

        const updatedComment = {
            ...chatMessage,
            text,
            updatedAt: now
        };

        return { success: true, comment: updatedComment };
    },

    /**
     * Get all comments for a specific block.
     */
    async getCommentsByBlockId(blockId: string) {
        const client = await clientPromise();
        const db = client.db();
        const commentCollection = db.collection<IComment>("comments");

        const comments = await commentCollection.find({
            blockIds: new ObjectId(blockId)
        }).sort({ createdAt: 1 }).toArray();

        return comments;
    },

    /**
     * Get a specific comment thread by ID.
     */
    async getCommentById(commentId: string) {
        const client = await clientPromise();
        const db = client.db();
        const commentCollection = db.collection<IComment>("comments");

        const comment = await commentCollection.findOne({
            _id: new ObjectId(commentId)
        });

        return comment;
    },

    /**
     * Get multiple comment threads by their IDs.
     */
    async getCommentsByIds(commentIds: string[]) {
        const client = await clientPromise();
        const db = client.db();
        const commentCollection = db.collection<IComment>("comments");

        const objectIds = commentIds.map(id => new ObjectId(id));

        const comments = await commentCollection.find({
            _id: { $in: objectIds }
        }).toArray();

        return comments;
    }
};
