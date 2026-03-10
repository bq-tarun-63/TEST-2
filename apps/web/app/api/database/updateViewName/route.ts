import { DatabaseService } from "@/services/databaseService";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUser();
  if (isAuthError(auth)) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }
  const { user } = auth;
  const body = await req.json();
  const { blockId, title, icon } = body;

  if (!blockId) {
    return NextResponse.json(
      {
        message: "blockId is required",
      },
      { status: 400 },
    );
  }

  if (title === undefined && icon === undefined) {
    return NextResponse.json(
      { message: "At least one of title or icon is required" },
      { status: 400 },
    );
  }

  // Check permissions - user must have editor access to update view name
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

  try {
    const result = await DatabaseService.updateViewNameOrIcon({
      blockId,
      ...(title !== undefined && { title }),
      ...(icon !== undefined && { icon }),
    });
    return NextResponse.json(
      {
        message: "View updated successfully",
        view: result.view,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({
      message: "Failed to update view",
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 }
    );
  }
}
