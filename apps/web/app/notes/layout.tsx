"use client";
import { Sidebar } from "@/components/tailwind/ui/Sidebar";
import Menu from "@/components/tailwind/ui/menu";
import { useNoteContext } from "@/contexts/NoteContext";
import { NotificationSocketListener } from "@/contexts/notification/notificationSocketListner";
import { CommentPanelProvider } from "@/contexts/inlineCommentContext";

import { ShareProvider, useShare } from "@/contexts/ShareContext";
import useAddRootPage from "@/hooks/use-addRootPage";
import { useAuth } from "@/hooks/use-auth";

import useFetchRootNodes from "@/hooks/use-fetchRootData";
import { useSyncQueue } from "@/hooks/use-syncQueue";
import { enqueueIfDirty, useUnsavedChangesCheck } from "@/hooks/use-unsaved-changes";
import { postWithAuth } from "@/lib/api-helpers";
import { defaultEditorContent } from "@/lib/content";
import { ObjectId } from "bson";
import { ChevronsRight, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type Node as CustomNode } from "@/types/note";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { createBlocks } from "@/services-frontend/block/blockServices";
import { Block } from "@/types/block";
import EditorLoading from "@/components/tailwind/editor/editorLoading";
import Breadcrumb from "@/components/tailwind/editor/Breadcrumb";
import { useNotifications } from "@/hooks/use-notifications";


// Define a type for the createNote response
// interface CreateNoteResponse {
//   child: {
//     id: string;
//     title: string;
//     icon?: string;
//     [key: string]: unknown;
//   };
//   parent: {
//     children: Array<{ _id: string; title: string; icon?: string }>;
//     [key: string]: unknown;
//   };
// }

