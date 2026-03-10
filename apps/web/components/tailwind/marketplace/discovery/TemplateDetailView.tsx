"use client";

import { useEffect, useState } from "react";
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { instantiateTemplateBlocks } from "@/services-frontend/template/templateServices";
import { GenericButton } from "@/components/tailwind/common/GenericButton";
import { DetailHeader } from "./detail/DetailHeader";
import { DetailGallery } from "./detail/DetailGallery";
import { DetailTags } from "./detail/DetailTags";
import { DetailStats } from "./detail/DetailStats";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Block } from "@/types/block";
import { useGlobalBlocks } from "@/contexts/blockContext";
import { useRootPagesOrder } from "@/contexts/rootPagesOrderContext";
import { useRouter } from "next/navigation";
import { useMarketplaceDiscovery } from "@/contexts/marketplaceDiscoveryContext";

interface TemplateDetailViewProps {
    templateId: string;
}

export function TemplateDetailView({ templateId }: TemplateDetailViewProps) {
    const { templates, isLoading, fetchTemplates } = useMarketplaceDiscovery();
    const { currentWorkspace } = useWorkspaceContext();
    const { addBlock } = useGlobalBlocks();
    const { addPrivatePage } = useRootPagesOrder();
    const [isAdding, setIsAdding] = useState(false);
    const router = useRouter();

    // If templates haven't been loaded yet (e.g. direct URL navigation), fetch them
    useEffect(() => {
        if (templates.length === 0 && !isLoading) {
            fetchTemplates();
        }
    }, []);

    const template = templates.find(
        (t) => t.templateId === templateId || String(t._id) === templateId
    );

    const handlePreview = () => {
        router.push(`/marketplace/preview/${template?.templateId}`);
    };

    const handleBack = () => {
        router.push("/marketplace");
    };

    const handleAdd = async () => {
        if (!currentWorkspace?._id || !template) {
            toast.error("No active workspace found");
            return;
        }

        setIsAdding(true);
        try {
            const response = await instantiateTemplateBlocks({
                templateBlockId: template.templateId,
                targetParentId: currentWorkspace._id,
                workspaceId: currentWorkspace._id,
                targetType: "private",
            });

            if (response && response.newBlock) {
                const newBlock = response.newBlock as Block;
                const newNoteId = response.newBlockId;

                // Optimistic UI update - add the new block
                addBlock(newBlock);

                // Update page order context based on target
                addPrivatePage(newNoteId);

                toast.success(`Template added to private pages`);
            } else {
                toast.error("Failed to create page from template");
            }
        } catch (error) {
            console.error("Failed to add template:", error);
            toast.error(error instanceof Error ? error.message : "Failed to add template");
        } finally {
            setIsAdding(false);
        }
    };

    if (isLoading) {
        return (
            <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12 py-10 flex items-center justify-center min-h-[400px]">
                <div className="text-gray-500 dark:text-gray-400">Loading template...</div>
            </div>
        );
    }

    if (!template) {
        return (
            <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
                <GenericButton
                    label="Back to Discovery"
                    variant="ghost"
                    leadingIcon={<ChevronLeft size={18} />}
                    className="-ml-2 group text-[15px] font-medium"
                    onClick={handleBack}
                />
                <div className="mt-12 text-gray-500 dark:text-gray-400">Template not found.</div>
            </div>
        );
    }

    const images = template.previewImages || (template.coverImage ? [template.coverImage] : []);

    return (
        <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12 py-10 pt-4">
            {/* Navigation */}
            <div className="mb-12">
                <GenericButton
                    label="Back to Discovery"
                    variant="ghost"
                    leadingIcon={<ChevronLeft size={18} />}
                    className="-ml-2 group text-[15px] font-medium"
                    onClick={handleBack}
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 xl:gap-24 mb-20">
                {/* Left Info Column */}
                <div className="lg:col-span-5 flex flex-col justify-between">
                    <DetailHeader
                        title={template.title}
                        description={template.description}
                        creatorName={template.creatorName}
                        creatorImage={template.creatorProfilePicture}
                        isAdding={isAdding}
                        onAddClick={handleAdd}
                        onPreviewClick={handlePreview}
                    />
                    <div className="mt-12 lg:mt-auto">
                        <DetailTags tags={template.tags} />
                    </div>
                </div>

                {/* Right Media Column */}
                <div className="lg:col-span-7">
                    <DetailGallery images={images} title={template.title} />
                </div>
            </div>

            {/* Bottom Stats Footer */}
            <DetailStats
                creatorName={template.creatorName}
                creatorImage={template.creatorProfilePicture}
                downloads={template.downloadCount}
                rating={template.rating}
                lastUpdated={template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : undefined}
            />
        </div>
    );
}
