import { postWithAuth } from "@/lib/api-helpers";
import type { Editor, Range } from "@tiptap/core";
import {
  CheckSquare,
  Code,
  FilePlus,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  History,
  ImageIcon,
  KanbanIcon,
  List,
  ListTree,
  ListOrdered,
  Columns,
  Table,
  Text,
  TextQuote,
  Twitter,
  Youtube,
  Calendar,
  GanttChart,
  Globe,
  Link2,
  BarChart3,
  Images,
} from "lucide-react";
import { Command, createSuggestionItems, getUrlFromString, isValidUrl, renderItems, SuggestionItem } from "novel";

export type ExtendedSuggestionItem = SuggestionItem & { category?: string; };
import { uploadFn } from "./image-upload";
import Magic from "./ui/icons/magic";
import { ObjectId } from "bson";
import { createCollectionViewTemplate, serializeDataSourceForAPI, serializeViewDatabaseForAPI } from "@/lib/collectionViewTemplate";
import { createSprintTemplate } from "@/lib/sprintTemplate";
import { openEmbedModal } from "@/lib/embed-modal-helper";
import { buildColumnLayoutNode, clampColumnCount, getDefaultColumnWidths, parseWidthsInput } from "./column-layout-utils";
import { Block } from "@/types/block";
import { DatabaseSource } from "@/types/board";


function insertAfter(arr: string[], afterId: string | null, newId: string) {
  // avoid duplicates
  const filtered = arr.filter((id) => id !== newId);

  if (!afterId) return [...filtered, newId];

  const idx = filtered.indexOf(afterId);
  if (idx === -1) return [...filtered, newId];

  return [...filtered.slice(0, idx + 1), newId, ...filtered.slice(idx + 1)];
}

function findClosestParentId(editor: Editor, pos: number, defaultParentId: string) {
  const $pos = editor.state.doc.resolve(pos);
  for (let d = $pos.depth - 1; d > 0; d--) {
    const node = $pos.node(d);
    if (node.attrs && node.attrs.blockId) {
      return node.attrs.blockId as string;
    }
  }
  return defaultParentId;
}

const insertColumnLayout = (editor: Editor, range: Range, columnCount: number, widths: number[]) => {
  // First, delete the slash command text
  editor.chain().focus().deleteRange(range).run();

  // Then insert the column layout as a new block after the current one
  setTimeout(() => {
    const { state } = editor;
    const { from } = state.selection;
    const $pos = state.doc.resolve(from);

    // Find the current block depth
    let blockDepth = $pos.depth;
    while (blockDepth > 0 && $pos.node(blockDepth).type.name === "doc") {
      blockDepth--;
    }

    // Calculate position after the current block
    const insertPos = $pos.after(blockDepth);

    // Insert the column layout and an empty line after
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, [
        buildColumnLayoutNode(columnCount, widths),
        { type: "paragraph" } // The default empty line below the block
      ])
      .run();

    // Move cursor into the first column's first paragraph
    setTimeout(() => {
      const { state: newState } = editor;
      const { doc } = newState;

      // Find the most recently inserted column layout (closest to insertion point)
      let columnLayoutPos = -1;
      let minDistance = Infinity;

      doc.descendants((node, pos) => {
        if (node.type.name === "columnLayout") {
          const distance = Math.abs(pos - insertPos);
          if (distance < minDistance) {
            minDistance = distance;
            columnLayoutPos = pos;
          }
        }
      });

      if (columnLayoutPos !== -1) {
        const layoutNode = doc.nodeAt(columnLayoutPos);
        if (layoutNode && layoutNode.firstChild) {
          const firstColumnItemPos = columnLayoutPos + 1;
          const firstColumnNode = layoutNode.firstChild;

          let paragraphPos = -1;
          firstColumnNode.descendants((node, pos) => {
            if (node.type.name === "paragraph" && paragraphPos === -1) {
              paragraphPos = firstColumnItemPos + pos + 1;
              return false;
            }
          });

          if (paragraphPos !== -1) {
            editor.chain().setTextSelection(paragraphPos).focus().run();
          }
        }
      }
    }, 10);
  }, 0);
};

