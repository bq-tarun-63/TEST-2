"use client";

import type { Block } from "@/types/block";
import type { PropertySchema } from "@/models/types/DatabaseSource";
import GalleryCard from "./galleryCard";
import GalleryGrid from "./galleryGrid";
import PlusIcon from "@/components/tailwind/ui/icons/plusIcon";
import { useState } from "react";

interface GalleryGroupProps {
    title: string;
    cards: Block[];
    board: Block;
    boardProperties: Record<string, PropertySchema>;
    visiblePropertyIds: string[];
    propertyOrder: string[];
    previewType: string;
    fitImage: boolean;
    onEditCard: (cardId: string, newTitle: string) => void;
    onDeleteCard: (cardId: string) => void;
    onOpenSidebar: (card: Block) => void;
    updateNoteTitleLocally: (noteId: string, newTitle: string) => void;
    onAddPage: () => void;
    bgColor?: string;
    textColor?: string;
    dotColor?: string;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
    // Drag and drop props
    draggedNoteId?: string | null;
    dragOverNoteId?: string | null;
    dragPosition?: "above" | "below" | null;
    onDragStart: (e: React.DragEvent, noteId: string) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent, noteId: string) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, noteId?: string | null, forcedGroupByValue?: any) => void;
    groupValue?: any; // The value to set when dropping into this group
}

export default function GalleryGroup({
    title,
    cards,
    board,
    boardProperties,
    visiblePropertyIds,
    propertyOrder,
    previewType,
    fitImage,
    onEditCard,
    onDeleteCard,
    onOpenSidebar,
    updateNoteTitleLocally,
    onAddPage,
    bgColor,
    textColor,
    dotColor,
    collapsed: externalCollapsed,
    onToggleCollapse,
    // Drag and drop
    draggedNoteId,
    dragOverNoteId,
    dragPosition,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    groupValue,
}: GalleryGroupProps) {
    const [internalCollapsed, setInternalCollapsed] = useState(false);
    const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
    const toggleCollapse = onToggleCollapse || (() => setInternalCollapsed(!internalCollapsed));

    return (
        <div className="flex flex-col mb-4">
            {/* Group Header - Sticky and Styled like List View */}
            <div
                className="sticky top-0 z-[5] flex items-center h-10 group bg-white dark:bg-[#191919] px-1"
            >
                <button
                    type="button"
                    onClick={toggleCollapse}
                    className="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-100 dark:hover:bg-gray-800 mr-1 transition-colors"
                >
                    <svg
                        viewBox="0 0 16 16"
                        className="w-3 h-3 text-muted-foreground transition-transform duration-200"
                        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                        fill="currentColor"
                    >
                        <path d="M2.835 3.25a.8.8 0 0 0-.69 1.203l5.164 8.854a.8.8 0 0 0 1.382 0l5.165-8.854a.8.8 0 0 0-.691-1.203z" />
                    </svg>
                </button>

                <div className="flex items-center gap-2">
                    <div
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium"
                        style={{
                            backgroundColor: bgColor || 'rgba(55, 53, 47, 0.08)',
                            color: textColor || 'inherit'
                        }}
                    >
                        {dotColor && (
                            <div
                                className="w-2 h-2 rounded-full mr-2 shrink-0"
                                style={{ backgroundColor: dotColor }}
                            />
                        )}
                        <span className="truncate max-w-[200px]">{title || "No Title"}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                        {cards.length}
                    </span>
                </div>

                <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        type="button"
                        onClick={onAddPage}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground hover:text-foreground transition-colors"
                        title="Add page to group"
                    >
                        <PlusIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Group Content */}
            {!isCollapsed && (
                <div className="pt-2 pb-4">
                    <GalleryGrid>
                        {cards.map((note) => {
                            const isDragging = draggedNoteId === note._id;
                            const isDropTarget = dragOverNoteId === note._id;

                            return (
                                <GalleryCard
                                    key={note._id}
                                    card={note}
                                    board={board}
                                    boardProperties={boardProperties}
                                    visiblePropertyIds={visiblePropertyIds}
                                    propertyOrder={propertyOrder}
                                    previewType={previewType}
                                    fitImage={fitImage}
                                    onEdit={(newTitle) => onEditCard(note._id, newTitle)}
                                    onDelete={() => onDeleteCard(note._id)}
                                    onOpenSidebar={onOpenSidebar}
                                    updateNoteTitleLocally={updateNoteTitleLocally}
                                    // Drag and drop
                                    draggable
                                    isDragging={isDragging}
                                    isDropTarget={isDropTarget}
                                    dragPosition={dragPosition}
                                    onDragStart={(e) => onDragStart(e, note._id)}
                                    onDragEnd={onDragEnd}
                                    onDragOver={(e) => onDragOver(e, note._id)}
                                    onDragLeave={onDragLeave}
                                    onDrop={(e) => onDrop(e, note._id, groupValue)}
                                />
                            );
                        })}

                        {/* Add New Page Button at the end of the grid */}
                        <div className="flex flex-col h-full rounded-lg border bg-background shadow-sm cursor-pointer overflow-hidden transition-colors hover:bg-accent/50">
                            <button
                                onClick={onAddPage}
                                className="flex items-center justify-center h-full w-full gap-1.5 text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
                            >
                                <PlusIcon className="w-4 h-4" />
                                <span className="text-sm font-medium">New page</span>
                            </button>
                        </div>
                    </GalleryGrid>
                </div>
            )}
        </div>
    );
}
