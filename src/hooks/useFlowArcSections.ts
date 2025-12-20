/**
 * useFlowArcSections Hook
 * 
 * Manages flow arc section state, editing, and operations for playlist strategy.
 * Handles section CRUD operations, position normalization, and strategy updates.
 * 
 * @example
 * ```tsx
 * const {
 *   sections,
 *   editingIndex,
 *   isAdding,
 *   handleEdit,
 *   handleSave,
 *   handleDelete,
 *   handleAdd,
 *   handleAddSection,
 *   moveSection,
 *   updateSections,
 * } = useFlowArcSections({
 *   strategy,
 *   onUpdate,
 *   onReorder,
 * });
 * ```
 */

import { useState, useCallback } from "react";
import type { PlaylistStrategy } from "@/features/playlists/strategy";

export type SectionName = "warmup" | "build" | "peak" | "cooldown" | "transition" | string;
export type TempoTarget = "slow" | "medium" | "fast";
export type EnergyLevel = "low" | "medium" | "high";

export interface EditableSection {
  name: SectionName;
  startPosition: number;
  endPosition: number;
  tempoTarget?: TempoTarget;
  energyLevel?: EnergyLevel;
  isCustom?: boolean; // For user-added sections
}

export interface UseFlowArcSectionsOptions {
  /** The playlist strategy containing sections */
  strategy: PlaylistStrategy;
  /** Callback when strategy is updated */
  onUpdate: (updatedStrategy: PlaylistStrategy) => void;
  /** Callback when sections are reordered */
  onReorder: (reorderedSections: PlaylistStrategy['orderingPlan']['sections']) => void;
}

export interface UseFlowArcSectionsReturn {
  /** Current sections */
  sections: EditableSection[];
  /** Index of section currently being edited (null if none) */
  editingIndex: number | null;
  /** Whether the add section form is visible */
  isAdding: boolean;
  /** Start editing a section */
  handleEdit: (index: number) => void;
  /** Save edited section */
  handleSave: (index: number, updated: EditableSection) => void;
  /** Cancel editing */
  handleCancel: () => void;
  /** Delete a section */
  handleDelete: (index: number) => void;
  /** Show add section form */
  handleAdd: () => void;
  /** Add a new section */
  handleAddSection: (newSection: EditableSection) => void;
  /** Cancel adding section */
  handleCancelAdd: () => void;
  /** Move a section up or down */
  moveSection: (index: number, direction: "up" | "down") => void;
  /** Update sections directly */
  updateSections: (updatedSections: EditableSection[]) => void;
}

/**
 * Normalize section positions to ensure they're valid and don't overlap
 */
export function normalizePositions(sections: EditableSection[]): EditableSection[] {
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
}

/**
 * Convert editable sections to strategy sections (only valid enum names)
 */
function convertToStrategySections(
  sections: EditableSection[]
): PlaylistStrategy['orderingPlan']['sections'] {
  const validNames = ["warmup", "peak", "cooldown", "transition"];
  return sections.map((s) => {
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
}

/**
 * Hook for managing flow arc sections
 */
export function useFlowArcSections(
  options: UseFlowArcSectionsOptions
): UseFlowArcSectionsReturn {
  const { strategy, onUpdate, onReorder } = options;

  const [sections, setSections] = useState<EditableSection[]>(
    strategy.orderingPlan.sections.map((s) => ({
      ...s,
      isCustom: !["warmup", "peak", "cooldown", "transition"].includes(s.name),
    }))
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  /**
   * Update sections and notify parent
   */
  const updateSections = useCallback(
    (updatedSections: EditableSection[]) => {
      setSections(updatedSections);
      // Normalize positions to ensure they're valid
      const normalized = normalizePositions(updatedSections);
      const strategySections = convertToStrategySections(normalized);

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

  /**
   * Start editing a section
   */
  const handleEdit = useCallback((index: number) => {
    setEditingIndex(index);
  }, []);

  /**
   * Save edited section
   */
  const handleSave = useCallback(
    (index: number, updated: EditableSection) => {
      const updatedSections = [...sections];
      updatedSections[index] = updated;
      updateSections(updatedSections);
      setEditingIndex(null);
    },
    [sections, updateSections]
  );

  /**
   * Cancel editing
   */
  const handleCancel = useCallback(() => {
    setEditingIndex(null);
  }, []);

  /**
   * Delete a section
   */
  const handleDelete = useCallback(
    (index: number) => {
      if (sections.length <= 1) {
        alert("Cannot delete the last section");
        return;
      }
      const updatedSections = sections.filter((_, i) => i !== index);
      updateSections(normalizePositions(updatedSections));
    },
    [sections, updateSections]
  );

  /**
   * Show add section form
   */
  const handleAdd = useCallback(() => {
    setIsAdding(true);
  }, []);

  /**
   * Add a new section
   */
  const handleAddSection = useCallback(
    (newSection: EditableSection) => {
      const updatedSections = [...sections, newSection];
      updateSections(normalizePositions(updatedSections));
      setIsAdding(false);
    },
    [sections, updateSections]
  );

  /**
   * Cancel adding section
   */
  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
  }, []);

  /**
   * Move a section up or down
   */
  const moveSection = useCallback(
    (index: number, direction: "up" | "down") => {
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
      updateSections(normalized);
      
      // Notify parent of reorder
      const validSections = convertToStrategySections(normalized);
      onReorder(validSections);
    },
    [sections, updateSections, onReorder]
  );

  return {
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
  };
}

