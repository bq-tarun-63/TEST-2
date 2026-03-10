import { DatabaseService } from "@/services/databaseService";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser(req, { includeWorkspace: true });
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user, session ,workspaceId} = auth;
    // Check permissions - user must be workspace member to view databases
    if (workspaceId) {
      const isMember = await PermissionService.checkWorkspaceAccess({
        userId: String(user._id),
        workspaceId: workspaceId,
        requiredRole: 'viewer'
      });

      if (!isMember) {
        return NextResponse.json({
          error: "You don't have permission to view databases in this workspace"
        }, { status: 403 });
      }
    }
    else{
      throw new Error("Workspace not found");
    }

    // 4. Get all views
    const datasources = await DatabaseService.getAllDataSourcesByWorkspace({ workspaceId });

    return NextResponse.json({
      success: true,
      datasources: datasources,
      count: datasources.length,
      message: `Found ${datasources.length} datasource(s)`
    }, { status: 200 });

  } catch (error) {
    console.error("Error fetching datasources:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch datasources",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}