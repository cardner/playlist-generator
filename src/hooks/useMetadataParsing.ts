/**
 * useMetadataParsing Hook
 * 
 * Manages metadata parsing state and logic for library files, including
 * progress tracking, error handling, and result management.
 * 
 * @example
 * ```tsx
 * const {
 *   isParsingMetadata,
 *   metadataResults,
 *   metadataProgress,
 *   error,
 *   handleParseMetadata,
 *   clearError,
 * } = useMetadataParsing({
 *   onParseComplete,
 *   scanRunId,
 * });
 * ```
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { LibraryRoot, LibraryFile } from "@/lib/library-selection";
import { checkLibraryPermission } from "@/lib/library-selection";
import type { ScanResult, MetadataResult, MetadataProgressCallback } from "@/features/library";
import { parseMetadataForFiles } from "@/features/library";
import { getLibraryFilesForEntries } from "@/features/library/metadata-integration";
import { saveTrackMetadata, updateScanRun, removeTrackMetadata } from "@/db/storage";
import { detectTempoForLibrary } from "@/features/library/metadata-enhancement";
import { isQuotaExceededError, getStorageQuotaInfo } from "@/db/storage-errors";
import {
  applySidecarEnhancements,
  applySidecarToResults,
  readSidecarMetadataForTracks,
} from "@/features/library/metadata-sidecar";
import {
  saveProcessingCheckpoint,
  loadProcessingCheckpoint,
  deleteProcessingCheckpoint,
} from "@/db/storage-processing-checkpoints";
import { logger } from "@/lib/logger";

export interface UseMetadataParsingOptions {
  /** Callback when parsing completes */
  onParseComplete?: () => void;
  /** Callback when processing checkpoints update */
  onProcessingProgress?: () => void;
  /** Scan run ID for updating scan run with error count */
  scanRunId?: string | null;
}

export interface MetadataProgress {
  parsed: number;
  total: number;
  errors: number;
  currentFile?: string;
  batch?: number;
  totalBatches?: number;
  estimatedTimeRemaining?: number;
}

export interface UseMetadataParsingReturn {
  /** Whether metadata parsing is currently in progress */
  isParsingMetadata: boolean;
  /** The results of metadata parsing */
  metadataResults: MetadataResult[] | null;
  /** Current metadata parsing progress */
  metadataProgress: MetadataProgress | null;
  /** Whether tempo detection is currently running */
  isDetectingTempo: boolean;
  /** Tempo detection progress */
  tempoProgress: {
    processed: number;
    total: number;
    detected: number;
    currentTrack?: string;
  } | null;
  /** Current error message, if any */
  error: string | null;
  /** Parse metadata for files from a scan result */
  handleParseMetadata: (
    result: ScanResult,
    root: LibraryRoot,
    libraryRootId: string,
    scanRunIdOverride?: string
  ) => Promise<void>;
  /** Resume metadata processing from stored checkpoints */
  handleResumeProcessing: (
    root: LibraryRoot,
    libraryRootId: string,
    scanRunId: string
  ) => Promise<void>;
  /** Process only unprocessed tracks (fileIndex minus tracks) */
  handleProcessUnprocessed: (
    root: LibraryRoot,
    libraryRootId: string,
    scanRunId?: string
  ) => Promise<void>;
  /** Clear the current error */
  clearError: () => void;
  /** Clear the metadata results */
  clearMetadataResults: () => void;
}

/**
 * Hook for managing metadata parsing
 */
