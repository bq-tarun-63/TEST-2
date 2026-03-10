import { postWithAuth } from "@/lib/api-helpers";
import { ObjectId } from "bson";
import { Block } from "@/types/block";

export interface CreateTemplateResponse {
    isError?: boolean;
    message?: string;
    [key: string]: any;
}

export async function createTemplateBlocks({
    workspaceId,
    userEmail,
    title = "New page template",
    icon = "",
}: {
    workspaceId: string;
    userEmail: string;
    title?: string;
    icon?: string;
}) {
    const newTemplateId = new ObjectId().toString();

    const templateBlock: Block = {
        _id: newTemplateId,
        blockType: "page",
        workspaceId: workspaceId,
        workareaId: null,
        parentId: workspaceId,
        parentType: "workspace",
        value: {
            title,
            userId: userEmail,
            userEmail: userEmail,
            icon,
            coverURL: null,
            pageType: "template",
            isTemplate: true,
        },
        blockIds: [],
        status: "alive",
    };

    const response = await postWithAuth("/api/note/block/batch-create", {
        parentId: workspaceId,
        workspaceId: workspaceId,
        workareaId: null,
        parentTable: "workspace",
        isTemplate: true,
        blocks: [
            {
                _id: newTemplateId,
                blockType: "page",
                value: templateBlock.value,
                insertAfterBlockID: null,
            },
        ],
    });

    if (response && typeof response === "object" && "isError" in response && response.isError) {
        throw new Error(response.message || "Failed to create template");
    }

    return {
        templateId: newTemplateId,
        templateBlock,
    };
}

export async function instantiateTemplateBlocks({
    templateBlockId,
    targetParentId,
    workspaceId,
    targetType,
}: {
    templateBlockId: string;
    targetParentId: string;
    workspaceId: string;
    targetType: TemplateTarget;
}) {
    const response = await postWithAuth("/api/template/instantiate", {
        templateBlockId,
        targetParentId,
        workspaceId,
        targetType,
    });

    if (response && typeof response === "object" && "isError" in response && response.isError) {
        throw new Error(response.message || "Failed to instantiate template");
    }

    return response;
}

export type TemplateTarget = "private" | "public" | "restricted";
