import { NextResponse } from "next/server";
import { WorkspaceService } from "@/services/workspaceService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user, session } = auth;

    const { workspaceId, memberId, role } = await req.json();

    if (!workspaceId || !memberId || !role) {
      return NextResponse.json({
        error: "workspaceId, memberId, and role are required"
      }, { status: 400 });
    }

    // Check if user is workspace admin
    const canManage = await PermissionService.canManageWorkspace({
      userId: String(user._id),
      workspaceId: String(workspaceId)
    });

    if (!canManage) {
      return NextResponse.json({
        error: "Only workspace admins can update member roles"
      }, { status: 403 });
    }

    const workspace = await WorkspaceService.updateMemberRole({
      workspaceId,
      memberId,
      role,
      currentUserId: String(user.id || user._id),
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    console.error("Error creating workspace:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
