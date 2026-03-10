"use client";
import { useNoteContext } from "@/contexts/NoteContext";
import { useWorkAreaContext } from "@/contexts/workAreaContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { type ApiErrorResponse, getWithAuth } from "@/lib/api-helpers";
import { useEffect, useRef, useState } from "react";

import type { Node } from "@/types/note";
import { toast } from "sonner";
import { Block } from "@/types/block";

interface UseFetchRootNodesResult {
  // rootNodes: Node[];
  isLoading: boolean;
  hasInitialized: boolean;
  refetch: () => void;
}

interface SidebarInitials { sidebarData: SidebarData; pages: Block[] }

interface SidebarData {
  private_pages: string[];
  public_pages: string[];
  work_areas: string[];
  shared_pages: string[];
  sidebar_order: string[];
  template_pages: string[];
}


const CACHE_DURATION = 2 * 1000; // 2 seconds cache

const useFetchRootNodes = (): UseFetchRootNodesResult => {
  // const [rootNodes, setRootNodes] = useState<Node[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasInitialized, setHasInitialized] = useState<boolean>(false);
  const isFetchingRef = useRef(false);
  const { currentWorkspace } = useWorkspaceContext();

  const { reorderPrivate, reorderPublic, reorderWorkArea, reorderShared, setSidebarOrder, reorderTemplates } = useRootPagesOrder();
  const { upsertBlocks } = useGlobalBlocks();

  const fetchData = async () => {
    // Prevent multiple simultaneous calls
    if (isFetchingRef.current) {
      return;
    }

    setIsLoading(true);
    isFetchingRef.current = true;

    try {
      if (!currentWorkspace?._id) {
        isFetchingRef.current = false;
        return;
      }
      const workspaceId = currentWorkspace._id;
      const response = await getWithAuth<SidebarInitials>(`/api/sidebar-initials/${workspaceId}`);
      const data = response;
      // Check if the response is an error
      if ("isError" in data && data.isError) {
        const errorResponse = data as ApiErrorResponse;
        if (errorResponse.status === 401) {
          toast.error("You need to log in to view your notes");
        } else if (errorResponse.status === 403) {
          toast.error("You don't have permission to view notes");
        } else {
          toast.error(errorResponse.message || "Failed to load your notes. Please try again.");
        }
      }
      const { sidebarData, pages } = response as SidebarInitials;
      console.log("Using Printing the reponse for sidebar-initials..", sidebarData, pages);

      // 1. Load Blocks into BlockContext
      // Group workArea pages by their parent workareaId
      const workareaPagesByWorkarea: Record<string, string[]> = {};

      if (pages && sidebarData) {
        await upsertBlocks(pages);

        pages.forEach(block => {
          if(block.parentType === 'workarea' && block.parentId ){
            const parentWorkareaId = block.parentId;
            if(!workareaPagesByWorkarea[parentWorkareaId]) {
              workareaPagesByWorkarea[parentWorkareaId] = []
            }
            workareaPagesByWorkarea[parentWorkareaId]?.push(block._id)
          }
        })
      }

      console.log("- Blocks:", pages?.length || 0);
      console.log("- Private Pages:", sidebarData?.private_pages.length || 0);
      console.log("- Public Pages:", sidebarData?.public_pages.length || 0);
      // console.log("- Work Area Pages (flat from API):", sidebarData?.work_areas.length || 0);
      console.log("- Work Area Pages (grouped by workAreaId):", workareaPagesByWorkarea);
      console.log("- Shared Pages:", sidebarData.shared_pages.length);
      console.log("- Sidebar Order:", sidebarData?.sidebar_order.length || 0);
      console.log("- Sidebar Data:", sidebarData.template_pages || 0);


      // 2. Set the root pages order
      if (sidebarData) {
        let order = sidebarData.sidebar_order || [];
        // Ensure standard sections exist
        if (!order.includes("workarea")) order.push("workarea");
        if (!order.includes("private")) order.push("private");
        if (!order.includes("public")) order.push("public");
        if (!order.includes("templates")) order.push("templates");
        if (!order.includes("shared")) order.push("shared");

        setSidebarOrder(order);
        reorderPrivate(sidebarData.private_pages);
        reorderPublic(sidebarData.public_pages);
        reorderWorkArea(workareaPagesByWorkarea);
        reorderTemplates(sidebarData.template_pages || []);
        reorderShared(sidebarData.shared_pages);
      }

    } catch (err) {
      console.error("Failed to fetch notes:", err);
      toast.error("Failed to load your notes. Please try again.");
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
      setHasInitialized(true);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentWorkspace?._id]);

  return {
    // rootNodes,
    isLoading,
    hasInitialized,
    refetch: fetchData,
  };
};

export default useFetchRootNodes;
