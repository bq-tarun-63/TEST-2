"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Comment, MediaMetaData, ChatMessage, CommentUI } from "@/types/comment";
import { useAuth } from "@/hooks/use-auth";
import { ObjectId } from "bson";
import { deleteWithAuth, postWithAuth } from "@/lib/api-helpers";
import { toast } from "sonner";
import { useCommentMentions } from "@/hooks/use-commentMention";
import { useWorkspaceContext } from "./workspaceContext";
import { useNotifications } from "@/hooks/use-notifications";
import { useNoteContext } from "./NoteContext";
import { Members } from "@/types/workspace";
import { eventBus } from "@/services-frontend/comment/eventBus";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "./blockContext";

interface CommentContextType {
  comments: CommentUI[]; // Flat list of messages
  threadedComments: Comment[]; // Threaded discussions
  addComment: (text: string, blockIds: string[], mediaMetaData?: MediaMetaData[], threadId?: string, type?: "block" | "slack_sync") => Promise<string | undefined>;
  editComment: (commentId: string, newText: string) => void;
  deleteComment: (commentId: string) => void;
  setComments: (comments: Comment[]) => void;
  noteId: string;
}

type DeleteCommentResponse = {
  message: string;
  comment: { success: boolean };
};

const CommentContext = createContext<CommentContextType | undefined>(undefined);

