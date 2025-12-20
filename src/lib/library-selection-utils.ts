/**
 * Library Selection Utility Functions
 * 
 * This module provides utility functions for path normalization,
 * file ID generation, and other helper operations.
 * 
 * @module lib/library-selection-utils
 */

/**
 * Normalize a relative path for storage
 * 
 * - Ensures forward slashes
 * - Removes double slashes
 * - Removes trailing slashes
 * - Validates path segments
 * 
 * @param path Raw path string
 * @returns Normalized path
 * 
 * @example
 * ```typescript
 * normalizeRelativePath("Music\\Rock\\song.mp3"); // Returns: "Music/Rock/song.mp3"
 * normalizeRelativePath("Music//Rock//song.mp3"); // Returns: "Music/Rock/song.mp3"
 * ```
 */
export function normalizeRelativePath(path: string): string {
  if (!path) return path;
  
  // Convert backslashes to forward slashes
  let normalized = path.replace(/\\/g, "/");
  
  // Remove double slashes (but preserve leading // for UNC paths if needed)
  normalized = normalized.replace(/([^:])\/\/+/g, "$1/");
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "");
  
  // Remove empty segments and validate
  const segments = normalized.split("/").filter(seg => {
    // Filter out empty segments and single dots
    return seg.length > 0 && seg !== ".";
  });
  
  // Reconstruct path
  if (normalized.startsWith("/")) {
    return "/" + segments.join("/");
  }
  
  return segments.join("/");
}

/**
 * Generate a unique file ID from path, size, and mtime
 * 
 * Matches requirement: hash(relativePath || file.name, file.size, file.lastModified)
 * Uses a Unicode-safe hash function (btoa can't handle non-ASCII characters)
 * 
 * @param path Relative path or file name
 * @param size File size in bytes
 * @param mtime Last modified time
 * @returns Unique file ID
 * 
 * @example
 * ```typescript
 * const fileId = generateFileIdFromPath("Music/song.mp3", 1024, 1234567890);
 * ```
 */
export function generateFileIdFromPath(path: string, size: number, mtime: number): string {
  const hash = `${path}-${size}-${mtime}`;
  
  // Unicode-safe hash function
  // Convert string to bytes using TextEncoder, then hash
  let hashValue = 0;
  for (let i = 0; i < hash.length; i++) {
    const char = hash.charCodeAt(i);
    hashValue = ((hashValue << 5) - hashValue) + char;
    hashValue = hashValue & hashValue; // Convert to 32-bit integer
  }
  
  // Convert to base36 string (alphanumeric)
  const base36 = Math.abs(hashValue).toString(36);
  return base36.substring(0, 32).padStart(8, '0');
}

/**
 * Generate a unique file ID from File object
 * 
 * Uses relativePath if available, otherwise file.name
 * 
 * @param file File object
 * @param relativePath Optional relative path
 * @returns Unique file ID
 * 
 * @example
 * ```typescript
 * const fileId = generateFileId(file, "Music/song.mp3");
 * ```
 */
export function generateFileId(file: File, relativePath?: string): string {
  const pathForId = relativePath || file.name;
  return generateFileIdFromPath(pathForId, file.size, file.lastModified);
}

/**
 * Get file extension from filename
 * 
 * @param filename File name
 * @returns Lowercase extension (without dot)
 * 
 * @example
 * ```typescript
 * getFileExtension("song.MP3"); // Returns: "mp3"
 * getFileExtension("song"); // Returns: ""
 * ```
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) {
    return "";
  }
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Check if fallback mode files need to be re-imported
 * 
 * Files don't persist after page reload in fallback mode.
 * 
 * @param root Library root to check
 * @returns true if files need to be re-imported
 * 
 * @example
 * ```typescript
 * if (needsReimport(root)) {
 *   // Prompt user to re-select folder
 * }
 * ```
 */
export function needsReimport(root: { mode: "handle" | "fallback" }): boolean {
  if (root.mode === "fallback") {
    // Fallback files always need re-import after reload
    // We can't reliably detect if files are still available
    return true;
  }
  return false;
}

