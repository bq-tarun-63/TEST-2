"use client";

import type { ReactNode } from "react";

interface GalleryGridProps {
  children: ReactNode;
  cardSize?: "small" | "medium" | "large";
  minCardWidth?: number;
  gap?: number;
}

export default function GalleryGrid({
  children,
  cardSize = "medium",
  minCardWidth = 300,
  gap = 16,
}: GalleryGridProps) {
  // Card size mapping (can be extended)
  const cardSizeMap = {
    small: 280,
    medium: 300,
    large: 320,
  };

  const actualMinWidth = cardSizeMap[cardSize] || minCardWidth;

  return (
    <div className="w-full">
      <div
        className="grid pt-4 pb-1"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${actualMinWidth}px, 1fr))`,
          gap: `${gap}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

