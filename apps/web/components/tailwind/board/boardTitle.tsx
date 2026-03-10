"use client";

import React, { useState, useEffect, useRef } from "react";
import EmojiPicker from "@/components/tailwind/editor/EmojiPicker";

interface BoardTitleProps {
  initialTitle?: string;
  initialIcon?: string;
  onChange?: (title: string) => void;
  onIconChange?: (icon: string) => void;
}

export default function BoardTitle({
  initialTitle = "My Task Board",
  initialIcon = "",
  onChange,
  onIconChange,
}: BoardTitleProps) {
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState(initialIcon);
  const [editing, setEditing] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement>(null);

  // Sync title with initialTitle prop when it changes
  useEffect(() => {
    if (initialTitle && !editing) {
      setTitle(initialTitle);
    }
  }, [initialTitle, editing]);

  useEffect(() => {
    if (initialIcon !== icon) {
      setIcon(initialIcon);
    }
  }, [initialIcon]);

  const handleBlur = () => {
    setEditing(false);
    onChange?.(title.trim() || "New page");
  };

  const handleIconSelect = (selectedEmoji: string) => {
    setIcon(selectedEmoji);
    setIsEmojiPickerOpen(false);
    onIconChange?.(selectedEmoji);
  };

  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="relative flex items-center">
        <button
          ref={iconButtonRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsEmojiPickerOpen(!isEmojiPickerOpen);
          }}
          className="text-2xl h-8 leading-8 flex items-center justify-center hover:bg-muted/50 rounded transition-colors px-1 cursor-pointer"
        >
          {icon || "📄"}
        </button>

        {isEmojiPickerOpen && (
          <EmojiPicker
            currentEmoji={icon}
            onSelect={handleIconSelect}
            onClose={() => setIsEmojiPickerOpen(false)}
            onRemove={() => handleIconSelect("")}
            position="absolute"
            anchorRef={iconButtonRef}
          />
        )}
      </div>

      <div className="relative flex-1">
        <h2
          className={`
            text-2xl font-semibold tracking-tight
            h-8 leading-8
            m-0 p-0
            transition-colors
            ${editing ? "opacity-0 pointer-events-none" : "cursor-text text-foreground hover:text-primary"}
          `}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!editing) setEditing(true);
          }}
        >
          {title}
        </h2>

        {editing && (
          <input
            type="text"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleBlur();
            }}
            className="
              absolute top-0 left-0
              w-full
              text-2xl font-semibold tracking-tight
              bg-transparent
              border-none
              focus:outline-none
              focus:ring-0
              h-8 leading-8
              m-0 p-0
              shadow-none
              transition-colors
            "
          />
        )}
      </div>
    </div>
  );
}
