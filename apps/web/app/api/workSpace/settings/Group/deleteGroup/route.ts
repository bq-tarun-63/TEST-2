import { NextResponse } from "next/server";
import { WorkspaceService } from "@/services/workspaceService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    const body = await req.json();
    const { workspaceId, groupId } = body;

    // Validate required fields
    if (!workspaceId || !groupId) {
      return NextResponse.json({
        error: "workspaceId and groupId are required"
      }, { status: 400 });
    }

    // Check if user is workspace admin
    const canManage = await PermissionService.canManageWorkspace({
      userId: String(user._id),
      workspaceId: String(workspaceId)
    });

    if (!canManage) {
      return NextResponse.json({
        error: "Only workspace admins can delete groups"
      }, { status: 403 });
    }

    const workspace = await WorkspaceService.deleteGroup({
      workspaceId,
      groupId,
      currentUserId: String(user?.id || user?._id),
    });

    return NextResponse.json({
      message: "Group deleted successfully",
      workspace: workspace
    }, { status: 200 });
  } catch (error) {
    console.error("Error deleting group:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({
      message: errorMessage,
      error: errorMessage
    }, { status: 500 });
  }
}
