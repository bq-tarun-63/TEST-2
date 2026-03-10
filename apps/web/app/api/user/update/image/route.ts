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
        const { image } = body;

        // Validate image (should be a string URL or empty/null to remove)
        if (image !== undefined && typeof image !== 'string' && image !== null) {
            return NextResponse.json({ message: "Invalid image format" }, { status: 400 });
        }

        // 3. Perform Update via Service
        const userId = user.id || (user._id ? user._id.toString() : "");
        if (!userId) {
            return NextResponse.json({ message: "User ID missing" }, { status: 400 });
        }

        const updatedUserFull = await UserService.updateUserProfile(
            userId,
            { image: image === null ? "" : image }
        );

        if (!updatedUserFull) {
            return NextResponse.json({ message: "Update failed or user not found" }, { status: 404 });
        }

        // 4. Return Safe Response (Updated State)
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
        console.error("Error updating user image:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
