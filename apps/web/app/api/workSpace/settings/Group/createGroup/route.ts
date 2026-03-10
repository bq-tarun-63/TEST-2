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

    const { workspaceId, name, members } = await req.json();

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Check if user is workspace admin
    const canManage = await PermissionService.canManageWorkspace({
      userId: String(user._id),
      workspaceId: String(workspaceId)
    });

    if (!canManage) {
      return NextResponse.json({
        error: "Only workspace admins can create groups"
      }, { status: 403 });
    }

    const workspace = await WorkspaceService.createGroup({
      workspaceId,
      name,
      currentUserId: String(user?.id || user?._id),
      members,
    });

    return NextResponse.json({ message: "Group created successfully", workspace: workspace }, { status: 200 });
  } catch (error) {
    console.error("Error creating group:", error);
    return NextResponse.json({ message: "Internal server error", error: error }, { status: 500 });
  }
}
