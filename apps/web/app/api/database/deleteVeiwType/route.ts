import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/services/databaseService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function DELETE(req: NextRequest) {
  const auth = await getAuthenticatedUser();
  if (isAuthError(auth)) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }
  const { user } = auth;
  const body = await req.json();
  const { blockId, viewTypeToDelete } = body;
  if (!blockId || !viewTypeToDelete) {
    return NextResponse.json({ message: "blockId and viewTypeToDelete are required" }, { status: 400 });
  }

  // Check permissions - user must have admin access to delete views
  const canDelete = await PermissionService.checkAccess({
    userId: String(user._id),
    blockId: String(blockId),
    requiredRole: 'admin',
    workspaceId: undefined
  });

  if (!canDelete) {
    return NextResponse.json({
      error: "You don't have permission to delete views from this database"
    }, { status: 403 });
  }

  const view = await DatabaseService.deleteViewType({ blockId, viewTypeId: viewTypeToDelete });
  return NextResponse.json({ message: "View type deleted successfully", view: view }, { status: 200 });
}