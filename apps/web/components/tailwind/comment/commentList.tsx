"use client";

import { CommentUI } from "@/types/comment";
import CommentItem from "./commentItem";


interface CommentListProps {
  comments: CommentUI[];
  onEditComment?: (commentId: string, newText: string) => void;
  onDeleteComment?: (commentId: string) => void;
}

export default function CommentList({
  comments,
  onEditComment,
  onDeleteComment,
}: CommentListProps) {
  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <CommentItem
          key={comment._id}
          comment={comment}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
        />
      ))}
    </div>
  );
}
