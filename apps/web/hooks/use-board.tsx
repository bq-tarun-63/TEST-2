import { useCallback } from 'react';
import { JSONContent } from 'novel';
import { NoteResponse } from '@/types/advance-editor';
import { fetchNote } from '@/services-frontend/note/notesService';
import { defaultEditorContent } from '@/lib/content';
import { useBoard } from '@/contexts/boardContext';
import { Block } from '@/types/block';
import { useGlobalBlocks } from '@/contexts/blockContext';
import { reconstructDocumentFromBlocks } from "@/utils/blockParser";

interface UseBoardFunctionsProps {
  board: Block;
  setSelectedTask: React.Dispatch<React.SetStateAction<Block | null>>;
  setRightSidebarContent: React.Dispatch<React.SetStateAction<JSONContent | null>>;
  setIsClosing: React.Dispatch<React.SetStateAction<boolean>>;
  previousCardIdRef: React.MutableRefObject<string | null>;
}

const useBoardFunctions = ({
  board,
  setSelectedTask,
  setRightSidebarContent,
  setIsClosing,
  previousCardIdRef,
}: UseBoardFunctionsProps) => {
  const { setCurrentBoardNoteId} = useBoard();
  const { upsertBlocks, getBlock, blocks }  = useGlobalBlocks();

  const handleCardClick = useCallback(async (card: Block) => {
    const currentEditorKey = card._id;
    const prevId = previousCardIdRef.current;
    console.log("Click on the note ", card, currentEditorKey, prevId, previousCardIdRef);

    previousCardIdRef.current = currentEditorKey;

    // if (prevId) {
      // const localTime = JSON.parse(window.localStorage.getItem(`offline_content_time-${prevId}`) ?? "null");
      // const serverTime = JSON.parse(window.localStorage.getItem(`last_content_update_time-${prevId}`) ?? "null");

      // if (localTime && serverTime && localTime !== serverTime) {
      //   try {
      //     const json = JSON.parse(window.localStorage.getItem(`novel-content-${prevId}`) ?? "null");
      //     const response = await saveContentOnline({ editorKey: prevId, content: json });
      //   } catch (err) {
      //     console.error("Error saving local content online:", err);
      //   }
      // }
    // }

    // 👉 Open sidebar instantly
    setSelectedTask(card);
    setRightSidebarContent(null); // clear old content

    // 👉 Background fetch content
    fetch(`/api/note/block/get-all-block/${card._id}`)
      .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch");
          return res.json();
      })
      .then((noteResponse) => {
          // if (data.blocks && Array.isArray(data.blocks)) {
          //     upsertBlocks(data.blocks);
          // }
          if (noteResponse.blocks && Array.isArray(noteResponse.blocks)) {
            upsertBlocks(noteResponse.blocks).then(() => {
            const parentBlock = getBlock(card._id);
            if (parentBlock && parentBlock.blockIds) {
              try {
                // so the parser can find them immediately.
                const freshMap = new Map(blocks);
                noteResponse.blocks.forEach((b) => freshMap.set(b._id, b));

                const reconstructedDoc = reconstructDocumentFromBlocks(card._id, freshMap);
                console.log('............[AdvancedEditor] Reconstructed document from blocks:', reconstructedDoc);
                
                if (reconstructedDoc && reconstructedDoc.type === 'doc') {
                  setRightSidebarContent(reconstructedDoc);
                  // prevContentRef.current = reconstructedDoc;
                  
                  // Cache the reconstructed content
                  // window.localStorage.setItem(`novel-content-${editorKey}`, JSON.stringify(reconstructedDoc));
                  // window.localStorage.setItem(
                  //   `last_content_update_time-${editorKey}`,
                  //   JSON.stringify(noteResponse.updatedAt),
                  // );
                  // window.localStorage.setItem(`content-loaded-${editorKey}`, "true");
                } else {
                  console.warn('................[AdvancedEditor] Invalid reconstructed document, using default');
                  setRightSidebarContent(defaultEditorContent);
                }
              } catch (error) {
                console.error('................[AdvancedEditor] Error reconstructing document from blocks:', error);
                setRightSidebarContent(defaultEditorContent);
              }
              } else {
                console.warn('[AdvancedEditor] Parent block not found');
                setRightSidebarContent(defaultEditorContent);
          }
        });
        }
      })
      .catch((err) => {
          console.error("Error fetching children for node", card._id, err);
      })
    // fetchNote(card._id)
    //   .then((response) => {
    //     const res = response as NoteResponse;
    //     if ("isError" in res && res.isError) {
    //       console.error("Error fetching note:", res.error);
    //       return;
    //     }

    //     const content = res.content;
    //     const parsedContent = typeof content === "string"  && content !== "" ? JSON.parse(content) : defaultEditorContent;
    //     const onlineContent = parsedContent?.online_content ?? parsedContent;

    //     setRightSidebarContent(onlineContent);
    //   })
    //   .catch((err) => {
    //     console.error("Failed to load card:", err);
    //   });
      
  }, [previousCardIdRef, setRightSidebarContent, setSelectedTask, blocks, getBlock, upsertBlocks]);

  const handleCloseSidebar = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setSelectedTask(null);
      setCurrentBoardNoteId(null)
      setIsClosing(false);
    }, 300);
  }, [setIsClosing, setSelectedTask]);


  return {
    handleCardClick,
    handleCloseSidebar,
  };
};

export default useBoardFunctions;