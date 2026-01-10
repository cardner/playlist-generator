/**
 * Spotify Collection Creator
 * 
 * Creates collections from Spotify export data and stores them in IndexedDB.
 * 
 * @module features/spotify-import/collection-creator
 */

import { db } from "@/db/schema";
import type { LibraryRootRecord } from "@/db/schema";
import type { SpotifyExportData } from "./types";
import { saveSpotifyTracks } from "./track-storage";
import { logger } from "@/lib/logger";

/**
 * Create a Spotify collection from export data
 * 
 * Creates a new LibraryRootRecord with mode="spotify" and stores all tracks.
 * 
 * @param exportData - Parsed Spotify export data
 * @param collectionName - User-provided name for the collection
 * @returns Created LibraryRootRecord
 */
export async function createSpotifyCollection(
  exportData: SpotifyExportData,
  collectionName: string
): Promise<LibraryRootRecord> {
  const now = Date.now();
  const collectionId = `spotify-${now}-${Math.random().toString(36).substr(2, 9)}`;

  // Create library root record
  const libraryRoot: LibraryRootRecord = {
    id: collectionId,
    mode: "spotify",
    name: collectionName,
    spotifyExportMetadata: {
      exportDate: exportData.metadata.exportDate,
      filePaths: exportData.metadata.filePaths,
    },
    createdAt: now,
    updatedAt: now,
  };

  // Save library root
  await db.libraryRoots.put(libraryRoot);

  // Save tracks
  if (exportData.savedTracks.length > 0) {
    await saveSpotifyTracks(exportData.savedTracks, collectionId);
  }

  logger.info(
    `Created Spotify collection "${collectionName}" with ${exportData.savedTracks.length} tracks`
  );

  return libraryRoot;
}

/**
 * Check if a collection is a Spotify collection
 * 
 * @param libraryRoot - LibraryRootRecord to check
 * @returns True if collection is from Spotify import
 */
export function isSpotifyCollection(libraryRoot: LibraryRootRecord): boolean {
  return libraryRoot.mode === "spotify";
}

/**
 * Get Spotify export metadata for a collection
 * 
 * @param libraryRoot - LibraryRootRecord
 * @returns Spotify export metadata or undefined
 */
export function getSpotifyMetadata(
  libraryRoot: LibraryRootRecord
): LibraryRootRecord["spotifyExportMetadata"] {
  return libraryRoot.spotifyExportMetadata;
}

