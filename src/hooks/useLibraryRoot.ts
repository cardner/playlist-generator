/**
 * useLibraryRoot Hook
 * 
 * Manages library root selection, loading, and state management.
 * Handles loading saved library roots, selecting new folders, and tracking root state.
 * 
 * @example
 * ```tsx
 * const {
 *   currentRoot,
 *   currentRootId,
 *   isLoading,
 *   error,
 *   handleChooseFolder,
 *   loadSavedLibrary,
 *   canRelink,
 *   hasCompletedScan,
 * } = useLibraryRoot({
 *   onLibrarySelected,
 * });
 * ```
 */

import { useState, useCallback, useEffect } from "react";
import type { LibraryRoot } from "@/lib/library-selection";
import {
  pickLibraryRoot,
  getSavedLibraryRoot,
} from "@/lib/library-selection";
import {
  getCurrentLibraryRoot,
  getScanRuns,
  getFileIndexEntries,
  getTracks,
} from "@/db/storage";
import { hasRelativePaths } from "@/features/library/relink";
import { logger } from "@/lib/logger";

export interface UseLibraryRootOptions {
  /** Callback when library root is selected */
  onLibrarySelected?: (root: LibraryRoot) => void;
  /** Whether to load saved library on mount */
  loadOnMount?: boolean;
}

export interface UseLibraryRootReturn {
  /** Current library root */
  currentRoot: LibraryRoot | null;
  /** Current library root ID from database */
  currentRootId: string | null;
  /** Whether a folder selection is in progress */
  isLoading: boolean;
  /** Current error message, if any */
  error: string | null;
  /** Whether library can be relinked */
  canRelink: boolean;
  /** Whether a scan has completed */
  hasCompletedScan: boolean;
  /** Whether library has relative paths */
  hasRelativePathsCheck: boolean | null;
  /** Select a new folder */
  handleChooseFolder: () => Promise<void>;
  /** Re-select folder (force reset, for permission flow) */
  handleReSelectFolder: () => Promise<void>;
  /** Load saved library root */
  loadSavedLibrary: () => Promise<void>;
  /** Clear error */
  clearError: () => void;
}

/**
 * Hook for managing library root selection and state
 */
export function useLibraryRoot(
  options: UseLibraryRootOptions = {}
): UseLibraryRootReturn {
  const { onLibrarySelected, loadOnMount = true } = options;

  const [currentRoot, setCurrentRoot] = useState<LibraryRoot | null>(null);
  const [currentRootId, setCurrentRootId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRelink, setCanRelink] = useState<boolean>(false);
  const [hasCompletedScan, setHasCompletedScan] = useState<boolean>(false);
  const [hasRelativePathsCheck, setHasRelativePathsCheck] = useState<boolean | null>(null);

  /**
   * Load saved library root from storage
   */
  const loadSavedLibrary = useCallback(async () => {
    try {
      const saved = await getSavedLibraryRoot();
      if (saved) {
        setCurrentRoot(saved);
        // Don't call onLibrarySelected here - let parent handle it
        // This prevents triggering a new scan when loading existing library

        // Get root ID from database
        const rootRecord = await getCurrentLibraryRoot();
        if (rootRecord) {
          setCurrentRootId(rootRecord.id);

          // Check if there's data to relink (tracks or fileIndex)
          const tracks = await getTracks(rootRecord.id);
          const fileIndex = await getFileIndexEntries(rootRecord.id);
          setCanRelink(tracks.length > 0 || fileIndex.length > 0);

          // Check if scan has completed
          const scanRuns = await getScanRuns(rootRecord.id);
          const completedScan = scanRuns.some(
            (run) => run.finishedAt && run.total > 0
          );
          setHasCompletedScan(completedScan);

          // Only check relative paths if scan has completed
          if (completedScan) {
            const hasPaths = await hasRelativePaths(rootRecord.id);
            setHasRelativePathsCheck(hasPaths);
          } else {
            setHasRelativePathsCheck(null); // Don't show warning yet
          }
        }
      }
    } catch (err) {
      logger.error("Failed to load saved library:", err);
    }
  }, []);

  /**
   * Shared logic for folder selection - used by both handleChooseFolder and handleReSelectFolder
   */
  const selectFolder = useCallback(
    async (forceReset: boolean) => {
      setIsLoading(true);
      setError(null);

      try {
        const root = await pickLibraryRoot(forceReset);

        // Update local state first
        setCurrentRoot(root);

        // Notify parent immediately so UI updates
        onLibrarySelected?.(root);

        // Get root ID from database after saving (with small delay to ensure save completes)
        await new Promise((resolve) => setTimeout(resolve, 50));
        const rootRecord = await getCurrentLibraryRoot();
        if (rootRecord) {
          setCurrentRootId(rootRecord.id);

          // Check if there's data to relink
          const tracks = await getTracks(rootRecord.id);
          const fileIndex = await getFileIndexEntries(rootRecord.id);
          setCanRelink(tracks.length > 0 || fileIndex.length > 0);

          // Check if scan has completed
          const scanRuns = await getScanRuns(rootRecord.id);
          const completedScan = scanRuns.some(
            (run) => run.finishedAt && run.total > 0
          );
          setHasCompletedScan(completedScan);

          if (completedScan) {
            const hasPaths = await hasRelativePaths(rootRecord.id);
            setHasRelativePathsCheck(hasPaths);
          } else {
            setHasRelativePathsCheck(null);
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to select folder";
        if (errorMessage !== "Folder selection cancelled") {
          setError(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [onLibrarySelected]
  );

  /**
   * Select a new folder
   */
  const handleChooseFolder = useCallback(async () => {
    await selectFolder(false);
  }, [selectFolder]);

  /**
   * Re-select folder (force reset picker state) - for permission flow when user needs fresh handle
   */
  const handleReSelectFolder = useCallback(async () => {
    try {
      await selectFolder(true);
    } catch {
      // User cancelled or error - already handled in selectFolder
    }
  }, [selectFolder]);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Load saved library on mount if requested
  useEffect(() => {
    if (loadOnMount) {
      loadSavedLibrary();
    }
  }, [loadOnMount, loadSavedLibrary]);

  return {
    currentRoot,
    currentRootId,
    isLoading,
    error,
    canRelink,
    hasCompletedScan,
    hasRelativePathsCheck,
    handleChooseFolder,
    handleReSelectFolder,
    loadSavedLibrary,
    clearError,
  };
}

