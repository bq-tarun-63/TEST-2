import { type NextRequest, NextResponse } from "next/server";
import { DatabaseSettingService } from "@/services/databaseSettingService";
import type { IGroup } from "@/models/types/ViewTypes";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
  try {
    // Authentication check
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    // 3. Parse request body
    const body = await req.json();
    const { blockId, viewTypeId, group } = body;

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

    // 5. Validate group if provided
    if (group !== null && group !== undefined) {
      if (typeof group !== "object") {
        return NextResponse.json(
          { message: "group must be an object or null" },
          { status: 400 }
        );
      }
      if (!group.propertyId || typeof group.propertyId !== "string") {
        return NextResponse.json(
          {
            message: "group must have a valid propertyId",
          },
          { status: 400 }
        );
      }
      if (
        group.sortDirection &&
        group.sortDirection !== "ascending" &&
        group.sortDirection !== "descending"
      ) {
        return NextResponse.json(
          {
            message: "group.sortDirection must be 'ascending' or 'descending'",
          },
          { status: 400 }
        );
      }
    }

    // Check permissions - user must have editor access to update group
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

    // 6. Update group
    const result = await DatabaseSettingService.updateGroup({
      blockId,
      viewTypeId,
      group: group as IGroup | null,
    });

    return NextResponse.json(
      {
        success: true,
        message: group ? "Group updated successfully" : "Group removed successfully",
        viewType: result.viewType,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating group:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update group",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


