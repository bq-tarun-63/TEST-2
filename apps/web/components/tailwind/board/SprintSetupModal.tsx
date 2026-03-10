"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Plus, Check, User, Tag, Calendar, Clock } from "lucide-react";
import type { BoardProperty } from "@/types/board";

export interface SprintPropertySelections {
    assigneeId: string | "new";
    statusId: string | "new";
    dueDateId: string | "new";
    createdId: string | "new";
}

interface PropertyWithId extends BoardProperty {
    id: string;
}

interface SprintSetupModalProps {
    boardProperties: PropertyWithId[];
    onClose: () => void;
    onConfirm: (selections: SprintPropertySelections) => void;
    isLoading?: boolean;
}

type PickerKey = keyof SprintPropertySelections;

interface PickerConfig {
    key: PickerKey;
    label: string;
    description: React.ReactNode;
    type: string;
    icon: React.ReactNode;
    matchFilter?: (p: PropertyWithId) => boolean;
}

const PICKER_CONFIGS: PickerConfig[] = [
    {
        key: "assigneeId",
        label: "Assignee",
        description: <>Pick the property that represents <strong>Assignee</strong></>,
        type: "person",
        icon: <User className="w-4 h-4" />,
    },
    {
        key: "statusId",
        label: "Status",
        description: <>Pick the property that represents <strong>Status</strong></>,
        type: "status",
        icon: <Tag className="w-4 h-4" />,
    },
    {
        key: "dueDateId",
        label: "Due Date",
        description: <>Pick the property that represents <strong>Due Date</strong></>,
        type: "date",
        icon: <Calendar className="w-4 h-4" />,
        matchFilter: (p) => p.name?.toLowerCase().includes("due"),
    },
    {
        key: "createdId",
        label: "Created",
        description: <>Pick the property that represents <strong>Created Date</strong></>,
        type: "date",
        icon: <Clock className="w-4 h-4" />,
        matchFilter: (p) => p.name?.toLowerCase().includes("creat"),
    },
];

function getDefaultSelection(
    config: PickerConfig,
    boardProperties: PropertyWithId[],
    alreadySelected: string[]
): string {
    const candidates = boardProperties.filter((p) => p.type === config.type && !alreadySelected.includes(p.id));
    if (config.matchFilter) {
        const match = candidates.find(config.matchFilter);
        if (match) return match.id;
    }
    // For date type pickers without a name match, return "new" to avoid collision
    if (config.type === "date" && !config.matchFilter) {
        return "new";
    }
    return candidates[0]?.id ?? "new";
}

interface PropertyPickerProps {
    config: PickerConfig;
    boardProperties: PropertyWithId[];
    value: string;
    onChange: (id: string) => void;
    otherSelectedIds: string[];
    disabled?: boolean;
}

