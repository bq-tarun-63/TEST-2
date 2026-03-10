"use client";

import React, { useState, useRef, useEffect } from "react";
import { ArrowUp, Paperclip, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useCommentPanel } from "@/contexts/inlineCommentContext";
import { useComments } from "@/contexts/commentContext";
import MentionList from "../mention-list";
import { useCommentFileUpload, type MediaMetaData } from "./commentFileUpload";
import { useAuth } from "@/hooks/use-auth";

interface InlineChatInputBoxProps {
  parentCommentId: string;
  noteId?: string;
  autoFocus?: boolean;
}

const InlineChatInputBox: React.FC<InlineChatInputBoxProps> = ({ parentCommentId, noteId, autoFocus }) => {
  const [text, setText] = useState("");
  const [mentionMap, setMentionMap] = useState<Map<string, string>>(new Map());
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mediaMetaData, setMediaMetaData] = useState<MediaMetaData[]>([]);
  const textareaRef = useRef<HTMLDivElement>(null);
  const { addComment } = useComments();
  // const { comments } = useCommentPanel();
  const { user } = useAuth();

  // Get noteId from comment if not provided
  // const resolvedNoteId = noteId || comments.find((c) => c._id === parentCommentId)?.noteId;
  const {
    isUploading: isFileUploading,
    openFilePicker,
    handleFileChange,
    fileInputRef,
    attachmentsElement,
  } = useCommentFileUpload({
    mediaMetaData,
    onMediaChange: setMediaMetaData,
    // noteId: resolvedNoteId,
  });

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Helper to get cursor position in contentEditable
  const getCursorPosition = (element: HTMLDivElement): number => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    return preCaretRange.toString().length;
  };

  // Helper to set cursor position in contentEditable
  const setCursorPosition = (element: HTMLDivElement, position: number) => {
    const selection = window.getSelection();
    const range = document.createRange();

    let currentPos = 0;
    let found = false;

    function traverse(node: Node) {
      if (found) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const textLength = node.textContent?.length || 0;
        if (currentPos + textLength >= position) {
          range.setStart(node, position - currentPos);
          range.collapse(true);
          found = true;
          return;
        }
        currentPos += textLength;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          const childNode = node.childNodes[i];
          if (childNode) {
            traverse(childNode);
            if (found) return;
          }
        }
      }
    }

    traverse(element);

    if (found) {
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  // Helper to render text with blue mentions in input
  const renderTextWithMentions = (plainText: string) => {
    if (!textareaRef.current) return;

    const parts: Array<{ type: 'text' | 'mention'; content: string }> = [];
    let lastIndex = 0;

    // Find all @mentions (simplified pattern for input)
    // In input, we are looking for @Name that is in our mentionMap
    const names = Array.from(mentionMap.keys());
    if (names.length === 0) {
      textareaRef.current.innerText = plainText;
      return;
    }

    // Sort names by length descending to match longest first
    names.sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(\\s|$)`, 'g');

    let match;
    while ((match = pattern.exec(plainText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: plainText.slice(lastIndex, match.index)
        });
      }

      parts.push({
        type: 'mention',
        content: match[0].trimEnd()
      });
      lastIndex = match.index + match[0].trimEnd().length;
    }

    if (lastIndex < plainText.length) {
      parts.push({
        type: 'text',
        content: plainText.slice(lastIndex)
      });
    }

    textareaRef.current.innerHTML = '';
    parts.forEach(part => {
      if (part.type === 'mention') {
        const span = document.createElement('span');
        span.textContent = part.content;
        span.className = 'text-blue-600 dark:text-blue-400 font-medium';
        textareaRef.current!.appendChild(span);
      } else {
        textareaRef.current!.appendChild(document.createTextNode(part.content));
      }
    });
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.innerText;
    setText(newText);

    // Get cursor position for mention detection
    const cursorPos = getCursorPosition(e.currentTarget);
    const textBeforeCursor = newText.slice(0, cursorPos);

    const mentionMatch = textBeforeCursor.match(/@([\w]*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1] || "");
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const handleMentionSelect = (item: { id: string; label: string }) => {
    if (!textareaRef.current) return;

    const cursorPos = getCursorPosition(textareaRef.current);
    const textBeforeCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);

    // Replace @query with @label
    const updatedBefore = textBeforeCursor.replace(/@[\w]*$/, `@${item.label} `);
    const newFullText = updatedBefore + textAfterCursor;

    const newMentionMap = new Map(mentionMap);
    newMentionMap.set(item.label, item.id);
    setMentionMap(newMentionMap);

    setText(newFullText);

    // Render with styling
    // We need to pass the map to renderTextWithMentions or ensure it uses the latest state
    // For simplicity here, we'll wait for state update or manually render
    setTimeout(() => {
      if (textareaRef.current) {
        renderTextWithMentions(newFullText);
        textareaRef.current.focus();
        setCursorPosition(textareaRef.current, updatedBefore.length);
      }
    }, 0);

    setShowMentions(false);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() && mediaMetaData.length === 0) return;

    let textToStore = text;
    mentionMap.forEach((userId, name) => {
      // Use word boundaries or specific pattern to avoid partial matches
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`@${escapedName}(\\s|$)`, "g");
      textToStore = textToStore.replace(regex, (match, p1) => `@[${name}](${userId})${p1}`);
    });

    addComment(textToStore, [], mediaMetaData, parentCommentId);
    setText("");
    setMentionMap(new Map());
    setMediaMetaData([]);
    if (textareaRef.current) textareaRef.current.innerHTML = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const initialLetter = user?.name?.toUpperCase().charAt(0) || "U";

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex gap-2">
        {/* Avatar */}
        <div className="flex-shrink-0 mt-1 mr-2 p-1">
          <div className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-500">
            {initialLetter}
          </div>
        </div>

        {/* Input container */}
        <div className="flex-1 min-w-0 text-sm flex items-end bg-transparent p-[2px] gap-2">
          <div className="relative flex-1 min-w-0 text-sm bg-transparent p-[2px]">
            <div
              ref={textareaRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              className="flex-grow min-h-[24px] w-full outline-none resize-none text-gray-800 dark:text-gray-100 leading-5 whitespace-pre-wrap"
            />

            {text.trim() === "" && (
              <p className="absolute top-[2px] left-[2.5px] text-gray-400 dark:text-gray-500 pointer-events-none select-none">
                Add a reply…
              </p>
            )}

            {showMentions && (
              <div className="absolute bottom-full left-0 mb-2 w-64 z-50">
                <MentionList query={mentionQuery} command={handleMentionSelect} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 pb-[3px]">
            <button
              type="button"
              onClick={(e) => openFilePicker(e)}
              className={clsx(
                "p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors",
                isFileUploading && "animate-pulse"
              )}
              disabled={isFileUploading}
            >
              {isFileUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            </button>

            <button
              onClick={() => handleSubmit()}
              disabled={!text.trim() && mediaMetaData.length === 0}
              className={clsx(
                "flex items-center justify-center h-6 w-6 rounded-full transition-all duration-150",
                (text.trim() || mediaMetaData.length > 0)
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-200 text-gray-400 cursor-default dark:bg-[#2c2c2c] dark:text-gray-500 border border-gray-200 dark:border-[#343434]"
              )}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* File upload preview */}
        {attachmentsElement && <div className="ml-8">{attachmentsElement}</div>}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          multiple
          accept=".png,.jpg,.jpeg,.pdf,.txt"
        />
      </div>
    </div>
  );
};

export default InlineChatInputBox;
