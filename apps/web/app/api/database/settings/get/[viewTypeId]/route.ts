import { type NextRequest, NextResponse } from "next/server";
import { DatabaseSettingService } from "@/services/databaseSettingService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ viewTypeId: string }> }
) {
  try {
    // Authentication check
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    // 3. Get viewTypeId from params and blockId from query
    const { viewTypeId } = await params;
    const { searchParams } = new URL(req.url);
    const blockId = searchParams.get("blockId");

    if (!viewTypeId) {
      return NextResponse.json(
        { message: "viewTypeId is required" },
        { status: 400 }
      );
    }

    if (!blockId) {
      return NextResponse.json(
        { message: "blockId is required" },
        { status: 400 }
      );
    }

    // Check permissions - user must have viewer access to view settings
    const canView = await PermissionService.checkAccess({
      userId: String(user._id),
      blockId: String(blockId),
      requiredRole: 'viewer'
    });

    if (!canView) {
      return NextResponse.json({
        error: "You don't have permission to view this database"
      }, { status: 403 });
    }

    // 4. Get viewType settings from service
    const result = await DatabaseSettingService.getViewTypeById({ blockId, viewTypeId });

    return NextResponse.json(
      {
        success: true,
        viewType: result.viewType,
        message: "View type settings retrieved successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching view type settings:", error);

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message === "View type not found") {
        return NextResponse.json(
          {
            success: false,
            message: "View type not found",
          },
          { status: 404 }
        );
      }
      if (error.message === "View type ID is required") {
        return NextResponse.json(
          {
            success: false,
            message: "viewTypeId is required",
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch view type settings",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

