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
import { db, getCompositeId } from "@/db/schema";
import { generateFileIdFromPath } from "@/lib/library-selection-utils";
import type { FileIndexRecord, TrackRecord } from "@/db/schema";

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

  // Load previous index and migrate track IDs if needed
  const prevEntries = await getFileIndexEntries(libraryRoot.id);
  const trackIdMap = await migrateTrackFileIdsIfNeeded(libraryRoot.id, prevEntries);
  const normalizedPrevEntries = applyTrackIdMapping(prevEntries, trackIdMap);
  const migrationInfo = buildMigrationInfo(trackIdMap, prevEntries);

  // Create or get scan run
  let scanRun;
  let scannedFileIds = new Set<string>();
  let lastScannedIndex = -1;
  let lastScannedPath: string | undefined;

  if (scanRunId) {
    // Resume from existing scan run
    const checkpointRecord = await loadCheckpoint(scanRunId);
    if (checkpointRecord) {
      const mappedIds = checkpointRecord.scannedFileIds.map(
        (id) => trackIdMap.get(id) ?? id
      );
      scannedFileIds = new Set(mappedIds);
      lastScannedIndex = checkpointRecord.lastScannedIndex;
      lastScannedPath = checkpointRecord.lastScannedPath;
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

  const checkpoint: ScanCheckpoint = {
    scannedFileIds,
    lastScannedIndex,
    lastScannedPath,
  };
  let lastProgressFound = 0;

  try {
    const prevIndex = new Map<string, any>();
    for (const entry of normalizedPrevEntries) {
      prevIndex.set(entry.trackFileId, entry);
    }

    // Track checkpoint saving
    let filesSinceLastCheckpoint = 0;
    let savedInitialCheckpoint = false;
    const CHECKPOINT_INTERVAL = 50;

    // Handle disconnection callback
    const handleDisconnection = async (error: Error) => {
      // Save checkpoint with interrupted flag
      // Note: scannedFileIds, lastScannedIndex, and lastScannedPath are updated
      // in buildFileIndex, so we use the checkpoint values
      await saveCheckpoint(
        scanRun.id,
        libraryRoot.id,
        Array.from(checkpoint.scannedFileIds),
        checkpoint.lastScannedPath,
        checkpoint.lastScannedIndex,
        lastProgressFound || checkpoint.scannedFileIds.size,
        true // interrupted
      );
      logger.warn("Scan interrupted due to network drive disconnection", error);
      throw new NetworkDriveDisconnectedError(
        error.message,
        scanRun.id,
        checkpoint.scannedFileIds.size,
        checkpoint.lastScannedPath
      );
    };

    // Enhanced progress callback that saves checkpoints
    // Note: We need to update scannedFileIds, lastScannedIndex, and lastScannedPath
    // from the checkpoint as buildFileIndex updates them
    const enhancedProgress: ScanProgressCallback = (progress) => {
      onProgress?.(progress);
      filesSinceLastCheckpoint++;
      lastProgressFound = progress.found;
      
      // Update tracking variables from checkpoint
      scannedFileIds = checkpoint.scannedFileIds;
      lastScannedIndex = checkpoint.lastScannedIndex;
      lastScannedPath = checkpoint.lastScannedPath;
      
      if (!savedInitialCheckpoint && progress.scanned > 0) {
        savedInitialCheckpoint = true;
        saveCheckpoint(
          scanRun.id,
          libraryRoot.id,
          Array.from(checkpoint.scannedFileIds),
          checkpoint.lastScannedPath,
          checkpoint.lastScannedIndex,
          progress.found,
          false
        ).catch((err) => {
          logger.error("Failed to save initial checkpoint:", err);
        });
      }

      // Save checkpoint every 50 files
      if (filesSinceLastCheckpoint >= CHECKPOINT_INTERVAL) {
        saveCheckpoint(
          scanRun.id,
          libraryRoot.id,
          Array.from(checkpoint.scannedFileIds),
          checkpoint.lastScannedPath,
          checkpoint.lastScannedIndex,
          progress.found,
          false // not interrupted
        ).catch((err) => {
          logger.error("Failed to save checkpoint:", err);
          // Don't throw - checkpoint failure shouldn't stop scanning
        });
        filesSinceLastCheckpoint = 0;
      }
    };

    // Save initial checkpoint so reloads can resume immediately
    try {
      await saveCheckpoint(
        scanRun.id,
        libraryRoot.id,
        Array.from(checkpoint.scannedFileIds),
        checkpoint.lastScannedPath,
        checkpoint.lastScannedIndex,
        0,
        false
      );
    } catch (checkpointError) {
      logger.error("Failed to save initial checkpoint:", checkpointError);
    }

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
    scannedFileIds = checkpoint.scannedFileIds;
    lastScannedIndex = checkpoint.lastScannedIndex;
    lastScannedPath = checkpoint.lastScannedPath;

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
      diff,
      migration: migrationInfo,
    };

    // Update scan run
    await updateScanRun(scanRun.id, 0);
    await deleteCheckpoint(scanRun.id);

    return { result, libraryRoot };
  } catch (error) {
    // Save checkpoint for resume on unexpected failures
    try {
      await saveCheckpoint(
        scanRun.id,
        libraryRoot.id,
        Array.from(checkpoint.scannedFileIds),
        checkpoint.lastScannedPath,
        checkpoint.lastScannedIndex,
        lastProgressFound || checkpoint.scannedFileIds.size,
        true
      );
    } catch (checkpointError) {
      logger.error("Failed to save checkpoint after scan error:", checkpointError);
    }
    throw error;
  }
}

