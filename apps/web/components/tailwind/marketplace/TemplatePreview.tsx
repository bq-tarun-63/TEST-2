"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Lock } from "lucide-react";
import {
  EditorContent,
  EditorRoot,
  ImageResizer,
  handleCommandNavigation,
  type JSONContent,
} from "novel";
import { defaultExtensions } from "@/components/tailwind/extensions";
import { reconstructDocumentFromBlocksArray } from "@/utils/blockParser";
import type { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import EditorLoading from "../editor/editorLoading";
import EditorHeader from "../editor/editorHeader";
import CoverImage from "../editor/CoverImage";
import CommentPanel from "../comment/commentPanel";
import { CommentProvider } from "@/contexts/commentContext";

interface TemplatePreviewProps {
  templateId: string;
}

export function TemplateReadOnlyViewer({ templateId }: TemplatePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialContent, setInitialContent] = useState<JSONContent | undefined>(undefined);
  const [allBlocks, setAllBlocks] = useState<Block[]>([]);
  const globalBlocks = useGlobalBlocks();
  const { currentWorkspace } = useWorkspaceContext();
  const editorRef = useRef<any>(null);
  const inputRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);

  // Constants to match the structure of the Advanced Editor
  const effectiveReadOnly = true;
  const showCommitHistory = false;
  const isHistoryMode = false;
  const editorKey = templateId;

  const extensions = useMemo(() => {
    return [...defaultExtensions];
  }, []);

  const lastFetchedId = useRef<string | null>(null);

  useEffect(() => {
    if (!templateId || lastFetchedId.current === templateId) return;

    lastFetchedId.current = templateId;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        // Fetch root block
        const parentRes = await fetch("/api/blocks/get-many", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockIds: [templateId] }),
        });
        if (!parentRes.ok) throw new Error("Failed to load template");
        const parentData: { blocks: Block[] } = await parentRes.json();
        const parentBlock = parentData.blocks?.[0];
        if (!parentBlock) throw new Error("Template not found");

        const childRes = await fetch(`/api/note/block/get-all-block/${templateId}`);
        if (!childRes.ok) throw new Error("Failed to load template content");
        const childData: { blocks: Block[]; blockIds: string[] } = await childRes.json();

        const fetchedBlocks = [parentBlock, ...(childData.blocks ?? [])];
        setAllBlocks(fetchedBlocks);

        const childBlocks = fetchedBlocks.filter(b => b._id !== templateId);
        if (childBlocks.length > 0) {
          globalBlocks.upsertBlocks(childBlocks);
        }

        const doc = reconstructDocumentFromBlocksArray(templateId, fetchedBlocks);
        setInitialContent(doc);
      } catch (err: any) {
        setError(err.message);
        lastFetchedId.current = null;
      } finally {
        setIsLoading(false);
      }
    })();
  }, [templateId]);

  if (isLoading || !initialContent) {
    return (
      <div className="relative w-full p-12 pt-0 h-full flex items-center justify-center">
        <EditorLoading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-500 dark:text-gray-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div
      className="relative w-full p-12 pt-0 sm:p-0 pointer-events-none"
      inert={true}
    >
      <div className={showCommitHistory ? "pr-[250px]" : ""}>

        {(() => {
          const pageBlock = allBlocks.find(b => b._id === editorKey);
          const blockIcon = pageBlock?.blockType === 'page'
            ? (pageBlock.value as any)?.icon || ""
            : "";
          const blockTitle = pageBlock?.blockType === 'page'
            ? (pageBlock.value as any)?.title || ""
            : "";
          const blockCoverUrl = pageBlock?.blockType === 'page'
            ? (pageBlock.value as any)?.coverURL || null
            : null;

          return (
            <>
              <CoverImage
                coverUrl={blockCoverUrl}
                onCoverChange={() => { }}
                onCoverRemove={() => { }}
                onUploadCover={async () => ""}
                workspaceId={currentWorkspace?._id}
                openPicker={false}
                onPickerClose={() => { }}
              />

              <div className="pl-20 px-20">
                <EditorHeader
                  editorKey={editorKey}
                  setEditing={setEditing}
                  editing={editing}
                  readOnly={effectiveReadOnly}
                  inputRef={inputRef}
                  showCommitHistory={showCommitHistory}
                  toast={{} as any}
                  coverUrl={blockCoverUrl}
                  onAddCover={() => { }}
                  titleIcon={blockIcon}
                />
              </div>
            </>
          );
        })()}

        <div className="flex-1 w-full pt-2 px-5 pl-20">
          {(() => {
            const pageBlock = allBlocks.find(b => b._id === editorKey);
            if (!pageBlock) return null;

            return (
              <CommentProvider
                initialComments={[]}
                noteId={editorKey}
                boardId={""}
                note={pageBlock}
              >
                <div className="flex w-full h-full relative">
                  <div className="flex-1 relative min-w-0">
                    <EditorRoot>
                      <EditorContent
                        key={`editor-${editorKey}`}
                        initialContent={initialContent}
                        extensions={extensions}
                        onCreate={({ editor }) => {
                          editorRef.current = editor;
                          editor.setEditable(false);
                        }}
                        className="flex w-full h-full bg-background dark:bg-background pl-12 p-4 min-h-[60vh]"
                        editorProps={{
                          handleDOMEvents: {
                            keydown: (_view, event) => handleCommandNavigation(event),
                          },
                          attributes: {
                            class: "prose prose-lg w-[100%] h-[100%] dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full",
                            "data-editor-key": editorKey,
                          },
                        }}
                        slotAfter={<ImageResizer />}
                      />
                    </EditorRoot>
                  </div>
                  {/* Desktop comment panel */}
                  <div className="w-12 min-[1320px]:w-[300px] min-[1440px]:w-[360px] min-[1320px]:pl-4 relative">
                    <CommentPanel />
                  </div>
                </div>
              </CommentProvider>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
