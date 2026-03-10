import { postWithAuth } from "@/lib/api-helpers";
import { Block } from "@/types/block";
import { Comment } from "@/types/comment";

/**
 * Fetches all comments (page-level and inline) associated with a note and its blocks.
 * @param noteBlock The root note block.
 * @param childBlocks The array of child blocks within the note.
 * @returns A promise that resolves to an array of comments.
 */
export const fetchAllCommentsForNote = async (
    noteBlock: Block | undefined,
    childBlocks: Block[]
): Promise<Comment[]> => {
    const allCommentIds = new Set<string>();

    // 1. Check the root note block itself (page comments)
    if (noteBlock?.comments && Array.isArray(noteBlock.comments)) {
        noteBlock.comments.forEach(id => {
            if (id) allCommentIds.add(id);
        });
    }

    // 2. Traversal on each child block for this page
    childBlocks.forEach((block: any) => {
        if (block.comments && Array.isArray(block.comments)) {
            block.comments.forEach((id: string) => {
                if (id) allCommentIds.add(id);
            });
        }
    });

    const commentIdsArray = Array.from(allCommentIds);

    if (commentIdsArray.length === 0) {
        return [];
    }

    try {
        const res: any = await postWithAuth("/api/comments/getAll/by-commentIds", { commentIds: commentIdsArray });
        return res?.comments || [];
    } catch (err) {
        console.error("Error fetching batch comments:", err);
        return [];
    }
};
