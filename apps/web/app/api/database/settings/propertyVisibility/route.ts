import { type NextRequest, NextResponse } from "next/server";
import { DatabaseSettingService } from "@/services/databaseSettingService";
import type { IPropertyVisibility } from "@/models/types/ViewTypes";
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
    const { blockId, viewTypeId, propertyVisibility } = body;

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

    if (!Array.isArray(propertyVisibility)) {
      return NextResponse.json(
        { message: "propertyVisibility must be an array" },
        { status: 400 }
      );
    }

    // Check permissions - user must have editor access to update property visibility
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

    // 6. Update property visibility
    const result = await DatabaseSettingService.updatePropertyVisibility({
      blockId,
      viewTypeId,
      propertyVisibility: propertyVisibility as IPropertyVisibility[],
    });

    return NextResponse.json(
      {
        success: true,
        message: "Property visibility updated successfully",
        viewType: result.viewType,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating property visibility:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update property visibility",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

