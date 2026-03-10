import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  id: string;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  renderHeader?: React.ReactNode;
  children: React.ReactNode;
}

export const Draggable: React.FC<Props> = ({
  id,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children,
  renderHeader,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isOver, setIsOver] = useState<boolean>(false);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; width: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  const headerRef = useRef<HTMLDivElement>(null);

  // Preload the empty image to guarantee it's available synchronously on the first drag
  const emptyImageRef = useRef<HTMLImageElement | null>(null);
  if (typeof window !== 'undefined' && !emptyImageRef.current) {
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    emptyImageRef.current = img;
  }

  const handleDragStart = (e?: React.DragEvent) => {
    setIsDragging(true);
    onDragStart(id);

    if (e && headerRef.current) {
      // Hide default html5 ghost representation using the preloaded image
      if (emptyImageRef.current) {
        e.dataTransfer.setDragImage(emptyImageRef.current, 0, 0);
      }

      const rect = headerRef.current.getBoundingClientRect();
      setDragOffset(e.clientX - rect.left);
      setGhostPos({ x: rect.left, y: rect.top, width: rect.width });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    if (e.clientX === 0 && e.clientY === 0) return; // Chrome outputs 0,0 before drag end
    setGhostPos((prev) => prev ? { ...prev, x: e.clientX - dragOffset } : prev);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setGhostPos(null);
    onDragEnd();
  };

  return (
    <>
      <div
        draggable={!renderHeader}
        onDragStart={!renderHeader ? (e) => handleDragStart(e) : undefined}
        onDragEnd={!renderHeader ? handleDragEnd : undefined}
        onDragOver={(e) => {
          e.preventDefault(); // Required for drop to fire
          if (e.dataTransfer.types.includes("application/x-board-property-row")) return;
          setIsOver(true);
          onDragOver(id);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          if (e.dataTransfer.types.includes("application/x-board-property-row")) {
            setIsOver(false);
            return;
          }
          setIsOver(false);
          onDrop(id);
        }}
        className={`transition-all ${isOver ? "rounded-lg" : ""}`}
      >
        {renderHeader && (
          <div
            ref={headerRef}
            draggable
            onDragStart={(e) => handleDragStart(e)}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            className={`cursor-grab active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
            style={{ transition: isDragging ? "none" : "opacity 0.2s" }}
          >
            {renderHeader}
          </div>
        )}
        {children}
      </div>

      {isDragging && ghostPos && renderHeader && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: ghostPos.y,
              left: ghostPos.x,
              width: ghostPos.width,
              pointerEvents: "none",
              zIndex: 9999,
              opacity: 0.9,
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              transform: "scale(1.02)",
            }}
          >
            {renderHeader}
          </div>,
          document.body
        )}
    </>
  );
};
