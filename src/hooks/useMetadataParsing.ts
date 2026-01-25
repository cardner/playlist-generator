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
import type { LibraryRoot } from "@/lib/library-selection";
import type { ScanResult, MetadataResult, MetadataProgressCallback } from "@/features/library";
import { parseMetadataForFiles } from "@/features/library";
import { getLibraryFilesForEntries } from "@/features/library/metadata-integration";
import { saveTrackMetadata, updateScanRun } from "@/db/storage";
import { detectTempoForLibrary } from "@/features/library/metadata-enhancement";
import { isQuotaExceededError, getStorageQuotaInfo } from "@/db/storage-errors";
import { logger } from "@/lib/logger";

export interface UseMetadataParsingOptions {
  /** Callback when parsing completes */
  onParseComplete?: () => void;
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
    libraryRootId: string
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
  const { onParseComplete, scanRunId } = options;

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

  /**
   * Parse metadata for files from a scan result
   */
  const handleParseMetadata = useCallback(
    async (
      result: ScanResult,
      root: LibraryRoot,
      libraryRootId: string
    ) => {
      if (root.mode !== "handle") {
        return; // Only handle mode supports metadata parsing
      }

      try {
        setIsParsingMetadata(true);
        setMetadataProgress({
          parsed: 0,
          total: result.entries.length,
          errors: 0,
        });

        // Get entries that need metadata parsing (added + changed)
        // For now, parse all entries (can be optimized to only parse added/changed)
        const entriesToParse = result.entries;

        // Get LibraryFile objects for these entries
        const libraryFiles = await getLibraryFilesForEntries(root, entriesToParse, libraryRootId);

        if (libraryFiles.length === 0) {
          logger.warn(
            "No library files found for entries - cannot parse metadata. This might happen if files were moved or the directory handle is invalid"
          );
          setIsParsingMetadata(false);
          setMetadataProgress(null);
          // Still notify completion - file index is saved even if metadata parsing fails
          onParseCompleteRef.current?.();
          return;
        }

        // Use batched parsing for large libraries to prevent timeouts
        const useBatched = libraryFiles.length > 1000;
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
              parsed: progress.parsed,
              total: progress.total,
              errors: progress.errors,
              currentFile: progress.currentFile,
              batch: progress.batch,
              totalBatches: progress.totalBatches,
              estimatedTimeRemaining: progress.estimatedTimeRemaining,
            });
          };

          const collectResults = libraryFiles.length <= 5000;
          const batchedResult = await parseMetadataBatched(
            libraryFiles,
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
            setMetadataResults(null);
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
          const concurrency = libraryFiles.length > 500 ? 3 : 5;

          const onMetadataProgress: MetadataProgressCallback = (progress) => {
            // Update UI progress state
            setMetadataProgress({
              parsed: progress.parsed,
              total: progress.total,
              errors: progress.errors,
              currentFile: progress.currentFile,
            });
          };

          results = await parseMetadataForFiles(
            libraryFiles,
            onMetadataProgress,
            concurrency
          );

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
        if (scanRunId) {
          await updateScanRun(scanRunId, errorCount);
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
        const isLargeLibrary = libraryFiles.length > 10000;
        const isLowMemoryStandalone = isStandalone && deviceMemory && deviceMemory <= 4;
        let shouldDetectTempo = true;

        if (isLowMemoryStandalone && isLargeLibrary && typeof window !== "undefined") {
          shouldDetectTempo = window.confirm(
            "Tempo detection may be slow or unstable on this device. Run it now?"
          );
        }

        if (!shouldDetectTempo) {
          logger.info(
            `Tempo detection skipped: standalone=${isStandalone}, deviceMemory=${deviceMemory ?? "unknown"}, librarySize=${libraryFiles.length}`
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
          tempoBatchSize
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
    [scanRunId] // Removed onParseComplete dependency - using ref instead
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

  return {
    isParsingMetadata,
    metadataResults,
    metadataProgress,
    isDetectingTempo,
    tempoProgress,
    error,
    handleParseMetadata,
    clearError,
    clearMetadataResults,
  };
}

