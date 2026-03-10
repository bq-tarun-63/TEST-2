// import { postWithAuth } from "@/lib/api-helpers";
// import { toast } from "sonner";

// /**
//  * Reordering Service
//  *
//  * Handles three types of reordering:
//  * 1. Simple reordering: Reorder pages within same section (root level)
//  * 2. Root to Child: Convert root page to child page
//  * 3. Child to Root: Convert child page to root page
//  */

// export interface ReorderParams {
//   workspaceId: string;
//   section: "private" | "public" | "workarea";
//   newOrder: string[];
//   parentId: string; // workspaceId, workAreaId, or page blockId
// }

// export interface MakeChildParams {
//   workspaceId: string;
//   pageId: string;
//   newParentId: string; // The page that will become the parent
//   insertAtIndex?: number; // Position in parent's children
// }

// export interface MakeRootParams {
//   workspaceId: string;
//   pageId: string;
//   targetSection: "private" | "public";
//   insertAtIndex?: number; // Position in root array
//   workAreaId?: string; // If moving to workarea section
// }

// /**
//  * Case 1: Simple Reordering
//  * Reorder pages within the same section (all are root pages or all are children of same parent)
//  */
// export async function reorderPages(params: ReorderParams): Promise<boolean> {
//   const { workspaceId, section, newOrder, parentId } = params;

//   try {
//     // Call drag-and-drop API to update the order
//     const response = await postWithAuth("/api/note/block/drag-and-drop", {
//       parentId: parentId,
//       workspaceId: workspaceId,
//       blockIdArray: newOrder,
//     });

//     if ("error" in response) {
//       console.error("Error reordering pages:", response.error);
//       toast.error("Failed to reorder pages");
//       return false;
//     }

//     return true;
//   } catch (err) {
//     console.error("Error in reorderPages:", err);
//     toast.error("Failed to reorder pages");
//     return false;
//   }
// }

// /**
//  * Case 2: Root Page → Child Page
//  * Convert a root page to become a child of another page
//  */
// export async function makePageChild(params: MakeChildParams): Promise<boolean> {
//   const { workspaceId, pageId, newParentId, insertAtIndex } = params;

//   try {
//     // 1. Update the page's parentId to the new parent
//     const updateResponse = await postWithAuth("/api/note/block/batch-update", {
//       parentId: newParentId,
//       workspaceId: workspaceId,
//       blocks: [
//         {
//           _id: pageId,
//           content: {}, // Will be merged with existing value on backend
//           parentId: newParentId,
//           parentType: "page",
//         }
//       ],
//     });

//     if ("error" in updateResponse) {
//       console.error("Error updating page parent:", updateResponse.error);
//       toast.error("Failed to move page");
//       return false;
//     }

//     // 2. The backend should automatically:
//     //    - Add pageId to parent's blockIds array
//     //    - Remove pageId from workspace's privatePageIds/publicPageIds arrays
//     // This might need to be done in a separate API call if not automatic

//     return true;
//   } catch (err) {
//     console.error("Error in makePageChild:", err);
//     toast.error("Failed to move page");
//     return false;
//   }
// }

// /**
//  * Case 3: Child Page → Root Page
//  * Convert a child page to become a root page in a section
//  */
// export async function makePageRoot(params: MakeRootParams): Promise<boolean> {
//   const { workspaceId, pageId, targetSection, insertAtIndex, workAreaId } = params;

//   try {
//     // Determine the new parentId based on target section
//     const newParentId = workAreaId || workspaceId;
//     const parentType = workAreaId ? "workarea" : "workspace";

//     // 1. Update the page's parentId to workspace or workarea
//     const updateResponse = await postWithAuth("/api/note/block/batch-update", {
//       parentId: newParentId,
//       workspaceId: workspaceId,
//       blocks: [
//         {
//           _id: pageId,
//           content: {}, // Will be merged with existing value on backend
//           parentId: newParentId,
//           parentType: parentType,
//         }
//       ],
//     });

//     if ("error" in updateResponse) {
//       console.error("Error updating page parent:", updateResponse.error);
//       toast.error("Failed to move page to root");
//       return false;
//     }

//     // 2. The backend should automatically:
//     //    - Remove pageId from old parent's blockIds array
//     //    - Add pageId to workspace's privatePageIds/publicPageIds or workarea's pageIds
//     // This might need to be done in a separate API call if not automatic

//     return true;
//   } catch (err) {
//     console.error("Error in makePageRoot:", err);
//     toast.error("Failed to move page to root");
//     return false;
//   }
// }

// /**
//  * Smart reordering function that detects the type of operation needed
//  * and calls the appropriate function
//  */
// export interface SmartReorderParams {
//   workspaceId: string;
//   draggedPageId: string;
//   targetParentId: string; // Can be workspaceId, workAreaId, or page blockId
//   newOrder: string[]; // New order of children under targetParentId
//   oldParentId?: string; // If page was a child, this is the old parent
//   section: "private" | "public" | "workarea";
// }

// export async function smartReorder(params: SmartReorderParams): Promise<boolean> {
//   const { workspaceId, draggedPageId, targetParentId, newOrder, oldParentId, section } = params;

//   // Determine if this is a workspace/workarea (root level) or a page (nested)
//   const isTargetRoot = targetParentId === workspaceId || section === "workarea";
//   const wasRoot = !oldParentId || oldParentId === workspaceId;

//   // Case 1: Simple reordering (no parent change)
//   if (oldParentId === targetParentId) {
//     console.log("Case 1: Simple reordering");
//     return await reorderPages({
//       workspaceId,
//       section,
//       newOrder,
//       parentId: targetParentId,
//     });
//   }

//   // Case 2: Root → Child (was at root, now nested under a page)
//   if (wasRoot && !isTargetRoot) {
//     console.log("Case 2: Root → Child");
//     const indexInParent = newOrder.indexOf(draggedPageId);
//     return await makePageChild({
//       workspaceId,
//       pageId: draggedPageId,
//       newParentId: targetParentId,
//       insertAtIndex: indexInParent >= 0 ? indexInParent : undefined,
//     });
//   }

//   // Case 3: Child → Root (was nested, now at root)
//   if (!wasRoot && isTargetRoot) {
//     console.log("Case 3: Child → Root");
//     const indexInRoot = newOrder.indexOf(draggedPageId);
//     return await makePageRoot({
//       workspaceId,
//       pageId: draggedPageId,
//       targetSection: section === "workarea" ? "private" : section, // Default to private if workarea
//       insertAtIndex: indexInRoot >= 0 ? indexInRoot : undefined,
//       workAreaId: section === "workarea" ? targetParentId : undefined,
//     });
//   }

//   // Fallback: Just reorder
//   return await reorderPages({
//     workspaceId,
//     section,
//     newOrder,
//     parentId: targetParentId,
//   });
// }
