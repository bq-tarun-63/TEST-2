"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import EmojiPicker from "./editor/EmojiPicker";
import { postWithAuth } from "@/lib/api-helpers";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { useDragState } from "@/contexts/dragStateContext";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface PageBlockAttrs {
  href: string;
  title: string;
  icon?: string;
}

// Page block component - displays a link to a page
const PageBlockView: React.FC<NodeViewProps> = ({ node, updateAttributes }) => {
  const attrs = (node as { attrs: PageBlockAttrs }).attrs;
  const { href, title, icon } = attrs;
  const [currentIcon, setCurrentIcon] = useState(icon || "");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUpdatingIcon, setIsUpdatingIcon] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const iconButtonRef = useRef<HTMLSpanElement>(null);
  const { updateBlock, getBlock } = useGlobalBlocks();
  const { currentWorkspace } = useWorkspaceContext();
  const { setDragState } = useDragState();
  const { user } = useAuth();

  // Resolve ownership of the linked page
  const pageId = href ? href.replace('/notes/', '') : null;
  // If we can't find the block in context, we assume ownership to allow dragging for local/new notes 
  // or notes we just added. But for public/shared notes, the block should be in context.

  useEffect(() => {
    if (attrs.icon !== currentIcon) {
      setCurrentIcon(attrs.icon || "");
    }
  }, [attrs.icon]);

  // Prevent body scroll when emoji picker is open
  useEffect(() => {
    if (showEmojiPicker) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showEmojiPicker]);

  const handleIconClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowEmojiPicker(true);
  };



  const handleEmojiSelect = async (emoji: string) => {
    if (isUpdatingIcon) return;

    setShowEmojiPicker(false);

    // Extract page ID from href (format: /notes/{pageId})
    const pageId = href ? href.replace('/notes/', '') : null;

    if (!pageId) {
      return;
    }

    const previousIcon = currentIcon;

    // Optimistically update UI
    setCurrentIcon(emoji);
    updateAttributes({ icon: emoji });
    setIsUpdatingIcon(true);

    try {
      // Get the actual PAGE block
      const pageBlock = getBlock(pageId);
      if (!pageBlock) {
        throw new Error("Page block not found");
      }

      // Update the PAGE block's icon via API
      const workspaceId = currentWorkspace?._id;
      if (!workspaceId) {
        throw new Error("Workspace not found");
      }

      // Optimistic update in block context
      const updatedValue = {
        ...pageBlock.value,
        icon: emoji || "",
      };
      updateBlock(pageId, { value: updatedValue });

      // Call API to update the PAGE block
      await postWithAuth("/api/note/block/batch-update", {
        parentId: pageBlock.parentId,
        workspaceId: workspaceId,
        blocks: [
          {
            _id: pageId,
            content: updatedValue,
          }
        ],
      });

    } catch (error) {
      console.error("Failed to update page icon:", error);
      // Rollback optimistic updates
      setCurrentIcon(previousIcon);
      updateAttributes({ icon: previousIcon });

      // Rollback block context
      const pageBlock = getBlock(pageId);
      if (pageBlock) {
        updateBlock(pageId, { value: pageBlock.value });
      }
    } finally {
      setIsUpdatingIcon(false);
    }
  };

  return (
    <NodeViewWrapper
      data-type="page"
      className="books-selectable"
      style={{
        width: "100%",
        marginTop: "1px",
        marginBottom: "1px",
      }}
    >
      <div
        className="w-full rounded-[4px] px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors hover:cursor-pointer"
        contentEditable={false}
        data-content-editable-void="true"
        draggable={true}
        onDragStart={(e) => {
          // We set draggable to true to keep Prosemirror from resolving positions inside this atomic block (fixes dropPoint crash)
          // But we prevent the drag natively so users MUST use the block's official drag handle instead of the body
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          userSelect: 'none',
        }}
      >
        <a
          href={href}
          draggable={false}
          className={cn(
            "text-muted-foreground underline underline-offset-[3px]",
            "hover:text-primary transition-colors cursor-pointer",
            "inline-flex items-center gap-1"
          )}
          onClick={(e) => {
            // Prevent default to stop the native browser from also navigating the current tab.
            // Tiptap's native click handler (TiptapLink) catches this first and opens the link in a new tab.
            e.preventDefault();
          }}
        >
          <span
            ref={iconButtonRef}
            className="cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-0.5 transition-colors"
            onClick={handleIconClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleIconClick(e as any);
              }
            }}
          >
            {currentIcon ? (
              <span
                style={{
                  fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
                  fontSize: "16px",
                }}
              >
                {currentIcon}
              </span>
            ) : (
              <FileText size={18} className="inline-block" />
            )}
          </span>
          {title}
        </a>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
          currentEmoji={currentIcon}
          anchorRef={iconButtonRef}
          position="fixed"
        />
      )}
    </NodeViewWrapper>
  );
};

export const PageBlockExtension = Node.create({
  name: "page",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      href: {
        default: null,
      },
      title: {
        default: "New page",
      },
      icon: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-icon"),
        renderHTML: (attributes) => {
          if (!attributes.icon) {
            return {};
          }
          return {
            "data-icon": attributes.icon,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="page"]',
        getAttrs: (dom) => ({
          href: (dom as HTMLElement).querySelector('a')?.getAttribute('href'),
          title: (dom as HTMLElement).querySelector('a')?.textContent || 'New page',
          icon: (dom as HTMLElement).getAttribute('data-icon'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "page" }),
      [
        "a",
        {
          href: HTMLAttributes.href,
          class: "text-muted-foreground underline underline-offset-[3px] hover:text-primary transition-colors cursor-pointer",
        },
        HTMLAttributes.title,
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBlockView);
  },
});

export default PageBlockExtension;
