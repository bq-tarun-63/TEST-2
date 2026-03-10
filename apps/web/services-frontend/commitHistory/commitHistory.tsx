// commitUtils.ts
import { postWithAuth } from "@/lib/api-helpers";
import { defaultEditorContent } from "@/lib/content";
import { Block } from "@/types/block";
import { reconstructDocumentFromBlocksArray } from "@/utils/blockParser";
import { JSONContent } from "novel";
import { toast } from "sonner";

interface CommitCache {
  [key: string]: any;
}

function createHistoryManager() {
  let cache: CommitCache = {};
  let originalContent: any = null;
  const LOCAL_STORAGE_KEY = "commitCache";

  // // Load from localStorage when initializing
  // function loadFromLocalStorage() {
  //   try {
  //     const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  //     if (stored) {
  //       cache = JSON.parse(stored);
  //     }
  //   } catch (e) {
  //     console.error("Failed to load commit cache from localStorage", e);
  //   }
  // }

  // // Save to localStorage
  // function saveToLocalStorage() {
  //   try {
  //     localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
  //   } catch (e) {
  //     console.error("Failed to save commit cache", e);
  //   }
  // }

  // Store original content before viewing history
  function storeOriginalContent(content: any) {
    originalContent = content;
    localStorage.setItem("originalContent", JSON.stringify(content));
  }

  // Get original content
  function getOriginalContent() {
    if (originalContent) return originalContent;
    try {
      const stored = localStorage.getItem("originalContent");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  // Clear original content
  function clearOriginalContent() {
    originalContent = null;
    localStorage.removeItem("originalContent");
  }


  // Fetch commit history
  async function fetchHistory(parentId: string) {
    try {
      const response = await postWithAuth("/api/snapshot/history", { parentId });

      if ("isError" in response && response.isError) {
        toast.error("Failed to load version history");
        return null;
      }
      console.log("Fetched commit history:", response);

      return response.success ? response.commits : null;
    } catch (error) {
      toast.error("Failed to load version history");
      return null;
    }
  }

  // Load commit content (with caching + localStorage)
  async function loadSelectedVersionContent(noteId: string, version: string, getBlock, returnBlocksData = false) {
    console.log("=== COMMIT MANAGER DEBUG ===");
    console.log("Loading content for noteId:", noteId, "version", version);

    try {
      console.log("Making API call for commit content");
      const response = await postWithAuth("/api/snapshot/content", {
        parentId: noteId,
        version: version,
      });

      console.log("API response:", response);

      if (!response || response.isError) {
        console.log("API returned error or no response");
        return null;
      }

      let onlineContent: JSONContent | null = null;

      if (response.blocks && Array.isArray(response.blocks)) {

        let parentBlock = getBlock(noteId);
        if (parentBlock && response.blockIds) {
          // Create a parent block with historical blockIds for reconstruction
          parentBlock = { ...parentBlock, blockIds: response.blockIds }

          const allBlocks = [...response.blocks, parentBlock];

          try {
            // Pass historical blockIds as override to parser - this avoids updating global context
            const reconstructedDoc = reconstructDocumentFromBlocksArray(parentBlock._id, allBlocks, response.blockIds);
            console.log('............[HistoryEditor] Reconstructed document from blocks:', reconstructedDoc);
            if (reconstructedDoc.type === "doc") {
              onlineContent = reconstructedDoc;
            }
          } catch {
            console.log(" error in constructing block")
          }
        }

        // If returnBlocksData is true, return both content and blocks data
        if (returnBlocksData) {
          return {
            content: onlineContent,
            blocks: response.blocks || [],
            blockIds: response.blockIds || [],
            dataSources: response.dataSources || []
          };
        }

        return onlineContent;
      }
      console.log("Content type is not 'doc'");
      return null;
    } catch (error) {
      console.error("Failed to load commit content:", error);
      return null;
    }
  }

  return {
    storeOriginalContent,
    getOriginalContent,
    clearOriginalContent,
    fetchHistory,
    loadSelectedVersionContent,
  };
}

// Singleton instance
export const historyManager = createHistoryManager();

// Named exports
export const {
  storeOriginalContent,
  getOriginalContent,
  clearOriginalContent,
  fetchHistory,
  loadSelectedVersionContent,
} = historyManager;
