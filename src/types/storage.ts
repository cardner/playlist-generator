/**
 * Storage-Related Types
 * 
 * This module defines all TypeScript types and interfaces used for storage
 * operations, quota management, and database utilities.
 * 
 * @module types/storage
 */

/**
 * Storage quota information
 * 
 * Contains information about IndexedDB storage usage and limits.
 * Retrieved from the browser's Storage API.
 * 
 * @example
 * ```typescript
 * const quotaInfo: StorageQuotaInfo = {
 *   usage: 52428800, // 50 MB
 *   quota: 524288000, // 500 MB
 *   usagePercent: 10,
 *   isNearLimit: false
 * };
 * ```
 */
export interface StorageQuotaInfo {
  /** Current storage usage in bytes */
  usage: number;
  /** Total storage quota in bytes */
  quota: number;
  /** Usage percentage (0-100) */
  usagePercent: number;
  /** True if usage is above 80% of quota */
  isNearLimit: boolean;
}

/**
 * Storage error type
 * 
 * Type of storage error that occurred.
 * 
 * - "quota_exceeded": Storage quota has been exceeded
 * - "unknown": Unknown storage error
 * - "blocked": Storage access is blocked
 * 
 * @example
 * ```typescript
 * const errorType: StorageErrorType = "quota_exceeded";
 * ```
 */
export type StorageErrorType = "quota_exceeded" | "unknown" | "blocked";

/**
 * Storage error object
 * 
 * Represents a storage-related error with context and quota information.
 * 
 * @example
 * ```typescript
 * const storageError: StorageError = {
 *   type: "quota_exceeded",
 *   message: "Storage quota exceeded",
 *   originalError: error,
 *   quotaInfo: quotaInfo
 * };
 * ```
 */
export interface StorageError {
  /** Type of storage error */
  type: StorageErrorType;
  /** Human-readable error message */
  message: string;
  /** Original error that caused this storage error (optional) */
  originalError?: Error;
  /** Quota information at time of error (optional) */
  quotaInfo?: StorageQuotaInfo;
}

/**
 * Storage statistics
 * 
 * Contains statistics about storage usage across different database tables.
 * Used for displaying storage information to users and cleanup operations.
 * 
 * @example
 * ```typescript
 * const stats: StorageStats = {
 *   libraryRoots: 5,
 *   tracks: 10000,
 *   fileIndex: 10000,
 *   scanRuns: 50,
 *   savedPlaylists: 20,
 *   totalSize: 52428800
 * };
 * ```
 */
export interface StorageStats {
  /** Number of library root records */
  libraryRoots: number;
  /** Number of track records */
  tracks: number;
  /** Number of file index entries */
  fileIndex: number;
  /** Number of scan run records */
  scanRuns: number;
  /** Number of saved playlist records */
  savedPlaylists: number;
  /** Total estimated storage size in bytes */
  totalSize: number;
}

/**
 * Storage cleanup options
 * 
 * Options for cleaning up storage, specifying what to delete.
 * 
 * @example
 * ```typescript
 * const options: StorageCleanupOptions = {
 *   deleteOldScanRuns: true,
 *   deleteOldPlaylists: true,
 *   keepRecentDays: 30
 * };
 * ```
 */
export interface StorageCleanupOptions {
  /** Delete old scan run records */
  deleteOldScanRuns?: boolean;
  /** Delete old saved playlists */
  deleteOldPlaylists?: boolean;
  /** Keep records newer than this many days (default: 30) */
  keepRecentDays?: number;
  /** Delete orphaned file index entries (no matching tracks) */
  deleteOrphanedFileIndex?: boolean;
  /** Delete orphaned tracks (no matching file index) */
  deleteOrphanedTracks?: boolean;
}

/**
 * Storage cleanup result
 * 
 * Result of a storage cleanup operation, showing what was deleted.
 * 
 * @example
 * ```typescript
 * const result: StorageCleanupResult = {
 *   deletedScanRuns: 10,
 *   deletedPlaylists: 5,
 *   deletedFileIndex: 100,
 *   deletedTracks: 100,
 *   freedSpace: 10485760
 * };
 * ```
 */
export interface StorageCleanupResult {
  /** Number of scan run records deleted */
  deletedScanRuns: number;
  /** Number of saved playlist records deleted */
  deletedPlaylists: number;
  /** Number of file index entries deleted */
  deletedFileIndex: number;
  /** Number of track records deleted */
  deletedTracks: number;
  /** Estimated space freed in bytes */
  freedSpace: number;
}