export const getSuggestionItems = (
  parentId: string,
  onNewPageCreated?: (href: string) => void,
  onAskAICommand?: () => void,
  onHistoryCommand?: () => void,
  isRestrictedPage?: boolean,
  isPublicNote?: boolean,
  workAreaId?: string,
  addBlock?: (block: any) => void,
  updateBlock?: (blockId: string, updates: any) => void,
  getBlock?: (blockId: string) => any,
  workspaceId?: string,
  userEmail?: string,
  setDataSource?: (dataSourceId: string, dataSource: DatabaseSource) => void,
  setCurrentDataSource?: (boardId: string, dataSourceId: string | undefined) => void,
) => {
  return createSuggestionItems([
    // {
    //   title: "Send Feedback",
    //   description: "Let us know how we can improve.",
    //   icon: <MessageSquarePlus size={18} />,
    //   command: ({ editor, range }) => {
    //     editor.chain().focus().deleteRange(range).run();
    //     window.open("/feedback", "_blank");
    //   },
    // },
    {
      title: "Ask AI",
      description: "Get AI content assistance",
      category: "AI",
      searchTerms: ["ask", "ai", "askai"],
      icon: <Magic className="h-5 w-5" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        if (onAskAICommand) {
          onAskAICommand();
        }
      },
    },
    {
      title: "Text",
      description: "Start typing plain text",
      category: "Basic Blocks",
      searchTerms: ["p", "paragraph"],
      icon: <Text size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").run();
      },
    },
    {
      title: "To-do List",
      description: "Track tasks with list",
      category: "Basic Blocks",
      searchTerms: ["todo", "task", "list", "check", "checkbox"],
      icon: <CheckSquare size={18} />,
      command: ({ editor, range }) => {
        // First, delete the slash command text
        editor.chain().focus().deleteRange(range).run();

        // Then insert the task list as a new block after the current block
        setTimeout(() => {
          const { state } = editor;
          const { from } = state.selection;
          const $pos = state.doc.resolve(from);

          // Find the current block depth
          let blockDepth = $pos.depth;
          while (blockDepth > 0 && $pos.node(blockDepth).type.name === "doc") {
            blockDepth--;
          }

          // Calculate position after the current block
          const insertPos = $pos.after(blockDepth);

          editor
            .chain()
            .focus()
            .insertContentAt(insertPos, {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [{ type: "paragraph" }],
                },
              ],
            })
            .run();
        }, 0);
      },
    },
    {
      title: "Heading 1",
      description: "Big section heading.",
      category: "Basic Blocks",
      searchTerms: ["title", "big", "large"],
      icon: <Heading1 size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
      },
    },
    {
      title: "Heading 2",
      description: "Medium section heading.",
      category: "Basic Blocks",
      searchTerms: ["subtitle", "medium"],
      icon: <Heading2 size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
      },
    },
    {
      title: "Heading 3",
      description: "Small section heading.",
      category: "Basic Blocks",
      searchTerms: ["subtitle", "small"],
      icon: <Heading3 size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
      },
    },
    {
      title: "Bullet List",
      description: "Create a bullet list.",
      category: "Basic Blocks",
      searchTerms: ["unordered", "point"],
      icon: <List size={18} />,
      command: ({ editor, range }) => {
        // First, delete the slash command text
        editor.chain().focus().deleteRange(range).run();

        // Then insert the list block as a new block after the current one
        // We use setTimeout to ensure the deletion is complete first, matching the Page command pattern
        setTimeout(() => {
          const { state } = editor;
          const { selection } = state;
          const { $from } = selection;

          // Get the position right after the current block
          const blockDepth = $from.depth;
          const pos = $from.after(blockDepth);

          editor
            .chain()
            .focus()
            .insertContentAt(pos, {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph" }],
                },
              ],
            })
            .run();
        }, 0);
      },
    },
    {
      title: "Numbered List",
      description: "Create numbered list",
      category: "Basic Blocks",
      searchTerms: ["ordered"],
      icon: <ListOrdered size={18} />,
      command: ({ editor, range }) => {
        // First, delete the slash command text
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .run();

        // Then insert the list block as a new block after the current one
        // We use setTimeout to ensure the deletion is complete first, matching the Page command pattern
        setTimeout(() => {
          const { state } = editor;
          const { from } = state.selection;
          const $pos = state.doc.resolve(from);

          // Find the current block depth (not doc)
          let blockDepth = $pos.depth;
          while (blockDepth > 0 && $pos.node(blockDepth).type.name === "doc") {
            blockDepth--;
          }

          // Calculate position after the current block
          const insertPos = $pos.after(blockDepth);

          editor
            .chain()
            .focus()
            .insertContentAt(insertPos, {
              type: "orderedList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph" }],
                },
              ],
            })
            .run();
        }, 0);
      },
    },
    {
      title: "Quote",
      description: "Capture a quote.",
      category: "Basic Blocks",
      searchTerms: ["blockquote"],
      icon: <TextQuote size={18} />,
      command: ({ editor, range }) => {
        // First, delete the slash command text
        editor.chain().focus().deleteRange(range).run();

        // Then insert the quote block as a new block after the current one
        setTimeout(() => {
          const { state } = editor;
          const { selection } = state;
          const { $from } = selection;

          // Get the position right after the current block
          const blockDepth = $from.depth;
          const pos = $from.after(blockDepth);

          editor
            .chain()
            .focus()
            .insertContentAt(pos, [
              {
                type: "blockquote",
                content: [
                  {
                    type: "paragraph",
                  },
                ],
              },
              {
                type: "paragraph", // The default empty line below the block
              }
            ])
            .run();

          // Focus inside the quote, not the empty line below
          setTimeout(() => {
            editor.chain().setTextSelection(pos + 2).focus().run();
          }, 10);
        }, 0);
      },
    },
    {
      title: "Callout",
      description: "Callout with icon",
      category: "Basic Blocks",
      searchTerms: ["callout", "note", "highlight"],
      icon: <TextQuote size={18} />,
      command: ({ editor, range }) => {
        // First, delete the slash command text
        editor.chain().focus().deleteRange(range).run();

        // Then insert the callout block as a new block after the current one
        setTimeout(() => {
          const { state } = editor;
          const { selection } = state;
          const { $from } = selection;

          // Get the position right after the current block
          const blockDepth = $from.depth;
          const pos = $from.after(blockDepth);

          editor
            .chain()
            .focus()
            .insertContentAt(pos, [
              {
                type: "callout",
                attrs: {
                  icon: "💡",
                },
                content: [
                  {
                    type: "paragraph",
                  },
                ],
              },
              {
                type: "paragraph", // The default empty line below the block
              }
            ])
            .run();

          // Focus inside the callout, not the empty line below
          setTimeout(() => {
            editor.chain().setTextSelection(pos + 2).focus().run();
          }, 10);
        }, 0);
      },
    },
    {
      title: "Code",
      description: "Capture a code snippet.",
      category: "Advanced",
      searchTerms: ["codeblock"],
      icon: <Code size={18} />,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: "Image",
      description: "Upload image from computer",
      category: "Media",
      searchTerms: ["photo", "picture", "media"],
      icon: <ImageIcon size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        // upload image
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async () => {
          if (input.files?.length) {
            const file = input.files[0];
            if (file) {
              const pos = editor.view.state.selection.from;
              uploadFn(file, editor.view, pos);
            }
          }
        };
        input.click();
      },
    },
    {
      title: "Embed",
      description: "Embed external content",
      category: "Media",
      searchTerms: ["embed", "iframe", "link"],
      icon: <Globe size={18} />,
      command: ({ editor, range }) => {
        // Calculate position for the modal (above the cursor)
        let position: { top: number; left: number } | undefined;
        try {
          const selection = editor.view.state.selection;
          const coords = editor.view.coordsAtPos(selection.from);
          position = {
            top: coords.top,
            left: coords.left,
          };
        } catch (error) {
          // If we can't get coordinates, modal will center
          console.warn("Could not get cursor position for embed modal", error);
        }

        editor.chain().focus().deleteRange(range).run();
        openEmbedModal(editor, range, position);
      },
    },
    {
      title: "Bookmark",
      description: "Bookmark for web link",
      category: "Media",
      searchTerms: ["bookmark", "web bookmark", "link card", "url"],
      icon: <Link2 size={18} />,
      command: ({ editor, range }) => {
        // Calculate position for the modal (above the cursor)
        let position: { top: number; left: number } | undefined;
        try {
          const selection = editor.view.state.selection;
          const coords = editor.view.coordsAtPos(selection.from);
          position = {
            top: coords.top,
            left: coords.left,
          };
        } catch (error) {
          // If we can't get coordinates, modal will center
          console.warn("Could not get cursor position for bookmark modal", error);
        }

        editor.chain().focus().deleteRange(range).run();
        openEmbedModal(editor, range, position);
      },
    },
    {
      title: "Youtube",
      description: "Embed a Youtube video.",
      category: "Media",
      searchTerms: ["video", "youtube", "embed"],
      icon: <Youtube size={18} />,
      command: ({ editor, range }) => {
        const videoLink = prompt("Please enter Youtube Video Link");
        //From https://regexr.com/3dj5t
        const ytregex = new RegExp(
          /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/,
        );

        if (videoLink && ytregex.test(videoLink)) {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setYoutubeVideo({
              src: videoLink,
            })
            .run();
        } else {
          if (videoLink !== null) {
            alert("Please enter a correct Youtube Video Link");
          }
        }
      },
    },
    {
      title: "Twitter",
      description: "Embed a Tweet.",
      category: "Media",
      searchTerms: ["twitter", "embed"],
      icon: <Twitter size={18} />,
      command: ({ editor, range }) => {
        const tweetLink = prompt("Please enter Twitter Link");
        const tweetRegex = new RegExp(/^https?:\/\/(www\.)?x\.com\/([a-zA-Z0-9_]{1,15})(\/status\/(\d+))?(\/\S*)?$/);

        if (tweetLink && tweetRegex.test(tweetLink)) {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setTweet({
              src: tweetLink,
            })
            .run();
        } else {
          if (tweetLink !== null) {
            alert("Please enter a correct Twitter Link");
          }
        }
      },
    },
    {
      title: "Page",
      description: "Create and link page",
      category: "Basic Blocks",
      searchTerms: ["page", "new"],
      icon: <FileText size={18} />,
      command: async ({ editor, range }) => {
        try {
          const title = "New page";
          const emoji = "";

          // Get workspaceId - use provided workspaceId or fallback to localStorage
          const effectiveWorkspaceId = workspaceId ||
            localStorage.getItem("workspaceId") ||
            "default";

          if (!effectiveWorkspaceId || effectiveWorkspaceId === "default") {
            return;
          }

          // Generate new page ID
          const newPageId = new ObjectId().toString();

          if (!parentId) {
            return;
          }

          // Use findClosestParentId to allow creating pages inside nested blocks like columns/toggles
          const targetParentId = findClosestParentId(editor, range.from, parentId);
          const parentTable = "page" as const;

          // Check if parent is in a workarea
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const parentWorkareaId = parentBlock?.workareaId || null;
          const isParentInWorkarea = parentBlock?.parentType === "workarea";

          // Create Block Object (matching Sidebar implementation)
          const newBlock: Block = {
            _id: newPageId,
            blockType: "page",
            workspaceId: effectiveWorkspaceId,
            workareaId: parentWorkareaId,
            parentId: targetParentId,
            parentType: parentTable,
            value: {
              title: title,
              userId: userEmail || "",
              userEmail: userEmail || "",
              icon: emoji || "",
              coverURL: null,
              pageType: parentWorkareaId ? "workarea" : isPublicNote ? (isRestrictedPage ? "restricted" : "public") : "private",
              isTemplate: false,
            },
            blockIds: [],
            status: "alive",
          };

          // Find the current block to insert after it (like Board command does)
          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockId = currentBlockId || null;

          // Optimistic Updates (if functions are available)
          if (addBlock) {
            addBlock(newBlock);
          }

          // Update parent page's blockIds - insert after the current block, not at the end
          if (updateBlock && getBlock) {
            const parentBlock = getBlock(targetParentId);
            if (parentBlock) {
              const originalParentIds = parentBlock.blockIds || [];

              // If we have a currentBlockId, insert after it; otherwise append to end
              let updatedBlockIds: string[];
              if (currentBlockId && originalParentIds.includes(currentBlockId)) {
                const currentIndex = originalParentIds.indexOf(currentBlockId);
                updatedBlockIds = [
                  ...originalParentIds.slice(0, currentIndex + 1),
                  newPageId,
                  ...originalParentIds.slice(currentIndex + 1)
                ];
              } else {
                // No current block or not found in parent's blockIds, append to end
                updatedBlockIds = [...originalParentIds, newPageId];
              }

              updateBlock(targetParentId, {
                blockIds: updatedBlockIds
              });
            }
          }

          // Call API to create the PAGE block (the actual page entity)
          try {
            // Get workareaId from parent block
            const parentWorkareaId = parentBlock.workareaId || null;

            await postWithAuth("/api/note/block/batch-create", {
              parentId: targetParentId,
              workspaceId: effectiveWorkspaceId,
              workareaId: parentWorkareaId,
              parentTable: parentTable,
              blocks: [
                {
                  _id: newPageId,
                  blockType: "page",
                  value: newBlock.value,
                  insertAfterBlockID: insertAfterBlockId,
                }
              ]
            });

            // Insert page link in editor
            const href = `/notes/${newPageId}`;

            // First, delete the slash command text
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .run();

            // Then insert the page block as a new block after the current one
            // We use setTimeout to ensure the deletion is complete first
            setTimeout(() => {
              const { state } = editor;
              const { from } = state.selection;
              const $pos = state.doc.resolve(from);

              // Find the current block depth (not doc)
              let blockDepth = $pos.depth;
              while (blockDepth > 0 && $pos.node(blockDepth).type.name === "doc") {
                blockDepth--;
              }

              // Calculate position after the current block
              const insertPos = $pos.after(blockDepth);

              editor
                .chain()
                .focus()
                .insertContentAt(insertPos, {
                  type: "page",
                  attrs: {
                    blockId: newPageId,
                    href,
                    title,
                  },
                })
                .run();
            }, 0);

            // Navigate to the new Note
            if (onNewPageCreated) {
              onNewPageCreated(href);
            }
          } catch (err) {
            console.error("Failed to create page block:", err);
          }
        } catch (err) {
          console.error("Failed to create page", err);
        }
      },
    },
    // {
    //   title: "Table",
    //   description: "Insert 3x3 table",
    //   category: "Basic Blocks",
    //   searchTerms: ["table"],
    //   icon: <Table size={18} />,
    //   command: ({ editor, range }) => {
    //     editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
    //   },
    // },
    // {
    //   title: "Columns",
    //   description: "Custom column layout",
    //   category: "Basic Blocks",
    //   searchTerms: ["column", "columns", "layout", "split"],
    //   icon: <Columns size={18} />,
    //   command: ({ editor, range }) => {
    //     let columnCount = 2;
    //     if (typeof window !== "undefined") {
    //       const countInput = window.prompt("How many columns do you need? (2-5)", "2");
    //       if (countInput === null) {
    //         return;
    //       }
    //       const requested = Number(countInput);
    //       columnCount = Math.max(2, clampColumnCount(Number.isFinite(requested) ? requested : 2));
    //     }

    //     const defaults = getDefaultColumnWidths(columnCount);
    //     const widths = typeof window !== "undefined"
    //       ? parseWidthsInput(
    //         window.prompt(
    //           `Enter ${columnCount} column widths separated by commas (example: ${defaults.join(", ")})`,
    //           defaults.join(", "),
    //         ),
    //         columnCount,
    //         defaults,
    //       )
    //       : defaults;

    //     insertColumnLayout(editor, range, columnCount, widths);
    //   },
    // },
    {
      title: "2 Columns",
      description: "Two equal columns",
      category: "Basic Blocks",
      searchTerms: ["column", "columns", "layout", "split", "two"],
      icon: <Columns size={18} />,
      command: ({ editor, range }) => {
        insertColumnLayout(editor, range, 2, getDefaultColumnWidths(2));
      },
    },
    {
      title: "3 Columns",
      description: "Three equal columns",
      category: "Basic Blocks",
      searchTerms: ["column", "columns", "layout", "split", "three"],
      icon: <Columns size={18} />,
      command: ({ editor, range }) => {
        insertColumnLayout(editor, range, 3, getDefaultColumnWidths(3));
      },
    },
    {
      title: "4 Columns",
      description: "Four equal columns",
      category: "Basic Blocks",
      searchTerms: ["column", "columns", "layout", "split", "four"],
      icon: <Columns size={18} />,
      command: ({ editor, range }) => {
        insertColumnLayout(editor, range, 4, getDefaultColumnWidths(4));
      },
    },
    {
      title: "5 Columns",
      description: "Five equal columns",
      category: "Basic Blocks",
      searchTerms: ["column", "columns", "layout", "split", "five"],
      icon: <Columns size={18} />,
      command: ({ editor, range }) => {
        insertColumnLayout(editor, range, 5, getDefaultColumnWidths(5));
      },
    },
    {
      title: "Table of Contents",
      description: "Insert table of contents",
      category: "Basic Blocks",
      searchTerms: ["toc", "outline", "contents"],
      icon: <ListTree size={18} />,
      command: ({ editor, range }) => {
        // First, delete the slash command text
        editor.chain().focus().deleteRange(range).run();

        // Then insert the TOC block as a new block after the current one
        setTimeout(() => {
          const { state } = editor;
          const { selection } = state;
          const { $from } = selection;

          // Get the position right after the current block
          const blockDepth = $from.depth;
          const pos = $from.after(blockDepth);

          editor
            .chain()
            .focus()
            .insertContentAt(pos, {
              type: "toc",
            })
            .run();
        }, 0);
      },
    },

    {
      title: "History",
      description: "View version history",
      category: "Advanced",
      searchTerms: ["history", "version", "commit"],
      icon: <History size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        if (onHistoryCommand) {
          onHistoryCommand();
        }
      },
    },
    {
      title: "Board",
      description: "Insert task board",
      category: "Database",
      searchTerms: ["kanban", "tasks", "project"],
      icon: <KanbanIcon />,
      command: async ({ editor, range }) => {
        try {
          const boardBlockId = new ObjectId().toString();
          const paragraphBlockId = new ObjectId().toString();

          console.log("[Board Command] Creating new board block:", boardBlockId);

          // Find the current block to insert after it
          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockID = currentBlockId || null;
          const targetParentId = findClosestParentId(editor, range.from, parentId);

          console.log("[Board Command] Insert after block:", insertAfterBlockID);

          // Delete the slash command text immediately (before any state changes)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          // Create the collection_view block structure using template
          const template = createCollectionViewTemplate({
            viewType: "board",
            title: "My Task Board",
            icon: "",
            workspaceId: workspaceId || "default",
            userEmail: userEmail || "",
            blockId: boardBlockId,
          });

          const { viewDatabase, dataSource } = template;

          // Optimistic update: Add block to context
          if (addBlock && workspaceId && userEmail) {
            const newBlock = {
              _id: boardBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: viewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newBlock);

            const newParagraphBlock = {
              _id: paragraphBlockId,
              blockType: "content" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: { type: "paragraph" },
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newParagraphBlock);

            // Update parent page's blockIds
            if (getBlock && updateBlock) {
              const parentBlock = getBlock(targetParentId);
              if (parentBlock) {
                const currentIds = parentBlock.blockIds || [];
                const withBoardIds = insertAfter(
                  currentIds,
                  insertAfterBlockID,
                  boardBlockId
                );
                const updatedBlockIds = insertAfter(
                  withBoardIds,
                  boardBlockId,
                  paragraphBlockId
                );
                updateBlock(targetParentId, { blockIds: updatedBlockIds });
              }
            }
          }

          // Optimistic update: Add datasource to context BEFORE API call
          if (setDataSource && dataSource._id) {
            const dataSourceId = dataSource._id
            setDataSource(dataSourceId, dataSource);

            // Set currentDataSource for the board
            if (setCurrentDataSource) {
              setCurrentDataSource(boardBlockId, dataSourceId);
            }
          }


          // Call API to create collection_view block with datasource
          const serializedDataSource = serializeDataSourceForAPI(dataSource);
          console.log("[Board Command] Serialized datasource:", JSON.stringify(serializedDataSource, null, 2));

          // Get workareaId from parent block
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const workareaId = parentBlock?.workareaId || null;

          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: [
              {
                _id: boardBlockId,
                blockType: "collection_view",
                value: serializeViewDatabaseForAPI(viewDatabase), // Serialize ObjectIds in viewDatabase
                insertAfterBlockID,
              },
              {
                _id: paragraphBlockId,
                blockType: "content",
                value: { type: "paragraph" },
                insertAfterBlockID: boardBlockId,
              }
            ],
            dataSourceDetail: serializedDataSource, // Include datasource in the request
          });

          // Insert board in editor for immediate rendering
          // editor
          //   .chain()
          //   .focus()
          //   .deleteRange(range)
          //   .insertContent([
          //     { type: "paragraph" },
          //     {
          //       type: "view_collection",
          //       attrs: {
          //         component: "board",
          //         blockId: boardBlockId,
          //         initialBoard: viewDatabase,
          //       },
          //     },
          //     { type: "paragraph" },
          //   ])
          //   .run();
        } catch (err) {
          console.error("Failed to insert board:", err);
        }
      },
    },
    {
      title: "List",
      description: "Insert task list",
      category: "Database",
      searchTerms: ["list", "table", "tasks", "rows"],
      icon: <List />,
      command: async ({ editor, range }) => {
        try {
          const listBlockId = new ObjectId().toString();
          const paragraphBlockId = new ObjectId().toString();

          console.log("[List Command] Creating new list block:", listBlockId);

          // Find the current block to insert after it
          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockID = currentBlockId || null;
          const targetParentId = findClosestParentId(editor, range.from, parentId);

          console.log("[List Command] Insert after block:", insertAfterBlockID);

          // Delete the slash command text immediately (before any state changes)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          // Create the collection_view block structure using template
          const template = createCollectionViewTemplate({
            viewType: "list",
            title: "My Task Board",
            icon: "",
            workspaceId: workspaceId || "default",
            userEmail: userEmail || "",
            blockId: listBlockId,
          });

          console.log("Printing template from slash command ++", template);
          const { viewDatabase, dataSource } = template;

          // Optimistic update: Add block to context
          if (addBlock && workspaceId && userEmail) {
            const newBlock = {
              _id: listBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: viewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newBlock);

            const newParagraphBlock = {
              _id: paragraphBlockId,
              blockType: "content" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: { type: "paragraph" },
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newParagraphBlock);

            // Update parent page's blockIds
            if (getBlock && updateBlock) {
              const parentBlock = getBlock(targetParentId);
              if (parentBlock) {
                const currentIds = parentBlock.blockIds || [];
                const withBoardIds = insertAfter(
                  currentIds,
                  insertAfterBlockID,
                  listBlockId
                );
                const updatedBlockIds = insertAfter(
                  withBoardIds,
                  listBlockId,
                  paragraphBlockId
                );

                updateBlock(targetParentId, { blockIds: updatedBlockIds });
              }
            }
          }

          // Optimistic update: Add datasource to context BEFORE API call
          if (setDataSource && dataSource._id) {
            const dataSourceId = dataSource._id
            setDataSource(dataSourceId, dataSource);

            // Set currentDataSource for the board
            if (setCurrentDataSource) {
              setCurrentDataSource(listBlockId, dataSourceId);
            }
          }


          // Call API to create collection_view block with datasource
          const serializedDataSource = serializeDataSourceForAPI(dataSource);
          console.log("[list Command] Serialized datasource:", JSON.stringify(serializedDataSource, null, 2));

          // Call API to create collection_view block
          // Get workareaId from parent block
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const workareaId = parentBlock?.workareaId || null;

          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: [
              {
                _id: listBlockId,
                blockType: "collection_view",
                value: serializeViewDatabaseForAPI(viewDatabase), // Serialize ObjectIds in viewDatabase,
                insertAfterBlockID,
              },
              {
                _id: paragraphBlockId,
                blockType: "content",
                value: { type: "paragraph" },
                insertAfterBlockID: listBlockId,
              }
            ],
            dataSourceDetail: serializedDataSource,
          });

          // Insert list in editor for immediate rendering
          // editor
          //   .chain()
          //   .focus()
          //   .deleteRange(range)
          //   .insertContent([
          //     { type: "paragraph" },
          //     {
          //       type: "view_collection",
          //       attrs: {
          //         component: "list",
          //         blockId: listBlockId,
          //         initialBoard: viewDatabase,
          //       },
          //     },
          //     { type: "paragraph" },
          //   ])
          //   .run();
        } catch (err) {
          console.error("Failed to insert list:", err);
        }
      },
    },
    {
      title: "Timeline",
      description: "Insert project timeline",
      category: "Database",
      searchTerms: ["timeline", "gantt", "project", "schedule"],
      icon: <GanttChart />,
      command: async ({ editor, range }) => {
        try {
          const timelineBlockId = new ObjectId().toString();
          const paragraphBlockId = new ObjectId().toString();
          const viewTypeId = new ObjectId().toString();

          console.log("[Timeline Command] Creating new timeline block:", timelineBlockId);

          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockID = currentBlockId || null;
          const targetParentId = findClosestParentId(editor, range.from, parentId);

          // Delete the slash command text immediately (before any state changes)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          const viewDatabase = {
            title: "My Timeline",
            icon: "",
            viewsTypes: [{
              _id: viewTypeId,
              viewType: "timeline",
              title: "Timeline",
              icon: "",
            }],
          };

          // Optimistic update: Add block to context
          if (addBlock && workspaceId && userEmail) {
            const newBlock = {
              _id: timelineBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: viewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newBlock);

            const newParagraphBlock = {
              _id: paragraphBlockId,
              blockType: "content" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: { type: "paragraph" },
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newParagraphBlock);

            // Update parent page's blockIds
            if (getBlock && updateBlock) {
              const parentBlock = getBlock(targetParentId);
              if (parentBlock) {
                const currentIds = parentBlock.blockIds || [];
                const withBoardIds = insertAfter(
                  currentIds,
                  insertAfterBlockID,
                  timelineBlockId
                );
                const updatedBlockIds = insertAfter(
                  withBoardIds,
                  timelineBlockId,
                  paragraphBlockId
                );
                updateBlock(targetParentId, { blockIds: updatedBlockIds });
              }
            }
          }

          // Get workareaId from parent block
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const workareaId = parentBlock?.workareaId || null;



          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: [
              {
                _id: timelineBlockId,
                blockType: "collection_view",
                value: viewDatabase,
                insertAfterBlockID,
              },
              {
                _id: paragraphBlockId,
                blockType: "content",
                value: { type: "paragraph" },
                insertAfterBlockID: timelineBlockId,
              }
            ],
          });

          // editor
          //   .chain()
          //   .focus()
          //   .deleteRange(range)
          //   .insertContent([
          //     { type: "paragraph" },
          //     {
          //       type: "view_collection",
          //       attrs: {
          //         blockId: timelineBlockId,
          //         component: "timeline",
          //         initialBoard: viewDatabase,
          //       },
          //     },
          //     { type: "paragraph" },
          //   ])
          //   .run();
        } catch (err) {
          console.error("Failed to insert timeline:", err);
        }
      },
    },
    {
      title: "Calendar",
      description: "Insert calendar view",
      category: "Database",
      searchTerms: ["calendar", "date", "schedule", "events"],
      icon: <Calendar />,
      command: async ({ editor, range }) => {
        try {
          const calendarBlockId = new ObjectId().toString();
          const paragraphBlockId = new ObjectId().toString();
          // const viewTypeId = new ObjectId().toString();

          console.log("[Calendar Command] Creating new calendar block:", calendarBlockId);

          // Find the current block to insert after it
          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockID = currentBlockId || null;
          const targetParentId = findClosestParentId(editor, range.from, parentId);

          // Delete the slash command text immediately (before any state changes)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          const template = createCollectionViewTemplate({
            viewType: "calendar",
            title: "My Task Board",
            icon: "",
            workspaceId: workspaceId || "default",
            userEmail: userEmail || "",
            blockId: calendarBlockId,
          });

          const { viewDatabase, dataSource } = template;


          // const viewDatabase = {
          //   title: "My Calendar",
          //   icon: "",
          //   viewsTypes: [{
          //     _id: viewTypeId,
          //     viewType: "calendar",
          //     title: "Calendar",
          //     icon: "",
          //   }],
          // };

          // Optimistic update: Add block to context
          if (addBlock && workspaceId && userEmail) {
            const newBlock = {
              _id: calendarBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: viewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newBlock);

            const newParagraphBlock = {
              _id: paragraphBlockId,
              blockType: "content" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: { type: "paragraph" },
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newParagraphBlock);

            // Update parent page's blockIds
            if (getBlock && updateBlock) {
              const parentBlock = getBlock(targetParentId);
              if (parentBlock) {
                const currentIds = parentBlock.blockIds || [];
                const withBoardIds = insertAfter(
                  currentIds,
                  insertAfterBlockID,
                  calendarBlockId
                );
                const updatedBlockIds = insertAfter(
                  withBoardIds,
                  calendarBlockId,
                  paragraphBlockId
                );
                updateBlock(targetParentId, { blockIds: updatedBlockIds });
              }
            }
          }

          // Optimistic update: Add datasource to context BEFORE API call
          if (setDataSource && dataSource._id) {
            const dataSourceId = dataSource._id
            setDataSource(dataSourceId, dataSource);

            // Set currentDataSource for the board
            if (setCurrentDataSource) {
              setCurrentDataSource(calendarBlockId, dataSourceId);
            }
          }

          // Call API to create collection_view block with datasource
          const serializedDataSource = serializeDataSourceForAPI(dataSource);
          console.log("[Calendar Command] Serialized datasource:", JSON.stringify(serializedDataSource, null, 2));
          // Get workareaId from parent block
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const workareaId = parentBlock?.workareaId || null;

          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: [
              {
                _id: calendarBlockId,
                blockType: "collection_view",
                value: serializeViewDatabaseForAPI(viewDatabase), // Serialize ObjectIds in viewDatabase,
                insertAfterBlockID,
              },
              {
                _id: paragraphBlockId,
                blockType: "content",
                value: { type: "paragraph" },
                insertAfterBlockID: calendarBlockId,
              }
            ],
            dataSourceDetail: serializedDataSource,
          });

          // editor
          //   .chain()
          //   .focus()
          //   .deleteRange(range)
          //   .insertContent([
          //     { type: "paragraph" },
          //     {
          //       type: "view_collection",
          //       attrs: {
          //         blockId: calendarBlockId,
          //         component: "calendar",
          //         initialBoard: viewDatabase,
          //       },
          //     },
          //     { type: "paragraph" },
          //   ])
          //   .run();
        } catch (err) {
          console.error("Failed to insert calendar:", err);
        }
      },
    },
    {
      title: "Sprint Board",
      description: "Insert a sprint Board",
      searchTerms: ["sprint", "task", "planing", "track"],
      icon: <Calendar />,
      command: async ({ editor, range }) => {
        try {
          const sprintBlockId = new ObjectId().toString();
          const taskTrackerBlockId = new ObjectId().toString();
          const paragraphBlockId = new ObjectId().toString();

          console.log("[Sprint Command] Creating new sprint block:", sprintBlockId);

          // Find the current block to insert after it
          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockID = currentBlockId || null;
          const targetParentId = findClosestParentId(editor, range.from, parentId);

          const sprintBoardBlockId = new ObjectId().toString();

          // Delete the slash command text immediately (before any state changes)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          const template = createSprintTemplate({
            workspaceId: workspaceId || "default",
            userEmail: userEmail || "",
            sprintsBlockId: sprintBlockId,
            tasksBlockId: taskTrackerBlockId,
            sprintBoardBlockId: sprintBoardBlockId
          });

          const { sprintsViewDatabase, tasksViewDatabase, sprintBoardDatabase, sprintsDataSource, tasksDataSource, sprintsPageBlocks } = template;

          // Optimistic update: Add block to context
          if (addBlock && workspaceId && userEmail) {
            const newSprintBlock = {
              _id: sprintBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: sprintsViewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newSprintBlock);

            const newTaskTrackerBlock = {
              _id: taskTrackerBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: tasksViewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newTaskTrackerBlock);

            const newSprintBoardBlock = {
              _id: sprintBoardBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: sprintBoardDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newSprintBoardBlock);

            const newParagraphBlock = {
              _id: paragraphBlockId,
              blockType: "content" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: { type: "paragraph" },
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newParagraphBlock);

            // Update parent page's blockIds
            if (getBlock && updateBlock) {
              const parentBlock = getBlock(targetParentId);
              if (parentBlock) {
                const currentIds = parentBlock.blockIds || [];

                // Insert tasks, then sprints, then sprint board, then paragraph
                const withTasksIds = insertAfter(currentIds, insertAfterBlockID, taskTrackerBlockId);
                const withSprintsIds = insertAfter(withTasksIds, taskTrackerBlockId, sprintBlockId);
                const withSprintBoardIds = insertAfter(withSprintsIds, sprintBlockId, sprintBoardBlockId);
                const updatedBlockIds = insertAfter(withSprintBoardIds, sprintBoardBlockId, paragraphBlockId);

                updateBlock(targetParentId, { blockIds: updatedBlockIds });
              }
            }
          }

          // Optimistic update: Add datasources to context BEFORE API call
          if (setDataSource) {
            if (sprintsDataSource) setDataSource(sprintsDataSource._id, sprintsDataSource);
            if (tasksDataSource) setDataSource(tasksDataSource._id, tasksDataSource);

            // Set currentDataSource for the board
            if (setCurrentDataSource) {
              if (sprintsDataSource) setCurrentDataSource(sprintBlockId, sprintsDataSource._id);
              if (tasksDataSource) setCurrentDataSource(taskTrackerBlockId, tasksDataSource._id);
              if (tasksDataSource) setCurrentDataSource(sprintBoardBlockId, tasksDataSource._id);
            }
          }

          // Get workareaId from parent block
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const workareaId = parentBlock?.workareaId || null;

          const serializedSprintsDataSource = serializeDataSourceForAPI(sprintsDataSource);
          const serializedTasksDataSource = tasksDataSource ? serializeDataSourceForAPI(tasksDataSource) : undefined;

          // We make batch creates for Task Tracker first
          if (tasksDataSource && tasksViewDatabase) {
            await postWithAuth("/api/note/block/batch-create", {
              parentId: targetParentId,
              workspaceId: workspaceId || "default",
              workareaId,
              parentTable: "page",
              blocks: [
                {
                  _id: taskTrackerBlockId,
                  blockType: "collection_view",
                  value: serializeViewDatabaseForAPI(tasksViewDatabase),
                  insertAfterBlockID: insertAfterBlockID,
                }
              ],
              dataSourceDetail: serializedTasksDataSource
            });
          }

          // Prepare the blocks for the Sprints database
          const sprintsBlocksContent = [
            {
              _id: sprintBlockId,
              blockType: "collection_view",
              value: serializeViewDatabaseForAPI(sprintsViewDatabase),
              insertAfterBlockID: taskTrackerBlockId,
            }
          ];

          // We make batch creates for Sprints
          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: sprintsBlocksContent,
            dataSourceDetail: serializedSprintsDataSource
          });

          // Insert the Sprint pages into the nested Sprint block
          for (let i = 0; i < sprintsPageBlocks.length; i++) {
            const { pageBlock, boardBlock } = sprintsPageBlocks[i];

            // Optimistically add to UI
            if (addBlock) {
              addBlock(pageBlock);
              addBlock(boardBlock);
            }

            // Update parent block IDs (the Sprints collection_view)
            if (getBlock && updateBlock) {
              const sprintsBlockContext = getBlock(sprintBlockId);
              if (sprintsBlockContext) {
                const currentIds = sprintsBlockContext.blockIds || [];
                updateBlock(sprintBlockId, { blockIds: [...currentIds, pageBlock._id] });
              }

              const pageBlockContext = getBlock(pageBlock._id);
              if (pageBlockContext) {
                updateBlock(pageBlock._id, { blockIds: [boardBlock._id] });
              }
            }

            // Backend save for the page and its internal board
            await postWithAuth("/api/note/block/batch-create", {
              view_databaseId: sprintBoardBlockId,
              parentId: sprintsDataSource._id,
              workspaceId: workspaceId || "default",
              workareaId,
              parentTable: "collection",
              blocks: [
                {
                  _id: pageBlock._id,
                  blockType: "page",
                  value: pageBlock.value,
                  insertAfterBlockID: i === 0 ? null : sprintsPageBlocks[i - 1].pageBlock._id
                }
              ]
            });

            // The board inside the page
            await postWithAuth("/api/note/block/batch-create", {
              parentId: pageBlock._id,
              workspaceId: workspaceId || "default",
              workareaId,
              parentTable: "page",
              blocks: [
                {
                  _id: boardBlock._id,
                  blockType: "collection_view",
                  value: serializeViewDatabaseForAPI(boardBlock.value),
                  insertAfterBlockID: null
                }
              ]
            });
          }

          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: [
              {
                _id: sprintBoardBlockId,
                blockType: "collection_view",
                value: serializeViewDatabaseForAPI(sprintBoardDatabase),
                insertAfterBlockID: sprintBlockId,
              },
              {
                _id: paragraphBlockId,
                blockType: "content",
                value: { type: "paragraph" },
                insertAfterBlockID: sprintBoardBlockId,
              }
            ]
          });

        } catch (err) {
          console.error("Failed to insert sprint:", err);
        }
      },
    },
    {
      title: "Form",
      description: "Insert form view",
      category: "Database",
      searchTerms: ["form", "form view", "survey", "questionnaire"],
      icon: <FileText size={18} />,
      command: async ({ editor, range }) => {
        try {
          const formBlockId = new ObjectId().toString();
          const paragraphBlockId = new ObjectId().toString();

          console.log("[Form Command] Creating new form block:", formBlockId);

          // Find the current block to insert after it
          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockID = currentBlockId || null;
          const targetParentId = findClosestParentId(editor, range.from, parentId);

          // Delete the slash command text immediately (before any state changes)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          // Create the collection_view block structure using template
          const template = createCollectionViewTemplate({
            viewType: "forms",
            title: "My Task Board",
            icon: "",
            workspaceId: workspaceId || "default",
            userEmail: userEmail || "",
            blockId: formBlockId,
          });

          const { viewDatabase, dataSource } = template;

          // Optimistic update: Add block to context
          if (addBlock && workspaceId && userEmail) {
            const newBlock = {
              _id: formBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: viewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newBlock);

            const newParagraphBlock = {
              _id: paragraphBlockId,
              blockType: "content" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: { type: "paragraph" },
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newParagraphBlock);

            // Update parent page's blockIds
            if (getBlock && updateBlock) {
              const parentBlock = getBlock(targetParentId);
              if (parentBlock) {
                const currentIds = parentBlock.blockIds || [];
                const withBoardIds = insertAfter(
                  currentIds,
                  insertAfterBlockID,
                  formBlockId
                );
                const updatedBlockIds = insertAfter(
                  withBoardIds,
                  formBlockId,
                  paragraphBlockId
                );

                updateBlock(targetParentId, { blockIds: updatedBlockIds });
              }
            }
          }


          // Optimistic update: Add datasource to context BEFORE API call
          if (setDataSource && dataSource._id) {
            const dataSourceId = dataSource._id
            setDataSource(dataSourceId, dataSource);

            // Set currentDataSource for the board
            if (setCurrentDataSource) {
              setCurrentDataSource(formBlockId, dataSourceId);
            }
          }


          // Call API to create collection_view block with datasource
          const serializedDataSource = serializeDataSourceForAPI(dataSource);
          // console.log("[Form Command] Serialized datasource:", JSON.stringify(serializedDataSource, null, 2));

          // Get workareaId from parent block
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const workareaId = parentBlock?.workareaId || null;

          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: [
              {
                _id: formBlockId,
                blockType: "collection_view",
                value: serializeViewDatabaseForAPI(viewDatabase), // Serialize ObjectIds in viewDatabase,
                insertAfterBlockID,
              },
              {
                _id: paragraphBlockId,
                blockType: "content",
                value: { type: "paragraph" },
                insertAfterBlockID: formBlockId,
              }
            ],
            dataSourceDetail: serializedDataSource,
          });

          // editor
          //   .chain()
          //   .focus()
          //   .deleteRange(range)
          //   .insertContent([
          //     { type: "paragraph" },
          //     {
          //       type: "view_collection",
          //       attrs: {
          //         blockId: formBlockId,
          //         component: "form",
          //         initialBoard: viewDatabase,
          //       },
          //     },
          //     { type: "paragraph" },
          //   ])
          //   .run();
        } catch (err) {
          console.error("Failed to insert form:", err);
        }
      },
    },
    {
      title: "Chart",
      description: "Insert chart view",
      category: "Database",
      searchTerms: ["chart", "graph", "visualization", "bar", "line", "pie"],
      icon: <BarChart3 size={18} />,
      command: async ({ editor, range }) => {
        try {
          const chartBlockId = new ObjectId().toString();
          const paragraphBlockId = new ObjectId().toString();

          console.log("[Chart Command] Creating new chart block:", chartBlockId);

          // Find the current block to insert after it
          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockID = currentBlockId || null;
          const targetParentId = findClosestParentId(editor, range.from, parentId);

          // Delete the slash command text immediately (before any state changes)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          // Create the collection_view block structure using template
          // This ensures a proper dataSource is created and linked
          const template = createCollectionViewTemplate({
            viewType: "chart",
            title: "My Chart",
            icon: "",
            workspaceId: workspaceId || "default",
            userEmail: userEmail || "",
            blockId: chartBlockId,
          });

          const { viewDatabase, dataSource } = template;

          // Add the "Data" (list) view as a secondary view
          // This allows users to see the underlying data for the chart
          const dataViewId = new ObjectId().toString();
          if (!viewDatabase.viewsTypes) {
            viewDatabase.viewsTypes = [];
          }

          // Add list view
          viewDatabase.viewsTypes.push({
            _id: dataViewId,
            viewType: "list",
            title: "Data",
            icon: "",
            databaseSourceId: dataSource._id,
            viewDatabaseId: chartBlockId,
            settings: {
              propertyVisibility: [],
              filters: [],
              advancedFilters: []
            }
          });

          // Optimistic update: Add block to context
          if (addBlock && workspaceId && userEmail) {
            const newBlock = {
              _id: chartBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: viewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newBlock);

            const newParagraphBlock = {
              _id: paragraphBlockId,
              blockType: "content" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: { type: "paragraph" },
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newParagraphBlock);

            // Update parent page's blockIds
            if (getBlock && updateBlock) {
              const parentBlock = getBlock(targetParentId);
              if (parentBlock) {
                const currentIds = parentBlock.blockIds || [];
                const withBoardIds = insertAfter(
                  currentIds,
                  insertAfterBlockID,
                  chartBlockId
                );

                const updatedBlockIds = insertAfter(
                  withBoardIds,
                  chartBlockId,
                  paragraphBlockId
                );
                updateBlock(targetParentId, { blockIds: updatedBlockIds });
              }
            }
          }

          // Optimistic update: Add datasource to context BEFORE API call
          if (setDataSource && dataSource._id) {
            const dataSourceId = dataSource._id
            setDataSource(dataSourceId, dataSource);

            // Set currentDataSource for the board
            if (setCurrentDataSource) {
              setCurrentDataSource(chartBlockId, dataSourceId);
            }
          }

          // Get workareaId from parent block
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const workareaId = parentBlock?.workareaId || null;

          // Serialize data source for API
          const serializedDataSource = serializeDataSourceForAPI(dataSource);

          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: [
              {
                _id: chartBlockId,
                blockType: "collection_view",
                value: serializeViewDatabaseForAPI(viewDatabase),
                insertAfterBlockID,
              },
              {
                _id: paragraphBlockId,
                blockType: "content",
                value: { type: "paragraph" },
                insertAfterBlockID: chartBlockId,
              }
            ],
            dataSourceDetail: serializedDataSource,
          });

          // editor
          //   .chain()
          //   .focus()
          //   .deleteRange(range)
          //   .insertContent([
          //     { type: "paragraph" },
          //     {
          //       type: "view_collection",
          //       attrs: {
          //         blockId: chartBlockId,
          //         component: "chart",
          //         initialBoard: viewDatabase,
          //       },
          //     },
          //     { type: "paragraph" },
          //   ])
          //   .run();
        } catch (err) {
          console.error("Failed to insert chart:", err);
        }
      },
    },
    {
      title: "Gallery",
      description: "Insert gallery view",
      category: "Database",
      searchTerms: ["gallery", "cards", "grid", "images"],
      icon: <Images size={18} />,
      command: async ({ editor, range }) => {
        try {
          const galleryBlockId = new ObjectId().toString();
          const paragraphBlockId = new ObjectId().toString();

          console.log("[Gallery Command] Creating new gallery block:", galleryBlockId);

          // Find the current block to insert after it
          const { state } = editor;
          const $pos = state.doc.resolve(range.from);
          const currentBlock = $pos.node($pos.depth);
          const currentBlockId = currentBlock?.attrs?.blockId;
          const insertAfterBlockID = currentBlockId || null;
          const targetParentId = findClosestParentId(editor, range.from, parentId);

          // Delete the slash command text immediately (before any state changes)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          // Create the collection_view block structure using template
          const template = createCollectionViewTemplate({
            viewType: "gallery",
            title: "My Gallery",
            icon: "",
            workspaceId: workspaceId || "default",
            userEmail: userEmail || "",
            blockId: galleryBlockId,
          });

          const { viewDatabase, dataSource } = template;

          // Optimistic update: Add block to context
          if (addBlock && workspaceId && userEmail) {
            const newBlock = {
              _id: galleryBlockId,
              blockType: "collection_view" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: viewDatabase,
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newBlock);

            const newParagraphBlock = {
              _id: paragraphBlockId,
              blockType: "content" as const,
              workspaceId,
              parentId: targetParentId,
              parentType: "page" as const,
              value: { type: "paragraph" },
              blockIds: [],
              status: "alive" as const,
            };
            addBlock(newParagraphBlock);

            // Update parent page's blockIds
            if (getBlock && updateBlock) {
              const parentBlock = getBlock(targetParentId);
              if (parentBlock) {
                const currentIds = parentBlock.blockIds || [];
                const withBoardIds = insertAfter(
                  currentIds,
                  insertAfterBlockID,
                  galleryBlockId
                );
                const updatedBlockIds = insertAfter(
                  withBoardIds,
                  galleryBlockId,
                  paragraphBlockId
                );
                updateBlock(targetParentId, { blockIds: updatedBlockIds });
              }
            }
          }

          // Optimistic update: Add datasource to context BEFORE API call
          if (setDataSource && dataSource._id) {
            const dataSourceId = dataSource._id
            setDataSource(dataSourceId, dataSource);

            // Set currentDataSource for the board
            if (setCurrentDataSource) {
              setCurrentDataSource(galleryBlockId, dataSourceId);
            }
          }

          // Call API to create collection_view block with datasource
          const serializedDataSource = serializeDataSourceForAPI(dataSource);
          // console.log("[Gallery Command] Serialized datasource:", JSON.stringify(serializedDataSource, null, 2));

          // Get workareaId from parent block
          const parentBlock = getBlock ? getBlock(targetParentId) : null;
          const workareaId = parentBlock?.workareaId || null;

          await postWithAuth("/api/note/block/batch-create", {
            parentId: targetParentId,
            workspaceId: workspaceId || "default",
            workareaId,
            parentTable: "page",
            blocks: [
              {
                _id: galleryBlockId,
                blockType: "collection_view",
                value: serializeViewDatabaseForAPI(viewDatabase), // Serialize ObjectIds in viewDatabase,
                insertAfterBlockID,
              },
              {
                _id: paragraphBlockId,
                blockType: "content",
                value: { type: "paragraph" },
                insertAfterBlockID: galleryBlockId,
              }
            ],
            dataSourceDetail: serializedDataSource,
          });

        } catch (err) {
          console.error("Failed to insert gallery:", err);
        }
      },
    },
    {
      title: "CMS",
      description: "Link CMS content",
      category: "Advanced",
      searchTerms: ["cms", "content", "page"],
      icon: <FilePlus size={18} />,
      command: async ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();

        // Generate unique CMS ID
        const generateCmsId = () => {
          const timestamp = Date.now().toString(36);
          const random = Math.random().toString(36).substring(2, 9);
          return `cms_${timestamp}_${random}`;
        };

        // Get workspace ID as project ID
        const workspaceId =
          localStorage.getItem("workspaceId") ||
          window.location.pathname.split("/")[2] || // Try to get from URL
          "default_workspace";

        const contentId = generateCmsId();
        const locale = "en-US"; // Default locale

        try {
          // Create CMS content in database
          const res = await fetch(`/api/cms/contents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customId: contentId,
              projectId: workspaceId,
              type: "rich_text",
              fields: { body: "" },
              locale,
            }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data?.message || "Failed to create CMS content");

          // Insert CMS block into editor
          editor
            .chain()
            .focus()
            .insertContent([
              { type: "paragraph" },
              {
                type: "cmsBlock",
                attrs: {
                  contentId: data.id,
                  projectId: workspaceId,
                  content: "",
                  lastSavedContent: "",
                  locale,
                },
              },
              { type: "paragraph" },
            ])
            .run();
        } catch (e) {
          console.error("CMS creation error:", e);
          // If API fails, still create local block
          editor
            .chain()
            .focus()
            .insertContent([
              { type: "paragraph" },
              {
                type: "cmsBlock",
                attrs: {
                  contentId,
                  projectId: workspaceId,
                  content: "",
                  lastSavedContent: "",
                  locale,
                },
              },
              { type: "paragraph" },
            ])
            .run();
        }
      },
    },
  ]) as ExtendedSuggestionItem[];
};

export const getSlashCommand = (
  parentId: string,
  handlePageCreated: (href: string) => void,
  onAskAICommand?: () => void,
  onHistoryCommand?: () => void,
  isRestrictedPage?: boolean,
  isPublicNote?: boolean,
  workAreaId?: string,
) =>
  Command.configure({
    suggestion: {
      items: () => getSuggestionItems(parentId, handlePageCreated, onAskAICommand, onHistoryCommand, isRestrictedPage, isPublicNote, workAreaId),
      render: renderItems,
    },
  });
