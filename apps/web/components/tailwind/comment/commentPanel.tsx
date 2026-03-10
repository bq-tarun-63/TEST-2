"use client";

import React, { useEffect, useState, useRef } from "react";
import { useComments } from "@/contexts/commentContext";
import { useCommentPanel } from "@/contexts/inlineCommentContext";
import InlineCommentCard from "./inlineCommentCard";
import clsx from "clsx";
import { MessageSquare, X } from "lucide-react";

export default function CommentPanel({ forceCompact = false }: { forceCompact?: boolean }) {
  const { threadedComments: comments, noteId } = useComments();
  const { isPanelVisible, openCommentId, openComment, closePanel } = useCommentPanel();
  const [positions, setPositions] = useState<Record<string, number>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = (typeof window !== "undefined" && window.innerWidth < 1320) || forceCompact;

  const updatePositions = () => {
    requestAnimationFrame(() => {
      const newPositions: Record<string, number> = {};
      const editorElement = document.querySelector(`.ProseMirror[data-editor-key="${noteId}"]`);
      const panelElement = panelRef.current;

      if (!editorElement || !panelElement || !comments || comments.length === 0) return;

      const panelRect = panelElement.getBoundingClientRect();

      // 1. Get initial "desired" positions
      const threadsWithInfo = comments.map((comment) => {
        const isPageLevel = comment.blockIds.length === 1 && comment.blockIds[0] === noteId;
        let anchor = document.querySelector(`[data-comment-id="${comment._id}"]`);

        if (!anchor && comment.blockIds && comment.blockIds.length > 0) {
          const bId = comment.blockIds[0];
          anchor = document.querySelector(`[data-block-id="${bId}"]`) ||
            document.querySelector(`[data-id="${bId}"]`);
        }

        let desiredTop = 0;
        if (anchor) {
          const anchorRect = anchor.getBoundingClientRect();
          // Subtract 8px to align the card header better with the text line
          desiredTop = anchorRect.top - panelRect.top - 8;
        }

        const cardElement = document.querySelector(`[data-thread-wrapper-id="${comment._id}"]`);
        const actualHeight = cardElement?.getBoundingClientRect().height || 120;

        return {
          id: comment._id,
          desiredTop,
          height: actualHeight,
          hasAnchor: !!anchor,
          isPageLevel
        };
      });

      // 2. Filter out orphans (No anchor) AND intentionally exclude page-level comments
      const visibleThreads = threadsWithInfo.filter(t => t.hasAnchor && !t.isPageLevel);

      // 3. Sort threads
      visibleThreads.sort((a, b) => a.desiredTop - b.desiredTop);

      // 4. Resolve collisions
      const MIN_GAP = 12;
      let lastBottom = 0;

      visibleThreads.forEach((thread) => {
        let finalTop = thread.desiredTop;

        // Ensure it doesn't overlap with previous
        if (finalTop < lastBottom + MIN_GAP) {
          finalTop = lastBottom + MIN_GAP;
        }
        newPositions[thread.id] = finalTop;
        lastBottom = finalTop + thread.height;
      });

      // Increase panel height to ensure scrolling works even with short editor content
      if (panelElement && !isMobile) {
        panelElement.style.minHeight = `${lastBottom + 100}px`;
      }

      setPositions(newPositions);
    });
  };

  useEffect(() => {
    // On mobile we don't necessarily hide the whole panel because we need to render icons
    // But we still want to skip if no comments
    if (comments.length === 0) return;

    // Debounce helper
    let debounceTimer: NodeJS.Timeout;
    const debouncedUpdate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updatePositions, 150);
    };

    // Initial calculation
    const timer = setTimeout(updatePositions, 100);

    // Watch for window resize (debounced)
    window.addEventListener("resize", debouncedUpdate);

    // Watch for editor scroll (throttled)
    let scrollTimeout: NodeJS.Timeout | null = null;
    const handleScroll = () => {
      if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
          updatePositions();
          scrollTimeout = null;
        }, 50);
      }
    };

    const editorElement = document.querySelector(`.ProseMirror[data-editor-key="${noteId}"]`);
    const editorContainer = editorElement?.parentElement;
    if (editorContainer) {
      editorContainer.addEventListener("scroll", handleScroll, true);
    }

    // ResizeObserver to watch for card height changes (debounced)
    const cardResizeObserver = new ResizeObserver(debouncedUpdate);
    const threadWrappers = document.querySelectorAll("[data-thread-wrapper-id]");
    threadWrappers.forEach(el => cardResizeObserver.observe(el));

    // MutationObserver for editor content shifts (heavily debounced)
    const editorObserver = new MutationObserver(debouncedUpdate);
    if (editorElement) {
      editorObserver.observe(editorElement, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      clearTimeout(timer);
      clearTimeout(debounceTimer);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      window.removeEventListener("resize", debouncedUpdate);
      if (editorContainer) {
        editorContainer.removeEventListener("scroll", handleScroll, true);
      }
      cardResizeObserver.disconnect();
      editorObserver.disconnect();
    };
  }, [comments]); // Removed isPanelVisible from deps to keep icons alive

  const activeThread = openCommentId ? comments.find(c => c._id === openCommentId) : null;

  useEffect(() => {
    if (activeThread && (!activeThread.chats || activeThread.chats.length === 0)) {
      closePanel();
    }
  }, [activeThread, closePanel]);

  if (comments.length === 0) return null;

  return (
    <>
      {/* Container for Side Icons (Mobile) or Sidebar (Desktop) */}
      <div
        ref={panelRef}
        className={clsx(
          "relative min-h-full z-[10] transition-all duration-300",
          isMobile ? "w-12 pointer-events-none" : "w-full"
        )}
      >
        {comments
          .filter((thread) => {
            // Show it if it has messages AND
            // (it has a calculated position) AND it is NOT a page-level comment
            const hasMessages = thread.chats && thread.chats.length > 0;
            const hasPosition = positions[thread._id] !== undefined;
            const isPageLevel = thread.blockIds.length === 1 && thread.blockIds[0] === noteId;
            return hasMessages && hasPosition && !isPageLevel;
          })
          .map((commentThread) => {
            const hasPosition = positions[commentThread._id] !== undefined;

            if (isMobile) {
              // Mobile Icons
              return (
                <div
                  key={commentThread._id}
                  className="absolute left-1/2 -translate-x-1/2 pointer-events-auto"
                  style={{
                    top: `${positions[commentThread._id] || 0}px`,
                    transition: "top 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
                  }}
                  onClick={() => openComment(commentThread._id)}
                >
                  <div className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/50 cursor-pointer hover:scale-110 transition-transform shadow-sm">
                    <MessageSquare size={16} />
                  </div>
                </div>
              );
            }

            // Desktop Sidebar Cards
            return (
              <div
                key={commentThread._id}
                data-thread-wrapper-id={commentThread._id}
                style={
                  hasPosition
                    ? {
                      position: "absolute",
                      top: `${positions[commentThread._id]}px`,
                      left: 0,
                      right: 0,
                      transition: "top 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
                    }
                    : {}
                }
              >
                <div className="px-4">
                  {/* @ts-ignore */}
                  <InlineCommentCard thread={commentThread} />
                </div>
              </div>
            );
          })}
      </div>

      {/* Mobile Modal */}
      {isMobile && openCommentId && activeThread && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 translate-z-0 pointer-events-none">
          <div
            className="absolute inset-0 bg-black/20 dark:bg-black/50 pointer-events-auto"
            onClick={closePanel}
          />
          <div className="relative w-full max-w-[450px] bg-background border border-border shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200 ease-out flex flex-col pointer-events-auto">
            {/* Modal Content */}
            <div className="max-h-[75vh] overflow-y-auto scrollbar-hide p-0">
              <div className="p-0">
                {/* @ts-ignore */}
                <InlineCommentCard thread={activeThread} isMobile={true} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
