"use client";

import { createPortal } from "react-dom";

import { useEffect, useRef, useState } from "react";
import { Activity, MessageSquareText, X, Slack} from "lucide-react";
import { PropertiesSection } from "./propertiesSection";
import EditorLoading from "../editor/editorLoading";
import SidebarEditor from "../sidebarEditor";
import { JSONContent } from "novel";
import { useDatabaseProperties } from "@/hooks/use-viewProperty";
import { useComputedNotes } from "@/hooks/use-computedNotes";
import CommentContainer from "@/components/tailwind/comment/commentContainer";
import ActivityLogContainer from "../activity/activityLogContainer";
import { useActivityLogs } from "@/hooks/useActivityLog";
import { useBoard } from "@/contexts/boardContext";
import { Block } from "@/types/block";
import { Comment } from "@/types/comment";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { getWithAuth, postWithAuth } from "@/lib/api-helpers";
import { toast } from "sonner";
import CoverImage from "../editor/CoverImage";
import EditorHeader from "../editor/editorHeader";
import { uploadCoverImage } from "../image-upload";
import { CommentProvider } from "@/contexts/commentContext";
import { CommentPanelProvider } from "@/contexts/inlineCommentContext";
import CommentPanel from "../comment/commentPanel";
import { fetchAllCommentsForNote } from "@/services-frontend/comment/commentService";

interface CenterPeekProps {
  note: Block;
  board: Block;
  onClose: () => void;
  onUpdate: (updatedNote: Block) => void;
  initialContent: JSONContent | null;
  isClosing?: boolean;
  updateNoteTitleLocally?: (noteId: string, newTitle: string) => void;
  persistNoteTitleChange?: (noteId: string, newTitle: string) => Promise<void>;
}

interface ApiBlocksResponse {
  blocks: Block[];
}

