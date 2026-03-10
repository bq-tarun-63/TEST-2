import { type NextRequest, NextResponse } from "next/server";
import { DatabaseSettingService } from "@/services/databaseSettingService";
import type { ISort } from "@/models/types/ViewTypes";
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
    const { blockId, viewTypeId, sorts } = body;

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

    if (!Array.isArray(sorts)) {
      return NextResponse.json(
        { message: "sorts must be an array" },
        { status: 400 }
      );
    }

    // 5. Validate sort items structure
    for (const sort of sorts) {
      if (!sort.propertyId || !sort.direction) {
        return NextResponse.json(
          {
            message: "Each sort must have propertyId and direction",
          },
          { status: 400 }
        );
      }
      if (
        sort.direction !== "ascending" &&
        sort.direction !== "descending"
      ) {
        return NextResponse.json(
          {
            message: "Sort direction must be 'ascending' or 'descending'",
          },
          { status: 400 }
        );
      }
    }

    // Check permissions - user must have editor access to update sorts
    const canEdit = await PermissionService.checkAccess({
      userId: String(user._id),
      blockId: String(blockId),
      requiredRole: 'editor'
    });

    if (!canEdit) {
      return NextResponse.json({
        error: "You don't have permission to modify this database"
      }, { status: 403 });
    }

    // 6. Update sorts
    const result = await DatabaseSettingService.updateSorts({
      blockId,
      viewTypeId,
      sorts: sorts as ISort[],
    });

    return NextResponse.json(
      {
        success: true,
        message: "Sorts updated successfully",
        viewType: result.viewType,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating sorts:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update sorts",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

