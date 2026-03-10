"use client";

import React, { useState, useEffect, useRef } from "react";
import type { CellEditorProps } from "@/types/cellEditor";
import { RelationPicker } from "../properties/inputs/RelationPicker";
import { getWithAuth } from "@/lib/api-helpers";
import { getRelationIdsFromValue } from "@/utils/relationUtils";
import { useBoard } from "@/contexts/boardContext";
import { toast } from "sonner";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";

export default function RelationDropdown({ value, property, onUpdate, onClose, note, boardId, position }: CellEditorProps) {
  const [relatedNotes, setRelatedNotes] = useState<Block[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<Block[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const { getNotesByDataSourceId, getDataSource, setDataSource, getRelationNoteTitle, getValidRelationIds } = useBoard();
  const { upsertBlocks } = useGlobalBlocks();

  // Get linkedDatabaseId from property
  const linkedDatabaseId = property.linkedDatabaseId;
  const relationLimitType = property.relationLimit || "multiple";
  const isSingleRelation = relationLimitType === "single";
  // Always parse as "multiple" to get array, then handle single/multiple in update logic
  const rawNoteIds = getRelationIdsFromValue(value, "multiple");
  const selectedNoteIds = getValidRelationIds(rawNoteIds, linkedDatabaseId ? String(linkedDatabaseId) : "");

  // Calculate picker position (below the cell)
  // Note: position.top is already rect.bottom + 2 from handleCellClick
  const pickerStyles = {
    top: Number(position.top), // Already positioned below cell
    left: Number(position.left),
    width: Math.max(350, Number(position.width)),
  };

  // Load notes when component mounts
  useEffect(() => {
    if (!linkedDatabaseId) return;

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
  }, [linkedDatabaseId, getNotesByDataSourceId, getDataSource, setDataSource, upsertBlocks]);

  // Filter notes based on search query
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

  // Handle toggling a note
  const handleToggleNote = (linkedNote: Block) => {
    const linkedNoteId = String(linkedNote._id);
    const isSelected = selectedNoteIds.includes(linkedNoteId);

    let newSelection: string[] | string;
    if (isSelected) {
      // Remove the note
      newSelection = selectedNoteIds.filter(id => id !== linkedNoteId);
    } else {
      // Add the note
      if (relationLimitType === "single") {
        // For single relation, replace the existing selection (store as string)
        newSelection = linkedNoteId;
      } else {
        // For multiple relations, add to existing selection
        newSelection = [...selectedNoteIds, linkedNoteId];
      }
    }

    // Use the note being edited (from props), not the linked note
    // Ensure note._id is a string
    const noteId = typeof note._id === "string" ? note._id : String(note._id);
    const propertyId = property.id;

    // Call onUpdate with the correct note ID and formatted value
    onUpdate(noteId, propertyId, newSelection);

    // Close picker for single relation after selection
    if (relationLimitType === "single") {
      onClose();
    }
  };

  // Handle removing a note
  const handleRemoveNote = (linkedNoteId: string) => {
    const newSelection = selectedNoteIds.filter((id) => id !== linkedNoteId);
    // Use the note being edited (from props), not the linked note
    // Ensure note._id is a string
    const noteId = typeof note._id === "string" ? note._id : String(note._id);
    const propertyId = property.id;
    onUpdate(noteId, propertyId, newSelection);
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

  const availableNotes = filteredNotes.filter(
    (note) => !selectedNoteIds.includes(String(note._id)),
  );

  // Handle escape key to close (click outside is handled by RelationPicker backdrop)
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  if (!linkedDatabaseId) {
    // Show error message if no linked database
    return (
      <div
        style={{
          position: "fixed",
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          zIndex: 1000,
          padding: "8px",
          background: "white",
          border: "1px solid #ccc",
          borderRadius: "4px",
        }}
      >
        No data source linked to this relation property
      </div>
    );
  }

  return (
    <RelationPicker
      isOpen={true}
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
      onClose={onClose}
      useFixedPosition={true}
    />
  );
}

