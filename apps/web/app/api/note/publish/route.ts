import { randomUUID } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { BlockService } from "@/services/blockServices";
import { PermissionService } from "@/services/PermissionService";
import clientPromise from "@/lib/mongoDb/mongodb";
import { ObjectId } from "mongodb";
import { IBlock } from "@/models/types/Block";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        const body = await req.json();
        const { blockId, isPublic } = body;

        if (!blockId || typeof isPublic !== 'boolean') {
            return NextResponse.json(
                { message: "blockId and isPublic boolean are required" },
                { status: 400 },
            );
        }

        // Check if user has admin permission to publish this block
        const canPublish = await PermissionService.checkAccess({
            userId: String(auth.user.id),
            blockId: String(blockId),
            requiredRole: 'admin' // Need admin/owner rights to make public
        });

        if (!canPublish) {
            return NextResponse.json(
                { message: "You don't have permission to publish this page. Admin access required." },
                { status: 403 }
            );
        }

        const client = await clientPromise();
        const db = client.db();
        const blocksCollection = db.collection<IBlock>("blocks");

        // Find the specific block to verify it exists and is a special type
        const block = await blocksCollection.findOne({ _id: new ObjectId(blockId) });

        if (!block) {
            return NextResponse.json({ message: "Block not found" }, { status: 404 });
        }

        // Ensure that only pages/databases can be published directly
        if (block.blockType !== "page" && block.blockType !== "collection_view") {
            return NextResponse.json({ message: "Only pages and databases can be published" }, { status: 400 });
        }

        // Generate a random public_link_id on first publish, reuse on re-publish
        const existingLinkId = (block.value as any)?.public_link_id;
        const publicLinkId = existingLinkId || randomUUID().replace(/-/g, "");

        // Toggle the publicly_published boolean (does NOT touch pageType)
        const updateResult = await blocksCollection.updateOne(
            { _id: new ObjectId(String(blockId)) },
            {
                $set: {
                    "value.publicly_published": isPublic,
                    "value.public_link_id": publicLinkId,
                    updatedAt: new Date()
                }
            }
        );

        return NextResponse.json({
            message: `Page is now ${isPublic ? 'publicly published' : 'unpublished'}`,
            publicly_published: isPublic,
            public_link_id: isPublic ? publicLinkId : null
        }, { status: 200 });

    } catch (error: any) {
        console.error("Error in /api/note/publish:", error);
        return NextResponse.json({ message: error.message || "Internal Server Error" }, { status: 500 });
    }
}
