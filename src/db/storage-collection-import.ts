/**
 * Collection Export and Import Storage Operations
 * 
 * This module handles exporting collections to JSON files and importing them back.
 * Exports include all collection data: metadata, tracks, file index, scan runs, and saved playlists.
 * 
 * @module db/storage-collection-import
 */

import { db } from "./schema";
import type {
  LibraryRootRecord,
  TrackRecord,
  FileIndexRecord,
  ScanRunRecord,
  SavedPlaylistRecord,
} from "./schema";
import { getCompositeId } from "./schema";
import { logger } from "@/lib/logger";

/**
 * Collection export format
 */
export interface CollectionExport {
  /** Export format version */
  version: string;
  /** Timestamp when export was created (Unix epoch milliseconds) */
  exportedAt: number;
  /** Collection metadata (without handleRef) */
  collection: Omit<LibraryRootRecord, "handleRef">;
  /** All tracks in the collection */
  tracks: TrackRecord[];
  /** All file index entries in the collection */
  fileIndex: FileIndexRecord[];
  /** All scan runs for the collection */
  scanRuns: ScanRunRecord[];
  /** All saved playlists for the collection */
  savedPlaylists: SavedPlaylistRecord[];
}

/**
 * Import options
 */
export interface ImportOptions {
  /** Whether to replace existing collection with same name */
  replaceExisting: boolean;
  /** New collection name (if creating new collection) */
  newName?: string;
  /** Whether to set imported collection as current */
  setAsCurrent?: boolean;
}

const EXPORT_VERSION = "1.0.0";

/**
 * Export a collection to JSON format
 * 
 * @param collectionId - Collection ID to export
 * @returns Promise resolving to export data
 * @throws Error if collection not found or export fails
 */
export async function exportCollection(collectionId: string): Promise<CollectionExport> {
  // Get collection
  const collection = await db.libraryRoots.get(collectionId);
  if (!collection) {
    throw new Error(`Collection with ID ${collectionId} not found`);
  }

  // Load all related data
  const [tracks, fileIndex, scanRuns, savedPlaylists] = await Promise.all([
    db.tracks.where("libraryRootId").equals(collectionId).toArray(),
    db.fileIndex.where("libraryRootId").equals(collectionId).toArray(),
    db.scanRuns.where("libraryRootId").equals(collectionId).toArray(),
    db.savedPlaylists.where("libraryRootId").equals(collectionId).toArray(),
  ]);

  // Create export object (remove handleRef as it can't be serialized)
  const { handleRef, ...collectionWithoutHandle } = collection;

  const exportData: CollectionExport = {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    collection: collectionWithoutHandle,
    tracks,
    fileIndex,
    scanRuns,
    savedPlaylists,
  };

  return exportData;
}

/**
 * Validate export format
 * 
 * @param data - Data to validate
 * @returns True if data is valid CollectionExport
 */
export function validateExportFormat(data: unknown): data is CollectionExport {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check required fields
  if (
    typeof obj.version !== "string" ||
    typeof obj.exportedAt !== "number" ||
    !obj.collection ||
    !Array.isArray(obj.tracks) ||
    !Array.isArray(obj.fileIndex) ||
    !Array.isArray(obj.scanRuns) ||
    !Array.isArray(obj.savedPlaylists)
  ) {
    return false;
  }

  // Check collection structure
  const collection = obj.collection as Record<string, unknown>;
  if (
    typeof collection.id !== "string" ||
    typeof collection.name !== "string" ||
    typeof collection.mode !== "string" ||
    typeof collection.createdAt !== "number" ||
    typeof collection.updatedAt !== "number"
  ) {
    return false;
  }

  return true;
}

/**
 * Check if a collection name already exists
 * 
 * @param name - Collection name to check
 * @param excludeId - Optional collection ID to exclude from check
 * @returns True if name exists
 */
