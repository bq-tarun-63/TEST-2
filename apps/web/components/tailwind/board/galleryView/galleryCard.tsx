"use client";

import type { Block } from "@/types/block";
import type { PropertySchema } from "@/models/types/DatabaseSource";
import { useState, useEffect, useRef } from "react";
import GalleryCardPreview from "./galleryCardPreview";
import GalleryCardProperties from "./galleryCardProperties";
import GalleryCardActions from "./galleryCardActions";
import GalleryCardTitle from "./galleryCardTitle";

interface GalleryCardProps {
  card: Block;
  board: Block;
  boardProperties: Record<string, PropertySchema>;
  visiblePropertyIds: string[];
  propertyOrder: string[];
  previewType?: "page_cover" | "page_content" | string;
  fitImage?: boolean;
  onEdit: (newTitle: string) => void;
  onDelete: () => void;
  onOpenSidebar: (card: Block) => void;
  updateNoteTitleLocally?: (noteId: string, newTitle: string) => void;
  // Drag and drop props
  draggable?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  dragPosition?: "above" | "below" | null;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

export default function GalleryCard({
  card,
  board,
  boardProperties,
  visiblePropertyIds,
  propertyOrder,
  previewType = "page_content",
  fitImage = false,
  onEdit,
  onDelete,
  onOpenSidebar,
  updateNoteTitleLocally,
  // Drag and drop
  draggable,
  isDragging,
  isDropTarget,
  dragPosition,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: GalleryCardProps) {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editValue, setEditValue] = useState<string>(card.value.title);
  const [originalTitle, setOriginalTitle] = useState<string>(card.value.title || "");
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const titleInputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(card.value.title || "");
    }
  }, [card.value.title, isEditing]);

  const handleEditStart = () => {
    setOriginalTitle(card.value.title || "");
    setIsEditing(true);
  };

  const handleEditSubmit = (value: string) => {
    const trimmedValue = value.trim();
    // Check if title has actually changed from the original title before making API call
    if (trimmedValue === originalTitle) {
      // Title hasn't changed, just exit edit mode without API call
      setIsEditing(false);
      setEditValue(card.value.title || "");
      return;
    }
    if (trimmedValue) {
      onEdit(trimmedValue);
      setIsEditing(false);
    } else {
      setIsEditing(false);
      setEditValue(card.value.title || "");
    }
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditValue(card.value.title || "");
    if (updateNoteTitleLocally) {
      updateNoteTitleLocally(card._id, card.value.title || "");
    }
  };

  return (
    <div
      className="group relative"
      draggable={draggable}
      style={{
        opacity: isDragging ? 0.5 : 1,
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drop indicator - left side */}
      {isDropTarget && dragPosition === "above" && (
        <div className="absolute -left-1 top-0 bottom-0 w-1 bg-blue-400 z-10" />
      )}
      <div
        onClick={(e) => {
          // Don't open sidebar if clicking on buttons
          if ((e.target as HTMLElement).closest('button')) {
            return;
          }
          onOpenSidebar(card);
        }}
        className="flex flex-col h-full rounded-lg border bg-background shadow-sm cursor-pointer overflow-hidden transition-colors hover:bg-accent/50 static"
      >
        {/* Preview Section */}
        <div className="relative w-full z-[1]">
          <div className="w-full cursor-default">
            <GalleryCardPreview
              note={card}
              previewType={previewType}
              fitImage={fitImage}
            />
          </div>

          {/* Edit/Options Menu - shown on hover of card or when menu is open */}
          <div className={`${showOptions ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity duration-200 ease`}>
            <GalleryCardActions
              onEdit={handleEditStart}
              onDelete={onDelete}
              onEditProperties={() => onOpenSidebar(card)}
              showOptions={showOptions}
              setShowOptions={setShowOptions}
            />
          </div>
        </div>

        {/* Title Section with Icon */}
        <GalleryCardTitle
          note={card}
          isEditing={isEditing}
          editValue={editValue}
          onEditStart={handleEditStart}
          onEditSubmit={handleEditSubmit}
          onEditCancel={handleEditCancel}
          onEditValueChange={setEditValue}
          updateNoteTitleLocally={updateNoteTitleLocally}
          titleInputRef={titleInputRef}
        />

        {/* Properties Section */}
        <GalleryCardProperties
          note={card}
          board={board}
          boardProperties={boardProperties}
          visiblePropertyIds={visiblePropertyIds}
          propertyOrder={propertyOrder}
        />
      </div>

      {/* Drop indicator - right side */}
      {isDropTarget && dragPosition === "below" && (
        <div className="absolute -right-1 top-0 bottom-0 w-1 bg-blue-400 z-10" />
      )}
    </div>
  );
}
