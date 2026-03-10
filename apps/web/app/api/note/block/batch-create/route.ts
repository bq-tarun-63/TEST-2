import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { BlockService, type BlockCreateInput } from "@/services/blockServices";
import { ParentTable } from "@/models/types/Block";
import { PermissionService } from "@/services/PermissionService";

export const runtime = "nodejs";

interface BatchCreateRequestBody {
  parentId: string;
  workspaceId: string;
  blocks: BlockCreateInput[];
  parentTable: ParentTable;
  dataSourceDetail?: any;
  workareaId?: string;
  view_databaseId?: string;
  isTemplate?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
  
    const body = (await req.json()) as BatchCreateRequestBody;
    const { parentId, workspaceId, blocks, parentTable, dataSourceDetail = null, workareaId,view_databaseId,isTemplate=false } = body;

    if (!parentId || !workspaceId || !Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json(
        { message: "parentId, workspaceId, and non-empty blocks array are required" },
        { status: 400 },
      );
    }

    // Check if user has permission to edit the parent block
    const canEdit = await PermissionService.checkAccess({
      userId: String(auth.user.id),
      blockId: String(parentId),
      requiredRole: 'editor',
      workspaceId: String(workspaceId),
      workareaId:workareaId,
    });

    if (!canEdit) {
      return NextResponse.json(
        { message: "You don't have permission to create blocks in this location" },
        { status: 403 }
      );
    }
    await BlockService.batchCreateBlocks({
      userId: String(auth.user.id),
      parentId,
      workspaceId,
      blocks,
      parentTable,
      dataSourceDetail,
      view_databaseId,
      workareaId,
      userName: auth.user.name,
      userEmail:auth.user.email,
      isTemplate,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error in /api/note/block/batch-create:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
