"use client";

import type { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { FileText } from "lucide-react";
import { useMemo } from "react";

interface GalleryCardPreviewProps {
  note: Block;
  previewType?: "page_cover" | "page_content" | string; // string for file property name
  fitImage?: boolean;
  heightClass?: string;
}

export default function GalleryCardPreview({
  note,
  previewType = "page_content",
  fitImage = false,
  heightClass = "h-[173.812px]",
}: GalleryCardPreviewProps) {
  const { getBlock } = useGlobalBlocks();

  // Fetch child blocks - no memoization to ensure live updates
  // When a block's content changes, this component will re-render and get fresh data
  const childBlocks = !note.blockIds || note.blockIds.length === 0
    ? []
    : note.blockIds
      .map((id) => getBlock(id))
      .filter((block): block is Block => !!block);

  // If previewType is a property name (file property), show that file
  if (previewType !== "page_cover" && previewType !== "page_content") {
    const fileValue = note.value.databaseProperties?.[previewType];
    if (fileValue) {
      const fileUrl = Array.isArray(fileValue) ? fileValue[0] : fileValue;
      if (typeof fileUrl === "string" && (fileUrl.startsWith("http") || fileUrl.startsWith("/"))) {
        return (
          <div className={`w-full ${heightClass} pointer-events-none overflow-hidden m-0 p-0`}>
            <img
              src={fileUrl}
              alt={note.value.title}
              className={`block w-full h-full m-0 p-0 ${fitImage ? "object-contain" : "object-cover"}`}
              style={{ borderRadius: "0px", borderStartStartRadius: "1px", borderStartEndRadius: "1px", objectPosition: "center 50%" }}
            />
          </div>
        );
      }
    }
    return null;
  }

  // Page cover - check if cover is stored in databaseProperties or value
  if (previewType === "page_cover") {
    const coverImage = note.value.coverURL || note.value.coverUrl || note.value.databaseProperties?.coverImage;
    if (coverImage) {
      return (
        <div className={`w-full ${heightClass} pointer-events-none overflow-hidden m-0 p-0`}>
          <img
            src={coverImage}
            alt={note.value.title}
            className={`block w-full h-full m-0 p-0 ${fitImage ? "object-contain" : "object-cover"}`}
            style={{ borderRadius: "0px", borderStartStartRadius: "1px", borderStartEndRadius: "1px", objectPosition: "center 50%" }}
          />
        </div>
      );
    }
  }

  // Page content preview - show first image from child blocks or rendered content
  if (previewType === "page_content") {
    // 1. First check for an image block in child blocks
    const firstImageBlock = childBlocks.find(block => {
      const value = block.value;
      return (
        value?.type === "image" ||
        (value as any)?.src ||
        (value as any)?.attrs?.src
      );
    });

    const firstImageUrl = firstImageBlock?.value?.src ||
      (firstImageBlock?.value as any)?.attrs?.src;

    if (firstImageUrl) {
      return (
        <div className={`${heightClass} relative pointer-events-none overflow-hidden m-0 p-0`}>
          <div className="w-full h-full m-0 p-0 border-b">
            <img
              alt=""
              src={firstImageUrl}
              referrerPolicy="same-origin"
              className="block object-cover w-full h-full m-0 p-0"
              style={{ borderRadius: "0px", borderStartStartRadius: "1px", borderStartEndRadius: "1px", objectPosition: "center 50%" }}
            />
          </div>
        </div>
      );
    }

    // 2. Render blocks with proper formatting
    const hasContent = childBlocks.length > 0;

    if (!hasContent) {
      return null;
    }

    return (
      <div className={`${heightClass} border-b pointer-events-none overflow-hidden static bg-[var(--ca-colGalPreCarCov)] pt-2 px-2 pb-0 shadow-[inset_0_-1px_0_0_var(--ca-borSecTra)]`}>
        <div className="space-y-1">
          {childBlocks.slice(0, 10).map((block, index) => (
            <BlockPreview key={block._id || index} block={block} getBlock={getBlock} />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// Component to render individual blocks with proper formatting
function BlockPreview({ block, getBlock }: { block: Block; getBlock: (id: string) => Block | undefined }) {
  const value = block.value;
  if (!value) return null;

  // Extract text content recursively
  const extractText = (content: any): string => {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (content.type === "text" && content.text) return content.text;
    if (content.content && Array.isArray(content.content)) {
      return content.content.map((child: any) => extractText(child)).join("");
    }
    return "";
  };

  // Get text from various possible structures
  let text = "";
  if (typeof value.text === "string") {
    text = value.text;
  } else if (value.content) {
    if (Array.isArray(value.content)) {
      text = value.content.map((item: any) => extractText(item)).join("");
    } else {
      text = extractText(value.content);
    }
  } else if ((value as any).attrs?.text) {
    text = (value as any).attrs.text;
  } else {
    text = extractText(value);
  }

  text = text.trim();
  if (!text) return null;

  // Render based on block type
  const type = value.type;
  const attrs = (value as any).attrs || {};

  // Heading blocks
  if (type === "heading") {
    const level = attrs.level || 1;
    const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
    const headingSizes: Record<number, string> = {
      1: "text-2xl font-bold",
      2: "text-xl font-bold",
      3: "text-lg font-semibold",
      4: "text-base font-semibold",
      5: "text-sm font-semibold",
      6: "text-xs font-semibold",
    };

    return (
      <HeadingTag className={`text-[var(--c-texPri)] ${headingSizes[level] || headingSizes[1]} opacity-80 py-[3px] px-[2px]`}>
        {text}
      </HeadingTag>
    );
  }

  // Bullet list
  if (type === "bulletList" || type === "bullet_list") {
    return (
      <ul className="list-disc list-inside text-[var(--c-texPri)] text-xs opacity-80 py-[3px] px-[2px]">
        <ListItems block={block} getBlock={getBlock} />
      </ul>
    );
  }

  // Ordered list
  if (type === "orderedList" || type === "ordered_list") {
    return (
      <ol className="list-decimal list-inside text-[var(--c-texPri)] text-xs opacity-80 py-[3px] px-[2px]">
        <ListItems block={block} getBlock={getBlock} />
      </ol>
    );
  }

  // List item
  if (type === "listItem" || type === "list_item") {
    return <li className="text-[var(--c-texPri)] text-xs opacity-80">{text}</li>;
  }

  // Task list / checkbox
  if (type === "taskList" || type === "task_list" || attrs.checked !== undefined) {
    const checked = attrs.checked || false;
    return (
      <div className="flex items-start gap-2 text-[var(--c-texPri)] text-xs opacity-80 py-[3px] px-[2px]">
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mt-1 pointer-events-none"
        />
        <span className={checked ? "line-through opacity-60" : ""}>{text}</span>
      </div>
    );
  }

  // Code block
  if (type === "codeBlock" || type === "code_block") {
    return (
      <pre className="bg-[var(--ca-colSecBg)] text-[var(--c-texPri)] text-xs opacity-80 p-2 rounded overflow-x-auto">
        <code>{text}</code>
      </pre>
    );
  }

  // Blockquote
  if (type === "blockquote") {
    return (
      <blockquote className="border-l-4 border-[var(--ca-borSecTra)] pl-3 text-[var(--c-texPri)] text-xs opacity-70 italic py-[3px]">
        {text}
      </blockquote>
    );
  }

  // Default paragraph
  return (
    <div className="text-[var(--c-texPri)] text-xs opacity-80 py-[3px] px-[2px]">
      <div className="flex">
        <div className="max-w-full w-full whitespace-break-spaces break-words">
          {text}
        </div>
      </div>
    </div>
  );
}

// Helper component to render list items (handles nested lists)
function ListItems({ block, getBlock }: { block: Block; getBlock: (id: string) => Block | undefined }) {
  // Fetch child blocks fresh to catch live updates
  const childBlocks = !block.blockIds || block.blockIds.length === 0
    ? []
    : block.blockIds
      .map((id) => getBlock(id))
      .filter((b): b is Block => !!b);

  if (childBlocks.length === 0) {
    // If no children, try to extract text from the block itself
    const value = block.value;
    const extractText = (content: any): string => {
      if (!content) return "";
      if (typeof content === "string") return content;
      if (content.type === "text" && content.text) return content.text;
      if (content.content && Array.isArray(content.content)) {
        return content.content.map((child: any) => extractText(child)).join("");
      }
      return "";
    };

    let text = "";
    if (typeof value?.text === "string") {
      text = value.text;
    } else if (value?.content) {
      text = Array.isArray(value.content)
        ? value.content.map((item: any) => extractText(item)).join("")
        : extractText(value.content);
    }

    if (text.trim()) {
      return <li className="text-[var(--c-texPri)] text-xs opacity-80">{text.trim()}</li>;
    }
    return null;
  }

  return (
    <>
      {childBlocks.map((childBlock, index) => {
        const childValue = childBlock.value;
        const childType = childValue?.type;

        // Nested list
        if (childType === "bulletList" || childType === "orderedList") {
          const ListTag = childType === "bulletList" ? "ul" : "ol";
          const listClass = childType === "bulletList" ? "list-disc" : "list-decimal";
          return (
            <ListTag key={childBlock._id || index} className={`${listClass} list-inside ml-4`}>
              <ListItems block={childBlock} getBlock={getBlock} />
            </ListTag>
          );
        }

        // List item
        return <BlockPreview key={childBlock._id || index} block={childBlock} getBlock={getBlock} />;
      })}
    </>
  );
}
