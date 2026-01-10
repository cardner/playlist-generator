/**
 * Hook for managing track metadata editing state
 * 
 * Provides state management for editing track metadata (genres, mood, tempo)
 * with support for inline editing, saving, and canceling edits.
 * 
 * @module hooks/useTrackMetadataEditor
 */

import { useState, useCallback } from "react";
import type { EnhancedMetadata } from "@/features/library/metadata";
import { updateTrackMetadata } from "@/db/storage-tracks";
import { logger } from "@/lib/logger";

interface EditingState {
  trackId: string;
  edits: Partial<EnhancedMetadata>;
  originalMetadata?: EnhancedMetadata;
}

/**
 * Hook for managing track metadata editing
 * 
 * @returns Object with editing state and functions
 * 
 * @example
 * ```typescript
 * const { editingTrackId, editTrack, saveEdits, cancelEdit, isEditing } = useTrackMetadataEditor();
 * 
 * // Start editing
 * editTrack('track1-root1', existingMetadata);
 * 
 * // Save edits
 * await saveEdits('track1-root1', { genres: ['Rock'], tempo: 120 });
 * 
 * // Cancel editing
 * cancelEdit();
 * ```
 */
export function useTrackMetadataEditor() {
  const [editingState, setEditingState] = useState<EditingState | null>(null);

  /**
   * Start editing a track
   * 
   * @param trackId - Composite track ID
   * @param originalMetadata - Current enhanced metadata (optional, for reverting)
   */
  const editTrack = useCallback((trackId: string, originalMetadata?: EnhancedMetadata) => {
    setEditingState({
      trackId,
      edits: {},
      originalMetadata,
    });
  }, []);

  /**
   * Update edits for the currently editing track
   * 
   * @param edits - Partial EnhancedMetadata with fields to update
   */
  const updateEdits = useCallback((edits: Partial<EnhancedMetadata>) => {
    if (!editingState) {
      logger.warn("Cannot update edits: no track is being edited");
      return;
    }
    setEditingState({
      ...editingState,
      edits: {
        ...editingState.edits,
        ...edits,
      },
    });
  }, [editingState]);

  /**
   * Save edits to IndexedDB
   * 
   * @param trackId - Composite track ID (optional, uses current editing track if not provided)
   * @param edits - Partial EnhancedMetadata with fields to save (optional, uses current edits if not provided)
   * @returns Promise that resolves when save is complete
   */
  const saveEdits = useCallback(async (
    trackId?: string,
    edits?: Partial<EnhancedMetadata>
  ): Promise<void> => {
    const targetTrackId = trackId || editingState?.trackId;
    const targetEdits = edits || editingState?.edits;

    if (!targetTrackId || !targetEdits) {
      logger.warn("Cannot save edits: no track ID or edits provided");
      return;
    }

    try {
      await updateTrackMetadata(targetTrackId, targetEdits, true);
      setEditingState(null);
    } catch (error) {
      logger.error("Failed to save track metadata edits:", error);
      throw error;
    }
  }, [editingState]);

  /**
   * Cancel editing and revert changes
   */
  const cancelEdit = useCallback(() => {
    setEditingState(null);
  }, []);

  /**
   * Check if a specific track is being edited
   * 
   * @param trackId - Composite track ID
   * @returns True if the track is currently being edited
   */
  const isEditing = useCallback((trackId: string): boolean => {
    return editingState?.trackId === trackId;
  }, [editingState]);

  /**
   * Get current edits for a track
   * 
   * @param trackId - Composite track ID
   * @returns Current edits or undefined if not editing
   */
  const getEdits = useCallback((trackId: string): Partial<EnhancedMetadata> | undefined => {
    if (editingState?.trackId === trackId) {
      return editingState.edits;
    }
    return undefined;
  }, [editingState]);

  return {
    editingTrackId: editingState?.trackId || null,
    editingEdits: editingState?.edits,
    editTrack,
    updateEdits,
    saveEdits,
    cancelEdit,
    isEditing,
    getEdits,
  };
}

