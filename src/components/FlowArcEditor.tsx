/**
 * FlowArcEditor Component
 * 
 * Component for editing playlist flow arc sections (warmup, build, peak, cooldown).
 * Provides a visual interface for adding, editing, reordering, and deleting flow
 * arc sections that control how tracks are ordered in the playlist.
 * 
 * Features:
 * - Visual section editor with drag-and-drop reordering
 * - Add/edit/delete flow arc sections
 * - Section position editing (start/end positions 0-1)
 * - Tempo and energy level configuration
 * - Real-time strategy updates
 * 
 * State Management:
 * - Uses `useFlowArcSections` hook for section CRUD operations
 * - Uses `useDragAndDrop` hook for reordering functionality
 * - Manages editing state and form visibility
 * 
 * Flow Arc Sections:
 * - **warmup**: Slow tempo, familiar tracks (0-20% of playlist)
 * - **build**: Gradually increasing tempo (20-60%)
 * - **peak**: Highest energy, fastest tempo (60-80%)
 * - **cooldown**: Gradually decreasing tempo (80-100%)
 * - **transition**: Custom transition sections
 * 
 * Props:
 * - `strategy`: Current playlist strategy containing ordering plan
 * - `onUpdate`: Callback when strategy is updated
 * - `onReorder`: Callback when sections are reordered
 * 
 * @module components/FlowArcEditor
 * 
 * @example
 * ```tsx
 * <FlowArcEditor
 *   strategy={playlistStrategy}
 *   onUpdate={(updated) => setStrategy(updated)}
 *   onReorder={(sections) => updateOrderingPlan(sections)}
 * />
 * ```
 */

"use client";

import {
  GripVertical,
  Plus,
} from "lucide-react";
import type { PlaylistStrategy } from "@/features/playlists";
import { useFlowArcSections, normalizePositions, type EditableSection } from "@/hooks/useFlowArcSections";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { SectionEditor } from "./SectionEditor";
import { AddSectionForm } from "./AddSectionForm";

type SectionArray = PlaylistStrategy['orderingPlan']['sections'];

interface FlowArcEditorProps {
  strategy: PlaylistStrategy;
  onUpdate: (updatedStrategy: PlaylistStrategy) => void;
  onReorder: (reorderedSections: SectionArray) => void;
}

export function FlowArcEditor({ strategy, onUpdate, onReorder }: FlowArcEditorProps) {
  const standardSectionNames = ["warmup", "peak", "cooldown", "transition"] as const;

  // Use hooks for section management and drag-and-drop
  const {
    sections,
    editingIndex,
    isAdding,
    handleEdit,
    handleSave,
    handleCancel,
    handleDelete,
    handleAdd,
    handleAddSection,
    handleCancelAdd,
    moveSection,
    updateSections,
  } = useFlowArcSections({ strategy, onUpdate, onReorder });

  // Handle drag-and-drop reordering
  const {
    draggedIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd: handleDragEndInternal,
  } = useDragAndDrop({
    items: sections,
    onReorder: (reorderedSections) => {
      const normalized = normalizePositions(reorderedSections);
      updateSections(normalized);
      // Convert to SectionArray and notify parent
      const validSections: SectionArray = normalized.map((s) => {
        const validName = standardSectionNames.includes(s.name as any)
          ? (s.name as "warmup" | "peak" | "cooldown" | "transition")
          : "transition";
        return {
          name: validName,
          startPosition: s.startPosition,
          endPosition: s.endPosition,
          tempoTarget: s.tempoTarget,
          energyLevel: s.energyLevel,
        };
      });
      onReorder(validSections);
    },
  });

  const handleDragOverWrapper = (e: React.DragEvent, index: number) => {
    handleDragOver(e, index);
  };

  const handleDragEndWrapper = () => {
    handleDragEndInternal();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-app-primary text-lg font-semibold flex items-center gap-2">
          <GripVertical className="size-5" />
          Flow Arc Editor
        </h3>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary text-white rounded-sm hover:bg-accent-primary/90 transition-colors text-sm"
        >
          <Plus className="size-4" />
          Add Section
        </button>
      </div>

      <div className="space-y-2">
        {sections.map((section, index) => (
          <SectionEditor
            key={`${section.name}-${index}`}
            section={section}
            index={index}
            isEditing={editingIndex === index}
            isDragging={draggedIndex === index}
            standardNames={standardSectionNames}
            onEdit={() => handleEdit(index)}
            onSave={(updated) => handleSave(index, updated)}
            onCancel={handleCancel}
            onDelete={() => handleDelete(index)}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOverWrapper(e, index)}
            onDragEnd={handleDragEndWrapper}
            onMoveUp={() => moveSection(index, "up")}
            onMoveDown={() => moveSection(index, "down")}
            canMoveUp={index > 0}
            canMoveDown={index < sections.length - 1}
          />
        ))}
      </div>

      {isAdding && (
        <AddSectionForm
          standardNames={standardSectionNames}
          existingNames={sections.map((s) => s.name)}
          onSave={handleAddSection}
          onCancel={handleCancelAdd}
        />
      )}

      {/* Visual representation */}
      <div className="mt-6 p-4 bg-app-hover rounded-sm border border-app-border">
        <h4 className="text-app-primary text-sm font-medium mb-3">Flow Arc Preview</h4>
        <div className="relative h-8 bg-app-surface rounded-sm overflow-hidden">
          {sections.map((section, index) => {
            const width = (section.endPosition - section.startPosition) * 100;
            const left = section.startPosition * 100;
            const colors: Record<string, string> = {
              warmup: "bg-blue-500",
              build: "bg-purple-500",
              peak: "bg-red-500",
              cooldown: "bg-green-500",
              transition: "bg-yellow-500",
            };
            const color = colors[section.name] || "bg-gray-500";
            return (
              <div
                key={`preview-${index}`}
                className={`absolute h-full flex items-center justify-center text-xs text-white font-medium ${color}`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                }}
                title={`${section.name} (${(section.startPosition * 100).toFixed(0)}% - ${(section.endPosition * 100).toFixed(0)}%)`}
              >
                {section.name}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

