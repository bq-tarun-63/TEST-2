import { type NextRequest, NextResponse } from "next/server";
import { DatabaseSettingService } from "@/services/databaseSettingService";
import type { IFilter, IAdvancedFilterGroup } from "@/models/types/ViewTypes";
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
    const { viewTypeId, filters, advancedFilters, blockId } = body;

    // Validate required fields
    if (!viewTypeId) {
      return NextResponse.json(
        { message: "viewTypeId is required" },
        { status: 400 }
      );
    }

    // Handle regular filters
    if (filters !== undefined) {
      if (!Array.isArray(filters)) {
        return NextResponse.json(
          { message: "filters must be an array" },
          { status: 400 }
        );
      }

      // Validate filter items structure
      for (const filter of filters) {
        if (!filter.propertyId || typeof filter.propertyId !== "string") {
          return NextResponse.json(
            {
              message: "Each filter must have a valid propertyId",
            },
            { status: 400 }
          );
        }
      }

      // Check permissions - user must have editor access to update filters
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

      // Update regular filters
      const result = await DatabaseSettingService.updateFilters({
        blockId,
        viewTypeId,
        filters: filters as IFilter[],
      });

      return NextResponse.json(
        {
          success: true,
          message: "Filters updated successfully",
          viewType: result.viewType,
        },
        { status: 200 }
      );
    }

    // Validate blockId
    if (!blockId) {
      return NextResponse.json(
        { message: "blockId is required" },
        { status: 400 }
      );
    }

    // Handle advanced filters
    if (advancedFilters !== undefined) {
      if (!Array.isArray(advancedFilters)) {
        return NextResponse.json(
          { message: "advancedFilters must be an array" },
          { status: 400 }
        );
      }

      // Update advanced filters
      const result = await DatabaseSettingService.updateAdvancedFilters({
        blockId,
        viewTypeId,
        advancedFilters: advancedFilters as IAdvancedFilterGroup[],
      });

      return NextResponse.json(
        {
          success: true,
          message: "Advanced filters updated successfully",
          viewType: result.viewType,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { message: "Either filters or advancedFilters must be provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating filters:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update filters",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

