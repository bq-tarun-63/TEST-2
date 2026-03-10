import { type NextRequest, NextResponse } from "next/server";
import { DatabaseSettingService } from "@/services/databaseSettingService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    // Parse request body
    const body = await req.json();
    const { blockId, viewTypeId, isLocked } = body;

    // 4. Validate required fields
    if (!blockId) {
      return NextResponse.json(
        { message: "blockId is required" },
        { status: 400 }
      );
    }
    if (!viewTypeId) {
      return NextResponse.json(
        { message: "viewTypeId is required" },
        { status: 400 }
      );
    }

    // 5. Validate isLocked if provided (must be boolean)
    if (isLocked !== undefined && typeof isLocked !== "boolean") {
      return NextResponse.json(
        { message: "isLocked must be a boolean value" },
        { status: 400 }
      );
    }

    // Check permissions - user must have admin access to lock/unlock views
    const canLock = await PermissionService.checkAccess({
      userId: String(user._id),
      blockId: String(blockId),
      requiredRole: 'admin'
    });

    if (!canLock) {
      return NextResponse.json({
        error: "You don't have permission to lock/unlock this database"
      }, { status: 403 });
    }

    // 6. Toggle lock
    const result = await DatabaseSettingService.toggleLock({
      blockId,
      viewTypeId,
      isLocked,
    });

    return NextResponse.json(
      {
        success: true,
        message: result.isLocked
          ? "View locked successfully"
          : "View unlocked successfully",
        viewType: result.viewType,
        isLocked: result.isLocked,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error toggling lock:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to toggle lock",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

