import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
// import { NodeSelection } from 'prosemirror-view';
import { NodeSelection } from "prosemirror-state";

import { Decoration, DecorationSet } from "prosemirror-view";
import { DOMSerializer, Node } from "prosemirror-model";

export interface CustomDragHandleOptions {
    handleClass: string;
}

export const CustomDragHandle = Extension.create<CustomDragHandleOptions>({
    name: "customDragHandle",

    addOptions() {
        return {
            handleClass: "drag-handle",
        };
    },

    addProseMirrorPlugins() {
        const { handleClass } = this.options;

        return [
            new Plugin({
                key: new PluginKey("custom-drag-handle"),
                state: {
                    init() {
                        return DecorationSet.empty;
                    },
                    apply(tr, set) {
                        // Adjust decoration positions on document changes
                        set = set.map(tr.mapping, tr.doc);

                        // Check for meta to update the decoration explicitly (e.g. on hover)
                        const meta = tr.getMeta("custom-drag-handle");
                        if (meta) {
                            if (meta.action === "update" && typeof meta.pos === "number") {
                                const $pos = tr.doc.resolve(meta.pos)
                                // if (!$pos.nodeAfter || !$pos.nodeAfter.isBlock) return set
                                // const widget = Decoration.widget(
                                //     meta.pos,
                                //     (view) => {
                                //         const el = document.createElement("div");
                                //         el.classList.add(handleClass);
                                //         el.draggable = true;
                                //         el.setAttribute("data-drag-handle", "true");
                                //         el.style.transition = "none"; // Instant update
                                //         el.innerHTML = `<svg viewBox="0 0 10 10" width="16" height="16" class="opacity-50 hover:opacity-100 cursor-grab text-gray-500"><path d="M3,2 C3.55228,2 4,2.44772 4,3 C4,3.55228 3.55228,4 3,4 C2.44772,4 2,3.55228 2,3 C2,2.44772 2.44772,2 3,2 Z M3,6 C3.55228,6 4,6.44772 4,7 C4,7.55228 3.55228,8 3,8 C2.44772,8 2,7.55228 2,7 C2,6.44772 2.44772,6 3,6 Z M7,2 C7.55228,2 8,2.44772 8,3 C8,3.55228 7.55228,4 7,4 C6.44772,4 6,3.55228 6,3 C6,2.44772 6.44772,2 7,2 Z M7,6 C7.55228,6 8,6.44772 8,7 C8,7.55228 7.55228,8 7,8 C6.44772,8 6,7.55228 6,7 C6,6.44772 6.44772,6 7,6 Z" fill="currentColor"></path></svg>`;
                                //         el.style.position = "absolute";
                                //         el.style.left = "-4px";     // push it into the left gutter
                                //         // el.style.top = "1px";
                                //         // el.style.width = "20px";
                                //         // el.style.height = "20px";
                                //         // el.style.display = "flex";
                                //         // el.style.alignItems = "center";
                                //         // el.style.justifyContent = "center";
                                //         // el.style.pointerEvents = "auto";
                                //         // el.style.zIndex = "50";
                                //         // el.style.background = "red";
                                //         // el.style.width = "40px";
                                //         // el.style.height = "40px";
                                //         // --- Drag Start Logic ---
                                //         el.addEventListener("dragstart", (e) => {
                                //             if (!e.dataTransfer) return;

                                //             // The handle is rendered at `meta.pos` which corresponds to the start of the block
                                //             const nodePos = meta.pos;
                                //             const $pos = view.state.doc.resolve(nodePos);
                                //             const node = view.state.doc.nodeAt(nodePos);

                                //             if (!node) return;

                                //             // 1. Select the node
                                //             const selection = NodeSelection.create(view.state.doc, nodePos);
                                //             view.dispatch(view.state.tr.setSelection(selection));

                                //             // 2. Serialize content for clipboard/drag data
                                //             const slice = selection.content();

                                //             // Use simpler manual serialization if internal methods aren't available
                                //             const serializer = DOMSerializer.fromSchema(view.state.schema);
                                //             const dom = serializer.serializeFragment(slice.content);

                                //             const wrapper = document.createElement("div");
                                //             wrapper.appendChild(dom);

                                //             // 3. Set DataTransfer
                                //             e.dataTransfer.clearData();
                                //             e.dataTransfer.setData('text/html', wrapper.innerHTML);
                                //             e.dataTransfer.setData('text/plain', node.textContent);
                                //             e.dataTransfer.effectAllowed = 'copyMove';
                                //             e.dataTransfer.setDragImage(el, 0, 0);

                                //             // 4. Set view.dragging to let ProseMirror know we are moving this slice
                                //             view.dragging = { slice, move: !e.ctrlKey };
                                //         });

                                //         return el;
                                //     },
                                //     {
                                //         side: -1, // Render before the block
                                //         key: "drag-handle-widget",
                                //         ignoreSelection: true,
                                //     }
                                // );

                                const widget = Decoration.widget(
                                    meta.pos,
                                    (view) => {
                                        const wrapper = document.createElement("div");
                                        wrapper.style.position = "absolute";
                                        wrapper.style.height = "10px";
                                        wrapper.style.width = "10px";
                                        wrapper.style.overflow = "visible";
                                        wrapper.style.pointerEvents = "none";
                                        wrapper.style.marginLeft = "5px";
                                        wrapper.style.marginRight = "5px";
                                        const el = document.createElement("div");
                                        el.classList.add(handleClass);
                                        el.draggable = true;
                                        el.setAttribute("data-drag-handle", "true");
                                        el.setAttribute("data-node-pos", meta.pos.toString());
                                        el.setAttribute("data-node-type", meta.nodeType || "block");

                                        // IMPORTANT: no inline positioning here — CSS controls look
                                        // We only set horizontal placement
                                        // el.style.left = "-1.6rem";   // sits inside gutter
                                        // el.style.top = "0.25rem";    // slight vertical alignment tweak
                                        // el.style.transform = "translateX(-1.75rem)";

                                        el.style.pointerEvents = "auto";
                                        // el.style.border = "1px solid red";
                                        el.addEventListener("dragstart", (e) => {
                                            if (!e.dataTransfer) return;

                                            // Stop event from bubbling up to ProseMirror which would otherwise 
                                            // override our invisible drag image with its own default screenshot
                                            e.stopPropagation();

                                            try {
                                                let nodePos = meta.pos;
                                                console.log("[DragHandle] DragStart at meta pos:", nodePos);

                                                let $resolved = view.state.doc.resolve(nodePos);
                                                let node = $resolved.nodeAfter;

                                                // Check if we are physically inside a list item (because we changed placement to $pos.start(d))
                                                // If nodeAfter is null, or if the parent is a list/task item and we are at start
                                                // We need to back out 1 position to grab the actual list item node.
                                                // Note: $resolved.parent should be the node containing the widget.
                                                const parent = $resolved.parent;
                                                if (parent && (parent.type.name === "listItem" || parent.type.name === "taskItem")) {
                                                    // Verify we are at the start (pos inside == pos before + 1)
                                                    const posBefore = $resolved.before($resolved.depth);
                                                    if (nodePos === posBefore + 1) {
                                                        console.log("[DragHandle] Detected inside list item, adjusting pos -1");
                                                        nodePos = nodePos - 1;
                                                        $resolved = view.state.doc.resolve(nodePos);
                                                        node = $resolved.nodeAfter;
                                                    }
                                                }

                                                console.log("[DragHandle] Node found:", node?.type.name);

                                                if (!node) return;

                                                let slice;
                                                try {
                                                    const selection = NodeSelection.create(view.state.doc, nodePos);
                                                    view.dispatch(view.state.tr.setSelection(selection));
                                                    slice = selection.content();
                                                    console.log("[DragHandle] NodeSelection successful");
                                                } catch (e) {
                                                    console.warn("[DragHandle] Node selection failed, falling back to slice:", e);
                                                    slice = view.state.doc.slice(nodePos, nodePos + node.nodeSize);
                                                }

                                                const serializer = DOMSerializer.fromSchema(view.state.schema);
                                                const dom = serializer.serializeFragment(slice.content);

                                                const temp = document.createElement("div");
                                                temp.appendChild(dom);

                                                e.dataTransfer.clearData();
                                                e.dataTransfer.setData("text/html", temp.innerHTML);
                                                e.dataTransfer.setData("text/plain", node.textContent);
                                                e.dataTransfer.effectAllowed = "copyMove";

                                                // If this is a page block, set specific data transfer and dispatch event
                                                if (node.type.name === 'page') {
                                                    const href = node.attrs.href;
                                                    if (href) {
                                                        const pageId = href.replace('/notes/', '');
                                                        if (pageId) {
                                                            console.log("[DragHandle] Page block Native dragstart attached: ", pageId);
                                                            e.dataTransfer.setData("application/page-block-from-editor", pageId);
                                                            e.dataTransfer.setData("text/plain", pageId);
                                                            window.dispatchEvent(new CustomEvent("page-drag-start", { detail: { pageId } }));
                                                        }
                                                    }

                                                    // Create custom drag image
                                                    const nodeDom = view.nodeDOM(nodePos) as HTMLElement;
                                                    if (nodeDom) {
                                                        const dragImage = nodeDom.cloneNode(true) as HTMLElement;
                                                        dragImage.style.position = 'absolute';
                                                        dragImage.style.top = '-1000px';
                                                        document.body.appendChild(dragImage);
                                                        e.dataTransfer.setDragImage(dragImage, 0, 0);

                                                        // Clean up after drag starts
                                                        setTimeout(() => {
                                                            if (document.body.contains(dragImage)) {
                                                                document.body.removeChild(dragImage);
                                                            }
                                                        }, 0);
                                                    }
                                                }

                                                view.dragging = { slice, move: !e.ctrlKey };
                                            } catch (err) {
                                                console.error("[DragHandle] DragStart Error:", err);
                                            }
                                        });

                                        wrapper.appendChild(el);
                                        return wrapper;
                                    },
                                    {
                                        side: -1,
                                        key: "drag-handle-widget",
                                        ignoreSelection: true,
                                    }
                                );

                                return DecorationSet.create(tr.doc, [widget]);
                            } else if (meta.action === "hide") {
                                return DecorationSet.empty;
                            }
                        }
                        return set;
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                    handleDOMEvents: {
                        mousemove(view, event) {
                            const pos = view.posAtCoords({
                                left: event.clientX,
                                top: event.clientY,
                            });

                            if (!pos) return false;

                            const $pos = view.state.doc.resolve(pos.pos);

                            let candidateNode: Node | null = null;
                            let candidatePos = -1;

                            // Helper to check if a node is a valid target block (ignoring containers)
                            const isValidBlock = (n: any) => {
                                return (
                                    n.isBlock &&
                                    n.type.name !== "orderedList" &&
                                    n.type.name !== "bulletList" &&
                                    n.type.name !== "taskList" &&
                                    n.type.name !== "columnLayout" &&
                                    n.type.name !== "columnItem" &&
                                    n.type.name !== "tableRow" &&
                                    n.type.name !== "tableCell" &&
                                    n.type.name !== "tableHeader" &&
                                    n.type.name !== "doc"
                                );
                            };

                            // 1. Walk up ancestors (detects when hovering INSIDE content)
                            // We prioritize finding a 'listItem' or 'taskItem' ancestor.

                            // NEW: Use DOM-based detection for list items (more reliable for nested lists)
                            const target = event.target as HTMLElement;
                            const li = target.closest('li');
                            if (li) {
                                try {
                                    // posAtDOM(li, 0) gives position INSIDE li, at start.
                                    // If we use view.state.doc.resolve(pos), we usually get a position inside the text block.
                                    // But we want the listItem node.
                                    const interiorPos = view.posAtDOM(li, 0);
                                    if (interiorPos >= 0) {
                                        const $interior = view.state.doc.resolve(interiorPos);
                                        // Let's rely on finding the listItem ancestor of the resolved pos.
                                        for (let d = $interior.depth; d > 0; d--) {
                                            const node = $interior.node(d);
                                            if (node && (node.type.name === "listItem" || node.type.name === "taskItem")) {
                                                candidateNode = node;
                                                candidatePos = $interior.start(d);
                                                break;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // console.warn("[DragHandle] DOM pos resolution failed:", e);
                                }
                            }

                            if (!candidateNode) {
                                for (let d = $pos.depth; d > 0; d--) {
                                    const n = $pos.node(d);

                                    if (n.type.name === "listItem" || n.type.name === "taskItem") {
                                        candidateNode = n;
                                        // Move widget INSIDE the list item so it's a valid child of <li>, not <ul>
                                        candidatePos = $pos.start(d);
                                        break; // Found Priority 1 (List/Task Item) -> Stop looking
                                    }

                                    // If we haven't found a candidate yet, and this is a valid block
                                    if (!candidateNode && isValidBlock(n)) {
                                        candidateNode = n;
                                        candidatePos = $pos.before(d);
                                    }
                                }
                            }

                            // 2. Check node directly at cursor (detects when hovering GUTTER/Boundary)
                            // Only perform this check if we haven't already locked onto a 'listItem' or 'taskItem'
                            if (!candidateNode || (candidateNode.type.name !== "listItem" && candidateNode.type.name !== "taskItem")) {
                                const nodeAfter = view.state.doc.nodeAt(pos.pos);
                                if (nodeAfter && nodeAfter.isBlock) {
                                    if (nodeAfter.type.name === "listItem" || nodeAfter.type.name === "taskItem") {
                                        // Priority 1: Found list/task item directly at cursor
                                        candidateNode = nodeAfter;
                                        // For list items, we want inside
                                        candidatePos = pos.pos + 1;
                                    } else if (isValidBlock(nodeAfter)) {
                                        // Found a specific valid block at cursor (e.g. Paragraph)
                                        // This overrides any generic ancestor candidate (like a ColumnItem wrapper)
                                        // because we are pointing directly at this specific block.
                                        candidateNode = nodeAfter;
                                        candidatePos = pos.pos;
                                    }
                                }
                            }

                            if (!candidateNode) {
                                view.dispatch(view.state.tr.setMeta("custom-drag-handle", { action: "hide" }));
                                return false;
                            }

                            const currentDecorations = this.getState(view.state);
                            // @ts-ignore
                            const found = currentDecorations.find();
                            const currentPos = found.length ? found[0].from : -1;

                            if (currentPos === candidatePos) return false;

                            view.dispatch(
                                view.state.tr.setMeta("custom-drag-handle", {
                                    action: "update",
                                    pos: candidatePos,
                                    nodeType: candidateNode.type.name,
                                })
                            );

                            return false;
                        },
                        mouseleave(view) {
                            view.dispatch(view.state.tr.setMeta("custom-drag-handle", { action: "hide" }));
                            return false;
                        },
                        keydown(view, event) {
                            // Hide the drag handle immediately when any key (like arrows) is pressed
                            const currentDecorations = this.getState(view.state);
                            // @ts-ignore
                            const found = currentDecorations.find();
                            if (found.length) {
                                view.dispatch(view.state.tr.setMeta("custom-drag-handle", { action: "hide" }));
                            }
                            return false; // Let ProseMirror handle the keydown still
                        }
                    },
                },
            }),
        ];
    },
});
