import { type Node } from "@/types/note";
import { deleteWithAuth, getWithAuth, postWithAuth } from "@/lib/api-helpers";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { toast } from "sonner";

export default function useNoteActions() {
  const { updateBlock, getBlock, removeBlock, addBlock } = useGlobalBlocks();
  const { currentWorkspace } = useWorkspaceContext();
  const { movePageToPrivate, movePageToPublic, removePage, privatePagesOrder, publicPagesOrder } = useRootPagesOrder();

  const UpdateNote = async (
    id: string,
    title: string,
    icon: string | null = null,
    shouldSync = true,
  ) => {
    try {
      // Get current block to access existing data
      const currentBlock = getBlock(id);
      if (!currentBlock) {
        console.error("Block not found:", id);
        return null;
      }

      // Optimistic update in block context
      const updatedValue = {
        ...currentBlock.value,
        title: title,
        icon: icon || (currentBlock.value as any).icon || "",
      };
      // Update context in both cases (local-only or local+server)
      updateBlock(id, { value: updatedValue });

      if (!shouldSync) {
        return;
      }

      // Call batch-update API for blocks
      const workspaceId = currentWorkspace?._id;
      if (!workspaceId) {
        console.error("Workspace not found");
        return null;
      }

      const responseObject = await postWithAuth("/api/note/block/batch-update", {
        parentId: currentBlock.parentId,
        workspaceId: workspaceId,
        blocks: [
          {
            _id: id,
            content: updatedValue,
          }
        ],
      });

      if ("error" in responseObject) {
        console.error("Error updating note:", responseObject.error);
        toast.error("Error in  updatin Title");
        // Rollback optimistic update
        updateBlock(id, { value: currentBlock.value });
        return null;
      }

      // For compatibility, still return the nodes array
      // This maintains the existing interface for components using this hook
      // const data = await getWithAuth<Node[]>("/api/note/getNoteParent");
      // if (!Array.isArray(data)) {
      //   console.error("Unexpected response:", data);
      //   return null;
      // }

      // return responseObject;
    } catch (err) {
      console.error("Error in UpdateNote:", err);
      toast.error("Error in UpdateNote ");
      return null;
    }
  };

  const DeleteNote = async (blockId: string) => {
    // Get current block to store for rollback
    const currentBlock = getBlock(blockId);
    if (!currentBlock) {
      console.error("Block not found:", blockId);
      toast.error("Page not found");
      return null;
    }

    // Store original values for rollback (at function scope for catch block access)
    const pageType = (currentBlock.value as any).pageType;
    const isRootPage = currentBlock.parentType === "workspace" || currentBlock.parentType === "workarea" || currentBlock.parentType === "collection";
    const parentId = currentBlock.parentId;

    // For child pages, get parent and store original blockIds
    let parentBlock: ReturnType<typeof getBlock> = undefined;
    let originalParentBlockIds: string[] = [];

    if (!isRootPage && parentId) {
      console.log("Deleting the child page for parent ID ", parentId);
      parentBlock = getBlock(parentId);
      if (parentBlock) {
        originalParentBlockIds = parentBlock.blockIds ? [...parentBlock.blockIds] : [];
      }
    }

    try {
      // Optimistic deletion from block context
      removeBlock(blockId);

      if (isRootPage && pageType !== "Viewdatabase_Note") {
        // For root pages: Remove from sidebar order lists
        removePage(blockId);
      }
      else if (parentBlock && parentBlock.blockIds) {
        // For child pages: Remove from parent's blockIds array
        const updatedBlockIds = parentBlock.blockIds.filter((id: string) => id !== blockId);
        updateBlock(parentId, { blockIds: updatedBlockIds });
        console.log("Remove the child ID from parent Block Ids", updatedBlockIds);
      }

      // Validate workspace
      const workspaceId = currentWorkspace?._id;
      if (!workspaceId) {
        console.error("Workspace not found");
        toast.error("Workspace not found");
        // Rollback: restore the block
        addBlock(currentBlock);
        // Rollback based on page type
        if (isRootPage) {
          if (pageType === "public" || pageType === "restricted") {
            movePageToPublic(blockId);
          } else if (pageType === "private") {
            movePageToPrivate(blockId);
          }
        } else if (parentBlock && originalParentBlockIds) {
          updateBlock(parentId, { blockIds: originalParentBlockIds });
        }
        return null;
      }

      // Call delete API
      const response = await deleteWithAuth<true | any>(`/api/note/block/delete/permanent-delete`, {
        body: JSON.stringify({
          blockId,
          workspaceId
        }),
      });
      console.log("Api response for deleting the note ", response);

      if ("error" in response) {
        console.error("Error deleting note:", response.message);
        toast.error("Error deleting the note");
        // Rollback: restore the block
        addBlock(currentBlock);
        // Rollback based on page type
        if (isRootPage) {
          if (pageType === "public" || pageType === "restricted") {
            movePageToPublic(blockId);
          } else if (pageType === "private") {
            movePageToPrivate(blockId);
          }
        } else if (parentBlock && originalParentBlockIds) {
          updateBlock(parentId, { blockIds: originalParentBlockIds });
        }
        return null;
      }

      toast.success("Page deleted successfully");
      return true;
    } catch (err) {
      console.error("Error in DeleteNote:", err);
      toast.error("Error deleting the note");
      // Rollback: restore the block
      addBlock(currentBlock);
      // Rollback based on page type
      if (isRootPage) {
        if (pageType === "public" || pageType === "restricted") {
          movePageToPublic(blockId);
        } else if (pageType === "private") {
          movePageToPrivate(blockId);
        }
      } else if (parentBlock && originalParentBlockIds) {
        updateBlock(parentId, { blockIds: originalParentBlockIds });
      }
      return null;
    }
  };

  const MoveNote = async (noteId: string, isPublicNote: boolean, isRestrictedPage: boolean) => {
    try {
      const currentBlock = getBlock(noteId);
      if (!currentBlock) {
        console.error("Block not found:", noteId);
        toast.error("Page not found");
        return null;
      }

      const workspaceId = currentWorkspace?._id;
      if (!workspaceId) {
        toast.error("Workspace not found");
        return null;
      }

      // Determine new pageType
      let newPageType: "private" | "public" | "restricted";
      if (isPublicNote) {
        newPageType = isRestrictedPage ? "restricted" : "public";
      } else {
        newPageType = "private";
      }

      const originalValue = currentBlock.value;
      const originalPageType = (originalValue as any).pageType;

      // --- Check if source is a child page or a root page ---
      const isChildPage = currentBlock.parentType === "page";
      const sourceParentId = currentBlock.parentId;
      const sourceParentBlock = (isChildPage && sourceParentId) ? getBlock(sourceParentId) : null;

      // --- Source removal ---
      // Child page → remove from parent's blockIds
      // Root page  → remove from root pages order (private/public)
      const isSourcePublic = (originalPageType as string) === "public" || (originalPageType as string) === "restricted";
      const sourceType = isSourcePublic ? "public" : "private";

      let sourcePayloadEntry: any;
      let originalParentBlockIds: string[] = [];

      if (isChildPage && sourceParentBlock) {
        originalParentBlockIds = sourceParentBlock.blockIds ? [...sourceParentBlock.blockIds] : [];
        const newParentBlockIds = originalParentBlockIds.filter((id) => id !== noteId);
        // Optimistic update: remove noteId from parent's blockIds
        updateBlock(sourceParentId!, { blockIds: newParentBlockIds });
        sourcePayloadEntry = {
          parentId: sourceParentId,
          blockIdArray: newParentBlockIds,
          workspaceId,
          typeofChild: "page",
        };
      } else {
        // Root page — derive from root order arrays
        const rootSourceOrder = isSourcePublic ? [...publicPagesOrder] : [...privatePagesOrder];
        const newSourceOrder = rootSourceOrder.filter((id) => id !== noteId);
        sourcePayloadEntry = {
          parentId: workspaceId,
          blockIdArray: newSourceOrder,
          workspaceId,
          typeofChild: sourceType,
        };
      }

      // --- Destination (always root public/private) ---
      const destType = isPublicNote ? "public" : "private";
      const destOrder = isPublicNote ? [...publicPagesOrder] : [...privatePagesOrder];
      const newDestOrder = [...destOrder.filter((id) => id !== noteId), noteId];

      // --- Debug logs ---
      console.log("[MoveNote] isPublicNote:", isPublicNote, "| newPageType:", newPageType);
      console.log("[MoveNote] isChildPage:", isChildPage, "| sourceParentId:", sourceParentId);
      console.log("[MoveNote] originalPageType:", originalPageType, "| isSourcePublic:", isSourcePublic);
      console.log("[MoveNote] destType:", destType, "| newDestOrder:", newDestOrder);
      console.log("[MoveNote] sourcePayloadEntry:", sourcePayloadEntry);

      // --- Optimistic updates ---
      updateBlock(noteId, { value: { ...originalValue, pageType: newPageType } });
      if (isPublicNote) {
        movePageToPublic(noteId);
      } else {
        movePageToPrivate(noteId);
      }

      // --- Build drag-and-drop payload ---
      // Always include source removal + dest addition
      // (skip source removal only if root-to-same-root with no actual section change)
      const skipSourceEntry = !isChildPage && sourceType === destType;
      const dragAndDropinputfieldArray: any[] = [];

      if (!skipSourceEntry) {
        dragAndDropinputfieldArray.push(sourcePayloadEntry);
      }

      dragAndDropinputfieldArray.push({
        parentId: workspaceId,
        blockIdArray: newDestOrder,
        workspaceId,
        typeofChild: destType,
      });

      console.log("[MoveNote] Final payload:", JSON.stringify({
        dragAndDropinputfieldArray,
        updatedBlockInfo: { blockId: noteId, parentType: "workspace", parentId: workspaceId, pageType: newPageType, workareaId: null },
      }, null, 2));

      const response = await postWithAuth("/api/note/block/drag-and-drop", {
        dragAndDropinputfieldArray,
        updatedBlockInfo: {
          blockId: noteId,
          parentType: "workspace",
          parentId: workspaceId,
          pageType: newPageType,
          workareaId: null,
        },
      });

      if ("error" in response || !response.success) {
        console.error("Error moving note:", response);
        toast.error("Error moving page");
        // Rollback
        updateBlock(noteId, { value: originalValue });
        if (isSourcePublic) {
          movePageToPublic(noteId);
        } else {
          movePageToPrivate(noteId);
        }
        return null;
      }

      toast.success(`Page moved to ${newPageType} pages`);
      return true;
    } catch (err) {
      console.error("Error in MoveNote:", err);
      toast.error("Error moving page");
      return null;
    }
  };

  return {
    UpdateNote,
    DeleteNote,
    MoveNote,
  };
}
