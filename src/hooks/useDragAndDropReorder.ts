import { useCallback, useState } from "react";

interface DragAndDropOptions<T> {
  items: T[];
  onReorder: (items: T[]) => void;
}

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function useDragAndDropReorder<T>({ items, onReorder }: DragAndDropOptions<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (index: number) => (event: React.DragEvent) => {
      setDraggedIndex(index);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    },
    []
  );

  const handleDragOver = useCallback(
    (index: number) => (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (draggedIndex === null || draggedIndex === index) {
        return;
      }
    },
    [draggedIndex]
  );

  const handleDrop = useCallback(
    (index: number) => (event: React.DragEvent) => {
      event.preventDefault();
      if (draggedIndex === null || draggedIndex === index) {
        setDraggedIndex(null);
        return;
      }
      const reordered = reorderItems(items, draggedIndex, index);
      onReorder(reordered);
      setDraggedIndex(null);
    },
    [draggedIndex, items, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  const getRowProps = useCallback(
    (index: number) => ({
      draggable: true,
      onDragStart: handleDragStart(index),
      onDragOver: handleDragOver(index),
      onDrop: handleDrop(index),
      onDragEnd: handleDragEnd,
    }),
    [handleDragEnd, handleDragOver, handleDragStart, handleDrop]
  );

  return {
    draggedIndex,
    getRowProps,
  };
}

