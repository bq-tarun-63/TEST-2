"use client"

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import * as React from "react";
import { useState, useEffect, useRef } from "react";
import EmojiPicker from "./editor/EmojiPicker";

interface CalloutAttrs {
  icon?: string;
  backgroundColor?: string;
}

// Callout component
const CalloutView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  editor,
}) => {
  const attrs = (node as { attrs: CalloutAttrs }).attrs;
  const [icon, setIcon] = useState(attrs.icon || "💡");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const iconButtonRef = useRef<HTMLDivElement>(null);
  const backgroundColor = attrs.backgroundColor || "var(--c-graBacPri, #f7f6f3)";

  useEffect(() => {
    if (attrs.icon !== icon) {
      setIcon(attrs.icon || "💡");
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

  const handleIconChange = (newIcon: string) => {
    setIcon(newIcon);
    updateAttributes({ icon: newIcon });
  };

  const handleIconClick = () => {
    setShowEmojiPicker(true);
  };

  const handleEmojiSelect = (emoji: string) => {
    handleIconChange(emoji);
    setShowEmojiPicker(false);
  };

  return (
    <NodeViewWrapper
      as="div"
      data-type="callout"
      style={{
        display: "flex",
        width: "100%",
        marginTop: "4px",
        marginBottom: "4px",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          minWidth: "100%",
          maxWidth: "100%",
          borderRadius: "10px",
          border: "1px solid transparent",
          background: backgroundColor,
          padding: "12px",
          alignItems: "flex-start",
          gap: "20px",
        }}
      >
        {/* Icon section */}
        <div
          ref={iconButtonRef}
          contentEditable={false}
          style={{
            userSelect: "none",
            flexShrink: 0,
            marginTop: "4px",
          }}
        >
          <div
            role="button"
            tabIndex={0}
            className="books-record-icon notranslate"
            aria-label="Change callout icon"
            onClick={handleIconClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleIconClick();
              }
            }}
            style={{
              userSelect: "none",
              transition: "background 20ms ease-in",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "24px",
              width: "24px",
              borderRadius: "0.25em",
              fontSize: "16.8px",
              lineHeight: 1,
              fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
            }}
          >
            {icon}
          </div>
        </div>

        {/* Content section */}
        <NodeViewContent
          className="notranslate"
          style={{
            flex: "1 1 0%",
            minWidth: 0,
            width: "100%",
            minHeight: "1em",
            paddingTop: "8px",
            paddingBottom: "8px",
            color: "var(--c-texPri, inherit)",
            caretColor: "var(--c-texPri, inherit)",
          }}
        />
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
          currentEmoji={icon}
          anchorRef={iconButtonRef}
          position="fixed"
        />
      )}
    </NodeViewWrapper>
  );
};

// TipTap Extension
export const CalloutExtension = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  draggable: true,

  addAttributes() {
    return {
      icon: {
        default: "💡",
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-background-color") || element.style.backgroundColor,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) {
            return {};
          }
          return {
            "data-background-color": attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

export default CalloutExtension;

