import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { WorkAreaService } from "@/services/workAreaService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user, session } = auth;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({
        error: "workspaceId is required"
      }, { status: 400 });
    }

    // Try to convert to ObjectId, but also query by string in case it's stored as string
    let workspaceObjectId: ObjectId;
    try {
      workspaceObjectId = new ObjectId(String(id));
    } catch (error) {
      return NextResponse.json({
        error: "Invalid workspaceId format"
      }, { status: 400 });
    }

    // Check if user is a member of the workspace
    const isMember = await PermissionService.checkWorkspaceAccess({
      userId: String(user._id),
      workspaceId: String(id),
      requiredRole: 'viewer'
    });

    if (!isMember) {
      return NextResponse.json({
        error: "You are not a member of this workspace"
      }, { status: 403 });
    }

    // Get all workareas in workspace
    const allWorkAreas = await WorkAreaService.getAllWorkAreas({
      workspaceId: workspaceObjectId,
    });

    console.log("Fetched work areas:", allWorkAreas.length, "for workspaceId:", String(id));

    // Filter workareas by user access
    const accessibleWorkAreas: typeof allWorkAreas = [];
    for (const wa of allWorkAreas) {
      const canView = await PermissionService.checkWorkAreaAccess({
        userId: String(user._id),
        workAreaId: String(wa._id),
        requiredRole: 'viewer'
      });

      if (canView) {
        accessibleWorkAreas.push(wa);
      }
    }

    // Format work areas to include id field
    const formattedWorkAreas = accessibleWorkAreas.map((wa) => ({
      ...wa,
      id: String(wa._id),
      _id: String(wa._id),
    }));

    return NextResponse.json({ workAreas: formattedWorkAreas }, { status: 200 });
  } catch (error) {
    console.error("Error getting workareas:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

