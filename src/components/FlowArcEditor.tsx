"use client";

import { useState, useCallback } from "react";
import {
  GripVertical,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaylistStrategy } from "@/features/playlists/strategy";

type SectionArray = PlaylistStrategy['orderingPlan']['sections'];

interface FlowArcEditorProps {
  strategy: PlaylistStrategy;
  onUpdate: (updatedStrategy: PlaylistStrategy) => void;
  onReorder: (reorderedSections: SectionArray) => void;
}

type SectionName = "warmup" | "build" | "peak" | "cooldown" | "transition" | string;
type TempoTarget = "slow" | "medium" | "fast";
type EnergyLevel = "low" | "medium" | "high";

interface EditableSection {
  name: SectionName;
  startPosition: number;
  endPosition: number;
  tempoTarget?: TempoTarget;
  energyLevel?: EnergyLevel;
  isCustom?: boolean; // For user-added sections
}

export function FlowArcEditor({ strategy, onUpdate, onReorder }: FlowArcEditorProps) {
  const [sections, setSections] = useState<EditableSection[]>(
    strategy.orderingPlan.sections.map((s) => ({
      ...s,
      isCustom: !["warmup", "peak", "cooldown", "transition"].includes(s.name),
    }))
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const standardSectionNames: SectionName[] = ["warmup", "peak", "cooldown", "transition"];

  const handleUpdate = useCallback(
    (updatedSections: EditableSection[]) => {
      setSections(updatedSections);
      // Normalize positions to ensure they're valid
      const normalized = normalizePositions(updatedSections);
      const strategySections = normalized.map((s) => {
        // Ensure name is one of the valid enum values, or use "transition" as fallback
        const validNames = ["warmup", "peak", "cooldown", "transition"];
        const validName = validNames.includes(s.name)
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

      const updatedStrategy: PlaylistStrategy = {
        ...strategy,
        orderingPlan: {
          ...strategy.orderingPlan,
          sections: strategySections,
        },
      };

      onUpdate(updatedStrategy);
    },
    [strategy, onUpdate]
  );

  const normalizePositions = (sections: EditableSection[]): EditableSection[] => {
    // Ensure positions are valid and don't overlap
    const sorted = [...sections].sort((a, b) => a.startPosition - b.startPosition);
    const normalized: EditableSection[] = [];
    let currentPos = 0;

    for (let i = 0; i < sorted.length; i++) {
      const section = sorted[i];
      const nextSection = sorted[i + 1];

      // Ensure start position is at least current position
      const startPos = Math.max(currentPos, Math.min(section.startPosition, 1));
      
      // Calculate end position
      let endPos: number;
      if (nextSection) {
        // End before next section starts
        endPos = Math.min(section.endPosition, nextSection.startPosition);
      } else {
        // Last section ends at 1.0
        endPos = Math.min(section.endPosition, 1);
      }

      // Ensure end is after start
      if (endPos <= startPos) {
        endPos = Math.min(startPos + 0.1, 1);
      }

      normalized.push({
        ...section,
        startPosition: startPos,
        endPosition: endPos,
      });

      currentPos = endPos;
    }

    return normalized;
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
  };

  const handleSave = (index: number, updated: EditableSection) => {
    const updatedSections = [...sections];
    updatedSections[index] = updated;
    handleUpdate(updatedSections);
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    if (sections.length <= 1) {
      alert("Cannot delete the last section");
      return;
    }
    const updatedSections = sections.filter((_, i) => i !== index);
    handleUpdate(normalizePositions(updatedSections));
  };

  const handleAdd = () => {
    setIsAdding(true);
  };

  const handleAddSection = (newSection: EditableSection) => {
    const updatedSections = [...sections, newSection];
    handleUpdate(normalizePositions(updatedSections));
    setIsAdding(false);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSections = [...sections];
    const dragged = newSections[draggedIndex];
    newSections.splice(draggedIndex, 1);
    newSections.splice(index, 0, dragged);
    setSections(newSections);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null) {
      const normalized = normalizePositions(sections);
      handleUpdate(normalized);
      // Convert to SectionArray type (only valid enum names)
      const validSections: SectionArray = normalized.map((s) => {
        const validName = ["warmup", "peak", "cooldown", "transition"].includes(s.name)
          ? (s.name as "warmup" | "peak" | "cooldown" | "transition")
          : "transition"; // Fallback to transition for custom names
        return {
          name: validName,
          startPosition: s.startPosition,
          endPosition: s.endPosition,
          tempoTarget: s.tempoTarget,
          energyLevel: s.energyLevel,
        };
      });
      onReorder(validSections);
    }
    setDraggedIndex(null);
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === sections.length - 1)
    ) {
      return;
    }

    const newSections = [...sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newSections[index], newSections[targetIndex]] = [
      newSections[targetIndex],
      newSections[index],
    ];
    const normalized = normalizePositions(newSections);
    handleUpdate(normalized);
    // Convert to SectionArray type (only valid enum names)
    const validSections: SectionArray = normalized.map((s) => {
      const validName = ["warmup", "peak", "cooldown", "transition"].includes(s.name)
        ? (s.name as "warmup" | "peak" | "cooldown" | "transition")
        : "transition"; // Fallback to transition for custom names
      return {
        name: validName,
        startPosition: s.startPosition,
        endPosition: s.endPosition,
        tempoTarget: s.tempoTarget,
        energyLevel: s.energyLevel,
      };
    });
    onReorder(validSections);
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
            onCancel={() => setEditingIndex(null)}
            onDelete={() => handleDelete(index)}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
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
          onCancel={() => setIsAdding(false)}
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
                className={cn("absolute h-full flex items-center justify-center text-xs text-white font-medium", color)}
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

interface SectionEditorProps {
  section: EditableSection;
  index: number;
  isEditing: boolean;
  isDragging: boolean;
  standardNames: SectionName[];
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

function SectionEditor({
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

interface AddSectionFormProps {
  standardNames: SectionName[];
  existingNames: SectionName[];
  onSave: (section: EditableSection) => void;
  onCancel: () => void;
}

function AddSectionForm({
  standardNames,
  existingNames,
  onSave,
  onCancel,
}: AddSectionFormProps) {
  const [name, setName] = useState<SectionName>("");
  const [startPosition, setStartPosition] = useState<number>(0);
  const [endPosition, setEndPosition] = useState<number>(0.2);
  const [tempoTarget, setTempoTarget] = useState<TempoTarget | undefined>();
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | undefined>();
  const [isCustom, setIsCustom] = useState(false);

  const handleSave = () => {
    if (!name.trim()) {
      alert("Please enter a section name");
      return;
    }
    onSave({
      name: name.trim(),
      startPosition,
      endPosition,
      tempoTarget,
      energyLevel,
      isCustom: !standardNames.includes(name.trim()),
    });
  };

  return (
    <div className="p-4 bg-app-surface border border-accent-primary rounded-sm space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-app-primary font-medium">Add New Section</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
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
            value={isCustom ? "" : name}
            onChange={(e) => {
              if (e.target.value) {
                setName(e.target.value);
                setIsCustom(false);
              } else {
                setIsCustom(true);
              }
            }}
            className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
          >
            <option value="">Custom...</option>
            {standardNames
              .filter((n) => !existingNames.includes(n))
              .map((n) => (
                <option key={n} value={n}>
                  {n.charAt(0).toUpperCase() + n.slice(1)}
                </option>
              ))}
          </select>
          {isCustom && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
            value={Math.round(startPosition * 100)}
            onChange={(e) => setStartPosition(parseInt(e.target.value) / 100)}
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
            value={Math.round(endPosition * 100)}
            onChange={(e) => setEndPosition(parseInt(e.target.value) / 100)}
            className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
          />
        </div>

        <div>
          <label className="block text-app-secondary text-xs mb-1">Tempo Target</label>
          <select
            value={tempoTarget || ""}
            onChange={(e) =>
              setTempoTarget(e.target.value ? (e.target.value as TempoTarget) : undefined)
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
            value={energyLevel || ""}
            onChange={(e) =>
              setEnergyLevel(e.target.value ? (e.target.value as EnergyLevel) : undefined)
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