function applyTrackIdMapping(
  entries: FileIndexRecord[],
  trackIdMap: Map<string, string>
): FileIndexRecord[] {
  if (trackIdMap.size === 0) {
    return entries;
  }
  return entries.map((entry) => {
    const mappedId = trackIdMap.get(entry.trackFileId);
    if (!mappedId) {
      return entry;
    }
    return {
      ...entry,
      trackFileId: mappedId,
      id: getCompositeId(mappedId, entry.libraryRootId),
    };
  });
}

function buildMigrationInfo(
  trackIdMap: Map<string, string>,
  entries: FileIndexRecord[]
): ScanResult["migration"] | undefined {
  if (trackIdMap.size === 0) {
    return undefined;
  }

  const samples: Array<{ from: string; to: string; path?: string }> = [];
  for (const entry of entries) {
    const mappedId = trackIdMap.get(entry.trackFileId);
    if (!mappedId) {
      continue;
    }
    samples.push({
      from: entry.trackFileId,
      to: mappedId,
      path: entry.relativePath ?? entry.name,
    });
    if (samples.length >= 5) {
      break;
    }
  }

  return {
    totalMigrated: trackIdMap.size,
    samples,
  };
}

async function migrateTrackFileIdsIfNeeded(
  libraryRootId: string,
  entries: FileIndexRecord[]
): Promise<Map<string, string>> {
  const trackIdMap = new Map<string, string>();
  if (entries.length === 0) {
    return trackIdMap;
  }

  const fileIndexUpdates: FileIndexRecord[] = [];
  const fileIndexDeletes: string[] = [];

  for (const entry of entries) {
    const pathForId = entry.relativePath || entry.name;
    const nextId = generateFileIdFromPath(pathForId, entry.size);
    if (nextId === entry.trackFileId) {
      continue;
    }
    trackIdMap.set(entry.trackFileId, nextId);
    fileIndexUpdates.push({
      ...entry,
      trackFileId: nextId,
      id: getCompositeId(nextId, libraryRootId),
    });
    fileIndexDeletes.push(getCompositeId(entry.trackFileId, libraryRootId));
  }

  if (trackIdMap.size === 0) {
    return trackIdMap;
  }

  await db.transaction("rw", [db.fileIndex, db.tracks], async () => {
    if (fileIndexUpdates.length > 0) {
      await db.fileIndex.bulkPut(fileIndexUpdates);
    }
    if (fileIndexDeletes.length > 0) {
      await db.fileIndex.bulkDelete(fileIndexDeletes);
    }

    const oldIds = Array.from(trackIdMap.keys());
    const tracksToUpdate = await db.tracks
      .where("trackFileId")
      .anyOf(oldIds)
      .toArray();
    if (tracksToUpdate.length > 0) {
      const updatedTracks: TrackRecord[] = tracksToUpdate.map((track) => {
        const mappedId = trackIdMap.get(track.trackFileId) ?? track.trackFileId;
        return {
          ...track,
          trackFileId: mappedId,
          id: getCompositeId(mappedId, track.libraryRootId),
        };
      });
      const oldTrackIds = tracksToUpdate.map((track) => track.id);
      await db.tracks.bulkPut(updatedTracks);
      await db.tracks.bulkDelete(oldTrackIds);
    }
  });

  return trackIdMap;
}


