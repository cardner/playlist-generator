/**
 * Chunked storage operations for large datasets
 */

import { db } from "./schema";
import type { FileIndexRecord, TrackRecord } from "./schema";
import {
  withQuotaErrorHandling,
  checkQuotaBeforeOperation,
  estimateStorageSize,
  type StorageError,
} from "./storage-errors";

const DEFAULT_CHUNK_SIZE = 1000; // Process 1000 records at a time

/**
 * Save file index entries in chunks
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

