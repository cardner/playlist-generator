/**
 * Library scanning and indexing
 * 
 * Handles recursive scanning of audio files with incremental updates
 */

import type { LibraryRoot, LibraryFile } from "@/lib/library-selection";
import {
  getLibraryFiles,
  getLibraryFilesFromFileList,
} from "@/lib/library-selection";

/**
 * Supported audio file extensions
 */
export const SUPPORTED_EXTENSIONS = [
  "mp3",
  "flac",
  "m4a",
  "aac",
  "alac",
  "ogg",
  "wav",
  "aiff",
  "wma",
] as const;

export type SupportedExtension = typeof SUPPORTED_EXTENSIONS[number];

/**
 * File index entry representing a scanned audio file
 */
export interface FileIndexEntry {
  trackFileId: string;
  relativePath?: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
}

/**
 * File index as a map of trackFileId -> FileIndexEntry
 */
export type FileIndex = Map<string, FileIndexEntry>;

/**
 * Diff result showing changes between two indexes
 */
export interface FileIndexDiff {
  added: FileIndexEntry[];
  changed: FileIndexEntry[];
  removed: FileIndexEntry[];
}

/**
 * Scan result with counts and timing information
 */
export interface ScanResult {
  total: number;
  added: number;
  changed: number;
  removed: number;
  duration: number; // milliseconds
  entries: FileIndexEntry[];
}

/**
 * Scan progress callback
 */
export type ScanProgressCallback = (progress: {
  found: number;
  scanned: number;
  currentFile?: string;
}) => void;

/**
 * Normalize a relative path for storage
 * - Ensures forward slashes
 * - Removes double slashes
 * - Removes trailing slashes
 * - Validates path segments
 * 
 * @param path Raw path string
 * @returns Normalized path
 */
