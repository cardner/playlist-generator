/**
 * Scan Checkpoint Storage Operations
 * 
 * This module handles all storage operations related to scan checkpoints,
 * which enable resuming interrupted scans, particularly for network drives.
 * 
 * @module db/storage-scan-checkpoints
 */

import { db } from "./schema";
import type { ScanCheckpointRecord } from "./schema";
import { logger } from "@/lib/logger";

/**
 * Save a scan checkpoint
 * 
 * Saves the current scan progress to enable resuming later. Checkpoints
 * are saved periodically (every 50 files) and when a scan is interrupted.
 * 
 * @param scanRunId - ID of the scan run
 * @param libraryRootId - ID of the library root being scanned
 * @param scannedFileIds - Array of trackFileIds that have been scanned
 * @param lastScannedPath - Optional last file path scanned
 * @param lastScannedIndex - Position in scan order (0-indexed)
 * @param totalFound - Total number of files found so far
 * @param interrupted - Whether the scan was interrupted
 * @returns Promise resolving to the saved checkpoint record
 * 
 * @example
 * ```typescript
 * await saveCheckpoint(
 *   "scan-123",
 *   "root-456",
 *   ["file1", "file2", "file3"],
 *   "Music/Album/Track.mp3",
 *   150,
 *   1000,
 *   false
 * );
 * ```
 */
export async function saveCheckpoint(
  scanRunId: string,
  libraryRootId: string,
  scannedFileIds: string[],
  lastScannedPath: string | undefined,
  lastScannedIndex: number,
  totalFound: number,
  interrupted: boolean
): Promise<ScanCheckpointRecord> {
  // Ensure database is open and ready
  await db.open();
  
  // Check if scanCheckpoints table exists (database may not be upgraded yet)
  if (!db.scanCheckpoints) {
    throw new Error("scanCheckpoints table not available - database upgrade required");
  }
  
  const checkpoint: ScanCheckpointRecord = {
    id: scanRunId, // Same as scanRunId for easy lookup
    scanRunId,
    libraryRootId,
    scannedFileIds,
    lastScannedPath,
    lastScannedIndex,
    totalFound,
    checkpointAt: Date.now(),
    interrupted,
  };

  await db.scanCheckpoints.put(checkpoint);
  return checkpoint;
}

/**
 * Load a checkpoint for resuming a scan
 * 
 * @param scanRunId - ID of the scan run to load checkpoint for
 * @returns Promise resolving to checkpoint record or null if not found
 * 
 * @example
 * ```typescript
 * const checkpoint = await loadCheckpoint("scan-123");
 * if (checkpoint) {
 *   // Resume scan from checkpoint
 * }
 * ```
 */
export async function loadCheckpoint(
  scanRunId: string
): Promise<ScanCheckpointRecord | null> {
  try {
    // Ensure database is open and ready
    await db.open();
    
    // Check if scanCheckpoints table exists (database may not be upgraded yet)
    if (!db.scanCheckpoints) {
      return null;
    }
    
    return (await db.scanCheckpoints.get(scanRunId)) || null;
  } catch (error) {
    logger.debug("Could not access scanCheckpoints table:", error);
    return null;
  }
}

/**
 * Delete a checkpoint
 * 
 * Called when a scan completes successfully to clean up the checkpoint.
 * 
 * @param scanRunId - ID of the scan run whose checkpoint should be deleted
 * 
 * @example
 * ```typescript
 * await deleteCheckpoint("scan-123");
 * ```
 */
export async function deleteCheckpoint(scanRunId: string): Promise<void> {
  try {
    // Ensure database is open and ready
    await db.open();
    
    // Check if scanCheckpoints table exists (database may not be upgraded yet)
    if (!db.scanCheckpoints) {
      return; // Silently return if table doesn't exist
    }
    
    await db.scanCheckpoints.delete(scanRunId);
  } catch (error) {
    logger.debug("Could not delete checkpoint:", error);
    // Silently fail - checkpoint might not exist
  }
}

