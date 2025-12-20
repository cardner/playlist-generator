/**
 * Storage Cleanup Utilities
 * 
 * This module provides utilities for cleaning up old or orphaned data
 * in IndexedDB to free up storage space and maintain database health.
 * 
 * Key Features:
 * - Cleanup old scan runs (keep only recent N per library)
 * - Remove orphaned file index entries (no matching tracks)
 * - Delete all data for a specific library root
 * - Get storage statistics for monitoring
 * 
 * @module db/storage-cleanup
 * 
 * @example
 * ```typescript
 * // Cleanup old scan runs, keeping only the 10 most recent per library
 * const result = await cleanupOldScanRuns(10);
 * console.log(`Deleted ${result.deleted} old scan runs`);
 * ```
 */

import { db } from "./schema";
import type { ScanRunRecord } from "./schema";
import { logger } from "@/lib/logger";

/**
 * Cleanup old scan runs, keeping only the most recent N runs per library
 * 
 * Scan runs track the history of library scanning operations. This function
 * removes old scan runs to free up storage space while preserving recent history.
 * 
 * @param keepRecent - Number of recent scan runs to keep per library (default: 10)
 * @returns Object with count of deleted scan runs
 * 
 * @example
 * ```typescript
 * const result = await cleanupOldScanRuns(10);
 * // Keeps 10 most recent scans per library, deletes older ones
 * ```
 */
export async function cleanupOldScanRuns(
  keepRecent: number = 10
): Promise<{ deleted: number }> {
  try {
    // Get all library root IDs
    const libraryRoots = await db.libraryRoots.toArray();
    let deleted = 0;

    for (const root of libraryRoots) {
      // Get all scan runs for this library, sorted by date (newest first)
      const runs = await db.scanRuns
        .where("libraryRootId")
        .equals(root.id)
        .sortBy("startedAt");

      // Keep only the most recent N runs
      if (runs.length > keepRecent) {
        const toDelete = runs.slice(0, runs.length - keepRecent);
        const idsToDelete = toDelete.map((r) => r.id);
        await db.scanRuns.bulkDelete(idsToDelete);
        deleted += idsToDelete.length;
      }
    }

    return { deleted };
  } catch (error) {
    logger.error("Failed to cleanup old scan runs:", error);
    throw error;
  }
}

/**
 * Cleanup orphaned file index entries (no matching tracks)
 * 
 * Removes file index entries that don't have corresponding track records.
 * This can happen if metadata parsing failed or tracks were deleted manually.
 * 
 * Uses composite IDs (trackFileId-libraryRootId) for accurate matching.
 * 
 * @param libraryRootId - Optional library root ID to limit cleanup scope
 * @returns Object with count of deleted orphaned entries
 * 
 * @example
 * ```typescript
 * // Cleanup orphaned entries for a specific library
 * const result = await cleanupOrphanedFileIndex(libraryRootId);
 * console.log(`Removed ${result.deleted} orphaned file index entries`);
 * ```
 */
export async function cleanupOrphanedFileIndex(libraryRootId?: string): Promise<{ deleted: number }> {
  try {
    let allFileIndex = await db.fileIndex.toArray();
    let allTracks = await db.tracks.toArray();
    
    // Filter by libraryRootId if provided
    if (libraryRootId) {
      allFileIndex = allFileIndex.filter((e) => e.libraryRootId === libraryRootId);
      allTracks = allTracks.filter((t) => t.libraryRootId === libraryRootId);
    }
    
    // Create a set of composite IDs for tracks
    const trackCompositeIds = new Set(allTracks.map((t) => `${t.trackFileId}-${t.libraryRootId}`));
    
    // Find orphaned file index entries (no matching track with same composite ID)
    const orphaned = allFileIndex.filter(
      (entry) => {
        const compositeId = `${entry.trackFileId}-${entry.libraryRootId}`;
        return !trackCompositeIds.has(compositeId);
      }
    );
    
    if (orphaned.length > 0) {
      const idsToDelete = orphaned.map((e) => e.id); // Use composite ID
      await db.fileIndex.bulkDelete(idsToDelete);
      return { deleted: idsToDelete.length };
    }
    
    return { deleted: 0 };
  } catch (error) {
    logger.error("Failed to cleanup orphaned file index:", error);
    throw error;
  }
}

/**
 * Cleanup all data for a specific library root
 * 
 * Deletes all tracks, file index entries, and scan runs for a given library root.
 * Useful when switching libraries or removing a collection entirely.
 * 
 * Uses composite IDs for accurate deletion across all tables.
 * 
 * @param libraryRootId - Library root ID to cleanup
 * @returns Object with counts of deleted records by type
 * 
 * @example
 * ```typescript
 * const result = await cleanupLibraryRootData(libraryRootId);
 * console.log(`Deleted ${result.deleted.tracks} tracks, ${result.deleted.fileIndex} file index entries`);
 * ```
 */
