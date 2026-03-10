import React from "react";
import type { LayoutSettings, ViewCollection } from "@/types/board";
import { toast } from "sonner";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { DatabaseSettingsAPI } from "@/services-frontend/boardServices/databaseSettingsService";
import { Block } from "@/types/block";
import { useBoard } from "@/contexts/boardContext";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/tailwind/ui/popover";
import { DropdownMenu, DropdownMenuItem } from "@/components/tailwind/ui/dropdown-menu";
import { Check, ChevronRight } from "lucide-react";

const ToggleItem = ({ label, checked, onChange }: { label: React.ReactNode, checked: boolean, onChange: (val: boolean) => void }) => (
    <div onClick={() => onChange(!checked)} role="menuitemcheckbox" tabIndex={0} className="w-full flex rounded-md cursor-pointer transition-colors duration-200 select-none">
        <div className="flex items-center gap-2 w-full min-h-[28px] text-[14px] px-2 py-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md text-gray-900 dark:text-gray-200">
            <div className="flex-1 truncate">{label}</div>
            <div className="flex-shrink-0 relative">
                <div className={`flex w-[26px] h-[14px] rounded-full p-[2px] transition-colors duration-200 ${checked ? "bg-blue-500" : "bg-gray-300 dark:bg-zinc-700"}`}>
                    <div className={`w-[10px] h-[10px] rounded-full bg-white transition-transform duration-200 transform ${checked ? "translate-x-[12px]" : "translate-x-0"}`} />
                </div>
            </div>
        </div>
    </div>
);

