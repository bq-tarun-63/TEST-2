// components/editor/EditorHeader.tsx
"use client";

import type React from "react";
import { type RefObject, useState, useEffect, useRef } from "react";
import EmojiPicker from "./EmojiPicker";
import { postWithAuth } from "@/lib/api-helpers";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";

interface EditorHeaderProps {
  editorKey: string;
  setEditing: (value: boolean) => void;
  editing: boolean;
  readOnly: boolean;
  inputRef: RefObject<HTMLParagraphElement>;
  showCommitHistory: boolean;
  toast: any;
  coverUrl?: string | null;
  onAddCover?: () => void;
  titleIcon?: string; // Fallback if block context doesn't have icon

  // selectedNoteId: string; // Not needed
  // activeEmoji: string; // Not needed
  // noteType: string; // Not needed for block-based system
  // noteOwnerMail: string | null; // Not needed
  // parentId: string | null; // Now from block context
  // user: any; // Not needed
  // rootNodes: any; // Not needed
  // setNotes: React.Dispatch<any>; // Not needed
  // updateTitleDeep: (nodes: any, key: string, newTitle: string) => any; // Not needed
  // editorTitle: string; // Now from block context
  // activeTitle: string; // Not needed
  // pendingTitle: string; // Not needed
  // isTitleDirtyRef: React.MutableRefObject<boolean>; // Not needed
  // pendingTitleMap: React.MutableRefObject<Record<string, string>>; // Not needed
  // updateNoteWithQuery: ( // Not needed - using block API
  //   key: string,
  //   newTitle: string,
  //   parentId: string | null,
  //   titleIcon: string,
  //   coverUrl?: string | null,
  // ) => Promise<any>;
  // queryClient: any; // Not needed
  // isOwner: (mail?: string | null, hasParent?: boolean, user?: { email?: string } | null) => boolean; // Not needed
  iconClassName?: string;
  titleClassName?: string;
  onTitleChange?: (newTitle: string) => void;
}

// Collection of emojis for random selection
export const EMOJI_COLLECTION = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😊",
  "😍",
  "🥰",
  "😎",
  "🤓",
  "🧐",
  "🤩",
  "🥳",
  "😇",
  "🙂",
  "🙃",
  "😉",
  "😌",
  "😋",
  "😛",
  "😜",
  "🤪",
  "😝",
  "🤗",
  "🤭",
  "🤫",
  "🤔",
  "🤐",
  "🤨",
  "😐",
  "😑",
  "💙",
  "💚",
  "💛",
  "🧡",
  "❤️",
  "💜",
  "🖤",
  "🤍",
  "🤎",
  "💔",
  "❤️‍🔥",
  "❤️‍🩹",
  "💕",
  "💞",
  "💓",
  "💗",
  "💖",
  "💘",
  "💝",
  "💟",
  "🔥",
  "⭐",
  "🌟",
  "✨",
  "⚡",
  "💥",
  "💫",
  "🌈",
  "☀️",
  "🌙",
  "⚽",
  "🏀",
  "🏈",
  "⚾",
  "🎾",
  "🏐",
  "🏉",
  "🥎",
  "🏓",
  "🏸",
  "🎨",
  "🎭",
  "🎪",
  "🎬",
  "🎤",
  "🎧",
  "🎼",
  "🎹",
  "🎺",
  "🎸",
  "📚",
  "📖",
  "📝",
  "✏️",
  "✒️",
  "🖊️",
  "🖋️",
  "📔",
  "📕",
  "📗",
  "💻",
  "🖥️",
  "⌨️",
  "🖱️",
  "🖨️",
  "💾",
  "💿",
  "📱",
  "☎️",
  "📞",
  "🚀",
  "🛸",
  "🛰️",
  "💺",
  "🚁",
  "✈️",
  "🛩️",
  "🚂",
  "🚃",
  "🚄",
  "🏠",
  "🏡",
  "🏢",
  "🏣",
  "🏤",
  "🏥",
  "🏦",
  "🏨",
  "🏩",
  "🏪",
  "🌍",
  "🌎",
  "🌏",
  "🗺️",
  "🧭",
  "⛰️",
  "🏔️",
  "🗻",
  "🏕️",
  "🏖️",
  "🍕",
  "🍔",
  "🍟",
  "🌭",
  "🍿",
  "🧂",
  "🥓",
  "🥚",
  "🍳",
  "🧇",
  "☕",
  "🍵",
  "🧃",
  "🥤",
  "🧋",
  "🍺",
  "🍻",
  "🥂",
  "🍷",
  "🥃",
  "🎯",
  "🎲",
  "🎰",
  "🎮",
  "🎳",
  "🧩",
  "♟️",
  "🎱",
  "🔮",
  "🧸",
];

