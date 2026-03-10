
export interface MediaMetaData {
    id: string;
    name: string;
    url: string;
    size?: number;
    mimeType?: string;
    uploadedAt?: string;
}

export interface ChatMessage {
    commentId: string;           // unique id for each comment
    commenterName: string;      // display name of commenter
    commenterEmail: string;     // email of commenter
    text: string;               // comment text
    createdAt: string;            // when the comment was made
    updatedAt?: string;
    mediaMetaData?: MediaMetaData[]; // Array of uploaded files (images, PDFs, etc.)
}
export interface Comment {
    _id: string;
    type: "block" | "slack_sync";
    blockIds: string[]; // List of blocks this comment thread is attached to
    chats: Array<ChatMessage>;
    createdAt?: string;
    updatedAt?: string;
}

export interface CommentUI extends ChatMessage {
    _id: string;      // Thread ID for React keys and general reference
    threadId: string; // Parent Thread ID
}