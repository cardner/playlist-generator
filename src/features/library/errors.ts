/**
 * Library Error Utilities
 * 
 * Standardized error handling and types for library-related operations.
 * Provides error classes, error checking utilities, and user-friendly error messages.
 * 
 * @example
 * ```tsx
 * import { LibraryError, isScanningError, getScanningErrorMessage } from '@/features/library/errors';
 * 
 * try {
 *   await scanLibrary(root);
 * } catch (error) {
 *   if (isScanningError(error)) {
 *     const message = getScanningErrorMessage(error);
 *     logger.error(message);
 *   }
 * }
 * ```
 */

import { logger } from "@/lib/logger";

/**
 * Error types for library operations
 */
export enum LibraryErrorType {
  /** Scanning-related errors */
  SCANNING = "scanning",
  /** Metadata parsing errors */
  METADATA = "metadata",
  /** Permission-related errors */
  PERMISSION = "permission",
  /** Storage-related errors */
  STORAGE = "storage",
  /** Relinking errors */
  RELINKING = "relinking",
  /** Unknown or generic errors */
  UNKNOWN = "unknown",
}

/**
 * Base error class for library operations
 */
export class LibraryError extends Error {
  constructor(
    public readonly type: LibraryErrorType,
    message: string,
    public readonly originalError?: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LibraryError";
    Object.setPrototypeOf(this, LibraryError.prototype);
  }
}

/**
 * Scanning-specific error
 */
export class ScanningError extends LibraryError {
  constructor(
    message: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(LibraryErrorType.SCANNING, message, originalError, context);
    this.name = "ScanningError";
    Object.setPrototypeOf(this, ScanningError.prototype);
  }
}

/**
 * Metadata parsing error
 */
export class MetadataError extends LibraryError {
  constructor(
    message: string,
    public readonly trackFileId?: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(LibraryErrorType.METADATA, message, originalError, context);
    this.name = "MetadataError";
    Object.setPrototypeOf(this, MetadataError.prototype);
  }
}

/**
 * Permission error
 */
export class PermissionError extends LibraryError {
  constructor(
    message: string,
    public readonly permissionStatus?: "granted" | "denied" | "prompt",
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(LibraryErrorType.PERMISSION, message, originalError, context);
    this.name = "PermissionError";
    Object.setPrototypeOf(this, PermissionError.prototype);
  }
}

/**
 * Storage error (quota, database, etc.)
 */
export class StorageError extends LibraryError {
  constructor(
    message: string,
    public readonly isQuotaError?: boolean,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(LibraryErrorType.STORAGE, message, originalError, context);
    this.name = "StorageError";
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

/**
 * Relinking error
 */
export class RelinkingError extends LibraryError {
  constructor(
    message: string,
    public readonly matched?: number,
    public readonly total?: number,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(LibraryErrorType.RELINKING, message, originalError, context);
    this.name = "RelinkingError";
    Object.setPrototypeOf(this, RelinkingError.prototype);
  }
}

/**
 * Type guard to check if an error is a LibraryError
 */
export function isLibraryError(error: unknown): error is LibraryError {
  return error instanceof LibraryError;
}

/**
 * Type guard to check if an error is a ScanningError
 */
export function isScanningError(error: unknown): error is ScanningError {
  return error instanceof ScanningError;
}

/**
 * Type guard to check if an error is a MetadataError
 */
export function isMetadataError(error: unknown): error is MetadataError {
  return error instanceof MetadataError;
}

/**
 * Type guard to check if an error is a PermissionError
 */
export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof PermissionError;
}

/**
 * Type guard to check if an error is a StorageError
 */
export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

/**
 * Type guard to check if an error is a RelinkingError
 */
export function isRelinkingError(error: unknown): error is RelinkingError {
  return error instanceof RelinkingError;
}

/**
 * Get user-friendly error message for scanning errors
 */
export function getScanningErrorMessage(error: unknown): string {
  if (isScanningError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("permission") || message.includes("denied")) {
      return "Permission denied. Please grant access to your music folder.";
    }
    
    if (message.includes("not found") || message.includes("missing")) {
      return "Music folder not found. Please select your folder again.";
    }
    
    if (message.includes("timeout")) {
      return "Scan timed out. Please try again with a smaller folder.";
    }
    
    if (message.includes("quota") || message.includes("storage")) {
      return "Storage quota exceeded. Please free up space and try again.";
    }
  }

  return "Failed to scan music library. Please try again.";
}

/**
 * Get user-friendly error message for metadata parsing errors
 */