/**
 * Get all interrupted scans for a library root
 * 
 * Finds all checkpoints marked as interrupted for a specific library root.
 * Used to show "Resume Previous Scan" options to the user.
 * 
 * @param libraryRootId - ID of the library root
 * @returns Promise resolving to array of interrupted checkpoint records
 * 
 * @example
 * ```typescript
 * const interrupted = await getInterruptedScans("root-456");
 * if (interrupted.length > 0) {
 *   // Show resume option
 * }
 * ```
 */
export async function getInterruptedScans(
  libraryRootId: string
): Promise<ScanCheckpointRecord[]> {
  try {
    // Ensure database is open and ready
    await db.open();
    
    // Check if scanCheckpoints table exists (database may not be upgraded yet)
    if (!db.scanCheckpoints) {
      // Database might be at an older version - this is okay for new collections
      return [];
    }
    
    return db.scanCheckpoints
      .where("libraryRootId")
      .equals(libraryRootId)
      .and((checkpoint) => checkpoint.interrupted === true)
      .sortBy("checkpointAt");
  } catch (error) {
    // Database might not be ready or upgraded yet - return empty array
    logger.debug("Could not access scanCheckpoints table:", error);
    return [];
  }
}

/**
 * Clean up old interrupted checkpoints
 * 
 * Deletes interrupted checkpoints older than the specified retention period.
 * This helps prevent the database from growing indefinitely with old checkpoints
 * that the user is unlikely to resume.
 * 
 * @param retentionDays - Number of days to retain interrupted checkpoints (default: 30)
 * @returns Promise resolving to the number of checkpoints deleted
 * 
 * @example
 * ```typescript
 * // Delete checkpoints older than 30 days
 * const deleted = await cleanupOldCheckpoints();
 * 
 * // Delete checkpoints older than 7 days
 * const deleted = await cleanupOldCheckpoints(7);
 * ```
 */
export async function cleanupOldCheckpoints(
  retentionDays: number = 30
): Promise<number> {
  try {
    // Ensure database is open and ready
    await db.open();
    
    // Check if scanCheckpoints table exists (database may not be upgraded yet)
    if (!db.scanCheckpoints) {
      return 0;
    }
    
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    
    // Get all checkpoints and filter for old interrupted ones
    const allCheckpoints = await db.scanCheckpoints.toArray();
    const oldInterrupted = allCheckpoints.filter(
      (checkpoint) => checkpoint.interrupted === true && checkpoint.checkpointAt < cutoffTime
    );
    
    if (oldInterrupted.length === 0) {
      return 0;
    }
    
    const idsToDelete = oldInterrupted.map((cp) => cp.id);
    await db.scanCheckpoints.bulkDelete(idsToDelete);
    
    return idsToDelete.length;
  } catch (error) {
    logger.debug("Could not cleanup old checkpoints:", error);
    return 0;
  }
}

/**
 * Delete all checkpoints for a specific library root
 * 
 * Useful when a library root is deleted or when the user wants to start fresh.
 * 
 * @param libraryRootId - ID of the library root
 * @returns Promise resolving to the number of checkpoints deleted
 * 
 * @example
 * ```typescript
 * const deleted = await deleteCheckpointsForLibrary("root-456");
 * ```
 */
export async function deleteCheckpointsForLibrary(
  libraryRootId: string
): Promise<number> {
  try {
    // Ensure database is open and ready
    await db.open();
    
    // Check if scanCheckpoints table exists (database may not be upgraded yet)
    if (!db.scanCheckpoints) {
      return 0;
    }
    
    const checkpoints = await db.scanCheckpoints
      .where("libraryRootId")
      .equals(libraryRootId)
      .toArray();
    
    if (checkpoints.length === 0) {
      return 0;
    }
    
    const idsToDelete = checkpoints.map((cp) => cp.id);
    await db.scanCheckpoints.bulkDelete(idsToDelete);
    
    return idsToDelete.length;
  } catch (error) {
    logger.debug("Could not delete checkpoints for library:", error);
    return 0;
  }
}

