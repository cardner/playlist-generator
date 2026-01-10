/**
 * Library relink functionality
 * 
 * Allows users to re-pick library root and match existing tracks
 * by relativePath + size/mtime
 */

import type { LibraryRoot } from "@/lib/library-selection";
import { pickLibraryRoot } from "@/lib/library-selection";
import { getLibraryFiles } from "@/lib/library-selection";
import { buildFileIndex } from "./scanning";
import { db, getCompositeId } from "@/db/schema";
import type { FileIndexRecord, TrackRecord } from "@/db/schema";
import { saveLibraryRoot } from "@/db/storage";
import { logger } from "@/lib/logger";

export interface RelinkResult {
  success: boolean;
  matched: number;
  unmatched: number;
  total: number;
  newRootId: string;
  errors?: string[];
}

export interface RelinkProgress {
  scanned: number;
  matched: number;
  currentFile?: string;
}

/**
 * Relink library root by matching tracks
 * 
 * @param oldRootId Old library root ID
 * @param onProgress Optional progress callback
 * @returns Promise resolving to relink result
 */
export async function relinkLibraryRoot(
  oldRootId: string,
  onProgress?: (progress: RelinkProgress) => void
): Promise<RelinkResult> {
  try {
    // Get old library root and tracks
    const oldRoot = await db.libraryRoots.get(oldRootId);
    if (!oldRoot) {
      throw new Error("Old library root not found");
    }

    const oldTracks = await db.tracks
      .where("libraryRootId")
      .equals(oldRootId)
      .toArray();
    const oldFileIndex = await db.fileIndex
      .where("libraryRootId")
      .equals(oldRootId)
      .toArray();

    if (oldTracks.length === 0 && oldFileIndex.length === 0) {
      throw new Error("No tracks or file index found for old library root. Please scan your library first before relinking.");
    }
    
    // If we have file index but no tracks, that's okay - we can still relink
    if (oldTracks.length === 0 && oldFileIndex.length > 0) {
      logger.warn("No tracks found, but file index exists. Relinking file index only.");
    }

    // Build a lookup map: relativePath + size + mtime -> trackFileId
    const oldTrackMap = new Map<string, string>();
    for (const fileEntry of oldFileIndex) {
      if (fileEntry.relativePath) {
        const key = `${fileEntry.relativePath}|${fileEntry.size}|${fileEntry.mtime}`;
        oldTrackMap.set(key, fileEntry.trackFileId);
      }
    }

    // Also create a fallback map: size + mtime -> trackFileId (for files without relativePath)
    const fallbackMap = new Map<string, string[]>();
    for (const fileEntry of oldFileIndex) {
      const key = `${fileEntry.size}|${fileEntry.mtime}`;
      if (!fallbackMap.has(key)) {
        fallbackMap.set(key, []);
      }
      fallbackMap.get(key)!.push(fileEntry.trackFileId);
    }

    // Prompt user to pick new root
    const newRoot = await pickLibraryRoot();

    // Ensure handle is stored (pickLibraryRoot should have done this, but verify)
    if (newRoot.mode === "handle" && !newRoot.handleId) {
      throw new Error("Directory handle not stored after folder selection");
    }

    // Verify handle exists in database before proceeding
    if (newRoot.mode === "handle" && newRoot.handleId) {
      const { getDirectoryHandle } = await import("@/lib/library-selection-fs-api");
      const handle = await getDirectoryHandle(newRoot.handleId);
      if (!handle) {
        throw new Error(`Directory handle not found in database. Handle ID: ${newRoot.handleId}. Please try selecting the folder again.`);
      }
    }

    // Note: pickLibraryRoot already saves the root via saveLibraryRootLegacy
    // We'll update it later with the correct ID after scanning
    // Build new file index - the handle should already be stored by pickLibraryRoot
    let scanned = 0;
    let matched = 0;
    const newFileIndex: Array<{
      id: string; // Composite key
      trackFileId: string;
      libraryRootId: string;
      relativePath?: string;
      name: string;
      extension: string;
      size: number;
      mtime: number;
      updatedAt: number;
    }> = [];

    // Scan new root and match files (do this before saving to ensure handle is accessible)
    const newIndex = await buildFileIndex(newRoot, (progress) => {
      scanned = progress.scanned;
      onProgress?.({
        scanned: progress.scanned,
        matched,
        currentFile: progress.currentFile,
      });
    });

    // Get or create the root record
    // pickLibraryRoot already saved it, but we need to ensure we have the right ID
    // If the root was saved with handleId as the ID, use that; otherwise create new
    let newRootRecord = await db.libraryRoots.get(newRoot.handleId || "");
    if (!newRootRecord) {
      // Root wasn't saved yet (shouldn't happen, but handle it)
      newRootRecord = await saveLibraryRoot(newRoot, newRoot.handleId);
    } else {
      // Update the existing root record to ensure handleRef is set
      if (newRoot.mode === "handle" && newRoot.handleId && newRootRecord.handleRef !== newRoot.handleId) {
        await db.libraryRoots.update(newRootRecord.id, {
          handleRef: newRoot.handleId,
          updatedAt: Date.now(),
        });
        newRootRecord.handleRef = newRoot.handleId;
      }
    }
    const newRootId = newRootRecord.id;

    // Match files from new index to old tracks
    const matchedTrackFileIds = new Set<string>();
    const trackFileIdMapping = new Map<string, string>(); // old -> new

    for (const [newTrackFileId, newEntry] of newIndex.entries()) {
      // Try to match by relativePath + size + mtime
      let matchedOldTrackFileId: string | undefined;

      if (newEntry.relativePath) {
        const key = `${newEntry.relativePath}|${newEntry.size}|${newEntry.mtime}`;
        matchedOldTrackFileId = oldTrackMap.get(key);
      }

      // Fallback: match by size + mtime if no relativePath match
      if (!matchedOldTrackFileId) {
        const fallbackKey = `${newEntry.size}|${newEntry.mtime}`;
        const candidates = fallbackMap.get(fallbackKey);
        if (candidates && candidates.length === 1) {
          // Only match if there's exactly one candidate (unique size+mtime)
          matchedOldTrackFileId = candidates[0];
        }
      }

      if (matchedOldTrackFileId) {
        matchedTrackFileIds.add(matchedOldTrackFileId);
        trackFileIdMapping.set(matchedOldTrackFileId, newTrackFileId);
        matched++;
      }

      // Add to new file index
      const finalTrackFileId = matchedOldTrackFileId || newTrackFileId;
      newFileIndex.push({
        id: getCompositeId(finalTrackFileId, newRootId), // Composite key
        trackFileId: finalTrackFileId,
        libraryRootId: newRootId,
        relativePath: newEntry.relativePath,
        name: newEntry.name,
        extension: newEntry.extension,
        size: newEntry.size,
        mtime: newEntry.mtime,
        updatedAt: Date.now(),
      });

      onProgress?.({
        scanned,
        matched,
        currentFile: newEntry.name,
      });
    }

    // Update tracks: change libraryRootId and trackFileId if matched
    const tracksToUpdate: TrackRecord[] = [];
    for (const oldTrack of oldTracks) {
      const newTrackFileId = trackFileIdMapping.get(oldTrack.trackFileId);
      const finalTrackFileId = newTrackFileId || oldTrack.trackFileId;
      
      tracksToUpdate.push({
        ...oldTrack,
        id: getCompositeId(finalTrackFileId, newRootId), // New composite ID
        trackFileId: finalTrackFileId,
        libraryRootId: newRootId,
      });
    }

    // Delete old tracks (by old composite IDs) and add new ones
    const oldCompositeIds = oldTracks.map(t => getCompositeId(t.trackFileId, oldRootId));
    await db.tracks.bulkDelete(oldCompositeIds);
    await db.tracks.bulkPut(tracksToUpdate);

    // Delete old file index entries and save new ones
    const oldFileIndexIds = oldFileIndex.map(e => getCompositeId(e.trackFileId, oldRootId));
    await db.fileIndex.bulkDelete(oldFileIndexIds);
    
    // Save new file index (already has composite IDs)
    await db.fileIndex.bulkPut(newFileIndex);

    const unmatched = oldTracks.length - matched;

    return {
      success: true,
      matched,
      unmatched,
      total: oldTracks.length,
      newRootId,
    };
  } catch (error) {
    logger.error("Relink failed:", error);
    return {
      success: false,
      matched: 0,
      unmatched: 0,
      total: 0,
      newRootId: "",
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

/**
 * Check if library root has relative paths
 */
export async function hasRelativePaths(
  libraryRootId: string
): Promise<boolean> {
  const fileIndex = await db.fileIndex
    .where("libraryRootId")
    .equals(libraryRootId)
    .toArray();

  if (fileIndex.length === 0) {
    return false;
  }

  // Check if at least 80% of files have relative paths
  const withPaths = fileIndex.filter((entry) => entry.relativePath).length;
  return withPaths / fileIndex.length >= 0.8;
}

