/**
 * Spotify Re-import Detection
 * 
 * Detects if user is re-importing the same Spotify export and updates
 * existing collection instead of creating duplicates.
 * 
 * @module features/spotify-import/reimport
 */

import { db } from "@/db/schema";
import type { LibraryRootRecord } from "@/db/schema";
import type { SpotifyExportData } from "./types";
import { saveSpotifyTracks } from "./track-storage";
import { logger } from "@/lib/logger";

/**
 * Check if an export matches an existing collection
 * 
 * Compares export metadata (file paths, export date) to find matching collections.
 * 
 * @param exportData - Parsed Spotify export data
 * @returns Matching collection or null
 */
export async function findMatchingCollection(
  exportData: SpotifyExportData
): Promise<LibraryRootRecord | null> {
  const allCollections = await db.libraryRoots
    .where("mode")
    .equals("spotify")
    .toArray();

  for (const collection of allCollections) {
    const metadata = collection.spotifyExportMetadata;
    if (!metadata) continue;

    // Check if file paths match (exact match)
    const collectionPaths = new Set(metadata.filePaths.map((p) => p.toLowerCase()));
    const exportPaths = new Set(exportData.metadata.filePaths.map((p) => p.toLowerCase()));

    if (collectionPaths.size === exportPaths.size) {
      let allMatch = true;
      for (const path of exportPaths) {
        if (!collectionPaths.has(path)) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        return collection;
      }
    }
  }

  return null;
}

/**
 * Update existing collection with new export data
 * 
 * Merges new tracks and playlists into existing collection.
 * 
 * @param collection - Existing collection to update
 * @param exportData - New export data
 * @returns Updated collection
 */
export async function updateCollectionWithExport(
  collection: LibraryRootRecord,
  exportData: SpotifyExportData
): Promise<LibraryRootRecord> {
  const now = Date.now();

  // Update metadata
  const updatedCollection: LibraryRootRecord = {
    ...collection,
    spotifyExportMetadata: {
      exportDate: exportData.metadata.exportDate,
      filePaths: exportData.metadata.filePaths,
    },
    updatedAt: now,
  };

  await db.libraryRoots.put(updatedCollection);

  // Add new tracks (saveSpotifyTracks handles deduplication via trackFileId)
  if (exportData.savedTracks.length > 0) {
    await saveSpotifyTracks(exportData.savedTracks, collection.id);
  }

  logger.info(`Updated Spotify collection ${collection.id} with new export data`);

  return updatedCollection;
}

/**
 * Check if collection should be updated or created new
 * 
 * @param exportData - Parsed Spotify export data
 * @returns Object with action and existing collection (if found)
 */
export async function checkReimport(
  exportData: SpotifyExportData
): Promise<{
  action: "update" | "create";
  existingCollection: LibraryRootRecord | null;
}> {
  const existing = await findMatchingCollection(exportData);

  if (existing) {
    return {
      action: "update",
      existingCollection: existing,
    };
  }

  return {
    action: "create",
    existingCollection: null,
  };
}

