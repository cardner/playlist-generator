/**
 * useDragAndDrop Hook
 * 
 * Manages drag-and-drop state and operations for reorderable lists.
 * Provides handlers for drag start, drag over, and drag end events.
 * 
 * @example
 * ```tsx
 * const {
 *   draggedIndex,
 *   handleDragStart,
 *   handleDragOver,
 *   handleDragEnd,
 * } = useDragAndDrop({
 *   items,
 *   onReorder,
 * });
 * ```
 */

import { useState, useCallback } from "react";

export interface UseDragAndDropOptions<T> {
  /** Array of items being reordered */
  items: T[];
  /** Callback when items are reordered */
  onReorder: (reorderedItems: T[]) => void;
}

export interface UseDragAndDropReturn {
  /** Index of item currently being dragged (null if none) */
  draggedIndex: number | null;
  /** Start dragging an item */
  handleDragStart: (index: number) => void;
  /** Handle drag over event */
  handleDragOver: (e: React.DragEvent, index: number) => void;
  /** End dragging and apply reorder */
  handleDragEnd: () => void;
}

/**
 * Hook for managing drag-and-drop operations
 */
export function useDragAndDrop<T>(
  options: UseDragAndDropOptions<T>
): UseDragAndDropReturn {
  const { items, onReorder } = options;

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [currentItems, setCurrentItems] = useState<T[]>(items);

  /**
   * Start dragging an item
   */
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
    setCurrentItems(items);
  }, [items]);

  /**
   * Handle drag over event - reorder items as user drags
   */
  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;

      const newItems = [...currentItems];
      const dragged = newItems[draggedIndex];
      newItems.splice(draggedIndex, 1);
      newItems.splice(index, 0, dragged);
      setCurrentItems(newItems);
      setDraggedIndex(index);
    },
    [draggedIndex, currentItems]
  );

  /**
   * End dragging and apply reorder
   */
  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null) {
      onReorder(currentItems);
    }
    setDraggedIndex(null);
  }, [draggedIndex, currentItems, onReorder]);

  return {
    draggedIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}