const SelectItem = ({ label, value, options, onChange }: { label: React.ReactNode, value: string | number, options: { label: string, value: string | number }[], onChange: (val: string) => void }) => {
    const [open, setOpen] = React.useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className="relative w-full flex items-center gap-2 min-h-[32px] px-2 py-1.5 rounded-md text-[14px] text-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors duration-200 select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={`Select ${label}`}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <div className="flex-1 truncate text-left">{label}</div>
                    <div className="flex-shrink-0 flex items-center text-gray-500 dark:text-gray-400">
                        <div className="truncate flex max-w-[100px]">
                            {options.find(o => String(o.value) === String(value))?.label || value}
                        </div>
                        <ChevronRight className={`w-4 h-4 ml-1.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
                    </div>
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="p-1 w-56 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-lg rounded-lg z-[9999]"
                align="end"
                side="right"
                sideOffset={12}
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                <div className="flex flex-col gap-[1px]">
                    {options.map(opt => (
                        <DropdownMenuItem
                            key={opt.value}
                            label={opt.label}
                            selected={String(opt.value) === String(value)}
                            onClick={(e) => {
                                e?.preventDefault();
                                e?.stopPropagation();
                                onChange(String(opt.value));
                                setOpen(false);
                            }}
                            rightElement={String(opt.value) === String(value) ? <Check className="w-4 h-4" /> : null}
                        />
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
};

const CardLayoutToggle = ({ value, onChange }: { value: "compact" | "list", onChange: (val: "compact" | "list") => void }) => (
    <div className="mx-2 mb-2 rounded-[10px] p-3 bg-gray-50 dark:bg-zinc-800/50 flex flex-col items-center overflow-hidden border border-gray-100 dark:border-zinc-800">
        <div className="text-[12px] font-medium text-gray-500 dark:text-gray-400 mb-3">Card layout</div>
        <div className="flex w-full gap-3 px-1.5 justify-center">

            {/* Compact */}
            <div className="flex flex-col gap-1.5 items-center flex-1 max-w-[120px]">
                <button onClick={() => onChange("compact")} type="button" role="radio" aria-checked={value === "compact"}
                    className={`p-2.5 rounded-[10px] relative w-full border-none aspect-[4/3] overflow-hidden ${value === "compact" ? "outline outline-2 outline-blue-500 outline-offset-[-2px] bg-white dark:bg-zinc-900" : "outline outline-1 outline-gray-200 dark:outline-zinc-700 outline-offset-[-1px] bg-white dark:bg-zinc-900"}`}>
                    <div className={`absolute left-0 top-0 w-full h-[32%] rounded-t-[10px] ${value === "compact" ? "bg-blue-50 dark:bg-blue-500/10" : "bg-gray-100 dark:bg-zinc-800"}`} />
                    <div className={`absolute left-[10%] top-[23%] h-[18%] aspect-square rounded-full ${value === "compact" ? "bg-blue-100 dark:bg-blue-500/20" : "bg-gray-200 dark:bg-zinc-700"}`} />
                    <div className="flex gap-[5px] absolute left-[10%] top-[50%] h-[7%] w-[75%]">
                        <div className={`rounded-full h-full w-full ${value === "compact" ? "bg-blue-50 dark:bg-blue-500/15" : "bg-gray-200 dark:bg-zinc-700"}`} />
                        <div className={`rounded-full h-full w-full ${value === "compact" ? "bg-blue-50 dark:bg-blue-500/15" : "bg-gray-200 dark:bg-zinc-700"}`} />
                        <div className={`rounded-full h-full w-full ${value === "compact" ? "bg-blue-50 dark:bg-blue-500/15" : "bg-gray-200 dark:bg-zinc-700"}`} />
                    </div>
                    <div className="flex gap-[5px] absolute left-[10%] top-[66%] h-[7%] w-[60%]">
                        <div className={`rounded-full h-full w-full ${value === "compact" ? "bg-blue-50 dark:bg-blue-500/15" : "bg-gray-200 dark:bg-zinc-700"}`} />
                        <div className={`rounded-full h-full w-full ${value === "compact" ? "bg-blue-50 dark:bg-blue-500/15" : "bg-gray-200 dark:bg-zinc-700"}`} />
                    </div>
                </button>
                <div className={`text-[14px] font-normal ${value === "compact" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>Compact</div>
            </div>

            {/* List */}
            <div className="flex flex-col gap-1.5 items-center flex-1 max-w-[120px]">
                <button onClick={() => onChange("list")} type="button" role="radio" aria-checked={value === "list"}
                    className={`p-2.5 rounded-[10px] relative w-full border-none aspect-[4/3] overflow-hidden ${value === "list" ? "outline outline-2 outline-blue-500 outline-offset-[-2px] bg-white dark:bg-zinc-900" : "outline outline-1 outline-gray-200 dark:outline-zinc-700 outline-offset-[-1px] bg-white dark:bg-zinc-900"}`}>
                    <div className={`absolute left-0 top-0 w-full h-[32%] rounded-t-[10px] ${value === "list" ? "bg-blue-50 dark:bg-blue-500/10" : "bg-gray-100 dark:bg-zinc-800"}`} />
                    <div className={`absolute left-[10%] top-[23%] h-[18%] aspect-square rounded-full ${value === "list" ? "bg-blue-100 dark:bg-blue-500/20" : "bg-gray-200 dark:bg-zinc-700"}`} />

                    <div className="flex flex-col gap-[20%] absolute left-[10%] top-[50%] h-[36%] w-[100%]">
                        <div className={`rounded-full h-full w-[55%] ${value === "list" ? "bg-blue-50 dark:bg-blue-500/15" : "bg-gray-200 dark:bg-zinc-700"}`} />
                        <div className={`rounded-full h-full w-[25%] ${value === "list" ? "bg-blue-50 dark:bg-blue-500/15" : "bg-gray-200 dark:bg-zinc-700"}`} />
                        <div className={`rounded-full h-full w-[40%] ${value === "list" ? "bg-blue-50 dark:bg-blue-500/15" : "bg-gray-200 dark:bg-zinc-700"}`} />
                    </div>
                </button>
                <div className={`text-[14px] font-normal ${value === "list" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>List</div>
            </div>

        </div>
    </div>
);

interface ViewLayoutSettingsProps {
    board: Block;
}

export function ViewLayoutSettings({ board }: ViewLayoutSettingsProps) {
    const { currentView, setLayoutSettings, getLayoutSettings } = useBoard();
    const { getBlock, updateBlock } = useGlobalBlocks();

    const collectionViewBlock = getBlock(board._id);
    const collectionViewData = collectionViewBlock?.blockType === "collection_view" ? (collectionViewBlock.value as ViewCollection) : null;
    const currentViewData = currentView[board._id];

    let currentViewObj;
    if (currentViewData?.id) {
        currentViewObj = collectionViewData?.viewsTypes?.find((v) => v._id === currentViewData.id);
    } else if (currentViewData?.type) {
        currentViewObj = collectionViewData?.viewsTypes?.find((v) => v.viewType === currentViewData.type);
    } else {
        currentViewObj = collectionViewData?.viewsTypes?.[0];
    }

    const layoutState: LayoutSettings = getLayoutSettings(board._id) || currentViewObj?.settings?.layout || {};

    const handleLayoutSettingUpdate = async (key: keyof LayoutSettings, value: any) => {
        if (!currentViewObj || !currentViewObj._id || !collectionViewData) {
            toast.error("Current view not found");
            return;
        }

        const currentSettings = currentViewObj.settings || {};
        const currentLayout = currentSettings.layout || {};

        // Don't update if same
        if (currentLayout[key] === value) return;

        try {
            await DatabaseSettingsAPI.updateLayoutSettings(
                currentViewObj._id,
                { [key]: value },
                board._id,
                setLayoutSettings,
                getLayoutSettings,
                getBlock,
                updateBlock
            );
        } catch (err) {
            console.error("Failed to update layout settings", err);
            toast.error("Failed to update layout settings");
        }
    };

    return (
        <div className="flex flex-col gap-[1px] px-2 pb-2">
            {/* <ToggleItem label="Show data source title" checked={layoutState.showDataSourceTitle !== false} onChange={(v) => handleLayoutSettingUpdate('showDataSourceTitle', v)} /> */}
            {/* <ToggleItem label="Show page icon" checked={layoutState.showPageIcon !== false} onChange={(v) => handleLayoutSettingUpdate('showPageIcon', v)} />
            <ToggleItem label="Wrap all content" checked={!!layoutState.wrapAllContent} onChange={(v) => handleLayoutSettingUpdate('wrapAllContent', v)} /> */}

            {/* <div className="h-[1px] bg-gray-200 dark:bg-zinc-800 my-1 mx-2" /> */}

            <SelectItem
                label="Open pages in"
                value={layoutState.openPagesIn || "side_peek"}
                options={[{ label: "Side peek", value: "side_peek" }, { label: "Center peek", value: "center_peek" }]}
                onChange={(v) => handleLayoutSettingUpdate('openPagesIn', v)}
            />
            {/* <SelectItem
                label="Load limit"
                value={layoutState.loadLimit || 50}
                options={[{ label: "10", value: "10" }, { label: "25", value: "25" }, { label: "50", value: "50" }, { label: "100", value: "100" }]}
                onChange={(v) => handleLayoutSettingUpdate('loadLimit', Number(v))}
            />

            <div className="h-[1px] bg-gray-200 dark:bg-zinc-800 my-1 mx-2" /> */}

            <SelectItem
                label="Card preview"
                value={layoutState.cardPreview || "none"}
                options={[{ label: "Page content", value: "page_content" }, { label: "Page cover", value: "cover" }, { label: "None", value: "none" }]}
                onChange={(v) => handleLayoutSettingUpdate('cardPreview', v)}
            />
            {/* <SelectItem
                label="Card size"
                value={layoutState.cardSize || "medium"}
                options={[{ label: "Small", value: "small" }, { label: "Medium", value: "medium" }, { label: "Large", value: "large" }]}
                onChange={(v) => handleLayoutSettingUpdate('cardSize', v)}
            /> */}

            {/* <div className="mt-2" />
            <CardLayoutToggle value={layoutState.cardLayout || "list"} onChange={(v) => handleLayoutSettingUpdate('cardLayout', v)} /> */}
        </div>
    );
}
