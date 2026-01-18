import type { ReactNode } from "react";
import { useDragAndDropReorder } from "@/hooks/useDragAndDropReorder";

interface DraggableTrackListProps<T> {
  items: T[];
  getItemId: (item: T, index: number) => string;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, options: { rowProps: React.HTMLAttributes<HTMLDivElement>; isDragging: boolean }) => ReactNode;
}

export function DraggableTrackList<T>({
  items,
  getItemId,
  onReorder,
  renderItem,
}: DraggableTrackListProps<T>) {
  const { draggedIndex, getRowProps } = useDragAndDropReorder({
    items,
    onReorder,
  });

  return (
    <div className="divide-y divide-app-border">
      {items.map((item, index) => {
        const rowProps = getRowProps(index);
        const isDragging = draggedIndex === index;
        return (
          <div key={getItemId(item, index)}>
            {renderItem(item, { rowProps, isDragging })}
          </div>
        );
      })}
    </div>
  );
}

