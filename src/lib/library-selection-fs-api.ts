/**
 * File System Access API Operations
 * 
 * This module handles folder selection and file traversal using the
 * File System Access API (available in Chromium-based browsers).
 * 
 * @module lib/library-selection-fs-api
 */

import { supportsFileSystemAccess } from "./feature-detection";
import { logger } from "./logger";
import type { LibraryRoot, LibraryFile } from "./library-selection-types";
import { normalizeRelativePath, generateFileId, getFileExtension } from "./library-selection-utils";

/**
 * Pick a library root using File System Access API
 * 
 * Opens a directory picker dialog and stores the selected directory handle.
 * 
 * @returns Promise resolving to the selected library root
 * @throws Error if user cancels or selection fails
 * 
 * @example
 * ```typescript
 * try {
 *   const root = await pickLibraryRootWithFSAPI();
 *   console.log(`Selected: ${root.name}`);
 * } catch (error) {
 *   if (error.message === "Folder selection cancelled") {
 *     // User cancelled
 *   }
 * }
 * ```
 */
export async function pickLibraryRootWithFSAPI(): Promise<LibraryRoot> {
  if (!supportsFileSystemAccess()) {
    throw new Error("File System Access API not supported");
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: "read",
    });

    const root: LibraryRoot = {
      mode: "handle",
      name: handle.name,
    };

    // Store handle in IndexedDB and get handleId
    root.handleId = await storeDirectoryHandle(handle);

    // Save library root configuration
    const { saveLibraryRootLegacy } = await import("./library-selection-root");
    await saveLibraryRootLegacy(root);

    return root;
  } catch (error) {
    // User cancelled or error occurred
    if ((error as Error).name === "AbortError") {
      throw new Error("Folder selection cancelled");
    }
    throw error;
  }
}

/**
 * Get library files as an async generator using File System Access API
 * 
 * Recursively traverses the directory and yields all audio files.
 * Tracks consecutive failures to detect network drive disconnections.
 * 
 * @param root Library root with handle mode
 * @param onDisconnection Optional callback when disconnection is detected
 * @yields LibraryFile objects
 * @throws NetworkDriveDisconnectedError if 3+ consecutive failures detected
 * @throws Error if directory handle not found
 * 
 * @example
 * ```typescript
 * for await (const file of getLibraryFilesWithFSAPI(root, (error) => {
 *   // Handle disconnection
 * })) {
 *   console.log(`Found: ${file.relativePath}`);
 * }
 * ```
 */
export async function* getLibraryFilesWithFSAPI(
  root: LibraryRoot,
  onDisconnection?: (error: Error) => void
): AsyncGenerator<LibraryFile> {
  if (root.mode !== "handle") {
    throw new Error("Library root must be in handle mode");
  }

  const handle = await getDirectoryHandle(root.handleId!);
  if (!handle) {
    throw new Error("Directory handle not found");
  }

  yield* traverseDirectory(handle, "", onDisconnection);
}

/**
 * Store directory handle in IndexedDB using Dexie
 * 
 * @param handle Directory handle to store
 * @returns Promise resolving to handle ID
 * 
 * @example
 * ```typescript
 * const handleId = await storeDirectoryHandle(handle);
 * ```
 */
export async function storeDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<string> {
  const { db } = await import("@/db/schema");
  
  // Generate ID based on handle name and timestamp
  const handleId = `handle-${handle.name}-${Date.now()}`;
  
  await db.directoryHandles.put({
    id: handleId,
    handle: handle,
  });
  
  return handleId;
}

/**
 * Get directory handle from IndexedDB
 * 
 * @param handleId Handle ID
 * @returns Promise resolving to directory handle or null
 * 
 * @example
 * ```typescript
 * const handle = await getDirectoryHandle(handleId);
 * if (handle) {
 *   // Use handle
 * }
 * ```
 */
export async function getDirectoryHandle(
  handleId: string
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const { db } = await import("@/db/schema");
    const record = await db.directoryHandles.get(handleId);
    return record?.handle || null;
  } catch (error) {
    logger.error("Failed to get directory handle:", error);
    return null;
  }
}

/**
 * Recursively traverse directory and yield files
 * 
 * Handles network drive issues gracefully by catching NotFoundError and
 * skipping inaccessible files/directories instead of failing the entire scan.
 * Tracks consecutive failures to detect network drive disconnections.
 * 
 * @param handle Directory handle
 * @param relativePath Current relative path
 * @param onDisconnection Optional callback when disconnection is detected
 * @yields LibraryFile objects
 */
