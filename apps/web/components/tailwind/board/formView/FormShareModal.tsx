"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { toast } from "sonner";
import { Link as LinkIcon, UserRound, UserCircle2, Lock } from "lucide-react";
import ToggleSetting from "@/components/tailwind/settings/components/ToggleSetting";
import { postWithAuth } from "@/lib/api-helpers";
import GenericPopupModal from "@/components/tailwind/common/GenericPopupModal";
import { Block } from "@/types/block";

interface FormShareModalProps {
  readonly board: Block;
  readonly viewTypeId: string | null;
  readonly onClose: () => void;
  readonly triggerRef?: React.RefObject<HTMLElement>;
}

export default function FormShareModal({ board, viewTypeId, onClose, triggerRef }: FormShareModalProps) {
  const { currentView, getCurrentDataSourceProperties } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();
  const latestBoard = getBlock(board._id) || board;

  const currentViewWithSettings = useMemo(() => {
    const viewData = currentView[board._id];
    if (!viewData) return undefined;

    let view;
    if (viewData.id) {
      const currentViewId = viewData.id;
      view = latestBoard.value?.viewsTypes?.find((vt) => vt._id === currentViewId );
    } else if (viewData.type) {
      view = latestBoard.value?.viewsTypes?.find((vt) => vt.viewType === viewData.type);
    }
    return view;
  }, [currentView, board._id, latestBoard, getBlock]);

  const [isPublicForm, setIsPublicForm] = useState<"private" | "public" | "workspace-only">(
    currentViewWithSettings?.isPublicForm ?? "private",
  );
  const [anonymousResponses, setAnonymousResponses] = useState<boolean>(
    currentViewWithSettings?.formAnonymousResponses ?? false,
  );
  const [accessToSubmission, setAccessToSubmission] = useState<"no_access" | "can_view_own">(
    currentViewWithSettings?.formAccessToSubmission || "no_access",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [showPublicWarning, setShowPublicWarning] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node) &&
        !triggerRef?.current?.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, triggerRef]);

  if (!viewTypeId) {
    return null;
  }

  const boardProperties = useMemo(() => {
    if (getCurrentDataSourceProperties) {
      const props = getCurrentDataSourceProperties(board._id);
      if (props && Object.keys(props).length > 0) {
        return props;
      }
    }
    return {};
  }, [board._id, getCurrentDataSourceProperties]);

  const personPropertyNames = useMemo(() => {
    if (!boardProperties) return [];
    return Object.values(boardProperties)
      .filter((property: any) => property?.type?.toLowerCase?.() === "person")
      .map((property: any) => property?.name || "Person");
  }, [boardProperties]);

  const saveShareState = async (next: {
    isPublicForm?: "private" | "public" | "workspace-only";
    anonymousResponses?: boolean;
    accessToSubmission?: typeof accessToSubmission;
  }) => {
    try {
      setIsSaving(true);
      const nextState = {
        isPublicForm: next.isPublicForm ?? isPublicForm,
        anonymousResponses: next.anonymousResponses ?? anonymousResponses,
        accessToSubmission: next.accessToSubmission ?? accessToSubmission,
      };
      const res = await postWithAuth("/api/database/updateViewType", {
        blockId: board._id,
        viewTypeId,
        title: currentViewWithSettings?.title || "Form",
        icon: currentViewWithSettings?.icon || "📝",
        isPublicForm: nextState.isPublicForm,
        formAnonymousResponses: nextState.anonymousResponses,
        formAccessToSubmission: nextState.accessToSubmission,
      });

      if (!res.view) {
        toast.error("Failed to update form share settings");
        return;
      }

      const serverView = res.view.viewCollection?.viewsTypes || res.view.viewsTypes;

      if (serverView) {
        const updatedViewsTypes = (latestBoard.value?.viewsTypes || []).map((v) => {
          const vId = typeof v._id === "string" ? v._id : String(v._id);
          if (vId !== viewTypeId) return v;

          const matching = Array.isArray(serverView)
            ? serverView.find((sv: any) => {
              const svId = typeof sv._id === "string" ? sv._id : String(sv._id);
              return svId === vId;
            })
            : null;

          return {
            ...v,
            isPublicForm: matching?.isPublicForm ?? nextState.isPublicForm,
            formAnonymousResponses: matching?.formAnonymousResponses ?? nextState.anonymousResponses,
            formAccessToSubmission: matching?.formAccessToSubmission ?? nextState.accessToSubmission,
          };
        });

        updateBlock(board._id, {
          ...latestBoard,
          value: {
            ...latestBoard.value,
            viewsTypes: updatedViewsTypes,
          },
        });
      } else {
        // Fallback optimistic update
        const updatedViewsTypes = (latestBoard.value?.viewsTypes || []).map((v) => {
          const vId = typeof v._id === "string" ? v._id : String(v._id);
          if (vId !== viewTypeId) return v;
          return {
            ...v,
            isPublicForm: nextState.isPublicForm,
            formAnonymousResponses: nextState.anonymousResponses,
            formAccessToSubmission: nextState.accessToSubmission,
          };
        });
        updateBlock(board._id, {
          ...latestBoard,
          value: {
            ...latestBoard.value,
            viewsTypes: updatedViewsTypes,
          },
        });
      }
    } catch {
      // Error toast already handled in service
    } finally {
      setIsSaving(false);
    }
  };

  const getFormLink = () => {
    if (!viewTypeId || !board._id) return "";
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin;
    const path = (isPublicForm !== "private" && isPublicForm !== "workspace-only" )? `/form/public/${board._id}` : `/form/${board._id}`;
    return `${baseUrl}${path}?viewTypeId=${encodeURIComponent(viewTypeId)}`;
  };

  const handleCopyLink = async () => {
    try {
      setIsCopying(true);
      const formLink = getFormLink();
      await navigator.clipboard.writeText(formLink);
      toast.success("Form link copied");
    } catch {
      toast.error("Failed to copy link");
    } finally {
      setIsCopying(false);
    }
  };

  const whoCanFillOutLabel =
    isPublicForm === "public"
      ? "Anyone with the link"
      : isPublicForm === "workspace-only"
        ? "Anyone in workspace with link"
        : "No access";

  const accessToSubmissionLabel =
    accessToSubmission === "no_access" ? "No access" : "Respondents can view their submission";

  return (
    <div
      ref={modalRef}
      className="flex flex-col min-w-[400px] max-w-[400px] rounded-lg border bg-background dark:border-gray-700 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-2 space-y-1">
        {/* Who can fill out */}
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-1 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors"
        >
          <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
            <UserRound className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm">Who can fill out</div>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={isPublicForm}
              onChange={(e) => {
                const value = e.target.value as "private" | "public" | "workspace-only";

                // If switching TO public, show warning if needed
                if (value === "public" && isPublicForm !== "public") {
                  setShowPublicWarning(true);
                  return;
                }

                setIsPublicForm(value);
                void saveShareState({ isPublicForm: value });
              }}
              onClick={(e) => e.stopPropagation()}
              className=" p-1 bg-transparent border rounded-sm text-sm text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="private">No access</option>
              <option value="workspace-only">Anyone in workspace with link</option>
              <option value="public">Anyone with the link</option>
            </select>
          </div>
        </button>

        {/* Anonymous responses */}
        <div className="px-3 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
              <UserCircle2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <ToggleSetting
                label="Anonymous responses"
                description=""
                checked={anonymousResponses}
                onChange={(checked) => {
                  setAnonymousResponses(checked);
                  void saveShareState({ anonymousResponses: checked });
                }}
              />
            </div>
          </div>
        </div>

        {/* Access to submission */}
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-1 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors"
        >
          <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
            <Lock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm">Access to submission</div>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={accessToSubmission}
              onChange={(e) => {
                const value = e.target.value as typeof accessToSubmission;
                setAccessToSubmission(value);
                void saveShareState({ accessToSubmission: value });
              }}
              onClick={(e) => e.stopPropagation()}
              className=" p-1 bg-transparent border rounded-sm text-sm text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="no_access">No access</option>
              {/* <option value="can_view_own">can view</option> */}
            </select>
          </div>
        </button>
      </div>

      {/* Copy form link */}
      <div className="px-2 py-2 border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative h-8">
            <div className="flex items-center w-full h-full rounded-md border border-gray-300 dark:border-gray-600 bg-background px-2">
              <input
                disabled
                readOnly
                type="text"
                value={getFormLink()}
                className="w-full bg-transparent border-none outline-none text-sm text-gray-500 dark:text-gray-400"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <LinkIcon className="w-4 h-4" />
            {isCopying ? "Copying..." : "Copy link"}
          </button>
        </div>
      </div>

      <GenericPopupModal
        open={showPublicWarning}
        message={
          personPropertyNames.length > 0
            ? "These questions are not supported in public forms and will not be shown to respondents:"
            : "Public forms expose responses to anyone with the link."
        }
        listItems={personPropertyNames}
        confirmLabel="Got it"
        cancelLabel="Cancel"
        confirmVariant="primary"
        confirmClassName="bg-blue-600 text-white hover:bg-blue-700"
        onConfirm={() => {
          setShowPublicWarning(false);
          setIsPublicForm("public");
          void saveShareState({ isPublicForm: "public" });
        }}
        onCancel={() => {
          setShowPublicWarning(false);
          setIsPublicForm("workspace-only");
        }}
      />
    </div>
  );
}


