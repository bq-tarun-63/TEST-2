"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export type DragSource = "board" | "editor" | "sidebar" | "calendar" | null;

export interface DragNoteInfo {
  noteId: string;
  columnId?: string;
  [key: string]: any; // Allow additional properties for different views
}

interface DragStateContextValue {
  // Current drag state
  dragNoteInfo: DragNoteInfo | null;
  dragSource: DragSource;

  // Set drag state (called on drag start)
  setDragState: (noteInfo: DragNoteInfo, source: DragSource) => void;

  // Clear drag state (called on drop or drag end)
  clearDragState: () => void;

  // Check if there's an active drag
  isDragging: boolean;
}

const DragStateContext = createContext<DragStateContextValue | null>(null);

export function useDragState() {
  const ctx = useContext(DragStateContext);
  if (!ctx) {
    throw new Error("useDragState must be used within DragStateProvider");
  }
  return ctx;
}

interface DragStateProviderProps {
  children: React.ReactNode;
}

export const DragStateProvider: React.FC<DragStateProviderProps> = ({
  children,
}) => {
  const [dragNoteInfo, setDragNoteInfo] = useState<DragNoteInfo | null>(null);
  const [dragSource, setDragSource] = useState<DragSource>(null);

  const setDragState = useCallback((noteInfo: DragNoteInfo, source: DragSource) => {
    console.log("Setting drag state ++ ", noteInfo, source);
    setDragNoteInfo(noteInfo);
    setDragSource(source);
  }, []);

  const clearDragState = useCallback(() => {
    console.log("Clearing drag state ++ ");
    setDragNoteInfo(null);
    setDragSource(null);
  }, []);

  const isDragging = dragNoteInfo !== null && dragSource !== null;

  useEffect(() => {
    const handlePageDragStart = (e: any) => {
      if (e.detail && e.detail.pageId) {
        setDragState({ noteId: e.detail.pageId }, "editor");
      }
    };

    window.addEventListener("page-drag-start", handlePageDragStart);
    return () => {
      window.removeEventListener("page-drag-start", handlePageDragStart);
    };
  }, [setDragState]);

  return (
    <DragStateContext.Provider
      value={{
        dragNoteInfo,
        dragSource,
        setDragState,
        clearDragState,
        isDragging,
      }}
    >
      {children}
    </DragStateContext.Provider>
  );
};
