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
 * 
 * @param root Library root with handle mode
 * @yields LibraryFile objects
 * @throws Error if directory handle not found
 * 
 * @example
 * ```typescript
 * for await (const file of getLibraryFilesWithFSAPI(root)) {
 *   console.log(`Found: ${file.relativePath}`);
 * }
 * ```
 */
export async function* getLibraryFilesWithFSAPI(
  root: LibraryRoot
): AsyncGenerator<LibraryFile> {
  if (root.mode !== "handle") {
    throw new Error("Library root must be in handle mode");
  }

  const handle = await getDirectoryHandle(root.handleId!);
  if (!handle) {
    throw new Error("Directory handle not found");
  }

  yield* traverseDirectory(handle, "");
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
 * @param handle Directory handle
 * @param relativePath Current relative path
 * @yields LibraryFile objects
 */
async function* traverseDirectory(
  handle: FileSystemDirectoryHandle,
  relativePath: string
): AsyncGenerator<LibraryFile> {
  for await (const [name, entry] of handle.entries()) {
    const currentPath = relativePath ? `${relativePath}/${name}` : name;
    const normalizedPath = normalizeRelativePath(currentPath);

    if (entry.kind === "file") {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();

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
    } else if (entry.kind === "directory") {
      const dirHandle = entry as FileSystemDirectoryHandle;
      yield* traverseDirectory(dirHandle, normalizedPath);
    }
  }
}

