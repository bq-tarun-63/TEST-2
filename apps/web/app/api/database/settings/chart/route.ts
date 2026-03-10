import { type NextRequest, NextResponse } from "next/server";
import { DatabaseSettingService } from "@/services/databaseSettingService";
import type { IChartSettings } from "@/models/types/ViewTypes";
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
    const { viewTypeId, chartSettings, blockId } = body;

    // Validate required fields
    if (!blockId || !viewTypeId) {
      return NextResponse.json(
        { message: "blockId and viewTypeId are required" },
        { status: 400 }
      );
    }

    if (!chartSettings || typeof chartSettings !== "object") {
      return NextResponse.json(
        { message: "chartSettings must be an object" },
        { status: 400 }
      );
    }

    // Check permissions - user must have editor access to update chart settings
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

    // Update chart settings
    const result = await DatabaseSettingService.updateChartSettings({
      blockId,
      viewTypeId,
      chartSettings: chartSettings as IChartSettings,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Chart settings updated successfully",
        viewType: result.viewType,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating chart settings:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update chart settings",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

