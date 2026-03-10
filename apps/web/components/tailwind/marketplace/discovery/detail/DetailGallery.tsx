"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface DetailGalleryProps {
    images: string[];
    title: string;
}

export function DetailGallery({ images, title }: DetailGalleryProps) {
    const [activeIndex, setActiveIndex] = useState(0);

    if (!images.length) return null;

    return (
        <div className="flex flex-col space-y-4 w-full">
            {/* Main Image Container */}
            <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
                <img
                    src={images[activeIndex]}
                    alt={title}
                    className="h-full w-full object-cover transition-opacity duration-300"
                />
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {images.map((image, index) => (
                        <button
                            key={index}
                            onClick={() => setActiveIndex(index)}
                            className={cn(
                                "relative flex-shrink-0 aspect-[16/10] w-[140px] rounded-lg overflow-hidden border transition-all duration-200",
                                activeIndex === index
                                    ? "border-blue-500 ring-2 ring-blue-500/10"
                                    : "border-zinc-200 dark:border-zinc-800 opacity-60 hover:opacity-100"
                            )}
                        >
                            <img src={image} alt={`${title} preview ${index + 1}`} className="h-full w-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
