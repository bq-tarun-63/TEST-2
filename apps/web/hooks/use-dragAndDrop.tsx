import { useState } from "react";

export function useDragAndDrop<T>(items: T[], setItems: (items: T[]) => void) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

  const handleDragStart = (id: string) => {
    setDraggedItemId(id);
  };

  const handleDragOver = (id: string) => {
    if (draggedItemId === null || draggedItemId === id) return;
    setDragOverItemId(id);
  };

  const handleDrop = (id: string) => {
    if (draggedItemId === null || draggedItemId === id) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    const draggedIndex = items.findIndex((i: any) => i.id === draggedItemId);
    const targetIndex = items.findIndex((i: any) => i.id === id);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    const reordered = [...items];
    const [removed] = reordered.splice(draggedIndex, 1);
    if (!removed) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }
    reordered.splice(targetIndex, 0, removed);

    setItems(reordered);
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  return {
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    draggedItemId,
    dragOverItemId,
  };
}