export function getMetadataErrorMessage(error: unknown, trackFileId?: string): string {
  if (isMetadataError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("corrupt") || message.includes("invalid")) {
      return `File is corrupted or invalid${trackFileId ? ` (${trackFileId})` : ""}. Skipping.`;
    }
    
    if (message.includes("format") || message.includes("unsupported")) {
      return `Unsupported file format${trackFileId ? ` (${trackFileId})` : ""}. Skipping.`;
    }
    
    if (message.includes("permission") || message.includes("access")) {
      return `Cannot access file${trackFileId ? ` (${trackFileId})` : ""}. Skipping.`;
    }
  }

  return `Failed to parse metadata${trackFileId ? ` for ${trackFileId}` : ""}. Skipping.`;
}

/**
 * Get user-friendly error message for permission errors
 */
export function getPermissionErrorMessage(error: unknown): string {
  if (isPermissionError(error)) {
    if (error.permissionStatus === "denied") {
      return "Permission denied. Please grant access to your music folder in your browser settings.";
    }
    if (error.permissionStatus === "prompt") {
      return "Permission required. Please grant access to your music folder.";
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("denied") || message.includes("permission")) {
      return "Permission denied. Please grant access to your music folder.";
    }
    
    if (message.includes("prompt") || message.includes("request")) {
      return "Permission required. Please grant access to your music folder.";
    }
  }

  return "Permission error. Please try selecting your folder again.";
}

/**
 * Get user-friendly error message for storage errors
 */
export function getStorageErrorMessage(error: unknown): string {
  if (isStorageError(error)) {
    if (error.isQuotaError) {
      return "Storage quota exceeded. Please free up space or delete old data.";
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("quota") || message.includes("storage") || message.includes("full")) {
      return "Storage quota exceeded. Please free up space or delete old data.";
    }
    
    if (message.includes("database") || message.includes("indexeddb")) {
      return "Database error. Please try refreshing the page.";
    }
  }

  return "Storage error. Please try again.";
}

/**
 * Get user-friendly error message for relinking errors
 */
export function getRelinkingErrorMessage(error: unknown): string {
  if (isRelinkingError(error)) {
    if (error.matched !== undefined && error.total !== undefined) {
      return `Relinked ${error.matched} of ${error.total} files. ${error.message}`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("not found") || message.includes("missing")) {
      return "Library root not found. Please scan your library first.";
    }
    
    if (message.includes("no tracks") || message.includes("empty")) {
      return "No tracks found to relink. Please scan your library first.";
    }
  }

  return "Failed to relink library. Please try again.";
}

/**
 * Get user-friendly error message for any library error
 */
export function getLibraryErrorMessage(error: unknown): string {
  if (isLibraryError(error)) {
    switch (error.type) {
      case LibraryErrorType.SCANNING:
        return getScanningErrorMessage(error);
      case LibraryErrorType.METADATA:
        return getMetadataErrorMessage(error, error instanceof MetadataError ? error.trackFileId : undefined);
      case LibraryErrorType.PERMISSION:
        return getPermissionErrorMessage(error);
      case LibraryErrorType.STORAGE:
        return getStorageErrorMessage(error);
      case LibraryErrorType.RELINKING:
        return getRelinkingErrorMessage(error);
      default:
        return error.message || "An unknown error occurred.";
    }
  }

  // Fallback for non-LibraryError errors
  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown error occurred.";
}

/**
 * Wrap an error in a LibraryError with appropriate type
 */
export function wrapLibraryError(
  error: unknown,
  type: LibraryErrorType,
  context?: Record<string, unknown>
): LibraryError {
  if (isLibraryError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  
  switch (type) {
    case LibraryErrorType.SCANNING:
      return new ScanningError(message, error, context);
    case LibraryErrorType.METADATA:
      return new MetadataError(message, undefined, error, context);
    case LibraryErrorType.PERMISSION:
      return new PermissionError(message, undefined, error, context);
    case LibraryErrorType.STORAGE:
      return new StorageError(message, false, error, context);
    case LibraryErrorType.RELINKING:
      return new RelinkingError(message, undefined, undefined, error, context);
    default:
      return new LibraryError(LibraryErrorType.UNKNOWN, message, error, context);
  }
}

/**
 * Log a library error with appropriate level and context
 */
export function logLibraryError(
  error: unknown,
  operation: string,
  context?: Record<string, unknown>
): void {
  if (isLibraryError(error)) {
    logger.error(`[${error.type}] ${operation}:`, error.message, {
      ...error.context,
      ...context,
      originalError: error.originalError,
    });
  } else {
    logger.error(`[Library] ${operation}:`, error, context);
  }
}

