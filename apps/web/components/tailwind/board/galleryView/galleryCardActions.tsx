"use client";

import { useRef, useEffect, useState } from "react";
import EditIcon from "@/components/tailwind/ui/icons/editIcon";
import EllipsisIcon from "@/components/tailwind/ui/icons/ellipsisIcon";
import TaskDropdownMenu from "../taskDropdownMenu";

interface GalleryCardActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  onEditProperties?: () => void;
  showOptions: boolean;
  setShowOptions: (show: boolean) => void;
}

export default function GalleryCardActions({
  onEdit,
  onDelete,
  onEditProperties,
  showOptions,
  setShowOptions,
}: GalleryCardActionsProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !triggerButtonRef.current?.contains(event.target as Node)
      ) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setShowOptions]);

  return (
    <div className="absolute right-2 top-2 z-10 flex bg-white dark:bg-[var(--c-whiButBac)] shadow-sm rounded border border-gray-200 dark:border-gray-700">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors pointer-events-auto border-r border-gray-200 dark:border-gray-700"
        aria-label="Edit title"
        type="button"
      >
        <EditIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>
      <button
        ref={triggerButtonRef}
        onClick={(e) => {
          e.stopPropagation();
          setShowOptions(!showOptions);
        }}
        className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors pointer-events-auto"
        aria-label="More options"
        type="button"
      >
        <EllipsisIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>
      {showOptions && (
        <div
          className="absolute right-0 top-full mt-1 z-50"
          ref={dropdownRef}
        >
          <TaskDropdownMenu
            onEditProperties={onEditProperties || onEdit}
            onDelete={onDelete}
            onClose={() => setShowOptions(false)}
          />
        </div>
      )}
    </div>
  );
}