export default function CenterPeek({
  note,
  board,
  onClose,
  onUpdate,
  initialContent,
  isClosing = false,
  updateNoteTitleLocally,
  persistNoteTitleChange,
}: CenterPeekProps) {
  const inputRef = useRef<HTMLParagraphElement>(null);
  const [editing, setEditing] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);

  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState<"comments" | "activity" | "slack-comments" | null>(null);
  const { activityLogs, isLogLoading } = useActivityLogs(note?._id || null);
  const { getCurrentDataSourceProperties, getNotesByDataSourceId, currentView, getDataSource } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();
  const [inlineComments, setInlineComments] = useState<Comment[]>([]);

  const noteId = note._id;

  const currentDataSourceProperties = getCurrentDataSourceProperties(board._id);

  const computedNotes = useComputedNotes(
    [note],
    currentDataSourceProperties,
    board._id,
    getNotesByDataSourceId,
    getDataSource
  );

  const computedNote = computedNotes[0] || note;

  const {
    handleAddProperty,
    handleUpdateProperty,
    handleRenameProperty,
    handleDeleteProperty,
  } = useDatabaseProperties(board, computedNote, onUpdate);

  const handleTabClick = (tab: "comments" | "activity" | "slack-comments") => {
    setActiveTab(activeTab === tab ? null : tab);
  };

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent, note._id]);

  const getAllCommentIds = async () => {
    try {
      const response = await getWithAuth<ApiBlocksResponse>(`/api/note/block/get-all-block/${noteId}`);
      if (response && !("isError" in response)) {
        const childBlocks = response.blocks;
        const noteBlock = getBlock(noteId) || computedNote;
        const comments = await fetchAllCommentsForNote(noteBlock, childBlocks);
        setInlineComments(comments);
      }
    } catch (error) {
      toast.error("Error fetching comments");
    }
  };

  useEffect(() => {
    const note = getBlock(noteId);
    if (note?.blockType === "page") {
      getAllCommentIds();
    }
  }, [noteId]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const isFocused = document.activeElement === el;
    const currentTitle = computedNote?.value.title || "";
    if (!isFocused && el.innerText !== currentTitle) {
      el.innerText = currentTitle;
    }
  }, [computedNote?.value.title, note?._id]);

  const handleCoverChange = async (url: string) => {
    updateBlock(computedNote._id, { value: { ...computedNote.value, coverURL: url } });
    try {
      await postWithAuth("/api/note/block/batch-update", {
        parentId: computedNote.parentId,
        workspaceId: board.workspaceId,
        blocks: [{ _id: computedNote._id, content: { ...computedNote.value, coverURL: url } }],
      });
    } catch {
      toast.error("Failed to update cover");
    }
  };

  const handleCoverRemove = () => handleCoverChange("");

  const handleUploadCover = async (file: File) => {
    return await uploadCoverImage(file, { noteId: computedNote._id });
  };

  const handleAddCover = () => setShowCoverPicker(true);

  // Open/close animation state
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setIsOpen(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!note || !mounted) return null;

  const visible = isOpen && !isClosing;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] bg-black/50 dark:bg-black/75 transition-opacity duration-300 ease-in-out ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Center container */}
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none`}
      >
        <div
          className={`
            relative pointer-events-auto
            w-full max-w-[975px] mx-4
            h-[85vh]
            bg-background dark:bg-[#212121]
            rounded-xl shadow-2xl
            flex flex-col
            overflow-hidden
            transition-all duration-300 ease-in-out
            ${visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}
          `}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <div className="h-[40px] flex justify-between items-center px-[12px] pr-[10px]">
            <button
              className=" p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>


          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {/* Cover Image */}
            <div className="[&>.relative]:!h-40 [&>.relative]:!max-h-40">
              <CoverImage
                coverUrl={computedNote.value.coverURL || null}
                onCoverChange={handleCoverChange}
                onCoverRemove={handleCoverRemove}
                onUploadCover={handleUploadCover}
                workspaceId={board.workspaceId || ""}
                openPicker={showCoverPicker}
                onPickerClose={() => setShowCoverPicker(false)}
              />
            </div>

            {/* Header / Title */}
            <div className="px-12 pt-4">
              <EditorHeader
                editorKey={computedNote._id}
                setEditing={setEditing}
                editing={editing}
                readOnly={false}
                inputRef={inputRef}
                showCommitHistory={false}
                toast={toast}
                coverUrl={computedNote.value.coverURL}
                onAddCover={handleAddCover}
                titleIcon={computedNote.value.icon}
                iconClassName="h-16 text-[3rem]"
                titleClassName="text-3xl m-0"
                onTitleChange={(newTitle) => updateNoteTitleLocally?.(computedNote._id, newTitle)}
              />
            </div>

            {/* Body */}
            <div className="px-20 pt-4 pb-10 space-y-6 bg-background dark:bg-[#212121]">
              <PropertiesSection
                boardId={board._id}
                note={computedNote}
                boardProperties={getCurrentDataSourceProperties(board._id)}
                onUpdateProperty={handleUpdateProperty}
                onAddProperty={handleAddProperty}
                onRenameProperty={handleRenameProperty}
                onDeleteProperty={handleDeleteProperty}
              />

              <CommentProvider
                initialComments={inlineComments}
                noteId={note._id}
                boardId={board._id}
                note={note}
              >
                <div className="flex gap-4 !mt-0 px-2 mr-2 justify-end">
                  <button
                    onClick={() => handleTabClick("comments")}
                    className={`px-1.5 py-1 text-sm font-medium transition-colors ${activeTab === "comments"
                      ? "text-gray-900 dark:text-gray-100 border-b-2 border-blue-600"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-[#2c2c2c] rounded-sm"
                      }`}
                  >
                    <MessageSquareText className="inline-block mr-2 h-4 w-4" />
                    Comments
                  </button>
                  <button
                    onClick={() => handleTabClick("slack-comments")}
                    className={`px-1.5 py-1 text-sm font-medium transition-colors ${activeTab === "slack-comments"
                      ? "text-gray-900 dark:text-gray-100 border-b-2 border-blue-600"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-[#2c2c2c] rounded-sm"
                      }`}
                  >
                    <Slack className="inline-block mr-2 h-4 w-4" />
                    Comments
                  </button>
                  <button
                    onClick={() => handleTabClick("activity")}
                    className={`px-1.5 py-1 text-sm font-medium transition-colors ${activeTab === "activity"
                      ? "text-gray-900 dark:text-gray-100 border-b-2 border-blue-600"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-[#2c2c2c] rounded-sm"
                      }`}
                  >
                    <Activity className="inline-block mr-2 h-4 w-4" />
                    Activity
                  </button>
                </div>

                {activeTab === "comments" && (
                  <CommentContainer
                    key={note._id}
                    noteId={note._id}
                    note={note}
                  />
                )}

                {activeTab === "slack-comments" && (
                  <CommentContainer
                    key={note._id}
                    noteId={note._id}
                    note={note}
                    filterType="slack_sync"
                  />
                )}

                {activeTab === "activity" && (
                  <div className="max-h-96 !mt-4 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <ActivityLogContainer logs={activityLogs} isLogLoading={isLogLoading} />
                  </div>
                )}

                <CommentPanelProvider noteId={note._id}>
                  <div className="flex w-full gap-4 items-start">
                    <div className="flex-1 min-w-0">
                      {!initialContent ? (
                        <EditorLoading />
                      ) : (
                        <SidebarEditor
                          editorKey={note._id}
                          initialContent={initialContent}
                          onContentChange={setContent}
                        />
                      )}
                    </div>
                    <div className="w-[48px] flex-shrink-0 hidden xl:block">
                      <CommentPanel forceCompact={true} />
                    </div>
                  </div>
                </CommentPanelProvider>
              </CommentProvider>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
