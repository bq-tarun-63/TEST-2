"use client";

import { useState, useEffect, useRef } from "react";
import { getWithAuth } from "@/lib/api-helpers";
import { FileText, Minus, Plus } from "lucide-react";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import type { BoardProperty } from "@/types/board";
import { useBoard } from "@/contexts/boardContext";
import { toast } from "sonner";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { RelationPicker } from "./RelationPicker";

interface RelationPropertyInputProps {
  value: string[] | string | any;
  onChange: (value: string[] | string) => void;
  property: BoardProperty;
}

export function RelationPropertyInput({
  value,
  onChange,
  property,
}: RelationPropertyInputProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [relatedNotes, setRelatedNotes] = useState<Block[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<Block[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pickerStyles, setPickerStyles] = useState<{ top: number; left: number; width: number } | null>(null);

  const { getNotesByDataSourceId, getDataSource, setDataSource, getRelationNoteTitle, getValidRelationIds } = useBoard();
  const { upsertBlocks } = useGlobalBlocks();

  // Get linkedDatabaseId from property
  const linkedDatabaseId = property.linkedDatabaseId;

  const relationLimitType = property.relationLimit || "multiple";
  const isSingleRelation = relationLimitType === "single";
  const rawNoteIds = getRelationIdsFromValue(value, "multiple");
  const selectedNoteIds = getValidRelationIds(rawNoteIds, linkedDatabaseId ? String(linkedDatabaseId) : "");

  // Load notes from context or API
  const updatePickerPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPickerStyles({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  useEffect(() => {
    if (!isPickerOpen) return;

    updatePickerPosition();

    const handleResize = () => updatePickerPosition();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (!isPickerOpen || !linkedDatabaseId) return;

    const loadNotes = async () => {
      try {
        setLoading(true);

        // Normalize linkedDatabaseId to string
        const normalizedDataSourceId = typeof linkedDatabaseId === "string"
          ? linkedDatabaseId
          : String(linkedDatabaseId);

        // First, check if notes are already in context
        let notes = getNotesByDataSourceId(normalizedDataSourceId);

        // Check if datasource is already in context
        const existingDataSource = getDataSource(normalizedDataSourceId);

        if (notes.length === 0 || !existingDataSource) {
          // Notes or datasource not in context, fetch from API
          const response: any = await getWithAuth(
            `/api/database/getdataSource/${normalizedDataSourceId}`
          );

          if (response?.success && response.collection) {
            // Store data source in context if not already there
            if (response.collection.dataSource && !existingDataSource) {
              const ds = response.collection.dataSource;
              const dsId = ds._id ? (typeof ds._id === "string" ? ds._id : ds._id.toString()) : normalizedDataSourceId;
              setDataSource(dsId, ds);
            }

            // Store blocks in global block context
            const fetchedBlocks = response.collection.blocks || [];
            if (fetchedBlocks.length > 0) {
              upsertBlocks(fetchedBlocks);
              notes = fetchedBlocks;
            }
          } else {
            toast.error("Failed to fetch notes from linked data source");
          }
        }

        setRelatedNotes(notes);
        setFilteredNotes(notes);
      } catch (error) {
        console.error("Failed to fetch related notes:", error);
        toast.error("Failed to load notes");
      } finally {
        setLoading(false);
      }
    };

    loadNotes();
  }, [isPickerOpen, linkedDatabaseId, getNotesByDataSourceId, getDataSource, setDataSource, upsertBlocks]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredNotes(relatedNotes);
      return;
    }

    const filtered = relatedNotes.filter((note) =>
      note.value.title?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredNotes(filtered);
  }, [searchQuery, relatedNotes]);

  useEffect(() => {
    if (!isPickerOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const pickerEl = pickerRef.current;
      const containerEl = containerRef.current;
      if (!pickerEl || !containerEl) return;

      if (!pickerEl.contains(target) && !containerEl.contains(target)) {
        setIsPickerOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (isPickerOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isPickerOpen]);

  const handleToggleNote = (note: Block) => {
    const noteId = String(note._id);
    const isSelected = selectedNoteIds.includes(noteId);

    let newSelection: string[] | string;
    if (isSelected) {
      // Remove the note
      newSelection = selectedNoteIds.filter(id => id !== noteId);
    } else {
      // Add the note
      if (relationLimitType === "single") {
        // For single relation, replace the existing selection (store as string)
        newSelection = noteId;
      } else {
        // For multiple relations, add to existing selection
        newSelection = [...selectedNoteIds, noteId];
      }
    }

    onChange(newSelection);
  };

  const handleRemoveNote = (noteId: string) => {
    const newSelection = selectedNoteIds.filter((id) => id !== noteId);
    onChange(newSelection);
  };

  // Get selected note objects with full data from context
  const normalizedLinkedDatabaseId = linkedDatabaseId
    ? (typeof linkedDatabaseId === "string" ? linkedDatabaseId : String(linkedDatabaseId))
    : "";

  const selectedNoteInfos = selectedNoteIds.map((noteId) => {
    const note =
      relatedNotes.find((n) => String(n._id) === noteId) ||
      filteredNotes.find((n) => String(n._id) === noteId);

    return {
      noteId,
      title: getRelationNoteTitle(noteId, normalizedLinkedDatabaseId, note?.value.title || "New page"),
      icon: (note as any)?.icon as string | undefined,
      description: note?.value.description,
    };
  });
  const displayedNoteInfos = isSingleRelation ? selectedNoteInfos.slice(0, 1) : selectedNoteInfos;
  const availableNotes = filteredNotes.filter(
    (note) => !selectedNoteIds.includes(String(note._id)),
  );
  const linkedDataSourceTitle = normalizedLinkedDatabaseId
    ? (getDataSource(normalizedLinkedDatabaseId)?.title || property.name || "Linked data source")
    : property.name || "Linked data source";

  if (!linkedDatabaseId) {
    return (
      <div className="text-sm text-gray-400">
        No data source linked
        {selectedNoteIds.length === 0 && (
          <div className="pointer-events-none absolute right-2 top-1 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
              className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded bg-white shadow hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
              aria-label="Add page"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  const openPicker = () => {
    updatePickerPosition();
    setIsPickerOpen(true);
  };

  return (
    <>
      <div ref={containerRef} className="relative w-full">
        <div
          role="button"
          tabIndex={0}
          className="group flex flex-col gap-1 rounded-md text-sm text-gray-900 dark:text-gray-100 w-[250px]"
          onClick={() => openPicker()}
        >
          {selectedNoteIds.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-1 text-gray-500">
              <span className="text-sm">{isSingleRelation ? "Add page" : "Add pages"}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {displayedNoteInfos.map((note) => (
                <div
                  key={note.noteId}
                  className="group/item relative flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-800"
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
                  <div className="ml-auto flex items-center gap-1 opacity-0 transition p-0.5 rounded-sm bg-white group-hover/item:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveNote(note.noteId);
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                      aria-label="Remove page"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPicker();
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                      aria-label="Add page"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RelationPicker
        isOpen={isPickerOpen}
        pickerStyles={pickerStyles}
        pickerRef={pickerRef}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedNoteInfos={selectedNoteInfos}
        availableNotes={availableNotes}
        loading={loading}
        isSingleRelation={isSingleRelation}
        property={property}
        onToggleNote={handleToggleNote}
        onRemoveNote={handleRemoveNote}
        onClose={() => setIsPickerOpen(false)}
      />
    </>
  );
}
