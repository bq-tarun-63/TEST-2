"use client";
import { NoAccessMessage } from "@/components/ui/no-access";
import { useShare } from "@/contexts/ShareContext";
import { useAuth } from "@/hooks/use-auth";
import { useNotes } from "@/hooks/use-notes";
import { checkUserWriteAccess, isOwner } from "@/services-frontend/user/userServices";
import { approveNote, inviteToNote, publishNote } from "@/services-frontend/note/notesService";
// Declare the global variable for TypeScript
declare global {
  interface Window {
    __aiPromptContent?: string;
  }
}
// import { useSyncQueue } from "@/hooks/use-syncQueue";
import useNoteActions from "@/hooks/use-updateNode";
import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor";
import { getWithAuth, postWithAuth } from "@/lib/api-helpers";
import type { publishResponse } from "@/lib/api-helpers";
import type { publishState } from "@/lib/api-helpers";
import { defaultEditorContent } from "@/lib/content";
import { useQueryClient } from "@tanstack/react-query";
import { Clock1, FileText, Loader2, Lock, Paperclip, Trash2, X } from "lucide-react";
import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorCommandGroup,
  EditorContent,
  EditorRoot,
  ImageResizer,
  type JSONContent,
  handleCommandNavigation,
  handleImageDrop,
  handleImagePaste,
} from "novel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { ErrorPage } from "./ErrorPage";
import { NotFoundPage } from "./NotFoundPage";
import { defaultExtensions, createBlockTrackerExtension, getOrderedBlocks } from "./extensions";
import { uploadFn, uploadCoverImage } from "./image-upload";
import { getSlashCommand, getSuggestionItems } from "./slash-command";
import { createMentionExtension } from "./mention-command";

import { useNoteContext } from "@/contexts/NoteContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { reconstructDocumentFromBlocks } from "@/utils/blockParser";
import type { Block } from "@/types/block";
import { useRouter } from "next/navigation";
import GenerativeMenuSwitch from "./generative/generative-menu-switch";
import { ColorSelector } from "./selectors/color-selector";
import { LinkSelector } from "./selectors/link-selector";
import { MathSelector } from "./selectors/math-selector";
import { NodeSelector } from "./selectors/node-selector";
import { TableToolbar } from "./selectors/table-toolbar";
import { TextButtons } from "./selectors/text-buttons";
import { CommentSelector } from "./selectors/comment-selector";

import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

// At the top of your component file
import type { AdvancedEditorProps, ApiError, Invite, NoteResponse, PendingTitle } from "@/types/advance-editor";
import type { ApiErrorResponse } from "@/lib/api-helpers";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";
import { AISelector } from "./generative/ai-selector";
import { Separator } from "./ui/separator";
import DeleteConfirmationModal from "./ui/deleteConfirmationModal";
import ShareModal from "./ui/shareModel";
import { HistorySlider } from "./ui/CommitSlider";
import { historyManager } from "@/services-frontend/commitHistory/commitHistory";
import HistoryEditor from "./HistoryEditor";
import { useNotifications } from "@/hooks/use-notifications";
import { isEditorContentEmpty, isPublishResponse } from "@/services-frontend/editor/editorService";
import EditorHeader from "./editor/editorHeader";
import EditorLoading from "./editor/editorLoading";
import CoverImage, { coverImages } from "./editor/CoverImage";
import CopyLinkButton from "./editor/buttons/copyLink";
import DeleteButton from "./editor/buttons/deleteButton";
import CommentPanel from "./comment/commentPanel";
import CommentBox from "./comment/commentBox";
import { extractCommentIds } from "@/services-frontend/note/inlineCommentService"
import { useCommentPanel } from "@/contexts/inlineCommentContext";
import { CommentProvider } from "@/contexts/commentContext";
import { Comment } from "@/types/comment";
import { fetchAllCommentsForNote } from "@/services-frontend/comment/commentService";
import { useActivityLogs } from "@/hooks/useActivityLog";
import ActivityLogContainer from "@/components/tailwind/activity/activityLogContainer";
import { version } from "os";
import { EmbedModalWrapper } from "./ui/embed-modal-wrapper";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { useBoard } from "@/contexts/boardContext";
import { useDragState } from "@/contexts/dragStateContext";
import { eventBus } from "@/services-frontend/comment/eventBus";


const hljs = require("highlight.js");


