import clientPromise from "@/lib/mongoDb/mongodb";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { UserService } from "@/services/userService";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 1. Authenticate Request (must be logged in to view profiles)
        const auth = await getAuthenticatedUser();
        if (isAuthError(auth)) {
            return NextResponse.json(
                { message: auth.error },
                { status: auth.status },
            );
        }

        const { id } = await params;

        const safeProfile = await UserService.getPublicProfile(id);

        if (!safeProfile) {
            return NextResponse.json({ message: "User not found" }, { status: 404 });
        }

        return NextResponse.json(safeProfile);

    } catch (error) {
        console.error("Error fetching user profile:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
