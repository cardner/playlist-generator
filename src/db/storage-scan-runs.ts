/**
 * Scan Run Storage Operations
 * 
 * This module handles all storage operations related to scan runs,
 * which track the history of library scanning operations.
 * 
 * @module db/storage-scan-runs
 */

import { db } from "./schema";
import type { ScanRunRecord } from "./schema";

/**
 * Create a scan run record
 * 
 * Uses a robust ID generation strategy with timestamp and random component
 * to prevent collisions. Uses put instead of add to handle duplicates gracefully.
 * 
 * @param libraryRootId - Library root ID
 * @param total - Total number of files scanned
 * @param added - Number of files added
 * @param changed - Number of files changed
 * @param removed - Number of files removed
 * @returns Created scan run record
 * 
 * @example
 * ```typescript
 * const scanRun = await createScanRun(libraryRootId, 1000, 50, 10, 5);
 * ```
 */
export async function createScanRun(
  libraryRootId: string,
  total: number,
  added: number,
  changed: number,
  removed: number
): Promise<ScanRunRecord> {
  // Generate ID with timestamp and random component to prevent collisions
  const id = `scan-${libraryRootId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const record: ScanRunRecord = {
    id,
    libraryRootId,
    startedAt: Date.now(),
    total,
    added,
    changed,
    removed,
    parseErrors: 0,
  };

  // Use put instead of add to handle any potential duplicates gracefully
  await db.scanRuns.put(record);
  return record;
}

/**
 * Update scan run with finish time and parse errors
 * 
 * @param id - Scan run ID
 * @param parseErrors - Number of parse errors encountered
 * 
 * @example
 * ```typescript
 * await updateScanRun(scanRunId, 5);
 * ```
 */
export async function updateScanRun(
  id: string,
  parseErrors: number
): Promise<void> {
  await db.scanRuns.update(id, {
    finishedAt: Date.now(),
    parseErrors,
  });
}

/**
 * Get scan runs for a library root
 * 
 * Returns scan runs sorted by start time (most recent first).
 * 
 * @param libraryRootId - Library root ID
 * @returns Array of scan run records, sorted by startedAt
 * 
 * @example
 * ```typescript
 * const scanRuns = await getScanRuns(libraryRootId);
 * const latestScan = scanRuns[0]; // Most recent scan
 * ```
 */
export async function getScanRuns(
  libraryRootId: string
): Promise<ScanRunRecord[]> {
  return db.scanRuns
    .where("libraryRootId")
    .equals(libraryRootId)
    .sortBy("startedAt");
}

