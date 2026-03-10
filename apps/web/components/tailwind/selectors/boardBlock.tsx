"use client";

import React from "react";
import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import BoardTitle from "@/components/tailwind/board/boardTitle";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import BoardContainer from "../board/boardContainer";
import { getWithAuth, postWithAuth } from "@/lib/api-helpers";
import { useBoard } from "@/contexts/boardContext";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { updateCollectionViewBlock } from "@/lib/collectionViewHelpers";
import { Block } from "@/types/block";
import { ViewCollection } from "@/types/board";
import { useLazyBlockLoader } from "@/hooks/use-lazy-block-loader";
import { useEditor } from "novel";

interface BoardBlockProps extends NodeViewProps {
  initialBoard?: any;
}

export default function BoardBlock({ node, initialBoard }: BoardBlockProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const editorContext = useEditor();
  const editor = editorContext?.editor;

  const { blockId } = (node as { attrs: { blockId?: string } }).attrs;
  const { getBlock, updateBlock, upsertBlocks } = useGlobalBlocks();
  const [datasourceLoading, setDatasourceLoading] = useState(true);
  const {
    setCurrentView,
    setDataSources,
    updateDataSource,
    dataSources,
    currentView
  } = useBoard();

  const { loadBlocks } = useLazyBlockLoader();
  const lastSyncedUrlViewId = React.useRef<string | null>(null);

  // Get collection_view block from global block context and fetch datasources
  useEffect(() => {
    if (!blockId) {
      setDatasourceLoading(false);
      return;
    }

    const collectionViewBlock = getBlock(blockId);

    if (!collectionViewBlock) {
      console.warn("Collection view block not found in global context:", blockId);
      setDatasourceLoading(false);
      return;
    }

    if (collectionViewBlock.blockType !== "collection_view") {
      console.error("Block is not a collection_view:", blockId);
      setDatasourceLoading(false);
      return;
    }

    const viewDatabase = collectionViewBlock.value as ViewCollection;

    // Extract datasource IDs from viewsTypes
    const datasourceIds = new Set<string>();
    viewDatabase.viewsTypes?.forEach((vt) => {
      if (vt.databaseSourceId) {
        datasourceIds.add(vt.databaseSourceId);
      }
    });

    // Fetch datasources and their blocks - check context first to avoid duplicate API calls
    (async () => {
      try {
        const dataSourcesMap: Record<string, any> = {};
        const datasourceIdsToFetch: string[] = [];

        // Check which datasources are already in context
        Array.from(datasourceIds).forEach((dataSourceId) => {
          const existingDataSource = dataSources[dataSourceId];
          if (existingDataSource) {
            // Already in context, use it
            dataSourcesMap[dataSourceId] = existingDataSource;
          } else {
            // Not in context, need to fetch
            datasourceIdsToFetch.push(dataSourceId);
          }
        });

        // Fetch only datasources that are not in context
        await Promise.all(
          datasourceIdsToFetch.map(async (dataSourceId) => {
            try {
              const dsRes = await getWithAuth(`/api/database/getdataSource/${dataSourceId}`) as {
                success?: boolean;
                collection?: {
                  dataSource?: any;
                  blocks: Block[]; // Changed from notes to blocks
                }
              };

              console.log("Fetched data source:", dsRes);

              if (dsRes?.success && dsRes.collection?.dataSource) {
                const ds = dsRes.collection.dataSource;
                const dsId = ds._id || dataSourceId;

                dataSourcesMap[dsId] = ds;

                // Store blocks in global block context
                const blocks = dsRes.collection.blocks || [];
                if (blocks.length > 0) {
                  upsertBlocks(blocks);
                }

                // Call the lazy loader to fetch nested blocks/ensure completeness
                // This is done regardless of whether immediate blocks were returned
                if (ds.blockIds && ds.blockIds.length > 0) {
                  console.log(`[BoardBlock] Triggering lazy load for nested/full blocks. Count: ${ds.blockIds.length}`);
                  loadBlocks(ds.blockIds);
                }
              }
            } catch (err) {
              console.error(`Failed to fetch data source ${dataSourceId}:`, err);
            }
          })
        );

        // Set datasources in board context (only new ones)
        const newDataSources: Record<string, any> = {};
        Object.keys(dataSourcesMap).forEach((dsId) => {
          if (!dataSources[dsId]) {
            newDataSources[dsId] = dataSourcesMap[dsId];
          }
        });
        if (Object.keys(newDataSources).length > 0) {
          setDataSources({ ...dataSources, ...newDataSources });
        }

        setDatasourceLoading(false);
      } catch (err) {
        console.error("Failed to fetch datasources:", err);
        setDatasourceLoading(false);
      }
    })();
  }, [blockId, getBlock, upsertBlocks, loadBlocks]); // Removed searchParams

  // Sync URL -> Board Context
  useEffect(() => {
    if (!blockId || datasourceLoading) return;

    const collectionViewBlock = getBlock(blockId)!;
    if (!collectionViewBlock || collectionViewBlock.blockType !== "collection_view") return;

    const viewDatabase = collectionViewBlock.value as ViewCollection;
    const internalViewIdFromUrl = searchParams.get("view");
    const vParam = searchParams.get("v");
    const bid = blockId as string;
    const activeViewInContext = currentView[bid];

    // Only initialize/sync from URL if we are in the standalone view for THIS block (v param)
    // OR if we explicitly have a view parameter (deep link)
    if ((vParam === blockId || internalViewIdFromUrl) && internalViewIdFromUrl) {
      if (internalViewIdFromUrl !== lastSyncedUrlViewId.current) {
        lastSyncedUrlViewId.current = internalViewIdFromUrl;
        const targetView = viewDatabase.viewsTypes?.find((vt) => vt._id === internalViewIdFromUrl);
        if (targetView && activeViewInContext?.id !== internalViewIdFromUrl) {
          setCurrentView(blockId, internalViewIdFromUrl, targetView.viewType);
        }
      }
    } else if (!activeViewInContext) {
      // Fallback to first view if nothing is active (e.g., initial load in editor mode or first visit)
      const firstView = viewDatabase.viewsTypes?.[0];
      if (firstView?._id) {
        setCurrentView(blockId, firstView._id, firstView.viewType);
      }
    }
  }, [blockId, getBlock, searchParams, setCurrentView, datasourceLoading]);

  // Handle View Change Override: Explicitly sync Context and URL on user interaction
  const handleViewChangeOverride = (viewId: string) => {
    if (!blockId) return;

    // Resolve Block Data
    const collectionViewBlock = getBlock(blockId);
    if (!collectionViewBlock || collectionViewBlock.blockType !== "collection_view") return;
    const viewDatabase = collectionViewBlock.value as ViewCollection;

    const targetView = viewDatabase.viewsTypes?.find((vt) => vt._id === viewId);
    if (!targetView) return;

    // 1. Update Context (Immediate UI feedback)
    setCurrentView(blockId, viewId, targetView.viewType);

    // 2. Update Ref (Prevent URL->Context echo)
    lastSyncedUrlViewId.current = viewId;

    // 3. Update URL explicitly ONLY if we are in standalone mode
    const vParam = searchParams.get("v");
    if (vParam === blockId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", viewId);
      const newUrl = `${pathname}?${params.toString()}`;
      // Use history.replaceState to avoid Next.js navigation cycle which causes flickering
      window.history.replaceState(null, "", newUrl);
    }
  };

  const handleBoardRename = async (newTitle: string) => {
    if (!blockId) return;

    const collectionViewBlock = getBlock(blockId);
    if (!collectionViewBlock || collectionViewBlock.blockType !== "collection_view") return;

    const currentValue = collectionViewBlock.value as ViewCollection;
    const previousTitle = currentValue.title || "";

    try {
      await updateCollectionViewBlock({
        blockId,
        updatedValue: {
          ...currentValue,
          title: newTitle,
        },
        apiCall: async () => {
          const res = await postWithAuth('/api/database/updateViewName', {
            blockId,
            title: newTitle
          });
          if (!res?.view) {
            throw new Error(res?.message || "Failed to update board title");
          }
          return res;
        },
        globalBlocks: { getBlock, updateBlock },
        onError: (error) => {
          console.error("Failed to update board title:", error);
        },
      });
    } catch (err) {
      console.error("Board rename error:", err);
    }
  };

  const handleIconChange = async (newIcon: string) => {
    if (!blockId) return;

    const collectionViewBlock = getBlock(blockId);
    if (!collectionViewBlock || collectionViewBlock.blockType !== "collection_view") return;

    const currentValue = collectionViewBlock.value as ViewCollection;

    try {
      await updateCollectionViewBlock({
        blockId,
        updatedValue: {
          ...currentValue,
          icon: newIcon,
        },
        apiCall: async () => {
          // Re-using updateViewName since it updates the generic metadata
          // Assuming backend supports this or has a specific property patcher. Note:
          // The title needs to be passed to fulfill the required param, we just pass the existing title
          const res = await postWithAuth('/api/database/updateViewName', {
            blockId,
            title: currentValue.title,
            icon: newIcon,
          });
          if (!res?.view) {
            throw new Error(res?.message || "Failed to update board icon");
          }
          return res;
        },
        globalBlocks: { getBlock, updateBlock },
        onError: (error) => {
          console.error("Failed to update board icon:", error);
        },
      });
    } catch (err) {
      console.error("Board icon update error:", err);
    }
  };

  // Added this useEffect for boardDeletionGuard 
  useEffect(() => {
    (window as any).__globalBlocks = {
      getBlock,
      updateBlock,
    };
  }, [getBlock, updateBlock,]);


  return (
    <NodeViewWrapper
      className="
        bg-card text-card-foreground dark:bg-background
        shadow-sm pt-0 pb-2
        transition-colors
        w-full  mb-4
      "
      data-type="view_collection"
      onDragStart={(e) => e.stopPropagation()}
      onDragOver={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}
      onDragEnter={(e) => e.stopPropagation()}
      onDragLeave={(e) => e.stopPropagation()}
    >
      <div
        className="w-full"
        contentEditable={false} // CRITICAL: Stop browser from placing cursor in this DOM tree
        onClick={(e) => {
          // If the user clicks inside the board, explicitly tell Prosemirror to drop its focus
          // so the generic placeholder disappears and typing ignores the editor.
          if (editor && editor.isFocused) {
            editor.commands.blur();
          }
        }}
        onMouseDown={(e) => {
          // If the user clicks inside the board, explicitly tell Prosemirror to drop its focus
          // so the generic placeholder disappears and typing ignores the editor.
          if (editor && editor.isFocused) {
            editor.commands.blur();
          }
        }}
      >
        {/* Editable Title */}
        {(() => {
          const collectionViewBlock = getBlock(blockId!);
          const viewDatabase = collectionViewBlock?.blockType === "collection_view"
            ? (collectionViewBlock.value as ViewCollection)
            : null;
          const boardTitle = viewDatabase?.title || 'My task Board';
          const boardIcon = viewDatabase?.icon || '';

          return (
            <BoardTitle
              initialTitle={boardTitle}
              initialIcon={boardIcon}
              onChange={(newTitle) => {
                if (newTitle !== boardTitle) {
                  handleBoardRename(newTitle);
                }
              }}
              onIconChange={(newIcon) => {
                if (newIcon !== boardIcon) {
                  handleIconChange(newIcon);
                }
              }}
            />
          );
        })()}

        <div className="">
          <div className="w-full max-w-full">
            {blockId && <BoardContainer boardId={blockId} datasourceLoading={datasourceLoading} onViewChangeOverride={handleViewChangeOverride} />}
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
