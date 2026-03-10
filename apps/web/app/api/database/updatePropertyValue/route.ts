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
    const { user, workspaceId } = auth;

    // Parse request body
    const body = await req.json();
    const { dataSourceId, blockId, pageId, propertyId, value, workspaceName = "", workareaId = "" } = body;

    // 4. Validate required fields
    if (!dataSourceId) {
      return NextResponse.json({
        message: "dataSourceId is required"
      }, { status: 400 });
    }

    if (!blockId) {
      return NextResponse.json({
        message: "blockId is required"
      }, { status: 400 });
    }

    if (!propertyId) {
      return NextResponse.json({
        message: "propertyId is required"
      }, { status: 400 });
    }

    if (value === undefined || value === null) {
      return NextResponse.json({
        message: "value is required"
      }, { status: 400 });
    }

    // Check permissions and validate dataSource
    const canEdit = await PermissionService.checkAccess
    ({
      userId: String(user._id),
      blockId: String(blockId),
      requiredRole: 'editor',
      workspaceId: workspaceId,
    });

    if (!canEdit) {
      return NextResponse.json({
        error: "You don't have permission to modify this database"
      }, { status: 403 });
    }

    // 5. Update property value
    try {
      const result = await DatabaseService.updatePropertyValue({
        dataSourceId,
        blockId,
        propertyId,
        value,
        currentUser: user,
        workspaceName: workspaceName || "",
      });

      const pageValue = result.page.value as any; // Cast to access page properties

      return NextResponse.json({
        success: true,
        page: {
          _id: result.page._id,
          title: pageValue.title,
          databaseProperties: pageValue.databaseProperties,
          updatedAt: result.page.updatedAt
        },
        propertyId: result.propertyId,
        value: result.value,
        updatedAt: result.updatedAt,
        notificationOnAssigned: result.notificationOnAssigned,
        message: `Property '${propertyId}' updated successfully for page '${pageValue.title}'`
      }, { status: 200 });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Data source not found") {
          return NextResponse.json({
            message: "Data source not found"
          }, { status: 404 });
        }
        if (error.message === "Property not found in database source") {
          return NextResponse.json({
            message: "Property not found"
          }, { status: 404 });
        }
        if (error.message === "Page not found in this data source") {
          return NextResponse.json({
            message: "Page not found in this data source"
          }, { status: 404 });
        }
        if (error.message === "Failed to update property value") {
          return NextResponse.json({
            message: "Failed to update property value"
          }, { status: 500 });
        }
        if (error.message === "Formula properties are read-only") {
          return NextResponse.json({
            message: error.message
          }, { status: 400 });
        }
      }
      throw error;
    }

  } catch (error) {
    console.error("Error updating property value:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to update property value",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
