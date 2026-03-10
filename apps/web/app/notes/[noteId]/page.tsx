"use client";

import TailwindAdvancedEditor from "@/components/tailwind/advanced-editor";
import { useShare } from "@/contexts/ShareContext";
import { useParams, useSearchParams } from "next/navigation";
import { useGlobalBlocks } from "@/contexts/blockContext";
import BoardBlock from "@/components/tailwind/selectors/boardBlock";

interface EditorWrapperProps {
  noteId: string;
  isPreview?: boolean;
}

function EditorWrapper({ noteId, isPreview }: EditorWrapperProps) {
  const { shareNoteId } = useShare();
  const { getBlock } = useGlobalBlocks();
  const searchParams = useSearchParams();
  const viewId = searchParams.get("v");

  // Use viewId from query params if available, otherwise fallback to noteId
  const blockIdToRender = viewId || noteId;
  const block = getBlock(blockIdToRender);

  // If the block is a collection_view, render BoardBlock instead of the editor
  if (block?.blockType === "collection_view") {
    // Construct a mock node object to satisfy BoardBlock's props
    const mockNode = {
      attrs: {
        blockId: blockIdToRender
      }
    } as any;

    return (
      <div className="h-full w-full overflow-hidden px-20 bg-background">
        <BoardBlock
          node={mockNode}
          updateAttributes={() => { }}
          extension={{} as any}
          getPos={() => 0}
          editor={{} as any}
          deleteNode={() => { }}
          selected={false}
          decorations={[]}
          innerDecorations={[]}
          view={{} as any}
          HTMLAttributes={{}}
        />
        </div>
    );
  }

  return <TailwindAdvancedEditor editorKey={noteId} shareNoteId={shareNoteId} isPreview={isPreview} />;
}

export default function NotePage() {
  const params = useParams();
  const searchParams = useSearchParams();

  if (!params || !params.noteId) {
    return <div>Loading...</div>;
  }

  const noteId = params.noteId as string;
  const isPreview = searchParams.get("preview") === "true";

  return <EditorWrapper noteId={noteId} isPreview={isPreview} />;
}
