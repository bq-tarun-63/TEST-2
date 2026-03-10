"use client";

import { Sparkles, BarChart2, Layout, Sigma, Hash } from "lucide-react";

interface DetailTagsProps {
    tags: string[];
}

const ICON_MAP: Record<string, any> = {
    "AI": Sparkles,
    "Charts": BarChart2,
    "Layouts": Layout,
    "Formulas": Sigma,
};

export function DetailTags({ tags }: DetailTagsProps) {
    if (!tags || tags.length === 0) return null;

    return (
        <div className="flex flex-col space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Tags
            </h3>
            <div className="flex flex-col space-y-3">
                {tags.map((tag, index) => {
                    const Icon = ICON_MAP[tag] || Hash;
                    return (
                        <div key={index} className="flex items-center gap-3 group">
                            <div className="text-[#2383E2] group-hover:scale-110 transition-transform duration-200">
                                <Icon size={18} />
                            </div>
                            <span className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                                {tag}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