async function* traverseDirectory(
  handle: FileSystemDirectoryHandle,
  relativePath: string,
  onDisconnection?: (error: Error) => void
): AsyncGenerator<LibraryFile> {
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  try {
    for await (const [name, entry] of handle.entries()) {
      const currentPath = relativePath ? `${relativePath}/${name}` : name;
      const normalizedPath = normalizeRelativePath(currentPath);

      try {
        if (entry.kind === "file") {
          const fileHandle = entry as FileSystemFileHandle;
          
          try {
            const file = await fileHandle.getFile();

            // Reset consecutive failures on success
            consecutiveFailures = 0;

            const trackFileId = generateFileId(file, normalizedPath);
            const extension = getFileExtension(name);

            yield {
              file,
              trackFileId,
              relativePath: normalizedPath,
              extension,
              size: file.size,
              mtime: file.lastModified,
            };
          } catch (fileError) {
            // Handle NotFoundError for network drives or inaccessible files
            if (fileError instanceof DOMException && fileError.name === "NotFoundError") {
              consecutiveFailures++;
              
              // Check if we've hit the disconnection threshold
              if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                const disconnectionError = new Error(
                  `Network drive appears to have disconnected after ${consecutiveFailures} consecutive failures`
                );
                logger.warn(
                  `Network drive disconnection detected at ${normalizedPath}. ${consecutiveFailures} consecutive failures.`,
                  fileError
                );
                onDisconnection?.(disconnectionError);
                // Don't re-throw here - let the caller handle it via callback
                return;
              }
              
              logger.warn(
                `Skipping inaccessible file: ${normalizedPath}. This may occur with network drives. (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} consecutive failures)`,
                fileError
              );
              continue; // Skip this file and continue scanning
            }
            // Reset on non-NotFoundError (different type of error)
            consecutiveFailures = 0;
            // Re-throw other errors
            throw fileError;
          }
        } else if (entry.kind === "directory") {
          const dirHandle = entry as FileSystemDirectoryHandle;
          
          try {
            // Recursively traverse subdirectory
            yield* traverseDirectory(dirHandle, normalizedPath, onDisconnection);
            // Reset consecutive failures on successful directory traversal
            consecutiveFailures = 0;
          } catch (dirError) {
            // Handle NotFoundError for network drives or inaccessible directories
            if (dirError instanceof DOMException && dirError.name === "NotFoundError") {
              consecutiveFailures++;
              
              // Check if we've hit the disconnection threshold
              if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                const disconnectionError = new Error(
                  `Network drive appears to have disconnected after ${consecutiveFailures} consecutive failures`
                );
                logger.warn(
                  `Network drive disconnection detected at ${normalizedPath}. ${consecutiveFailures} consecutive failures.`,
                  dirError
                );
                onDisconnection?.(disconnectionError);
                // Don't re-throw here - let the caller handle it via callback
                return;
              }
              
              logger.warn(
                `Skipping inaccessible directory: ${normalizedPath}. This may occur with network drives. (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} consecutive failures)`,
                dirError
              );
              continue; // Skip this directory and continue scanning
            }
            // Reset on non-NotFoundError
            consecutiveFailures = 0;
            // Re-throw other errors
            throw dirError;
          }
        }
      } catch (entryError) {
        // Catch any other errors accessing individual entries
        if (entryError instanceof DOMException && entryError.name === "NotFoundError") {
          consecutiveFailures++;
          
          // Check if we've hit the disconnection threshold
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            const disconnectionError = new Error(
              `Network drive appears to have disconnected after ${consecutiveFailures} consecutive failures`
            );
            logger.warn(
              `Network drive disconnection detected at ${normalizedPath}. ${consecutiveFailures} consecutive failures.`,
              entryError
            );
            onDisconnection?.(disconnectionError);
            return;
          }
          
          logger.warn(
            `Skipping inaccessible entry: ${normalizedPath}. This may occur with network drives. (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} consecutive failures)`,
            entryError
          );
          continue; // Skip this entry and continue scanning
        }
        // Reset on non-NotFoundError
        consecutiveFailures = 0;
        // Re-throw other errors
        throw entryError;
      }
    }
  } catch (error) {
    // Handle errors accessing the directory itself (e.g., network drive disconnected)
    if (error instanceof DOMException && error.name === "NotFoundError") {
      consecutiveFailures++;
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const disconnectionError = new Error(
          `Network drive appears to have disconnected after ${consecutiveFailures} consecutive failures`
        );
        logger.warn(
          `Network drive disconnection detected at ${relativePath || "root"}. ${consecutiveFailures} consecutive failures.`,
          error
        );
        onDisconnection?.(disconnectionError);
        return;
      }
      
      logger.warn(
        `Cannot access directory at ${relativePath || "root"}. This may occur with network drives. (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} consecutive failures)`,
        error
      );
      // Don't re-throw - just stop traversing this directory
      return;
    }
    // Re-throw other errors
    throw error;
  }
}

