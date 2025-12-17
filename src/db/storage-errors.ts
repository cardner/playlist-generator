/**
 * Storage error handling and quota management
 */

import { db } from "./schema";

export interface StorageQuotaInfo {
  usage: number;
  quota: number;
  usagePercent: number;
  isNearLimit: boolean;
}

export interface StorageError {
  type: "quota_exceeded" | "unknown" | "blocked";
  message: string;
  originalError?: Error;
  quotaInfo?: StorageQuotaInfo;
}

/**
 * Check if an error is a quota exceeded error
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  
  const errorName = error instanceof Error ? error.name : String(error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  return (
    errorName === "QuotaExceededError" ||
    errorName === "DOMException" ||
    errorMessage.includes("quota") ||
    errorMessage.includes("QuotaExceeded") ||
    errorMessage.includes("storage") ||
    (error instanceof DOMException && error.code === 22)
  );
}

/**
 * Get storage quota information
 */
export async function getStorageQuotaInfo(): Promise<StorageQuotaInfo | null> {
  if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;
    const isNearLimit = usagePercent > 80;

    return {
      usage,
      quota,
      usagePercent,
      isNearLimit,
    };
  } catch (error) {
    console.error("Failed to get storage quota:", error);
    return null;
  }
}

/**
 * Format storage size for display
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Wrap a storage operation with quota error handling
 */
export async function withQuotaErrorHandling<T>(
  operation: () => Promise<T>,
  context: string = "storage operation"
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isQuotaExceededError(error)) {
      const quotaInfo = await getStorageQuotaInfo();
      const storageError: StorageError = {
        type: "quota_exceeded",
        message: `Storage quota exceeded during ${context}. Please free up space or reduce library size.`,
        originalError: error instanceof Error ? error : new Error(String(error)),
        quotaInfo: quotaInfo || undefined,
      };
      
      console.error("Storage quota exceeded:", storageError);
      throw storageError;
    }
    
    // Re-throw non-quota errors
    throw error;
  }
}

/**
 * Estimate storage size for a batch of records
 */
export function estimateStorageSize(recordCount: number, avgRecordSize: number): number {
  // Add 20% overhead for IndexedDB structure
  return Math.ceil(recordCount * avgRecordSize * 1.2);
}

/**
 * Check if operation would exceed quota
 */
export async function checkQuotaBeforeOperation(
  estimatedSize: number,
  threshold: number = 0.9
): Promise<{ allowed: boolean; quotaInfo: StorageQuotaInfo | null }> {
  const quotaInfo = await getStorageQuotaInfo();
  
  if (!quotaInfo) {
    // Can't check quota, allow operation
    return { allowed: true, quotaInfo: null };
  }
  
  const projectedUsage = quotaInfo.usage + estimatedSize;
  const projectedPercent = (projectedUsage / quotaInfo.quota) * 100;
  const allowed = projectedPercent < threshold * 100;
  
  return { allowed, quotaInfo };
}

