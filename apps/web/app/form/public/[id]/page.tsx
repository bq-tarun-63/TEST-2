"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getWithAuth } from "@/lib/api-helpers";
import FormPreviewModal from "@/components/tailwind/board/formView/FormPreviewModal";
import type { DatabaseSource, View } from "@/types/board";
import { useBoard } from "@/contexts/boardContext";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";

const ACCESS_DENIED_MESSAGE =
  "You may not have access, or it might have been deleted or moved. Check the link and try again.";

export default function PublicFormPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { setCurrentView, setDataSources } = useBoard();
  const [formData, setFormData] = useState<{viewCollection: Block} | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { upsertBlocks } = useGlobalBlocks();

  useEffect(() => {
    async function fetchFormData() {
      if (!params || !params.id) {
        setError("Form ID is required");
        setLoading(false);
        return;
      }

      const blockId = params.id as string;
      const viewTypeId = searchParams?.get("viewTypeId");
      let workspaceId = "";

      if (!viewTypeId) {
        setError("View type ID is required in the form link");
        setLoading(false);
        return;
      }

      try {
        // Use the public form API route from commit 3d89210
        const responseData = await getWithAuth(`/api/public/form?blockId=${encodeURIComponent(blockId)}&viewId=${encodeURIComponent(viewTypeId)}`) as {
          success?: boolean;
          view?: View;
          dataSource?: DatabaseSource;
          workspaceId?: string;
          message?: string;
        };

        if (!responseData.success || !responseData.view) {
          setError(responseData.message || "Failed to load form");
          setLoading(false);
          return;
        }

        const formView = responseData.view;


        if (formView.isPublicForm === "private" || formView.isPublicForm === "workspace-only" ||!formView.isPublicForm) {
          setError(ACCESS_DENIED_MESSAGE);
          setLoading(false);
          return;
        }

        if(responseData.workspaceId) {
          workspaceId = responseData.workspaceId;
        }

        if(responseData.dataSource) {
          const ds = responseData.dataSource;
          const dsId = ds._id || formView.databaseSourceId || "";
          setDataSources({ [dsId]: ds });
        }

        // Create a minimal board object (we don't need the full viewCollection)
        const fetchedBoard: Block = {
          _id: blockId,
          blockType: "collection_view",
          workspaceId: workspaceId,
          workareaId: null,
          parentId: formView.viewDatabaseId || "",
          parentType: "page",
          value: {
            title: "My task board",
            viewsTypes: [formView],
          },
          status: "alive"
        };

        setFormData({
          viewCollection: fetchedBoard,
        });

        // Add board to context
        upsertBlocks([fetchedBoard]);

        // Set current view to the form view
        setCurrentView(fetchedBoard._id, formView._id || viewTypeId, formView.viewType);
      } catch (err) {
        console.error("Error fetching form:", err);
        setError("Failed to load form. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    void fetchFormData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id, searchParams?.get("viewTypeId")]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Error</h1>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">This page couldn’t be found</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error || "Form not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <FormPreviewModal
      board={formData.viewCollection}
      onClose={() => {}}
      isPageMode={true}
    />
  );
}

