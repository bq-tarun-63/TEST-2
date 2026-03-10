"use client";

import { GenericButton } from "@/components/tailwind/common/GenericButton";
import { Share2, ThumbsUp } from "lucide-react";
import Image from "next/image";

interface DetailHeaderProps {
    title: string;
    description: string;
    creatorName: string;
    creatorImage?: string;
    onAddClick: () => void;
    onPreviewClick: () => void;
    isAdding?: boolean;
}

export function DetailHeader({
    title,
    description,
    creatorName,
    creatorImage,
    onAddClick,
    onPreviewClick,
    isAdding = false,
}: DetailHeaderProps) {
    return (
        <div className="flex flex-col space-y-6 max-w-md">
            {/* Creator Info */}
            <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                    {creatorImage ? (
                        <Image src={creatorImage} alt={creatorName} width={24} height={24} className="object-cover" />
                    ) : (
                        <div className="h-full w-full bg-zinc-200 dark:bg-zinc-700" />
                    )}
                </div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{creatorName}</span>
                <div className="p-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-500">
                    <ThumbsUp size={12} fill="currentColor" />
                </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-4">
                <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {title}
                </h1>
                <p className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed font-normal">
                    {description}
                </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
                <GenericButton
                    label="Add"
                    variant="blue"
                    size="md"
                    isLoading={isAdding}
                    leadingIcon={<span className="text-xl font-light">+</span>}
                    className="h-[44px] px-10 rounded-lg text-[15px] font-semibold"
                    onClick={onAddClick}
                />
                <GenericButton
                    label="Preview"
                    variant="preview"
                    size="md"
                    className="h-[44px] px-10 rounded-lg text-[15px] font-semibold"
                    onClick={onPreviewClick}
                />
                <GenericButton
                    variant="outline"
                    leadingIcon={<Share2 size={20} className="text-zinc-500" />}
                    className="h-[44px] w-[44px] rounded-lg"
                    onClick={() => { }} // TODO: Implement share
                />
            </div>
        </div>
    );
}