// Function to get a random emoji
const getRandomEmoji = (): string => {
  const randomIndex = Math.floor(Math.random() * EMOJI_COLLECTION.length);
  return EMOJI_COLLECTION[randomIndex] || "😀";
};

export default function EditorHeader({
  // Block-based props (primary)
  editorKey,
  setEditing,
  editing,
  readOnly,
  inputRef,
  showCommitHistory,
  toast,
  coverUrl,
  onAddCover,
  titleIcon,
  // selectedNoteId,
  // activeEmoji,
  // noteType,
  // noteOwnerMail,
  // parentId,
  // user,
  // rootNodes,
  // setNotes,
  // updateTitleDeep,
  // editorTitle,
  // activeTitle,
  // pendingTitle,
  // isTitleDirtyRef,
  // pendingTitleMap,
  // updateNoteWithQuery,
  // queryClient,
  // isOwner,
  iconClassName,
  titleClassName,
  onTitleChange,
}: EditorHeaderProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { updateBlock, getBlock } = useGlobalBlocks();
  const { currentWorkspace } = useWorkspaceContext();

  // Get icon, title, and cover from block context (block-based system)
  const pageBlock = getBlock(editorKey);
  const blockIcon = pageBlock?.blockType === 'page'
    ? (pageBlock.value as any)?.icon || ""
    : "";
  const blockTitle = pageBlock?.blockType === 'page'
    ? (pageBlock.value as any)?.title || ""
    : "";
  const blockCoverUrl = pageBlock?.blockType === 'page'
    ? (pageBlock.value as any)?.coverURL || null
    : null;

  // Use block context values, fallback to props if needed
  const displayIcon = blockIcon || titleIcon || "";
  const displayTitle = blockTitle || "";
  const displayCoverUrl = blockCoverUrl || coverUrl || null;

  const initialTitleRef = useRef(displayTitle);

  useEffect(() => {
    if (!editing) {
      initialTitleRef.current = displayTitle;
    }
  }, [editing, displayTitle]);

  // Sync title element's innerText when displayTitle changes (but not when editing)
  useEffect(() => {
    if (inputRef.current && !editing && inputRef.current.innerText !== displayTitle) {
      inputRef.current.innerText = displayTitle;
    }
  }, [displayTitle, editing, inputRef]);

  // Focus title input when editing mode is activated
  useEffect(() => {
    if (editing && inputRef.current && !readOnly) {
      // Small delay to ensure the element is contentEditable before focusing
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();

          // Move cursor to the end of the text
          try {
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(inputRef.current);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
          } catch (e) {
            console.error("Error setting cursor position:", e);
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [editing, readOnly, inputRef]);

  // Helper function to update icon everywhere
  const updateIcon = async (newIcon: string) => {
    // Get the page block
    if (!pageBlock) {
      console.error("Page block not found:", editorKey);
      return;
    }

    // Store original value for rollback
    const originalValue = pageBlock.value;

    // Optimistic update in block context
    const updatedValue = {
      ...pageBlock.value,
      icon: newIcon || "",
    };
    updateBlock(editorKey, { value: updatedValue });

    // Update in root nodes for UI consistency (if needed)
    // if (!parentId && rootNodes) {
    //   try {
    //     const updateIconDeep = (nodes: any[], key: string, newIcon: string): any[] => {
    //       return nodes.map((node) => {
    //         if (node.id === key) {
    //           return { ...node, icon: newIcon };
    //         }
    //         if (node.children && node.children.length > 0) {
    //           return {
    //             ...node,
    //             children: updateIconDeep(node.children, key, newIcon),
    //           };
    //         }
    //         return node;
    //       });
    //     };

    //     const updatedRootNodes = updateIconDeep(rootNodes, editorKey, newIcon);
    //     setNotes(updatedRootNodes);
    //     localStorage.setItem("rootNodes", JSON.stringify(updatedRootNodes));
    //   } catch (error) {
    //     console.error("Failed to update icon in localStorage:", error);
    //   }
    // }

    // Persist to server via block API
    try {
      const workspaceId = currentWorkspace?._id;
      if (!workspaceId) {
        throw new Error("Workspace not found");
      }

      // Call API to update the PAGE block
      await postWithAuth("/api/note/block/batch-update", {
        parentId: pageBlock.parentId,
        workspaceId: workspaceId,
        blocks: [
          {
            _id: editorKey,
            content: updatedValue,
          }
        ],
      });

      toast.success(newIcon ? "Icon updated successfully!" : "Icon removed successfully!");
    } catch (error) {
      console.error("Error updating icon:", error);
      toast.error("Failed to update icon");

      // Rollback optimistic updates
      try {
        // Rollback block context
        updateBlock(editorKey, { value: originalValue });

        // Rollback root nodes if updated
        // if (!parentId && rootNodes) {
        //   const updateIconDeep = (nodes: any[], key: string, newIcon: string): any[] => {
        //     return nodes.map((node) => {
        //       if (node.id === key) {
        //         return { ...node, icon: newIcon };
        //       }
        //       if (node.children && node.children.length > 0) {
        //         return {
        //           ...node,
        //           children: updateIconDeep(node.children, key, newIcon),
        //         };
        //       }
        //       return node;
        //     });
        //   };

        //   const updatedRootNodes = updateIconDeep(rootNodes, editorKey, newIcon);
        //   setNotes(updatedRootNodes);
        //   localStorage.setItem("rootNodes", JSON.stringify(updatedRootNodes));
        // }
      } catch (error) {
        console.error("Failed to update icon in localStorage:", error);
      }
    }

    // Persist to server
    // try {
    //   // Optimistically update the cache before API call
    //   // updateNodeInCache(editorKey, editorTitle, newIcon, coverUrl);

    //   await updateNoteWithQuery(editorKey, editorTitle, parentId, newIcon, coverUrl);

    //   // Force immediate refetch and invalidate all related queries
    //   await queryClient.invalidateQueries({
    //     queryKey: ["notes", "detail", editorKey],
    //   });

    //   // Also invalidate the list queries to update sidebar
    //   await queryClient.invalidateQueries({
    //     queryKey: ["notes"],
    //   });

    //   toast.success(newIcon ? "Icon updated successfully!" : "Icon removed successfully!");
    // } catch (error) {
    //   console.error("Error updating icon:", error);
    //   toast.error("Failed to update icon");

    //   // Rollback optimistic updates
    //   try {
    //     // Rollback cache update
    //     // updateNodeInCache(editorKey, editorTitle, previousIcon, coverUrl);

    //     // Rollback local state updates
    //     if (parentId && previousChildrenNotes) {
    //       // setChildrenNotes(previousChildrenNotes);
    //     } else if (!parentId && previousRootNodes) {
    //       setNotes(previousRootNodes);
    //       localStorage.setItem("rootNodes", JSON.stringify(previousRootNodes));
    //     }

    //     // Invalidate queries to refetch correct data
    //     queryClient.invalidateQueries({
    //       queryKey: ["notes", "detail", editorKey],
    //     });
    //     queryClient.invalidateQueries({
    //       queryKey: ["notes"],
    //     });
    //   } catch (rollbackError) {
    //     console.error("Failed to rollback icon update:", rollbackError);
    //   }
    // }
  };

  // Handler to add a random icon
  const handleAddRandomIcon = async () => {
    const randomEmoji = getRandomEmoji();
    await updateIcon(randomEmoji);
  };

  // Handler to select icon from picker
  const handleSelectEmoji = async (emoji: string) => {
    await updateIcon(emoji);
  };

  // Handler to remove icon
  const handleRemoveIcon = async () => {
    await updateIcon("");
  };

  const canEditHeader = !readOnly && !showCommitHistory;

  return (
    <>
      <div
        className={`relative px-4 pl-12 py-2 pb-0 ${displayCoverUrl ? 'pt-0' : 'pt-12'} bg-white text-gray-900 dark:bg-background dark:text-gray-100`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Page Controls - Books by ReventLabs -style hover buttons */}
        <div
          className="flex items-center gap-0 flex-wrap -ml-px pb-1 pointer-events-auto"
          style={{
            justifyContent: "flex-start",
          }}
        >
          {/* Add Icon - Only show if no icon exists */}
          {!displayIcon && canEditHeader && (
            <button
              type="button"
              onClick={handleAddRandomIcon}
              className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-sm transition-opacity duration-100 cursor-pointer
                ${isHovering ? "opacity-100" : "opacity-0 pointer-events-none"}
                text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800/50`}
              style={{
                userSelect: "none",
                flexShrink: 0,
                lineHeight: "1.2",
                minWidth: 0,
                whiteSpace: "nowrap",
              }}
            >
              <svg
                aria-hidden="true"
                role="graphics-symbol"
                viewBox="2.37 2.37 15.26 15.25"
                className="w-3.5 h-3.5 fill-current flex-shrink-0"
              >
                <path d="M2.375 10a7.625 7.625 0 1 1 15.25 0 7.625 7.625 0 0 1-15.25 0m5.67 1.706a.625.625 0 0 0-1.036.698A3.6 3.6 0 0 0 10.005 14c1.245 0 2.35-.637 2.996-1.596a.625.625 0 0 0-1.036-.698 2.37 2.37 0 0 1-1.96 1.044 2.36 2.36 0 0 1-1.96-1.044m-.68-2.041c.49 0 .88-.46.88-1.02s-.39-1.02-.88-1.02-.88.46-.88 1.02.39 1.02.88 1.02m6.15-1.02c0-.56-.39-1.02-.88-1.02s-.88.46-.88 1.02.39 1.02.88 1.02.88-.46.88-1.02" />
              </svg>
              Add icon
            </button>
          )}

          {/* Add Cover - Only show if no cover exists */}
          {!displayCoverUrl && canEditHeader && (
            <button
              type="button"
              onClick={onAddCover}
              className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-sm transition-opacity duration-100 cursor-pointer
                ${isHovering ? "opacity-100" : "opacity-0 pointer-events-none"}
                text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800/50`}
              style={{
                userSelect: "none",
                flexShrink: 0,
                lineHeight: "1.2",
                minWidth: 0,
                whiteSpace: "nowrap",
              }}
            >
              <svg
                aria-hidden="true"
                role="graphics-symbol"
                viewBox="2.37 4.12 15.25 11.75"
                className="w-3.5 h-3.5 fill-current flex-shrink-0"
              >
                <path d="M2.375 6.25c0-1.174.951-2.125 2.125-2.125h11c1.174 0 2.125.951 2.125 2.125v7.5a2.125 2.125 0 0 1-2.125 2.125h-11a2.125 2.125 0 0 1-2.125-2.125zm1.25 7.5c0 .483.392.875.875.875h11a.875.875 0 0 0 .875-.875v-2.791l-2.87-2.871a.625.625 0 0 0-.884 0l-4.137 4.136-1.98-1.98a.625.625 0 0 0-.883 0L3.625 12.24zM8.5 9.31a1.5 1.5 0 0 0 1.33-.806 1.094 1.094 0 0 1-.702-2.058A1.5 1.5 0 1 0 8.5 9.31" />
              </svg>
              Add cover
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Emoji / Icon - Only show if set */}
          {displayIcon && (
            <div className="pt-1 text-gray-500 dark:text-gray-400 flex items-center justify-center">
              <div
                className={`${iconClassName || "h-20 w-20 text-[4rem]"} flex items-center justify-center text-gray-500 dark:text-gray-400 cursor-pointer hover:opacity-100 transition-opacity`}
                style={{ opacity: 0.6 }}
                onClick={() => canEditHeader && setShowEmojiPicker(true)}
                onKeyUp={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setShowEmojiPicker(true);
                  }
                }}
                aria-label="Change title icon"
                role="button"
                tabIndex={0}
              >
                {displayIcon}
              </div>
            </div>
          )}

          {/* Title Input */}
          <p
            className={`${titleClassName || "text-4xl"} px-2.5 font-semibold leading-tight tracking-tight break-words w-full outline-none transition-colors
              ${editing && !readOnly ? "text-black dark:text-white" : "text-black dark:text-white"}
              empty:before:content-[attr(data-placeholder)] empty:before:text-gray-300 dark:empty:before:text-gray-600 empty:before:pointer-events-none`}
            ref={inputRef}
            data-placeholder="New page"
            contentEditable={
              !readOnly &&
              editing &&
              !showCommitHistory
              // Note-based permission checks removed - using block-based system
              // (noteType === "original" &&
              // (isOwner(noteOwnerMail, !!parentId, user) || !noteOwnerMail))
            }
            suppressContentEditableWarning
            onInput={(e) => {
              const target = e.currentTarget;
              const newTitle = target.innerText.trim();
              if (newTitle === "") {
                target.innerHTML = "";
              }
              document.title = newTitle || "New page";
              if (onTitleChange) {
                onTitleChange(newTitle);
              }

              // Old note-based logic (commented out - now using block context)
              // if (parentId) {
              //   let updatedNote;
              //   // setChildrenNotes((prev) => {
              //   //   const newState = { ...prev };
              //   //   const notesArray = newState[parentId];
              //   //   if (!notesArray) return prev;

              //   //   const noteIndex = notesArray.findIndex((note) => note.id === editorKey);
              //   //   if (noteIndex === -1) return prev;

              //   //   updatedNote = {
              //   //     ...notesArray[noteIndex],
              //   //     title: newTitle,
              //   //   };

              //   //   newState[parentId] = [
              //   //     ...notesArray.slice(0, noteIndex),
              //   //     updatedNote,
              //   //     ...notesArray.slice(noteIndex + 1),
              //   //   ];
              //   //   return newState;
              //   // });
              // } else {
              //   try {
              //     if (rootNodes) {
              //       const updatedRootNodes = updateTitleDeep(rootNodes, editorKey, newTitle);
              //       setNotes(updatedRootNodes);
              //       localStorage.setItem("rootNodes", JSON.stringify(updatedRootNodes));
              //     }
              //   } catch (localErr) {
              //     console.error("Failed to update localStorage title on blur:", localErr);
              //   }
              // }
            }}
            onClick={() => setEditing(true)}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setEditing(true);
              }
            }}
            aria-label="Edit title"
            onBlur={async (e) => {
              const newTitle = e.currentTarget.innerText.trim();
              if (newTitle !== initialTitleRef.current && editorKey) {
                // Get page block (might not exist initially, so get it fresh)
                const currentPageBlock = getBlock(editorKey);

                if (!currentPageBlock) {
                  console.error("Page block not found:", editorKey);
                  toast.error("Page block not found. Cannot update title.");
                  return;
                }

                // Store previous state for rollback
                const previousTitle = initialTitleRef.current;
                const originalValue = currentPageBlock.value;

                // Optimistic update in block context
                const updatedValue = {
                  ...currentPageBlock.value,
                  title: newTitle, // allow empty
                };
                updateBlock(editorKey, { value: updatedValue });

                try {
                  const workspaceId = currentWorkspace?._id;
                  if (!workspaceId) {
                    throw new Error("Workspace not found");
                  }

                  // Call API to update the PAGE block
                  await postWithAuth("/api/note/block/batch-update", {
                    parentId: currentPageBlock.parentId,
                    workspaceId: workspaceId,
                    blocks: [
                      {
                        _id: editorKey,
                        content: updatedValue,
                      }
                    ],
                  });

                  toast.success("Title updated successfully!");
                } catch (err) {
                  console.error("Error updating title:", err);
                  toast.error("Failed to update title");

                  // Rollback optimistic update
                  updateBlock(editorKey, { value: originalValue });
                }

                // Old note-based update logic (commented out - now using block API)
                // const previousPendingTitle = pendingTitleMap.current[editorKey];
                // const previousPendingTitleStorage = localStorage.getItem(`pending-title-${editorKey}`);
                // 
                // isTitleDirtyRef.current = true;
                // pendingTitleMap.current[editorKey] = newTitle;
                // localStorage.setItem(`pending-title-${editorKey}`, JSON.stringify({ newTitle, parentId, titleIcon }));
                // 
                // // Optimistically update cache before API call
                // // updateNodeInCache(editorKey, newTitle, titleIcon || "", coverUrl);
                // 
                // try {
                //   await updateNoteWithQuery(editorKey, newTitle, parentId, titleIcon);
                //   isTitleDirtyRef.current = false;
                //   localStorage.removeItem(`pending-title-${editorKey}`);
                //   delete pendingTitleMap.current[editorKey];

                //   // updateNodeInCache(editorKey, newTitle, titleIcon || "", coverUrl);

                //   const optimisticIds = JSON.parse(localStorage.getItem("optimistic-note-ids") || "[]");
                //   if (optimisticIds.includes(editorKey)) {
                //     pendingTitleMap.current[editorKey] = newTitle;
                //     localStorage.setItem(
                //       `pending-title-${editorKey}`,
                //       JSON.stringify({ newTitle, parentId, titleIcon }),
                //     );
                //   }

                //   queryClient.invalidateQueries({
                //     queryKey: ["notes", "detail", editorKey],
                //   });
                // } catch (err) {
                //   console.error("Error updating title:", err);
                //   toast.error("Error updating title");

                //   // Rollback optimistic updates
                //   try {
                //     // Rollback cache update
                //     // updateNodeInCache(editorKey, previousTitle, titleIcon || "", coverUrl);
                //     
                //     // Rollback localStorage and pendingTitleMap
                //     if (previousPendingTitleStorage) {
                //       localStorage.setItem(`pending-title-${editorKey}`, previousPendingTitleStorage);
                //       if (previousPendingTitle) {
                //         pendingTitleMap.current[editorKey] = previousPendingTitle;
                //       }
                //     } else {
                //       localStorage.removeItem(`pending-title-${editorKey}`);
                //       delete pendingTitleMap.current[editorKey];
                //     }
                //     
                //     // Invalidate queries to refetch correct data
                //     queryClient.invalidateQueries({
                //       queryKey: ["notes", "detail", editorKey],
                //     });
                //   } catch (rollbackError) {
                //     console.error("Failed to rollback title update:", rollbackError);
                //   }
                //   
                //   isTitleDirtyRef.current = true;
                // }
              }
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget as HTMLElement).blur();
              }
            }}
          />
        </div>
      </div>

      {/* Emoji Picker Modal */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleSelectEmoji}
          onClose={() => setShowEmojiPicker(false)}
          onRemove={displayIcon ? handleRemoveIcon : undefined}
          currentEmoji={displayIcon}
        />
      )}
    </>
  );
}
