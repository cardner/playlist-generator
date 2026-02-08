/**
 * Library Root Management
 * 
 * This module handles saving, retrieving, and reconstructing library root
 * configurations from IndexedDB and existing data.
 * 
 * @module lib/library-selection-root
 */

import { logger } from "./logger";
import type { LibraryRoot } from "./library-selection-types";

/**
 * Get saved library root from IndexedDB
 * 
 * Attempts to retrieve the current library root from IndexedDB.
 * If no root record exists, attempts to reconstruct it from existing
 * tracks and file index data.
 * 
 * @returns Promise resolving to saved library root or null
 * 
 * @example
 * ```typescript
 * const root = await getSavedLibraryRoot();
 * if (root) {
 *   console.log(`Found library: ${root.name}`);
 * } else {
 *   console.log("No library found");
 * }
 * ```
 */
export async function getSavedLibraryRoot(): Promise<LibraryRoot | null> {
  try {
    // Use Dexie instead of raw IndexedDB
    const { getCurrentLibraryRoot, getAllTracks, getAllFileIndexEntries } = await import("@/db/storage");
    const root = await getCurrentLibraryRoot();
    
    if (root) {
      // Convert LibraryRootRecord to LibraryRoot
      const libraryRoot: LibraryRoot = {
        mode: root.mode as "handle" | "fallback",
        name: root.name,
      };
      
      // Set handleId for handle mode, or lastImportedAt for fallback mode
      if (root.mode === "handle") {
        // For handle mode, use handleRef as handleId
        // If handleRef is not set, use the record ID (which should be the handleId)
        libraryRoot.handleId = root.handleRef || root.id;
      } else {
        // For fallback mode, use createdAt as lastImportedAt
        libraryRoot.lastImportedAt = root.createdAt;
        // Also set handleId to the record ID for consistency (getRootId can use either)
        libraryRoot.handleId = root.id;
      }
      
      return libraryRoot;
    }
    
    // No root record found - try to reconstruct from existing data
    const allTracks = await getAllTracks();
    const allFileIndex = await getAllFileIndexEntries();
    
    if (allTracks.length === 0 && allFileIndex.length === 0) {
      return null;
    }
    
    // Get unique library root IDs from tracks and file index
    const trackRootIds = new Set(allTracks.map(t => t.libraryRootId).filter(Boolean));
    const fileIndexRootIds = new Set(allFileIndex.map(f => f.libraryRootId).filter(Boolean));
    const allRootIds = new Set([...trackRootIds, ...fileIndexRootIds]);
    
    if (allRootIds.size === 0) {
      return null;
    }
    
    // Use the first (most common) library root ID
    const inferredRootId = Array.from(allRootIds)[0];
    
    // Try to reconstruct the library root from the data
    const reconstructedRoot = await reconstructLibraryRootFromData(inferredRootId);
    
    if (reconstructedRoot) {
      return reconstructedRoot;
    }
    
    return null;
  } catch (error) {
    logger.error("Failed to get saved library root:", error);
    return null;
  }
}

/**
 * Reconstruct a LibraryRoot from database data when the record is missing
 * 
 * Attempts to infer library root configuration from existing tracks,
 * file index entries, and scan runs.
 * 
 * @param libraryRootId The library root ID to reconstruct
 * @returns Promise resolving to reconstructed library root or null
 */
async function reconstructLibraryRootFromData(
  libraryRootId: string
): Promise<LibraryRoot | null> {
  try {
    const { getTracks, getFileIndexEntries, getScanRuns, getLibraryRoot } = await import("@/db/storage");
    
    // Try to get the root record first (might have been created after tracks)
    const rootRecord = await getLibraryRoot(libraryRootId);
    if (rootRecord) {
      // Convert LibraryRootRecord to LibraryRoot
      const libraryRoot: LibraryRoot = {
        mode: rootRecord.mode as "handle" | "fallback",
        name: rootRecord.name,
      };
      
      if (rootRecord.mode === "handle") {
        libraryRoot.handleId = rootRecord.handleRef || rootRecord.id;
      } else {
        libraryRoot.lastImportedAt = rootRecord.createdAt;
        libraryRoot.handleId = rootRecord.id;
      }
      
      return libraryRoot;
    }
    
    // No root record - try to infer from data
    const tracks = await getTracks(libraryRootId);
    const fileIndex = await getFileIndexEntries(libraryRootId);
    const scanRuns = await getScanRuns(libraryRootId);
    
    if (tracks.length === 0 && fileIndex.length === 0) {
      return null;
    }
    
    // Try to infer mode from fileIndex (if we have relative paths, it's handle mode)
    const hasRelativePaths = fileIndex.some(entry => entry.relativePath);
    const mode: "handle" | "fallback" = hasRelativePaths ? "handle" : "fallback";
    
    // Try to infer name from the most common directory in relative paths
    let inferredName = "Music Library";
    if (fileIndex.length > 0 && hasRelativePaths) {
      const pathParts = fileIndex
        .map(entry => entry.relativePath?.split("/")[0])
        .filter(Boolean) as string[];
      if (pathParts.length > 0) {
        // Get most common root directory name
        const counts = new Map<string, number>();
        for (const part of pathParts) {
          counts.set(part, (counts.get(part) || 0) + 1);
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        inferredName = sorted[0][0] || "Music Library";
      }
    }
    
    // Get the oldest scan run to use its timestamp
    const oldestScanRun = scanRuns.sort((a, b) => a.startedAt - b.startedAt)[0];
    const createdAt = oldestScanRun?.startedAt || Date.now();
    
    const libraryRoot: LibraryRoot = {
      mode,
      name: inferredName,
    };
    
    if (mode === "handle") {
      // For handle mode, use the library root ID as handleId
      libraryRoot.handleId = libraryRootId;
    } else {
      // For fallback mode, use createdAt as lastImportedAt
      libraryRoot.lastImportedAt = createdAt;
      libraryRoot.handleId = libraryRootId;
    }
    
    // Save the reconstructed root to the database for future use
    const { saveLibraryRoot } = await import("@/db/storage");
    await saveLibraryRoot(libraryRoot, mode === "handle" ? libraryRootId : undefined, {
      setAsCurrent: false,
    });
    
    return libraryRoot;
  } catch (error) {
    logger.error("Failed to reconstruct library root from data:", error);
    return null;
  }
}

/**
 * Save library root to IndexedDB (legacy - use db/storage instead)
 * 
 * @param root Library root to save
 */
export async function saveLibraryRootLegacy(root: LibraryRoot): Promise<void> {
  // Use new Dexie storage layer
  const { saveLibraryRoot: saveRoot } = await import("@/db/storage");
  await saveRoot(root, root.handleId, { setAsCurrent: true });
}

