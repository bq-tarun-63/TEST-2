import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/services/databaseService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    const body = await req.json();
    const { blockId, viewTypeId, dataSourceId } = body;

    if (!blockId || !viewTypeId || !dataSourceId) {
      return NextResponse.json(
        { message: "blockId, viewTypeId, and dataSourceId are required" },
        { status: 400 }
      );
    }

    // Check permissions - user must have editor access to update view data source
    const canEdit = await PermissionService.checkAccess({
      userId: String(user._id),
      blockId: String(blockId),
      requiredRole: 'editor',
      workspaceId: undefined
    });

    if (!canEdit) {
      return NextResponse.json({
        error: "You don't have permission to modify this database"
      }, { status: 403 });
    }

    const result = await DatabaseService.updateViewDataSource({
      blockId,
      viewTypeId,
      dataSourceId,
    });

    return NextResponse.json(
      {
        success: true,
        message: "View data source updated successfully",
        view: result.view,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating view data source:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update view data source",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

