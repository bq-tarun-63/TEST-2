import { NextResponse } from "next/server";
import { WorkAreaService } from "@/services/workAreaService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";
import clientPromise from "@/lib/mongoDb/mongodb";
import { ObjectId } from "mongodb";

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    const body = await req.json();
    const { workAreaId } = body;

    // Validate required fields
    if (!workAreaId) {
      return NextResponse.json({
        error: "workAreaId is required"
      }, { status: 400 });
    }

    // Get workarea to find workspace
    const client = await clientPromise();
    const db = client.db();
    const workAreasCollection = db.collection("workAreas");

    const workArea = await workAreasCollection.findOne({
      _id: new ObjectId(workAreaId)
    });

    if (!workArea) {
      return NextResponse.json({
        error: "WorkArea not found"
      }, { status: 404 });
    }

    // Check if user is a member of the workspace
    const isMember = await PermissionService.checkWorkspaceAccess({
      userId: String(user._id),
      workspaceId: String(workArea.workspaceId),
      requiredRole: 'viewer'
    });

    if (!isMember) {
      return NextResponse.json({
        error: "You must be a workspace member to join workareas"
      }, { status: 403 });
    }

    // Join the workarea (service will check access level)
    const joinedWorkArea = await WorkAreaService.joinWorkArea({
      workAreaId,
      currentUserId: String(user._id),
    });

    // Format work area to include id field
    const formattedWorkArea = {
      ...joinedWorkArea,
      id: String(joinedWorkArea._id),
      _id: String(joinedWorkArea._id),
    };

    // Determine response message based on access level
    const message = "Joined workarea successfully";

    return NextResponse.json({
      message,
      workArea: formattedWorkArea,
    }, { status: 200 });
  } catch (error) {
    console.error("Error joining workarea:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({
      message: errorMessage,
      error: errorMessage
    }, { status: 500 });
  }
}

