/**
 * Database Error Utilities
 * 
 * Standardized error handling and types for database operations.
 * Provides error classes, error checking utilities, and user-friendly error messages.
 * 
 * @example
 * ```tsx
 * import { DatabaseError, isQuotaExceededError, getQuotaErrorMessage } from '@/db/storage-errors';
 * 
 * try {
 *   await saveTracks(tracks);
 * } catch (error) {
 *   if (isQuotaExceededError(error)) {
 *     const message = getQuotaErrorMessage(error);
 *     logger.error(message);
 *   }
 * }
 * ```
 */

import { db } from "./schema";
import { logger } from "@/lib/logger";

/**
 * Error types for database operations
 */
export enum DatabaseErrorType {
  /** Storage quota exceeded */
  QUOTA = "quota",
  /** Migration errors */
  MIGRATION = "migration",
  /** Schema errors */
  SCHEMA = "schema",
  /** Transaction errors */
  TRANSACTION = "transaction",
  /** Unknown or generic errors */
  UNKNOWN = "unknown",
}

/**
 * Base error class for database operations
 */
export class DatabaseError extends Error {
  constructor(
    public readonly type: DatabaseErrorType,
    message: string,
    public readonly originalError?: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DatabaseError";
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Storage quota error
 */
export class QuotaError extends DatabaseError {
  constructor(
    message: string,
    public readonly quotaInfo?: StorageQuotaInfo,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(DatabaseErrorType.QUOTA, message, originalError, context);
    this.name = "QuotaError";
    Object.setPrototypeOf(this, QuotaError.prototype);
  }
}

/**
 * Migration error
 */
export class MigrationError extends DatabaseError {
  constructor(
    message: string,
    public readonly version?: number,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(DatabaseErrorType.MIGRATION, message, originalError, context);
    this.name = "MigrationError";
    Object.setPrototypeOf(this, MigrationError.prototype);
  }
}

/**
 * Schema error
 */
export class SchemaError extends DatabaseError {
  constructor(
    message: string,
    public readonly tableName?: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(DatabaseErrorType.SCHEMA, message, originalError, context);
    this.name = "SchemaError";
    Object.setPrototypeOf(this, SchemaError.prototype);
  }
}

/**
 * Transaction error
 */
export class TransactionError extends DatabaseError {
  constructor(
    message: string,
    public readonly operation?: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(DatabaseErrorType.TRANSACTION, message, originalError, context);
    this.name = "TransactionError";
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

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
 * Type guard to check if an error is a DatabaseError
 */
export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

/**
 * Type guard to check if an error is a QuotaError
 */
export function isQuotaError(error: unknown): error is QuotaError {
  return error instanceof QuotaError;
}

/**
 * Type guard to check if an error is a MigrationError
 */
export function isMigrationError(error: unknown): error is MigrationError {
  return error instanceof MigrationError;
}

/**
 * Type guard to check if an error is a SchemaError
 */
export function isSchemaError(error: unknown): error is SchemaError {
  return error instanceof SchemaError;
}

/**
 * Type guard to check if an error is a TransactionError
 */
export function isTransactionError(error: unknown): error is TransactionError {
  return error instanceof TransactionError;
}

/**
 * Check if an error is a quota exceeded error
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  
  if (isQuotaError(error)) {
    return true;
  }
  
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
 * Get user-friendly error message for quota errors
 */
export function getQuotaErrorMessage(error: unknown): string {
  if (isQuotaError(error)) {
    if (error.quotaInfo) {
      return `Storage quota exceeded (${error.quotaInfo.usagePercent.toFixed(1)}% used). Please free up space or delete old data.`;
    }
    return error.message;
  }

  if (isQuotaExceededError(error)) {
    return "Storage quota exceeded. Please free up space or delete old data.";
  }

  return "Storage quota exceeded. Please free up space.";
}

/**
 * Get user-friendly error message for migration errors
 */
export function getMigrationErrorMessage(error: unknown): string {
  if (isMigrationError(error)) {
    if (error.version !== undefined) {
      return `Database migration failed for version ${error.version}. ${error.message}`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("migration") || message.includes("version")) {
      return "Database migration failed. Please refresh the page.";
    }
    
    if (message.includes("incompatible") || message.includes("schema")) {
      return "Database schema is incompatible. Please clear your browser data and try again.";
    }
  }

  return "Database migration error. Please refresh the page.";
}

/**
 * Get user-friendly error message for schema errors
 */
export function getSchemaErrorMessage(error: unknown): string {
  if (isSchemaError(error)) {
    if (error.tableName) {
      return `Database schema error for table '${error.tableName}'. ${error.message}`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("schema") || message.includes("table") || message.includes("index")) {
      return "Database schema error. Please refresh the page.";
    }
    
    if (message.includes("constraint") || message.includes("unique")) {
      return "Database constraint violation. Please check your data.";
    }
  }

  return "Database schema error. Please refresh the page.";
}

/**
 * Get user-friendly error message for transaction errors
 */
export function getTransactionErrorMessage(error: unknown): string {
  if (isTransactionError(error)) {
    if (error.operation) {
      return `Database transaction failed during ${error.operation}. ${error.message}`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("transaction") || message.includes("abort")) {
      return "Database transaction failed. Please try again.";
    }
    
    if (message.includes("locked") || message.includes("busy")) {
      return "Database is busy. Please wait a moment and try again.";
    }
  }

  return "Database transaction error. Please try again.";
}

/**
 * Get user-friendly error message for any database error
 */
export function getDatabaseErrorMessage(error: unknown): string {
  if (isDatabaseError(error)) {
    switch (error.type) {
      case DatabaseErrorType.QUOTA:
        return getQuotaErrorMessage(error);
      case DatabaseErrorType.MIGRATION:
        return getMigrationErrorMessage(error);
      case DatabaseErrorType.SCHEMA:
        return getSchemaErrorMessage(error);
      case DatabaseErrorType.TRANSACTION:
        return getTransactionErrorMessage(error);
      default:
        return error.message || "An unknown database error occurred.";
    }
  }

  // Fallback for non-DatabaseError errors
  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown database error occurred.";
}

/**
 * Wrap an error in a DatabaseError with appropriate type
 */
export function wrapDatabaseError(
  error: unknown,
  type: DatabaseErrorType,
  context?: Record<string, unknown>
): DatabaseError {
  if (isDatabaseError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  
  switch (type) {
    case DatabaseErrorType.QUOTA:
      return new QuotaError(message, undefined, error, context);
    case DatabaseErrorType.MIGRATION:
      return new MigrationError(message, undefined, error, context);
    case DatabaseErrorType.SCHEMA:
      return new SchemaError(message, undefined, error, context);
    case DatabaseErrorType.TRANSACTION:
      return new TransactionError(message, undefined, error, context);
    default:
      return new DatabaseError(DatabaseErrorType.UNKNOWN, message, error, context);
  }
}

/**
 * Log a database error with appropriate level and context
 */
export function logDatabaseError(
  error: unknown,
  operation: string,
  context?: Record<string, unknown>
): void {
  if (isDatabaseError(error)) {
    logger.error(`[${error.type}] ${operation}:`, error.message, {
      ...error.context,
      ...context,
      originalError: error.originalError,
    });
  } else {
    logger.error(`[Database] ${operation}:`, error, context);
  }
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
    logger.error("Failed to get storage quota:", error);
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
      
      logger.error("Storage quota exceeded:", storageError);
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

