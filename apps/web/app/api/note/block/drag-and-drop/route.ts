import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { BlockService } from "@/services/blockServices";
import { ParentTable } from "@/models/types/Block";
import { PermissionService } from "@/services/PermissionService";

export const runtime = "nodejs";

export interface DragAndDropinputfield {
  parentId: string;
  workspaceId: string;
  blockIdArray: string[];
  typeofChild: "public" | "private" | "workarea" | "template";
}
export interface inputUpdateBlockInfo {
  blockId: string;
  parentType: ParentTable;
  parentId: string;
  pageType?: "public" | "private";
  workareaId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }

    const body: { dragAndDropinputfieldArray: DragAndDropinputfield[], updatedBlockInfo: inputUpdateBlockInfo } = await req.json();
    const { dragAndDropinputfieldArray, updatedBlockInfo } = body;
    if (dragAndDropinputfieldArray.length === 0) {
      return NextResponse.json({ message: "dragAndDropinputfieldArray is required" }, { status: 400 });
    }

    // Check if user has permission to edit the block being moved
    const canEdit = await PermissionService.checkAccess({
      userId: String(auth.user.id),
      blockId: String(updatedBlockInfo.blockId),
      requiredRole: 'editor',
      workspaceId: String(dragAndDropinputfieldArray[0]?.workspaceId || '')
    });

    if (!canEdit) {
      return NextResponse.json(
        { message: "You don't have permission to move this block" },
        { status: 403 }
      );
    }

    await BlockService.dragAndDropBlocks({
      dragAndDropinputfieldArray,
      updatedBlockInfo,
      userId: String(auth.user.id)
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error in /api/note/block/drag-and-drop:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}