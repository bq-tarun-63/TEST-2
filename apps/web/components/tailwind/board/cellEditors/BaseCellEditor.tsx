"use client";

import React, { useEffect, useRef, useState } from "react";
import type { CellEditorProps } from "@/types/cellEditor";

interface BaseCellEditorProps extends CellEditorProps {
  children: React.ReactNode;
  className?: string;
  maxHeight?: number;
}

export default function BaseCellEditor({
  children,
  position,
  onClose,
  className = "",
  maxHeight = 300,
}: BaseCellEditorProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        // Add a small delay to allow blur events to complete first
        setTimeout(() => {
          onClose();
        }, 100);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    // Prevent scrolling behind the popover
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!dropdownRef.current) return;

    // We must wait for the rendering loop to calculate actual heights
    setTimeout(() => {
      if (!dropdownRef.current) return;

      const rect = dropdownRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      let { top, left } = position;

      // Adjust horizontal position if dropdown goes off-screen
      if (left + rect.width > viewport.width) {
        left = viewport.width - rect.width - 10;
      }

      // Adjust vertical position if dropdown goes off-screen
      // Check if it goes beyond the bottom of the viewport
      if (top + rect.height > viewport.height) {
        // Try positioning it above the trigger element instead
        // Assuming position.height represents the trigger element's height
        const spaceAbove = top - position.height;
        if (spaceAbove > rect.height) {
          top = top - rect.height - position.height - 5;
        } else {
          // Not enough space above either, just stick it to bottom-10px
          top = viewport.height - rect.height - 10;
        }
      }

      // Ensure minimum distance from edges
      left = Math.max(10, left);
      top = Math.max(10, top);

      setAdjustedPosition({ top, left, width: position.width, height: position.height });
    }, 0);
  }, [position]);

  return (
    <div
      ref={dropdownRef}
      className={`fixed z-[1000] bg-background dark:bg-background border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg ${className}`}
      style={{
        top: `${adjustedPosition.top}px`,
        left: `${adjustedPosition.left}px`,
        minWidth: `${position.width}px`,
        maxHeight: `${maxHeight}px`,
      }}
    >
      {children}
    </div>
  );
}
