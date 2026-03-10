import clientPromise from "@/lib/mongoDb/mongodb";
import { addMemberToWorkspace } from "@/services/notificationServices";
import { OrganizationService } from "@/services/organizationService";
import { ObjectId } from "bson";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { UserService } from "@/services/userService";

// Safely parse REVENT_LABS_WORKSPACE_IDS environment variable
const REVENT_LABS_WORKSPACE_IDS: string[] = process.env.REVENT_LABS_WORKSPACE_IDS
  ? process.env.REVENT_LABS_WORKSPACE_IDS.split(",").filter(Boolean)
  : [];

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json(
        { message: auth.error, authenticated: false },
        { status: auth.status },
      );
    }
    let { user, session } = auth;

    if (!user) {
      return NextResponse.json(
        { message: "Unauthorized: Unable to authenticate user", authenticated: false },
        { status: 401 },
      );
    }

    // Delegate complex logic to service
    const userWithOrg = await UserService.getCurrentUserWithOrg(user, session);

    // Secure Response: Return only sufficient data
    const safeUser = {
      id: userWithOrg.id || userWithOrg._id,
      name: userWithOrg.name,
      email: userWithOrg.email,
      image: userWithOrg.image,
      about: userWithOrg.about,
      coverUrl: userWithOrg.coverUrl,
      organizationId: userWithOrg.organizationId,
      organizationDomain: userWithOrg.organizationDomain,
      workspaceSettings: userWithOrg.workspaceSettings, // Required for app state
    };

    return NextResponse.json({ ...safeUser, authenticated: true }, { status: 200 });
  } catch (error) {
    console.error("Error in user API:", error);
    return NextResponse.json(
      {
        message: "Server error",
        error: error instanceof Error ? error.message : String(error),
        authenticated: false,
      },
      { status: 500 },
    );
  }
}
