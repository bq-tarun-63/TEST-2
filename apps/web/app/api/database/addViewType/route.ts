import { type NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/services/databaseService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUser();
  if (isAuthError(auth)) {
    return NextResponse.json({ message: auth.error }, { status: auth.status });
  }
  const { user } = auth;
  const body = await req.json();
  const { blockId, viewId,typeToAdd = "",viewTypeValue } = body;
  if(!viewTypeValue){
   
  }
  if (!blockId) {
    return NextResponse.json({ message: "blockId is required" }, { status: 400 });
  }

  if (!["board", "table", "list", "calendar", "timeline", "forms", "chart","gallery"].includes(typeToAdd)) {
    return NextResponse.json({ message: "typeToAdd must be one of: board, table, list, calendar, timeline, forms, chart, gallery" }, { status: 400 });
  }

  // Check permissions - user must have editor access to the database block
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

  const result = await DatabaseService.addViewType({
    viewId,
    blockId,
    addToViewType: typeToAdd,
    viewTypeValue
  });

  return NextResponse.json({ message: "View type added successfully", view: result.view }, { status: 200 });
}