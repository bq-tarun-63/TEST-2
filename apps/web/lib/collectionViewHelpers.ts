import { ViewCollection } from "@/types/board";
import { toast } from "sonner";

/**
 * Updates a collection_view block in global block context and syncs with backend
 * This ensures optimistic updates happen first, then API call, then sync with server response
 */
export async function updateCollectionViewBlock({
  blockId,
  updatedValue,
  apiCall,
  globalBlocks,
  onSuccess,
  onError,
}: {
  blockId: string;
  updatedValue: ViewCollection; // The new value to set
  apiCall: () => Promise<any>; // API call function that returns the response
  globalBlocks: {
    getBlock: (blockId: string) => any;
    updateBlock: (blockId: string, updates: any) => void;
  };
  onSuccess?: (response: any) => void;
  onError?: (error: Error) => void;
}) {
  // Get current block
  const block = globalBlocks.getBlock(blockId);
  if (!block || block.blockType !== "collection_view") {
    throw new Error("Collection view block not found");
  }

  const previousValue = block.value as ViewCollection;

  // Optimistic update: Update global block context first
  globalBlocks.updateBlock(blockId, { value: updatedValue });

  try {
    // Make API call
    const response = await apiCall();

    console.log("updateCollectionViewBlock response:", response);
    // Update with server response if available
    // if (response?.view?.value) {
    //   globalBlocks.updateBlock(blockId, { value: response.view.value });
    // }
    //  else if (response?.view) {
    //   // If response contains updated block, use it
    //   const updatedBlock = response.view;
    //   if (updatedBlock.value) {
    //     globalBlocks.updateBlock(blockId, { value: updatedBlock.value });
    //   }
    // }

    if (onSuccess) {
      onSuccess(response);
    }

    return response;
  } catch (error) {
    // Revert optimistic update on error
    globalBlocks.updateBlock(blockId, { value: previousValue });

    const err = error instanceof Error ? error : new Error(String(error));
    if (onError) {
      onError(err);
    } else {
      toast.error(`Failed to update: ${err.message}`);
    }
    throw err;
  }
}
