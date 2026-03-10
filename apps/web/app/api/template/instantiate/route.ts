import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/authOptions";
import { TemplateService } from "@/services/templateService";
import { IUser } from "@/models/types/User";
import { UserService } from "@/services/userService";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { templateBlockId, workspaceId, targetType } = body;

        if (!templateBlockId || !workspaceId) {
            return NextResponse.json(
                { error: "Missing required fields: templateBlockId, workspaceId" },
                { status: 400 }
            );
        }
        if (!session.user.email) {
            return NextResponse.json({ error: "User email not found" }, { status: 404 });
        }
        const user = await UserService.findUserByEmail({ email: session.user.email });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const newBlock = await TemplateService.instantiateTemplate(
            templateBlockId,
            user,
            workspaceId,
            targetType
        );

        return NextResponse.json({
            success: true,
            newBlockId: String(newBlock._id),
            newBlock
        });

    } catch (error: any) {
        console.error("[API] Template Instantiation Failed:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