/**
 * Quota check result
 * 
 * Result of checking if an operation would exceed storage quota.
 * 
 * @example
 * ```typescript
 * const check: QuotaCheckResult = {
 *   allowed: true,
 *   quotaInfo: quotaInfo,
 *   projectedUsage: 104857600,
 *   projectedPercent: 20
 * };
 * ```
 */
export interface QuotaCheckResult {
  /** Whether the operation is allowed (won't exceed threshold) */
  allowed: boolean;
  /** Current quota information (null if unavailable) */
  quotaInfo: StorageQuotaInfo | null;
  /** Projected usage after operation (bytes) */
  projectedUsage?: number;
  /** Projected usage percentage after operation */
  projectedPercent?: number;
}

/**
 * Batch operation options
 * 
 * Options for batch storage operations to control performance and memory usage.
 * 
 * @example
 * ```typescript
 * const options: BatchOperationOptions = {
 *   batchSize: 100,
 *   delayBetweenBatches: 10,
 *   onProgress: (progress) => console.log(progress)
 * };
 * ```
 */
export interface BatchOperationOptions {
  /** Number of items to process per batch */
  batchSize?: number;
  /** Delay in milliseconds between batches (for UI responsiveness) */
  delayBetweenBatches?: number;
  /** Progress callback function (optional) */
  onProgress?: (progress: BatchProgress) => void;
}

/**
 * Batch operation progress
 * 
 * Progress information for batch storage operations.
 * 
 * @example
 * ```typescript
 * const progress: BatchProgress = {
 *   processed: 500,
 *   total: 1000,
 *   currentBatch: 5,
 *   totalBatches: 10
 * };
 * ```
 */
export interface BatchProgress {
  /** Number of items processed so far */
  processed: number;
  /** Total number of items to process */
  total: number;
  /** Current batch number (1-indexed) */
  currentBatch: number;
  /** Total number of batches */
  totalBatches: number;
}

/**
 * Storage operation result
 * 
 * Generic result type for storage operations that may succeed or fail.
 * 
 * @example
 * ```typescript
 * const result: StorageOperationResult<TrackRecord> = {
 *   success: true,
 *   data: trackRecord,
 *   error: undefined
 * };
 * ```
 */
export interface StorageOperationResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data (only present if success is true) */
  data?: T;
  /** Error message (only present if success is false) */
  error?: string;
}

/**
 * Format storage size for display
 * 
 * Converts bytes to a human-readable string (e.g., "50 MB", "1.2 GB").
 * 
 * @param bytes - Size in bytes
 * @returns Formatted size string
 * 
 * @example
 * ```typescript
 * const formatted = formatStorageSize(52428800);
 * // Returns: "50 MB"
 * ```
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Estimate storage size for a batch of records
 * 
 * Estimates the storage size needed for a batch of records, including
 * IndexedDB overhead.
 * 
 * @param recordCount - Number of records
 * @param avgRecordSize - Average size per record in bytes
 * @returns Estimated total size in bytes (including 20% overhead)
 * 
 * @example
 * ```typescript
 * const estimatedSize = estimateStorageSize(1000, 1024);
 * // Returns: 1228800 (1000 * 1024 * 1.2)
 * ```
 */
export function estimateStorageSize(recordCount: number, avgRecordSize: number): number {
  // Add 20% overhead for IndexedDB structure
  return Math.ceil(recordCount * avgRecordSize * 1.2);
}

/**
 * Check if storage usage is near quota limit
 * 
 * @param quotaInfo - Storage quota information
 * @param threshold - Threshold percentage (default: 80)
 * @returns True if usage is above threshold
 * 
 * @example
 * ```typescript
 * if (isNearQuotaLimit(quotaInfo, 90)) {
 *   // Warn user about high storage usage
 * }
 * ```
 */
export function isNearQuotaLimit(quotaInfo: StorageQuotaInfo, threshold: number = 80): boolean {
  return quotaInfo.usagePercent >= threshold;
}

/**
 * Calculate projected storage usage
 * 
 * Calculates what storage usage would be after adding a certain amount of data.
 * 
 * @param currentUsage - Current storage usage in bytes
 * @param quota - Total storage quota in bytes
 * @param additionalSize - Additional size to add in bytes
 * @returns Projected usage information
 * 
 * @example
 * ```typescript
 * const projection = calculateProjectedUsage(50000000, 500000000, 10000000);
 * // Returns: { usage: 60000000, percent: 12 }
 * ```
 */
export function calculateProjectedUsage(
  currentUsage: number,
  quota: number,
  additionalSize: number
): { usage: number; percent: number } {
  const projectedUsage = currentUsage + additionalSize;
  const projectedPercent = quota > 0 ? (projectedUsage / quota) * 100 : 0;
  
  return {
    usage: projectedUsage,
    percent: projectedPercent,
  };
}

