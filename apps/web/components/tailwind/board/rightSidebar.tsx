"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ChevronsRight, MessageSquareText, Slack } from "lucide-react";
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

interface RightSidebarProps {
  note: Block;
  board: Block;
  onClose: () => void;
  onUpdate: (updatedNote: Block) => void;
  initialContent: JSONContent | null;
  isClosing?: boolean;
  updateNoteTitleLocally?: (noteId: string, newTitle: string) => void;
  persistNoteTitleChange?: (noteId: string, newTitle: string) => Promise<void>
}

interface ApiBlocksResponse {
  blocks: Block[];
}

export default function RightSidebar({
  note,
  board,
  onClose,
  onUpdate,
  initialContent,
  isClosing = false,
  updateNoteTitleLocally,
  persistNoteTitleChange
}: RightSidebarProps) {
  const inputRef = useRef<HTMLParagraphElement>(null);
  const [editing, setEditing] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);

  const [content, setContent] = useState(initialContent);
  const [fetchedComments, setFetchedComments] = useState<Comment[]>([]);
  const [activeTab, setActiveTab] = useState<"comments" | "activity" | "slack-comments" | null>(null);
  const { activityLogs, isLogLoading } = useActivityLogs(note?._id || null);
  const { getCurrentDataSourceProperties, getNotesByDataSourceId, currentView, getDataSource } = useBoard();
  const { getBlock, updateBlock } = useGlobalBlocks();
  const [inlineComments, setInlineComments] = useState<Comment[]>([]);

  const noteId = note._id;

  const currentDataSourceProperties = getCurrentDataSourceProperties(board._id);

  // Compute derived properties (formulas and rollups) on-the-fly
  const computedNotes = useComputedNotes(
    [note],
    currentDataSourceProperties,
    board._id,
    getNotesByDataSourceId,
    getDataSource
  );

  const computedNote = computedNotes[0] || note;

  const { handleAddProperty,
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
        console.log("[RightSidebar] Fetched comments:", comments);
        setInlineComments(comments);
      }
    } catch (error) {
      console.error("[RightSidebar] Error fetching all comments:", error);
      toast.error("Error fetching comments");
    }
  };

  useEffect(() => {
    const note = getBlock(noteId);
    if (!note) {
      console.error("Block / note  not found !!")
    }
    if (note?.blockType === "page") {
      getAllCommentIds();
    }
    else {
      setFetchedComments([]);
    }

  }, [noteId]);

  // Keep the DOM content in sync when not actively editing to avoid caret jumps
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const isFocused = document.activeElement === el;
    const currentTitle = computedNote?.value.title || "";
    if (!isFocused && el.innerText !== currentTitle) {
      el.innerText = currentTitle;
    }
  }, [computedNote?.value.title, note?._id]);

  // Handlers for Cover Image
  const handleCoverChange = async (url: string) => {
    // Optimistic update
    updateBlock(computedNote._id, { value: { ...computedNote.value, coverURL: url } });

    try {
      await postWithAuth("/api/note/block/batch-update", {
        parentId: computedNote.parentId,
        workspaceId: board.workspaceId,
        blocks: [{ _id: computedNote._id, content: { ...computedNote.value, coverURL: url } }]
      });
    } catch (err) {
      toast.error("Failed to update cover");
      // Revert? (Not implementing full revert logic here for brevity, usually context handles it or next fetch fixes)
    }
  };

  const handleCoverRemove = () => handleCoverChange("");

  const handleUploadCover = async (file: File) => {
    return await uploadCoverImage(file, { noteId: computedNote._id });
  };

  const handleAddCover = () => setShowCoverPicker(true);

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 0); // slightly delay to ensure transition happens
    return () => clearTimeout(timer);
  }, []);

  if (!note) return null;

  return (
    <div
      className={`fixed top-0 right-0 h-full w-96 md:w-[600px] lg:w-[800px] bg-background dark:bg-background flex flex-col z-50 transition-transform duration-300 ease-in-out border-l dark:border-l-[rgb(42,42,42)] ${isClosing || !isOpen ? 'transform translate-x-full' : ''
        }`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Single Scrollable Container */}
      <div className="flex-1 overflow-y-auto relative no-scrollbar">
        {/* Close Button - Floatile */}
        <button
          className="absolute top-2 left-2 z-[60] p-1.5 rounded-md hover:bg-background dark:hover:bg-background backdrop-blur-sm transition-colors text-muted-foreground"
          onClick={onClose}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>

        {/* Cover Image */}
        <div className="[&>.relative]:!h-32 [&>.relative]:!max-h-32">
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

        {/* Header / Title Section */}
        <div className="px-5 pl-2">
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

        {/* Body Content */}
        <div className="p-10 pt-4 space-y-6 pb-20 bg-background dark:bg-background">
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
                <ActivityLogContainer logs={activityLogs}
                  isLogLoading={isLogLoading}
                />
              </div>
            )}

            {/* Editor and Comment Panel Area */}
            <CommentPanelProvider noteId={note._id}>
              <div className="flex w-full gap-4 items-start min-h-[300px]">
                <div className="flex-1 min-w-0">
                  {(!initialContent) ? (
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
  );
}