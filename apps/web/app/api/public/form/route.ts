import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/services/databaseService";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const blockId = searchParams.get("blockId");
    const viewId = searchParams.get("viewId");

    if (!blockId || !viewId) {
        return NextResponse.json({ message: "blockId and viewId are required" }, { status: 400 });
    }

    // Authenticate user (optional)
    let userId: string | undefined;
    try {
        const auth = await getAuthenticatedUser();
        if (!isAuthError(auth)) {
            userId = auth.user.id || (auth.user._id ? auth.user._id.toString() : undefined);
        }
    } catch (e) {
        // Ignore auth errors, allow anonymous access for public forms
        console.log("Auth check failed in public form route (ignoring):", e);
    }
    try {
        const result = await DatabaseService.getPublicFormView({ blockId, viewId, userId });
        return NextResponse.json(result);

    } catch (error: any) {
        console.error("Get public form error:", error);

        // Handle known errors (simplified based on error message)
        const errorMessage = error.message || "Internal server error";
        let status = 500;

        if (errorMessage === "Block not found" || errorMessage === "View not found" || errorMessage === "DataSource not found" || errorMessage === "No views found") {
            status = 404;
        } else if (errorMessage === "Invalid block type" || errorMessage === "blockId and viewId are required") {
            status = 400;
        } else if (errorMessage === "Form is not public" || errorMessage === "Form is workspace-only, login required" || errorMessage === "Unauthorized access to workspace form") {
            status = 403;
        }

        return NextResponse.json({ message: errorMessage }, { status });
    }
}
