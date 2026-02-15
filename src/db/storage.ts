/**
 * Storage Operations for Library Data
 * 
 * This module provides a unified interface for all storage operations.
 * It re-exports functions from specialized storage modules and provides
 * utility functions for clearing data.
 * 
 * @module db/storage
 */

// Re-export types for convenience
export type {
  LibraryRootRecord,
  FileIndexRecord,
  TrackRecord,
  ScanRunRecord,
} from "./schema";

// Re-export GenreWithStats for convenience
export type { GenreWithStats } from "@/features/library/genre-normalization";

// Re-export library root operations
export {
  saveLibraryRoot,
  getLibraryRoot,
  getAllLibraryRoots,
  getCurrentCollectionId,
  setCurrentCollectionId,
  updateCollectionName,
  updateCollection,
  relinkCollectionHandle,
  deleteCollection,
  getCollection,
  getAllCollections,
  getCurrentLibraryRoot,
} from "./storage-library-root";

// Re-export file index operations
export {
  saveFileIndexEntries,
  removeFileIndexEntries,
  getFileIndexEntries,
  getFileIndexEntry,
  getAllFileIndexEntries,
} from "./storage-file-index";

// Re-export track operations
export {
  saveTrackMetadata,
  removeTrackMetadata,
  getTracks,
  getAllTracks,
  updateTrackTempo,
  updateTracksTempo,
} from "./storage-tracks";

// Re-export writeback status operations
export {
  markTrackWritebackPending,
  clearTrackWritebackPending,
  setTrackWritebackError,
  getPendingWritebacks,
  getWritebackStatuses,
} from "./storage-writeback";

// Re-export scan run operations
export {
  createScanRun,
  updateScanRun,
  getScanRuns,
} from "./storage-scan-runs";

// Re-export query operations
export {
  searchTracks,
  filterTracksByGenre,
  getAllArtists,
  getAllAlbums,
  getAllTrackTitles,
  getAllGenres,
  getAllGenresWithStats,
  getGenreCoOccurrence,
  searchArtists,
  searchAlbums,
  searchTrackTitles,
  getTopArtists,
  getTopAlbums,
  getTopTrackTitles,
  searchTracksByArtist,
  searchTracksByAlbum,
  searchTracksByTempo,
  searchTracksByMood,
} from "./storage-queries";

import { db } from "./schema";

/**
 * Clear all library data
 * 
 * WARNING: This permanently deletes all library data including:
 * - All library roots (collections)
 * - All file index entries
 * - All track metadata
 * - All scan run records
 * - All directory handles
 * 
 * This operation cannot be undone. Use with caution.
 * 
 * @example
 * ```typescript
 * // Clear all data (use with caution!)
 * await clearLibraryData();
 * ```
 */
export async function clearLibraryData(): Promise<void> {
  await Promise.all([
    db.libraryRoots.clear(),
    db.fileIndex.clear(),
    db.tracks.clear(),
    db.scanRuns.clear(),
    db.trackWritebacks?.clear?.(),
    db.writebackCheckpoints?.clear?.(),
    db.directoryHandles.clear(),
  ]);
}
