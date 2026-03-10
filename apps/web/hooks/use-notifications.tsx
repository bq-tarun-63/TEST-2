// hooks/useNotifications.ts
import { useState, useEffect } from "react";
import { useSocketContext } from "../contexts/socketContext";
import { Notification } from "@/types/notification";
import { Members } from "@/types/workspace";
// import { CreateNoteResponse } from "@/hooks/use-addRootPage";
import { Comment } from "@/types/board";
import { Block } from "@/types/block";

interface ShareNotePayload { targetUserId: string; noteId: string; sharedBy: string; }

export const useNotifications = () => {
  const { socket } = useSocketContext();

  const mentionUser = (payload: Notification, noteId: string , noteTitle:string) => {
    payload = {...payload, noteId, noteTitle}
    socket?.emit("mention-user", payload);
  };

  const shareNote = (payload: ShareNotePayload) => {
    socket?.emit("share-note", payload);
  };

  const sendJoinRequest = (payload: Notification, workspaceMembers:Members[]) => {
    socket?.emit("join-request", payload , workspaceMembers);
  };

  const decideJoinRequest = (payload: Notification) => {
    socket?.emit("join-request-decision", payload);
  };

  const notifyNoteAssigned = (payload:Notification) => {
    console.log("📢📢📢📢📢📢📢📢📢 Notifying note assigned:", payload);
    if (!socket) {
      console.error("❌ Socket not available for note assignment notification");
      return;
    }
    if (!socket.connected) {
      console.error("❌ Socket not connected for note assignment notification");
      return;
    }
    console.log("✅ Emitting create-note-assigned event");
    socket.emit("create-note-assigned", payload);
  };

  const notifyPublicPage = (payload: any , workspaceMembers:Members[]) => {
    console.log("📢 Notifying public page:", payload, workspaceMembers);
    payload={...payload,workspaceMembers}
     if(socket)console.log("111111", payload);
    socket?.emit("create-public-note", payload); 
  }

  const notifyCommentMention = (payload:Notification) => {
    console.log("📢 Notifying comment mention:", payload)
    socket?.emit("mention-comment", payload);
  }

  const notifyNewComment = (payload:Comment,targetMembers: Members[]) => {
    const updatedPayload = {...payload, targetMembers}
    console.log("📢 Added a new comment", updatedPayload)
    socket?.emit("new-comment", updatedPayload);
  }

  return {
    // joinRequests,
    mentionUser,
    shareNote,
    sendJoinRequest,
    decideJoinRequest,
    notifyPublicPage,
    notifyNoteAssigned,
    notifyCommentMention,
    notifyNewComment
  };
};