const TailwindAdvancedEditor = ({ editorKey, shareNoteId, onShareComplete, isPreview }: AdvancedEditorProps) => {
  const globalBlocks = useGlobalBlocks();

  // Adapter: Create the old API using the new global blocks context
  const setOrderFromArray = useCallback((arr: string[]) => {
    globalBlocks.updateBlockOrder(editorKey, arr);
  }, [globalBlocks, editorKey]);

  const insertAfter = useCallback((newId: string, previousId: string | null) => {
    const currentOrder = globalBlocks.getBlockOrder(editorKey);
    const copy = [...currentOrder];
    if (copy.includes(newId)) return; // already present

    if (!previousId) {
      copy.unshift(newId);
    } else {
      const idx = copy.indexOf(previousId);
      if (idx === -1) {
        copy.push(newId);
      } else {
        copy.splice(idx + 1, 0, newId);
      }
    }
    globalBlocks.updateBlockOrder(editorKey, copy);
  }, [globalBlocks, editorKey]);

  const removeId = useCallback((id: string) => {
    const currentOrder = globalBlocks.getBlockOrder(editorKey);
    globalBlocks.updateBlockOrder(editorKey, currentOrder.filter(x => x !== id));
  }, [globalBlocks, editorKey]);

  const moveToOrder = useCallback((newOrder: string[]) => {
    globalBlocks.updateBlockOrder(editorKey, newOrder);
  }, [globalBlocks, editorKey]);

  const replaceId = useCallback((oldId: string, newId: string) => {
    const currentOrder = globalBlocks.getBlockOrder(editorKey);
    globalBlocks.updateBlockOrder(editorKey, currentOrder.map(x => (x === oldId ? newId : x)));
  }, [globalBlocks, editorKey]);
  const [initialContent, setInitialContent] = useState<JSONContent | undefined>(undefined);
  // const [saveStatus, setSaveStatus] = useState<"Saving..." | "Saved" | "Save Failed" | "Saved Online" | "Unsaved">(
  //   "Saved",
  // );

  const [openNode, setOpenNode] = useState<boolean>(false);
  const [openColor, setOpenColor] = useState<boolean>(false);
  const [openLink, setOpenLink] = useState<boolean>(false);
  const [openAI, setOpenAI] = useState<boolean>(false);
  const [openComment, setOpenComment] = useState<boolean>(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [accessError, setAccessError] = useState<ApiError | null>(null);
  const [notFoundError, setNotFoundError] = useState<{
    noteId: string;
    message: string;
  } | null>(null);
  const [genericError, setGenericError] = useState<{
    status: number;
    message: string;
    noteId?: string;
  } | null>(null);

  // Track handled errors to prevent infinite loops
  const handledErrorRef = useRef<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>("");
  const [newPermission, setNewPermission] = useState<"viewer" | "editor">("viewer");
  const [invites, setInvites] = useState<Invite[]>([{ email: "", permission: "viewer" }]);
  const [generalAccess, setGeneralAccess] = useState<string>("restricted");
  const [copied, setCopied] = useState<boolean>(false);
  const [readOnly, setReadOnly] = useState<boolean>(false);
  const effectiveReadOnly = !!(readOnly || isPreview);

  const { setShareNoteId, removeSharedPage } = useShare();
  const [publishLoading, setPublishLoading] = useState<boolean>(false);
  const [approvalLoading, setApprovalLoading] = useState<boolean>(false);
  const [approvalDirection, setApprovalDirection] = useState<"approve" | "reject" | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string>("");
  const [githubRawUrl, setGithubRawUrl] = useState<string>("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<publishState>();
  const [isPublish, setIsPublish] = useState<boolean>();
  const [noteOwnerMail, setNoteOwnerMail] = useState<string>("");
  const [noteOwnerUserId, setNoteOwnerUserId] = useState<string>("");
  // const [editorTitle, setEditorTitle] = useState<string>("Untitled");
  const [titleIcon, setTitleIcon] = useState<string>("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [isEditorDragOver, setIsEditorDragOver] = useState<boolean>(false);

  const prevContentRef = useRef<any>(null);
  const prevEditorKey = useRef(editorKey);
  const [isPublicNote, setIsPublicNote] = useState<boolean>(false);
  const [noteType, setNoteType] = useState<string>("original");
  const { UpdateNote, DeleteNote } = useNoteActions();
  const [rootNodes, setRootNodes] = useState<Node[]>([]);

  // Auth hook
  const { user } = useAuth();

  // React Query hooks
  const queryClient = useQueryClient();
  const { getNote, updateNote: updateNoteWithQuery } = useNotes();

  // Use React Query to fetch note data
  const {
    data: noteQueryData,
    isError: isNoteError,
    error: noteError,
    isLoading: isNoteLoading,
    refetch: refetchNote,
  } = getNote(
    editorKey,
    true, // includeContent
    "", // commitSha
    "", // commitPath
  );


  // Cover handlers
  const [showCoverPicker, setShowCoverPicker] = useState(false);

  const handleAddCover = async () => {
    if (effectiveReadOnly) {
      toast.error("You don't have permission to edit this page.");
      return;
    }

    // Add a random cover (similar to old behavior where API would return a cover)
    if (coverImages && coverImages.length > 0) {
      // Pick a random cover
      const randomIndex = Math.floor(Math.random() * coverImages.length);
      const randomCover = coverImages[randomIndex];

      if (randomCover && randomCover.url) {
        // Use handleCoverChange to add the cover (which will update via block API)
        await handleCoverChange(randomCover.url);
      } else {
        // If no valid cover, open the picker instead
        setShowCoverPicker(true);
      }
    } else {
      // If no covers available, open the picker instead
      setShowCoverPicker(true);
    }
  };

  const handleCoverChange = async (newCover: string) => {
    if (effectiveReadOnly) {
      toast.error("You don't have permission to edit this page.");
      return;
    }

    // Get page block from context
    const pageBlock = globalBlocks.getBlock(editorKey);
    if (!pageBlock) {
      console.error("Page block not found:", editorKey);
      toast.error("Page block not found");
      return;
    }

    // Save the current cover URL for rollback in case of API failure
    const prevCoverUrl = (pageBlock.value as any)?.coverURL || null;
    const originalValue = pageBlock.value;

    // Ensure coverURL exists in value (for existing blocks that might not have it)
    const currentValue = pageBlock.value as any;
    if (!('coverURL' in currentValue)) {
      currentValue.coverURL = null;
    }

    // Optimistic update in block context
    const updatedValue = {
      ...currentValue,
      coverURL: newCover || null,
    };
    globalBlocks.updateBlock(editorKey, { value: updatedValue });

    // Persist to database using block API
    try {
      const res = await postWithAuth(`/api/cover/update`, {
        id: editorKey,
        coverUrl: newCover,
      });

      if (res && typeof res === "object" && "isError" in res) {
        const errorResponse = res as ApiErrorResponse;
        toast.error(errorResponse.message || "Failed to update cover");
        // Rollback optimistic update
        globalBlocks.updateBlock(editorKey, { value: originalValue });
        return;
      }

      const coverResponse = res as { url?: string };

      if (coverResponse.url !== undefined) {
        toast.success("Cover updated successfully!");
      } else {
        toast.error("Failed to update cover");
        // Rollback optimistic update
        globalBlocks.updateBlock(editorKey, { value: originalValue });
      }
    } catch (error) {
      console.error("Error updating cover:", error);
      toast.error("Failed to update cover");
      // Rollback optimistic update
      globalBlocks.updateBlock(editorKey, { value: originalValue });
    }
  };

  const handleCoverRemove = async () => {
    if (effectiveReadOnly) {
      toast.error("You don't have permission to edit this page.");
      return;
    }

    // Get page block from context
    const pageBlock = globalBlocks.getBlock(editorKey);
    if (!pageBlock) {
      console.error("Page block not found:", editorKey);
      toast.error("Page block not found");
      return;
    }

    // Save the current cover URL for rollback in case of API failure
    const originalValue = pageBlock.value;

    // Ensure coverURL exists in value (for existing blocks that might not have it)
    const currentValue = pageBlock.value as any;
    if (!('coverURL' in currentValue)) {
      currentValue.coverURL = null;
    }

    // Optimistic update in block context
    const updatedValue = {
      ...currentValue,
      coverURL: null,
    };
    globalBlocks.updateBlock(editorKey, { value: updatedValue });

    // Persist to database using block API
    try {
      const res = await postWithAuth(`/api/cover/update`, {
        id: editorKey,
        coverUrl: "",
      });

      if (res && typeof res === "object" && "isError" in res) {
        const errorResponse = res as ApiErrorResponse;
        toast.error(errorResponse.message || "Failed to remove cover");
        // Rollback optimistic update
        globalBlocks.updateBlock(editorKey, { value: originalValue });
        return;
      }

      toast.success("Cover removed successfully!");
    } catch (error) {
      console.error("Error removing cover:", error);
      toast.error("Failed to remove cover");
      // Rollback optimistic update
      globalBlocks.updateBlock(editorKey, { value: originalValue });
    }
  };

  const handleUploadCover = async (file: File): Promise<string> => {
    const url = await uploadCoverImage(file, { noteId: editorKey, parentId: parentId || undefined });
    return url;
  };

  const {
    notes,
    updateNote,
    activeTitle,
    activeEmoji,
    selectedNoteId,
    setIsContentSynced,
    isDirtyRef,
    setNotes,
    // updateNodeInCache,
    isTitleDirtyRef,
    setSocketConnected,
    editorTitle,
    setEditorTitle,
    isPremiumUser,
    // childrenNotes,
    // setChildrenNotes,
    setDocumentTitle,
    setSharedWith,
    setIsCurrentNoitePublic,
  } = useNoteContext();
  const { clearDragState, dragSource } = useDragState();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLDivElement | null>(null);

  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removingNoteId, setRemovingNoteId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [isRestrictedPage, setIsRestrictedPage] = useState<boolean | undefined>(undefined);
  const [isLeader, setIsLeader] = useState(false);
  const isLeaderRef = useRef(isLeader);
  const [isSharedNote, setIsSharedNote] = useState<boolean>(false);
  const pendingTitleMap = useRef<Record<string, string>>({});
  const [pendingTitle, setPendingTitle] = useState<string>("");
  const [aiSelectorOpen, setAISelectorOpen] = useState(false);
  const [aiSelectorPosition, setAISelectorPosition] = useState<{ left: number; top: number } | null>(null);
  const [isSlashCommandAIOpen, setIsSlashCommandAIOpen] = useState<boolean>(false);

  // Watch for block changes and re-parse content - ONLY for blocks of this specific page
  // Watch for block changes and re-parse content - ONLY for blocks of this specific page
  const lastParsedBlocksRef = useRef<string>("");
  const lastEditorKeyRef = useRef<string>("");
  const isUpdatingFromParserRef = useRef<boolean>(false);
  const parserDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSignatureRef = useRef<string>("");
  const lastUserEditTimeRef = useRef<number>(0);
  const [commentAnchorRect, setCommentAnchorRect] = useState<DOMRect | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any | null>(null); // Store editor instance - any needed for Novel editor API
  const router = useRouter();

  // Stable callback to avoid flushSync issues
  const handleSetLeader = useCallback((isLeader: boolean) => {
    setIsLeader(isLeader);
  }, []);

  const { socketConnected, initialSyncDone } = useCollaborativeEditor({
    editor: editorRef.current,
    editorKey,
    mode: isPublicNote ? true : false || isSharedNote,
    onSetLeader: handleSetLeader,
    isRestrictedPage: isRestrictedPage as boolean,
    noteType,
  });


  const [showCommitHistory, setShowCommitHistory] = useState<boolean>(false);
  const [commitHistoryLoading, setCommitHistoryLoading] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [historyEditorContent, setHistoryEditorContent] = useState<any>(null);
  const [isHistoryMode, setIsHistoryMode] = useState<boolean>(false);
  const [commitContentLoading, setCommitContentLoading] = useState<boolean>(false);
  const [isApplyingCommit, setIsApplyingCommit] = useState<boolean>(false);
  const historyEditorRef = useRef<any>(null);
  const { mentionUser } = useNotifications();
  const { currentWorkspace } = useWorkspaceContext();
  const {
    privatePagesOrder,
    publicPagesOrder,
    sharedPagesOrder,
    workAreaPagesOrder,
    removePage
  } = useRootPagesOrder();
  const {
    dataSources,
    setDataSources,
    currentDataSource,
    setCurrentDataSource,
    currentView,
    setCurrentView,
    refreshNotes,
    getDataSource,
    setDataSource
  } = useBoard();
  const { getAllBlocks, upsertBlocks: upsertGlobalBlocks, loadBlocks: restoreGlobalBlocks } = useGlobalBlocks();
  const originalDataSourcesRef = useRef<Record<string, any>>({});
  const originalCurrentDataSourceMappingRef = useRef<Record<string, string | undefined>>({});
  const originalCurrentViewMappingRef = useRef<Record<string, any>>({});
  const originalBlocksRef = useRef<Block[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const { activityLogs, isLogLoading } = useActivityLogs(showLogs ? editorKey : null);
  const [pageComments, setPageComments] = useState<Comment[]>([]);



  const fetchHistory = async () => {
    if (!editorKey || !editorRef.current) return;

    // Capture current board state and global blocks before entering history mode
    originalDataSourcesRef.current = { ...dataSources };
    originalCurrentDataSourceMappingRef.current = { ...currentDataSource };
    originalCurrentViewMappingRef.current = { ...currentView };
    originalBlocksRef.current = getAllBlocks();

    historyManager.storeOriginalContent(editorRef.current.getJSON());

    setCommitHistoryLoading(true);

    try {
      // Force save any unsaved changes before showing history
      if (editorRef.current) {

        try {
          const response = await postWithAuth(
            "/api/snapshot/create",
            {
              parentId: editorKey,
              workspaceId: currentWorkspace?._id
            }
          );

          if (!("isError" in response && response.isError)) {
            console.log("snapshot saved");
          }
        } catch (error) {
          console.error("Error creating snapshot before history:", error);
        }
      }

      const historyPromise = historyManager.fetchHistory(editorKey);
      const fetchedSnapshot = await historyPromise;
      console.log("Fetched snapshot:", fetchedSnapshot);
      const combinedSnapshots = fetchedSnapshot.map((c: any) => ({
        time: c.date,
        version: c.version
      }));


      if (combinedSnapshots) {
        setIsHistoryMode(true);
        setShowCommitHistory(true);
        setCommitHistoryLoading(false);
        setSnapshots(combinedSnapshots);
        if (combinedSnapshots.length > 0) {
          setSelectedSnapshot(combinedSnapshots[0]);
          const firstHistoryContent = await historyManager.loadSelectedVersionContent(editorKey, fetchedSnapshot[0].version, globalBlocks.getBlock);
          if (firstHistoryContent) {
            setHistoryEditorContent(firstHistoryContent);
          }
        }
      }
    } catch (error) {
      console.error("Error in fetchHistory:", error);
    } finally {
      setCommitHistoryLoading(false);
    }
  };

  const loadSelectedVersionContent = useDebouncedCallback(async (noteId: string, version: string) => {
    if (!editorKey || !editorRef.current) return;

    if (isHistoryMode) {
      // Get content and blocks to check for boards
      const response = await historyManager.loadSelectedVersionContent(editorKey, version, globalBlocks.getBlock, true);

      if (response && typeof response === 'object') {
        const content = 'content' in response ? response.content : response;
        const blocks = 'blocks' in response ? (response.blocks as Block[]) : [];

        if (content) {
          setHistoryEditorContent(content);
        }

        // Extract data sources from historical response and merge with original state
        // The API returns dataSources as an array, so we must index them by _id
        const dssArray = (response as any).dataSources || [];
        const dsMapping: Record<string, any> = {};
        dssArray.forEach((ds: any) => { if (ds._id) dsMapping[ds._id] = ds; });

        const baseDataSources = originalDataSourcesRef.current || {};
        setDataSources({ ...baseDataSources, ...dsMapping });

        // Merge historical blocks into global context so board cards are visible
        if (blocks.length > 0) {
          await upsertGlobalBlocks(blocks);
        }

        // Sync views for boards found in historical version
        if (blocks.length > 0) {
          blocks.forEach(b => {
            if (b.blockType === 'collection_view') {
              const views = (b.value as any)?.viewsTypes || [];
              const firstView = views[0];
              if (firstView) {
                // Update board current view to match history
                setCurrentView(b._id, firstView._id, firstView.viewType);

                // If the data source for this view is NOT in the history response or current context,
                // fetch it as a fallback.
                if (firstView.databaseSourceId &&
                  !dsMapping[firstView.databaseSourceId] &&
                  !dataSources[firstView.databaseSourceId]) {
                  console.log(`[History] Fetching missing dataSource ${firstView.databaseSourceId}`);
                  refreshNotes(firstView.databaseSourceId);
                }
              }
            }
          });
        }
      }
      setCommitContentLoading(false);
      return;
    }
  }, 300);

  // // Direct function to load commit content without debouncing (for apply functionality)
  // const loadSelectedVersionContentDirect = async (noteId: string, version: string) => {
  //   if (!editorKey) return null;

  //   try {
  //     const content = await historyManager.loadSelectedVersionContent(editorKey, version, globalBlocks.getBlock);
  //     return content;
  //   } catch (error) {
  //     console.error("Error loading commit content:", error);
  //     return null;
  //   }
  // };

  const closeCommitHistory = () => {
    setShowCommitHistory(false);
    setIsHistoryMode(false);

    // Restore original board state
    if (Object.keys(originalDataSourcesRef.current).length > 0) {
      setDataSources(originalDataSourcesRef.current);

      // Restore datasource mappings
      Object.entries(originalCurrentDataSourceMappingRef.current).forEach(([boardId, dsId]) => {
        setCurrentDataSource(boardId, dsId);
      });

      // Restore view mappings
      Object.entries(originalCurrentViewMappingRef.current).forEach(([boardId, viewData]) => {
        if (viewData) {
          setCurrentView(boardId, viewData.id, viewData.type);
        }
      });

      // Restore all global blocks (workspace state)
      if (originalBlocksRef.current.length > 0) {
        restoreGlobalBlocks(originalBlocksRef.current);
      }

      // Clear refs
      originalDataSourcesRef.current = {};
      originalCurrentDataSourceMappingRef.current = {};
      originalCurrentViewMappingRef.current = {};
      originalBlocksRef.current = [];
    }

    // Restore original content
    if (editorRef.current) {
      const originalContent = historyManager.getOriginalContent();
      if (originalContent) {
        // Update initialContent state so EditorContent doesn't reset to old value
        setInitialContent(originalContent);
        // Also restore in editor
        editorRef.current.commands.setContent(originalContent, false);
        // Update prevContentRef to match
        prevContentRef.current = originalContent;
      }
    }
    historyManager.clearOriginalContent();
  };

  const applyHistoryContent = async (snapshot: any) => {
    if (!editorRef.current || !editorKey) return;

    setIsApplyingCommit(true);

    // Temporarily disable collaborative editor to prevent content override
    const originalSocketConnected = socketConnected;
    if (socketConnected) {
      console.log("Temporarily disabling collaborative editor sync");
      setSocketConnected(false);

      // Clear any offline backup to prevent restoration
      if (editorRef.current && editorRef.current.storage?.collaborativeEditor) {
        try {
          const yDoc = editorRef.current.storage.collaborativeEditor.doc;
          if (yDoc) {
            // Clear the offline backup
            yDoc.getXmlFragment('prosemirror').delete(0, yDoc.getXmlFragment('prosemirror').length);
            console.log("Cleared collaborative editor offline backup");
          }
        } catch (error) {
          console.error("Error clearing collaborative editor backup:", error);
        }
      }
    }

    try {
      let contentToApply: JSONContent | null = null;
      let blocksData: { blocks: Block[], blockIds: string[] } | null = null;

      // First, try to use the already loaded content from history editor if it matches
      if (selectedSnapshot && selectedSnapshot.version === snapshot.version && historyEditorContent) {
        console.log("Using already loaded content from history editor");
        contentToApply = historyEditorContent;

        // Still need to fetch blocks data for updating context
        const blocksResponse = await historyManager.loadSelectedVersionContent(editorKey, snapshot.version, globalBlocks.getBlock, true);
        if (blocksResponse && typeof blocksResponse === 'object' && 'blocks' in blocksResponse) {
          blocksData = {
            blocks: blocksResponse.blocks as Block[],
            blockIds: blocksResponse.blockIds as string[]
          };
        }
      } else {
        // Load the commit content with blocks data
        const response = await historyManager.loadSelectedVersionContent(editorKey, snapshot.version, globalBlocks.getBlock, true);
        if (response && typeof response === 'object' && 'content' in response) {
          contentToApply = response.content || null;
          blocksData = {
            blocks: response.blocks as Block[],
            blockIds: response.blockIds as string[]
          };
          console.log("Fresh content and blocks loaded:", contentToApply);
        } else {
          contentToApply = null
        }
      }

      if (!contentToApply) {
        console.error("No content to apply");
        toast.error("Failed to load commit content");
        return;
      }

      console.log("Content to apply:", contentToApply);

      // Temporarily make editor editable if it's not
      const wasEditable = editorRef.current.isEditable;
      if (!wasEditable) {
        console.log("Making editor editable temporarily");
        editorRef.current.setEditable(true);
      }

      // Restore editable state
      if (!wasEditable) {
        console.log("Restoring editor editable state");
        editorRef.current.setEditable(wasEditable);
      }

      // Update blocks in context with historical data
      if (blocksData && blocksData.blocks && blocksData.blockIds) {
        console.log("[Apply history] Historical blocks count:", blocksData.blocks.length);
        console.log("[Apply Commit] Historical blockIds:", blocksData.blockIds);

        const workspaceId = currentWorkspace?._id;

        try {
          // 1. Call the centralized restoration API for the backend
          await postWithAuth("/api/snapshot/restore-version", {
            blockId: editorKey,
            version: snapshot.version,
            workspaceId: currentWorkspace?._id
          });

          // 2. Update parent block's blockIds array in local context for immediate UI feedback
          if (blocksData.blockIds.length >= 0) {
            console.log("[Apply Commit] Updating local parent block blockIds:", blocksData.blockIds);
            const currentParentBlock = globalBlocks.getBlock(editorKey);
            if (currentParentBlock) {
              globalBlocks.upsertBlocks([{ ...currentParentBlock, blockIds: blocksData.blockIds }]);

              /* OLD MANUAL UPDATE LOGIC (COMMENTED OUT)
              // Update via API - update parent block content and its blockIds
              postWithAuth("/api/note/block/drag-and-drop", {
                dragAndDropinputfieldArray: [
                  {
                    parentId: currentParentBlock._id,
                    workspaceId: currentWorkspace?._id,
                    blockIdArray: blocksData.blockIds,
                    typeofChild: "page"
                  },
                ]
              }).catch(err => console.error("Error updating parent blockIds:", err));
              */
            }
          }

          // 3. For each historical block, update local frontend context
          for (const historicalBlock of blocksData.blocks) {
            const currentBlock = globalBlocks.getBlock(historicalBlock._id);

            // Update local parent structure for reparented moves (drag-and-drop sync)
            if (currentBlock && currentBlock.parentId) {
              if (currentBlock.parentId !== (historicalBlock.parentId || editorKey)) {
                const oldParent = globalBlocks.getBlock(currentBlock.parentId);
                if (oldParent && oldParent.blockIds) {
                  const updatedOldParentBlockIds = oldParent.blockIds.filter(id => id !== historicalBlock._id);
                  globalBlocks.upsertBlocks([{ ...oldParent, blockIds: updatedOldParentBlockIds }]);

                  /* OLD MANUAL UPDATE LOGIC (COMMENTED OUT)
                  // Update old parent via API - update old parent content and its blockIds
                  postWithAuth("/api/note/block/drag-and-drop", {
                    dragAndDropinputfieldArray: [
                      {
                        parentId: oldParent._id,
                        workspaceId: currentWorkspace?._id,
                        blockIdArray: updatedOldParentBlockIds,
                        typeofChild: "page"
                      },
                    ]
                  }).catch(err => console.error("Error updating old parent:", err));
                  */
                }
              }
            }

            // Ensure parentId is set (use editorKey as default if null)
            const blockToUpsert = {
              ...historicalBlock,
              parentId: historicalBlock.parentId || editorKey
            };

            // Upsert the historical block into global local context
            await globalBlocks.upsertBlocks([blockToUpsert]);

            // Update BoardContext mappings and data sources for applied blocks
            if (blockToUpsert.blockType === 'collection_view') {
              const views = (blockToUpsert.value as any)?.viewsTypes || [];
              const firstView = views[0];
              if (firstView) {
                setCurrentView(blockToUpsert._id, firstView._id, firstView.viewType);
                if (firstView.databaseSourceId) {
                  setCurrentDataSource(blockToUpsert._id, firstView.databaseSourceId);

                  // If we have the data source content in the history response, apply it to the context
                  const historicalDataSource = (blocksData as any).dataSources?.[firstView.databaseSourceId];
                  if (historicalDataSource) {
                    setDataSource(firstView.databaseSourceId, historicalDataSource);
                  }
                }
              }
            }

            /* OLD MANUAL UPDATE LOGIC (COMMENTED OUT)
            // Update block via API - update block content
            postWithAuth("/api/note/block/batch-update", {
              parentId: blockToUpsert.parentId,
              workspaceId,
              blocks: [{ _id: blockToUpsert._id, content: blockToUpsert.value }]
            }).catch(err => console.error("Error updating block:", err));
            */
          }
        } catch (error) {
          console.error("[Apply Commit] Error updating blocks:", error);
        }
      }

      // Close the history view
      setShowCommitHistory(false);
      setIsHistoryMode(false);

      // Successfully applied: clear refs without restoring
      originalDataSourcesRef.current = {};
      originalCurrentDataSourceMappingRef.current = {};
      originalCurrentViewMappingRef.current = {};
      originalBlocksRef.current = [];

      //Restore original content
      if (editorRef.current) {

        if (contentToApply) {
          console.log("Replacing document content...");
          // Update initialContent state so EditorContent doesn't reset to old value
          setInitialContent(contentToApply);
          // Also restore in editor
          editorRef.current.commands.setContent(contentToApply, false);
          // Update prevContentRef to match
          prevContentRef.current = contentToApply;
        }
      }
      historyManager.clearOriginalContent();

      // Show success message
      toast.success("Commit content applied successfully");
    } catch (error) {
      console.error("Error applying commit content:", error);
    } finally {
      // Re-enable collaborative editor sync after a delay
      if (originalSocketConnected) {
        setTimeout(() => {
          setSocketConnected(true);
        }, 5000); // Wait 5 seconds to ensure content is fully applied and stable
      }
      setIsApplyingCommit(false);
    }
  };

  // const applyCommitContent = async (snapshot: any) => {
  //   if (!editorRef.current || !editorKey) return;

  //   console.log("=== APPLY COMMIT DEBUG ===");
  //   console.log("snapshot to apply:", snapshot);
  //   console.log("Selected snapshot:", selectedSnapshot);
  //   console.log("History editor content:", historyEditorContent);
  //   console.log("Current editor content before apply:", editorRef.current.getJSON());
  //   console.log("Editor is editable:", editorRef.current.isEditable);
  //   console.log("Read only state:", readOnly);
  //   console.log("Show commit history:", showCommitHistory);
  //   console.log("Is history mode:", isHistoryMode);

  //   setIsApplyingCommit(true);

  //     // Temporarily disable collaborative editor to prevent content override
  //     const originalSocketConnected = socketConnected;
  //     if (socketConnected) {
  //       console.log("Temporarily disabling collaborative editor sync");
  //       setSocketConnected(false);

  //       // Clear any offline backup to prevent restoration
  //       if (editorRef.current && editorRef.current.storage?.collaborativeEditor) {
  //         try {
  //           const yDoc = editorRef.current.storage.collaborativeEditor.doc;
  //           if (yDoc) {
  //             // Clear the offline backup
  //             yDoc.getXmlFragment('prosemirror').delete(0, yDoc.getXmlFragment('prosemirror').length);
  //             console.log("Cleared collaborative editor offline backup");
  //           }
  //         } catch (error) {
  //           console.error("Error clearing collaborative editor backup:", error);
  //         }
  //       }
  //     }

  //   try  {
  //     let contentToApply = null;

  //     // First, try to use the already loaded content from history editor if it matches
  //     if (selectedSnapshot && selectedSnapshot.version === snapshot.sha && historyEditorContent) {
  //       console.log("Using already loaded content from history editor");
  //       contentToApply = historyEditorContent;
  //     } else {
  //       // Load the commit content using the direct function
  //       contentToApply = await loadSelectedVersionContentDirect(editorKey, snapshot.version);
  //       console.log("Fresh content loaded:", contentToApply);
  //     }

  //     if (!contentToApply) {
  //       console.error("No content to apply");
  //       toast.error("Failed to load commit content");
  //       return;
  //     }

  //     console.log("Content to apply:", contentToApply);
  //     console.log("Content to apply type:", typeof contentToApply);
  //     console.log("Content to apply keys:", contentToApply ? Object.keys(contentToApply) : "No keys");

  //     // Check if content is different from current
  //     const currentContent = editorRef.current.getJSON();
  //     console.log("Current content:", currentContent);
  //     console.log("Are contents different?", JSON.stringify(currentContent) !== JSON.stringify(contentToApply));

  //     // Apply the content to the main editor
  //     console.log("Setting content in editor...");

  //     // Temporarily make editor editable if it's not
  //     const wasEditable = editorRef.current.isEditable;
  //     if (!wasEditable) {
  //       console.log("Making editor editable temporarily");
  //       editorRef.current.setEditable(true);
  //     }

  //     // Use replaceWith to completely replace the document content
  //     console.log("Replacing document content...");    
  //     // Update the content reference
  //     prevContentRef.current = contentToApply;

  //     // Mark as dirty to trigger save
  //     isDirtyRef.current = true;
  //     setIsContentSynced(false);
  //     // setSaveStatus("Unsaved");

  //     // Force update the collaborative editor with the new content
  //     if (editorRef.current && editorRef.current.storage?.collaborativeEditor) {
  //       console.log("Updating collaborative editor with applied content...");
  //       try {
  //         const editorState = editorRef.current.state;
  //         const docSize = editorState.doc.content.size;

  //         // Create a transaction that replaces all content
  //         const tr = editorState.tr.replaceWith(0, docSize,
  //           editorRef.current.schema.nodeFromJSON(contentToApply).content);

  //         editorRef.current.view.dispatch(tr);
  //         console.log("Document content replaced successfully");
  //       } catch (error) {
  //         console.error("ReplaceWith failed, trying setContent:", error);
  //         // Fallback to setContent
  //         editorRef.current.commands.setContent(contentToApply, false);
  //       }

  //       // Restore editable state
  //       if (!wasEditable) {
  //         console.log("Restoring editor editable state");
  //         editorRef.current.setEditable(wasEditable);
  //       }

  //     // Immediately trigger save after content is applied
  //     console.log("Immediately triggering save after content application...");
  //     // setSaveStatus("Saving...");
  //     // if (editorRef.current) {
  //     //   forceSaveOnline(editorRef.current);
  //     // }

  //     // Force trigger the online save after applying content
  //     setTimeout(async () => {
  //       if (editorRef.current) {
  //         console.log("Triggering online save after apply...");
  //         // Force save without socket dependency
  //         console.log("Online save completed after apply");
  //       }
  //     }, 500);

  //     // Close the history view
  //     closeCommitHistory();

  //     // Show success message
  //     toast.success("Commit content applied successfully");
  //   }} catch (error) {
  //     console.error("Error applying commit content:", error);
  //     toast.error("Failed to apply commit content");
  //   } finally {
  //     // Re-enable collaborative editor sync after a delay
  //     if (originalSocketConnected) {
  //       console.log("Re-enabling collaborative editor sync");
  //       setTimeout(() => {
  //         setSocketConnected(true);
  //         // Trigger another save after re-enabling collaborative editor
  //         // if (editorRef.current) {
  //         //   console.log("Triggering save after re-enabling collaborative editor...");
  //         //   setTimeout(async () => {
  //         //     await forceSaveOnline(editorRef.current);
  //         //     console.log("Final save completed after re-enabling collaborative editor");
  //         //   }, 1000);
  //         // }
  //       }, 5000); // Wait 5 seconds to ensure content is fully applied and stable
  //     }
  //   };
  // };

  useEffect(() => {
    return () => {
      closeCommitHistory();
      historyManager.clearOriginalContent();
    };
  }, [editorKey]);

  useEffect(() => {
    if (showCommitHistory) return;
    setSocketConnected(socketConnected);
    if (socketConnected) {
      console.log("In the conntection Established");
    }
    if (!socketConnected) {
      // Optionally, set a flag to disable real-time features, but DO NOT reset content.
    }
  }, [socketConnected]);

  // useEffect(() => {
  //   if (initialSyncDone) {
  //     setIsLoading(false)

  //     if (noteType == "original") {
  //       setTimeout(() => {
  //         isDirtyRef.current = false;
  //         const json = editorRef?.current?.getJSON();
  //         prevContentRef.current = json;
  //       }, 500);
  //     }
  //   };
  // }, [initialSyncDone]);

  // Add event listener to handle AI content insertion from chat

  useEffect(() => {
    // Handler function for the custom event
    const handleAIContentInsertion = (event: CustomEvent) => {
      if (!editorRef.current) return;

      const content = event.detail?.content;
      if (!content) return;

      try {
        // Get the editor instance
        const editor = editorRef.current;

        // Move to the end of the document and focus
        // First ensure we're at the end of the document
        const endPosition = editor.state.doc.content.size;
        editor.chain().focus().setTextSelection(endPosition).run();

        // Trigger the AI selector at the current position
        // Open AI selector at the end of the document
        openAISelectorAtSelection();

        // Log that we've triggered the selector

        // We need to set a longer timeout to ensure the AI selector is fully open before we try to input content
        setTimeout(() => {
          // Try to find the CommandInput element - try multiple selectors based on the exact HTML structure
          const inputElement = document.querySelector(
            "[cmdk-input], input[placeholder*='Ask AI'], input.flex.h-11.w-full.rounded-md.bg-transparent",
          );

          if (inputElement instanceof HTMLInputElement) {
            // Set the value
            inputElement.value = content;

            // Focus the input element
            inputElement.focus();

            // Dispatch input event to trigger the AI completion logic
            const inputEvent = new Event("input", { bubbles: true });
            inputElement.dispatchEvent(inputEvent);

            // This is critical - we need to trigger the onValueChange handler in the CommandInput component
            // Create a custom event that will be picked up by React's synthetic event system
            const reactChangeEvent = new Event("change", { bubbles: true });
            Object.defineProperty(reactChangeEvent, "target", { value: inputElement });
            inputElement.dispatchEvent(reactChangeEvent);

            // Find and click the submit button with a longer delay
            setTimeout(() => {
              // Try multiple selector patterns to find the button based on the exact HTML structure
              // Target the button that's next to the input with the specific classes from the HTML
              let submitButton = document.querySelector(
                "button.absolute.right-2.top-1\\/2.h-6.w-6.-translate-y-1\\/2.rounded-full.bg-\\[\\#5E7CE2\\], " +
                "button.rounded-full.bg-\\[\\#5E7CE2\\], " +
                ".absolute.right-2.top-1\\/2 button, " +
                "[cmdk-input-wrapper] + button, " +
                "div.relative > button",
              );

              // If that doesn't work, try to find the button by looking for the ArrowUp icon
              if (!submitButton) {
                const allButtons = document.querySelectorAll("button");
                for (const btn of allButtons) {
                  if (btn.querySelector("svg.lucide-arrow-up")) {
                    submitButton = btn;

                    break;
                  }
                }
              }

              if (submitButton && submitButton instanceof HTMLButtonElement) {
                // Before clicking the button, let's create a global variable to store the prompt
                // This will be used by the AI selector component
                window.__aiPromptContent = content;

                // Add a custom attribute to the button to identify it as having our prompt
                submitButton.setAttribute("data-ai-prompt", content);

                // Now click the button
                submitButton.click();
                toast.success("AI prompt submitted");
              } else {
                // Try to find any button inside the AI selector by targeting the exact structure from the HTML
                const anyButton = document.querySelector(
                  "div.relative > button.absolute.right-2, div.relative > button",
                );
                if (anyButton && anyButton instanceof HTMLButtonElement) {
                  // Set global variable and attribute
                  window.__aiPromptContent = content;
                  anyButton.setAttribute("data-ai-prompt", content);

                  anyButton.click();
                  toast.success("AI prompt submitted via alternative button");
                  return;
                }

                // Try to find the AI selector component based on the exact HTML structure
                const aiSelector = document.querySelector(
                  "div.relative, div:has([cmdk-input]), div:has(input[placeholder*='Ask AI'])",
                );
                if (aiSelector) {
                  const buttons = aiSelector.querySelectorAll("button");

                  // Find the button with ArrowUp icon or similar
                  for (const btn of buttons) {
                    // Look for the button with the specific structure from the HTML
                    if (
                      btn.querySelector("svg.lucide-arrow-up") ||
                      btn.classList.contains("rounded-full") ||
                      btn.classList.contains("absolute") ||
                      btn.classList.contains("right-2")
                    ) {
                      btn.click();
                      toast.success("AI prompt submitted via icon button");
                      return;
                    }
                  }
                }

                // Try direct DOM manipulation as a last resort
                // Try to get all buttons in the document and find one with arrow-up icon
                const allButtons = document.querySelectorAll("button");

                // Look for a button with arrow-up SVG
                let foundButton = false;
                allButtons.forEach((btn, i) => {
                  const btnHTML = btn.innerHTML;
                  if (
                    btnHTML.includes("arrow-up") ||
                    btnHTML.includes("lucide-arrow-up") ||
                    btn.classList.contains("rounded-full")
                  ) {
                    btn.click();
                    foundButton = true;
                    toast.success("AI prompt submitted via found button");
                    return;
                  }
                });

                // Try to find the button by its position relative to the AI input
                if (!foundButton) {
                  const inputParent = inputElement.closest(".relative");
                  if (inputParent) {
                    const nearbyButton = inputParent.querySelector("button");
                    if (nearbyButton) {
                      nearbyButton.click();
                      foundButton = true;
                      toast.success("AI prompt submitted via nearby button");
                      return;
                    }
                  }
                }

                // If still no button found, try Enter key
                if (!foundButton) {
                  // Try to trigger the handleAIComplete function by simulating an Enter key press
                  const enterEvent = new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                  });
                  inputElement.dispatchEvent(enterEvent);

                  // Also try to trigger a form submission as a fallback
                  setTimeout(() => {
                    const form = inputElement.closest("form");
                    if (form) {
                      const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
                      form.dispatchEvent(submitEvent);
                    }
                  }, 100);

                  toast.success("AI prompt submitted via Enter key");
                }
              }
            }, 300); // Longer delay to ensure button is ready
          } else {
            toast.error("Couldn't find AI input field");
          }
        }, 500); // Increased timeout to ensure selector is fully open

        // We don't show success immediately as the actual content generation will happen asynchronously
      } catch (error) {
        console.error("Error triggering AI content generation:", error);
        toast.error("Failed to trigger AI content generation");
      }
    };

    // Add event listener
    window.addEventListener("insert-ai-content", handleAIContentInsertion as EventListener);

    // Also check URL for ai_content parameter when loading
    const checkURLForContent = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const aiContent = urlParams.get("ai_content");

        if (aiContent && editorRef.current) {
          // Remove the parameter from URL without refreshing
          window.history.replaceState({}, document.title, window.location.pathname);

          // Wait a bit for the editor to fully initialize
          setTimeout(() => {
            // Move to the end of the document and focus
            editorRef.current?.chain().focus().selectTextblockEnd().run();

            // Open the AI selector and trigger the prompt
            openAISelectorAtSelection();

            // Set the decoded content in the input field after a longer delay
            setTimeout(() => {
              const inputElement = document.querySelector("[cmdk-input]");
              if (inputElement instanceof HTMLInputElement) {
                console.log("URL param: Found input element, setting value:", aiContent);

                // Set the value
                inputElement.value = decodeURIComponent(aiContent);

                // Focus the input element
                inputElement.focus();

                // Dispatch input event to trigger the AI completion logic
                const inputEvent = new Event("input", { bubbles: true });
                inputElement.dispatchEvent(inputEvent);

                console.log("URL param: Input event dispatched");

                // Find and click the submit button with a longer delay
                setTimeout(() => {
                  console.log("URL param: Looking for submit button");
                  // Try multiple selector patterns to find the button based on the exact HTML structure
                  // Target the button that's next to the input with the specific classes from the HTML
                  const submitButton = document.querySelector(
                    "button.absolute.right-2.top-1\\/2.h-6.w-6.-translate-y-1\\/2.rounded-full.bg-\\[\\#5E7CE2\\], " +
                    "button.rounded-full.bg-\\[\\#5E7CE2\\], " +
                    ".absolute.right-2.top-1\\/2 button, " +
                    "[cmdk-input-wrapper] + button, " +
                    "div.relative > button",
                  );

                  if (submitButton && submitButton instanceof HTMLButtonElement) {
                    console.log("URL param: Found submit button, clicking");
                    submitButton.click();
                    toast.success("AI prompt submitted");
                  } else {
                    console.log("URL param: Submit button not found, trying alternative approaches");

                    // Try to find any button inside the AI selector by targeting the exact structure from the HTML
                    const anyButton = document.querySelector(
                      "div.relative > button.absolute.right-2, div.relative > button",
                    );
                    if (anyButton && anyButton instanceof HTMLButtonElement) {
                      console.log("URL param: Found alternative button, clicking");
                      anyButton.click();
                      toast.success("AI prompt submitted via alternative button");
                      return;
                    }

                    // Try to find the AI selector component based on the exact HTML structure
                    const aiSelector = document.querySelector(
                      "div.relative, div:has([cmdk-input]), div:has(input[placeholder*='Ask AI'])",
                    );
                    if (aiSelector) {
                      console.log("URL param: Found AI selector container, looking for button inside");
                      const buttons = aiSelector.querySelectorAll("button");
                      console.log(`URL param: Found ${buttons.length} buttons in AI selector`);

                      // Find the button with ArrowUp icon or similar
                      for (const btn of buttons) {
                        // Look for the button with the specific structure from the HTML
                        if (
                          btn.querySelector("svg.lucide-arrow-up") ||
                          btn.classList.contains("rounded-full") ||
                          btn.classList.contains("absolute") ||
                          btn.classList.contains("right-2")
                        ) {
                          console.log("URL param: Found button with icon, clicking");
                          btn.click();
                          toast.success("AI prompt submitted via icon button");
                          return;
                        }
                      }
                    }

                    // Last resort: Simulate pressing Enter key
                    console.log("URL param: No buttons found, trying Enter key simulation");
                    const enterEvent = new KeyboardEvent("keydown", {
                      key: "Enter",
                      code: "Enter",
                      keyCode: 13,
                      which: 13,
                      bubbles: true,
                      cancelable: true,
                    });
                    inputElement.dispatchEvent(enterEvent);
                    toast.success("AI prompt submitted via Enter key");
                  }
                }, 300); // Longer delay to ensure button is ready
              } else {
                console.error("URL param: AI input field not found");
              }
            }, 500);
          }, 500);
        }
      } catch (error) {
        console.error("Error processing AI content from URL:", error);
      }
    };

    // Check once after the editor is loaded
    if (editorRef.current) {
      checkURLForContent();
    }

    // Clean up
    return () => {
      window.removeEventListener("insert-ai-content", handleAIContentInsertion as EventListener);
    };
  }, [editorRef.current]);

  const handlePageCreated = (href: string) => {
    router.push(href);
  };

  function openAISelectorAtSelection() {
    if (editorRef.current) {
      setOpenAI(false);

      const selection = editorRef.current.view.state.selection;
      const coords = editorRef.current.view.coordsAtPos(selection.from);

      const editorContainer = editorRef.current.options.element;
      const editorRect = editorContainer.getBoundingClientRect();

      let left = coords.left - editorRect.left + 10;
      const top = coords.bottom - editorRect.top + 200;

      const aiSelectorWidth = 400;
      const maxLeft = Math.min(editorRect.width, window.innerWidth) - aiSelectorWidth - 20;
      if (left > maxLeft) {
        left = maxLeft;
      }
      if (left < 10) {
        left = 10;
      }

      setAISelectorPosition({ left, top });
      setAISelectorOpen(true);
      setIsSlashCommandAIOpen(true);

      // Log that we've opened the selector
      console.log("AI selector opened, position set to", { left, top });

      // Debugging: Check if we can find the AI selector in the DOM after a short delay
      setTimeout(() => {
        const aiSelectorElements = document.querySelectorAll(
          ".h-full.flex-col.overflow-hidden.text-popover-foreground",
        );
        console.log(`Found ${aiSelectorElements.length} AI selector elements`);

        const inputElements = document.querySelectorAll("input[placeholder*='Ask AI']");
        console.log(`Found ${inputElements.length} AI input elements`);

        const buttonElements = document.querySelectorAll("button.rounded-full.bg-\\[\\#5E7CE2\\]");
        console.log(`Found ${buttonElements.length} AI submit buttons`);

        // Try to find the button directly using the exact structure from the HTML
        const exactButtonSelector =
          "div.relative > button.absolute.right-2.top-1\\/2.h-6.w-6.-translate-y-1\\/2.rounded-full.bg-\\[\\#5E7CE2\\]";
        const exactButton = document.querySelector(exactButtonSelector);
        console.log(`Found exact button match: ${exactButton ? "YES" : "NO"}`);

        // Try with a simpler selector
        const simpleButtons = document.querySelectorAll("button");
        console.log(`Found ${simpleButtons.length} total buttons`);
        simpleButtons.forEach((btn, i) => {
          console.log(`Button ${i}: class="${btn.className}", innerHTML="${btn.innerHTML.substring(0, 50)}..."`);
        });
      }, 200);
    }
  }

  const suggestionItems = useMemo(
    () => getSuggestionItems(
      editorKey,
      handlePageCreated,
      openAISelectorAtSelection,
      fetchHistory,
      isRestrictedPage,
      isPublicNote,
      noteQueryData?.workAreaId,
      globalBlocks.addBlock,
      globalBlocks.updateBlock,
      globalBlocks.getBlock,
      currentWorkspace?._id,
      user?.email,
      setDataSource,
      setCurrentDataSource
    ),
    [editorKey, isRestrictedPage, isPublicNote, noteQueryData?.workAreaId, globalBlocks, currentWorkspace?._id, user?.email],
  );

  const slashCommand = useMemo(() =>
    getSlashCommand(
      editorKey,
      handlePageCreated,
      undefined, // on Ask AI Command
      undefined, // on History Command
      isRestrictedPage,
      isPublicNote,
      noteQueryData?.workAreaId),
    [editorKey, isRestrictedPage, isPublicNote, noteQueryData?.workAreaId]);

  const extensions = useMemo(
    () => [
      createBlockTrackerExtension(
        editorKey,
        currentWorkspace?._id || "",
        parentId,
        "page", // parentTable - this is a page editor
        {
          setOrderFromArray,
          insertAfter,
          removeId,
          moveToOrder,
          replaceId,
        },
        globalBlocks,
        effectiveReadOnly
      ),
      ...defaultExtensions,
      slashCommand,
      createMentionExtension(mentionUser)
    ],
    [editorKey, slashCommand, mentionUser, setOrderFromArray, insertAfter, removeId, moveToOrder, replaceId, currentWorkspace?._id, parentId, globalBlocks, effectiveReadOnly]
  );

  //Apply Codeblock Highlighting on the HTML from editor.getHTML()
  const highlightCodeblocks = (content: string) => {
    const doc = new DOMParser().parseFromString(content, "text/html");
    doc.querySelectorAll("pre code").forEach((el) => {
      hljs.highlightElement(el);
    });
    return new XMLSerializer().serializeToString(doc);
  };

  // Nothing needed here - we're using the existing Ask AI functionality instead

  // const debouncedUpdates = useDebouncedCallback(async (editor: Editor) => {
  //   if (showCommitHistory || isHistoryMode) return; 
  //   const json = editor.getJSON();
  //   window.localStorage.setItem(`html-content-${editorKey}`, highlightCodeblocks(editor.getHTML()));
  //   window.localStorage.setItem(`novel-content-${editorKey}`, JSON.stringify(json));
  //   window.localStorage.setItem(`markdown-${editorKey}`, editor.storage.markdown.getMarkdown());
  //   window.localStorage.setItem(`offline_content_time-${editorKey}`, JSON.stringify(new Date()));
  //   isDirtyRef.current = true;
  //   setIsContentSynced(false);
  //   setSaveStatus("Saved");

  //   if (isEditorContentEmpty(json)) {
  //     prevContentRef.current = json; // mark this structure as the baseline
  //     isDirtyRef.current = false;
  //     return;
  //   }

  //   setTimeout(()=>{
  //     if (JSON.stringify(json) == JSON.stringify(prevContentRef.current)) {
  //       // If the content didn't change, don't do anything.
  //       isDirtyRef.current = false;
  //       return;
  //     }
  //   } , 500);

  // }, 2000);

  // function updateTitleDeep(nodeList: any[], editorKey: string, newTitle: string): any[] {
  //   return nodeList.map((node) => {
  //     if (node.id === editorKey || node._id === editorKey) {
  //       return { ...node, title: newTitle };
  //     }

  //     if (node.children && Array.isArray(node.children)) {
  //       return {
  //         ...node,
  //         children: updateTitleDeep(node.children, editorKey, newTitle),
  //       };
  //     }

  //     return node;
  //   });
  // }

  // const handlePublish = async (editorKey: string) => {
  //   setPublishLoading(true); // Start loading
  //   const response = await publishNote(editorKey);
  //   setPublishLoading(false); // Stop loading

  //   if (isPublishResponse(response) && response.approvalStatus) {
  //     setPublishStatus(response.approvalStatus);
  //   }
  // };

  const handleInvite = async (editorKey: string, sharedWith: Invite[], isPublic: string) => {


    if (!currentWorkspace?._id) {
      toast.error("Failed to send invites. Please try again.");
      return;
    }
    const response = await inviteToNote(editorKey, sharedWith, isPublic, currentWorkspace?._id);
    clearShareNoteId();

  };

  const clearShareNoteId = () => {
    setShareNoteId(null);
  };

  const getAllCommentsIds = async (noteBlocks: Block[]) => {
    console.log("[AdvancedEditor] getAllCommentsIds", noteBlocks);
    const noteBlock = globalBlocks.getBlock(editorKey);

    try {
      const comments = await fetchAllCommentsForNote(noteBlock, noteBlocks);
      console.log("[AdvancedEditor] Fetched comments:", comments);
      setPageComments(comments);
    } catch (err) {
      console.error("[AdvancedEditor] Error fetching batch comments:", err);
      setPageComments([]);
    }
  }

  // const handleApproval = async (editorKey: string, approved: boolean) => {
  //   setApprovalLoading(true);
  //   setApprovalDirection(approved ? "approve" : "reject");

  //   const response = await approveNote(editorKey, approved, noteOwnerMail);

  //   // Safely access response.note if it exists
  //   if ("note" in response && response.note) {
  //     const note = response.note as NoteResponse;

  //     if (note.approvalStatus) {
  //       setApprovalStatus(note.approvalStatus);
  //     }
  //     if (note.githubRawUrl) {
  //       setGithubRawUrl(note.githubRawUrl);
  //     }
  //   }
  //   setApprovalLoading(false);
  //   setApprovalDirection(null);

  // };

  // const debouncedUpdatesOnline = useDebouncedCallback(async (editor: Editor) => {
  //   if (showCommitHistory || isHistoryMode) return; 
  //   if (!socketConnected) {
  //     // it helps to prevent the content loss when socket not active
  //     return;
  //   }

  //   //Do not run for review or published page
  //   if(noteType !== 'original') return ;

  //   const json = editor.getJSON();

  //   // ✅ Do not run if not leader or not a publicNote for checking socket
  //   if (isPublicNote && !isLeaderRef.current) return;
  //   // Check if the content has changed
  //   if (isPublicNote && !isLeaderRef.current && JSON.stringify(json) === JSON.stringify(prevContentRef.current)) {
  //     isDirtyRef.current = false;
  //     return; // No changes, skip API call
  //   }

  //   if (isPublicNote && JSON.stringify(json) === JSON.stringify(prevContentRef.current)) {
  //     isDirtyRef.current = false;
  //     return; // No changes, skip API call
  //   }

  //   if (!isPublicNote && JSON.stringify(json) === JSON.stringify(prevContentRef.current)) {
  //     isDirtyRef.current = false;
  //     return;
  //   }
  //   // if (!isPublicNote && !isLeaderRef.current) return;
  //   if (JSON.stringify(json) === JSON.stringify(prevContentRef.current)) {
  //     isDirtyRef.current = false;
  //     return;
  //   }

  //   // Update the reference to current content
  //   isDirtyRef.current = true;
  //   const pageName = `docs/notes/${editorKey}`;

  //   try {
  //     const response = await postWithAuth(
  //       "/api/note/uploadContent",
  //       {
  //         online_content: json,
  //         online_content_time: new Date(),
  //       },
  //       {
  //         headers: {
  //           "x-vercel-pagename": pageName,
  //         },
  //       },
  //     );

  //     // Check if response is an error
  //     if ("isError" in response && response.isError) {
  //       console.error("Error saving content online:", response.message);
  //       setSaveStatus("Save Failed");
  //       return;
  //     }
  //     const uploadContentResponse = response as NoteResponse;
  //     const updatedAt = uploadContentResponse?.updatedAt;

  //     setPublishStatus("Publish");
  //     isDirtyRef.current = false;
  //     setIsContentSynced(true);

  //     window.localStorage.setItem(`html-content-${editorKey}`, highlightCodeblocks(editor.getHTML()));
  //     window.localStorage.setItem(`novel-content-${editorKey}`, JSON.stringify(json));
  //     window.localStorage.setItem(`markdown-${editorKey}`, editor.storage.markdown.getMarkdown());
  //     window.localStorage.setItem(`offline_content_time-${editorKey}`, JSON.stringify(new Date()));
  //     window.localStorage.setItem(`last_content_update_time-${editorKey}`, JSON.stringify(updatedAt));

  //     setSaveStatus("Saved Online");
  //     prevContentRef.current = json;

  //     let pendingTitle: string | undefined;
  //     let pendingTitleParentId: string | null = null;
  //     let titleIcon: string | null = null;
  //     const pendingTitleObj = localStorage.getItem(`pending-title-${editorKey}`);

  //     if (pendingTitleObj) {
  //       // const pendingTitleObj = localStorage.getItem(`pending-title-${editorKey}`)
  //       if (pendingTitleObj) {
  //         try {
  //           const parsedObj = JSON.parse(pendingTitleObj) as PendingTitle;
  //           pendingTitle = parsedObj.newTitle;
  //           pendingTitleParentId = parsedObj.parentId;
  //           titleIcon = parsedObj.titleIcon;
  //         } catch (err) {
  //           console.error("Error in fetching new Title name", err);
  //         }
  //       }
  //       try {
  //         await updateNote(editorKey, pendingTitle as string, pendingTitleParentId, titleIcon);
  //         isTitleDirtyRef.current = false;
  //         localStorage.removeItem(`pending-title-${editorKey}`);
  //         delete pendingTitleMap.current[editorKey]; // ✅ Clear after successful update
  //       } catch (err) {
  //         toast.error("Error in updating name", err);
  //         console.error("❌ Failed to update title:", err);
  //       }
  //     }
  //     // After successful save, push markdown to vector DB (frontend) using ORIGINAL note owner's details
  //     const markdown = editor.storage.markdown.getMarkdown();
  //     const noteId = editorKey;
  //     // Get current user as fallback if owner info is missing
  //     const userString = window.localStorage.getItem("auth_user");
  //     const currentUser = userString ? JSON.parse(userString) : null;

  //     // Use the original note owner's user ID and email instead of current user
  //     // Fall back to current user only if owner info is completely missing
  //     const metadata = {
  //       title: editorTitle,
  //       userId: noteOwnerUserId || currentUser?.id, // Prefer original owner ID
  //       userEmail: noteOwnerMail || currentUser?.email, // Prefer original owner email
  //       updatedAt: new Date().toISOString(),
  //     };
  //     // await syncMarkdownToVectorDB({ noteId, markdown, metadata });
  //     return response;
  //   } catch (error) {
  //     console.error("Network error saving content online:", error);
  //     setSaveStatus("Save Failed");
  //   }
  // }, 1000);

  // useEffect(() => {
  //   const pendingTitle = localStorage.getItem(`pending-title-${editorKey}`);
  //   if (pendingTitle) {
  //     pendingTitleMap.current[editorKey] = pendingTitle;
  //     isTitleDirtyRef.current = true;
  //   }
  // }, [editorKey]);

  useEffect(() => {
    isLeaderRef.current = isLeader;
  }, [isLeader]);

  useEffect(() => {

    if (!editorInstance || !isLeader) return;
    const handleUpdate = () => {
      // debouncedUpdatesOnline(editorInstance); // 👈 Only leader will trigger
    };
    editorInstance.on("update", handleUpdate);

    return () => {
      editorInstance.off("update", handleUpdate);
    };
    // }, [editorInstance, isLeader, debouncedUpdatesOnline]);
  }, [editorInstance, isLeader,]);


  // Handle React Query data
  useEffect(() => {
    // Reset handled error when editor key changes
    // if (editorKey !== prevEditorKey.current) {
    //   handledErrorRef.current = null;
    //   prevEditorKey.current = editorKey;

    //   // Check if this is a new note and reset title
    //   const optimisticIds = JSON.parse(localStorage.getItem("optimistic-note-ids") || "[]");
    //   const isOptimisticNote = optimisticIds.includes(editorKey);
    //   const recentlyCreated = Date.now() - parseInt(localStorage.getItem(`note-created-${editorKey}`) || "0") < 30000;

    //   if (isOptimisticNote || recentlyCreated) {
    //     console.log("New note detected on editorKey change, resetting title");
    //     setEditorTitle("Untitled");
    //     setDocumentTitle("Untitled");
    //     setTitleIcon("");
    //     setPendingTitle("");
    //   }
    // }

    // Skip invalid editorKey values
    // if (!editorKey || editorKey === "notes" || editorKey === "undefined") {
    //   setInitialContent(defaultEditorContent);
    //   setTimeout(() => setIsLoading(false), 300);
    //   return;
    // }

    if (isNoteLoading) {
      setIsLoading(true);

      // Add a timeout to prevent infinite loading for new notes
      const loadingTimeout = setTimeout(() => {
        if (isNoteLoading) {
          console.log("Loading timeout reached, setting default content for potential new note");
          // const optimisticIds = JSON.parse(localStorage.getItem("optimistic-note-ids") || "[]");
          // const isOptimisticNote = optimisticIds.includes(editorKey);
          // const recentlyCreated = Date.now() - parseInt(localStorage.getItem(`note-created-${editorKey}`) || "0") < 30000;

          // if (isOptimisticNote || recentlyCreated) {
          //   setInitialContent(defaultEditorContent);
          //   setReadOnly(false);
          //   setIsLoading(false);

          //   // Set default title for new notes and clear any cached pending title
          //   setEditorTitle("Untitled");
          //   setDocumentTitle("Untitled");
          //   setTitleIcon("");
          //   setNoteType("original");
          //   setPendingTitle("");
          //   localStorage.removeItem(`pending-title-${editorKey}`);
          // }
        }
      }, 5000); // 5 second timeout

      return () => clearTimeout(loadingTimeout);
    }

    if (isNoteError && noteError) {
      // Create a unique error key to track if we've handled this specific error
      const errorKey = `${editorKey}-${noteError.message}`;

      // Skip if we've already handled this exact error
      if (handledErrorRef.current === errorKey) {
        return;
      }

      // Mark this error as handled
      handledErrorRef.current = errorKey;

      // Handle errors - for new notes, 404 is expected, so create default content
      if (noteError.message.includes("404") || noteError.message.includes("not found")) {
        // Check if this might be a new note by looking for optimistic IDs or recent creation
        // const optimisticIds = JSON.parse(localStorage.getItem("optimistic-note-ids") || "[]");
        // const isOptimisticNote = optimisticIds.includes(editorKey);

        // Also check if this is a recently created note (within last 30 seconds)
        // const recentlyCreated = Date.now() - parseInt(localStorage.getItem(`note-created-${editorKey}`) || "0") < 30000;

        // if (isOptimisticNote || recentlyCreated) {
        //   // This is a new note, set default content and allow editing
        //   console.log("New note detected (optimistic or recently created), setting default content");
        //   setInitialContent(defaultEditorContent);
        //   setReadOnly(false);
        //   setIsLoading(false);

        //   // Set default title for new notes and clear any cached pending title
        //   setEditorTitle("Untitled");
        //   setDocumentTitle("Untitled");
        //   setTitleIcon("");
        //   setNoteType("original");
        //   setPendingTitle("");
        //   localStorage.removeItem(`pending-title-${editorKey}`);

        //   return;
        // }

        window.localStorage.setItem(`404-error-${editorKey}`, "true");
        window.localStorage.removeItem(`readOnly-${editorKey}`);
        setNotFoundError({
          noteId: editorKey,
          message: "Note not found",
        });
      } else if (noteError.message.includes("403") || noteError.message.includes("access denied")) {
        window.localStorage.removeItem(`readOnly-${editorKey}`);
        setAccessError({
          message: "Access denied",
          status: 403,
          error: "NOT_AUTHORIZED",
          noteId: editorKey,
        });
      } else if (noteError.message.includes("Invalid note ID")) {
        window.localStorage.setItem(`404-error-${editorKey}`, "true");
        window.localStorage.removeItem(`readOnly-${editorKey}`);
        setNotFoundError({
          noteId: editorKey,
          message: "Note not found",
        });
      } else {
        window.localStorage.removeItem(`readOnly-${editorKey}`);
        setGenericError({
          status: 500,
          message: noteError.message,
          noteId: editorKey,
        });
      }
      setIsLoading(false);
      return;
    }

    if (noteQueryData) {
      // Process successful response
      const noteResponse = noteQueryData;
      console.log("..............[AdvancedEditor] Fetched note data:....................", noteResponse);

      const currentEditorBlock = globalBlocks.getBlock(editorKey);
      const noteType = currentEditorBlock?.value.pageType;
      const noteOwner = currentEditorBlock?.value.userEmail;

      const isOwner = user?.email === noteOwner;
      if (isOwner) {
        setReadOnly(false);
        console.log("..............[AdvancedEditor] User is owner of the note:....................", isOwner, noteOwner);
      } else if (noteType === 'restricted' && !isOwner) {
        setReadOnly(true);
        console.log("..............[AdvancedEditor] User is not owner of the note:....................", isOwner, noteOwner);
      } else {
        setReadOnly(false);
      }

      const isPublicNote = noteType === 'public' || noteType === 'restricted';
      if (isPublicNote) {
        setIsPublicNote(true);
      }

      // ✅ Upsert blocks into GlobalBlockContext
      if (noteResponse.blocks && Array.isArray(noteResponse.blocks)) {
        globalBlocks.upsertBlocks(noteResponse.blocks).then(() => {
          const parentBlock = globalBlocks.getBlock(editorKey);
          if (parentBlock && parentBlock.blockIds) {
            try {
              // so the parser can find them immediately.
              const freshMap = new Map(globalBlocks.blocks);
              noteResponse.blocks.forEach((b) => freshMap.set(b._id, b));

              const reconstructedDoc = reconstructDocumentFromBlocks(editorKey, freshMap);
              console.log('............[AdvancedEditor] Reconstructed document from blocks:', reconstructedDoc);

              if (reconstructedDoc && reconstructedDoc.type === 'doc') {
                setInitialContent(reconstructedDoc);
                prevContentRef.current = reconstructedDoc;
                console.log('............[AdvancedEditor] Initial content set to reconstructed document', reconstructedDoc, initialContent);
              } else {
                console.warn('................[AdvancedEditor] Invalid reconstructed document, using default');
                setInitialContent(defaultEditorContent);
              }
            } catch (error) {
              console.error('................[AdvancedEditor] Error reconstructing document from blocks:', error);
              setInitialContent(defaultEditorContent);
            }
          } else {
            console.warn('[AdvancedEditor] Parent block not found');
            setInitialContent(defaultEditorContent);
          }
        });
      } else {
        setInitialContent(defaultEditorContent);
      }

      // Set note metadata
      // setNoteOwnerMail(noteResponse.userEmail || "");
      // setPublishStatus(noteResponse.approvalStatus);
      // setApprovalStatus(noteResponse.approvalStatus);
      // setGithubRawUrl(noteResponse.githubRawUrl);
      // setIsPublish(noteResponse.isPublish);
      // setEditorTitle(noteResponse.title);
      // setDocumentTitle(noteResponse.title);
      // setTitleIcon(noteResponse.icon || "");
      // setIsPublicNote(noteResponse.isPublicNote || false);
      // setParentId(noteResponse.parentId || null);
      // setIsRestrictedPage(Boolean(noteResponse.isRestrictedPage));
      // setNoteType(noteResponse.noteType as string);
      // setSharedWith(noteResponse.sharedWith || []);
      // setIsCurrentNoitePublic(noteResponse.isPublicNote || false);
      // setCoverUrl(noteResponse.coverUrl || "");

      // Clear any cached 404 errors for this note
      window.localStorage.removeItem(`404-error-${editorKey}`);

      //take out all the comment id 
      getAllCommentsIds(noteResponse.blocks);
      // Check for shared status
      // if (noteResponse.sharedWith) {
      //   const userString = window.localStorage.getItem("auth_user");
      //   const user = userString ? JSON.parse(userString) : null;
      //   const email = user?.email;

      //   const sharedEntry = noteResponse.sharedWith.find(
      //     (entry: { email: string; access: string }) => entry.email === email,
      //   );
      //   if (sharedEntry) setIsSharedNote(true);

      //   // Check write access
      //   const userId = user?.id;
      //   const hasWriteAccess = checkUserWriteAccess(noteResponse, userId, email);

      //   if (!hasWriteAccess) {
      //     setReadOnly(true);
      //     // window.localStorage.setItem(`readOnly-${editorKey}`, "true");
      //   } else {
      //     setReadOnly(false);
      //     window.localStorage.setItem(`readOnly-${editorKey}`, "false");
      //   }
      // } else {
      //   // No shared data, assume user has write access for new notes
      //   setReadOnly(false);
      //   window.localStorage.setItem(`readOnly-${editorKey}`, "false");
      // }

      // if(initialSyncDone === true ) {
      //   setIsLoading(false)
      // };
    }
  }, [noteQueryData, isNoteLoading, isNoteError, noteError, editorKey]);



  useEffect(() => {
    // Reset signature when editorKey changes
    if (lastEditorKeyRef.current !== editorKey) {
      lastParsedBlocksRef.current = "";
      lastEditorKeyRef.current = editorKey;
      isUpdatingFromParserRef.current = false;
      if (parserDebounceTimerRef.current) {
        clearTimeout(parserDebounceTimerRef.current);
        parserDebounceTimerRef.current = null;
      }
      pendingSignatureRef.current = "";
      lastUserEditTimeRef.current = 0;
    }

    // Skip if we're currently updating from parser (prevent infinite loop)
    if (isUpdatingFromParserRef.current) {
      return;
    }

    // Skip if editor is not initialized or editorKey is invalid
    if (!editorRef.current || !editorKey || editorKey === "notes" || editorKey === "undefined") {
      return;
    }

    // Skip if note data is not loaded yet
    if (!noteQueryData) {
      return;
    }

    // Skip for review/published pages
    if (noteQueryData.noteType === 'review' || noteQueryData.noteType === 'approved') {
      return;
    }

    // Get the parent block to check its children
    const parentBlock = globalBlocks.getBlock(editorKey);
    if (!parentBlock || !parentBlock.blockIds) {
      return;
    }

    // Recursive helper to build signature for a block and all its children
    const getRecursiveSignature = (blockId: string, seenNodes: Set<string>): string => {
      // Prevent infinite loops just in case
      if (seenNodes.has(blockId)) return "";
      seenNodes.add(blockId);

      const block = globalBlocks.getBlock(blockId);
      if (!block) return "";

      const valueSig = JSON.stringify(block.value);
      const childIds = block.blockIds || [];
      const childSigs = childIds.length > 0
        ? `[${childIds.map(id => getRecursiveSignature(id, seenNodes)).join(",")}]`
        : "";

      return `${block._id}:${valueSig}${childSigs}`;
    };

    // Calculate signature starting from the root parent (the page)
    const seen = new Set<string>();
    const currentSignature = getRecursiveSignature(editorKey, seen);

    // Skip if blocks for this page haven't changed
    if (currentSignature === lastParsedBlocksRef.current) {
      return;
    }

    // Check if user is actively editing (within last 800ms)
    // Skip parser if user just made changes to prevent flickering
    const timeSinceLastEdit = Date.now() - lastUserEditTimeRef.current;
    if (timeSinceLastEdit < 800) {
      // User is actively editing, skip parser to prevent flickering
      // Update signature but don't parse yet
      pendingSignatureRef.current = currentSignature;
      return;
    }

    // Store pending signature
    pendingSignatureRef.current = currentSignature;

    // Clear existing debounce timer
    if (parserDebounceTimerRef.current) {
      clearTimeout(parserDebounceTimerRef.current);
    }

    // Small debounce (50ms) to batch rapid collaborative changes
    // Still feels instant but prevents multiple parser runs during fast remote typing
    parserDebounceTimerRef.current = setTimeout(() => {
      // Use requestAnimationFrame for smoother, instant-feeling updates
      requestAnimationFrame(() => {
        // Double-check signature hasn't changed
        const finalSignature = pendingSignatureRef.current;
        if (finalSignature === lastParsedBlocksRef.current) {
          return;
        }

        // Check again if user is actively editing
        const timeSinceLastEdit = Date.now() - lastUserEditTimeRef.current;
        if (timeSinceLastEdit < 800) {
          // User is still editing, skip parser
          return;
        }

        // Re-parse the document from blocks
        let reconstructedDoc: JSONContent | null = null;
        try {
          reconstructedDoc = reconstructDocumentFromBlocks(editorKey, globalBlocks.blocks);
        } catch (error) {
          console.error('[AdvancedEditor] Error re-parsing blocks:', error);
          return;
        }

        if (!reconstructedDoc || reconstructedDoc.type !== 'doc') {
          return;
        }

        // Get current editor content
        const currentEditorContent = editorRef.current?.getJSON();
        if (!currentEditorContent) return;

        // Normalize both for comparison (remove blockId attributes which can differ)
        const normalizeContent = (doc: JSONContent): JSONContent => {
          if (!doc || typeof doc !== 'object') return doc;
          const normalized = { ...doc };
          if (normalized.attrs?.blockId) {
            normalized.attrs = { ...normalized.attrs };
            delete normalized.attrs.blockId;
          }
          if (normalized.content && Array.isArray(normalized.content)) {
            normalized.content = normalized.content.map(normalizeContent);
          }
          return normalized;
        };

        const normalizedCurrent = normalizeContent(currentEditorContent);
        const normalizedReconstructed = normalizeContent(reconstructedDoc);

        // Compare: if they're the same, don't update (blocks already match editor)
        if (JSON.stringify(normalizedCurrent) === JSON.stringify(normalizedReconstructed)) {
          console.log('[AdvancedEditor] Blocks match editor content, skipping update');
          lastParsedBlocksRef.current = finalSignature;
          return;
        }

        // They're different - this means blocks changed externally
        console.log('[AdvancedEditor] Blocks differ from editor, updating editor');

        // Set flag to prevent re-parsing when setContent triggers block updates
        isUpdatingFromParserRef.current = true;

        // Update editor content using transaction with fromParser meta to prevent API calls
        // Use queueMicrotask to avoid React flushSync error during render
        queueMicrotask(() => {
          if (!editorRef.current) return;

          const { state, view } = editorRef.current;
          const { selection } = state; // Capture current selection

          // 1. Capture current block ID and offset for robust restoration
          let currentBlockId: string | null = null;
          let offsetInBlock = 0;
          const $from = selection.$from;
          for (let d = $from.depth; d >= 0; d--) {
            const node = $from.node(d);
            if (node.attrs?.blockId) {
              currentBlockId = node.attrs.blockId;
              offsetInBlock = $from.pos - $from.before(d);
              break;
            }
          }

          const tr = state.tr;
          tr.setMeta('fromParser', true); // Critical: prevents BlockIdAndChangeTrackerExtension from triggering
          const content = state.schema.nodeFromJSON(reconstructedDoc);
          tr.replaceWith(0, state.doc.content.size, content.content);

          // 2. Restore selection using blockId and offset
          // This is much more robust than mapping when the entire doc is replaced
          if (currentBlockId) {
            let foundPos = -1;
            tr.doc.descendants((node, pos) => {
              if (node.attrs?.blockId === currentBlockId) {
                foundPos = pos;
                return false;
              }
              return true;
            });

            if (foundPos !== -1) {
              try {
                // Ensure targetPos is within valid document bounds
                const targetPos = Math.min(foundPos + offsetInBlock, tr.doc.content.size);
                const resolvedPos = tr.doc.resolve(targetPos);
                tr.setSelection(TextSelection.near(resolvedPos));
              } catch (e) {
                console.warn('[AdvancedEditor] Failed to restore selection by blockId:', e);
              }
            }
          }

          view.dispatch(tr);
          setInitialContent(reconstructedDoc);
          prevContentRef.current = reconstructedDoc;

          // Update signature
          lastParsedBlocksRef.current = finalSignature;

          // Reset flag after a delay to allow block updates to settle
          setTimeout(() => {
            isUpdatingFromParserRef.current = false;
          }, 150);
        });
      });
    }, 50);

  }, [editorKey, noteQueryData, globalBlocks.blocks, globalBlocks]);

  useEffect(() => {
    const handleOpenComment = ({ pos, node }: { pos: number, node: any }) => {
      console.log("Received open-comment event", pos, node);
      if (editorRef.current) {
        // Calculate the anchor position from the node's DOM element
        try {
          // The pos from the event is the start position of the node
          // We can use nodeDOM to get the element
          const domNode = editorRef.current.view.nodeDOM(pos) as HTMLElement;
          if (domNode) {
            const rect = domNode.getBoundingClientRect();
            setCommentAnchorRect(rect);
          } else {
            console.warn("Could not find DOM node for comment anchor at pos", pos);
          }
        } catch (e) {
          console.error("Error calculating comment anchor position:", e);
        }

        setTimeout(() => {
          setOpenComment(true);
        }, 50);
      }
    };

    eventBus.on("open-comment", handleOpenComment);

    return () => {
      eventBus.off("open-comment", handleOpenComment);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (parserDebounceTimerRef.current) {
        clearTimeout(parserDebounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Skip invalid editorKey values to prevent unnecessary API calls
    if (!editorKey) {
      setInitialContent(defaultEditorContent);
      setTimeout(() => setIsLoading(false), 300);
      return;
    }

    // For review/published pages, completely skip this useEffect
    // if (noteQueryData && (noteQueryData.noteType === 'review' || noteQueryData.noteType === 'approved')) {
    //   console.log("Review/published page - completely skipping localStorage useEffect");
    //   return;
    // }

    // If we don't have noteQueryData yet, wait for it
    if (!noteQueryData) {
      return;
    }

    // Check for optimistic notes, but don't return early
    // This allows title updates to work while still using local content
    // const optimisticIds = JSON.parse(localStorage.getItem("optimistic-note-ids") || "[]");
    // const isOptimisticNote = optimisticIds.includes(editorKey);

    // if (isOptimisticNote) {
    //   console.log("Using local content for optimistic note, but allowing API calls for metadata");

    //   try {
    //     const local = window.localStorage.getItem(`novel-content-${editorKey}`);
    //     if (local) {
    //       const parsed = JSON.parse(local);
    //       setInitialContent(parsed);
    //       setReadOnly(false);
    //       prevContentRef.current = parsed;

    //       // Mark content as loaded to prevent unnecessary API calls for content
    //       window.localStorage.setItem(`content-loaded-${editorKey}`, "true");
    //       setIsLoading(false);

    //       // But still allow API calls for metadata (like title updates)
    //       // by continuing with the rest of the function
    //     } else {
    //       setInitialContent(defaultEditorContent);
    //       setReadOnly(false);
    //       setIsLoading(false);
    //     }
    //   } catch (err) {
    //     console.error("Failed to load optimistic content", err);
    //     setInitialContent(defaultEditorContent);
    //     setReadOnly(false);
    //     setIsLoading(false);
    //   }

    //   return;
    // }

    isDirtyRef.current = false;

    setIsLoading(true);
    setAccessError(null);
    setNotFoundError(null);
    setGenericError(null);

    // Check if we have a very recent API call (within last 2 seconds)
    // This helps prevent multiple calls during page refresh
    // const lastApiCheck = JSON.parse(window.localStorage.getItem(`last-api-check-${editorKey}`) || "0");
    // const THROTTLE_DURATION = 1000; // 1 second - reduced to make it less aggressive

    // Only apply throttling if we already have content loaded
    // const hasLoadedContent = window.localStorage.getItem(`content-loaded-${editorKey}`);

    // if (Date.now() - lastApiCheck < THROTTLE_DURATION && hasLoadedContent) {
    //   console.log("Throttling API call - using cached data");
    //   try {
    //     const raw = window.localStorage.getItem(`novel-content-${editorKey}`);
    //     if (raw && raw !== "undefined" && raw !== "null") {
    //       const offline_content = JSON.parse(raw);
    //       setInitialContent(offline_content);
    //       prevContentRef.current = offline_content;

    //       // if(initialSyncDone === true ) {
    //       //   setIsLoading(false)
    //       // };
    //       return;
    //     }
    //   } catch (e) {
    //     console.error("Error parsing cached content:", e);
    //   }
    // }

    // Store current timestamp for throttling
    // window.localStorage.setItem(`last-api-check-${editorKey}`, JSON.stringify(Date.now()));

    // let offline_content = null;
    // try {
    //   const raw = window.localStorage.getItem(`novel-content-${editorKey}`);
    //   if (raw && raw !== "undefined" && raw !== "null") {
    //     offline_content = JSON.parse(raw);
    //     prevContentRef.current = offline_content;
    //   }
    // } catch (e) {
    //   console.error("Invalid JSON in localStorage for", editorKey, e);
    //   offline_content = null;
    // }

    // let lastUpdateTimeOfflineRaw = window.localStorage.getItem(`last_content_update_time-${editorKey}`);
    // if (!lastUpdateTimeOfflineRaw || lastUpdateTimeOfflineRaw === "undefined" || lastUpdateTimeOfflineRaw === "null") {
    //   lastUpdateTimeOfflineRaw = null;
    // }
    // const lastUpadteTimeOffline = lastUpdateTimeOfflineRaw ? JSON.parse(lastUpdateTimeOfflineRaw) : null;

    //check for content in local storage and getALLContent
    // if (!offline_content || offline_content === undefined) {
    //   console.log("No local content - checking if this is a new note");

    //   // Check if this might be a new note that doesn't exist yet
    //   const optimisticIds = JSON.parse(localStorage.getItem("optimistic-note-ids") || "[]");
    //   const isOptimisticNote = optimisticIds.includes(editorKey);

    //   // Also check if this is a recently created note (within last 30 seconds)
    //   const recentlyCreated = Date.now() - parseInt(localStorage.getItem(`note-created-${editorKey}`) || "0") < 30000;

    //   if (isOptimisticNote || recentlyCreated) {
    //     console.log("New note detected in localStorage check, setting default content");
    //     setInitialContent(defaultEditorContent);
    //     setReadOnly(false);
    //     setIsLoading(false);

    //     // Set default title for new notes and clear any cached pending title
    //     setEditorTitle("Untitled");
    //     setDocumentTitle("Untitled");
    //     setTitleIcon("");
    //     setNoteType("original");
    //     setPendingTitle("");
    //     localStorage.removeItem(`pending-title-${editorKey}`);

    //     return;
    //   }

    //   console.log("Fetching from server with React Query");
    //   // React Query will handle this via the useEffect that watches noteQueryData
    //   return;
    // }

    //call the api if the content is present locally for getting last updated time of content
    getWithAuth<{ blocks: Block[], blockIds: string[], fetchTime: string }>(`/api/note/block/get-all-block/${editorKey}`, {
      headers: {
        "include-content": "false",
        "content-path": "",
      },
    })
      .then((response) => {
        // Check if response is an error
        if ("isError" in response && response.isError) {
          if (response.status === 404) {
            // Cache the 404 error to prevent future API calls
            window.localStorage.setItem(`404-error-${editorKey}`, "true");
            window.localStorage.removeItem(`readOnly-${editorKey}`); // Clear cached access state
            setNotFoundError({
              noteId: editorKey,
              message: response.message || "Note not found",
            });
          } else if (response.status === 403) {
            window.localStorage.removeItem(`readOnly-${editorKey}`); // Clear cached access state
            setAccessError({
              message: response.message || "Access denied",
              status: 403,
              error: "NOT_AUTHORIZED",
              noteId: editorKey,
              noteTitle: undefined,
            });
          } else {
            // Handle other errors (500, network errors, etc.)
            window.localStorage.removeItem(`readOnly-${editorKey}`); // Clear cached access state
            setGenericError({
              status: response.status || 500,
              message: response.message || "An error occurred",
              noteId: editorKey,
            });
          }
          return;
        }

        const noteResponse = response as { blocks: Block[], blockIds: string[], fetchTime: string };

        if (noteResponse.blocks && Array.isArray(noteResponse.blocks)) {
          globalBlocks.upsertBlocks(noteResponse.blocks);
        }


        const currentEditorBlock = globalBlocks.getBlock(editorKey);
        const noteType = currentEditorBlock?.value.pageType;
        const noteOwner = currentEditorBlock?.value.userEmail;

        const isOwner = user?.email === noteOwner;
        if (isOwner) {
          setReadOnly(false);
          console.log("..............[AdvancedEditor] User is owner of the note:....................", isOwner, noteOwner);
        } else if (noteType === 'restricted' && !isOwner) {
          setReadOnly(true);
          console.log("..............[AdvancedEditor] User is not owner of the note:....................", isOwner, noteOwner);
        }

        //check if the note is public
        const isPublicNote = currentEditorBlock?.value.pageType === 'public'
          || currentEditorBlock?.value.pageType === 'restricted';
        if (isPublicNote) {
          setIsPublicNote(true);
          console.log("..............[AdvancedEditor] User is not owner of the note:....................", isOwner, noteOwner);
        }


        // const lastUpdateTimeOnline = noteResponseForTime?.updatedAt;
        // const commitSha = noteResponseForTime?.commitsha as string;
        // const commitPath = noteResponseForTime.commitPath as string;

        // Empty the invites for this note
        setInvites([]);

        // if (lastUpadteTimeOffline < lastUpdateTimeOnline) {
        //   console.log("Content outdated - fetching latest from server with React Query");
        //   // Use React Query to refetch with content included
        //   refetchNote();
        //   return;
        // }


        console.log("Using cached content - no changes detected");
        // if (offline_content) {
        //   setInitialContent(offline_content as JSONContent);
        // } else {
        //   setInitialContent(defaultEditorContent);
        // }
        // Mark content as loaded
        window.localStorage.setItem(`content-loaded-${editorKey}`, "true");

        //take out all the comment id 
        getAllCommentsIds(noteResponse.blocks);

        // Type guard to ensure we have a valid NoteResponse
        // const noteResponse = response as NoteResponse;
        // const approvalStatus = noteResponse?.approvalStatus;
        // const isPublished = noteResponse?.isPublish;
        // const noteUserEmail = noteResponse?.userEmail as string;
        // const title = noteResponse?.title;
        // const icon = noteResponse?.icon as string;
        // const is_publicNote = noteResponse?.isPublicNote as boolean;
        // const parentId = noteResponse?.parentId || null;
        // const isRestrictedPage = noteResponse?.isRestrictedPage;
        // const noteType = noteResponse?.noteType as string;
        // const coverUrl = noteResponse?.coverUrl as string;
        // setNoteOwnerMail(noteUserEmail);
        // setPublishStatus(approvalStatus);
        // setApprovalStatus(approvalStatus);
        // setGithubRawUrl(noteResponse.githubRawUrl);
        // setIsPublish(isPublished);
        // setEditorTitle(title);
        // setDocumentTitle(title);
        // setTitleIcon(icon);
        // setIsPublicNote(is_publicNote);
        // setIsCurrentNoitePublic(is_publicNote)
        // setParentId(parentId);
        // setIsRestrictedPage(isRestrictedPage as boolean);
        // setNoteType(noteType);
        // setCoverUrl(coverUrl);
        // Get user info first to check access for all notes (including those without content)
        // const userString = window.localStorage.getItem("auth_user");
        // const user = userString ? JSON.parse(userString) : null;
        // const email = user?.email;
        // const userId = user?.id;

        // if (noteResponse?.sharedWith) {
        //   const sharedEntry = noteResponse.sharedWith.find(
        //     (entry: { email: string; access: string }) => entry.email === email,
        //   );
        //   if (sharedEntry) setIsSharedNote(true);
        // }

        // Check if user has write access to this note (regardless of content)
        // const hasWriteAccess = checkUserWriteAccess(noteResponse, userId, email);

        // if (!hasWriteAccess) {
        //   setReadOnly(true);
        //   window.localStorage.setItem(`readOnly-${editorKey}`, "true");
        // } else {
        //   setReadOnly(false);
        //   window.localStorage.setItem(`readOnly-${editorKey}`, "false");
        // }

        // set the editor content in useRef
        // if (prevEditorKey.current !== editorKey) {
        //   prevContentRef.current = offline_content;
        // }

        // prevEditorKey.current = editorKey;

        // if(initialSyncDone === true ) {
        //   setIsLoading(false)
        // };        
        // return;
      })
      .catch((error) => {
        setIsLoading(false);
        console.error("Error in fetching Last Upadted Online time ", error);
      });

    // Cleanup function
    return () => {
      // React Query handles request cancellation
      // Clear cached readOnly state when editorKey changes to prevent stale cache
      window.localStorage.removeItem(`readOnly-${editorKey}`);
    };
  }, [editorKey]);

  // Effect to handle share modal
  useEffect(() => {
    if (shareNoteId) {
      setShowModal(true);
    }
  }, [shareNoteId]);

  // Auto-reconstruct document when blocks change in context
  // useEffect(() => {
  //   if (!editorKey || !editorInstance || !globalBlocks) return;

  //   const parentBlock = globalBlocks.getBlock(editorKey);
  //   if (!parentBlock || !parentBlock.blockIds || parentBlock.blockIds.length === 0) {
  //     return;
  //   }

  //   // Get blocks from context
  //   const blocksArray = parentBlock.blockIds
  //     .map(id => globalBlocks.getBlock(id))
  //     .filter((b): b is Block => b !== undefined);

  //   if (blocksArray.length === 0) return;

  //   try {
  //     const reconstructedDoc = reconstructDocumentFromBlocks(editorKey, globalBlocks.blocks);

  //     console.log('[AdvancedEditor] Auto-reconstructed from context changes');

  //     if (reconstructedDoc && reconstructedDoc.type === 'doc') {
  //       // Update editor content
  //       editorInstance.commands.setContent(reconstructedDoc, false);
  //     }
  //   } catch (error) {
  //     console.error('[AdvancedEditor] Error auto-reconstructing:', error);
  //   }
  // }, [globalBlocks.blocks, editorKey, editorInstance]);

  // useEffect(() => {
  //   const pendingTitleObj = localStorage.getItem(`pending-title-${editorKey}`);
  //   if (pendingTitleObj) {
  //     try {
  //       const parsed = JSON.parse(pendingTitleObj);
  //       setPendingTitle(parsed.newTitle || "");
  //     } catch {
  //       setPendingTitle("");
  //     }
  //   } else {
  //     setPendingTitle("");
  //   }
  // }, [editorKey]);

  // useEffect(() => {
  //   setShowModal(false);
  //   setInvites([]);
  //   try {
  //     const rootNodesRaw = localStorage.getItem("rootNodes");
  //     if (rootNodesRaw) {
  //       const rootNodes = JSON.parse(rootNodesRaw);
  //       setRootNodes(rootNodes);
  //     }
  //   } catch (localErr) {
  //     console.error("Failed to update localStorage title on blur:", localErr);
  //   }

  // }, []);

  // Update editor's editable state when readOnly or isPreview changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setEditable(!effectiveReadOnly && !showCommitHistory);
    }
  }, [effectiveReadOnly, showCommitHistory]);

  // useEffect(() => {
  //   if (!initialContent) return;
  //   // Wait until the content is rendered or stable
  //   const timeout = setTimeout(() => {
  //     console.log("The Content is Ready ==++++> ", initialContent);
  //     const ids = extractCommentIds(initialContent);
  //     console.log("Printing the comment Id's --++++>", ids);
  //     console.log("calling the comment api by id =====+++>")
  //     fetchCommentsBatch(ids);
  //   }, 300); // small delay to ensure content mounted

  //   return () => clearTimeout(timeout);
  // }, [initialContent, editorKey]);

  // Sync explicitly with the TipTap editor when the initialContent changes 
  // (e.g. going back to a page, reconstructing from cache)
  useEffect(() => {
    if (editorRef.current && initialContent) {
      if (!editorRef.current.isDestroyed) {
        editorRef.current.commands.setContent(initialContent, false);
      }
    }
  }, [editorKey, initialContent]);

  useEffect(() => {
    const handleThreadDeleted = (threadId: string) => {
      console.log("[AdvancedEditor] Received comment-thread-deleted event for:", threadId);
      if (!editorRef.current) {
        console.log("[AdvancedEditor] editorRef.current is null, cannot remove highlight.");
        return;
      }

      const { state } = editorRef.current;
      const { doc } = state;

      let tr = state.tr;
      let foundCount = 0;

      doc.descendants((node, pos) => {
        node.marks.forEach(mark => {
          if (mark.type.name === 'commentMark' && mark.attrs.commentId === threadId) {
            console.log("[AdvancedEditor] Found matching mark at pos:", pos, "size:", node.nodeSize);
            tr = tr.removeMark(pos, pos + node.nodeSize, mark.type);
            foundCount++;
          }
        });
      });

      if (foundCount > 0) {
        console.log("[AdvancedEditor] Dispatching transaction to remove", foundCount, "mark instances.");
        editorRef.current.view.dispatch(tr);
      } else {
        console.log("[AdvancedEditor] No matching comment marks found in document for:", threadId);
      }
    };

    eventBus.on("comment-thread-deleted", handleThreadDeleted);
    return () => {
      eventBus.off("comment-thread-deleted", handleThreadDeleted);
    };
  }, []);


  useEffect(() => {
    function handleResize() {
      if (aiSelectorOpen && isSlashCommandAIOpen && editorRef.current) {
        // recalculate position
        const selection = editorRef.current.view.state.selection;
        const coords = editorRef.current.view.coordsAtPos(selection.from);
        const editorContainer = editorRef.current.options.element;
        const editorRect = editorContainer.getBoundingClientRect();
        let left = coords.left - editorRect.left + 10;
        const top = coords.bottom - editorRect.top + 200;
        const aiSelectorWidth = Math.min(400, window.innerWidth * 0.9);
        const maxLeft = Math.min(editorRect.width, window.innerWidth) - aiSelectorWidth - 20;
        if (left > maxLeft) left = maxLeft;
        if (left < 10) left = 10;
        setAISelectorPosition({ left, top });
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [aiSelectorOpen, isSlashCommandAIOpen]);

  // Listen for event to remove page block from editor when dragged to sidebar
  // useEffect(() => {
  //   const handleRemovePageBlock = (event: CustomEvent) => {
  //     const { pageId, sourceParentId } = event.detail;

  //     // Only remove if this editor is the source parent
  //     if (sourceParentId !== editorKey || !editorRef.current) return;

  //     // Find and remove the page block from the editor
  //     const { state } = editorRef.current;
  //     let found = false;
  //     let posToDelete: { from: number; to: number } | null = null;

  //     state.doc.descendants((node, pos) => {
  //       if (found) return false; // Stop searching after first match

  //       if (node.type.name === "page" && node.attrs.href === `/notes/${pageId}`) {
  //         posToDelete = { from: pos, to: pos + node.nodeSize };
  //         found = true;
  //         return false;
  //       }
  //     });

  //     if (posToDelete) {
  //       editorRef.current
  //         .chain()
  //         .focus()
  //         .deleteRange(posToDelete)
  //         .run();
  //     }
  //   };

  //   window.addEventListener("remove-page-block-from-editor", handleRemovePageBlock as EventListener);

  //   return () => {
  //     window.removeEventListener("remove-page-block-from-editor", handleRemovePageBlock as EventListener);
  //   };
  // }, [editorKey]);

  // If there's a not found error, show the not found page
  if (notFoundError) {
    return <NotFoundPage noteId={notFoundError.noteId} message={notFoundError.message} />;
  }

  // If there's a generic error, show the error page
  if (genericError) {
    return (
      <ErrorPage
        errorCode={genericError.status}
        message={genericError.message}
        errorId={genericError.noteId}
        showRetry={true}
        onRetry={() => {
          setGenericError(null);
          window.location.reload();
        }}
      />
    );
  }

  // If there's an access error, show the no access message
  if (accessError) {
    return (
      <NoAccessMessage noteId={accessError.noteId} noteTitle={accessError.noteTitle} message={accessError.message} />
    );
  }

  // Drag and Drop handlers for accepting pages from sidebar
  const handleEditorDragOver = (e: React.DragEvent) => {
    // Check if dragging a page from sidebar
    const draggedData = e.dataTransfer.types.includes("text/plain");
    if (draggedData && !e.dataTransfer.types.includes("application/page-block-from-editor")) {
      e.preventDefault(); // Allow drop here
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";  // Show move cursor
      setIsEditorDragOver(true);
    }
  };

  const handleEditorDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditorDragOver(false);
  };

  const handleEditorDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditorDragOver(false);

    // Check if this is from editor (if so, let tiptap's default handler deal with it)
    if (e.dataTransfer.types.includes("application/page-block-from-editor")) {
      return;
    }

    // Get the dragged page ID
    const draggedNodeId = e.dataTransfer.getData("text/plain");
    if (!draggedNodeId || !editorRef.current) return;

    // Check if this is from board
    const isFromBoard = e.dataTransfer.types.includes("application/x-board-note");

    // Check if this is from calendar
    const isFromCalendar = e.dataTransfer.types.includes("application/x-calendar-note");

    // Get the dragged block and current editor block
    const draggedBlock = globalBlocks.getBlock(draggedNodeId);
    const editorBlock = globalBlocks.getBlock(editorKey);

    if (!draggedBlock || !editorBlock) {
      // toast.error("Failed to move page: block not found");
      return;
    }
    // Prevent dropping a page onto itself
    if (draggedNodeId === editorKey) {
      toast.error("Cannot move a page into itself");
      return;
    }

    // Prevent circular reference (check if editorKey is a descendant of draggedNodeId)
    let currentBlock: Block | undefined = editorBlock;
    while (currentBlock && currentBlock.parentId) {
      if (currentBlock.parentId === draggedNodeId) {
        toast.error("Cannot move a page into its own child");
        return;
      }
      currentBlock = globalBlocks.getBlock(currentBlock.parentId);
    }

    // Get cursor position in editor
    const pos = editorRef.current.view.posAtCoords({
      left: e.clientX,
      top: e.clientY,
    });

    if (pos) {
      // --- Handle Board → Editor Drop ---
      if (isFromBoard && dragSource === "board") {
        console.log("Handling board → editor drop:", draggedNodeId);

        try {
          const boardDataStr = e.dataTransfer.getData("application/x-board-note");
          const boardData = JSON.parse(boardDataStr);
          const { dataSourceId, sourceBlockIds } = boardData;

          // Calculate the updated source blockIds (remove the dragged note)
          const updatedSourceBlockIds = (sourceBlockIds || []).filter((id: string) => id !== draggedNodeId);

          // update the dataSource 
          const currentDataSource = getDataSource(dataSourceId);
          if (currentDataSource) {
            const updatedDataSource = {
              ...currentDataSource,
              blockIds: updatedSourceBlockIds
            }
            setDataSource(dataSourceId, updatedDataSource)
          }

          // --- CALCULATION OF PRECISE DROP TARGET AND INDEX ---
          let destParentId = editorKey;
          let insertionIndex = -1;

          if (pos && editorRef.current) {
            const state = editorRef.current.view.state;
            const $pos = state.doc.resolve(pos.pos);

            for (let depth = $pos.depth; depth >= 0; depth--) {
              if (depth === 0) {
                destParentId = editorKey;
                insertionIndex = $pos.index(0);
                break;
              }

              const node = $pos.node(depth);
              if (node.attrs && node.attrs.blockId) {
                destParentId = node.attrs.blockId;
                insertionIndex = $pos.index(depth);
                break;
              }
            }
          }

          let freshDestBlock = globalBlocks.getBlock(destParentId);
          let destPageValue = freshDestBlock?.value as any;
          let destPageType = destPageValue?.pageType;

          // If the resolved destination block is not a valid page container (e.g., an empty text block),
          // fallback to the actual editor document page as the parent.
          if (!destPageType) {
            console.log("Fallback to editor document root since target block has no pageType", destParentId);

            // Try to figure out where this invalid target block sits inside the editor document,
            // so we can insert the page directly beneath it instead of at the end.
            const editorRootBlock = globalBlocks.getBlock(editorKey);
            const editorChildren = editorRootBlock?.blockIds || [];
            const indexInRoot = editorChildren.indexOf(destParentId);

            destParentId = editorKey;
            freshDestBlock = editorRootBlock;
            destPageValue = freshDestBlock?.value as any;
            destPageType = destPageValue?.pageType;

            // If we found the text block in the root, insert right after it. Otherwise, end of document (-1).
            insertionIndex = indexInRoot !== -1 ? indexInRoot + 1 : -1;
          }

          const currentDestChildren = freshDestBlock?.blockIds || [];
          let newDestBlockIds = [...currentDestChildren];
          if (!newDestBlockIds.includes(draggedNodeId)) {
            if (insertionIndex !== -1 && insertionIndex <= newDestBlockIds.length) {
              newDestBlockIds.splice(insertionIndex, 0, draggedNodeId);
            } else {
              newDestBlockIds.push(draggedNodeId);
            }
          }

          // // Create the page block content for editor
          // const pageBlockContent = {
          //   type: "page",
          //   attrs: {
          //     href: `/notes/${draggedNodeId}`,
          //     title: (draggedBlock.value as any)?.title || "Untitled",
          //     icon: (draggedBlock.value as any)?.icon || "",
          //     blockId: draggedNodeId
          //   },
          // };

          // // Insert page block into editor
          // editorRef.current
          //   .chain()
          //   .focus()
          //   .insertContentAt(pos.pos, pageBlockContent)
          //   .run();

          // Update dragged block to new parent
          const updatedDraggedBlock: Block = {
            ...draggedBlock,
            parentId: destParentId,
            parentType: "page",
            value: {
              ...draggedBlock.value,
              pageType: "page",
            },
          };
          globalBlocks.upsertBlocks([updatedDraggedBlock]);

          // Update destination editor's blockIds
          globalBlocks.upsertBlocks([{ ...freshDestBlock!, blockIds: newDestBlockIds }]);

          clearDragState();
          // Call API to persist changes (remove from board, add to editor)
          const response = await postWithAuth("/api/note/block/drag-and-drop", {
            dragAndDropinputfieldArray: [
              {
                parentId: dataSourceId,
                workspaceId: currentWorkspace?._id,
                blockIdArray: updatedSourceBlockIds,
                typeofChild: "page"
              },
              {
                parentId: destParentId,
                workspaceId: currentWorkspace?._id,
                blockIdArray: newDestBlockIds,
                typeofChild: "page",
              }
            ],
            updatedBlockInfo: {
              blockId: draggedNodeId,
              parentType: "page",
              parentId: destParentId,
              pageType: destPageType,
            },
          });

          if ("error" in response) {
            console.error("Error moving page from board to editor:", response.error);
            toast.error("Failed to move page");
          } else {
            toast.success("Page moved to editor");
          }
        } catch (err) {
          console.error("Failed to move page from board to editor:", err);
          toast.error("Failed to move page");
        }
        return;
      }

      // --- Handle Calendar → Editor Drop ---
      if (isFromCalendar && dragSource === "calendar") {
        console.log("Handling calendar → editor drop:", draggedNodeId);

        try {
          const calendarDataStr = e.dataTransfer.getData("application/x-calendar-note");
          const calendarData = JSON.parse(calendarDataStr);
          const { dataSourceId, sourceBlockIds } = calendarData;

          // Calculate the updated source blockIds (remove the dragged note)
          const updatedSourceBlockIds = (sourceBlockIds || []).filter((id: string) => id !== draggedNodeId);

          // Update the dataSource
          const currentDataSource = getDataSource(dataSourceId);
          if (currentDataSource) {
            const updatedDataSource = {
              ...currentDataSource,
              blockIds: updatedSourceBlockIds
            }
            setDataSource(dataSourceId, updatedDataSource)
          }

          // --- CALCULATION OF PRECISE DROP TARGET AND INDEX ---
          let destParentId = editorKey;
          let insertionIndex = -1;

          if (pos && editorRef.current) {
            const state = editorRef.current.view.state;
            const $pos = state.doc.resolve(pos.pos);

            for (let depth = $pos.depth; depth >= 0; depth--) {
              if (depth === 0) {
                destParentId = editorKey;
                insertionIndex = $pos.index(0);
                break;
              }

              const node = $pos.node(depth);
              if (node.attrs && node.attrs.blockId) {
                destParentId = node.attrs.blockId;
                insertionIndex = $pos.index(depth);
                break;
              }
            }
          }

          let freshDestBlock = globalBlocks.getBlock(destParentId);
          let destPageValue = freshDestBlock?.value as any;
          let destPageType = destPageValue?.pageType;

          if (!destPageType) {
            console.log("Fallback to editor document root since target block has no pageType", destParentId);
            const editorRootBlock = globalBlocks.getBlock(editorKey);
            const editorChildren = editorRootBlock?.blockIds || [];
            const indexInRoot = editorChildren.indexOf(destParentId);

            destParentId = editorKey;
            freshDestBlock = editorRootBlock;
            destPageValue = freshDestBlock?.value as any;
            destPageType = destPageValue?.pageType;

            insertionIndex = indexInRoot !== -1 ? indexInRoot + 1 : -1;
          }

          const currentDestChildren = freshDestBlock?.blockIds || [];

          let newDestBlockIds = [...currentDestChildren];
          if (!newDestBlockIds.includes(draggedNodeId)) {
            if (insertionIndex !== -1 && insertionIndex <= newDestBlockIds.length) {
              newDestBlockIds.splice(insertionIndex, 0, draggedNodeId);
            } else {
              newDestBlockIds.push(draggedNodeId);
            }
          }

          // // Create the page block content for editor
          // const pageBlockContent = {
          //   type: "page",
          //   attrs: {
          //     href: `/notes/${draggedNodeId}`,
          //     title: (draggedBlock.value as any)?.title || "Untitled",
          //     icon: (draggedBlock.value as any)?.icon || "",
          //     blockId: draggedNodeId
          //   },
          // };

          // // Insert page block into editor
          // editorRef.current
          //   .chain()
          //   .focus()
          //   .insertContentAt(pos.pos, pageBlockContent)
          //   .run();

          // Update dragged block to new parent
          const updatedDraggedBlock: Block = {
            ...draggedBlock,
            parentId: destParentId,
            parentType: "page",
            value: {
              ...draggedBlock.value,
              pageType: "page",
            },
          };
          globalBlocks.upsertBlocks([updatedDraggedBlock]);

          // Update destination editor's blockIds
          globalBlocks.upsertBlocks([{ ...freshDestBlock!, blockIds: newDestBlockIds }]);

          clearDragState();
          // Call API to persist changes (remove from calendar, add to editor)
          const response = await postWithAuth("/api/note/block/drag-and-drop", {
            dragAndDropinputfieldArray: [
              {
                parentId: dataSourceId,
                workspaceId: currentWorkspace?._id,
                blockIdArray: updatedSourceBlockIds,
                typeofChild: "page"
              },
              {
                parentId: destParentId,
                workspaceId: currentWorkspace?._id,
                blockIdArray: newDestBlockIds,
                typeofChild: "page",
              }
            ],
            updatedBlockInfo: {
              blockId: draggedNodeId,
              parentType: "page",
              parentId: destParentId,
              pageType: destPageType,
            },
          });

          if ("error" in response) {
            console.error("Error moving page from calendar to editor:", response.error);
            toast.error("Failed to move page");
          } else {
            toast.success("Page moved to editor");
          }
        } catch (err) {
          console.error("Failed to move page from calendar to editor:", err);
          toast.error("Failed to move page");
        }
        return;
      }

      // --- Handle Sidebar → Editor Drop ---
      // Insert page block at cursor position
      // const pageBlockContent = {
      //   type: "page",
      //   attrs: {
      //     href: `/notes/${draggedNodeId}`,
      //     title: (draggedBlock.value as any)?.title || "Untitled",
      //     icon: (draggedBlock.value as any)?.icon || "",
      //     blockId: draggedNodeId
      //   },
      // };

      // editorRef.current
      //   .chain()
      //   .focus()
      //   .insertContentAt(pos.pos, pageBlockContent)
      //   .run();

      // Now update the backend relationships
      try {
        const sourceParentId = draggedBlock.parentId;
        const sourceIsRoot = !sourceParentId || sourceParentId === currentWorkspace?._id;

        // --- CALCULATION OF PRECISE DROP TARGET AND INDEX ---
        let destParentId = editorKey;
        let insertionIndex = -1;

        if (pos && editorRef.current) {
          const state = editorRef.current.view.state;
          const $pos = state.doc.resolve(pos.pos);

          console.log("Printing the $pos", $pos);
          // Walk up from the deepest hovered node to find the first valid container (has a blockId)
          for (let depth = $pos.depth; depth >= 0; depth--) {
            if (depth === 0) {
              // We've reached the root of the editor document
              destParentId = editorKey;
              insertionIndex = $pos.index(0);
              break;
            }
            const node = $pos.node(depth);
            console.log("Printing the depth", depth, node);
            // Tiptap nodes often store the blockId in their attrs.
            if (node.attrs && node.attrs.blockId) {
              destParentId = node.attrs.blockId;
              insertionIndex = $pos.index(depth);
              break;
            }
          }
        }

        // If source is root, remove from root pages order context
        if (sourceIsRoot) {
          console.log("Removing page from root context:", draggedNodeId);
          removePage(draggedNodeId);
        }

        // Update dragged block's parent with the newly precise parent ID
        const updatedDraggedBlock = {
          ...draggedBlock,
          parentId: destParentId,
          parentType: "page" as any,
        };
        globalBlocks.upsertBlocks([updatedDraggedBlock]);

        // Update source parent's blockIds (only if it has a parent that's not workspace)
        if (sourceParentId && sourceParentId !== currentWorkspace?._id) {
          const sourceParent = globalBlocks.getBlock(sourceParentId);
          if (sourceParent) {
            const newSourceBlockIds = (sourceParent.blockIds || []).filter(id => id !== draggedNodeId);
            globalBlocks.upsertBlocks([{ ...sourceParent, blockIds: newSourceBlockIds }]);
          }
        }

        // Get FRESH destination block data before API call to ensure we don't have stale data
        let freshDestBlock = globalBlocks.getBlock(destParentId);
        let destPageValue = freshDestBlock?.value as any;
        let destPageType = destPageValue?.pageType;

        if (!destPageType) {
          console.log("Fallback to editor document root since target block has no pageType", destParentId);
          const editorRootBlock = globalBlocks.getBlock(editorKey);
          const editorChildren = editorRootBlock?.blockIds || [];
          const indexInRoot = editorChildren.indexOf(destParentId);

          destParentId = editorKey;
          freshDestBlock = editorRootBlock;
          destPageValue = freshDestBlock?.value as any;
          destPageType = destPageValue?.pageType;

          insertionIndex = indexInRoot !== -1 ? indexInRoot + 1 : -1;
        }

        const currentDestChildren = freshDestBlock?.blockIds || [];

        console.log("Printing the fresh dest block", destParentId, freshDestBlock, insertionIndex);
        // Insert at the precise index calculated from ProseMirror
        let newDestBlockIds = [...currentDestChildren];

        // Defense mechanism: Only add if not already present
        if (!newDestBlockIds.includes(draggedNodeId)) {
          if (insertionIndex !== -1 && insertionIndex <= newDestBlockIds.length) {
            // Use splice to inject the ID exactly where the drop occurred
            newDestBlockIds.splice(insertionIndex, 0, draggedNodeId);
          } else {
            // Fallback: Append to end if index couldn't be calculated
            newDestBlockIds.push(draggedNodeId);
          }
        }

        globalBlocks.upsertBlocks([{ ...freshDestBlock!, blockIds: newDestBlockIds }]);

        console.log("Printing the dragged block and new destBlockIDs", draggedBlock, newDestBlockIds);
        // Determine page types dynamically
        const draggedPageValue = draggedBlock.value as any;
        const draggedPageType = draggedPageValue?.pageType;

        // Prepare API payload with fresh data
        const apiPayload: any[] = [];

        // Source update
        if (sourceIsRoot) {
          // ✅ FIX: For root pages, send the updated root pages list to API
          // Determine which root list the page belongs to
          let sourceRootList: string[] = [];
          let sourceTypeOfChild = "private";

          if (privatePagesOrder.includes(draggedNodeId)) {
            sourceRootList = privatePagesOrder.filter(id => id !== draggedNodeId);
            sourceTypeOfChild = "private";
          } else if (publicPagesOrder.includes(draggedNodeId)) {
            sourceRootList = publicPagesOrder.filter(id => id !== draggedNodeId);
            sourceTypeOfChild = "public";
          } else if (sharedPagesOrder.includes(draggedNodeId)) {
            sourceRootList = sharedPagesOrder.filter(id => id !== draggedNodeId);
            sourceTypeOfChild = "private"; // or "shared" if API supports it
          } else {
            // Check work areas
            for (const waId in workAreaPagesOrder) {
              if (workAreaPagesOrder[waId]?.includes(draggedNodeId)) {
                sourceRootList = (workAreaPagesOrder[waId] || []).filter(id => id !== draggedNodeId);
                sourceTypeOfChild = "workarea";
                break;
              }
            }
          }

          // Send root list update to API
          apiPayload.push({
            parentId: currentWorkspace?._id,
            workspaceId: currentWorkspace?._id,
            blockIdArray: sourceRootList,
            typeofChild: sourceTypeOfChild,
          });
        } else if (sourceParentId) {
          // For nested pages, use parent's blockIds
          const freshSourceParent = globalBlocks.getBlock(sourceParentId);
          const sourceBlockIds = (freshSourceParent?.blockIds || []).filter(id => id !== draggedNodeId);
          const sourceParentValue = freshSourceParent?.value as any;
          const sourceTypeOfChild = sourceParentValue?.pageType;

          apiPayload.push({
            parentId: sourceParentId,
            workspaceId: currentWorkspace?._id,
            blockIdArray: sourceBlockIds,
            typeofChild: sourceTypeOfChild,
          });
        }

        // Destination update
        apiPayload.push({
          parentId: destParentId,
          workspaceId: currentWorkspace?._id,
          blockIdArray: newDestBlockIds,
          typeofChild: destPageType,
        });

        clearDragState();
        // Call API to persist changes
        const response = await postWithAuth("/api/note/block/drag-and-drop", {
          dragAndDropinputfieldArray: apiPayload,
          updatedBlockInfo: {
            blockId: draggedNodeId,
            parentType: "page",
            parentId: destParentId,
            pageType: destPageType,
          },
        });

        if ("error" in response) {
          console.error("Error moving page:", response.error);
          toast.error("Failed to move page");
          window.location.reload();
        } else {
          toast.success("Page moved successfully");
        }
      } catch (err) {
        console.error("Failed to move page:", err);
        toast.error("Failed to move page");
        window.location.reload();
      }
    }
  };

  if (!initialContent) {
    return (
      <div className="relative w-full p-12 pt-0">
        {isLoading && (<EditorLoading />)}
      </div>
    );
  }

  return (
    <div className={`relative w-full p-12 pt-0 sm:p-0 ${effectiveReadOnly ? "pointer-events-none" : ""}`}
      inert={effectiveReadOnly}

    >
      <div className={showCommitHistory ? "pr-[250px]" : ""}>      <div className=" fixed z-20  bg-background dark:bg-background -mt-2 p-4 pl-12 w-full" style={{ top: "56px" }}>
        <div className="flex justify-start gap-2  px-20 pt-0 max-w-screen-lg">
          {showCommitHistory && isHistoryMode ? (
            <>
              <div className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-[#5F5E5B] dark:text-[#9B9B9B]">
                <Lock className="w-4 h-4" />
                <span>Read Only</span>
              </div>
              <div className="pl-2 pr-2 rounded-lg px-2 py-1 text-sm text-muted-foregroun txt-btn dark:text-white hover:bg-[rgb(248,248,247)] dark:hover:bg-[rgb(39,39,42)] transition-colors">
                <button
                  type="button"
                  className="text-gray-500 font-semibold rounded-sm txt-btn dark:text-white"
                  onClick={() => {
                    closeCommitHistory();
                  }}
                >
                  Hide History
                </button>
              </div>
            </>
          ) : isPublish ? (
            <>
              {approvalStatus === "accepted" && (
                <>
                  <CopyLinkButton />
                  <DeleteButton onDelete={() => setDeleteModalOpen(true)} />
                </>
              )}

              {approvalStatus === "rejected" && (
                <div className="px-3 py-1 text-sm bg-accent rounded-lg text-red-500 font-semibold">Rejected</div>
              )}

              {effectiveReadOnly && (
                <div className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-[#5F5E5B] dark:text-[#9B9B9B]">
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Read Only</span>
                  </>
                </div>
              )}

              {approvalStatus === "pending" && (
                <>
                  <div className=" pl-2 pr-2 rounded-lg px-2 py-1 text-sm text-muted-foregroun txt-btn dark:text-white  n hover:bg-[rgb(248,248,247)] dark:hover:bg-[rgb(39,39,42)] transition-colors " >
                    <button
                      type="button"
                      className=" text-gray-500  font-semibold rounded-sm txt-btn dark:text-white "
                      onClick={(e) => {
                        e.stopPropagation();
                        // handleApproval(editorKey, true);
                      }}
                      disabled={approvalLoading}
                    >
                      {approvalLoading && approvalDirection === "approve" ? "Approving..." : "Approve"}
                    </button>
                  </div>

                  <div className="pl-2 pr-2 rounded-lg px-2 py-1 text-sm text-muted-foregroun txt-btn dark:text-white  d">
                    <button
                      type="button"
                      className=" text-gray-500  font-semibold rounded-sm txt-btn dark:text-white "
                      onClick={(e) => {
                        e.stopPropagation();
                        // handleApproval(editorKey, false);
                      }}
                      disabled={approvalLoading}
                    >
                      {approvalLoading && approvalDirection === "reject" ? "Rejecting..." : "Reject"}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {effectiveReadOnly && (
                <div className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-[#5F5E5B] dark:text-[#9B9B9B]">
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Read Only</span>
                  </>
                </div>
              )}
              {/* {readOnly && !isPublicNote && (
                <div className=" pl-2 pr-2 rounded-lg px-2 py-1 text-sm text-muted-foregroun txt-btn dark:text-white hover:bg-[rgb(248,248,247)] transition-colors  hover:bg-[rgb(248,248,247)] transition-colors  dark:hover:bg-[rgb(39,39,42)] transition-colors">
                  <button
                    type="button"
                    className="text-gray-500  font-semibold rounded-sm txt-btn dark:text-white "
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRemoveModal(true);
                      setRemovingNoteId(editorKey);
                    }}
                  >
                    Remove
                  </button>
                </div>
              )} */}
              {!effectiveReadOnly && !isPublicNote && (
                <div className="pl-2 pr-2 rounded-lg px-2 py-1 text-sm text-muted-foregroun txt-btn dark:text-white hover:bg-[rgb(248,248,247)] dark:hover:bg-[rgb(39,39,42)] transition-colors" >
                  <button
                    type="button"
                    className="text-gray-500  font-semibold rounded-sm txt-btn dark:text-white "
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModal(true);
                    }}
                  >
                    Share
                  </button>
                </div>
              )}
              {/* {!readOnly && !isPublicNote && (
                <div className=" pl-2 pr-2 rounded-lg px-2 py-1 text-sm text-muted-foregroun txt-btn dark:text-white   hover:bg-[rgb(248,248,247)] dark:hover:bg-[rgb(39,39,42)] transition-colors ">
                  <button
                    disabled={publishStatus !== "Publish" || publishLoading}
                    type="button"
                    className={`text-gray-500  font-semibold rounded-sm txt-btn dark:text-white  ${
                      publishStatus !== "Publish" || publishLoading ? "cursor-not-allowed" : "cursor-pointer"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePublish(editorKey);
                    }}
                  >
                    {publishLoading ? "Publishing..." : publishStatus === 'pending' ? "In Review" : publishStatus}
                  </button>
                </div>
              )} */}
              {!isPublish && (
                <div className="pl-2 pr-2 rounded-lg px-2 py-1 text-sm text-muted-foregroun txt-btn dark:text-white hover:bg-[rgb(248,248,247)] dark:hover:bg-[rgb(39,39,42)] transition-colors">
                  <button
                    type="button"
                    className="text-gray-500 font-semibold rounded-sm txt-btn dark:text-white"
                    onClick={() => {
                      fetchHistory();
                    }}
                  >
                    View History
                  </button>
                </div>
              )}
              {!isPublish && (
                <div className="pl-2 pr-2 rounded-lg px-2 py-1 text-sm text-muted-foregroun txt-btn dark:text-white hover:bg-[rgb(248,248,247)] dark:hover:bg-[rgb(39,39,42)] transition-colors">
                  <button
                    type="button"
                    className="text-gray-500 font-semibold rounded-sm txt-btn dark:text-white"
                    onClick={() => setShowLogs(!showLogs)}
                  >
                    <Clock1 className="w-4 h-4 mr-1 inline" />
                    Activity
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

        {/* Get icon, title, and cover from block context (preferred over note state) */}
        {(() => {
          const pageBlock = globalBlocks.getBlock(editorKey);
          const blockIcon = pageBlock?.blockType === 'page'
            ? (pageBlock.value as any)?.icon || ""
            : "";
          const blockTitle = pageBlock?.blockType === 'page'
            ? (pageBlock.value as any)?.title || ""
            : "";
          const blockCoverUrl = pageBlock?.blockType === 'page'
            ? (pageBlock.value as any)?.coverURL || null
            : null;

          // Use block context values, fallback to state for backward compatibility
          const displayIcon = blockIcon || titleIcon || "";
          const displayTitle = blockTitle || editorTitle || "";
          const displayCoverUrl = blockCoverUrl || coverUrl || null;

          return (
            <>
              <CoverImage
                coverUrl={displayCoverUrl}
                onCoverChange={handleCoverChange}
                onCoverRemove={handleCoverRemove}
                onUploadCover={handleUploadCover}
                workspaceId={currentWorkspace?._id}
                openPicker={showCoverPicker}
                onPickerClose={() => setShowCoverPicker(false)}
              />

              <div className="pl-20 px-20">
                <EditorHeader
                  editorKey={editorKey}
                  setEditing={setEditing}
                  editing={editing}
                  readOnly={effectiveReadOnly}
                  inputRef={inputRef}
                  showCommitHistory={showCommitHistory}
                  toast={toast}
                  coverUrl={displayCoverUrl}
                  onAddCover={handleAddCover}
                  titleIcon={displayIcon}
                // selectedNoteId={selectedNoteId as string}
                // activeEmoji={activeEmoji}
                // noteType={noteType}
                // noteOwnerMail={noteOwnerMail}
                // parentId={parentId}
                // user={user}
                // rootNodes={rootNodes}
                // setNotes={setNotes}
                // updateTitleDeep={updateTitleDeep}
                // editorTitle={displayTitle}
                // activeTitle={activeTitle}
                // pendingTitle={pendingTitle}
                // isTitleDirtyRef={isTitleDirtyRef}
                // pendingTitleMap={pendingTitleMap}
                // updateNoteWithQuery={updateNoteWithQuery}
                // queryClient={queryClient}
                // isOwner={isOwner}
                />
              </div>
            </>
          );
        })()}


        <div className="flex-1 w-full pt-2 px-5 pl-20">
          {showCommitHistory && isHistoryMode ? (
            <>
              {commitContentLoading ? (
                <EditorLoading />
              ) : (
                <HistoryEditor
                  editorKey={`${editorKey}-history`}
                  initialContent={historyEditorContent}
                  readOnly={true}
                  onContentChange={setHistoryEditorContent}
                />
              )}
            </>
          ) : (
            globalBlocks.getBlock(editorKey) && (
              <CommentProvider
                initialComments={pageComments}
                noteId={editorKey}
                boardId={""}
                note={globalBlocks.getBlock(editorKey)!}
              >
                <div className="flex w-full h-full relative">
                  <div
                    className="flex-1 relative min-w-0"
                    onDragOver={handleEditorDragOver}
                    onDragLeave={handleEditorDragLeave}
                    onDrop={handleEditorDrop}
                  >
                    <EditorRoot>
                      <EditorContent
                        key={`editor-${editorKey}`}
                        initialContent={initialContent}
                        extensions={extensions}
                        onCreate={({ editor }) => {
                          editorRef.current = editor;
                          editor.setEditable(!effectiveReadOnly && !showCommitHistory);
                          setEditorInstance(editor);

                          // Store editor instance on the view's DOM element so plugins can access it
                          if (editor.view && editor.view.dom) {
                            (editor.view.dom as any).editor = editor;
                            // Also store on parent container for easier access
                            const parent = editor.view.dom.parentElement;
                            if (parent) {
                              (parent as any).editor = editor;
                              (parent as any).pmView = editor.view;
                            }
                          }

                          // Note: Block order is managed by extensions callbacks and context
                          // Don't call setOrderFromArray here as it may clear blockIds if doc is empty
                        }}
                        className="flex w-full h-full bg-background dark:bg-background pl-12  p-4 min-h-[60vh]"
                        editorProps={{
                          handleDOMEvents: {
                            keydown: (_view, event) => handleCommandNavigation(event),
                          },
                          handlePaste: (view, event) => handleImagePaste(view, event, uploadFn),
                          handleDrop: (view, event, _slice, moved) => {
                            // ✅ FIX: Check if this is a sidebar page drag
                            // If so, return true to prevent Tiptap from inserting the text/plain data
                            // IMPORTANT: The 'moved' parameter is true when content is dragged within the editor itself
                            // We only want to block external sidebar drags, not internal editor drags
                            const isSidebarDrag = !moved && // Not an internal editor drag
                              event.dataTransfer?.types.includes("text/plain") &&
                              !event.dataTransfer?.types.includes("application/page-block-from-editor") &&
                              !event.dataTransfer?.types.includes("Files");

                            if (isSidebarDrag) {
                              // This is a sidebar page drag, let our custom handler deal with it
                              // Return true to tell Tiptap: "I handled this, don't do default behavior"
                              return true;
                            }

                            // For everything else (images, internal drags, etc.), use the default handler
                            return handleImageDrop(view, event, moved, uploadFn);
                          },
                          attributes: {
                            class:
                              "prose prose-lg w-[100%] h-[100%] dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full ",
                            'data-editor-key': editorKey,
                          },
                        }}
                        onUpdate={({ editor }) => {
                          if (!effectiveReadOnly) {
                            // Track user edit time to prevent parser from running during active typing
                            lastUserEditTimeRef.current = Date.now();
                            // debouncedUpdates(editor);
                            // debouncedUpdatesOnline(editor);
                            // setSaveStatus("Unsaved");
                          }
                        }}
                        slotAfter={<ImageResizer />}
                      >
                        {aiSelectorOpen && aiSelectorPosition && isSlashCommandAIOpen && (
                          <div
                            className="rounded-md border bg-background dark:bg-background"
                            style={{
                              position: "absolute",
                              left: aiSelectorPosition.left,
                              top: aiSelectorPosition.top,
                              zIndex: 9999,
                            }}
                          >
                            <AISelector
                              open={aiSelectorOpen}
                              onOpenChange={(open) => {
                                setAISelectorOpen(open);
                                setIsSlashCommandAIOpen(open);
                                if (!open) {
                                  setAISelectorPosition(null);
                                }
                              }}
                            />
                          </div>
                        )}

                        <EditorCommand className="z-50 min-w-[280px] h-auto max-h-[330px] rounded-md border border-muted bg-background dark:bg-background px-1 shadow-md transition-all">
                          <EditorCommandEmpty className="px-2 py-2 text-muted-foreground">No results</EditorCommandEmpty>
                          <EditorCommandList className="py-2 overflow-y-auto max-h-[314px]" style={{ maskImage: "linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)" }}>
                            {Object.entries(
                              suggestionItems
                                .filter((item) => !(item.title === "Ask AI" && !isPremiumUser))
                                .reduce((acc, item) => {
                                  const category = item.category || "Options";
                                  if (!acc[category]) acc[category] = [];
                                  acc[category].push(item);
                                  return acc;
                                }, {} as Record<string, typeof suggestionItems>)
                            ).map(([category, items]) => (
                              <EditorCommandGroup key={category} heading={category} className="mb-2 text-xs text-muted-foreground px-2 [&_[cmdk-item]]:px-1 [&_[cmdk-group-heading]]:px-0 [&_[cmdk-group-heading]]:mb-1 mt-2">
                                {items.map((item) => {
                                  return (
                                    <EditorCommandItem
                                      value={item.title}
                                      onCommand={(val) => item.command?.(val)}
                                      className="flex w-full items-center space-x-2 transition-colors rounded-md px-3 py-2 text-left line-height-[120%] gap-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 cursor-pointer"
                                      key={item.title}
                                    >
                                      <div className="flex h-5 w-5 items-center justify-center text-gray-700 dark:text-gray-300 bg-background dark:bg-background">
                                        {item.icon}
                                      </div>
                                      <div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">{item.title}</p>
                                      </div>
                                    </EditorCommandItem>
                                  );
                                })}
                              </EditorCommandGroup>
                            ))}
                          </EditorCommandList>
                        </EditorCommand>

                        <GenerativeMenuSwitch
                          open={openAI}
                          customAnchor={openComment ? commentAnchorRect : null}
                          onOpenChange={(open) => {
                            setOpenAI(open);
                            if (open && isSlashCommandAIOpen) {
                              // Close slash command AI when generative menu opens
                              setAISelectorOpen(false);
                              setIsSlashCommandAIOpen(false);
                              setAISelectorPosition(null);
                            }
                            // Clear anchor when menu closes (though state is openAI, we might need to handle openComment logic in its own selector or here if they share the switch)
                            // GenerativeMenuSwitch controls the visibility of the bubble menu which contains CommentSelector
                            // But wait, GenerativeMenuSwitch 'open' prop seems to control the AI menu mainly?
                            // Let's check how CommentSelector is used.
                            // The GenerativeMenuSwitch wraps everything including CommentSelector.
                            // But usually CommentSelector is just one item in the menu.
                            // Ah, GenerativeMenuSwitch controls the *visibility of the menu bubble itself*?
                            // No, looking at the code:
                            // <GenerativeMenuSwitch open={openAI} ...>
                            //   ... <CommentSelector open={openComment} ... />
                            // </GenerativeMenuSwitch>
                            // The 'open' prop on GenerativeMenuSwitch seems to be for the AI menu state specifically?
                            // Wait, the EditorBubble in GenerativeMenuSwitch (from `novel`) shows content based on selection by default.
                            // If `open` (the prop passed to GenerativeMenuSwitch) is true, it shows AISelector.
                            // If `open` is false, it shows the children (which includes CommentSelector).
                            // So we need to make sure the EditorBubble is visible when `openComment` is true.
                            // The EditorBubble from `novel` automatically shows when there is a selection.
                            // But we typically clear selection or change it.
                            // We are bringing up the menu programmatically.
                            // We might need to trick it or rely on the fact that we selected the text in block context menu.
                          }}
                        >
                          <Separator orientation="vertical" />
                          <NodeSelector open={openNode} onOpenChange={setOpenNode} />
                          <Separator orientation="vertical" />
                          <LinkSelector open={openLink} onOpenChange={setOpenLink} />
                          <Separator orientation="vertical" />
                          <CommentSelector open={openComment} onOpenChange={setOpenComment} noteId={editorKey} />
                          <Separator orientation="vertical" />
                          <MathSelector />
                          <Separator orientation="vertical" />
                          <TextButtons />
                          <Separator orientation="vertical" />
                          <ColorSelector open={openColor} onOpenChange={setOpenColor} />
                        </GenerativeMenuSwitch>
                      </EditorContent>
                    </EditorRoot>
                  </div>
                  {/* Desktop comment panel */}
                  <div className="w-12 min-[1320px]:w-[300px] min-[1440px]:w-[360px] min-[1320px]:pl-4 relative">
                    <CommentPanel />
                  </div>
                </div>
              </CommentProvider>
            )
          )}
          {editorRef.current && <TableToolbar editor={editorRef.current} />}
        </div>

        {/* Modal for share button */}
        <ShareModal
          open={showModal}
          invites={invites}
          newEmail={newEmail}
          newPermission={newPermission}
          generalAccess={generalAccess}
          copied={copied}
          onClose={() => {
            onShareComplete?.();
            setShowModal(false);
            setNewEmail("");
            setInvites([]);
            setNewPermission("viewer");
            clearShareNoteId();
          }}
          onAddInvite={(email, permission) => {
            setInvites([...invites, { email, permission }]);
            setNewEmail("");
            setNewPermission("viewer");
          }}
          onRemoveInvite={(index) => {
            setInvites(invites.filter((_, i) => i !== index));
          }}
          onPermissionChange={setNewPermission}
          onEmailChange={setNewEmail}
          onShare={() => {
            const noteIdToShare = shareNoteId || editorKey;
            handleInvite(noteIdToShare, invites, generalAccess);
            setInvites([]);
            setShowModal(false);
            onShareComplete?.();
          }}
          onCopyLink={() => {
            const noteIdToShare = shareNoteId || editorKey;
            navigator.clipboard.writeText(`${process.env.DOMAIN}/notes/${noteIdToShare}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          onGeneralAccessChange={setGeneralAccess} // ✅ Only if you want General Access
        />

        {/*Deletion Modal */}
        <DeleteConfirmationModal
          header="Delete Note"
          title={editorTitle}
          entity="note"
          isOpen={deleteModalOpen}
          onCancel={() => setDeleteModalOpen(false)}
          isDeleting={isDeleting}
          onConfirm={async () => {
            if (editorKey) {
              setIsDeleting(true);
              setDeleteModalOpen(false);
              try {
                await DeleteNote(editorKey);
                router.push("/notes");
              } catch (err) {
                console.error("Error deleting editor:", err);
              } finally {
                setIsDeleting(false);
                setDeleteModalOpen(false);
              }
            }
          }}
        />
        {isDeleting && (
          <div className="fixed inset-0 bg-black/50 dark:bg-black/75 flex items-center justify-center z-[9999]">
            <div className="flex items-center gap-2 text-white text-lg">
              <Loader2 className="w-6 h-6 animate-spin" />
              Deleting page...
            </div>
          </div>
        )}

        {/*Remove From Share Modal */}
        <DeleteConfirmationModal
          header="Remove Shared Notes"
          isOpen={showRemoveModal}
          isProcessing={isProcessing}
          title="Remove from Shared Notes"
          message="Are you sure you want to remove this note from shared notes?"
          confirmButtonText="Remove"
          confirmButtonColor="red"
          onCancel={() => setShowRemoveModal(false)}
          onConfirm={async () => {
            if (!removingNoteId) return;
            setIsProcessing(true);
            try {
              await removeSharedPage(removingNoteId);
              setShowRemoveModal(false);
            } catch (err) {
              console.error(err);
            } finally {
              setIsProcessing(false);
              setRemovingNoteId(null);
            }
          }}
        />
      </div>

      {commitHistoryLoading && (
        <div className="bg-white dark:bg-gray-800 mt-1 z-30 shadow-lg rounded-md w-[280px]"
          style={{
            position: "fixed",
            top: "70px",
            right: "0px",
          }}
        >
          <div className="min-h-[500px] w-full bg-background dark:bg-background sm:rounded-lg p-5">
            {/* Spinner */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative w-4 h-4">
                <div className="absolute inset-0 border-2 border-gray-400 dark:border-gray-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Loading History...
              </span>
            </div>

            {/* Skeleton Lines */}
            <div className="space-y-3">
              <div className="h-7 w-3/4 rounded animate-pulse bg-[rgb(225,225,224)] dark:bg-[rgb(45,45,45)]" />
              <div className="h-4 w-full rounded animate-pulse bg-[rgb(225,225,224)] dark:bg-[rgb(45,45,45)]" />
              <div className="h-4 w-full rounded animate-pulse bg-[rgb(225,225,224)] dark:bg-[rgb(45,45,45)]" />
              <div className="h-4 w-2/3 rounded animate-pulse bg-[rgb(225,225,224)] dark:bg-[rgb(45,45,45)]" />
              <div className="h-24 w-full rounded animate-pulse mt-6 bg-[rgb(225,225,224)] dark:bg-[rgb(45,45,45)]" />
            </div>
          </div>
        </div>
      )}

      {showCommitHistory && isHistoryMode && (
        <div className="bg-white dark:bg-gray-800 mt-1 z-30 shadow-lg rounded-md"
          style={{
            position: "fixed",
            top: "70px",
            right: "0px",
          }}
        >
          <div className="">
            <HistorySlider
              snapshots={snapshots}
              selectedSnapshot={selectedSnapshot}
              onSelectVersion={(snapshot) => {
                setSelectedSnapshot(snapshot);
                setCommitContentLoading(true); setIsLoading(true);
                loadSelectedVersionContent(editorKey, snapshot.version);
              }}
              onApply={applyHistoryContent}
              isApplying={isApplyingCommit}
              onClose={() => {
                closeCommitHistory();
              }}
            />
          </div>
        </div>
      )}

      {showLogs &&
        <div className="fixed top-[60px] right-4 z-50 bg-background shadow-xl rounded-lg border border-gray-200 dark:border-gray-700"
          style={{
            width: "380px",
            maxHeight: "calc(100vh - 80px)",
            overflowY: "auto",
          }}
        >
          <div className="mt-2">
            <div className='px-5 pt-3 flex gap-3 items-center justify-between'>
              <div className="flex gap-3 items-center">
                <p className="m-0 text-md font-semibold">Activity Log</p>
                {!isLogLoading &&
                  <p className="m-0 text-xs text-gray-500 mt-1 dark:text-gray-400">
                    {activityLogs.length} {activityLogs.length === 1 ? 'activity' : 'activities'}
                  </p>
                }
              </div>
              <button
                onClick={() => setShowLogs(false)}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                aria-label="Close logs"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-gray-300" />
              </button>
            </div>
            <ActivityLogContainer logs={activityLogs}
              isLogLoading={isLogLoading}
            />
          </div>
        </div>
      }
      <EmbedModalWrapper />
    </div>
  );
};

export default TailwindAdvancedEditor;