export async function checkCollectionNameExists(
  name: string,
  excludeId?: string
): Promise<boolean> {
  const allCollections = await db.libraryRoots.toArray();
  return allCollections.some(
    (c) => c.id !== excludeId && c.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Generate a unique collection name
 * 
 * @param baseName - Base name to make unique
 * @returns Unique collection name
 */
export async function generateUniqueCollectionName(baseName: string): Promise<string> {
  let name = baseName;
  let counter = 1;

  while (await checkCollectionNameExists(name)) {
    name = `${baseName} (${counter})`;
    counter++;
  }

  return name;
}

/**
 * Import a collection from export data
 * 
 * @param exportData - Collection export data
 * @param options - Import options
 * @returns Promise resolving to new collection ID
 * @throws Error if import fails
 */
export async function importCollection(
  exportData: CollectionExport,
  options: ImportOptions
): Promise<string> {
  // Validate export format
  if (!validateExportFormat(exportData)) {
    throw new Error("Invalid export format");
  }

  // Generate new collection ID to avoid conflicts
  const newCollectionId = `root-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Determine collection name
  let collectionName = exportData.collection.name;
  if (options.replaceExisting) {
    // Find existing collection with same name and delete it
    const existingCollections = await db.libraryRoots.toArray();
    const existing = existingCollections.find(
      (c) => c.name.toLowerCase() === collectionName.toLowerCase()
    );
    if (existing) {
      // Delete existing collection (this will cascade delete all related data)
      const { deleteCollection } = await import("./storage-library-root");
      await deleteCollection(existing.id);
    }
  } else if (options.newName) {
    collectionName = options.newName;
  } else {
    // Generate unique name
    collectionName = await generateUniqueCollectionName(collectionName);
  }

  // Create new collection record
  const newCollection: LibraryRootRecord = {
    ...exportData.collection,
    id: newCollectionId,
    name: collectionName,
    handleRef: undefined, // Can't import handleRef (browser-specific)
    createdAt: Date.now(), // Use current time for imported collection
    updatedAt: Date.now(),
  };

  // Generate ID mappings for all records
  const trackIdMap = new Map<string, string>(); // Maps old trackFileId -> new trackFileId
  const trackCompositeIdMap = new Map<string, string>(); // Maps old composite ID -> new composite ID
  const fileIndexIdMap = new Map<string, string>();
  const scanRunIdMap = new Map<string, string>();
  const playlistIdMap = new Map<string, string>();

  // Generate new track IDs and update references
  let trackCounter = 0;
  const newTracks: TrackRecord[] = exportData.tracks.map((track) => {
    const newTrackFileId = `file-${Date.now()}-${trackCounter++}-${Math.random().toString(36).substring(2, 9)}`;
    const newId = getCompositeId(newTrackFileId, newCollectionId);
    trackCompositeIdMap.set(track.id, newId);
    trackIdMap.set(track.trackFileId, newTrackFileId);

    return {
      ...track,
      id: newId,
      trackFileId: newTrackFileId,
      libraryRootId: newCollectionId,
      updatedAt: Date.now(),
    };
  });

  // Generate new file index IDs
  const newFileIndex: FileIndexRecord[] = exportData.fileIndex.map((entry) => {
    const newTrackFileId = trackIdMap.get(entry.trackFileId) || entry.trackFileId;
    const newId = getCompositeId(newTrackFileId, newCollectionId);
    fileIndexIdMap.set(entry.id, newId);

    return {
      ...entry,
      id: newId,
      trackFileId: newTrackFileId,
      libraryRootId: newCollectionId,
      updatedAt: Date.now(),
    };
  });

  // Generate new scan run IDs
  const newScanRuns: ScanRunRecord[] = exportData.scanRuns.map((run) => {
    const newId = `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    scanRunIdMap.set(run.id, newId);

    return {
      ...run,
      id: newId,
      libraryRootId: newCollectionId,
    };
  });

  // Generate new playlist IDs and update track references
  const newPlaylists: SavedPlaylistRecord[] = exportData.savedPlaylists.map((playlist) => {
    const newId = `playlist-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    playlistIdMap.set(playlist.id, newId);

    // Update trackFileIds to use new IDs
    const newTrackFileIds = playlist.trackFileIds.map(
      (oldTrackFileId) => trackIdMap.get(oldTrackFileId) || oldTrackFileId
    );

    // Convert Maps to Records for serialization
    const genreMix =
      playlist.summary.genreMix instanceof Map
        ? Object.fromEntries(playlist.summary.genreMix)
        : playlist.summary.genreMix;
    const tempoMix =
      playlist.summary.tempoMix instanceof Map
        ? Object.fromEntries(playlist.summary.tempoMix)
        : playlist.summary.tempoMix;
    const artistMix =
      playlist.summary.artistMix instanceof Map
        ? Object.fromEntries(playlist.summary.artistMix)
        : playlist.summary.artistMix;

    return {
      ...playlist,
      id: newId,
      trackFileIds: newTrackFileIds,
      libraryRootId: newCollectionId,
      summary: {
        ...playlist.summary,
        genreMix,
        tempoMix,
        artistMix,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  try {
    // Save all data in transaction
    await db.transaction("rw", [db.libraryRoots, db.tracks, db.fileIndex, db.scanRuns, db.savedPlaylists], async () => {
      // Save collection
      await db.libraryRoots.put(newCollection);

      // Save tracks
      if (newTracks.length > 0) {
        await db.tracks.bulkPut(newTracks);
      }

      // Save file index
      if (newFileIndex.length > 0) {
        await db.fileIndex.bulkPut(newFileIndex);
      }

      // Save scan runs
      if (newScanRuns.length > 0) {
        await db.scanRuns.bulkPut(newScanRuns);
      }

      // Save playlists
      if (newPlaylists.length > 0) {
        await db.savedPlaylists.bulkPut(newPlaylists);
      }
    });

    // Set as current collection if requested
    if (options.setAsCurrent) {
      const { setCurrentCollectionId } = await import("./storage-library-root");
      await setCurrentCollectionId(newCollectionId);
    }

    return newCollectionId;
  } catch (error) {
    logger.error("Failed to import collection:", error);
    throw new Error(`Failed to import collection: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

