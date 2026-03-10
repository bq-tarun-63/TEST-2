import { Check, ChevronDown } from "lucide-react";
import { EditorBubbleItem, useEditor } from "novel";

import { Button } from "@/components/tailwind/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/tailwind/ui/popover";
export interface BubbleColorMenuItem {
  name: string;
  color: string;
}

const TEXT_COLORS: BubbleColorMenuItem[] = [
  {
    name: "Default",
    color: "var(--novel-black)",
  },
  {
    name: "Gray",
    color: "var(--novel-text-gray)",
  },
  {
    name: "Brown",
    color: "var(--novel-text-brown)",
  },
  {
    name: "Orange",
    color: "var(--novel-text-orange)",
  },
  {
    name: "Yellow",
    color: "var(--novel-text-yellow)",
  },
  {
    name: "Green",
    color: "var(--novel-text-green)",
  },
  {
    name: "Blue",
    color: "var(--novel-text-blue)",
  },
  {
    name: "Purple",
    color: "var(--novel-text-purple)",
  },
  {
    name: "Pink",
    color: "var(--novel-text-pink)",
  },
  {
    name: "Red",
    color: "var(--novel-text-red)",
  },
];

const HIGHLIGHT_COLORS: BubbleColorMenuItem[] = [
  {
    name: "Default",
    color: "var(--novel-highlight-default)",
  },
  {
    name: "Gray",
    color: "var(--novel-highlight-gray)",
  },
  {
    name: "Brown",
    color: "var(--novel-highlight-brown)",
  },
  {
    name: "Orange",
    color: "var(--novel-highlight-orange)",
  },
  {
    name: "Yellow",
    color: "var(--novel-highlight-yellow)",
  },
  {
    name: "Green",
    color: "var(--novel-highlight-green)",
  },
  {
    name: "Blue",
    color: "var(--novel-highlight-blue)",
  },
  {
    name: "Purple",
    color: "var(--novel-highlight-purple)",
  },
  {
    name: "Pink",
    color: "var(--novel-highlight-pink)",
  },
  {
    name: "Red",
    color: "var(--novel-highlight-red)",
  },
];

interface ColorSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ColorSelector = ({ open, onOpenChange }: ColorSelectorProps) => {
  const { editor } = useEditor();

  if (!editor) return null;
  const activeColorItem = TEXT_COLORS.find(({ color }) => editor.isActive("textStyle", { color }));

  const activeHighlightItem = (() => {
    // Check for highlight mark
    const highlightItem = HIGHLIGHT_COLORS.find(({ color }) => editor.isActive("highlight", { color }));
    if (highlightItem) return highlightItem;

    // Check for block background color attribute
    const { selection } = editor.state;
    const { $from } = selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.isBlock && node.attrs.backgroundColor) {
        return HIGHLIGHT_COLORS.find(({ color }) => color === node.attrs.backgroundColor);
      }
      if (node.type.isBlock) break;
    }

    return undefined;
  })();

  return (
    <Popover modal={true} open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" className="gap-2 rounded-none" variant="ghost">
          <span
            className="rounded-sm px-1"
            style={{
              color: activeColorItem?.color,
              backgroundColor: activeHighlightItem?.color,
            }}
          >
            A
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        sideOffset={5}
        className="my-1 flex max-h-80 w-48 flex-col overflow-hidden overflow-y-auto rounded border p-1 shadow-xl "
        align="start"
      >
        <div className="flex flex-col">
          <div className="my-1 px-2 text-sm font-semibold text-muted-foreground">Color</div>
          {TEXT_COLORS.map(({ name, color }) => (
            <EditorBubbleItem
              key={name}
              onSelect={() => {
                editor.commands.unsetColor();
                name !== "Default" &&
                  editor
                    .chain()
                    .focus()
                    .setColor(color || "")
                    .run();
                onOpenChange(false);
              }}
              className="flex cursor-pointer items-center justify-between px-2 py-1 text-sm hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <div className="rounded-sm border px-2 py-px font-medium" style={{ color }}>
                  A
                </div>
                <span>{name}</span>
              </div>
            </EditorBubbleItem>
          ))}
        </div>
        <div>
          <div className="my-1 px-2 text-sm font-semibold text-muted-foreground">Background</div>
          {HIGHLIGHT_COLORS.map(({ name, color }) => (
            <EditorBubbleItem
              key={name}
              onSelect={() => {
                const { state } = editor;
                const { selection } = state;
                const { $from } = selection;

                // Find the nearest block node
                let blockDepth = $from.depth;
                let blockNode: any = null;

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
                    break;
                  }
                }

                if (blockNode) {
                  const blockStart = $from.start(blockDepth);
                  const blockEnd = $from.end(blockDepth);

                  if (name === "Default") {
                    editor.chain()
                      .setTextSelection({ from: blockStart, to: blockEnd })
                      .focus()
                      .unsetHighlight()
                      .run();
                  } else {
                    editor.chain()
                      .setTextSelection({ from: blockStart, to: blockEnd })
                      .focus()
                      .setHighlight({ color })
                      .run();
                  }
                } else {
                  editor.commands.unsetHighlight();
                  name !== "Default" && editor.chain().focus().setHighlight({ color }).run();
                }
                onOpenChange(false);
              }}
              className="flex cursor-pointer items-center justify-between px-2 py-1 text-sm hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <div className="rounded-sm border px-2 py-px font-medium" style={{ backgroundColor: color }}>
                  A
                </div>
                <span>{name}</span>
              </div>
              {editor.isActive("highlight", { color }) && <Check className="h-4 w-4" />}
            </EditorBubbleItem>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
