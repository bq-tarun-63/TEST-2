"use client";
import { useEffect } from "react";
import { useSocketContext } from "@/contexts/socketContext";
import { useNotificationsContext } from "./notificationContext";
import { useNoteContext } from "@/contexts/NoteContext";
import { eventBus } from "@/services-frontend/comment/eventBus";
import { useGlobalBlocks } from "../blockContext";
import { useRootPagesOrder } from "../rootPagesOrderContext";
export const NotificationSocketListener = () => {
  
  const { socket } = useSocketContext();
  const { setNotifications } = useNotificationsContext();
  const { setNotes } = useNoteContext();
  const { addBlock } = useGlobalBlocks();
  const { addPublicPage } = useRootPagesOrder();

  useEffect(() => {
    if (!socket) return;

    const handleJoinRequest = (data) => {
        setNotifications((prev) => [data, ...prev]);
    };

    const handleNoteAssigned = (data) => {
      console.log("📢 🔴📢 🔴🔴🔴🔴🔴📢🔴🔴🔴🔴🔴🔴 (handleNoteAssigned)");
      console.log("note assigned is received",data);
      
      setNotifications((prev) => {
        // Push the new notification
        const updatedNotifications = [data, ...prev];
        
        // Deduplicate by notification._id
        const uniqueNotifications = Array.from(
          new Map(updatedNotifications.map(notification => [notification._id, notification])).values()
        );
        
        return uniqueNotifications;
      });
    };

    const  handleJoinRequestUpdate = (data) => {
        setNotifications((prev) => [data, ...prev]);
    };       

    const handleUserMention = (data) => {
        setNotifications((prev) => [data, ...prev]);
    };

    const handleNewPublicNote = (data) => {
      console.log("📢 📢 📢 (handleNewPublicNote)");
      console.log("new public note is received",data);
      
      //remove the workspace members from the data
      const { workspaceMembers, ...note } = data;
      console.log("note is received", note);

      //add block to the blocks context
      addBlock(note);

      //add public page to the public page order 
      addPublicPage(note._id);

    };

    const handleCommentMention = (data) => {
      console.log("📢 📢 📢 (handleCommentMention)");
      setNotifications((prev) => [data, ...prev]);
    };

    const handleNewComment = (data) => {
      console.log("📢 📢 📢 (handleNewComment)", data);
      eventBus.emit('new-comment' , data);
    };

    socket.off("receive-note-assigned", handleNoteAssigned); 
    socket.on("receive-note-assigned", handleNoteAssigned);
   
    socket.off("receive-join-request", handleJoinRequest);
    socket.on("receive-join-request", handleJoinRequest);

    socket.off("join-request-update", handleJoinRequestUpdate);
    socket.on("join-request-update", handleJoinRequestUpdate);

    socket.off("receive-public-note", handleNewPublicNote);
    socket.on("receive-public-note", handleNewPublicNote);

    socket.off("receive-mention", handleUserMention);
    socket.on("receive-mention", handleUserMention);

    socket.off("receive-comment-mention", handleCommentMention);
    socket.on("receive-comment-mention", handleCommentMention);

    socket.off("receive-new-comment", handleNewComment);
    socket.on("receive-new-comment", handleNewComment);

    return () => {
      socket.off("receive-mention");
      socket.off("receive-join-request");
      socket.off("join-request-update");
      socket.off("receive-public-note");
      socket.off("receive-note-assigned");
      socket.off("receive-comment-mention");
      socket.off("receive-new-comment");
    };
  }, [socket]);

  return null; // This is a headless listener component
};
