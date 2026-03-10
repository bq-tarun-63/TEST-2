// hooks/useCommentMentions.ts
import { useWorkspaceContext } from "@/contexts/workspaceContext";
import { postWithAuth } from "@/lib/api-helpers";
import { Comment } from "@/types/board";
import { CommentUI } from "@/types/comment";

export function useCommentMentions() {
  const { currentWorkspace } = useWorkspaceContext();

  async function sendMentionNotifications(workspaceId: string, comment: CommentUI, noteId: string, noteTitle: string) {


    // Support both @[Name](ID) and @Name formats
    const mentionMatches = [...comment.text.matchAll(/@\[([^\]]+)\]\(([^)]+)\)|@(\w+)/g)];

    const mentionIds = mentionMatches.map(m => m[2]).filter(Boolean) as string[];
    const mentionNames = mentionMatches.map(m => m[1] || m[3]).filter(Boolean) as string[];

    console.log("Printing the mention person ++ ", { mentionIds, mentionNames }, comment);
    if (mentionIds.length === 0 && mentionNames.length === 0) return null;

    // Find userIds and emails from workspace members
    if (!currentWorkspace?.members) return null;


    const sentTo = currentWorkspace.members
      .filter(member => {
        // Match by ID if we have it
        if (mentionIds.includes(member.userId)) return true;

        // Fallback to matching by name
        return mentionNames.some(name =>
          member.userName.toLowerCase().split(" ").includes(name.toLowerCase())
        );
      })
      .map(member => ({ userId: member.userId, userEmail: member.userEmail, userName: member.userName }));

    console.log("Printing the sentTo ++ ", sentTo);
    if (sentTo.length === 0) return null;

    const type = "MENTION"
    try {
      const response = await postWithAuth("/api/notification/add", {
        workspaceId,
        noteId,
        noteTitle,
        type,
        sentTo
      });

      if (!response.success) {
        throw new Error("Failed to send mention notifications in DB");
      }

      return response.notification;

    } catch (err) {
      console.error("Failed to send mention notifications:", err);
    }
    return null;
  }

  return { sendMentionNotifications };
}
