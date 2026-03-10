"use client";

import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import type { ViewCollection } from "@/types/board";
import { updateCollectionViewBlock } from "@/lib/collectionViewHelpers";
import { ArrowLeft, Calendar, Clock, LayoutGrid, List, X, BarChart3, Images } from "lucide-react";
import { useEffect, useRef } from "react";
import { postWithAuth } from "@/lib/api-helpers";
import { toast } from "sonner";
import { Block } from "@/types/block";
import { ViewLayoutSettings } from "./viewLayoutSettings";

interface LayoutSettingsModalProps {
  readonly board: Block;
  readonly onClose: () => void;
}

export default function LayoutSettingsModal({ board, onClose }: LayoutSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { currentView, setCurrentView } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();
  const collectionViewBlock = getBlock(board._id);
  const collectionViewData = collectionViewBlock?.blockType === "collection_view" ? (collectionViewBlock.value as ViewCollection) : null;
  const currentViewData = currentView[board._id];
  const boardView = currentViewData?.type || collectionViewData?.viewsTypes?.[0]?.viewType || "board";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isInsidePortal = target instanceof Element && target.closest('[data-radix-popper-content-wrapper]');

      if (modalRef.current && !modalRef.current.contains(target) && !isInsidePortal) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const allViews: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<any>;
  }> = [
      { id: "board", label: "Board", icon: LayoutGrid },
      { id: "list", label: "List", icon: List },
      { id: "calendar", label: "Calendar", icon: Calendar },
      { id: "timeline", label: "Timeline", icon: Clock },
      { id: "chart", label: "Chart", icon: BarChart3 },
      { id: "gallery", label: "Gallery", icon: Images },
    ];

  const handleViewClick = async (newViewType: string) => {
    if (newViewType !== "board" && newViewType !== "list" && newViewType !== "calendar" && newViewType !== "timeline" && newViewType !== "chart" && newViewType !== "gallery") {
      return;
    }

    // Don't update if already the same type
    if (boardView === newViewType) {
      onClose();
      return;
    }

    // Find current view by ID first, then by type
    let currentViewObj;
    if (currentViewData?.id) {
      currentViewObj = collectionViewData?.viewsTypes?.find((v) => v._id === currentViewData.id);
    } else if (currentViewData?.type) {
      currentViewObj = collectionViewData?.viewsTypes?.find((v) => v.viewType === currentViewData.type);
    } else {
      currentViewObj = collectionViewData?.viewsTypes?.[0];
    }

    if (!currentViewObj || !currentViewObj._id) {
      toast.error("Current view not found or missing ID");
      onClose();
      return;
    }

    // Optimistic update - change current view's type
    if (!collectionViewData) {
      toast.error("View database not found");
      return;
    }

    const updatedViewsType = collectionViewData.viewsTypes?.map((view) => {
      if (view._id === currentViewObj._id) {
        return { ...view, viewType: newViewType as "board" | "list" | "calendar" | "timeline" | "chart" };
      }
      return view;
    }) || [];

    const updatedValue: ViewCollection = {
      ...collectionViewData,
      viewsTypes: updatedViewsType,
    };

    setCurrentView(board._id, currentViewObj._id, newViewType);

    try {
      await updateCollectionViewBlock({
        blockId: board._id,
        updatedValue,
        apiCall: async () => {
          const res = await postWithAuth(`/api/database/updateViewType`, {
            blockId: board._id,
            viewTypeId: currentViewObj._id,
            title: currentViewObj.title || newViewType.charAt(0).toUpperCase() + newViewType.slice(1),
            icon: currentViewObj.icon || "",
            viewType: newViewType,
          });

          if (!res.view) {
            throw new Error(res?.message || "Failed to update view type");
          }
          return res;
        },
        globalBlocks: { getBlock, updateBlock },
        onError: () => {
          // Rollback on failure
          setCurrentView(board._id, currentViewObj.id, currentViewObj.viewType);
        },
      });


      toast.success("View type updated successfully");
    } catch (err) {
      console.error("Failed to update view type", err);
      toast.error("Failed to update view type");
      setCurrentView(board._id, currentViewObj.id, currentViewObj.viewType);
    }

    onClose();
  };


  return (
    <div
      ref={modalRef}
      className="flex flex-col w-[300px] rounded-lg border bg-background dark:border-gray-700 shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex-shrink-0"
        draggable={false}
        onDragStart={(e) => e.stopPropagation()}
      >
        <div className="flex items-center h-[42px]" style={{ padding: "14px 16px 6px" }}>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-75 flex-shrink-0"
            style={{
              height: "22px",
              width: "24px",
              padding: "0px",
              marginInline: "-2px 8px"
            }}
            type="button"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <span className="flex-1 font-semibold text-sm text-gray-900 dark:text-gray-100 truncate" style={{ fontWeight: 600, fontSize: "14px" }}>
            Layout
          </span>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-75 flex-shrink-0"
            style={{
              height: "20px",
              width: "20px",
              padding: "0px"
            }}
            type="button"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Grid of views */}
      <div className="p-2">
        <div className="grid grid-cols-3 gap-2">
          {allViews.map((view) => {
            const Icon = view.icon;
            const isSelected = boardView === view.id;

            return (
              <button
                key={view.id}
                type="button"
                onClick={() => handleViewClick(view.id)}
                className={`flex flex-col items-center justify-center p-3 rounded-lg transition-all select-none
                  ${isSelected
                    ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border border-gray-200 text-muted-foreground dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 "
                  }
                  cursor-pointer
                `}
                aria-label={`Change to ${view.label} view`}
              >
                <Icon className="w-5 h-5 mb-2" aria-hidden={true} />
                <span className="text-xs font-medium text-center">{view.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings section */}
      <ViewLayoutSettings board={board} />
    </div>
  );
}
