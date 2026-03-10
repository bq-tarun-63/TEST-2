import { defaultExtensions, createBlockTrackerExtension } from "./extensions";
import { Editor } from "@tiptap/core";
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
import { uploadFn } from "./image-upload";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSlashCommand, getSuggestionItems } from "./slash-command";
import { createMentionExtension } from "./mention-command";
import { useNotifications } from "@/hooks/use-notifications";
import GenerativeMenuSwitch from "./generative/generative-menu-switch";
import { Separator } from "./ui/separator";
import { NodeSelector } from "./selectors/node-selector";
import { LinkSelector } from "./selectors/link-selector";
import { MathSelector } from "./selectors/math-selector";
import { TextButtons } from "./selectors/text-buttons";
import { ColorSelector } from "./selectors/color-selector";
import { CommentSelector } from "./selectors/comment-selector";
import { useNoteContext } from "@/contexts/NoteContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useBoard } from "@/contexts/boardContext";
import { useAuth } from "@/hooks/use-auth";
import { AISelector } from "./generative/ai-selector";
import { reconstructDocumentFromBlocks } from "@/utils/blockParser";
import { Block } from "@/types/block";
import { useDragState } from "@/contexts/dragStateContext";
import { toast } from "sonner";
import { postWithAuth } from "@/lib/api-helpers";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { eventBus } from "@/services-frontend/comment/eventBus";



interface SidebarEditorProps {
  editorKey: string;
  initialContent: JSONContent | null;
  readOnly?: boolean;
  onContentChange?: (content: any) => void;
  className?: string;
  parentId?: string | null;
  workspaceId?: string;
  isRestrictedPage?: boolean;
  isPublicNote?: boolean;
  workAreaId?: string;
  onPageCreated?: (href: string) => void;
}

