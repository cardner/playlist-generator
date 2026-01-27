/**
 * Library Selection Types
 * 
 * Shared type definitions for library selection functionality.
 * 
 * @module lib/library-selection-types
 */

/**
 * Library root selection mode
 */
export type LibraryRootMode = "handle" | "fallback" | "spotify";

/**
 * Library root configuration
 */
export interface LibraryRoot {
  mode: LibraryRootMode;
  name: string;
  handleId?: string; // For handle mode: ID to retrieve handle from IndexedDB
  lastImportedAt?: number; // For fallback mode: timestamp of last import
}

/**
 * Library file representation
 */
export interface LibraryFile {
  file: File;
  /** File handle (handle mode only, required for writeback) */
  handle?: FileSystemFileHandle;
  trackFileId: string; // Unique identifier for the file
  relativePath?: string; // Relative path from library root (handle mode)
  extension: string; // File extension (lowercase)
  size: number; // File size in bytes
  mtime: number; // Last modified time
}

/**
 * Permission status
 */
export type PermissionStatus = "granted" | "denied" | "prompt";

