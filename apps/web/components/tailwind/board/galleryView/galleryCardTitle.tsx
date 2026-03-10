"use client";

import { useRef } from "react";
import type { Block } from "@/types/block";

interface GalleryCardTitleProps {
  note: Block;
  isEditing: boolean;
  editValue: string;
  onEditStart: () => void;
  onEditSubmit: (value: string) => void;
  onEditCancel: () => void;
  onEditValueChange: (value: string) => void;
  updateNoteTitleLocally?: (noteId: string, newTitle: string) => void;
  titleInputRef?: React.MutableRefObject<HTMLDivElement | null>;
}

export default function GalleryCardTitle({
  note,
  isEditing,
  editValue,
  onEditStart,
  onEditSubmit,
  onEditCancel,
  onEditValueChange,
  updateNoteTitleLocally,
  titleInputRef,
}: GalleryCardTitleProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const editInputRef = titleInputRef || internalRef;

  const handleEditSubmit = () => {
    onEditSubmit(editValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === "Escape") {
      onEditCancel();
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // check if blur target is inside the member button
    if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest("#member-btn")) {
      return; // do not close edit mode
    }
    handleEditSubmit();
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const newValue = e.currentTarget.textContent || "";
    onEditValueChange(newValue);
    if (updateNoteTitleLocally) {
      updateNoteTitleLocally(note._id, newValue);
    }
  };

  return (
    <div className="relative w-full flex items-start px-2.5 py-2">
      {note.value.icon && (
        <div
          role="button"
          tabIndex={0}
          className="flex items-center justify-center h-4 w-4 rounded-md flex-shrink-0 mr-1 mt-1 cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="text-sm">
            {note.value.icon}
          </div>
        </div>
      )}
      {isEditing ? (
        <div
          contentEditable
          suppressContentEditableWarning={true}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex-grow max-w-full w-auto min-h-[1em] text-[15px] leading-[1.5] font-medium break-words outline-none rounded px-0.5 py-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
          data-placeholder="New page"
          ref={(el) => {
            const currentRef = titleInputRef || internalRef;
            if (el) {
              // Update the ref
              if ('current' in currentRef) {
                (currentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }
              // Focus and place cursor at the end when entering edit mode (like board view)
              if (isEditing) {
                el.focus();
                const range = document.createRange();
                const sel = window.getSelection();
                if (el.childNodes.length > 0) {
                  const lastNode = el.childNodes[el.childNodes.length - 1];
                  if (lastNode) {
                    range.setStartAfter(lastNode);
                  } else {
                    range.setStart(el, 0);
                  }
                } else {
                  range.setStart(el, 0);
                }
                range.collapse(true);
                sel?.removeAllRanges();
                sel?.addRange(range);
              }
            }
          }}
        >
          {editValue}
        </div>
      ) : (
        <div
          spellCheck
          contentEditable={false}
          data-content-editable-leaf="true"
          tabIndex={0}
          role="textbox"
          aria-label="Start typing to edit text"
          className="flex-grow max-w-full w-auto whitespace-pre-wrap break-words pointer-events-none px-0.5 text-[15px] leading-[1.5] min-h-[1em] font-medium"
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEditStart();
          }}
        >
          {note.value.title.trim() === "" ? <span className="text-gray-400 dark:text-gray-500">New page</span> : note.value.title}
        </div>
      )}
    </div>
  );
}

