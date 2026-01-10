/**
 * Hook for managing metadata enhancement state
 * 
 * Provides state management for batch metadata enhancement operations
 * with progress tracking and error handling.
 * 
 * @module hooks/useMetadataEnhancement
 */

import { useState, useCallback } from "react";
import type { EnhancementProgress, EnhancementResult } from "@/features/library/metadata-enhancement";
import { enhanceLibraryMetadata, enhanceSelectedTracks } from "@/features/library/metadata-enhancement";
import { logger } from "@/lib/logger";

/**
 * Hook for managing metadata enhancement
 * 
 * @returns Object with enhancement state and functions
 * 
 * @example
 * ```typescript
 * const { isEnhancing, progress, startEnhancement, cancelEnhancement } = useMetadataEnhancement();
 * 
 * await startEnhancement(libraryRootId, (progress) => {
 *   console.log(`Processed ${progress.processed}/${progress.total}`);
 * });
 * ```
 */
export function useMetadataEnhancement() {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [progress, setProgress] = useState<EnhancementProgress | null>(null);
  const [result, setResult] = useState<EnhancementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  /**
   * Start enhancing all tracks in a library
   * 
   * @param libraryRootId - Library root ID
   * @param onProgress - Optional progress callback
   */
  const startEnhancement = useCallback(async (
    libraryRootId: string,
    onProgress?: (progress: EnhancementProgress) => void
  ) => {
    setIsEnhancing(true);
    setProgress(null);
    setResult(null);
    setError(null);
    setCancelled(false);

    try {
      const enhancementResult = await enhanceLibraryMetadata(
        libraryRootId,
        (prog) => {
          setProgress(prog);
          onProgress?.(prog);
        }
      );

      if (!cancelled) {
        setResult(enhancementResult);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      logger.error("Metadata enhancement failed:", err);
    } finally {
      setIsEnhancing(false);
    }
  }, [cancelled]);

  /**
   * Start enhancing selected tracks
   * 
   * @param trackIds - Array of composite track IDs
   * @param onProgress - Optional progress callback
   */
  const startSelectedEnhancement = useCallback(async (
    trackIds: string[],
    onProgress?: (progress: EnhancementProgress) => void
  ) => {
    setIsEnhancing(true);
    setProgress(null);
    setResult(null);
    setError(null);
    setCancelled(false);

    try {
      const enhancementResult = await enhanceSelectedTracks(
        trackIds,
        (prog) => {
          setProgress(prog);
          onProgress?.(prog);
        }
      );

      if (!cancelled) {
        setResult(enhancementResult);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      logger.error("Metadata enhancement failed:", err);
    } finally {
      setIsEnhancing(false);
    }
  }, [cancelled]);

  /**
   * Cancel ongoing enhancement
   */
  const cancelEnhancement = useCallback(() => {
    setCancelled(true);
    setIsEnhancing(false);
    setProgress(null);
  }, []);

  /**
   * Reset enhancement state
   */
  const reset = useCallback(() => {
    setIsEnhancing(false);
    setProgress(null);
    setResult(null);
    setError(null);
    setCancelled(false);
  }, []);

  return {
    isEnhancing,
    progress,
    result,
    error,
    cancelled,
    startEnhancement,
    startSelectedEnhancement,
    cancelEnhancement,
    reset,
  };
}

