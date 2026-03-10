"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useGlobalBlocks } from "@/contexts/blockContext";
import type { Block } from "@/types/block";

interface BreadcrumbItem {
  id: string;
  title: string;
  icon?: string;
  isCurrent?: boolean;
}

interface BreadcrumbProps {
  /** ID of the page currently open in the editor */
  pageId: string;
  /** ID of the collection_view block when a board/database view is open (?v=...) */
  viewId?: string | null;
}

const SlashSeparator = () => (
  <span className="flex items-center justify-center w-5 h-5 flex-shrink-0">
    <svg
      aria-hidden="true"
      role="graphics-symbol"
      viewBox="0 0 20 20"
      className="w-5 h-5 block flex-shrink-0 text-gray-400 dark:text-gray-600"
      fill="currentColor"
    >
      <path d="M11.762 2.891a.625.625 0 0 1 .475.632l-.018.125-3.224 13.005a.625.625 0 1 1-1.213-.301l3.224-13.005.042-.119a.625.625 0 0 1 .714-.337" />
    </svg>
  </span>
);

function buildItems(
  startId: string,
  getBlock: (id: string) => Block | undefined,
  isCurrent: boolean
): BreadcrumbItem[] {
  const block = getBlock(startId);
  if (!block) return [];

  const ancestors: BreadcrumbItem[] = [];
  let parentId = block.parentId;
  let parentType = block.parentType;

  while (parentId && parentType !== "workspace" && parentType !== "workarea") {
    const parentBlock = getBlock(parentId);
    if (!parentBlock) break;

    if (parentBlock.blockType === "content") {
      // skip over intermediate content containers
      parentId = parentBlock.parentId;
      parentType = parentBlock.parentType;
      continue;
    }

    if (parentBlock.blockType !== "page" && parentBlock.blockType !== "collection_view") break;

    ancestors.unshift({
      id: parentId,
      title: (parentBlock.value as any)?.title || "",
      icon: (parentBlock.value as any)?.icon || "",
    });

    parentId = parentBlock.parentId;
    parentType = parentBlock.parentType;
  }

  // Add the block itself as current
  ancestors.push({
    id: startId,
    title: (block.value as any)?.title || "",
    icon: (block.value as any)?.icon || "",
    isCurrent,
  });

  return ancestors;
}

export default function Breadcrumb({ pageId, viewId }: BreadcrumbProps) {
  const { getBlock } = useGlobalBlocks();
  const router = useRouter();

  let items: BreadcrumbItem[];

  if (viewId) {
    // collection_view open: build full path from the collection_view block upward.
    // This naturally includes the parent page(s) in ancestors.
    items = buildItems(viewId, getBlock, true);

    // Fallback: collection_view block not in map yet (still loading), show page path
    if (items.length === 0) {
      items = buildItems(pageId, getBlock, true);
    }
  } else {
    items = buildItems(pageId, getBlock, true);
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center min-w-0"
      style={{ lineHeight: 1.2, fontSize: 14, height: "100%", flexGrow: 0 }}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 && <SlashSeparator />}
          <button
            type="button"
            onClick={() => !item.isCurrent && router.push(`/notes/${item.id}`)}
            className={`flex items-center justify-start h-6 rounded-md whitespace-nowrap font-normal transition-colors duration-[20ms] ease-in min-w-0 flex-shrink select-none
              ${item.isCurrent
                ? "text-gray-900 dark:text-gray-100 cursor-default"
                : "text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              }`}
            style={{ paddingInline: 6, maxWidth: item.isCurrent ? 240 : 160, paddingTop: 2, paddingBottom: 2 }}
          >
            {item.icon && (
              <span
                className="flex items-center justify-center flex-shrink-0"
                style={{ height: 20, width: 20, marginInlineEnd: 6, fontSize: 14, lineHeight: 1 }}
              >
                {item.icon}
              </span>
            )}
            <span className="truncate overflow-hidden">{item.title || "New page"}</span>
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}
