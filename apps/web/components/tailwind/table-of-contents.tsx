"use client"

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import React, { useEffect, useState } from "react";

// Callout component
const TOCView: React.FC<NodeViewProps> = ({ editor, node }) => {
    const [items, setItems] = useState<any[]>([]);
    const { backgroundColor, textColor } = (node as any).attrs;

    useEffect(() => {
        // Initial fetch
        // @ts-ignore
        const tocStorage = editor.storage.tableOfContents;
        if (tocStorage) {
            setItems(tocStorage.content);
        }

        // Subscribe to updates
        const handleUpdate = () => {
            // @ts-ignore
            const storage = editor.storage.tableOfContents;
            if (storage) {
                setItems(storage.content);
            }
        };

        editor.on('update', handleUpdate);
        editor.on('selectionUpdate', handleUpdate);

        return () => {
            editor.off('update', handleUpdate);
            editor.off('selectionUpdate', handleUpdate);
        };
    }, [editor]);

    if (items.length === 0) {
        return (
            <NodeViewWrapper
                className="toc-empty p-4 bg-gray-50 rounded-lg border border-gray-200 text-gray-500 text-sm"
                data-type="toc"
            >
                Table of Contents (No headings found)
            </NodeViewWrapper>
        );
    }

    const handleItemClick = (e: React.MouseEvent, item: any) => {
        e.preventDefault();
        e.stopPropagation();

        const blockId = item.node?.attrs?.blockId;
        let targetElement: Element | null = null;

        if (blockId) {
            targetElement = document.querySelector(`[data-block-id="${blockId}"]`);
        }

        if (!targetElement && item.id) {
            targetElement = document.getElementById(item.id);
        }

        if (targetElement) {
            const yOffset = -100; // Offset for fixed header
            const y = targetElement.getBoundingClientRect().top + window.scrollY + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
            return;
        }

        console.warn("TOC: Could not find target element for item", item);
    };

    return (
        <NodeViewWrapper
            className="toc-container notranslate mb-2 p-2 rounded-lg transition-colors border border-transparent hover:border-gray-100"
            data-type="toc"
            data-background-color={backgroundColor || ''}
            style={{
                backgroundColor: backgroundColor || 'transparent',
            }}
        >
            <div contentEditable={false}>
                <ul className="flex flex-col gap-1 m-0 p-0 list-none">
                    {items.map((item, index) => (
                        <li
                            key={index}
                            className={`toc-item toc-item-level-${item.level} m-0`}
                            style={{
                                marginLeft: `${(item.level - 1) * 1.5}rem`,
                                listStyle: 'none'
                            }}
                        >
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => handleItemClick(e, item)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleItemClick(e as any, item);
                                    }
                                }}
                                className={`text-sm transition-colors block py-0.5 cursor-pointer underline decoration-gray-300 underline-offset-4 ${item.isActive
                                    ? 'font-medium decoration-gray-900'
                                    : item.isScrolledOver
                                        ? ''
                                        : 'hover:opacity-80'
                                    }`}
                                style={{ color: textColor || (item.isActive ? undefined : item.isScrolledOver ? undefined : undefined) }}
                                data-active={item.isActive}
                                data-scrolled={item.isScrolledOver}
                            >
                                {item.textContent}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </NodeViewWrapper>
    );
};

// TipTap Extension
export const TOCExtension = Node.create({
    name: "toc",
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            backgroundColor: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-background-color') || element.style.backgroundColor || null,
                renderHTML: (attributes) => {
                    if (!attributes.backgroundColor) return {};
                    return {
                        'data-background-color': attributes.backgroundColor,
                        style: `background-color: ${attributes.backgroundColor}`
                    };
                },
            },
            textColor: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-text-color') || null,
                renderHTML: (attributes) => {
                    if (!attributes.textColor) return {};
                    return { 'data-text-color': attributes.textColor };
                },
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="toc"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toc" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(TOCView);
    },
});