export async function cleanupLibraryRootData(
  libraryRootId: string
): Promise<{ deleted: { tracks: number; fileIndex: number; scanRuns: number } }> {
  try {
    // Delete tracks (using composite IDs)
    const tracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
    const trackIds = tracks.map((t) => t.id); // Use composite ID
    await db.tracks.bulkDelete(trackIds);
    
    // Delete file index entries (using composite IDs)
    const fileIndex = await db.fileIndex.where("libraryRootId").equals(libraryRootId).toArray();
    const fileIndexIds = fileIndex.map((f) => f.id); // Use composite ID
    await db.fileIndex.bulkDelete(fileIndexIds);
    
    // Delete scan runs
    const scanRuns = await db.scanRuns.where("libraryRootId").equals(libraryRootId).toArray();
    const scanRunIds = scanRuns.map((s) => s.id);
    await db.scanRuns.bulkDelete(scanRunIds);
    
    return {
      deleted: {
        tracks: trackIds.length,
        fileIndex: fileIndexIds.length,
        scanRuns: scanRunIds.length,
      },
    };
  } catch (error) {
    logger.error("Failed to cleanup library root data:", error);
    throw error;
  }
}

/**
 * Storage statistics interface
 * 
 * Provides counts of records in each database table for monitoring
 * and debugging purposes.
 */
export interface StorageStats {
  /** Number of library roots (collections) */
  libraryRoots: number;
  /** Number of track records */
  tracks: number;
  /** Number of file index entries */
  fileIndex: number;
  /** Number of scan run records */
  scanRuns: number;
  /** Number of directory handles (File System Access API) */
  directoryHandles: number;
}

/**
 * Get storage statistics for all database tables
 * 
 * Returns counts of records in each table. Handles errors gracefully
 * by returning 0 for tables that fail to count, ensuring the function
 * never throws.
 * 
 * @returns Object with counts for each table
 * 
 * @example
 * ```typescript
 * const stats = await getStorageStats();
 * console.log(`Database contains ${stats.tracks} tracks across ${stats.libraryRoots} libraries`);
 * ```
 */
export async function getStorageStats(): Promise<StorageStats> {
  try {
    // Ensure database is open (Dexie handles this automatically, but we'll catch errors)
    const [libraryRoots, tracks, fileIndex, scanRuns, directoryHandles] = await Promise.all([
      db.libraryRoots.count().catch((err) => {
        logger.warn("Failed to count libraryRoots:", err);
        return 0;
      }),
      db.tracks.count().catch((err) => {
        logger.warn("Failed to count tracks:", err);
        return 0;
      }),
      db.fileIndex.count().catch((err) => {
        logger.warn("Failed to count fileIndex:", err);
        return 0;
      }),
      db.scanRuns.count().catch((err) => {
        logger.warn("Failed to count scanRuns:", err);
        return 0;
      }),
      db.directoryHandles.count().catch((err) => {
        logger.warn("Failed to count directoryHandles:", err);
        return 0;
      }),
    ]);

    return {
      libraryRoots,
      tracks,
      fileIndex,
      scanRuns,
      directoryHandles,
    };
  } catch (error) {
    logger.error("Failed to get storage stats:", error);
    // Return default values instead of throwing
    return {
      libraryRoots: 0,
      tracks: 0,
      fileIndex: 0,
      scanRuns: 0,
      directoryHandles: 0,
    };
  }
}

/**
 * Perform comprehensive cleanup operations
 * 
 * Executes multiple cleanup operations in sequence. Useful for periodic
 * maintenance or when storage quota is running low.
 * 
 * @param options - Cleanup options
 * @param options.keepRecentScanRuns - Number of recent scan runs to keep (if undefined, skips scan run cleanup)
 * @param options.cleanupOrphaned - Whether to cleanup orphaned file index entries
 * @returns Object with counts of deleted records by operation type
 * 
 * @example
 * ```typescript
 * const result = await performCleanup({
 *   keepRecentScanRuns: 10,
 *   cleanupOrphaned: true
 * });
 * console.log(`Cleaned up ${result.scanRunsDeleted} scan runs and ${result.orphanedDeleted} orphaned entries`);
 * ```
 */
export async function performCleanup(options: {
  keepRecentScanRuns?: number;
  cleanupOrphaned?: boolean;
}): Promise<{
  scanRunsDeleted: number;
  orphanedDeleted: number;
}> {
  const results = {
    scanRunsDeleted: 0,
    orphanedDeleted: 0,
  };

  try {
    // Cleanup old scan runs
    if (options.keepRecentScanRuns !== undefined) {
      const scanResult = await cleanupOldScanRuns(options.keepRecentScanRuns);
      results.scanRunsDeleted = scanResult.deleted;
    }

    // Cleanup orphaned entries
    if (options.cleanupOrphaned) {
      // Get current library root ID if available
      try {
        const { getCurrentLibraryRoot } = await import("./storage");
        const currentRoot = await getCurrentLibraryRoot();
        const orphanResult = await cleanupOrphanedFileIndex(currentRoot?.id);
        results.orphanedDeleted = orphanResult.deleted;
      } catch (error) {
        logger.error("Failed to cleanup orphaned entries:", error);
        // Continue - this is not critical
      }
    }

    return results;
  } catch (error) {
    logger.error("Failed to perform cleanup:", error);
    throw error;
  }
}

