/**
 * Track Storage Operations
 * 
 * This module handles all storage operations related to track metadata,
 * including saving, retrieving, updating, and deleting track records.
 * 
 * @module db/storage-tracks
 */

import { db, getCompositeId } from "./schema";
import type { TrackRecord } from "./schema";
import type { MetadataResult } from "@/features/library/metadata";

/**
 * Save track metadata
 * 
 * Uses chunked storage for large datasets to avoid quota errors.
 * Filters out tracks with errors or missing tags before saving.
 * Supports progress callbacks for long-running operations.
 * 
 * @param results - Metadata parsing results
 * @param libraryRootId - Library root ID
 * @param onProgress - Optional progress callback
 * 
 * @example
 * ```typescript
 * await saveTrackMetadata(results, libraryRootId, (progress) => {
 *   console.log(`Saved ${progress.processed} of ${progress.total} tracks`);
 * });
 * ```
 */
export async function saveTrackMetadata(
  results: MetadataResult[],
  libraryRootId: string,
  onProgress?: (progress: { processed: number; total: number }) => void
): Promise<void> {
  const now = Date.now();
  const records: TrackRecord[] = results
    .filter((result) => result.tags && !result.error)
    .map((result) => ({
      id: getCompositeId(result.trackFileId, libraryRootId),
      trackFileId: result.trackFileId,
      libraryRootId,
      tags: result.tags!,
      tech: result.tech,
      updatedAt: now,
    }));

  // Use chunked storage for large datasets
  if (records.length > 1000) {
    const { saveTrackMetadataChunked } = await import("./storage-chunking");
    await saveTrackMetadataChunked(records, 1000, onProgress);
  } else {
    const { withQuotaErrorHandling } = await import("./storage-errors");
    await withQuotaErrorHandling(
      () => db.tracks.bulkPut(records),
      "saving track metadata"
    );
  }
}

/**
 * Remove track metadata by trackFileId and libraryRootId
 * 
 * @param trackFileIds - Array of trackFileIds to remove
 * @param libraryRootId - Library root ID (required to generate composite keys)
 * 
 * @example
 * ```typescript
 * await removeTrackMetadata(['track1', 'track2'], libraryRootId);
 * ```
 */
export async function removeTrackMetadata(
  trackFileIds: string[],
  libraryRootId: string
): Promise<void> {
  const compositeIds = trackFileIds.map(id => getCompositeId(id, libraryRootId));
  await db.tracks.bulkDelete(compositeIds);
}

/**
 * Get all tracks for a library root
 * 
 * @param libraryRootId - Library root ID
 * @returns Array of track records
 */
export async function getTracks(libraryRootId: string): Promise<TrackRecord[]> {
  return db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
}

/**
 * Get all tracks (across all libraries)
 * 
 * @returns Array of all track records
 */
export async function getAllTracks(): Promise<TrackRecord[]> {
  return db.tracks.toArray();
}

/**
 * Update tempo (BPM) for a specific track
 * 
 * @param trackFileId - Track file ID
 * @param libraryRootId - Library root ID
 * @param bpm - BPM value to set (will be rounded)
 * @throws Error if track not found
 * 
 * @example
 * ```typescript
 * await updateTrackTempo('track1', libraryRootId, 120);
 * ```
 */
export async function updateTrackTempo(
  trackFileId: string,
  libraryRootId: string,
  bpm: number
): Promise<void> {
  const id = getCompositeId(trackFileId, libraryRootId);
  const existing = await db.tracks.get(id);
  if (!existing) {
    throw new Error(`Track not found: ${trackFileId}`);
  }
  await db.tracks.update(id, {
    tech: {
      ...existing.tech,
      bpm: Math.round(bpm),
    },
    updatedAt: Date.now(),
  });
}

/**
 * Update tempo (BPM) for multiple tracks
 * 
 * Uses bulk operations for better performance. Fetches all tracks in a single
 * query, then performs batch updates.
 * 
 * @param updates - Array of tempo updates
 * 
 * @example
 * ```typescript
 * await updateTracksTempo([
 *   { trackFileId: 'track1', libraryRootId: 'root1', bpm: 120 },
 *   { trackFileId: 'track2', libraryRootId: 'root1', bpm: 140 },
 * ]);
 * ```
 */
export async function updateTracksTempo(
  updates: Array<{ trackFileId: string; libraryRootId: string; bpm: number }>
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const now = Date.now();
  
  // Generate composite IDs for bulk lookup
  const compositeIds = updates.map(({ trackFileId, libraryRootId }) =>
    getCompositeId(trackFileId, libraryRootId)
  );

  // Bulk fetch all tracks in one query
  const existingTracks = await db.tracks.bulkGet(compositeIds);
  
  // Prepare updates for bulk operation
  const updatesToApply: TrackRecord[] = [];
  for (let i = 0; i < updates.length; i++) {
    const existing = existingTracks[i];
    if (existing) {
      const { bpm } = updates[i];
      updatesToApply.push({
        ...existing,
        tech: {
          ...existing.tech,
          bpm: Math.round(bpm),
        },
        updatedAt: now,
      });
    }
  }

  // Bulk update all tracks at once
  if (updatesToApply.length > 0) {
    await db.tracks.bulkPut(updatesToApply);
  }
}

