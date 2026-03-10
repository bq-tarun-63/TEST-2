"use client";

import { Star, Download, Clock, Globe, Award } from "lucide-react";
import Image from "next/image";

interface DetailStatsProps {
    creatorName: string;
    creatorImage?: string;
    templateCount?: number;
    ranking?: string;
    rating?: number;
    reviewCount?: number;
    downloads?: number;
    lastUpdated?: string;
    languages?: string[];
}

export function DetailStats({
    creatorName,
    creatorImage,
    templateCount = 1,
    ranking = "#1 in Productivity",
    rating = 4.8,
    reviewCount = 120,
    downloads = 0,
    lastUpdated = "2 weeks ago",
    languages = ["English"],
}: DetailStatsProps) {
    return (
        <div className="w-full border-t border-zinc-200 dark:border-zinc-800 py-6 mt-12">
            <div className="flex flex-wrap items-center justify-between gap-y-8 gap-x-12">
                {/* Creator Identity */}
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                        {creatorImage ? (
                            <Image src={creatorImage} alt={creatorName} width={40} height={40} className="object-cover" />
                        ) : (
                            <div className="h-full w-full bg-zinc-200 dark:bg-zinc-700" />
                        )}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{creatorName}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{templateCount} templates</p>
                    </div>
                </div>

                {/* Ranking */}
                <div className="flex flex-col">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Award size={16} className="text-zinc-400" /> {ranking}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Ranking</p>
                </div>

                {/* Rating */}
                <div className="flex flex-col">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Star size={16} className="text-amber-400 fill-amber-400" /> {rating}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{reviewCount} ratings</p>
                </div>

                {/* Downloads */}
                <div className="flex flex-col">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Download size={16} className="text-zinc-400" /> {downloads > 1000 ? `${(downloads / 1000).toFixed(1)}k+` : downloads}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Downloads</p>
                </div>

                {/* Update Time */}
                <div className="flex flex-col">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Clock size={16} className="text-zinc-400" /> {lastUpdated}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Version update</p>
                </div>

                {/* Languages */}
                <div className="flex flex-col">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Globe size={16} className="text-zinc-400" /> {languages.join(", ")}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Languages</p>
                </div>
            </div>
        </div>
    );
}
