import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { UserService } from "@/services/userService";

export async function PATCH(req: NextRequest) {
    try {
        // 1. Authenticate
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json({ message: auth.error }, { status: auth.status });
        }
        const { user } = auth;

        // 2. Parse and Validate Request Body
        const body = await req.json();
        const { name } = body;

        // Validate name (must be a non-empty string)
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ message: "Name is required" }, { status: 400 });
        }

        // 3. Perform Update via Service
        const userId = user.id || (user._id ? user._id.toString() : "");
        if (!userId) {
            return NextResponse.json({ message: "User ID missing" }, { status: 400 });
        }

        const updatedUserFull = await UserService.updateUserProfile(
            userId,
            { name: name.trim() }
        );

        if (!updatedUserFull) {
            return NextResponse.json({ message: "Update failed or user not found" }, { status: 404 });
        }

        // 4. Return Safe Response 
        const safeUser = {
            id: updatedUserFull.id || updatedUserFull._id,
            name: updatedUserFull.name,
            email: updatedUserFull.email,
            image: updatedUserFull.image,
            about: updatedUserFull.about,
            coverUrl: updatedUserFull.coverUrl,
            organizationId: updatedUserFull.organizationId,
            organizationDomain: updatedUserFull.organizationDomain,
            workspaceSettings: updatedUserFull.workspaceSettings,
        };

        return NextResponse.json(safeUser);

    } catch (error) {
        console.error("Error updating user name:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
