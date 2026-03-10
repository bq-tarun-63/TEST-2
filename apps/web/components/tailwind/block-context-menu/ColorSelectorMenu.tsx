"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Editor } from "@tiptap/core";
import { Check } from "lucide-react";
import { DropdownMenuSectionHeading, DropdownMenu, DropdownMenuDivider } from "@/components/tailwind/ui/dropdown-menu";
import type { DropdownMenuItemProps } from "@/components/tailwind/ui/dropdown-menu";

// Use the same color definitions from color-selector.tsx
const TEXT_COLORS = [
  { name: "Default", color: "var(--novel-black)" },
  { name: "Gray", color: "var(--novel-text-gray)" },
  { name: "Brown", color: "var(--novel-text-brown)" },
  { name: "Orange", color: "var(--novel-text-orange)" },
  { name: "Yellow", color: "var(--novel-text-yellow)" },
  { name: "Green", color: "var(--novel-text-green)" },
  { name: "Blue", color: "var(--novel-text-blue)" },
  { name: "Purple", color: "var(--novel-text-purple)" },
  { name: "Pink", color: "var(--novel-text-pink)" },
  { name: "Red", color: "var(--novel-text-red)" },
];

const HIGHLIGHT_COLORS = [
  { name: "Default", color: "var(--novel-highlight-default)" },
  { name: "Gray", color: "var(--novel-highlight-gray)" },
  { name: "Brown", color: "var(--novel-highlight-brown)" },
  { name: "Orange", color: "var(--novel-highlight-orange)" },
  { name: "Yellow", color: "var(--novel-highlight-yellow)" },
  { name: "Green", color: "var(--novel-highlight-green)" },
  { name: "Blue", color: "var(--novel-highlight-blue)" },
  { name: "Purple", color: "var(--novel-highlight-purple)" },
  { name: "Pink", color: "var(--novel-highlight-pink)" },
  { name: "Red", color: "var(--novel-highlight-red)" },
];

interface ColorSelectorMenuProps {
  editor: Editor;
  onClose: () => void;
  onBack: () => void;
  anchorPosition: { top: number; left: number };
  showOnRight?: boolean;
}

