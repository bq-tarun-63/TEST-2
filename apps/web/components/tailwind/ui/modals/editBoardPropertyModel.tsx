"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { BoardProperty, ViewCollection } from "@/types/board";
import EditSinglePropertyModal from "../../board/editSinglePropertyModal";
import { DropdownMenu, DropdownMenuIcons } from "@/components/tailwind/ui/dropdown-menu";
import type { DropdownMenuItemProps } from "@/components/tailwind/ui/dropdown-menu";
import { Block } from "@/types/block";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";

interface EditPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  propertyType: string;
  board: Block;
  propertyId: string;
  property: BoardProperty;
  onDuplicate?: () => void;
}

export function EditPropertyModal({
  isOpen,
  onClose,
  onRename,
  onDelete,
  propertyType,
  board,
  propertyId,
  property,
  onDuplicate,
}: EditPropertyModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [showEditSingle, setShowEditSingle] = useState(false);

  const { currentView, getDataSource } = useBoard();
  const { getBlock } = useGlobalBlocks();

  const currentDataSourceId = useMemo(() => {
    const cv = currentView?.[board._id];
    const latestBoard = getBlock(board._id) || board;

    let v;
    if (cv?.id) {
      v = latestBoard.value.viewsTypes?.find((vt: any) => vt._id === cv.id);
    } else if (cv?.type) {
      v = latestBoard.value.viewsTypes?.find((vt: any) => vt.viewType === cv.type);
    }

    return v?.databaseSourceId || null;
  }, [currentView, getBlock, board]);

  const dataSource = currentDataSourceId ? getDataSource(currentDataSourceId) : null;
  const isSprintAndDefault = dataSource?.isSprint && property?.specialProperty === true;

  // Handle outside clicks
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Build menu items array
  const menuItems: DropdownMenuItemProps[] = useMemo(() => {
    const items: DropdownMenuItemProps[] = [
      {
        id: 'rename',
        label: "Rename",
        icon: <DropdownMenuIcons.Rename />,
        onClick: () => {
          onRename();
          onClose();
        },
      },
      {
        id: 'edit-property',
        label: "Edit property",
        icon: <DropdownMenuIcons.EditProperties />,
        onClick: () => {
          setShowEditSingle(true);
        },
      },
      {
        id: 'property-visibility',
        label: "Property visibility",
        icon: <DropdownMenuIcons.Eye />,
        onClick: () => {
          // could open another modal
        },
        hasChevron: true,
      },
      {
        id: 'duplicate-property',
        label: "Duplicate property",
        icon: <DropdownMenuIcons.Copy />,
        onClick: () => {
          onDuplicate?.();
          onClose();
        },
      },
      {
        id: 'delete-property',
        label: "Delete property",
        icon: <DropdownMenuIcons.Delete />,
        onClick: property?.specialProperty === true ? () => { } : () => { onDelete(); onClose(); },
        variant: 'destructive',
        disabled: property?.specialProperty === true,
      },
    ];
    return items;
  }, [onRename, onClose, onDuplicate, onDelete, setShowEditSingle, property]);

  if (!isOpen) return null;

  return (
    <div className="absolute z-50" style={{ overflow: 'visible' }}>
      <div
        ref={modalRef}
        className="absolute left-0 top-0 bg-white dark:bg-[#242424] rounded-lg shadow-xl z-50"
        style={{ overflow: 'visible' }}
      >
        {showEditSingle ? (
          <div className="relative" style={{ overflow: 'visible' }}>
            <EditSinglePropertyModal
              board={board}
              propertyId={propertyId}
              property={property}
              onClose={() => setShowEditSingle(false)}
              onBack={() => setShowEditSingle(false)}
            />
          </div>
        ) : (
          <div className="p-1 flex flex-col rounded-lg border border-gray-200 dark:border-[#343434] w-[260px]">
            <DropdownMenu items={menuItems} dividerAfter={[1]} />
          </div>
        )}
      </div>
    </div>
  );
}