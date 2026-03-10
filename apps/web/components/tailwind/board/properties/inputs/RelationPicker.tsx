"use client";

import { createPortal } from "react-dom";
import { Search, FileText, Minus } from "lucide-react";
import type { BoardProperty } from "@/types/board";
import { Block } from "@/types/block";

interface RelationPickerProps {
  isOpen: boolean;
  pickerStyles: { top: number; left: number; width: number } | null;
  pickerRef: React.RefObject<HTMLDivElement>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedNoteInfos: Array<{
    noteId: string;
    title: string;
    icon?: string;
    description?: string;
  }>;
  availableNotes: Block[];
  loading: boolean;
  isSingleRelation: boolean;
  property: BoardProperty;
  onToggleNote: (note: Block) => void;
  onRemoveNote: (noteId: string) => void;
  onClose: () => void;
  useFixedPosition?: boolean; // If true, use fixed positioning (for cell editor), else absolute (for sidebar)
}

export function RelationPicker({
  isOpen,
  pickerStyles,
  pickerRef,
  searchQuery,
  onSearchChange,
  selectedNoteInfos,
  availableNotes,
  loading,
  isSingleRelation,
  property,
  onToggleNote,
  onRemoveNote,
  onClose,
  useFixedPosition = false, // Default to absolute for sidebar compatibility
}: RelationPickerProps) {
  if (!isOpen || !pickerStyles) {
    return null;
  }

  // For absolute positioning (sidebar), use scroll offsets
  // For fixed positioning (cell editor), use viewport coordinates directly
  const positionClass = useFixedPosition ? "fixed" : "absolute";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[190]" onClick={onClose} />
      <div
        ref={pickerRef}
        className={`${positionClass} z-[200] flex min-w-[350px] flex-col rounded-[10px] border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#202020]`}
        style={{
          top: `${pickerStyles.top}px`,
          left: `${pickerStyles.left}px`,
          width: `${pickerStyles.width}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2 border-b bg-gray-100 border-gray-100 px-3 py-1 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search Page..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full rounded-md border border-transparent bg-gray-100/70 py-1 pl-8 pr-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:bg-[#2a2a2a] dark:text-gray-100"
              />
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <span>In</span>
              <span className="font-semibold truncate max-w-[160px]">
                {property.name || "Linked data source"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {selectedNoteInfos.length > 0 && (
            <div className="p-1">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <span>{selectedNoteInfos.length} selected</span>
              </div>
              <div className="mt-1 space-y-1">
                {selectedNoteInfos.map((note) => (
                  <div
                    key={`selected-${note.noteId}`}
                    className="group/item flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-5 w-5 items-center justify-center">
                        {note.icon ? (
                          <span className="h-4 w-4 text-base leading-none">{note.icon}</span>
                        ) : (
                          <FileText className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <span className="truncate text-sm">{note.title}</span>
                    </div>
                    <div className="ml-auto opacity-0 transition group-hover/item:opacity-100 rounded-sm bg-white">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveNote(note.noteId);
                        }}
                        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(loading || availableNotes.length > 0) && (
            <div className="mt-3 rounded-md bg-transparent">
              <div className="flex items-center px-1 pb-1 text-xs text-gray-500 dark:text-gray-400">
                <span>Select more</span>
              </div>
              {loading ? (
                <div className="py-6 text-center text-sm text-gray-500">Loading pages…</div>
              ) : (
                <div className="space-y-1">
                  {availableNotes.map((note) => (
                    <div
                      key={note._id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 transition hover:bg-gray-100 dark:hover:bg-gray-700/50"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleNote(note);
                        if (isSingleRelation) {
                          onClose();
                        }
                      }}
                    >
                      <div className="flex h-5 w-5 items-center justify-center">
                        {(note as any)?.icon ? (
                          <span className="h-4 w-4 text-base leading-none">{(note as any)?.icon}</span>
                        ) : (
                          <FileText className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{note.value.title || "New page"}</div>
                        {note.value.description && (
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {note.value.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