function PropertyPicker({ config, boardProperties, value, onChange, otherSelectedIds, disabled = false }: PropertyPickerProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const candidates = boardProperties.filter((p) => p.type === config.type && (!otherSelectedIds.includes(p.id) || p.id === value));

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const selectedLabel =
        value === "new"
            ? "Create new"
            : (candidates.find((p) => p.id === value)?.name ?? "Create new");

    return (
        <div className="mb-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
                {config.description}
            </p>
            <div ref={ref} className="relative">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen((o) => !o)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                    <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {value === "new" ? <Plus className="w-4 h-4" /> : config.icon}
                    </span>
                    <span className="flex-1 text-left text-gray-900 dark:text-gray-100 truncate">
                        {selectedLabel}
                    </span>
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current text-gray-400 flex-shrink-0">
                        <path d="m12.76 6.52-4.32 4.32a.62.62 0 0 1-.88 0L3.24 6.52a.63.63 0 0 1 .88-.88L8 9.52l3.88-3.88c.24-.24.64-.24.88 0s.24.64 0 .88" />
                    </svg>
                </button>

                {open && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1">
                        {candidates.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => { onChange(p.id); setOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#2c2c2c] transition-colors text-left"
                            >
                                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                                    {config.icon}
                                </span>
                                <span className="flex-1 text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
                                {value === p.id && (
                                    <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                )}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => { onChange("new"); setOpen(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#2c2c2c] transition-colors text-left"
                        >
                            <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                                <Plus className="w-4 h-4" />
                            </span>
                            <span className="flex-1 text-gray-900 dark:text-gray-100">Create new</span>
                            {value === "new" && (
                                <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SprintSetupModal({
    boardProperties,
    onClose,
    onConfirm,
    isLoading = false,
}: SprintSetupModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    const [selections, setSelections] = useState<SprintPropertySelections>(() => {
        const result: SprintPropertySelections = {
            assigneeId: "new",
            statusId: "new",
            dueDateId: "new",
            createdId: "new",
        };
        const selectedIds: string[] = [];
        for (const config of PICKER_CONFIGS) {
            const selected = getDefaultSelection(config, boardProperties, selectedIds);
            result[config.key] = selected;
            if (selected !== "new") selectedIds.push(selected);
        }
        return result;
    });

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose();
    };

    const handleConfirm = () => {
        onConfirm(selections);
    };

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 dark:bg-black/65 backdrop-blur-sm"
        >
            <div
                className="relative flex overflow-hidden rounded-xl shadow-2xl"
                style={{ width: 768, maxHeight: "90vh" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* LEFT PANE — decorative */}
                <div className="flex-1 bg-white dark:bg-[#1e1e1e] p-8 flex flex-col">
                    {/* Header */}
                    <div className="flex items-start gap-4 mb-6">
                        <span className="text-4xl flex-shrink-0">📋</span>
                        <p className="text-base font-medium text-gray-900 dark:text-gray-100 leading-snug mt-1">
                            Turn this database into a Sprint tracker to manage your work across sprints.
                        </p>
                    </div>

                    {/* Preview card */}
                    <div className="flex-1 rounded-xl bg-gray-50 dark:bg-[#141414] border border-gray-100 dark:border-gray-800 p-4 shadow-sm overflow-hidden">
                        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
                            Preview
                        </p>
                        {[
                            { emoji: "📅", name: "Set up sync", status: "In Progress", color: "blue" },
                            { emoji: "📋", name: "Review design docs", status: "Todo", color: "gray" },
                            { emoji: "🎨", name: "Create color palette", status: "Done", color: "green" },
                            { emoji: "🚧", name: "Fix broken links", status: "In Progress", color: "blue" },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                                <span className="text-sm flex-shrink-0">{item.emoji}</span>
                                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate font-medium">
                                    {item.name}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${item.color === "blue"
                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                    : item.color === "green"
                                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                    }`}>
                                    {item.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT PANE — pickers */}
                <div
                    className="w-[45%] flex-shrink-0 bg-gray-50 dark:bg-[#161616] border-l border-gray-200 dark:border-gray-800 p-8 overflow-y-auto"
                    style={{ minHeight: 450 }}
                >
                    {/* Close button */}
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className={`absolute top-4 right-4 p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <X className="w-4 h-4" />
                    </button>

                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                        Task databases require status, assignee, and due date properties.
                    </p>

                    {PICKER_CONFIGS.map((config) => {
                        const otherSelectedIds = Object.entries(selections)
                            .filter(([k, v]) => k !== config.key && v !== "new")
                            .map(([, v]) => v);

                        return (
                            <PropertyPicker
                                key={config.key}
                                config={config}
                                boardProperties={boardProperties}
                                value={selections[config.key]}
                                otherSelectedIds={otherSelectedIds}
                                disabled={isLoading}
                                onChange={(id) =>
                                    setSelections((prev) => ({ ...prev, [config.key]: id }))
                                }
                            />
                        );
                    })}

                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className={`w-full py-2 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors mt-2 flex items-center justify-center gap-2 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Processing...
                            </>
                        ) : (
                            "Turn into sprint tracker"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
