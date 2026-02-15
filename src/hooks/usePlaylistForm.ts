/**
 * usePlaylistForm Hook
 * 
 * Manages form state, validation, and draft persistence for playlist creation.
 * Handles auto-saving drafts to localStorage and form validation.
 * 
 * @example
 * ```tsx
 * const {
 *   formData,
 *   errors,
 *   setFormData,
 *   validate,
 *   isValid,
 *   clearDraft,
 * } = usePlaylistForm(discoveryMode);
 * ```
 */

import { useState, useEffect, useCallback } from "react";
import type { PlaylistRequest, PlaylistRequestErrors } from "@/types/playlist";
import {
  savePlaylistDraft,
  loadPlaylistDraft,
  clearPlaylistDraft,
} from "@/lib/playlist-storage";
import {
  validatePlaylistRequest,
  hasErrors,
} from "@/lib/playlist-validation";

export interface UsePlaylistFormOptions {
  /** Whether this is discovery mode (affects validation) */
  discoveryMode?: boolean;
  /** Initial form data (optional) */
  initialData?: Partial<PlaylistRequest>;
}

export interface UsePlaylistFormReturn {
  /** Current form data */
  formData: Partial<PlaylistRequest>;
  /** Current validation errors */
  errors: PlaylistRequestErrors;
  /** Update form data */
  setFormData: React.Dispatch<React.SetStateAction<Partial<PlaylistRequest>>>;
  /** Validate the current form data */
  validate: () => PlaylistRequestErrors;
  /** Check if form has validation errors */
  isValid: () => boolean;
  /** Clear the draft from localStorage */
  clearDraft: () => void;
  /** Validate discovery mode requirements */
  validateDiscoveryMode: () => boolean;
}

/**
 * Hook for managing playlist form state and validation
 */
export function usePlaylistForm(
  options: UsePlaylistFormOptions = {}
): UsePlaylistFormReturn {
  const { discoveryMode = false, initialData } = options;

  // Use consistent initial state for both server and client to avoid hydration mismatch.
  // Draft is loaded in useEffect after mount (client-only).
  const defaultInitialData: Partial<PlaylistRequest> = {
    genres: [],
    length: { type: "minutes", value: 30 },
    mood: [],
    activity: [],
    tempo: { bucket: "medium" },
    surprise: discoveryMode ? 0.7 : 0.5,
    minArtists: undefined,
    disallowedArtists: [],
    suggestedArtists: [],
    suggestedAlbums: [],
    suggestedTracks: [],
    agentType: "built-in",
    llmConfig: undefined,
    enableDiscovery: discoveryMode,
    discoveryFrequency: discoveryMode ? "every_other" : undefined,
    sourcePool: "all",
    recentWindow: "30d",
    llmAdditionalInstructions: undefined,
  };

  const [formData, setFormData] = useState<Partial<PlaylistRequest>>(
    () => initialData || defaultInitialData
  );

  const [errors, setErrors] = useState<PlaylistRequestErrors>({});

  // Load draft from localStorage after mount (client-only) to avoid hydration mismatch
  useEffect(() => {
    const draft = loadPlaylistDraft();
    if (draft && Object.keys(draft).length > 0) {
      setFormData(draft);
    }
  }, []); // Run once on mount

  // Auto-save draft to localStorage when form data changes
  // Only save on client side (not during SSR)
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const timeoutId = setTimeout(() => {
      savePlaylistDraft(formData);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData]);

  // Ensure discovery is always enabled in discovery mode
  useEffect(() => {
    if (discoveryMode && !formData.enableDiscovery) {
      setFormData((prev) => ({
        ...prev,
        enableDiscovery: true,
        discoveryFrequency: prev.discoveryFrequency || "every_other",
      }));
    }
  }, [discoveryMode, formData.enableDiscovery]);

  /**
   * Validate the current form data
   */
  const validate = useCallback((): PlaylistRequestErrors => {
    const validationErrors = validatePlaylistRequest(formData);
    setErrors(validationErrors);
    return validationErrors;
  }, [formData]);

  /**
   * Check if form has validation errors
   */
  const isValid = useCallback((): boolean => {
    const validationErrors = validatePlaylistRequest(formData);
    return !hasErrors(validationErrors);
  }, [formData]);

  /**
   * Clear the draft from localStorage
   */
  const clearDraft = useCallback(() => {
    clearPlaylistDraft();
  }, []);

  /**
   * Validate discovery mode requirements
   * In discovery mode, require at least one selection (genres, artists, albums, or tracks)
   */
  const validateDiscoveryMode = useCallback((): boolean => {
    if (!discoveryMode) return true;

    const hasGenres = (formData.genres || []).length > 0;
    const hasArtists = (formData.suggestedArtists || []).length > 0;
    const hasAlbums = (formData.suggestedAlbums || []).length > 0;
    const hasTracks = (formData.suggestedTracks || []).length > 0;

    if (!hasGenres && !hasArtists && !hasAlbums && !hasTracks) {
      setErrors((prev) => ({
        ...prev,
        genres: "Please select at least one genre, artist, album, or track from your collection to discover new music",
      }));
      return false;
    }

    return true;
  }, [discoveryMode, formData]);

  return {
    formData,
    errors,
    setFormData,
    validate,
    isValid,
    clearDraft,
    validateDiscoveryMode,
  };
}

