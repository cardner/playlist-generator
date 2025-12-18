/**
 * Storage operations for library data
 */

import { db, getCompositeId } from "./schema";
import type {
  LibraryRootRecord,
  FileIndexRecord,
  TrackRecord,
  ScanRunRecord,
} from "./schema";

// Re-export types for convenience
export type {
  LibraryRootRecord,
  FileIndexRecord,
  TrackRecord,
  ScanRunRecord,
};
import type { LibraryRoot } from "@/lib/library-selection";
import type { FileIndexEntry } from "@/features/library/scanning";
import type { MetadataResult } from "@/features/library/metadata";
import { getNormalizedGenresWithStats, type GenreWithStats } from "@/features/library/genre-normalization";

// Re-export GenreWithStats for convenience
export type { GenreWithStats } from "@/features/library/genre-normalization";

/**
 * Save or update library root
 * 
 * This function ensures the library root is always saved, even if updating an existing record.
 * It will update the name and handleRef if they've changed.
 * After saving, sets the collection as current.
 */
export async function saveLibraryRoot(
  root: LibraryRoot,
  handleRef?: string
): Promise<LibraryRootRecord> {
  const now = Date.now();
  const id = root.handleId || `root-${now}`;

  // Try to get existing record to preserve createdAt
  const existing = await db.libraryRoots.get(id);
  const createdAt = existing?.createdAt || now;

  const record: LibraryRootRecord = {
    id,
    mode: root.mode,
    name: root.name,
    handleRef: handleRef || existing?.handleRef,
    createdAt,
    updatedAt: now,
  };

  // Use put to insert or update
  await db.libraryRoots.put(record);
  console.log(`saveLibraryRoot: Saved library root record:`, { id, name: root.name, mode: root.mode });
  
  // Set as current collection
  await setCurrentCollectionId(id);
  
  return record;
}

/**
 * Get library root by ID
 */
export async function getLibraryRoot(id: string): Promise<LibraryRootRecord | undefined> {
  return db.libraryRoots.get(id);
}

/**
 * Get all library roots
 */
export async function getAllLibraryRoots(): Promise<LibraryRootRecord[]> {
  return db.libraryRoots.toArray();
}

/**
 * Get current collection ID from settings
 */
export async function getCurrentCollectionId(): Promise<string | undefined> {
  const setting = await db.settings.get("currentCollectionId");
  return setting?.value as string | undefined;
}

/**
 * Set current collection ID in settings
 */
export async function setCurrentCollectionId(id: string): Promise<void> {
  await db.settings.put({
    key: "currentCollectionId",
    value: id,
  });
}

/**
 * Update collection name
 */
export async function updateCollectionName(id: string, name: string): Promise<void> {
  await db.libraryRoots.update(id, {
    name,
    updatedAt: Date.now(),
  });
}

/**
 * Update collection configuration
 */
