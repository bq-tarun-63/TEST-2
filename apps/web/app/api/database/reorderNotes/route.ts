// import { type NextRequest, NextResponse } from "next/server";
// import { DatabaseService } from "@/services/databaseService";
// import { getAuthenticatedUser, isAuthError } from "@/lib/utils/auth";

// export async function POST(req: NextRequest) {
//   try {
//     const auth = await getAuthenticatedUser();
//     if (isAuthError(auth)) {
//       return NextResponse.json({ message: auth.error }, { status: auth.status });
//     }
//     const { user } = auth;

//     // Parse request body
//     const body = await req.json();
//     const { dataSourceId, blockIds } = body;

//     // Validate required fields
//     if (!dataSourceId) {
//       return NextResponse.json({
//         message: "dataSourceId is required"
//       }, { status: 400 });
//     }

//     if (!blockIds || !Array.isArray(blockIds)) {
//       return NextResponse.json({
//         message: "blockIds must be an array"
//       }, { status: 400 });
//     }

//     // Check permissions (optional - uncomment if needed)
//     // const canEdit = await PermissionService.checkAccessForDataSource({
//     //   userId: String(user._id),
//     //   dataSourceId: String(dataSourceId),
//     //   requiredRole: 'editor'
//     // });

//     // if (!canEdit) {
//     //   return NextResponse.json({
//     //     error: "You don't have permission to modify this database"
//     //   }, { status: 403 });
//     // }

//     // Reorder notes
//     try {
//       const result = await DatabaseService.reorderNotes({
//         dataSourceId,
//         blockIds
//       });

//       return NextResponse.json({
//         success: true,
//         dataSource: result.dataSource,
//         updatedAt: result.updatedAt,
//         message: `Successfully reordered ${blockIds.length} notes`
//       }, { status: 200 });

//     } catch (error) {
//       if (error instanceof Error) {
//         if (error.message === "Data source not found") {
//           return NextResponse.json({
//             message: "Data source not found"
//           }, { status: 404 });
//         }
//         if (error.message === "Failed to update note order") {
//           return NextResponse.json({
//             message: "Failed to update note order"
//           }, { status: 500 });
//         }
//       }
//       throw error;
//     }

//   } catch (error) {
//     console.error("Error reordering notes:", error);
//     return NextResponse.json(
//       {
//         success: false,
//         message: "Failed to reorder notes",
//         error: error instanceof Error ? error.message : "Unknown error"
//       },
//       { status: 500 }
//     );
//   }
// }
