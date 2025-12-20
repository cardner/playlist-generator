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
  type ScanCheckpoint,
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
import {
  saveCheckpoint,
  loadCheckpoint,
  deleteCheckpoint,
} from "@/db/storage-scan-checkpoints";
import { NetworkDriveDisconnectedError } from "./network-drive-errors";
import { logger } from "@/lib/logger";

/**
 * Scan library with full persistence
 * 
 * @param root Library root to scan
 * @param onProgress Optional progress callback
 * @returns Promise resolving to scan result and library root record
 */
export async function scanLibraryWithPersistence(
  root: LibraryRoot,
  onProgress?: ScanProgressCallback,
  scanRunId?: string // Optional: resume from existing scan run
): Promise<{ result: ScanResult; libraryRoot: LibraryRootRecord }> {
  const startTime = Date.now();

  // Save or get library root
  const libraryRoot = await saveLibraryRoot(root, root.handleId);

  // Create or get scan run
  let scanRun;
  let checkpoint: ScanCheckpoint | undefined;
  let scannedFileIds = new Set<string>();
  let lastScannedIndex = -1;
  let lastScannedPath: string | undefined;

  if (scanRunId) {
    // Resume from existing scan run
    const checkpointRecord = await loadCheckpoint(scanRunId);
    if (checkpointRecord) {
      scannedFileIds = new Set(checkpointRecord.scannedFileIds);
      lastScannedIndex = checkpointRecord.lastScannedIndex;
      lastScannedPath = checkpointRecord.lastScannedPath;
      checkpoint = {
        scannedFileIds,
        lastScannedIndex,
        lastScannedPath,
      };
      // Get existing scan run
      const { getScanRuns } = await import("@/db/storage");
      const runs = await getScanRuns(libraryRoot.id);
      scanRun = runs.find((r) => r.id === scanRunId);
      if (!scanRun) {
        // Create new scan run if not found
        scanRun = await createScanRun(libraryRoot.id, 0, 0, 0, 0);
      }
    } else {
      // No checkpoint found, start fresh
      scanRun = await createScanRun(libraryRoot.id, 0, 0, 0, 0);
    }
  } else {
    // Start new scan
    scanRun = await createScanRun(libraryRoot.id, 0, 0, 0, 0);
  }

  try {
    // Load previous index
    const prevEntries = await getFileIndexEntries(libraryRoot.id);
    const prevIndex = new Map<string, any>();
    for (const entry of prevEntries) {
      prevIndex.set(entry.trackFileId, entry);
    }

    // Track checkpoint saving
    let filesSinceLastCheckpoint = 0;
    const CHECKPOINT_INTERVAL = 50;

    // Handle disconnection callback
    const handleDisconnection = async (error: Error) => {
      // Save checkpoint with interrupted flag
      // Note: scannedFileIds, lastScannedIndex, and lastScannedPath are updated
      // in buildFileIndex, so we use the checkpoint values
      await saveCheckpoint(
        scanRun.id,
        libraryRoot.id,
        Array.from(checkpoint?.scannedFileIds ?? scannedFileIds),
        checkpoint?.lastScannedPath ?? lastScannedPath,
        checkpoint?.lastScannedIndex ?? lastScannedIndex,
        prevIndex.size + (checkpoint?.scannedFileIds.size ?? scannedFileIds.size),
        true // interrupted
      );
      logger.warn("Scan interrupted due to network drive disconnection", error);
      throw new NetworkDriveDisconnectedError(
        error.message,
        scanRun.id,
        checkpoint?.scannedFileIds.size ?? scannedFileIds.size,
        checkpoint?.lastScannedPath ?? lastScannedPath
      );
    };

    // Enhanced progress callback that saves checkpoints
    // Note: We need to update scannedFileIds, lastScannedIndex, and lastScannedPath
    // from the checkpoint as buildFileIndex updates them
    const enhancedProgress: ScanProgressCallback = (progress) => {
      onProgress?.(progress);
      filesSinceLastCheckpoint++;
      
      // Update tracking variables from checkpoint if it exists
      if (checkpoint) {
        scannedFileIds = checkpoint.scannedFileIds;
        lastScannedIndex = checkpoint.lastScannedIndex;
        lastScannedPath = checkpoint.lastScannedPath;
      }
      
      // Save checkpoint every 50 files
      if (filesSinceLastCheckpoint >= CHECKPOINT_INTERVAL) {
        saveCheckpoint(
          scanRun.id,
          libraryRoot.id,
          Array.from(checkpoint?.scannedFileIds ?? scannedFileIds),
          checkpoint?.lastScannedPath ?? lastScannedPath,
          checkpoint?.lastScannedIndex ?? lastScannedIndex,
          progress.found,
          false // not interrupted
        ).catch((err) => {
          logger.error("Failed to save checkpoint:", err);
          // Don't throw - checkpoint failure shouldn't stop scanning
        });
        filesSinceLastCheckpoint = 0;
      }
    };

    // Build new index with checkpoint support
    // Note: buildFileIndex will update checkpoint.scannedFileIds, lastScannedIndex,
    // and lastScannedPath as it scans
    const nextIndex = await buildFileIndex(
      root,
      enhancedProgress,
      checkpoint,
      handleDisconnection
    );
    
    // Update tracking variables from checkpoint after scanning completes
    if (checkpoint) {
      scannedFileIds = checkpoint.scannedFileIds;
      lastScannedIndex = checkpoint.lastScannedIndex;
      lastScannedPath = checkpoint.lastScannedPath;
    }

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


