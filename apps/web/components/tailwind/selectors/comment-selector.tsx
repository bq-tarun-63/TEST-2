"use client";

import { useState, useEffect, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/tailwind/ui/popover";
import { Button } from "@/components/tailwind/ui/button";
import { MessageSquare, Check, ArrowUp, Paperclip, Loader2 } from "lucide-react";
import { useEditor } from "novel";
import { postWithAuth } from "@/lib/api-helpers";
import { toast } from "sonner";
import { clsx } from "clsx";
import { ObjectId } from "bson";
import { useComments } from "@/contexts/commentContext";
import { useAuth } from "@/hooks/use-auth";
import { useCommentFileUpload, type MediaMetaData } from "../comment/commentFileUpload";

interface CommentSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId?: string; // optional, so you can attach comment to a note
}

export const CommentSelector = ({ open, onOpenChange, noteId }: CommentSelectorProps) => {
  const { editor } = useEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [commentText, setCommentText] = useState("");
  const [mediaMetaData, setMediaMetaData] = useState<MediaMetaData[]>([]);
  const { addComment } = useComments();
  const { user } = useAuth();
  const userName = user?.name;
  const initialLetter = userName?.toUpperCase().charAt(0);
  const {
    isUploading: isFileUploading,
    openFilePicker,
    handleFileChange,
    fileInputRef,
    attachmentsElement,
  } = useCommentFileUpload({
    mediaMetaData,
    onMediaChange: setMediaMetaData,
    noteId,
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!editor) return null;

  // submit comment logic
  const handleSubmit = async (e?: React.FormEvent, closeAfterSubmit: boolean = false) => {
    e?.preventDefault();

    const { from, to } = editor.state.selection;
    const isNodeSelection = from + 1 === to && editor.state.selection instanceof Object; // Simplified check for node selection

    console.log("isNodeSelection && form -> to ++", isNodeSelection, from, to);
    if (from === to) {
      toast.error("Select something to comment on.");
      return;
    }

    // 1. Detect blockIds in selection
    const blockIds: string[] = [];
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (node.attrs.blockId) {
        blockIds.push(node.attrs.blockId);
      }
    });

    console.log("blockIds in between from -> to ++", blockIds);

    if (blockIds.length === 0 && noteId) {
      blockIds.push(noteId);
    }

    // 2. Detect existing threadId (if any)
    let existingThreadId: string | undefined = undefined;
    editor.state.doc.nodesBetween(from, to, (node) => {
      const mark = node.marks.find(m => m.type.name === 'commentMark');
      if (mark) {
        existingThreadId = mark.attrs.commentId;
        return false; // stop search
      }
    });

    try {

      if (closeAfterSubmit) onOpenChange(false);
      // 3. Call unified addComment
      const finalThreadId = await addComment(commentText, blockIds, mediaMetaData, existingThreadId);

      console.log("exsistingThreadId && finalThreadId ++ ", existingThreadId, finalThreadId);
      if (finalThreadId) {
        // 4. Set comment mark if it was a new thread or even if reply (to ensure UI anchors)
        if (!existingThreadId) {
          editor.chain().focus().setTextSelection({ from, to }).setMark("commentMark", { commentId: finalThreadId }).run();
        }

        toast.success(existingThreadId ? "Reply added" : "Comment added");
        setCommentText("");
        setMediaMetaData([]);
      } else {
        toast.error("Failed to save comment");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save comment");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(undefined, true);
    }
  };

  return (
    <Popover modal={true} open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="gap-2 rounded-none border-none hover:bg-accent"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="text-sm">Comment</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent sideOffset={10} align="start" className="p-2 w-full bg-background">
        <form onSubmit={(e) => handleSubmit(e, true)} className="flex gap-2">

          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-500">
              {initialLetter}
            </div>
          </div>

          {/* Input field */}
          <input
            ref={inputRef}
            type="text"
            placeholder="Add a comment"
            className="flex-1 rounded-md bg-background p-1 text-sm outline-none"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => openFilePicker(e)}
              aria-label="Attach file"
              className={clsx(
                "flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-gray-600 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-white/10",
                isFileUploading && "cursor-wait"
              )}
              disabled={isFileUploading}
            >
              {isFileUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(undefined, true)}
              disabled={!commentText.trim() && mediaMetaData.length === 0}
              aria-label="Send comment"
              className={clsx(
                "flex items-center justify-center h-6 w-6 rounded-full transition-all duration-150 shrink-0",
                (commentText.trim() || mediaMetaData.length > 0)
                  ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  : "bg-gray-200 text-gray-400 cursor-default dark:bg-[#2c2c2c] dark:text-gray-500 border border-gray-200 dark:border-[#343434]"
              )}
            >
              <ArrowUp className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </form>

        {/* File upload component */}
        {attachmentsElement && <div className="mt-2">{attachmentsElement}</div>}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          accept=".png,.jpg,.jpeg,.pdf,.txt"
        />
      </PopoverContent>
    </Popover>
  );
};
