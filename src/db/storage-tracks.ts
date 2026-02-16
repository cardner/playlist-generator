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
import type { MetadataResult, EnhancedMetadata } from "@/features/library/metadata";
import { buildMetadataFingerprint } from "@/features/library/track-identity-utils";

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
  const filtered = results.filter((result) => result.tags && !result.error);
  
  // Build all fingerprints in parallel for performance
  const fingerprints = await Promise.all(
    filtered.map(result => buildMetadataFingerprint(result.tags!, result.tech))
  );
  
  // Fetch existing records to preserve addedAt on re-scan
  const compositeIds = filtered.map((r) => getCompositeId(r.trackFileId, libraryRootId));
  const existingTracks = await db.tracks.bulkGet(compositeIds);
  const existingMap = new Map(
    existingTracks.map((t, i) => (t ? [compositeIds[i], t] : null)).filter(Boolean) as [string, TrackRecord][]
  );
  
  // Build records with pre-computed fingerprints
  const records: TrackRecord[] = filtered.map((result, index) => {
    const id = getCompositeId(result.trackFileId, libraryRootId);
    const existing = existingMap.get(id);
    const addedAt = existing?.addedAt ?? now;
    return {
      id,
      trackFileId: result.trackFileId,
      libraryRootId,
      tags: result.tags!,
      tech: result.tech,
      isrc: result.isrc,
      acoustidId: result.acoustidId,
      metadataFingerprint: fingerprints[index],
      updatedAt: now,
      addedAt,
    };
  });

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
  await db.artworkCache.bulkDelete(compositeIds);
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

/**
 * Update track metadata with manual edits or enhanced metadata
 * 
 * Updates the enhancedMetadata field of a track. Merges new values with existing
 * enhanced metadata, preserving manual edits and tracking which fields were manually edited.
 * 
 * @param trackId - Composite track ID (trackFileId-libraryRootId)
 * @param updates - Partial EnhancedMetadata object with fields to update
 * @param isManualEdit - Whether these updates are manual edits (default: false)
 * 
 * @example
 * ```typescript
 * await updateTrackMetadata('track1-root1', {
 *   genres: ['Rock', 'Metal'],
 *   tempo: 120
 * }, true);
 * ```
 */
export async function updateTrackMetadata(
  trackId: string,
  updates: Partial<EnhancedMetadata>,
  isManualEdit: boolean = false,
  options?: { skipWriteback?: boolean }
): Promise<void> {
  const existing = await db.tracks.get(trackId);
  if (!existing) {
    throw new Error(`Track not found: ${trackId}`);
  }

  const now = Date.now();
  const existingEnhanced = existing.enhancedMetadata || {};
  const existingManualFields = existingEnhanced.manualFields || [];

  // Merge updates with existing enhanced metadata
  const mergedEnhanced: EnhancedMetadata = {
    ...existingEnhanced,
    ...updates,
  };

  // Track which fields were manually edited
  if (isManualEdit) {
    const updatedFields = Object.keys(updates).filter(key => 
      updates[key as keyof EnhancedMetadata] !== undefined
    ) as string[];
    
    const newManualFields = Array.from(new Set([...existingManualFields, ...updatedFields]));
    mergedEnhanced.manualFields = newManualFields;
    mergedEnhanced.manualEditDate = now;
  }

  await db.tracks.update(trackId, {
    enhancedMetadata: mergedEnhanced,
    updatedAt: now,
  });

  if (!options?.skipWriteback) {
    const { markTrackWritebackPending } = await import("./storage-writeback");
    const { getWritebackFieldsFromEnhancedUpdates } = await import(
      "@/features/library/metadata-writeback"
    );
    const fields = getWritebackFieldsFromEnhancedUpdates(updates);
    if (fields.length > 0) {
      await markTrackWritebackPending(existing.trackFileId, existing.libraryRootId, fields);
    }
  }
}

/**
 * Update genres for a specific track
 * 
 * @param trackId - Composite track ID (trackFileId-libraryRootId)
 * @param genres - Array of genre strings
 * @param isManualEdit - Whether this is a manual edit (default: true)
 * 
 * @example
 * ```typescript
 * await updateTrackGenres('track1-root1', ['Rock', 'Metal'], true);
 * ```
 */
export async function updateTrackGenres(
  trackId: string,
  genres: string[],
  isManualEdit: boolean = true
): Promise<void> {
  await updateTrackMetadata(trackId, { genres }, isManualEdit);
}

/**
 * Update mood tags for a specific track
 * 
 * @param trackId - Composite track ID (trackFileId-libraryRootId)
 * @param mood - Array of mood tag strings
 * @param isManualEdit - Whether this is a manual edit (default: true)
 * 
 * @example
 * ```typescript
 * await updateTrackMood('track1-root1', ['energetic', 'uplifting'], true);
 * ```
 */
export async function updateTrackMood(
  trackId: string,
  mood: string[],
  isManualEdit: boolean = true
): Promise<void> {
  await updateTrackMetadata(trackId, { mood }, isManualEdit);
}

/**
 * Update activity tags for a specific track
 *
 * @param trackId - Composite track ID (trackFileId-libraryRootId)
 * @param activity - Array of activity tag strings
 * @param isManualEdit - Whether this is a manual edit (default: true)
 */
export async function updateTrackActivity(
  trackId: string,
  activity: string[],
  isManualEdit: boolean = true
): Promise<void> {
  await updateTrackMetadata(trackId, { activity }, isManualEdit);
}

/**
 * Update tempo/BPM in enhanced metadata for a specific track
 * 
 * This updates the enhancedMetadata.tempo field. For updating tech.bpm,
 * use the existing updateTrackTempo() function.
 * 
 * @param trackId - Composite track ID (trackFileId-libraryRootId)
 * @param tempo - Tempo/BPM value (number) or tempo category (string: "slow", "medium", "fast")
 * @param isManualEdit - Whether this is a manual edit (default: true)
 * @param confidence - Optional confidence score (0-1)
 * @param source - Optional source of BPM data
 * @param method - Optional detection method used
 * 
 * @example
 * ```typescript
 * await updateTrackTempoEnhanced('track1-root1', 120, true, 0.9, 'local-file', 'combined');
 * await updateTrackTempoEnhanced('track1-root1', 'medium', true);
 * ```
 */
export async function updateTrackTempoEnhanced(
  trackId: string,
  tempo: number | "slow" | "medium" | "fast",
  isManualEdit: boolean = true,
  confidence?: number,
  source?: 'id3' | 'local-file' | 'itunes-preview' | 'manual',
  method?: 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined'
): Promise<void> {
  const tempoValue = typeof tempo === "number" ? Math.round(tempo) : tempo;
  await updateTrackMetadata(trackId, { tempo: tempoValue }, isManualEdit);
  
  // Also update tech info if confidence/source/method provided
  if (confidence !== undefined || source !== undefined || method !== undefined) {
    const existing = await db.tracks.get(trackId);
    if (existing) {
      const techUpdate: Partial<import("@/features/library/metadata").TechInfo> = {};
      
      if (typeof tempo === "number") {
        techUpdate.bpm = tempoValue as number;
      }
      if (confidence !== undefined) {
        techUpdate.bpmConfidence = confidence;
      }
      if (source !== undefined) {
        techUpdate.bpmSource = source;
      }
      if (method !== undefined) {
        techUpdate.bpmMethod = method;
      }
      
      await db.tracks.update(trackId, {
        tech: {
          ...existing.tech,
          ...techUpdate,
        },
      });
    }
  }
}

