
import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/services/databaseService";
import { ObjectId } from "mongodb";
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
    const {
      propertyId,
      dataSourceId,
      blockId, // Optional for audit purposes
      name,
      type,
      options = [],
      linkedDatabaseId,
      syncedPropertyId,
      syncedPropertyName,
      relationLimit = "multiple",
      displayProperties = [],
      twoWayRelation = false,
      githubPrConfig,
      specialProperty,
      rollup,
      numberFormat,
      decimalPlaces,
      showAs,
      progressColor,
      progressDivideBy,
      showNumberText,
    } = body;

    // 4. Validate required fields
    if (!propertyId || !dataSourceId) {
      return NextResponse.json({
        message: "propertyId and dataSourceId are required"
      }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({
        message: "Property name is required and must be a non-empty string"
      }, { status: 400 });
    }

    const validTypes = [
      'title',
      'text',
      'select',
      'multi_select',
      'comments',
      'person',
      'date',
      'checkbox',
      'number',
      'status',
      'priority',
      'formula',
      'relation',
      'github_pr',
      'rollup',
      'email',
      'url',
      'phone',
      'file',
      'id',
    ];
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json({
        message: `Property type is required and must be one of: ${validTypes.join(', ')}`
      }, { status: 400 });
    }

    // Validate relation-specific fields
    if (type === "relation") {
      if (!linkedDatabaseId) {
        return NextResponse.json({
          message: "linkedDatabaseId is required for relation properties"
        }, { status: 400 });
      }
      if (relationLimit && !["single", "multiple"].includes(relationLimit)) {
        return NextResponse.json({
          message: "relationLimit must be 'single' or 'multiple'"
        }, { status: 400 });
      }
    }

    if (!user.email || !user.name || !user.id) {
      throw new Error("Email is required");
    }

    // Validate blockId is provided
    if (!blockId) {
      return NextResponse.json({
        message: "blockId is required"
      }, { status: 400 });
    }

    // Check permissions and validate dataSource
    const canEdit = await PermissionService.checkAccessForDataSource({
      userId: String(user._id),
      blockId: String(blockId),
      dataSourceId: String(dataSourceId),
      requiredRole: 'editor'
    });

    if (!canEdit) {
      return NextResponse.json({
        error: "You don't have permission to modify this database"
      }, { status: 403 });
    }

    // 6. Add property to data sourceaddPropertyTodataSource
    try {
      const result = await DatabaseService.addPropertyToDataSource({
        dataSourceId,
        propertyData: {
          propertyId,
          name,
          type,
          options,
          linkedDatabaseId: linkedDatabaseId ? new ObjectId(String(linkedDatabaseId)) : undefined,
          syncedPropertyId,
          syncedPropertyName,
          relationLimit,
          displayProperties,
          twoWayRelation,
          githubPrConfig,
          specialProperty: specialProperty === true,
          rollup: rollup ? {
            ...rollup,
            relationDataSourceId: rollup.relationDataSourceId ? new ObjectId(String(rollup.relationDataSourceId)) : undefined
          } : undefined,
          numberFormat,
          decimalPlaces,
          showAs,
          progressColor,
          progressDivideBy,
          showNumberText,
        },
        userId: user.id,
        userEmail: user.email,
        userName: user.name || "Unknown User",
        blockId
      });

      const response: any = {
        success: true,
        property: result.property,
        dataSource: result.dataSource,
        message: `Property '${name}' added successfully`
      };

      // Include reverse datasource if two-way relation was created
      if (result.reverseDataSource && result.reverseProperty) {
        response.reverseProperty = result.reverseProperty;
        response.reverseDataSource = result.reverseDataSource;
      }

      return NextResponse.json(response, { status: 201 });

    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Database source not found") {
          return NextResponse.json({
            message: "Data source not found"
          }, { status: 404 });
        }
        if (error.message.includes("already exists")) {
          return NextResponse.json({
            message: error.message
          }, { status: 400 });
        }
        if (error.message === "Failed to add property to view") {
          return NextResponse.json({
            message: "Failed to add property to view"
          }, { status: 500 });
        }
      }
      throw error;
    }

  } catch (error) {
    console.error("Error creating property:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create property",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
