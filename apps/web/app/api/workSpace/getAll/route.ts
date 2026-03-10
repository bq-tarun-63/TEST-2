import { NextResponse } from "next/server";
import { OrganizationService } from "@/services/organizationService";
import { WorkspaceService } from "@/services/workspaceService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function GET() {
  try {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
      return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user, session } = auth;
    if (!session?.user?.email) {
      throw new Error("Email is required");
    }
    let domain = session.user.email.split("@")[1];
    let lowerDomain = domain?.toLowerCase() as string;
    if (lowerDomain === "gmail.com") {
      lowerDomain = "reventlabs.com"
    }
    console.log(lowerDomain)

    // Get workspaces in domain for the user (handles public/private visibility)
    const userWorkspaces = await WorkspaceService.getWorkspacesByDomain({
      domain: lowerDomain,
      userId: String(user._id)
    });

    return NextResponse.json({
      message: "Workspaces fetched successfully",
      workspaces: userWorkspaces,
    });
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
