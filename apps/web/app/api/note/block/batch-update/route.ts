import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { BlockService, type BlockUpdateInput } from "@/services/blockServices";
import { PermissionService } from "@/services/PermissionService";

export const runtime = "nodejs";

interface BatchUpdateRequestBody {
  parentId: string;
  workspaceId: string;
  blocks: BlockUpdateInput[];
  blockIdArray?: string[];
  workareaId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as BatchUpdateRequestBody;
    const { parentId, workspaceId, blocks: updates, blockIdArray,workareaId } = body;

    if (!parentId || !workspaceId || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { message: "parentId, workspaceId, and non-empty updates array are required" },
        { status: 400 },
      );
    }

    if (blockIdArray !== undefined && !Array.isArray(blockIdArray)) {
      return NextResponse.json(
        { message: "blockIdArray must be an array" },
        { status: 400 },
      );
    }

    // Check if user has permission to edit parent block
    const canEdit = await PermissionService.checkAccess({
      userId: String(auth.user.id),
      blockId: String(parentId),
      requiredRole: 'editor',
      workspaceId: String(workspaceId),
      workareaId: (workareaId)
    });

    if (!canEdit) {
      return NextResponse.json(
        { message: "You don't have permission to update these blocks" },
        { status: 403 }
      );
    }

    await BlockService.batchUpdateBlocks({
      userId: String(auth.user.id),
      parentId,
      workspaceId,
      updates,
      blockIdArray: blockIdArray || []
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error in /api/note/block/batch-update:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
