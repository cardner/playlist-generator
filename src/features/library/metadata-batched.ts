/**
 * Batched metadata parsing and saving for large libraries
 * 
 * Processes files in batches and saves incrementally to prevent timeouts
 * and improve UI responsiveness for very large libraries (10k+ files).
 */

import type { LibraryFile } from "@/lib/library-selection";
import { parseMetadataForFiles, type MetadataProgressCallback } from "./metadata-parser";
import type { MetadataResult } from "./metadata";
import { saveTrackMetadata } from "@/db/storage";
import { isQuotaExceededError, getStorageQuotaInfo } from "@/db/storage-errors";
import {
  applySidecarEnhancements,
  applySidecarToResults,
  readSidecarMetadataForTracks,
} from "./metadata-sidecar";
import { logger } from "@/lib/logger";

export interface BatchedParseOptions {
  batchSize?: number; // Files per batch (default: 500)
  concurrency?: number; // Concurrent parsing tasks per batch (default: 3)
  saveAfterEachBatch?: boolean; // Save to IndexedDB after each batch (default: true)
  collectResults?: boolean; // Keep all results in memory (default: true)
}

export interface BatchedParseProgress {
  batch: number;
  totalBatches: number;
  parsed: number;
  total: number;
  errors: number;
  saved: number;
  currentFile?: string;
  estimatedTimeRemaining?: number; // seconds
}

export type BatchedParseProgressCallback = (progress: BatchedParseProgress) => void;

export interface BatchedParseResult {
  results?: MetadataResult[];
  parsed: number;
  errors: number;
  saved: number;
}

/**
 * Parse metadata for files in batches and save incrementally
 * 
 * This prevents browser timeouts for very large libraries by:
 * 1. Processing files in smaller batches (default: 500)
 * 2. Saving to IndexedDB after each batch
 * 3. Yielding control between batches to keep UI responsive
 * 
 * @param files Array of library files to parse
 * @param libraryRootId Library root ID for saving tracks
 * @param onProgress Progress callback
 * @param options Batch processing options
 * @returns Promise resolving to array of all metadata results
 */
export async function parseMetadataBatched(
  files: LibraryFile[],
  libraryRootId: string,
  onProgress?: BatchedParseProgressCallback,
  options: BatchedParseOptions = {}
): Promise<BatchedParseResult> {
  const {
    batchSize = 500,
    concurrency = 3,
    saveAfterEachBatch = true,
    collectResults = true,
  } = options;

  if (files.length === 0) {
    return { results: [], parsed: 0, errors: 0, saved: 0 };
  }

  const totalBatches = Math.ceil(files.length / batchSize);
  const allResults: MetadataResult[] | null = collectResults ? [] : null;
  let totalParsed = 0;
  let totalErrors = 0;
  let totalSaved = 0;
  const startTime = Date.now();

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, files.length);
    const batchFiles = files.slice(batchStart, batchEnd);
    const batchNumber = batchIndex + 1;

    // Parse this batch
    const batchResults: MetadataResult[] = [];
    const batchOnProgress: MetadataProgressCallback = (progress) => {
      const globalParsed = totalParsed + progress.parsed;
      const globalErrors = totalErrors + progress.errors;

      // Calculate estimated time remaining
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const rate = globalParsed / elapsed; // files per second
      const remaining = files.length - globalParsed;
      const estimatedTimeRemaining = rate > 0 ? Math.round(remaining / rate) : undefined;

      onProgress?.({
        batch: batchNumber,
        totalBatches,
        parsed: globalParsed,
        total: files.length,
        errors: globalErrors,
        saved: totalSaved,
        currentFile: progress.currentFile,
        estimatedTimeRemaining,
      });
    };

    try {
      let results = await parseMetadataForFiles(batchFiles, batchOnProgress, concurrency);
      const sidecarMap = await readSidecarMetadataForTracks(
        libraryRootId,
        results.map((result) => result.trackFileId)
      );
      results = applySidecarToResults(results, sidecarMap);
      batchResults.push(...results);
      
      const batchSuccessCount = results.filter((r) => !r.error && r.tags).length;
      const batchErrorCount = results.filter((r) => r.error).length;
      
      totalParsed += batchFiles.length;
      totalErrors += batchErrorCount;

      // Save this batch to IndexedDB if enabled
      if (saveAfterEachBatch && batchSuccessCount > 0) {
        try {
          await saveTrackMetadata(
            results,
            libraryRootId,
            (saveProgress) => {
              // Progress is already handled by batchOnProgress
            }
          );
          
          totalSaved += batchSuccessCount;

          await applySidecarEnhancements(libraryRootId, sidecarMap);
        } catch (err) {
          logger.error(`Error saving batch ${batchNumber}:`, err);
          
          // Handle quota errors
          if (isQuotaExceededError(err)) {
            const quotaInfo = await getStorageQuotaInfo();
            const quotaMessage = quotaInfo
              ? `Storage quota exceeded while saving batch ${batchNumber}. You're using ${quotaInfo.usagePercent.toFixed(1)}% of available storage.`
              : `Storage quota exceeded while saving batch ${batchNumber}.`;
            
            // Re-throw with context
            throw new Error(`${quotaMessage} Please clean up old data and try again.`);
          }
          
          // Re-throw other errors
          throw err;
        }
      }

      if (allResults) {
        allResults.push(...batchResults);
      }

      // Yield control between batches to keep UI responsive
      // Longer delay for larger batches to ensure UI updates
      if (batchIndex < totalBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (err) {
      logger.error(`Error processing batch ${batchNumber}:`, err);
      
      // If saving failed, we still have the parsed results
      // Continue with next batch but log the error
      if (allResults) {
        allResults.push(...batchResults);
      }
      
      // Re-throw quota errors to stop processing
      if (isQuotaExceededError(err)) {
        throw err;
      }
      
      // For other errors, continue but log them
      // This allows partial success for large libraries
    }
  }

  // Final progress update
  onProgress?.({
    batch: totalBatches,
    totalBatches,
    parsed: totalParsed,
    total: files.length,
    errors: totalErrors,
    saved: totalSaved,
  });

  return {
    results: allResults ?? undefined,
    parsed: totalParsed,
    errors: totalErrors,
    saved: totalSaved,
  };
}