export async function updateCollection(
  id: string,
  updates: Partial<Pick<LibraryRootRecord, "name" | "handleRef">>
): Promise<void> {
  await db.libraryRoots.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Relink collection directory handle
 */
export async function relinkCollectionHandle(
  id: string,
  newHandleId: string
): Promise<void> {
  await db.libraryRoots.update(id, {
    handleRef: newHandleId,
    updatedAt: Date.now(),
  });
}

/**
 * Delete collection and all associated data
 */
export async function deleteCollection(id: string): Promise<void> {
  // Verify collection exists
  const collection = await db.libraryRoots.get(id);
  if (!collection) {
    throw new Error(`Collection with ID ${id} not found`);
  }

  try {
    // Delete all tracks for this collection
    const tracks = await db.tracks.where("libraryRootId").equals(id).toArray();
    const trackIds = tracks.map(t => t.id);
    if (trackIds.length > 0) {
      await db.tracks.bulkDelete(trackIds);
    }

    // Delete all file index entries for this collection
    const fileIndexEntries = await db.fileIndex.where("libraryRootId").equals(id).toArray();
    const fileIndexIds = fileIndexEntries.map(f => f.id);
    if (fileIndexIds.length > 0) {
      await db.fileIndex.bulkDelete(fileIndexIds);
    }

    // Delete all scan runs for this collection
    const scanRuns = await db.scanRuns.where("libraryRootId").equals(id).toArray();
    const scanRunIds = scanRuns.map(s => s.id);
    if (scanRunIds.length > 0) {
      await db.scanRuns.bulkDelete(scanRunIds);
    }

    // Delete saved playlists for this collection
    const playlists = await db.savedPlaylists.where("libraryRootId").equals(id).toArray();
    const playlistIds = playlists.map(p => p.id);
    if (playlistIds.length > 0) {
      await db.savedPlaylists.bulkDelete(playlistIds);
    }

    // Delete the collection itself
    await db.libraryRoots.delete(id);

    // If this was the current collection, clear the current collection ID
    const currentId = await getCurrentCollectionId();
    if (currentId === id) {
      await db.settings.delete("currentCollectionId");
    }
  } catch (error) {
    console.error(`Failed to delete collection ${id}:`, error);
    throw error; // Re-throw to let caller handle
  }
}

/**
 * Get collection by ID (alias for getLibraryRoot)
 */
export async function getCollection(id: string): Promise<LibraryRootRecord | undefined> {
  return getLibraryRoot(id);
}

/**
 * Get all collections (alias for getAllLibraryRoots)
 */
export async function getAllCollections(): Promise<LibraryRootRecord[]> {
  return getAllLibraryRoots();
}

/**
 * Get current library root (uses currentCollectionId from settings, falls back to most recent)
 */
export async function getCurrentLibraryRoot(): Promise<LibraryRootRecord | undefined> {
  // First check if there's a current collection ID in settings
  const currentId = await getCurrentCollectionId();
  if (currentId) {
    const collection = await db.libraryRoots.get(currentId);
    if (collection) {
      return collection;
    }
    // If the collection doesn't exist, clear the setting
    await db.settings.delete("currentCollectionId");
  }

  // Migration: If no currentCollectionId but collections exist, set the most recent one as current
  const allCollections = await db.libraryRoots.toArray();
  if (allCollections.length > 0) {
    const mostRecent = allCollections.sort((a, b) => b.createdAt - a.createdAt)[0];
    await setCurrentCollectionId(mostRecent.id);
    return mostRecent;
  }

  // No collections exist
  return undefined;
}

/**
 * Save file index entries
 * Uses chunked storage for large datasets to avoid quota errors
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
 * @param trackFileIds Array of trackFileIds to remove
 * @param libraryRootId Library root ID (required to generate composite keys)
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
 */
export async function getFileIndexEntries(
  libraryRootId: string
): Promise<FileIndexRecord[]> {
  return db.fileIndex.where("libraryRootId").equals(libraryRootId).toArray();
}

/**
 * Get all file index entries (across all library roots)
 */
export async function getAllFileIndexEntries(): Promise<FileIndexRecord[]> {
  return db.fileIndex.toArray();
}

/**
 * Save track metadata
 * Uses chunked storage for large datasets to avoid quota errors
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
 * @param trackFileIds Array of trackFileIds to remove
 * @param libraryRootId Library root ID (required to generate composite keys)
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
 */
export async function getTracks(libraryRootId: string): Promise<TrackRecord[]> {
  return db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
}

/**
 * Get all tracks (across all libraries)
 */
export async function getAllTracks(): Promise<TrackRecord[]> {
  return db.tracks.toArray();
}

/**
 * Update tempo (BPM) for a specific track
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
 */
export async function updateTracksTempo(
  updates: Array<{ trackFileId: string; libraryRootId: string; bpm: number }>
): Promise<void> {
  const now = Date.now();
  await Promise.all(
    updates.map(async ({ trackFileId, libraryRootId, bpm }) => {
      const id = getCompositeId(trackFileId, libraryRootId);
      const existing = await db.tracks.get(id);
      if (existing) {
        await db.tracks.update(id, {
          tech: {
            ...existing.tech,
            bpm: Math.round(bpm),
          },
          updatedAt: now,
        });
      }
    })
  );
}

/**
 * Create a scan run record
 * Uses a more robust ID generation to prevent collisions
 */
export async function createScanRun(
  libraryRootId: string,
  total: number,
  added: number,
  changed: number,
  removed: number
): Promise<ScanRunRecord> {
  // Generate ID with timestamp and random component to prevent collisions
  const id = `scan-${libraryRootId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const record: ScanRunRecord = {
    id,
    libraryRootId,
    startedAt: Date.now(),
    total,
    added,
    changed,
    removed,
    parseErrors: 0,
  };

  // Use put instead of add to handle any potential duplicates gracefully
  await db.scanRuns.put(record);
  return record;
}

/**
 * Update scan run with finish time and parse errors
 */
export async function updateScanRun(
  id: string,
  parseErrors: number
): Promise<void> {
  await db.scanRuns.update(id, {
    finishedAt: Date.now(),
    parseErrors,
  });
}

/**
 * Get scan runs for a library root
 */
export async function getScanRuns(
  libraryRootId: string
): Promise<ScanRunRecord[]> {
  return db.scanRuns
    .where("libraryRootId")
    .equals(libraryRootId)
    .sortBy("startedAt");
}

/**
 * Clear all library data
 */
export async function clearLibraryData(): Promise<void> {
  await Promise.all([
    db.libraryRoots.clear(),
    db.fileIndex.clear(),
    db.tracks.clear(),
    db.scanRuns.clear(),
    db.directoryHandles.clear(),
  ]);
}

/**
 * Search tracks by query (searches title, artist, album)
 */
export async function searchTracks(
  query: string,
  libraryRootId?: string
): Promise<TrackRecord[]> {
  const lowerQuery = query.toLowerCase();
  let collection = db.tracks.toCollection();

  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const allTracks = await collection.toArray();

  return allTracks.filter((track) => {
    const title = track.tags.title.toLowerCase();
    const artist = track.tags.artist.toLowerCase();
    const album = track.tags.album.toLowerCase();

    return (
      title.includes(lowerQuery) ||
      artist.includes(lowerQuery) ||
      album.includes(lowerQuery)
    );
  });
}

/**
 * Filter tracks by genre
 */
export async function filterTracksByGenre(
  genre: string,
  libraryRootId?: string
): Promise<TrackRecord[]> {
  let collection = db.tracks.toCollection();

  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const allTracks = await collection.toArray();

  return allTracks.filter((track) =>
    track.tags.genres.some(
      (g) => g.toLowerCase() === genre.toLowerCase()
    )
  );
}

/**
 * Get all unique genres
 */
/**
 * Get all unique artists from library
 */
export async function getAllArtists(libraryRootId?: string): Promise<string[]> {
  let collection = db.tracks;
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId) as any;
  }

  const allTracks = await collection.toArray();
  const artistSet = new Set<string>();
  
  for (const track of allTracks) {
    const artist = track.tags.artist?.trim();
    if (artist && artist !== "Unknown Artist") {
      artistSet.add(artist);
    }
  }

  return Array.from(artistSet).sort();
}

/**
 * Get all unique albums from library
 */
export async function getAllAlbums(libraryRootId?: string): Promise<string[]> {
  let collection = db.tracks;
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId) as any;
  }

  const allTracks = await collection.toArray();
  const albumSet = new Set<string>();
  
  for (const track of allTracks) {
    const album = track.tags.album?.trim();
    if (album && album !== "Unknown Album") {
      albumSet.add(album);
    }
  }

  return Array.from(albumSet).sort();
}

/**
 * Get all unique track titles from library
 */
export async function getAllTrackTitles(libraryRootId?: string): Promise<string[]> {
  let collection = db.tracks;
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId) as any;
  }

  const allTracks = await collection.toArray();
  const titleSet = new Set<string>();
  
  for (const track of allTracks) {
    const title = track.tags.title?.trim();
    if (title && title !== "Unknown Title") {
      titleSet.add(title);
    }
  }

  return Array.from(titleSet).sort();
}

export async function getAllGenres(libraryRootId?: string): Promise<string[]> {
  const genresWithStats = await getAllGenresWithStats(libraryRootId);
  return genresWithStats.map((g) => g.normalized);
}

/**
 * Get all normalized genres with statistics (track counts)
 */
export async function getAllGenresWithStats(
  libraryRootId?: string
): Promise<GenreWithStats[]> {
  let tracks: TrackRecord[];

  if (libraryRootId) {
    tracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
  } else {
    tracks = await db.tracks.toArray();
  }

  return getNormalizedGenresWithStats(tracks);
}

