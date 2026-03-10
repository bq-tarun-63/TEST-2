import { ObjectId } from "mongodb";
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import type { IWorkspace } from "@/models/types/Workspace";
import type { IWorkArea } from "@/models/types/WorkArea";
import { IUser } from "@/models/types/User";

export const SidebarService = {
    /**
     * Get initial data for the left sidebar ordered by workspace configuration
     */
    async getLeftSidebarInitials({
        userId,
        workspaceId,
    }: {
        userId: string;
        workspaceId: string;
    }) {
        // 1. Get clients
        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const workspacesColl = metadataDb.collection<IWorkspace>("workspaces");
        const workAreasColl = metadataDb.collection<IWorkArea>("workAreas");
        // 2. Fetch Workspace
        const usersColl = metadataDb.collection<IUser>("users");

        const [workspace, user] = await Promise.all([
            workspacesColl.findOne({ _id: new ObjectId(workspaceId) }),
            usersColl.findOne({ _id: new ObjectId(userId) })
        ]);

        if (!workspace) throw new Error("Workspace not found");

        // 3. Get Ordering Arrays
        const userSettings = user?.workspaceSettings?.find(s => s.workspaceId === workspaceId);
        const privatePageIds = userSettings?.privatePageIds || [];
        const sharedPageIds = userSettings?.sharedPageIds || [];
        const templatePageIds = userSettings?.templatePageIds || [];
        const publicPageIds = workspace.publicPageIds || [];
        const workAreaIds = userSettings?.workAreaIds || [];
        const sidebarOrder = userSettings?.sidebarOrder || ["public", "private", "workarea", "shared", "templates"];
        // 4. Fetch WorkAreas (if needed)
        console.log("templatePageIds------------", templatePageIds);
        let workAreas: IWorkArea[] = [];
        if (workAreaIds.length > 0) {
            workAreas = await workAreasColl
                .find({
                    _id: { $in: workAreaIds.map((id) => new ObjectId(id)) },
                })
                .toArray();
        }
        // 5. Construct Response based on sidebarOrder
        const response: any = {
            sidebar_order: sidebarOrder,
        };
        if (sidebarOrder.includes("public")) {
            response.public_pages = publicPageIds;
        }
        if (sidebarOrder.includes("private")) {
            response.private_pages = privatePageIds;
        }
        if (sidebarOrder.includes("shared")) {
            response.shared_pages = sharedPageIds;
        }
        if (sidebarOrder.includes("templates")) {
            response.template_pages = templatePageIds;
        }
        if (sidebarOrder.includes("workarea")) {
            response.work_areas = workAreaIds
                .map((waId) => {
                    const wa = workAreas.find((w) => String(w._id) === waId);
                    if (!wa) return null;
                    return {
                        id: String(wa._id),
                        blockId: wa.blockId, // Include blockId as requested
                        name: wa.name,
                        pages: wa.pageIds || [],
                    };
                })
                .filter((wa) => wa !== null);
        }
        // Add workspace blockId to root response if needed
        console.log("response------------", response);
        return response;
    }
};
