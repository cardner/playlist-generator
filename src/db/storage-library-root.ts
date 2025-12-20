/**
 * Library Root and Collection Storage Operations
 * 
 * This module handles all storage operations related to library roots (collections),
 * including creating, updating, retrieving, and deleting collections.
 * 
 * @module db/storage-library-root
 */

import { db } from "./schema";
import type { LibraryRootRecord } from "./schema";
import type { LibraryRoot } from "@/lib/library-selection";

/**
 * Save or update library root
 * 
 * This function ensures the library root is always saved, even if updating an existing record.
 * It will update the name and handleRef if they've changed.
 * After saving, sets the collection as current.
 * 
 * @param root - Library root to save
 * @param handleRef - Optional handle reference for File System Access API
 * @returns The saved library root record
 * 
 * @example
 * ```typescript
 * const record = await saveLibraryRoot(root, handleRef);
 * ```
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
  
  // Set as current collection
  await setCurrentCollectionId(id);
  
  return record;
}

/**
 * Get library root by ID
 * 
 * @param id - Library root ID
 * @returns Library root record or undefined if not found
 */
export async function getLibraryRoot(id: string): Promise<LibraryRootRecord | undefined> {
  return db.libraryRoots.get(id);
}

/**
 * Get all library roots
 * 
 * @returns Array of all library root records
 */
export async function getAllLibraryRoots(): Promise<LibraryRootRecord[]> {
  return db.libraryRoots.toArray();
}

/**
 * Get current collection ID from settings
 * 
 * @returns Current collection ID or undefined if not set
 */
export async function getCurrentCollectionId(): Promise<string | undefined> {
  const setting = await db.settings.get("currentCollectionId");
  return setting?.value as string | undefined;
}

/**
 * Set current collection ID in settings
 * 
 * @param id - Collection ID to set as current
 */
export async function setCurrentCollectionId(id: string): Promise<void> {
  await db.settings.put({
    key: "currentCollectionId",
    value: id,
  });
}

/**
 * Update collection name
 * 
 * @param id - Collection ID
 * @param name - New collection name
 */
export async function updateCollectionName(id: string, name: string): Promise<void> {
  await db.libraryRoots.update(id, {
    name,
    updatedAt: Date.now(),
  });
}

/**
 * Update collection configuration
 * 
 * @param id - Collection ID
 * @param updates - Partial updates to apply (name and/or handleRef)
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
 * 
 * Updates the handle reference for a collection when the directory
 * has been moved or re-selected.
 * 
 * @param id - Collection ID
 * @param newHandleId - New handle ID reference
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
 * 
 * This function performs a cascading delete, removing:
 * - All tracks for the collection
 * - All file index entries for the collection
 * - All scan runs for the collection
 * - All saved playlists for the collection
 * - The collection record itself
 * 
 * If this was the current collection, clears the current collection ID setting.
 * 
 * @param id - Collection ID to delete
 * @throws Error if collection not found or deletion fails
 * 
 * @example
 * ```typescript
 * try {
 *   await deleteCollection(collectionId);
 *   console.log('Collection deleted successfully');
 * } catch (error) {
 *   console.error('Failed to delete collection:', error);
 * }
 * ```
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

    // Delete all scan checkpoints for this collection
    const { deleteCheckpointsForLibrary } = await import("./storage-scan-checkpoints");
    await deleteCheckpointsForLibrary(id);

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
    const { logger } = await import("@/lib/logger");
    logger.error(`Failed to delete collection ${id}:`, error);
    throw error; // Re-throw to let caller handle
  }
}

/**
 * Get collection by ID (alias for getLibraryRoot)
 * 
 * @param id - Collection ID
 * @returns Collection record or undefined if not found
 */
export async function getCollection(id: string): Promise<LibraryRootRecord | undefined> {
  return getLibraryRoot(id);
}

/**
 * Get all collections (alias for getAllLibraryRoots)
 * 
 * @returns Array of all collection records
 */
export async function getAllCollections(): Promise<LibraryRootRecord[]> {
  return getAllLibraryRoots();
}

/**
 * Get current library root
 * 
 * Uses currentCollectionId from settings, falls back to most recent collection.
 * If no collections exist, returns undefined.
 * 
 * @returns Current library root record or undefined if no collections exist
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

