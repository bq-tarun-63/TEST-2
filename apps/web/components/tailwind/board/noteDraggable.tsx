import React, { useState } from "react";

interface Props {
  noteId: string;
  columnId: string;
  onDragStart: (noteId: string, fromGroupId: string) => void;
  onDragOver?: (targetNoteId: string, targetColumnId: string, position: "above" | "below") => void;
  onDragLeave?: () => void;
  onDrop: (event?: React.DragEvent) => void;
  children: React.ReactNode;
  dataSourceId?: string; // For board → sidebar drags
  sourceBlockIds?: string[]; // Current datasource blockIds for board → editor/sidebar drops
  hoverTarget?: { noteId?: string; columnId: string; position?: "above" | "below" } | null; // From hook for visual indicators
  isDraggable?: boolean;
}

export const NoteDraggable: React.FC<Props> = ({
  noteId,
  columnId,
  onDragStart,
  onDrop,
  children,
  onDragOver,
  onDragLeave,
  dataSourceId,
  sourceBlockIds,
  hoverTarget,
  isDraggable = true
}) => {

  const [hoverPosition, setHoverPosition] = useState<"above" | "below" | null>(null);

  // Use hoverTarget from hook if available (for external drops), otherwise use local state
  const effectiveHoverPosition = hoverTarget?.noteId === noteId && hoverTarget?.columnId === columnId
    ? hoverTarget.position
    : hoverPosition;

  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => {
        if (!isDraggable) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();

        // Set text/plain for compatibility with sidebar
        e.dataTransfer.setData("text/plain", noteId);

        // Set board-specific data for board → sidebar/editor drops
        if (dataSourceId) {
          e.dataTransfer.setData("application/x-board-note", JSON.stringify({
            noteId,
            columnId,
            dataSourceId,
            sourceBlockIds: sourceBlockIds || []
          }));
        }

        onDragStart(noteId, columnId);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes("application/x-board-property-row")) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - bounds.top;
        const position = offset < bounds.height / 2 ? "above" : "below";
        setHoverPosition(position);

        if (onDragOver) onDragOver(noteId, columnId, position);
      }}
      onDragLeave={(e) => {
        // Only clear if leaving the card entirely (not just moving to a child)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHoverPosition(null);
          if (onDragLeave) onDragLeave();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes("application/x-board-property-row")) return;
        onDrop(e);
        setHoverPosition(null);
      }}
      className={`
        bg-white dark:bg-gray-800 rounded-lg shadow cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700
        relative transition-colors
      `}
    >
      {/* Top indicator - show when hovering above this card */}
      {effectiveHoverPosition === "above" && (
        <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 rounded-t z-10" />
      )}

      {/* Bottom indicator - show when hovering below this card */}
      {effectiveHoverPosition === "below" && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 rounded-b z-10" />
      )}

      {children}
    </div>
  );
};