export function CommentProvider({
  children,
  initialComments = [],
  noteId,
  boardId,
  note,
}: {
  children: ReactNode;
  initialComments?: Comment[];
  noteId: string;
  boardId: string,
  note: Block
}) {
  const flattenComments = (threaded: Comment[]): CommentUI[] => {
    return threaded.flatMap((thread) =>
      thread.chats.map((chat) => ({
        ...chat,
        _id: chat.commentId, // Use message ID as unique _id for UI
        threadId: thread._id, // Keep reference to thread
      }))
    );
  };

  const [threadedComments, setThreadedComments] = useState<Comment[]>(initialComments);
  const [comments, setInternalComments] = useState<CommentUI[]>(flattenComments(initialComments));
  const { user } = useAuth();
  const { sendMentionNotifications } = useCommentMentions();
  const { currentWorkspace, workspaceMembers } = useWorkspaceContext();
  const { notifyCommentMention, notifyNewComment } = useNotifications();
  const { iscurrentNotPublic, sharedWith } = useNoteContext();
  const { getBlock, updateBlock } = useGlobalBlocks();

  const setComments = (newThreadedComments: Comment[]) => {
    setThreadedComments(newThreadedComments);
    setInternalComments(flattenComments(newThreadedComments));
  };

  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  useEffect(() => {
    function onNewComment(comment: Comment) {
      console.log("New comment received throgh Bus ", comment)
      setThreadedComments((prev) => {
        if (prev.some(p => p._id === comment._id)) return prev;
        return [...prev, comment];
      });
      setInternalComments((prev) => {
        const newFlat = flattenComments([comment]);
        const filteredNew = newFlat.filter(nc => !prev.some(pc => pc.commentId === nc.commentId));
        if (filteredNew.length === 0) return prev;
        return [...prev, ...filteredNew];
      })
    }
    eventBus.on("new-comment", onNewComment);
    return () => eventBus.off("new-comment", onNewComment);
  }, [])


  const addComment = async (text: string, blockIds: string[], mediaMetaData?: MediaMetaData[], threadId?: string, type: "block" | "slack_sync" = "block"): Promise<string | undefined> => {

    console.log("Printing the text ====> ++ ", text);
    console.log("Printing the blockIds ====> ++ ", blockIds);
    console.log("Printing the mediaMetaData ====> ++ ", mediaMetaData);
    console.log("Printing the explicit threadId ====> ++ ", threadId);

    if (!user) {
      console.log("User not found")
      return;
    }

    // Relaxed check: blockIds are required for new threads, but not necessarily for replies.
    if (!threadId && (!blockIds || blockIds.length === 0)) {
      toast.error("Block IDs are required for new comments");
      return;
    }


    const isPageComment = blockIds.length === 1 && blockIds[0] === note?._id;

    // Check if we are adding to an existing thread or creating a new one
    // 1. Explicit threadId (always a reply/intended thread)
    // 2. If it's a page-level comment (targeting only the note block), fall back to the note's first comment thread
    const existingThreadId = threadId || (isPageComment && note?.comments && note.comments.length > 0 ? note.comments[0] : null);

    const isReply = !!existingThreadId;

    console.log("Is Page Comment:", isPageComment);
    console.log("Printing the existingThreadId ====> ++ ", existingThreadId);
    console.log("Printing the isReply ====> ++ ", isReply);

    // Generate IDs
    const finalThreadId = existingThreadId || new ObjectId().toString();
    const messageId = new ObjectId().toString();

    console.log("Printing the finalThreadId ====> ++ ", finalThreadId);
    console.log("Printing the messageId ====> ++ ", messageId);

    // Create optimistic comment
    const newChat: ChatMessage = {
      commentId: messageId,
      commenterName: user?.name || "unknown",
      commenterEmail: user?.email || "",
      text,
      createdAt: new Date().toISOString(),
      ...(mediaMetaData && mediaMetaData.length > 0 ? { mediaMetaData } : {}),
    };

    const newCommentUI: CommentUI = {
      ...newChat,
      _id: messageId,
      threadId: finalThreadId,
    };
    console.log("Printing the new comment (optimistic) ====> ++ ", newCommentUI);

    setInternalComments((prev) => [...prev, newCommentUI]);

    // Update threaded comments state
    setThreadedComments((prev) => {
      if (isReply) {
        return prev.map((thread) =>
          thread._id === finalThreadId
            ? { ...thread, chats: [...thread.chats, newChat] }
            : thread
        );
      } else {
        const newThread: Comment = {
          _id: finalThreadId,
          type: type,
          blockIds,
          chats: [newChat],
          createdAt: newChat.createdAt,
        };
        return [...prev, newThread];
      }
    });

    // Update block metadata
    blockIds.forEach(bId => {
      // For NEW inline comments, we only want to update the content blocks, not the root note block
      // This prevents inline comments from cluttering the page-level comment list
      if (!isReply && !isPageComment && bId === note?._id) return;

      const block = getBlock(bId);
      const blockComments = block?.comments || [];
      const newComments = blockComments.includes(finalThreadId)
        ? blockComments
        : [...blockComments, finalThreadId];

      console.log(`Updating block ${bId} with newComments:`, newComments);
      updateBlock(bId, { comments: newComments });
    });

    try {
      let response: any;

      if (isReply) {
        // Adding a chat message to an existing thread
        response = await postWithAuth("/api/comments/chat/create", {
          commentId: finalThreadId,
          messageId: messageId,
          text,
          ...(mediaMetaData && mediaMetaData.length > 0 ? { mediaMetaData } : {}),
        });
      } else {
        // Creating a new comment thread
        response = await postWithAuth("/api/comments/create", {
          text,
          blockIds,
          commentId: finalThreadId,
          firstMessageId: messageId,
          type,
          ...(mediaMetaData && mediaMetaData.length > 0 ? { mediaMetaData } : {}),
        });
      }

      const success = isReply ? !!response?.comment : !!response?.comment?.success;
      console.log("Printing the success ====> ++ ", success);

      if (success) {
        // const serverCommentThread = isReply ? response.comment : response.comment?.comment;
        // console.log("Printing the server response ====> ++ ", serverCommentThread);

        // For a new thread, response structure is { success, comment: { _id, chats: [...] } }
        // For a chat reply, response structure is { message, comment: { commentId, text, ... } }

        // let serverComment: CommentUI;

        // if (isReply) {
        //   // Response is the chat message itself
        //   const chat = response.comment;
        //   serverComment = {
        //     ...chat,
        //     _id: chat.commentId,
        //     threadId: threadId,
        //   };
        // } else {
        //   // Response is the thread, we need the first chat
        //   const thread = response.comment.comment;
        //   const firstChat = thread.chats[0];
        //   serverComment = {
        //     ...firstChat,
        //     _id: firstChat.commentId,
        //     threadId: thread._id,
        //   };
        // }

        // // Replace optimistic comment with real one
        // setInternalComments((prev) =>
        //   prev.map((c) =>
        //     c.commentId === messageId ? serverComment : c
        //   )
        // );

        // Determine who to send the new comment 
        let targetMembers: Members[] = [];
        targetMembers = workspaceMembers;

        // send the new COMMENT to the targetMembers in real time 
        // if (targetMembers.length > 0) {
        //   notifyNewComment( newCommentUI , targetMembers);
        // }

        // Make the notification in DB 
        if (!currentWorkspace) {
          console.error("Unable to fetch the workspace !!");
          return finalThreadId;
        }
        const noteBlock = getBlock(noteId)
        const noteTitle = noteBlock?.value?.title;
        const notificationResposne = await sendMentionNotifications(currentWorkspace?._id, newCommentUI, noteId, noteTitle);

        console.log("Printing the notificationResposne ====> ++ ", notificationResposne);
        // // send the notification in Real-Time
        if (notificationResposne) {
          console.log("Notification sending  ON ++");
          notifyCommentMention(notificationResposne);
          console.log("Notification sent successfully");
        }

        return finalThreadId;
      }
      else {
        toast.error("Failed to add comment");
        throw new Error("Failed to add comment");
      }
    }
    catch (err) {
      console.log("Error in adding comment", err);
      // setInternalComments((prev) => prev.filter((c) => c.commentId !== messageId));
      toast.error("Failed to add comment");
      return undefined;
    }
  };

  const editComment = async (commentId: string, newText: string) => {

    // const prevComments = comments;
    const commentToEdit = comments.find(c => c.commentId === commentId);
    if (!commentToEdit) return;

    console.log("Printing the internalComments ====> ++ ", comments, threadedComments);
    setInternalComments((prev) =>
      prev.map((c) => (c.commentId === commentId ? { ...c, text: newText } : c))
    );
    setThreadedComments((prev) =>
      prev.map((thread) =>
        thread._id === commentToEdit.threadId
          ? { ...thread, chats: thread.chats.map(chat => chat.commentId === commentId ? { ...chat, text: newText } : chat) }
          : thread
      )
    );

    try {
      const response = await postWithAuth("/api/comments/chat/update", {
        commentId: commentToEdit.threadId,
        messageId: commentId,
        text: newText,
        noteId,
      });

      if (response?.comment) {
        const updatedAt = response.comment.updatedAt;

        // Replace optimistic comment with real one
        setInternalComments((prev) =>
          prev.map((c) => (c.commentId === commentId ? { ...c, updatedAt } : c))
        );

        setThreadedComments((prev) =>
          prev.map((thread) =>
            thread._id === commentToEdit.threadId
              ? { ...thread, chats: thread.chats.map(chat => chat.commentId === commentId ? { ...chat, updatedAt } : chat) }
              : thread
          )
        );
      }
      else {
        toast.error("Failed to edit comment");
        throw new Error("Failed to edit comment");
      }
    }
    catch (err) {
      console.log("Error in editing comment", err);
      // setInternalComments(prevComments);
    }
  };

  const deleteComment = async (commentId: string) => {

    // const prevComments = [...comments];
    const commentToDelete = comments.find(c => c.commentId === commentId);
    if (!commentToDelete) {
      console.log("[CommentContext] No comment found to delete for ID:", commentId);
      return;
    }

    console.log("[CommentContext] Deleting comment:", commentId, "from thread:", commentToDelete.threadId);

    setInternalComments((prev) => prev.filter((c) => c.commentId !== commentId));

    const updatedThreads = threadedComments.map((thread) =>
      thread._id === commentToDelete.threadId
        ? { ...thread, chats: thread.chats.filter(chat => chat.commentId !== commentId) }
        : thread
    );

    const filteredThreads = updatedThreads.filter(thread => thread.chats.length > 0);

    const threadWasDeleted = filteredThreads.length < threadedComments.length;

    console.log("[CommentContext] Thread was deleted:", threadWasDeleted);
    if (threadWasDeleted) {
      console.log("[CommentContext] Thread fully removed, emitting deletion event for:", commentToDelete.threadId);
      eventBus.emit("comment-thread-deleted", commentToDelete.threadId);
    }

    setThreadedComments(filteredThreads);

    try {
      const response = await deleteWithAuth("/api/comments/chat/delete", {
        body: JSON.stringify({
          commentId: commentToDelete.threadId,
          messageId: commentId,
          noteId
        }),
        headers: {
          "Content-Type": "application/json"
        }
      }) as any;

      if (response?.message === "Message deleted successfully" || response?.success) {
        // Success
      }
      else {
        toast.error("Failed to delete comment");
        throw new Error("Failed to delete comment");
      }

    }
    catch (err) {
      console.log("Error in deleting comment", err);
      // setInternalComments(prevComments);
    }
  };

  return (
    <CommentContext.Provider
      value={{
        comments,
        threadedComments,
        addComment,
        editComment,
        deleteComment,
        setComments,
        noteId,
      }}
    >
      {children}
    </CommentContext.Provider>
  );
}

export const useComments = () => {
  const context = useContext(CommentContext);
  if (!context) throw new Error("useComments must be used within CommentProvider");
  return context;
};