const SidebarEditor = ({
  editorKey,
  initialContent,
  readOnly = false,
  onContentChange,
  className = "",
  parentId = null,
  workspaceId = "",
  isRestrictedPage = false,
  isPublicNote = false,
  workAreaId,
  onPageCreated,
}: SidebarEditorProps) => {
  const [content, setContent] = useState(initialContent);
  const editorRef = useRef<Editor | null>(null);
  const { mentionUser } = useNotifications();

  const [openNode, setOpenNode] = useState<boolean>(false);
  const [openColor, setOpenColor] = useState<boolean>(false);
  const [openLink, setOpenLink] = useState<boolean>(false);
  const [openComment, setOpenComment] = useState<boolean>(false);
  const [openAI, setOpenAI] = useState<boolean>(false);
  const { isPremiumUser } = useNoteContext();

  // Context hooks
  const globalBlocks = useGlobalBlocks();
  const { currentWorkspace } = useWorkspaceContext();
  const { setDataSource, setCurrentDataSource, getDataSource } = useBoard();
  const { user } = useAuth();
  const { clearDragState, dragSource } = useDragState();
  const [isEditorDragOver, setIsEditorDragOver] = useState<boolean>(false);
  const {
    privatePagesOrder,
    publicPagesOrder,
    sharedPagesOrder,
    workAreaPagesOrder,
    removePage
  } = useRootPagesOrder();

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

  const [aiSelectorOpen, setAISelectorOpen] = useState(false);
  const [isSlashCommandAIOpen, setIsSlashCommandAIOpen] = useState<boolean>(false);
  const [aiSelectorPosition, setAISelectorPosition] = useState<{ left: number; top: number } | null>(null);
  const [commentAnchorRect, setCommentAnchorRect] = useState<DOMRect | null>(null);

  const prevContentRef = useRef<any>(null);

  // Watch for block changes and re-parse content - ONLY for blocks of this specific page
  const lastParsedBlocksRef = useRef<string>("");
  const isUpdatingFromParserRef = useRef<boolean>(false);
  const parserDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSignatureRef = useRef<string>("");
  const lastUserEditTimeRef = useRef<number>(0);

  // This useEffect checks if the initialContent prop has changed (e.g. from an external update)
  // and updates the editor content to match. This is crucial for syncing updates without
  // unmounting the component, or when switching notes if the key strategy allows reuse.
  useEffect(() => {
    if (editorRef.current) {
      if (JSON.stringify(initialContent) !== JSON.stringify(prevContentRef.current)) {
        editorRef.current.commands.setContent(initialContent, false);
        setContent(initialContent);
        prevContentRef.current = initialContent;
      }
    } else {
      setContent(initialContent);
      prevContentRef.current = initialContent;
    }
  }, [initialContent, editorKey]);

  useEffect(() => {
    // Skip if editor is not initialized or editorKey is invalid
    if (!editorRef.current || !editorKey || editorKey === "notes" || editorKey === "undefined") {
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
          console.error('[SidebarEditor] Error re-parsing blocks:', error);
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
          console.log('[SidebarEditor] Blocks match editor content, skipping update');
          lastParsedBlocksRef.current = finalSignature;
          return;
        }

        // They're different - this means blocks changed externally
        console.log('[SidebarEditor] Blocks differ from editor, updating editor');

        // Set flag to prevent re-parsing when setContent triggers block updates
        isUpdatingFromParserRef.current = true;

        // Update editor content using transaction with fromParser meta to prevent API calls
        // Use queueMicrotask to avoid React flushSync error during render
        queueMicrotask(() => {
          if (!editorRef.current) return;

          const { state, view } = editorRef.current;
          const tr = state.tr;
          tr.setMeta('fromParser', true); // Critical: prevents BlockIdAndChangeTrackerExtension from triggering
          const content = state.schema.nodeFromJSON(reconstructedDoc);
          tr.replaceWith(0, state.doc.content.size, content.content);
          view.dispatch(tr);

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

  }, [editorKey, globalBlocks.blocks, globalBlocks]);

  useEffect(() => {
    const handleOpenComment = ({ pos, node }: { pos: number, node: any }) => {
      console.log("Received open-comment event in SidebarEditor", pos, node);
      if (editorRef.current) {
        // Calculate the anchor position from the node's DOM element
        try {
          const domNode = editorRef.current.view.nodeDOM(pos) as HTMLElement;
          if (domNode) {
            const rect = domNode.getBoundingClientRect();
            setCommentAnchorRect(rect);
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
      toast.error("Failed to move page: block not found");
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
            }
          });

          if (response.isError) {
            toast.error("Failed to move page");
          } else {
            toast.success("Page moved successfully");
          }

        } catch (error) {
          console.error("Error formatting board drop:", error);
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

        if (response.isError) {
          toast.error("Failed to move page on server");
        }
      } catch (error) {
        console.error("Error moving page:", error);
        toast.error("Failed to move page");
      }
    }
  };

  const handleContentChange = (editor: Editor) => {
    const newContent = editor.getJSON();
    setContent(newContent);
    onContentChange?.(newContent);
  };



  const handlePageCreated = (href: string) => {
    if (onPageCreated) {
      onPageCreated(href);
    }
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
    }
  }


  const suggestionItems = useMemo(
    () => getSuggestionItems(
      parentId || editorKey,
      handlePageCreated,
      openAISelectorAtSelection, // Enable Ask AI
      undefined, // onHistoryCommand
      isRestrictedPage,
      isPublicNote,
      workAreaId,
      globalBlocks.addBlock,
      globalBlocks.updateBlock,
      globalBlocks.getBlock,
      currentWorkspace?._id || workspaceId,
      user?.email,
      setDataSource,
      setCurrentDataSource,
    ),
    [editorKey, parentId, isRestrictedPage, isPublicNote, workAreaId, globalBlocks, currentWorkspace?._id, workspaceId, user?.email, setDataSource, setCurrentDataSource],
  );

  const slashCommand = useMemo(
    () => getSlashCommand(
      parentId || editorKey,
      handlePageCreated,
      openAISelectorAtSelection, // Enable Ask AI
      undefined,        // onHistoryCommand
      isRestrictedPage,
      isPublicNote,
      workAreaId
    ),
    [editorKey, parentId, isRestrictedPage, isPublicNote, workAreaId]
  );

  const extensions = useMemo(
    () => [
      createBlockTrackerExtension(
        editorKey,
        currentWorkspace?._id || workspaceId || "",
        parentId || editorKey,
        "page",
        {
          setOrderFromArray,
          insertAfter,
          removeId,
          moveToOrder,
          replaceId
        },
        globalBlocks,
        readOnly
      ),
      ...defaultExtensions,
      slashCommand,
      createMentionExtension(mentionUser)
    ],
    [editorKey, currentWorkspace?._id, workspaceId, parentId, slashCommand, mentionUser, setOrderFromArray, insertAfter, removeId, moveToOrder, replaceId, globalBlocks]
  );

  return (
    <>


      <div
        className="relative w-full"
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
      >
        <EditorRoot>
          <EditorContent
            key={`editor-${editorKey}`}
            initialContent={initialContent}
            extensions={extensions}
            editorProps={{
              editable: () => !readOnly,
              handleDOMEvents: {
                keydown: (_view, event) => handleCommandNavigation(event),
              },
              handlePaste: (view, event) => handleImagePaste(view, event, uploadFn),
              handleDrop: (view, event, _slice, moved) => {
                // Check if this is a sidebar page drag
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
                class: "prose prose-lg min-h-[300px] w-[100%] dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full ",
                'data-editor-key': editorKey,
              },
            }}
            onCreate={({ editor }) => {
              editorRef.current = editor;
              editor.setEditable(!readOnly);

              prevContentRef.current = initialContent;
            }}
            onUpdate={({ editor }) => {
              if (!readOnly) {
                lastUserEditTimeRef.current = Date.now();
                handleContentChange(editor);
                // debouncedOnlineSave(editor);
              }
            }}
            slotAfter={<ImageResizer />}
            className={`w-full bg-background dark:bg-background dark:border-gray-700 rounded-md ${className}`}
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
                  <EditorCommandGroup key={category} heading={category} className="mb-2 text-xs font-semibold text-muted-foreground px-2 [&_[cmdk-item]]:px-1 [&_[cmdk-group-heading]]:px-0 [&_[cmdk-group-heading]]:mb-1 mt-2">
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
                            <p className="font-sm text-gray-700 dark:text-gray-300">{item.title}</p>
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
    </>
  );
};

export default SidebarEditor;