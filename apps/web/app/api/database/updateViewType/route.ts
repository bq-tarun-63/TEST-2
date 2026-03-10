import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/services/databaseService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUser();
  if (isAuthError(auth)) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }
  const { user, session, workspaceId } = auth;

  const body = await req.json();
  const { blockId, viewTypeId, icon = "", title, viewType, formIcon, formCoverImage, formTitle, formDescription, isPublicForm, formAnonymousResponses, formAccessToSubmission } = body;
  if (!blockId || !viewTypeId || !title) {
    return NextResponse.json({ message: "blockId, viewTypeId and title are required" }, { status: 400 });
  }

  // Check permissions - user must have editor access to update views
  const canEdit = await PermissionService.checkAccess({
    userId: String(user._id),
    blockId: String(blockId),
    requiredRole: 'editor',
    workspaceId: undefined
  });

  if (!canEdit) {
    return NextResponse.json({
      error: "You don't have permission to modify this database"
    }, { status: 403 });
  }

  const view = await DatabaseService.updateViewType({
    blockId,
    viewTypeId,
    icon,
    title,
    newViewType: viewType,
    formIcon,
    formCoverImage,
    formTitle,
    formDescription,
    isPublicForm,
    formAnonymousResponses,
    formAccessToSubmission,
  });
  return NextResponse.json({ message: "View type updated successfully", view: view }, { status: 200 });
}