export function useMetadataParsing(
  options: UseMetadataParsingOptions = {}
): UseMetadataParsingReturn {
  const { onParseComplete, onProcessingProgress, scanRunId } = options;

  const [isParsingMetadata, setIsParsingMetadata] = useState(false);
  const [metadataResults, setMetadataResults] = useState<MetadataResult[] | null>(null);
  const [metadataProgress, setMetadataProgress] = useState<MetadataProgress | null>(null);
  const [isDetectingTempo, setIsDetectingTempo] = useState(false);
  const [tempoProgress, setTempoProgress] = useState<{
    processed: number;
    total: number;
    detected: number;
    currentTrack?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tempoLogStateRef = useRef({ lastLogTime: 0, lastProcessed: 0 });

  // Use ref for callback to avoid recreating handleParseMetadata when callback changes
  const onParseCompleteRef = useRef(onParseComplete);
  useEffect(() => {
    onParseCompleteRef.current = onParseComplete;
  }, [onParseComplete]);

  const onProcessingProgressRef = useRef(onProcessingProgress);
  useEffect(() => {
    onProcessingProgressRef.current = onProcessingProgress;
  }, [onProcessingProgress]);

  /**
   * Parse metadata for files from a scan result
   */
  const handleParseMetadata = useCallback(
    async (
      result: ScanResult,
      root: LibraryRoot,
      libraryRootId: string,
      scanRunIdOverride?: string
    ) => {
      if (root.mode !== "handle") {
        return; // Only handle mode supports metadata parsing
      }

      let sortedEntries: typeof result.entries = [];
      let processedOffset = 0;
      const activeScanRunId = scanRunIdOverride ?? scanRunId ?? null;
      try {
        const permission = await checkLibraryPermission(root);
        if (permission !== "granted") {
          setError(
            "Permission required to read library files for metadata parsing. " +
              "Please re-grant access to your library folder and try again."
          );
          return;
        }

        setIsParsingMetadata(true);
        sortedEntries = sortEntriesForProcessing(
          result.diff ? [...result.diff.added, ...result.diff.changed] : result.entries
        );
        const processingCheckpoint = activeScanRunId
          ? await loadProcessingCheckpoint(activeScanRunId)
          : null;
        const startIndex = processingCheckpoint
          ? Math.min(processingCheckpoint.lastProcessedIndex + 1, sortedEntries.length)
          : 0;
        processedOffset = startIndex;
        const entriesToParse = sortedEntries.slice(startIndex);

        if (entriesToParse.length === 0) {
          setMetadataResults([]);
          setMetadataProgress(null);
          setIsParsingMetadata(false);
          if (activeScanRunId) {
            await deleteProcessingCheckpoint(activeScanRunId);
          }
          onParseCompleteRef.current?.();
          return;
        }

        setMetadataProgress({
          parsed: processedOffset,
          total: sortedEntries.length,
          errors: processingCheckpoint?.errors ?? 0,
        });

        if (activeScanRunId) {
          await saveProcessingCheckpoint(
            activeScanRunId,
            libraryRootId,
            sortedEntries.length,
            Math.max(processedOffset - 1, -1),
            processingCheckpoint?.lastProcessedPath,
            processingCheckpoint?.errors ?? 0,
            false
          );
          onProcessingProgressRef.current?.();
        }

        if (result.diff?.removed?.length) {
          try {
            await removeTrackMetadata(
              result.diff.removed.map((entry) => entry.trackFileId),
              libraryRootId
            );
          } catch (removeError) {
            logger.warn("Failed to remove metadata for deleted tracks:", removeError);
          }
        }

        // Get LibraryFile objects for these entries
        const libraryFiles = await getLibraryFilesForEntries(root, entriesToParse, libraryRootId);

        if (libraryFiles.length === 0) {
          logger.warn(
            "No library files found for entries - cannot parse metadata. This might happen if files were moved or the directory handle is invalid"
          );
          setError(
            "Unable to read library files for metadata parsing. " +
              "Please re-select your library folder and try again."
          );
          setIsParsingMetadata(false);
          setMetadataProgress(null);
          return;
        }

        // Use batched parsing for large libraries to prevent timeouts
        const orderedFiles = reorderLibraryFiles(entriesToParse, libraryFiles);
        const tempoTrackFileIds = entriesToParse.map((entry) => entry.trackFileId);
        const totalEntries = sortedEntries.length;
        const useBatched = orderedFiles.length > 1000;
        let lastSavedIndex = processedOffset - 1;
        const CHECKPOINT_INTERVAL = 50;

        const saveCheckpointIfNeeded = async (parsedCount: number, errorsCount: number) => {
          if (!activeScanRunId) {
            return;
          }
          const currentIndex = processedOffset + parsedCount - 1;
          if (currentIndex < 0) {
            return;
          }
          if (currentIndex - lastSavedIndex < CHECKPOINT_INTERVAL) {
            return;
          }
          lastSavedIndex = currentIndex;
          const lastProcessedPath =
            sortedEntries[currentIndex]?.relativePath || sortedEntries[currentIndex]?.name;
          try {
            await saveProcessingCheckpoint(
              activeScanRunId,
              libraryRootId,
              totalEntries,
              currentIndex,
              lastProcessedPath,
              errorsCount,
              false
            );
            onProcessingProgressRef.current?.();
          } catch (checkpointError) {
            logger.error("Failed to save processing checkpoint:", checkpointError);
          }
        };
        let results: MetadataResult[];
        let successCount: number;
        let errorCount: number;

        if (useBatched) {
          // Import batched parser
          const { parseMetadataBatched } = await import(
            "@/features/library/metadata-batched"
          );

          // Adjust batch size and concurrency based on library size
          const batchSize = libraryFiles.length > 10000 ? 500 : 1000;
          const concurrency = libraryFiles.length > 5000 ? 2 : 3;

          const onBatchedProgress = (progress: any) => {
            // Update UI progress state
            setMetadataProgress({
              parsed: processedOffset + progress.parsed,
              total: totalEntries,
              errors: progress.errors,
              currentFile: progress.currentFile,
              batch: progress.batch,
              totalBatches: progress.totalBatches,
              estimatedTimeRemaining: progress.estimatedTimeRemaining,
            });
            void saveCheckpointIfNeeded(progress.parsed, progress.errors);
          };

          const collectResults = orderedFiles.length <= 5000;
          const batchedResult = await parseMetadataBatched(
            orderedFiles,
            libraryRootId,
            onBatchedProgress,
            {
              batchSize,
              concurrency,
              saveAfterEachBatch: true, // Save incrementally
              collectResults,
            }
          );

          results = batchedResult.results ?? [];
          successCount = batchedResult.saved;
          errorCount = batchedResult.errors;

          if (collectResults) {
            setMetadataResults(results);
          } else {
            setMetadataResults([]);
          }

          // Verify final count (tracks were saved incrementally during batching)
          const { getTracks } = await import("@/db/storage");
          const savedTracks = await getTracks(libraryRootId);
          const savedCount = savedTracks.length;

          if (savedCount < successCount) {
            logger.warn(
              `Expected ${successCount} tracks but only ${savedCount} were saved`
            );
          }
        } else {
          // For smaller libraries, use direct parsing (faster)
          // Adjust concurrency based on library size
          const concurrency = orderedFiles.length > 500 ? 3 : 5;

          const onMetadataProgress: MetadataProgressCallback = (progress) => {
            // Update UI progress state
            setMetadataProgress({
              parsed: processedOffset + progress.parsed,
              total: totalEntries,
              errors: progress.errors,
              currentFile: progress.currentFile,
            });
            void saveCheckpointIfNeeded(progress.parsed, progress.errors);
          };

          results = await parseMetadataForFiles(
            orderedFiles,
            onMetadataProgress,
            concurrency
          );

          const sidecarMap = await readSidecarMetadataForTracks(
            libraryRootId,
            results.map((result) => result.trackFileId)
          );
          results = applySidecarToResults(results, sidecarMap);

          successCount = results.filter((r) => !r.error && r.tags).length;
          errorCount = results.filter((r) => r.error).length;

          setMetadataResults(results);

          // Persist metadata results (with progress tracking for large libraries)
          try {
            await saveTrackMetadata(
              results,
              libraryRootId,
              () => {
                // Progress callback - UI updates handled by onMetadataProgress
              }
            );

            await applySidecarEnhancements(libraryRootId, sidecarMap);

            // Verify data was saved successfully
            const { getTracks } = await import("@/db/storage");
            const savedTracks = await getTracks(libraryRootId);
            const savedCount = savedTracks.length;
            const expectedCount = successCount;

            if (savedCount < expectedCount) {
              logger.warn(
                `Expected ${expectedCount} tracks but only ${savedCount} were saved`
              );
            }
          } catch (err) {
            logger.error("Error saving track metadata:", err);
            // Handle quota errors during metadata saving
            if (isQuotaExceededError(err)) {
              const quotaInfo = await getStorageQuotaInfo();
              const quotaMessage = quotaInfo
                ? `Storage quota exceeded while saving metadata. You're using ${quotaInfo.usagePercent.toFixed(1)}% of available storage. Please clean up old data.`
                : "Storage quota exceeded while saving metadata. Please clean up old data.";
              setError(quotaMessage);
              throw err; // Re-throw to stop processing
            }
            throw err; // Re-throw other errors
          }
        }

        // Update scan run with parse error count (for both batched and direct parsing)
        if (activeScanRunId) {
          await updateScanRun(activeScanRunId, errorCount);
          await deleteProcessingCheckpoint(activeScanRunId);
        }

        // Final verification
        const { getFileIndexEntries, getTracks } = await import("@/db/storage");
        const savedFileIndex = await getFileIndexEntries(libraryRootId);
        const savedTracks = await getTracks(libraryRootId);

        if (savedTracks.length === 0 && successCount > 0) {
          logger.error("Tracks were parsed but not saved to database!");
          setError("Failed to save tracks to database. Please try scanning again.");
        }

        // Automatically detect tempo for tracks missing BPM (runs in background)
        // This is non-blocking and happens after metadata parsing completes
        const isStandalone =
          typeof window !== "undefined" &&
          (window.matchMedia?.("(display-mode: standalone)").matches ||
            (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
        const deviceMemory = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
        const tempoBatchSize =
          isStandalone && deviceMemory && deviceMemory <= 4 ? 2 : 5;
        const tempoTargetCount = tempoTrackFileIds.length;
        const isLargeLibrary = (tempoTargetCount || orderedFiles.length) > 10000;
        const isLowMemoryStandalone = isStandalone && deviceMemory && deviceMemory <= 4;
        let shouldDetectTempo = true;

        if (isLowMemoryStandalone && isLargeLibrary && typeof window !== "undefined") {
          shouldDetectTempo = window.confirm(
            "Tempo detection may be slow or unstable on this device. Run it now?"
          );
        }

        if (tempoTargetCount === 0) {
          logger.info("Tempo detection skipped: no new tracks to process.");
          setIsDetectingTempo(false);
          setTempoProgress(null);
          onParseCompleteRef.current?.();
          return;
        }

        if (!shouldDetectTempo) {
          logger.info(
            `Tempo detection skipped: standalone=${isStandalone}, deviceMemory=${deviceMemory ?? "unknown"}, librarySize=${tempoTargetCount || orderedFiles.length}`
          );
          setIsDetectingTempo(false);
          setTempoProgress(null);
          onParseCompleteRef.current?.();
          return;
        }

        setIsDetectingTempo(true);
        setTempoProgress({ processed: 0, total: 0, detected: 0 });

        detectTempoForLibrary(
          libraryRootId,
          (progress: { processed: number; total: number; detected: number; currentTrack?: string }) => {
            setTempoProgress({
              processed: progress.processed,
              total: progress.total,
              detected: progress.detected,
              currentTrack: progress.currentTrack,
            });
            const now = Date.now();
            const { lastLogTime, lastProcessed } = tempoLogStateRef.current;
            const shouldLogByTime = now - lastLogTime >= 2000;
            const shouldLogByCount = progress.processed - lastProcessed >= 50;

            if (shouldLogByTime || shouldLogByCount) {
              logger.debug(`Tempo detection: ${progress.detected}/${progress.processed} tracks`);
              tempoLogStateRef.current = {
                lastLogTime: now,
                lastProcessed: progress.processed,
              };
            }
          },
          tempoBatchSize,
          tempoTrackFileIds
        )
          .then((summary) => {
            logger.info(
              `Tempo detection summary: processed=${summary.processed}, detected=${summary.detected}, errors=${summary.errors.length}, batchSize=${tempoBatchSize}`
            );
          })
          .catch((error: unknown) => {
            // Don't fail the scan if tempo detection fails
            logger.warn("Background tempo detection failed:", error);
          })
          .finally(() => {
            setIsDetectingTempo(false);
          });

        // Notify parent that scan and data persistence is complete
        // This will trigger refresh of LibrarySummary and LibraryBrowser
        onParseCompleteRef.current?.();
      } catch (err) {
        logger.error("Failed to parse metadata:", err);
        if (activeScanRunId && sortedEntries.length > 0) {
          try {
            const parsedSoFar = metadataProgress?.parsed ?? processedOffset;
            const lastIndex = Math.min(parsedSoFar - 1, sortedEntries.length - 1);
            const lastProcessedPath =
              lastIndex >= 0
                ? sortedEntries[lastIndex]?.relativePath || sortedEntries[lastIndex]?.name
                : undefined;
            await saveProcessingCheckpoint(
              activeScanRunId,
              libraryRootId,
              sortedEntries.length,
              Math.max(lastIndex, 0),
              lastProcessedPath,
              metadataProgress?.errors ?? 0,
              true
            );
          } catch (checkpointError) {
            logger.error("Failed to save processing checkpoint after error:", checkpointError);
          }
        }
        setError(
          `Failed to parse metadata: ${err instanceof Error ? err.message : String(err)}`
        );
        // Don't fail the scan if metadata parsing fails, but still notify completion
        // The file index is already saved, so we can still show results
        onParseCompleteRef.current?.();
      } finally {
        setIsParsingMetadata(false);
        setMetadataProgress(null); // Clear progress when done
      }
    },
    [scanRunId, metadataProgress] // Removed onParseComplete dependency - using ref instead
  );

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear the metadata results
   */
  const clearMetadataResults = useCallback(() => {
    setMetadataResults(null);
    setError(null);
  }, []);

  const handleResumeProcessing = useCallback(
    async (root: LibraryRoot, libraryRootId: string, resumeScanRunId: string) => {
      if (!resumeScanRunId) {
        return;
      }
      const { getFileIndexEntries } = await import("@/db/storage");
      const entries = await getFileIndexEntries(libraryRootId);
      const scanResult: ScanResult = {
        total: entries.length,
        added: 0,
        changed: 0,
        removed: 0,
        duration: 0,
        entries: entries.map((entry) => ({
          trackFileId: entry.trackFileId,
          relativePath: entry.relativePath,
          name: entry.name,
          extension: entry.extension,
          size: entry.size,
          mtime: entry.mtime,
        })),
      };

      await handleParseMetadata(scanResult, root, libraryRootId, resumeScanRunId);
    },
    [handleParseMetadata]
  );

  const handleProcessUnprocessed = useCallback(
    async (root: LibraryRoot, libraryRootId: string, scanRunIdOverride?: string) => {
      const { getFileIndexEntries, getTracks } = await import("@/db/storage");
      const [entries, tracks] = await Promise.all([
        getFileIndexEntries(libraryRootId),
        getTracks(libraryRootId),
      ]);
      const processedIds = new Set(tracks.map((track) => track.trackFileId));
      const unprocessedEntries = entries.filter(
        (entry) => !processedIds.has(entry.trackFileId)
      );

      const scanResult: ScanResult = {
        total: entries.length,
        added: 0,
        changed: 0,
        removed: 0,
        duration: 0,
        entries: unprocessedEntries.map((entry) => ({
          trackFileId: entry.trackFileId,
          relativePath: entry.relativePath,
          name: entry.name,
          extension: entry.extension,
          size: entry.size,
          mtime: entry.mtime,
        })),
      };

      await handleParseMetadata(
        scanResult,
        root,
        libraryRootId,
        scanRunIdOverride
      );
    },
    [handleParseMetadata]
  );

  return {
    isParsingMetadata,
    metadataResults,
    metadataProgress,
    isDetectingTempo,
    tempoProgress,
    error,
    handleParseMetadata,
    handleResumeProcessing,
    handleProcessUnprocessed,
    clearError,
    clearMetadataResults,
  };
}

function sortEntriesForProcessing(entries: ScanResult["entries"]): ScanResult["entries"] {
  return [...entries].sort((a, b) => {
    const aPath = a.relativePath || a.name;
    const bPath = b.relativePath || b.name;
    return aPath.localeCompare(bPath);
  });
}

function reorderLibraryFiles(
  entries: ScanResult["entries"],
  libraryFiles: LibraryFile[]
): LibraryFile[] {
  const fileMap = new Map(libraryFiles.map((file) => [file.trackFileId, file]));
  const ordered: LibraryFile[] = [];
  for (const entry of entries) {
    const file = fileMap.get(entry.trackFileId);
    if (file) {
      ordered.push(file);
    }
  }
  return ordered;
}