function normalizeRelativePath(path: string): string {
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
 * Generate a stable file ID from file properties
 * Matches the implementation in library-selection.ts
 * 
 * @param relativePath Relative path or file name
 * @param size File size in bytes
 * @param mtime Last modified time
 * @returns Stable file ID
 */
export function generateTrackFileId(
  relativePath: string,
  size: number,
  mtime: number
): string {
  // Match the implementation from library-selection.ts
  // Use file name, size, and last modified time to create ID
  const hash = `${relativePath}-${size}-${mtime}`;
  // Simple base64 encoding (matching library-selection.ts)
  return btoa(hash).replace(/[^a-zA-Z0-9]/g, "").substring(0, 32);
}

/**
 * Check if a file extension is supported
 * 
 * @param extension File extension (lowercase, without dot)
 * @returns true if extension is supported
 */
export function isSupportedExtension(extension: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(extension as SupportedExtension);
}

/**
 * Build file index from library root
 * Non-blocking: yields control periodically to avoid UI freeze
 * 
 * @param root Library root to scan
 * @param onProgress Optional progress callback
 * @returns Promise resolving to file index map
 */
export async function buildFileIndex(
  root: LibraryRoot,
  onProgress?: ScanProgressCallback
): Promise<FileIndex> {
  const index = new Map<string, FileIndexEntry>();
  let found = 0;
  let scanned = 0;

  try {
    if (root.mode === "handle") {
      // Handle mode: recursive directory traversal
      for await (const libraryFile of getLibraryFiles(root)) {
        found++;

        // Check if file extension is supported
        if (isSupportedExtension(libraryFile.extension)) {
          // Normalize relative path before storing
          const normalizedRelativePath = libraryFile.relativePath 
            ? normalizeRelativePath(libraryFile.relativePath)
            : undefined;
          
          // Use the trackFileId from libraryFile (already generated correctly)
          const entry: FileIndexEntry = {
            trackFileId: libraryFile.trackFileId,
            relativePath: normalizedRelativePath,
            name: libraryFile.file.name,
            extension: libraryFile.extension,
            size: libraryFile.size,
            mtime: libraryFile.mtime,
          };

          index.set(entry.trackFileId, entry);
          scanned++;

          // Yield control every 50 files to avoid blocking UI
          if (scanned % 50 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            onProgress?.({
              found,
              scanned,
              currentFile: libraryFile.file.name,
            });
          }
        }

        // Report progress periodically
        if (found % 100 === 0) {
          onProgress?.({
            found,
            scanned,
            currentFile: libraryFile.file.name,
          });
        }
      }
    } else {
      // Fallback mode: files need to be provided via file input
      // This function cannot work in fallback mode without file list
      throw new Error(
        "Fallback mode requires file list. Use buildFileIndexFromFileList instead."
      );
    }

    // Final progress update
    onProgress?.({
      found,
      scanned,
    });

    return index;
  } catch (error) {
    console.error("Error building file index:", error);
    throw error;
  }
}

/**
 * Build file index from FileList (for fallback mode)
 * 
 * @param files FileList from input element
 * @param rootName Root folder name
 * @param onProgress Optional progress callback
 * @returns Promise resolving to file index map
 */
export async function buildFileIndexFromFileList(
  files: FileList,
  rootName: string,
  onProgress?: ScanProgressCallback
): Promise<FileIndex> {
  const index = new Map<string, FileIndexEntry>();
  let found = 0;
  let scanned = 0;

  try {
    for await (const libraryFile of getLibraryFilesFromFileList(
      files,
      rootName
    )) {
      found++;

      // Check if file extension is supported
      if (isSupportedExtension(libraryFile.extension)) {
        // Normalize relative path before storing
        const normalizedRelativePath = libraryFile.relativePath 
          ? normalizeRelativePath(libraryFile.relativePath)
          : undefined;
        
        // Use the trackFileId from libraryFile (already generated correctly)
        const entry: FileIndexEntry = {
          trackFileId: libraryFile.trackFileId,
          relativePath: normalizedRelativePath,
          name: libraryFile.file.name,
          extension: libraryFile.extension,
          size: libraryFile.size,
          mtime: libraryFile.mtime,
        };

        index.set(entry.trackFileId, entry);
        scanned++;

        // Yield control every 50 files to avoid blocking UI
        if (scanned % 50 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          onProgress?.({
            found,
            scanned,
            currentFile: libraryFile.file.name,
          });
        }
      }

      // Report progress periodically
      if (found % 100 === 0) {
        onProgress?.({
          found,
          scanned,
          currentFile: libraryFile.file.name,
        });
      }
    }

    // Final progress update
    onProgress?.({
      found,
      scanned,
    });

    return index;
  } catch (error) {
    console.error("Error building file index from file list:", error);
    throw error;
  }
}

/**
 * Diff two file indexes to find added, changed, and removed files
 * 
 * @param prev Previous file index
 * @param next Next file index
 * @returns Diff result with added, changed, and removed entries
 */
export function diffFileIndex(
  prev: FileIndex,
  next: FileIndex
): FileIndexDiff {
  const added: FileIndexEntry[] = [];
  const changed: FileIndexEntry[] = [];
  const removed: FileIndexEntry[] = [];

  // Find added and changed files
  for (const [trackFileId, nextEntry] of next.entries()) {
    const prevEntry = prev.get(trackFileId);

    if (!prevEntry) {
      // New file
      added.push(nextEntry);
    } else if (
      prevEntry.size !== nextEntry.size ||
      prevEntry.mtime !== nextEntry.mtime
    ) {
      // File changed (size or mtime different)
      changed.push(nextEntry);
    }
  }

  // Find removed files
  for (const [trackFileId, prevEntry] of prev.entries()) {
    if (!next.has(trackFileId)) {
      removed.push(prevEntry);
    }
  }

  return { added, changed, removed };
}

/**
 * Scan library and return result with diff information
 * 
 * @param root Library root to scan
 * @param onProgress Optional progress callback
 * @returns Promise resolving to scan result
 */
export async function scanLibrary(
  root: LibraryRoot,
  onProgress?: ScanProgressCallback
): Promise<ScanResult> {
  const { measureAsync } = await import("./performance");
  
  return measureAsync(
    "scanLibrary",
    async () => {
      const startTime = Date.now();

      // Load previous index from IndexedDB
      const prevIndex = await loadFileIndex();

      // Build new index
      let nextIndex: FileIndex;
      
      if (root.mode === "handle") {
        nextIndex = await buildFileIndex(root, onProgress);
      } else {
        throw new Error(
          "Handle mode required for scanning. Fallback mode requires file list."
        );
      }

      // Calculate diff
      const diff = diffFileIndex(prevIndex, nextIndex);

      // Save new index to IndexedDB
      await saveFileIndex(nextIndex);

      const duration = Date.now() - startTime;

      return {
        total: nextIndex.size,
        added: diff.added.length,
        changed: diff.changed.length,
        removed: diff.removed.length,
        duration,
        entries: Array.from(nextIndex.values()),
      };
    },
    {
      mode: root.mode,
      rootName: root.name,
    }
  );
}

/**
 * Scan library from FileList (fallback mode)
 * 
 * @param files FileList from input element
 * @param rootName Root folder name
 * @param onProgress Optional progress callback
 * @returns Promise resolving to scan result
 */
export async function scanLibraryFromFileList(
  files: FileList,
  rootName: string,
  onProgress?: ScanProgressCallback
): Promise<ScanResult> {
  const startTime = Date.now();

  // Load previous index from IndexedDB
  const prevIndex = await loadFileIndex();

  // Build new index
  const nextIndex = await buildFileIndexFromFileList(
    files,
    rootName,
    onProgress
  );

  // Calculate diff
  const diff = diffFileIndex(prevIndex, nextIndex);

  // Save new index to IndexedDB
  await saveFileIndex(nextIndex);

  const duration = Date.now() - startTime;

  return {
    total: nextIndex.size,
    added: diff.added.length,
    changed: diff.changed.length,
    removed: diff.removed.length,
    duration,
    entries: Array.from(nextIndex.values()),
  };
}

// ============================================================================
// IndexedDB persistence
// ============================================================================

// Removed initDB import - using Dexie from @/db/schema instead

/**
 * Load file index from IndexedDB
 * 
 * @returns Promise resolving to file index map
 */
async function loadFileIndex(): Promise<FileIndex> {
  // This function is deprecated - file index is now stored per libraryRootId
  // Return empty index for backwards compatibility
  // The actual file index loading is handled by scanning-persist.ts
  return new Map();
}

/**
 * Save file index to IndexedDB
 * 
 * @param index File index to save
 */
async function saveFileIndex(index: FileIndex): Promise<void> {
  // This function is deprecated - file index is now stored per libraryRootId
  // Do nothing for backwards compatibility
  // The actual file index saving is handled by scanning-persist.ts
  console.warn("saveFileIndex called - this is deprecated. Use saveFileIndexEntries instead.");
}

