"use client";

import { useState, useEffect } from "react";
import CommentList from "./commentList";
import CommentInputBox from "./commentInputBox";
import { Comment } from "@/types/comment";
import { CommentProvider, useComments } from "@/contexts/commentContext";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { getWithAuth } from "@/lib/api-helpers";

interface CommentContainerProps {
  comments: Comment[];
  noteId: string;
  boardId: string;
  note: Block;
}

export default function CommentContainer({ noteId, note, filterType = "block" }: Omit<CommentContainerProps, "comments" | "boardId"> & { filterType?: "block" | "slack_sync" }) {
  const { threadedComments, addComment, editComment, deleteComment } = useComments();
  const [showAll, setShowAll] = useState(false);

  // Filter threads tagged with the page's block ID representing page-level comments
  const pageThreads = threadedComments.filter(c => {
    const isPageLevel = c.blockIds?.length === 1 && c.blockIds[0] === noteId;
    const typeMatches = filterType === "slack_sync" ? c.type === "slack_sync" : (c.type === "block" || !c.type);
    return isPageLevel && typeMatches;
  });

  // Flatten threads into a simple list of messages (CommentUI format)
  const pageComments = pageThreads.flatMap((thread) =>
    thread.chats.map((chat) => ({
      ...chat,
      _id: chat.commentId,
      threadId: thread._id,
    }))
  );

  const displayedComments = showAll ? pageComments : pageComments.slice(0, 3);

  const blockIds = [note._id];
  console.log("Printing the comments from commentContainer ====> ++ ", threadedComments);

  return (
    <div className="w-full bg-transparent px-5">
      <div className="flex flex-col gap-3">
        <CommentList
          comments={displayedComments}
          onEditComment={editComment}
          onDeleteComment={deleteComment}
        />

        {pageComments.length > 3 && (
          <button
            className="text-xs text-gray-600 dark:text-gray-200 hover:underline mt-1 text-left"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Show less" : `View all ${pageComments.length} comments`}
          </button>
        )}

        <div className="border-b border-gray-200 dark:border-gray-700 pb-5 mb-1">
          <CommentInputBox onSubmit={(text, bIds, meta, tId) => addComment(text, bIds, meta, tId, filterType)} noteId={noteId} blockIds={blockIds} />
        </div>
      </div>
    </div>
  );
}
