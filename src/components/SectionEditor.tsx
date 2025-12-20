/**
 * SectionEditor Component
 * 
 * Displays and allows editing of a single flow arc section within FlowArcEditor.
 * Supports inline editing, drag-and-drop reordering, and deletion. Used as a
 * child component of FlowArcEditor to render individual sections.
 * 
 * Features:
 * - Display mode: Shows section name, position, tempo, energy level
 * - Edit mode: Inline form for editing all section properties
 * - Drag handle for reordering
 * - Move up/down buttons
 * - Delete button
 * - Save/cancel actions
 * 
 * Props:
 * - `section`: The section to display/edit
 * - `index`: Section index in the list
 * - `isEditing`: Whether this section is in edit mode
 * - `isDragging`: Whether this section is being dragged
 * - `standardNames`: Array of standard section names
 * - `onEdit`: Callback to enter edit mode
 * - `onSave`: Callback to save edited section
 * - `onCancel`: Callback to cancel editing
 * - `onDelete`: Callback to delete section
 * - `onDragStart`, `onDragOver`, `onDragEnd`: Drag-and-drop callbacks
 * - `onMoveUp`, `onMoveDown`: Move section callbacks
 * - `canMoveUp`, `canMoveDown`: Whether move actions are available
 * 
 * @module components/SectionEditor
 * 
 * @example
 * ```tsx
 * <SectionEditor
 *   section={section}
 *   index={0}
 *   isEditing={editingIndex === 0}
 *   onEdit={() => setEditingIndex(0)}
 *   onSave={(updated) => updateSection(0, updated)}
 *   onCancel={() => setEditingIndex(null)}
 *   onDelete={() => deleteSection(0)}
 *   {...dragHandlers}
 * />
 * ```
 */

"use client";

import { useState } from "react";
import {
  GripVertical,
  Trash2,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditableSection, SectionName, TempoTarget, EnergyLevel } from "@/hooks/useFlowArcSections";

export interface SectionEditorProps {
  section: EditableSection;
  index: number;
  isEditing: boolean;
  isDragging: boolean;
  standardNames: readonly SectionName[];
  onEdit: () => void;
  onSave: (updated: EditableSection) => void;
  onCancel: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function SectionEditor({
  section,
  index,
  isEditing,
  isDragging,
  standardNames,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: SectionEditorProps) {
  const [edited, setEdited] = useState<EditableSection>(section);

  if (isEditing) {
    return (
      <div className="p-4 bg-app-surface border border-accent-primary rounded-sm space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-app-primary font-medium">Edit Section</h4>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSave(edited)}
              className="p-1.5 text-green-500 hover:bg-app-hover rounded-sm transition-colors"
            >
              <Save className="size-4" />
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 text-red-500 hover:bg-app-hover rounded-sm transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-app-secondary text-xs mb-1">Name</label>
            <select
              value={edited.name}
              onChange={(e) => setEdited({ ...edited, name: e.target.value })}
              className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            >
              {standardNames.map((name) => (
                <option key={name} value={name}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </option>
              ))}
              {!standardNames.includes(edited.name) && (
                <option value={edited.name}>{edited.name}</option>
              )}
            </select>
            {!standardNames.includes(edited.name) && (
              <input
                type="text"
                value={edited.name}
                onChange={(e) => setEdited({ ...edited, name: e.target.value })}
                placeholder="Custom section name"
                className="w-full mt-2 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
              />
            )}
          </div>

          <div>
            <label className="block text-app-secondary text-xs mb-1">Start Position (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={Math.round(edited.startPosition * 100)}
              onChange={(e) =>
                setEdited({
                  ...edited,
                  startPosition: parseInt(e.target.value) / 100,
                })
              }
              className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            />
          </div>

          <div>
            <label className="block text-app-secondary text-xs mb-1">End Position (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={Math.round(edited.endPosition * 100)}
              onChange={(e) =>
                setEdited({
                  ...edited,
                  endPosition: parseInt(e.target.value) / 100,
                })
              }
              className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            />
          </div>

          <div>
            <label className="block text-app-secondary text-xs mb-1">Tempo Target</label>
            <select
              value={edited.tempoTarget || ""}
              onChange={(e) =>
                setEdited({
                  ...edited,
                  tempoTarget: e.target.value ? (e.target.value as TempoTarget) : undefined,
                })
              }
              className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            >
              <option value="">None</option>
              <option value="slow">Slow</option>
              <option value="medium">Medium</option>
              <option value="fast">Fast</option>
            </select>
          </div>

          <div>
            <label className="block text-app-secondary text-xs mb-1">Energy Level</label>
            <select
              value={edited.energyLevel || ""}
              onChange={(e) =>
                setEdited({
                  ...edited,
                  energyLevel: e.target.value ? (e.target.value as EnergyLevel) : undefined,
                })
              }
              className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            >
              <option value="">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={cn(
        "p-3 bg-app-surface border border-app-border rounded-sm flex items-center gap-3",
        isDragging && "opacity-50"
      )}
    >
      <GripVertical className="size-5 text-app-tertiary cursor-move" />
      <div className="flex-1 grid grid-cols-5 gap-2 items-center">
        <div className="text-app-primary font-medium">{section.name}</div>
        <div className="text-app-secondary text-sm">
          {(section.startPosition * 100).toFixed(0)}% - {(section.endPosition * 100).toFixed(0)}%
        </div>
        <div className="text-app-tertiary text-sm">
          {section.tempoTarget || "—"}
        </div>
        <div className="text-app-tertiary text-sm">
          {section.energyLevel || "—"}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="p-1 text-app-tertiary hover:text-app-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="p-1 text-app-tertiary hover:text-app-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 text-app-tertiary hover:text-app-primary transition-colors"
        >
          <Edit2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 text-app-tertiary hover:text-red-500 transition-colors"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

