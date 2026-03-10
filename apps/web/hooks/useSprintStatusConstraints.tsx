import { useCallback } from "react";
import { useBoard } from "@/contexts/boardContext";

export function useSprintStatusConstraints(boardId?: string) {
  const { getCurrentDataSource, getNotesByDataSourceId } = useBoard();

  const getDisabledStatusOptionIds = useCallback(
    (propertyId: string, currentNoteId: string, options: any[]) => {
      if (!boardId) return [];

      const dataSource = getCurrentDataSource(boardId);
      if (!dataSource || !dataSource.isSprint) return [];

      // Only apply constraints if this specific property is marked as a special sprint property
      const property = dataSource.properties?.[propertyId];
      if (!property?.specialProperty) {
        return [];
      }

      const notes = getNotesByDataSourceId(dataSource._id);

      let hasCurrent = false;
      let hasNext = false;
      let hasLast = false;

      const currentOption = options.find(opt => opt.name.toLowerCase() === "current");
      const nextOption = options.find(opt => opt.name.toLowerCase() === "next");
      const lastOption = options.find(opt => opt.name.toLowerCase() === "last");

      if (!currentOption && !nextOption && !lastOption) return [];

      for (const note of notes) {
        // Skip the current note being edited
        if (note._id === currentNoteId) continue;

        const rawNoteStatus = note.value?.databaseProperties?.[propertyId];
        let noteStatus = rawNoteStatus;
        if (Array.isArray(rawNoteStatus)) {
          noteStatus = rawNoteStatus[0];
        }

        if (noteStatus) {
          if (currentOption && String(noteStatus) === String(currentOption.id)) {
            hasCurrent = true;
          }
          if (nextOption && String(noteStatus) === String(nextOption.id)) {
            hasNext = true;
          }
          if (lastOption && String(noteStatus) === String(lastOption.id)) {
            hasLast = true;
          }
        }
      }

      const disabledOptions: string[] = [];
      if (hasCurrent && currentOption) disabledOptions.push(String(currentOption.id));
      if (hasNext && nextOption) disabledOptions.push(String(nextOption.id));
      if (hasLast && lastOption) disabledOptions.push(String(lastOption.id));

      if (process.env.NODE_ENV === "development") {
        console.log("[SprintStatusConstraints]", { boardId, propertyId, currentNoteId, disabledOptions, hasCurrent, hasNext, hasLast });
      }

      return disabledOptions;
    },
    [boardId, getCurrentDataSource, getNotesByDataSourceId]
  );

  return { getDisabledStatusOptionIds };
}
