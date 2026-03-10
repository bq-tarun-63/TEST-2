import { type NextRequest, NextResponse } from "next/server";
import { BlockService } from "@/services/blockServices";
import { clusterManager } from "@/lib/mongoDb/clusterManager";
import type { IBlock } from "@/models/types/Block";

export const runtime = "nodejs";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ noteId: string }> }
) {
    try {
        const { noteId } = await params;

        if (!noteId) {
            return NextResponse.json(
                { message: "noteId is required" },
                { status: 400 }
            );
        }

        const metadataClient = await clusterManager.getMetadataClient();
        const metadataDb = metadataClient.db();
        const blocksColl = metadataDb.collection<IBlock>("blocks");

        // 1. Look up by the random public_link_id (UUID), NOT by MongoDB _id
        const rootBlock = await blocksColl.findOne({
            "value.public_link_id": noteId,
            status: "alive",
        });

        if (!rootBlock) {
            return NextResponse.json(
                { message: "Note not found." },
                { status: 404 }
            );
        }

        // 2. Security Check: Block MUST have publicly_published === true
        const pageValue = rootBlock.value as any;
        if (pageValue?.publicly_published !== true) {
            return NextResponse.json(
                { message: "This page is not publicly published. You do not have permission to view this page." },
                { status: 403 }
            );
        }

        // 3. Use the existing BlockService to fetch the exact same response layout
        // as the authenticated get-all-block endpoint.
        const blockId = String(rootBlock._id);
        const workspaceId = rootBlock.workspaceId;

        if (!workspaceId) {
            return NextResponse.json(
                { message: "Invalid note data (missing workspaceId)." },
                { status: 500 }
            );
        }

        const result = await BlockService.getOnlineContentForPage(blockId, workspaceId);

        // Ensure we explicitly set permission to viewer for public pages
        if (result) {
            result.permission = "viewer";

            // It's a public note so override any inner logic if necessary, though getOnlineContentForPage
            // returns mostly structural data. 
            // result is of type any from the service natively, returning { blocks, blockIds, fetchTime, ... }.
        }

        return NextResponse.json(result, { status: 200 });

    } catch (error) {
        console.error("Error in /api/public/note/[noteId]:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
