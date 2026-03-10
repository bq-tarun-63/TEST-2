import { NextResponse } from "next/server";
import slugify from "slugify";
import { WorkspaceService } from "@/services/workspaceService";
import { ObjectId } from "mongodb";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user, session } = auth;

    const { workspaceId, name, icon, allowedDomains, diplayAnalytics, Profiles, HoverCards } = await req.json();

    if (!workspaceId) {
      return NextResponse.json({
        error: "workspaceId is required"
      }, { status: 400 });
    }

    // Check if user is workspace admin
    const canManage = await PermissionService.canManageWorkspace({
      userId: String(user._id),
      workspaceId: String(workspaceId)
    });

    if (!canManage) {
      return NextResponse.json({
        error: "Only workspace admins can update workspace settings"
      }, { status: 403 });
    }

    const workspace = await WorkspaceService.updateWorkspaceDetails({
      workspaceId,
      name,
      icon,
      allowedDomains,
      displayAnalytics: diplayAnalytics,
      profiles: Profiles,
      hoverCards: HoverCards,
      currentUserId: String(user.id || user._id),
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    console.error("Error creating workspace:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