function NotesLayoutContent({ children }: { children: ReactNode }) {
  const [allRootNode, setAllRootNode] = useState<CustomNode[]>([]);
  const [selectedEditor, setSelectedEditor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCreatingOverlay, setShowCreatingOverlay] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewId = searchParams.get("v");
  const { setShareNoteId } = useShare();
  // const { UpdateNote, DeleteNote } = useNoteActions();
  const { notes, setNotes, isContentSynced, isDirtyRef, previousNoteIdRef, isTitleDirtyRef, updateNote, setSelectedWorkspace } =
    useNoteContext();
  const { user } = useAuth();
  const { enqueue, dequeue } = useSyncQueue();
  const { addBlock, removeBlock, getBlock, updateBlock } = useGlobalBlocks();
  const { addPrivatePage, addPublicPage, addWorkAreaPage, removePrivatePage, removePublicPage } = useRootPagesOrder();
  const { currentWorkspace } = useWorkspaceContext();
  const { notifyPublicPage } = useNotifications();
  // Move isContentSyncedRef above its first use
  const isContentSyncedRef = useRef(isContentSynced);

  const unsavedChanges = useUnsavedChangesCheck({
    isContentSyncedRef,
    isDirtyRef,
    isTitleDirtyRef,
    updateNote,
    enqueue,
    dequeue,
    setShowCreatingOverlay,
  });

  useEffect(() => {
    const storedWorkspace = localStorage.getItem("selectedWorkspaceName");
    if (storedWorkspace) {
      setSelectedWorkspace(storedWorkspace);
    } else if (pathname !== "/organization/workspace") {
      // No workspace found, redirect to organization/workspace
      router.push("/organization/workspace");
    }
  }, [pathname, setSelectedWorkspace, router]);

  useEffect(() => {
    isContentSyncedRef.current = isContentSynced;
  }, [isContentSynced]);


  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current || isTitleDirtyRef.current) {
        e.preventDefault();
        // Chrome requires returnValue to be set
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Memoize the noteId extraction to prevent unnecessary recalculations
  const noteIdFromPath = useMemo(() => {
    if (!pathname) return null;
    const pathParts = pathname.split("/");
    const noteId = pathParts.pop();
    return noteId && noteId !== "notes" ? noteId : null;
  }, [pathname]);

  useEffect(() => {
    const internalViewId = searchParams.get("view");
    if (viewId) {
      if (internalViewId) {
        setSelectedEditor(`v:${internalViewId}:${viewId}`);
      } else {
        setSelectedEditor(viewId);
      }
    } else if (noteIdFromPath) {
      // Always set selected editor from URL path to ensure sidebar selection
      setSelectedEditor(noteIdFromPath);
    } else if (allRootNode.length > 0 && !noteIdFromPath && allRootNode[0]) {
      // Only redirect to first note if we're on the base /notes page
      setSelectedEditor(allRootNode[0].id);
    } else {
      setSelectedEditor(null);
    }
  }, [noteIdFromPath, allRootNode, viewId, searchParams]);

  const { isLoading: isLoadingRootNodes, hasInitialized: sidebarInitialized } = useFetchRootNodes();



  // useEffect(() => {
  //   if (rootNodes.length > 0 && !isLoadingRootNodes) {
  //     const optimisticIds = JSON.parse(localStorage.getItem("optimistic-note-ids") || "[]");

  //     const existingIds = new Set(rootNodes.map((n) => n.id));
  //     const hasOptimistic = optimisticIds.some((id: string) => !existingIds.has(id));

  //     if (!hasOptimistic) {
  //       setAllRootNode(rootNodes);
  //       setNotes(rootNodes);
  //     }
  //     setIsLoading(false);
  //   }
  // }, [rootNodes, isLoadingRootNodes, setNotes]);

  // Fix handleAddEditor parameter order and types
  const handleAddEditor = useCallback(
    async (
      title: string,
      parentId: string | null,
      isRestrictedPage: boolean,
      icon: string | null,
      isPublicNote: boolean,
      workAreaId: string | null = null,
    ) => {
      // Enqueue current editor's unsaved content/title if dirty
      enqueueIfDirty({
        currentEditorKey: noteIdFromPath,
        isContentSyncedRef,
        isDirtyRef,
        isTitleDirtyRef,
        enqueue,
      });

      try {
        if (parentId) {
          // Step 1: Optimistically create a new block
          const newPageId = new ObjectId().toString();

          if (!currentWorkspace?._id) {
            toast.error("Workspace not found");
            return;
          }

          // Get parent block to get its workareaId
          const parentBlock = getBlock(parentId);
          const parentWorkareaId = parentBlock?.workareaId || null;
          const isParentInWorkarea = parentBlock?.parentType === "workarea";

          // 2. Create Block Object
          const newBlock: Block = {
            _id: newPageId,
            blockType: "page",
            workspaceId: currentWorkspace?._id,
            // workareaId: workAreaId,
            workareaId: parentWorkareaId,
            parentId: parentId,
            parentType: "page",
            value: {
              title: title,
              userId: user?.email || "",
              userEmail: user?.email || "",
              icon: icon || "",
              coverURL: null,
              pageType: parentWorkareaId ? "workarea" : isPublicNote ? "public" : isRestrictedPage ? "restricted" : "private",
              isTemplate: false,
            },
            blockIds: [],
            status: "alive",
          };

          // Optimistic Updates
          addBlock(newBlock);

          // Optimistically Update Parent Block
          let originalParentIds: string[] = [];
          let lastContentId: string | null = null;
          if (parentBlock) {
            originalParentIds = parentBlock.blockIds || [];
            if (originalParentIds.length > 0) {
              lastContentId = originalParentIds[originalParentIds.length - 1] ?? null;
            } else {
              lastContentId = null;
            }
            updateBlock(parentId, { blockIds: [...originalParentIds, newPageId] });
          }

          // Call API
          try {
            await postWithAuth("/api/note/block/batch-create", {
              parentId: parentId,
              workspaceId: currentWorkspace._id,
              workareaId: parentWorkareaId,
              parentTable: "page",
              blocks: [
                {
                  _id: newPageId,
                  blockType: "page",
                  value: newBlock.value,
                  insertAfterBlockID: lastContentId
                }
              ]
            });

            // Navigate to the new note on success
            if (newPageId) {
              router.push(`/notes/${newPageId}`);
              setSelectedEditor(newPageId);
              isDirtyRef.current = false;
              isContentSyncedRef.current = false;
            }

          } catch (err) {
            console.error("Failed to create child page:", err);
            toast.error("Failed to create page");

            // Rollback Logic
            removeBlock(newPageId);
            if (parentBlock) {
              updateBlock(parentId, { blockIds: originalParentIds });
            }
          }

        } else {
          // 1. Generate ID
          const newPageId = new ObjectId().toString();

          if (!currentWorkspace?._id) {
            toast.error("Workspace not found");
            return;
          }
          // 2. Create Block Object
          const newBlock: Block = {
            _id: newPageId,
            blockType: "page",
            workspaceId: currentWorkspace?._id,
            workareaId: workAreaId,
            parentId: workAreaId ? workAreaId : currentWorkspace?._id,
            parentType: workAreaId ? "workarea" : "workspace",
            value: {
              title: title,
              userId: user?.email || "",
              userEmail: user?.email || "",
              icon: icon || "",
              coverURL: null,
              pageType: workAreaId ? "workarea" : isPublicNote ? isRestrictedPage ? "restricted" : "public" : "private",
              isTemplate: false,
            },
            blockIds: [],
            status: "alive",
          };

          // 3. Optimistic Updates
          addBlock(newBlock);

          if (isPublicNote) {
            addPublicPage(newPageId);
          } else if (newBlock.parentType === 'workarea' && workAreaId) {
            addWorkAreaPage(workAreaId, newPageId);
          } else {
            addPrivatePage(newPageId);
          }

          // 4. Call API directly to match requested structure
          try {
            await postWithAuth("/api/note/block/batch-create", {
              parentId: workAreaId ? workAreaId : currentWorkspace?._id,
              workspaceId: currentWorkspace._id,
              workareaId: workAreaId ? workAreaId : null,
              parentTable: workAreaId ? "workarea" : "workspace",
              blocks: [
                {
                  _id: newPageId,
                  blockType: "page",
                  value: newBlock.value,
                  insertAfterBlockID: null
                }
              ]
            });
          } catch (error) {
            console.error("Failed to create root page block:", error);
            toast.error("Failed to create page");
            // Consider rolling back optimistic updates here
            removeBlock(newPageId);
            if (isPublicNote) {
              removePublicPage(newPageId);
            } else {
              removePrivatePage(newPageId);
            }
          }

          // Handle Success/Navigation
          if (newPageId) {
            router.push(`/notes/${newPageId}`);
            setSelectedEditor(newPageId);
            isDirtyRef.current = false;
            isContentSyncedRef.current = false;
          }
          // notify public page to all workspace members
          if (newBlock.value.pageType === 'public') {
            notifyPublicPage(newBlock, currentWorkspace?.members || []);
          }
        }
      }
      catch (err) {
        console.error("Error creating note:", err);
      } finally {
        setShowCreatingOverlay(false);
      }
    },
    [
      // addRootPage,
      router,
      // addChildToCache,
      user,
      noteIdFromPath,
      enqueue,
      isContentSyncedRef,
      isDirtyRef,
      isTitleDirtyRef,
      addBlock,
      addPrivatePage,
      addPublicPage,
      currentWorkspace
    ],
  );

  const handleShare = useCallback(
    (noteId: string) => {
      setShareNoteId(noteId);
    },
    [setShareNoteId],
  );

  const handleSelectEditor = useCallback(
    async (id: string) => {
      const currentEditorKey = noteIdFromPath;
      previousNoteIdRef.current = currentEditorKey;
      const canProceed = await unsavedChanges.checkAndHandleUnsavedChanges(currentEditorKey);
      if (canProceed) {
        let blockIdToSelect: string = id;
        let internalViewId: string | null = null;

        if (id.startsWith("v:")) {
          const parts = id.split(":");
          internalViewId = parts[1] ?? null;
          blockIdToSelect = parts[2] ?? id;
        }

        const block = getBlock(blockIdToSelect);
        if (block?.blockType === "collection_view") {
          const parentId = block.parentId;
          let targetViewId = internalViewId;

          // If not specific view requested:
          if (!targetViewId) {
            // Check if we are already on this board (v param matches)
            const currentVParam = searchParams.get("v");
            const currentViewParam = searchParams.get("view");

            if (currentVParam === blockIdToSelect && currentViewParam) {
              // Preserve existing view
              targetViewId = currentViewParam;
            } else if (block.value?.viewsTypes?.length > 0) {
              // Default to first view
              targetViewId = block.value.viewsTypes[0]._id;
            }
          }

          router.push(`/notes/${parentId}?v=${blockIdToSelect}${targetViewId ? `&view=${targetViewId}` : ""}`);
        } else {
          setSelectedEditor(id);
          router.push(`/notes/${id}`);
        }
      }
    },
    [noteIdFromPath, previousNoteIdRef, unsavedChanges, setSelectedEditor, router, getBlock],
  );

  return (
    <div className="flex min-h-screen w-full">
      {/* Sidebar */}
      <Sidebar
        key={allRootNode.map((n) => n.id).join("-")} // force re-render on rootNode change
        onAddEditor={handleAddEditor}
        onSelectEditor={handleSelectEditor}
        selectedEditor={selectedEditor}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpen={() => setIsSidebarOpen(true)}
        onShare={handleShare}
        isLoadingSidebarData={isLoadingRootNodes}
      />

      {/* Fixed Header */}
      <div className={`fixed top-0 left-0 right-0 z-40 px-4 py-3 flex justify-between items-center gap-2 sm:gap-1 bg-background dark:bg-background ${isSidebarOpen ? "lg:left-[15rem]" : ""}`}>
        {/* Mobile Toggle */}
        <div className="flex items-center gap-2 min-w-0">
          {!isSidebarOpen && (
            <button
              type="button"
              className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg flex-shrink-0"
              onClick={() => setIsSidebarOpen(true)}
            >
              <ChevronsRight className="w-5 h-5 text-gray-800 dark:text-gray-200" />
            </button>
          )}
          {noteIdFromPath && <Breadcrumb pageId={noteIdFromPath} viewId={viewId} />}
        </div>

        <Menu />
      </div>

      {/* Main Content */}
      <main
        className={`relative flex flex-col flex-1 items-center gap-4 py-4 pt-16 overflow-x-hidden ${isSidebarOpen ? "lg:ml-[15rem]" : ""}`}
      >
        <CommentPanelProvider noteId={noteIdFromPath || undefined}>
          {/* Wait for sidebar to initialize before rendering editor to prevent race condition */}
          {!sidebarInitialized || isLoadingRootNodes ? (
            <EditorLoading />
          ) : (
            children
          )}
        </CommentPanelProvider>
      </main>

      {/* Loader overlay for deletion */}
      {showCreatingOverlay && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[9999]">
          <div className="flex items-center gap-2 text-white text-lg">
            <Loader2 className="w-6 h-6 animate-spin" />
            Saving page...
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotesLayout({ children }: { children: ReactNode }) {
  return <ShareProvider>
    <NotificationSocketListener />
    <NotesLayoutContent>{children}</NotesLayoutContent>
  </ShareProvider>
}
