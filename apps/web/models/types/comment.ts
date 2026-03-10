import { ObjectId } from "mongodb";

export interface MediaMetaData {
    id: string;
    name: string;
    url: string;
    size?: number;
    mimeType?: string;
    uploadedAt?: string;
}

export interface IChatMessage {
    commentId: ObjectId;           // unique id for each comment
    commenterName: string;      // display name of commenter
    commenterEmail: string;     // email of commenter
    text: string;               // comment text
    createdAt: Date;            // when the comment was made
    updatedAt?: Date;
    slackMessageTs?: string;    // specific Slack message TS for this chat message (to avoid duplicates)
    mediaMetaData?: MediaMetaData[]; // Array of uploaded files (images, PDFs, etc.)
}
export interface IComment {
    _id: ObjectId;
    type: "block" | "slack_sync";
    blockIds: ObjectId[]; // List of blocks this comment thread is attached to
    chats: Array<IChatMessage>;
    slackChannelId?: string;    // channel where this thread lives
    slackThreadTs?: string;     // the thread's root timestamp

    createdAt?: Date;
    updatedAt?: Date;
}