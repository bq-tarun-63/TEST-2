import { DatabaseService } from "@/services/databaseService";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    // 3. Get collection ID from params
    const {id} = await params;
    if (!id) {
      return NextResponse.json({
        message: "Collection ID is required"
      }, { status: 400 });
    }
   //for now we are commenting 
    // Check permissions - user must have viewer access to view data source
    // const canView = await PermissionService.checkAccess({
    //   userId: String(user._id),
    //   blockId: String(id),
    //   requiredRole: 'viewer'
    // });

    // if (!canView) {
    //   return NextResponse.json({
    //     error: "You don't have permission to view this database"
    //   }, { status: 403 });
    // }

    // 4. Get collection by ID
    const collection = await DatabaseService.getDataSourceById({ dataSourceId: id });
    if (!collection) {
      return NextResponse.json({
        message: "Collection not found"
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      collection,
      message: "Collection retrieved successfully"
    });

  } catch (error) {
    console.error("Error fetching collection:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch collection",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}