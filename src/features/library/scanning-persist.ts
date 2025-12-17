/**
 * Scanning with persistence integration
 * 
 * Wraps scanning functions to persist data to Dexie
 */

import type { LibraryRoot } from "@/lib/library-selection";
import {
  buildFileIndex,
  diffFileIndex,
  type FileIndex,
  type ScanResult,
  type ScanProgressCallback,
} from "./scanning";
import {
  saveLibraryRoot,
  saveFileIndexEntries,
  removeFileIndexEntries,
  createScanRun,
  updateScanRun,
  getFileIndexEntries,
  type LibraryRootRecord,
} from "@/db/storage";

/**
 * Scan library with full persistence
 * 
 * @param root Library root to scan
 * @param onProgress Optional progress callback
 * @returns Promise resolving to scan result and library root record
 */
export async function scanLibraryWithPersistence(
  root: LibraryRoot,
  onProgress?: ScanProgressCallback
): Promise<{ result: ScanResult; libraryRoot: LibraryRootRecord }> {
  const startTime = Date.now();

  // Save or get library root
  const libraryRoot = await saveLibraryRoot(root, root.handleId);

  // Create scan run
  const scanRun = await createScanRun(libraryRoot.id, 0, 0, 0, 0);

  try {
    // Load previous index
    const prevEntries = await getFileIndexEntries(libraryRoot.id);
    const prevIndex = new Map<string, any>();
    for (const entry of prevEntries) {
      prevIndex.set(entry.trackFileId, entry);
    }

    // Build new index
    const nextIndex = await buildFileIndex(root, onProgress);

    // Calculate diff
    const diff = diffFileIndex(prevIndex, nextIndex);

    // Persist changes (with progress tracking for large libraries)
    const nextEntries = Array.from(nextIndex.values());
    await saveFileIndexEntries(
      nextEntries,
      libraryRoot.id,
      (progress) => {
        // Report progress to parent callback
        onProgress?.({
          found: progress.total,
          scanned: progress.processed,
        });
      }
    );

    // Remove deleted entries
    if (diff.removed.length > 0) {
      const removedIds = diff.removed.map((e) => e.trackFileId);
      await removeFileIndexEntries(removedIds, libraryRoot.id);
    }

    const duration = Date.now() - startTime;

    const result: ScanResult = {
      total: nextIndex.size,
      added: diff.added.length,
      changed: diff.changed.length,
      removed: diff.removed.length,
      duration,
      entries: nextEntries,
    };

    // Update scan run
    await updateScanRun(scanRun.id, 0);

    return { result, libraryRoot };
  } catch (error) {
    // Update scan run with error
    await updateScanRun(scanRun.id, 0);
    throw error;
  }
}


