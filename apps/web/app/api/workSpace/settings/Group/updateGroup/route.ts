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
    const { user } = auth;

    const { workspaceId, groupId, name, members } = await req.json();

    if (!groupId || !workspaceId) {
      return NextResponse.json({ message: "workspaceId and groupId are required" }, { status: 400 });
    }

    // Check if user is workspace admin
    const canManage = await PermissionService.canManageWorkspace({
      userId: String(user._id),
      workspaceId: String(workspaceId)
    });

    if (!canManage) {
      return NextResponse.json({
        error: "Only workspace admins can update groups"
      }, { status: 403 });
    }

    const workspace = await WorkspaceService.updateGroup({
      workspaceId,
      groupId,
      name,
      currentUserId: String(user?.id || user?._id),
      members,
    });

    return NextResponse.json({ message: "Group updated successfully", group: workspace }, { status: 200 });
  } catch (error) {
    console.error("Error updating group:", error);
    return NextResponse.json({ message: "Internal server error", error: error }, { status: 500 });
  }
}
