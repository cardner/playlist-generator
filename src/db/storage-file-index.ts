/**
 * File Index Storage Operations
 * 
 * This module handles all storage operations related to file index entries,
 * which track the physical files in the music library.
 * 
 * @module db/storage-file-index
 */

import { db, getCompositeId } from "./schema";
import type { FileIndexRecord } from "./schema";
import type { FileIndexEntry } from "@/features/library/scanning";

/**
 * Save file index entries
 * 
 * Uses chunked storage for large datasets to avoid quota errors.
 * Supports progress callbacks for long-running operations.
 * 
 * @param entries - File index entries to save
 * @param libraryRootId - Library root ID
 * @param onProgress - Optional progress callback
 * 
 * @example
 * ```typescript
 * await saveFileIndexEntries(entries, libraryRootId, (progress) => {
 *   console.log(`Processed ${progress.processed} of ${progress.total}`);
 * });
 * ```
 */
export async function saveFileIndexEntries(
  entries: FileIndexEntry[],
  libraryRootId: string,
  onProgress?: (progress: { processed: number; total: number }) => void
): Promise<void> {
  const now = Date.now();
  const records: FileIndexRecord[] = entries.map((entry) => ({
    id: getCompositeId(entry.trackFileId, libraryRootId),
    trackFileId: entry.trackFileId,
    libraryRootId,
    relativePath: entry.relativePath,
    name: entry.name,
    extension: entry.extension,
    size: entry.size,
    mtime: entry.mtime,
    updatedAt: now,
  }));

  // Use chunked storage for large datasets
  if (records.length > 1000) {
    const { saveFileIndexEntriesChunked } = await import("./storage-chunking");
    await saveFileIndexEntriesChunked(records, 1000, onProgress);
  } else {
    const { withQuotaErrorHandling } = await import("./storage-errors");
    await withQuotaErrorHandling(
      () => db.fileIndex.bulkPut(records),
      "saving file index entries"
    );
  }
}

/**
 * Remove file index entries by trackFileId and libraryRootId
 * 
 * @param trackFileIds - Array of trackFileIds to remove
 * @param libraryRootId - Library root ID (required to generate composite keys)
 * 
 * @example
 * ```typescript
 * await removeFileIndexEntries(['track1', 'track2'], libraryRootId);
 * ```
 */
export async function removeFileIndexEntries(
  trackFileIds: string[],
  libraryRootId: string
): Promise<void> {
  const compositeIds = trackFileIds.map(id => getCompositeId(id, libraryRootId));
  await db.fileIndex.bulkDelete(compositeIds);
}

/**
 * Get all file index entries for a library root
 * 
 * @param libraryRootId - Library root ID
 * @returns Array of file index records
 */
export async function getFileIndexEntries(
  libraryRootId: string
): Promise<FileIndexRecord[]> {
  return db.fileIndex.where("libraryRootId").equals(libraryRootId).toArray();
}

/**
 * Get file index entry by trackFileId and libraryRootId
 * 
 * @param trackFileId - Track file ID
 * @param libraryRootId - Library root ID
 * @returns File index record or undefined if not found
 */
export async function getFileIndexEntry(
  trackFileId: string,
  libraryRootId: string
): Promise<FileIndexRecord | undefined> {
  const id = getCompositeId(trackFileId, libraryRootId);
  return db.fileIndex.get(id);
}

/**
 * Get all file index entries (across all library roots)
 * 
 * @returns Array of all file index records
 */
export async function getAllFileIndexEntries(): Promise<FileIndexRecord[]> {
  return db.fileIndex.toArray();
}

