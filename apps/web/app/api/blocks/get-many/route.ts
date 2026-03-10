import { NextRequest, NextResponse } from "next/server";
import { BlockService } from "@/services/blockServices";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { z } from "zod";

const getManyBlocksSchema = z.object({
    blockIds: z.array(z.string())
});

export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }

        const body = await req.json();
        const result = getManyBlocksSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                { message: "Invalid request body", errors: result.error.flatten() },
                { status: 400 }
            );
        }

        const { blockIds } = result.data;

        const blocks = await BlockService.getBlocksByIds({
            blockIds
        });

        return NextResponse.json({
            success: true,
            blocks
        });

    } catch (error: any) {
        console.error("[GetManyBlocks] Error:", error);
        return NextResponse.json(
            { message: error.message || "Failed to fetch blocks" },
            { status: 500 }
        );
    }
}