export const ColorSelectorMenu: React.FC<ColorSelectorMenuProps> = ({
  editor,
  onClose,
  onBack,
  anchorPosition,
  showOnRight = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [editorState, setEditorState] = useState(0);

  // Store the original selection when menu opens to preserve it
  // This is critical - we need to preserve the selection that was set when menu opened
  const originalSelectionRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    // Store the current selection when menu opens
    // This selection was set by context-menu-plugin.ts to select the entire block
    const { from, to } = editor.state.selection;
    if (from !== to) {
      originalSelectionRef.current = { from, to };
    }
  }, []);

  // Continuously ensure editor maintains focus and selection is preserved
  // This prevents the selection from being lost when hovering
  useEffect(() => {
    if (!originalSelectionRef.current) return;

    const preserveSelection = () => {
      if (!originalSelectionRef.current) return;

      try {
        const currentSelection = editor.state.selection;
        const original = originalSelectionRef.current;

        // Check if document is still valid
        const docSize = editor.state.doc.content.size;
        if (original.from < 0 || original.to > docSize || original.from >= original.to) {
          return; // Invalid selection, don't try to restore
        }

        // If selection is empty or significantly different, restore it
        // Allow small differences (1-2 chars) to avoid constant restoration
        const fromDiff = Math.abs(currentSelection.from - original.from);
        const toDiff = Math.abs(currentSelection.to - original.to);

        if (currentSelection.empty ||
          (fromDiff > 2 || toDiff > 2)) {
          // Restore the original selection
          try {
            editor.chain().setTextSelection({ from: original.from, to: original.to }).run();
          } catch (error) {
            // Selection might be invalid now, ignore
          }
        }

        // Ensure editor has focus to maintain selection visually
        // But don't do this too aggressively to avoid focus stealing
        if (editor.view && !editor.view.hasFocus()) {
          // Use requestAnimationFrame to avoid conflicts
          requestAnimationFrame(() => {
            if (editor.view && originalSelectionRef.current) {
              editor.view.focus();
            }
          });
        }
      } catch (error) {
        // Ignore errors
      }
    };

    // Check periodically to preserve selection
    // Use a reasonable interval - not too frequent to avoid performance issues
    const interval = setInterval(preserveSelection, 150);

    return () => {
      clearInterval(interval);
    };
  }, [editor]);

  // Listen to editor updates to re-render when colors change
  // This is critical - we need to re-render when editor state changes
  useEffect(() => {
    const updateHandler = () => {
      // Force re-render by updating state
      setEditorState(prev => prev + 1);
    };

    // Listen to both update and selectionUpdate events
    editor.on("update", updateHandler);
    editor.on("selectionUpdate", updateHandler);
    editor.on("transaction", updateHandler);

    return () => {
      editor.off("update", updateHandler);
      editor.off("selectionUpdate", updateHandler);
      editor.off("transaction", updateHandler);
    };
  }, [editor]);

  // Use the provided left position (already calculated to be side by side with main menu)
  // Just ensure it doesn't go off screen
  const menuWidth = 220;
  const padding = 20;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = anchorPosition.left;

  // Ensure it doesn't go off screen
  if (left + menuWidth > viewportWidth - padding) {
    left = viewportWidth - menuWidth - padding;
  }
  if (left < padding) {
    left = padding;
  }

  // Calculate vertical position - align with main menu (side by side)
  // The submenu opens horizontally (to the side), aligned with the main menu's top
  const maxSubmenuHeight = viewportHeight * 0.5; // Reduced to 50vh max
  const estimatedSubmenuHeight = Math.min(250, maxSubmenuHeight); // Reduced cap at 250px

  // Align top of submenu with top of main menu
  let top = anchorPosition.top;

  // If submenu would cut off from bottom, adjust upward
  if (top + estimatedSubmenuHeight > viewportHeight - padding) {
    // Move up to fit within viewport
    top = viewportHeight - padding - estimatedSubmenuHeight;

    // If that pushes it above viewport, position at top with padding
    // (menu will scroll if needed, but won't cut off)
    if (top < padding) {
      top = padding;
    }
  }

  // Ensure it doesn't go above viewport
  if (top < padding) {
    top = padding;
  }

  // Get active colors - use the same logic as color-selector.tsx
  // Use useMemo to recalculate when editorState changes
  const activeColorItem = useMemo(() => {
    return TEXT_COLORS.find(({ color }) => editor.isActive("textStyle", { color }));
  }, [editor, editorState]);

  const activeHighlightItem = useMemo(() => {
    // Check for block background color attribute
    const { selection } = editor.state;
    try {
      const $anchor = selection.$anchor;
      let blockDepth = $anchor.depth;

      // Find the block node
      for (let d = blockDepth; d > 0; d--) {
        const node = $anchor.node(d);
        if (
          node.type.isBlock &&
          !node.type.name.includes("doc") &&
          node.type.name !== "columnLayout" &&
          node.type.name !== "columnItem"
        ) {
          if (node.attrs.backgroundColor) {
            return HIGHLIGHT_COLORS.find(({ color }) => color === node.attrs.backgroundColor);
          }
          break; // Found the block
        }
      }
    } catch (e) {
      // ignore
    }

    // Otherwise check for highlight mark (fallback/legacy)
    return HIGHLIGHT_COLORS.find(({ color }) => editor.isActive("highlight", { color }));
  }, [editor, editorState]);

  const handleTextColorSelect = useCallback((colorItem: typeof TEXT_COLORS[0]) => {
    // Use the exact same logic as color-selector.tsx
    // But ensure we target the correct selection if a block was selected via context menu

    // CRITICAL: Always use the original selection that was stored when menu opened
    let targetFrom = editor.state.selection.from;
    let targetTo = editor.state.selection.to;

    if (originalSelectionRef.current) {
      const original = originalSelectionRef.current;
      const docSize = editor.state.doc.content.size;

      // Validate original selection is still within document bounds
      if (original.from >= 0 && original.to <= docSize && original.from <= original.to) {
        // If we have a NodeSelection (which happens when clicking the drag handle),
        // we want to select the CONTENT of that node, not the node itself.
        // This is because setColor works on text ranges.
        const $from = editor.state.doc.resolve(original.from);
        const node = $from.nodeAfter;

        if (node && node.isBlock) {
          // It's a block selection. Select the content inside.
          targetFrom = original.from + 1;
          targetTo = original.from + node.nodeSize - 1;
        } else {
          // It's likely a text selection, use as is
          targetFrom = original.from;
          targetTo = original.to;
        }
      }
    }

    // Chain everything into a single transaction to prevent side effects
    // and ensure atomic application of color to the specific range
    const chain = editor.chain().focus().setTextSelection({ from: targetFrom, to: targetTo });

    if (colorItem.name === "Default") {
      chain.unsetColor();
    } else {
      chain.setColor(colorItem.color || "");
    }

    chain.run();

    // Restore original selection if it was a block selection to keep the UI consistent
    // But give it a moment for the color application to settle
    requestAnimationFrame(() => {
      if (originalSelectionRef.current) {
        const { from, to } = originalSelectionRef.current;
        editor.chain().setTextSelection({ from, to }).run();
      }
    });

    // Don't close - let user see the change and checkmark update
  }, [editor]);

  const handleHighlightColorSelect = useCallback((colorItem: typeof HIGHLIGHT_COLORS[0]) => {
    // CRITICAL: Always use the original selection that was stored when menu opened
    // This ensures we apply color to the correct block even if:
    // - User clicked outside (empty space) to close modal
    // - Editor lost focus
    // - Current selection is empty or changed

    const { state } = editor;
    let $from;

    // ALWAYS prefer original selection - this is the block that was selected when menu opened
    if (originalSelectionRef.current) {
      const original = originalSelectionRef.current;
      try {
        // Validate original selection is still within document bounds
        const docSize = state.doc.content.size;
        if (original.from >= 0 && original.to <= docSize && original.from <= original.to) {
          // Use original selection - this is the block we want to color
          $from = state.doc.resolve(original.from);
        } else {
          // Original selection is out of bounds, fall back to current
          $from = editor.state.selection.$from;
        }
      } catch (error) {
        // If resolution fails, try current selection
        $from = editor.state.selection.$from;
      }
    } else {
      // No original selection stored (shouldn't happen, but fallback)
      $from = editor.state.selection.$from;
    }

    // For regular blocks, apply backgroundColor attribute to the block node
    let blockDepth = $from.depth;
    let blockNode: any = null;
    let blockPos = -1;

    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (
        node.type.isBlock &&
        !node.type.name.includes("doc") &&
        node.type.name !== "columnLayout" &&
        node.type.name !== "columnItem"
      ) {
        blockNode = node;
        blockDepth = depth;
        blockPos = $from.before(depth);
        break;
      }
    }

    // Fallback for atom nodes at doc level (e.g. TOC):
    // When the drag handle is clicked, the selection resolves at depth 0
    // with nodeAfter pointing to the atom node itself.
    if (!blockNode && $from.nodeAfter?.isAtom) {
      blockNode = $from.nodeAfter;
      blockPos = $from.pos;
    }


    if (blockNode && blockPos !== -1) {
      // Use default color (transparent/null) if 'Default' is selected
      const newColor = colorItem.name === "Default" ? null : colorItem.color;

      // Update the block attributes directly using setNodeMarkup
      // This is robust and doesn't rely on text selection
      editor.chain().command(({ tr }) => {
        const attrs = { ...blockNode.attrs, backgroundColor: newColor };
        tr.setNodeMarkup(blockPos, undefined, attrs);
        return true;
      }).run();
    }

    // Restore the original selection after applying the color
    // This ensures the user's selection is preserved
    requestAnimationFrame(() => {
      try {
        if (originalSelectionRef.current) {
          const orig = originalSelectionRef.current;
          const docSize = editor.state.doc.content.size;
          if (orig.from >= 0 && orig.to <= docSize && orig.from <= orig.to) {
            editor.chain().setTextSelection({ from: orig.from, to: orig.to }).run();
          }
        }
      } catch (error) {
        // If selection restoration fails, just ensure editor has focus
        if (editor.view) {
          editor.view.focus();
        }
      }
    });
    // Don't close - let user see the change and checkmark update
  }, [editor]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && e.target && !menuRef.current.contains(e.target as HTMLElement)) {
        onBack();
      }
    };

    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onBack]);

  // Keyboard navigation - Escape to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  // Build text color menu items - check isActive directly like color-selector.tsx
  // Use useMemo to recalculate when editorState changes
  const textColorMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    return TEXT_COLORS.map((colorItem) => {
      const isActive = editor.isActive("textStyle", { color: colorItem.color });
      return {
        id: `text-${colorItem.name.toLowerCase()}`,
        label: colorItem.name,
        icon: (
          <div className="rounded-sm border px-2 py-px font-medium" style={{ color: colorItem.color }}>
            A
          </div>
        ),
        onClick: () => handleTextColorSelect(colorItem),
        rightElement: isActive ? <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" /> : undefined,
      };
    });
  }, [editor, editorState, handleTextColorSelect]);

  // Build highlight color menu items - check isActive directly like color-selector.tsx
  // Use useMemo to recalculate when editorState changes
  const highlightColorMenuItems: DropdownMenuItemProps[] = useMemo(() => {
    return HIGHLIGHT_COLORS.map((colorItem) => {
      const isActive = editor.isActive("highlight", { color: colorItem.color });
      return {
        id: `highlight-${colorItem.name.toLowerCase()}`,
        label: colorItem.name,
        icon: (
          <div className="rounded-sm border px-2 py-px font-medium" style={{ backgroundColor: colorItem.color }}>
            A
          </div>
        ),
        onClick: () => handleHighlightColorSelect(colorItem),
        rightElement: isActive ? <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" /> : undefined,
      };
    });
  }, [editor, editorState, handleHighlightColorSelect]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[10001] bg-background border rounded-lg shadow-lg w-[220px] max-w-[calc(100vw-24px)] max-h-[50vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100 ease-out"
      style={{
        top: `${top}px`,
        left: `${left}px`,
      }}
      role="menu"
      tabIndex={0}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        // Prevent mouse down from affecting editor selection
        e.stopPropagation();
        // Don't prevent default - we need clicks to work
      }}
      onMouseUp={(e) => {
        // Prevent mouse up from affecting editor
        e.stopPropagation();
      }}
      onMouseEnter={() => {
        // When hovering over menu, ensure editor maintains focus and selection
        if (originalSelectionRef.current) {
          const original = originalSelectionRef.current;
          // Restore selection if it was lost
          const currentSelection = editor.state.selection;
          if (currentSelection.empty ||
            currentSelection.from !== original.from ||
            currentSelection.to !== original.to) {
            editor.chain().setTextSelection({ from: original.from, to: original.to }).run();
          }
          // Ensure editor has focus
          if (editor.view && !editor.view.hasFocus()) {
            requestAnimationFrame(() => {
              if (editor.view) {
                editor.view.focus();
              }
            });
          }
        }
      }}
    >
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Text Color Section */}
        <div className="p-1">
          <div className="px-2 mt-1.5 mb-2">
            <DropdownMenuSectionHeading>Color</DropdownMenuSectionHeading>
          </div>
          <DropdownMenu items={textColorMenuItems} />
        </div>

        {/* Divider */}
        <div className="px-1">
          <DropdownMenuDivider />
        </div>

        {/* Background Color Section */}
        <div className="p-1">
          <div className="px-2 mt-1.5 mb-2">
            <DropdownMenuSectionHeading>Background</DropdownMenuSectionHeading>
          </div>
          <DropdownMenu items={highlightColorMenuItems} />
        </div>
      </div>
    </div>
  );
};

