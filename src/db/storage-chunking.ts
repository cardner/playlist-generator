/**
 * Chunked Storage Operations for Large Datasets
 * 
 * This module provides chunked storage operations to handle large datasets
 * efficiently while avoiding browser quota errors and keeping the UI responsive.
 * 
 * Key Features:
 * - Processes records in configurable chunk sizes (default: 1000)
 * - Yields to UI thread periodically to prevent freezing
 * - Handles quota errors gracefully with retry logic
 * - Supports progress callbacks for long-running operations
 * 
 * @module db/storage-chunking
 * 
 * @example
 * ```typescript
 * // Save 10,000 file index entries in chunks
 * await saveFileIndexEntriesChunked(entries, 1000, (progress) => {
 *   console.log(`Processed ${progress.processed} of ${progress.total}`);
 * });
 * ```
 */

import { db } from "./schema";
import type { FileIndexRecord, TrackRecord } from "./schema";
import {
  withQuotaErrorHandling,
  checkQuotaBeforeOperation,
  estimateStorageSize,
  type StorageError,
} from "./storage-errors";

/**
 * Default chunk size for batch operations
 * 
 * Processing 1000 records at a time balances performance with memory usage
 * and prevents UI freezing. Adjust based on average record size and available memory.
 */
const DEFAULT_CHUNK_SIZE = 1000;

/**
 * Save file index entries in chunks
 * 
 * Processes file index entries in batches to avoid quota errors and keep
 * the UI responsive. Automatically handles quota errors with retry logic.
 * 
 * Performance: Yields to UI thread every 5 chunks to prevent freezing.
 * 
 * @param entries - File index entries to save
 * @param chunkSize - Number of records per chunk (default: 1000)
 * @param onProgress - Optional progress callback
 * 
 * @example
 * ```typescript
 * await saveFileIndexEntriesChunked(entries, 1000, (progress) => {
 *   updateProgressBar(progress.processed / progress.total);
 * });
 * ```
 */
export async function saveFileIndexEntriesChunked(
  entries: FileIndexRecord[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  onProgress?: (progress: { processed: number; total: number }) => void
): Promise<void> {
  const total = entries.length;
  let processed = 0;

  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    
    await withQuotaErrorHandling(async () => {
      await db.fileIndex.bulkPut(chunk);
    }, `saving file index entries (chunk ${Math.floor(i / chunkSize) + 1})`);

    processed += chunk.length;
    onProgress?.({ processed, total });
    
    // Yield to UI thread periodically
    if (i % (chunkSize * 5) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

/**
 * Save track metadata in chunks
 * 
 * Processes track records in batches to avoid quota errors and keep
 * the UI responsive. Track records are typically larger than file index
 * entries, so this function uses the same chunking strategy.
 * 
 * Performance: Yields to UI thread every 5 chunks to prevent freezing.
 * 
 * @param tracks - Track records to save
 * @param chunkSize - Number of records per chunk (default: 1000)
 * @param onProgress - Optional progress callback
 * 
 * @example
 * ```typescript
 * await saveTrackMetadataChunked(tracks, 1000, (progress) => {
 *   console.log(`Saved ${progress.processed} of ${progress.total} tracks`);
 * });
 * ```
 */
export async function saveTrackMetadataChunked(
  tracks: TrackRecord[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  onProgress?: (progress: { processed: number; total: number }) => void
): Promise<void> {
  const total = tracks.length;
  let processed = 0;

  for (let i = 0; i < tracks.length; i += chunkSize) {
    const chunk = tracks.slice(i, i + chunkSize);
    
    await withQuotaErrorHandling(async () => {
      await db.tracks.bulkPut(chunk);
    }, `saving track metadata (chunk ${Math.floor(i / chunkSize) + 1})`);

    processed += chunk.length;
    onProgress?.({ processed, total });
    
    // Yield to UI thread periodically
    if (i % (chunkSize * 5) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

/**
 * Delete entries in chunks
 * 
 * Deletes database entries in batches to avoid quota errors and keep
 * the UI responsive. Supports tracks, fileIndex, and scanRuns tables.
 * 
 * Performance: Yields to UI thread every 5 chunks to prevent freezing.
 * 
 * @param ids - Array of record IDs to delete
 * @param table - Table name to delete from
 * @param chunkSize - Number of IDs per chunk (default: 1000)
 * @param onProgress - Optional progress callback
 * 
 * @example
 * ```typescript
 * await deleteEntriesChunked(trackIds, 'tracks', 1000, (progress) => {
 *   console.log(`Deleted ${progress.processed} of ${progress.total}`);
 * });
 * ```
 */
export async function deleteEntriesChunked(
  ids: string[],
  table: "tracks" | "fileIndex" | "scanRuns",
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  onProgress?: (progress: { processed: number; total: number }) => void
): Promise<void> {
  const total = ids.length;
  let processed = 0;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    
    await withQuotaErrorHandling(async () => {
      await db[table].bulkDelete(chunk);
    }, `deleting ${table} entries (chunk ${Math.floor(i / chunkSize) + 1})`);

    processed += chunk.length;
    onProgress?.({ processed, total });
    
    // Yield to UI thread periodically
    if (i % (chunkSize * 5) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

/**
 * Check quota before large operation and warn if needed
 * 
 * Estimates storage requirements for a large operation and checks if
 * there's enough quota available. Returns warnings if storage is near limit.
 * 
 * @param recordCount - Number of records to be stored
 * @param avgRecordSizeBytes - Average size per record in bytes (default: 500)
 * @returns Object with allowed status, optional warning message, and quota info
 * 
 * @example
 * ```typescript
 * const check = await checkQuotaForLargeOperation(10000, 500);
 * if (!check.allowed) {
 *   alert(check.warning);
 *   return;
 * }
 * ```
 */
export async function checkQuotaForLargeOperation(
  recordCount: number,
  avgRecordSizeBytes: number = 500 // Estimate: ~500 bytes per track record
): Promise<{ allowed: boolean; warning?: string; quotaInfo?: any }> {
  const estimatedSize = estimateStorageSize(recordCount, avgRecordSizeBytes);
  const { allowed, quotaInfo } = await checkQuotaBeforeOperation(estimatedSize, 0.85);

  if (!allowed && quotaInfo) {
    const warning = `This operation would use approximately ${formatBytes(estimatedSize)}. Your storage is ${quotaInfo.usagePercent.toFixed(1)}% full. Consider cleaning up old data first.`;
    return { allowed: false, warning, quotaInfo };
  }

  if (quotaInfo?.isNearLimit) {
    const warning = `Storage is ${quotaInfo.usagePercent.toFixed(1)}% full. Consider cleaning up old data.`;
    return { allowed: true, warning, quotaInfo };
  }

  return { allowed: true, quotaInfo };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

