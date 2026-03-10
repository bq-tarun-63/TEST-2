import { NextResponse } from "next/server";
import { WorkAreaService } from "@/services/workAreaService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    const { workAreaId } = await req.json();

    if (!workAreaId) {
      return NextResponse.json({
        error: "workAreaId is required"
      }, { status: 400 });
    }

    // Check if user has permission to delete workarea
    const canManage = await PermissionService.checkWorkAreaAccess({
      userId: String(user.id || user._id),
      workAreaId: String(workAreaId),
      requiredRole: 'admin'
    });

    if (!canManage) {
      return NextResponse.json({
        error: "Only workarea owner or workspace admins can delete this workarea"
      }, { status: 403 });
    }

    const result = await WorkAreaService.deleteWorkArea({
      workAreaId,
      currentUserId: String(user.id || user._id)
    });

    return NextResponse.json({
      message: "WorkArea deleted successfully",
      result
    }, { status: 200 });
  } catch (error: any) {
    console.error("Error deleting workarea:", error);
    return NextResponse.json({
      error: error.message || "Internal server error"
    }, { status: 500 });
  }
}