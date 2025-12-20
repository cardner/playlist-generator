/**
 * Integration between scanning and metadata parsing
 * 
 * Helps convert FileIndexEntry to LibraryFile for metadata parsing
 */

import type { LibraryRoot } from "@/lib/library-selection";
import { getLibraryFiles } from "@/lib/library-selection";
import type { FileIndexEntry, FileIndexDiff } from "./scanning";
import type { LibraryFile } from "@/lib/library-selection";
import { logger } from "@/lib/logger";

/**
 * Get a file handle from a relative path
 * Navigates from root handle using path segments
 */
async function getFileHandleFromPath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  const parts = relativePath.split("/").filter(p => p.length > 0);
  let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = rootHandle;

  try {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (currentHandle instanceof FileSystemDirectoryHandle) {
        if (isLast) {
          // Last part should be a file
          return await currentHandle.getFileHandle(part);
        } else {
          // Intermediate part should be a directory
          currentHandle = await currentHandle.getDirectoryHandle(part);
        }
      } else {
        // Unexpected: hit a file before the end of the path
        return null;
      }
    }
  } catch (error) {
    // File or directory not found
    return null;
  }

  return null;
}

/**
 * Get LibraryFile objects for entries that need metadata parsing
 * 
 * Optimized for large libraries: uses relative paths to navigate directly to files
 * instead of traversing the entire directory structure.
 * 
 * @param root Library root
 * @param entries File index entries to get files for
 * @returns Promise resolving to array of LibraryFile objects
 */
export async function getLibraryFilesForEntries(
  root: LibraryRoot,
  entries: FileIndexEntry[]
): Promise<LibraryFile[]> {
  if (root.mode !== "handle") {
    throw new Error("Only handle mode supported for metadata parsing");
  }

  // Get root directory handle from database
  const { db } = await import("@/db/schema");
  const handleRecord = await db.directoryHandles.get(root.handleId!);
  const rootHandle = handleRecord?.handle as FileSystemDirectoryHandle | undefined;
  if (!rootHandle) {
    throw new Error("Directory handle not found");
  }

  const libraryFiles: LibraryFile[] = [];
  let processed = 0;
  let found = 0;
  let notFound = 0;

  // For large libraries, use direct path navigation (faster)
  // For small libraries, fallback to traversal (more reliable)
  const useDirectPath = entries.length > 1000;
  
  if (useDirectPath) {
    // Process entries with relative paths first (faster)
    const entriesWithPaths = entries.filter(e => e.relativePath);
    const entriesWithoutPaths = entries.filter(e => !e.relativePath);
    
    // Process entries with paths using direct navigation
    for (const entry of entriesWithPaths) {
      processed++;
      
      try {
        const fileHandle = await getFileHandleFromPath(rootHandle, entry.relativePath!);
        if (fileHandle) {
          const file = await fileHandle.getFile();
          
          // Use the trackFileId from the entry (it was generated during scanning)
          // Verify file properties match
          if (file.size === entry.size && file.lastModified === entry.mtime) {
            libraryFiles.push({
              file,
              trackFileId: entry.trackFileId,
              relativePath: entry.relativePath,
              extension: entry.extension,
              size: entry.size,
              mtime: entry.mtime,
            });
            found++;
          } else {
            logger.warn(`File properties mismatch for ${entry.relativePath}: size ${file.size} vs ${entry.size}, mtime ${file.lastModified} vs ${entry.mtime}`);
            notFound++;
          }
        } else {
          notFound++;
        }
      } catch (error) {
        logger.warn(`Failed to get file for ${entry.relativePath}:`, error);
        notFound++;
      }
      
      // Yield to UI thread periodically
      if (processed % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // For entries without paths, fall back to traversal (but only for those entries)
    if (entriesWithoutPaths.length > 0) {
      const entryMap = new Map<string, FileIndexEntry>();
      for (const entry of entriesWithoutPaths) {
        entryMap.set(entry.trackFileId, entry);
      }
      
      for await (const libraryFile of getLibraryFiles(root)) {
        if (entryMap.has(libraryFile.trackFileId)) {
          libraryFiles.push(libraryFile);
          entryMap.delete(libraryFile.trackFileId);
          found++;
          
          if (entryMap.size === 0) {
            break;
          }
        }
      }
      
      notFound += entryMap.size;
    }
  } else {
    // For smaller libraries, use traversal (more reliable)
    const entryMap = new Map<string, FileIndexEntry>();
    for (const entry of entries) {
      entryMap.set(entry.trackFileId, entry);
    }

    for await (const libraryFile of getLibraryFiles(root)) {
      if (entryMap.has(libraryFile.trackFileId)) {
        libraryFiles.push(libraryFile);
        entryMap.delete(libraryFile.trackFileId);
        found++;
        
        // If we've found all files, we can stop early
        if (entryMap.size === 0) {
          break;
        }
      }
    }
    
    notFound = entryMap.size;
  }
  
  if (libraryFiles.length === 0 && entries.length > 0) {
    logger.error("No files matched! This might indicate a problem with trackFileId generation.", {
      sampleTrackFileId: entries[0]?.trackFileId,
      sampleRelativePath: entries[0]?.relativePath,
    });
  }
  
  if (notFound > 0) {
    logger.warn(`${notFound} entries were not matched. Files may have been moved or deleted.`);
  }

  return libraryFiles;
}

