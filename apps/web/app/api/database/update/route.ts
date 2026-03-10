import { DatabaseService } from "@/services/databaseService";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";
import { PermissionService } from "@/services/PermissionService";

export async function POST(req: NextRequest) {
    const auth = await getAuthenticatedUser();
    if (isAuthError(auth)) {
        return NextResponse.json({ message: auth.error }, { status: auth.status });
    }
    const { user } = auth;

    try {
        const body = await req.json();
        const { blockId, dataSourceId, icon, title, isSprintOn, pairedDataSourceId, lastSprintId } = body;

        if (!blockId) {
            return NextResponse.json(
                { message: "blockId is required" },
                { status: 400 },
            );
        }
        if (!dataSourceId) {
            return NextResponse.json(
                { message: "dataSourceId is required" },
                { status: 400 },
            );
        }

        // Check permissions - user must have editor access to update database source
        const canEdit = await PermissionService.checkAccessForDataSource({
            userId: String(user._id),
            blockId: String(blockId),
            dataSourceId: String(dataSourceId),
            requiredRole: 'editor'
        });

        if (!canEdit) {
            return NextResponse.json({
                error: "You don't have permission to modify this database"
            }, { status: 403 });
        }

        const result = await DatabaseService.updateDatabaseSourceDetails({
            dataSourceId,
            icon,
            title,
            isSprintOn,
            pairedDataSourceId,
            lastSprintId,
            userId: String(user._id),
            userEmail: user.email || "",
            userName: user.name || "Unknown",
        });

        return NextResponse.json(
            {
                message: "Database source updated successfully",
                dataSource: result.dataSource,
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("Error updating database source:", error);
        return NextResponse.json({
            message: "Failed to update database source",
            error: error instanceof Error ? error.message : "Unknown error",
        }, { status: 500 }
        );
    }
}
