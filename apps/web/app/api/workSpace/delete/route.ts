import { NextResponse } from "next/server";
import { WorkspaceService } from "@/services/workspaceService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import clientPromise from "@/lib/mongoDb/mongodb";
import { ObjectId } from "mongodb";
import { IWorkspace } from "@/models/types/Workspace";
import { IVeiwDatabase } from "@/models/types/Block";


export async function DELETE(req: Request) {
  try {
    const auth = await getAuthenticatedUser(undefined, { createUserIfNotFound: true });
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user, session } = auth;
    const { workspaceId } = await req.json();

    if (!workspaceId) {
      return NextResponse.json({
        message: "workspaceId is required"
      }, { status: 400 });
    }

    // Check if user is workspace owner
    const client = await clientPromise();
    const db = client.db();
    const workspaces = db.collection<IWorkspace>("workspaces");

    const viewDatabasesCollection = db.collection<IVeiwDatabase>("viewDatabases");

    const workspace = await workspaces.findOne({
      _id: new ObjectId(workspaceId)
    });

    if (!workspace) {
      return NextResponse.json({
        message: "Workspace not found"
      }, { status: 404 });
    }

    if (String(workspace.ownerId) !== String(user._id)) {
      return NextResponse.json({
        message: "Only workspace owner can delete workspace"
      }, { status: 403 });
    }

    const deletedWorkspace = await WorkspaceService.deleteWorkspace({
      workspaceId,
      currentUserId: String(user?.id || user?._id),
    });
    return NextResponse.json({ message: "Workspace deleted successfully", workspace: workspace }, { status: 200 });
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return NextResponse.json({ message: "Internal server error", error: error }, { status: 500 });
  }
}
