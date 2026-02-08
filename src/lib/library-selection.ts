/**
 * Library Selection and Permission Handling
 * 
 * This module provides a unified interface for library folder selection,
 * supporting both File System Access API (Chromium) and fallback file input
 * (other browsers). It re-exports functions from specialized modules.
 * 
 * @module lib/library-selection
 */

// Re-export types
export type {
  LibraryRootMode,
  LibraryRoot,
  LibraryFile,
  PermissionStatus,
} from "./library-selection-types";

// Re-export from specialized modules
export {
  pickLibraryRootWithFSAPI,
  getLibraryFilesWithFSAPI,
  storeDirectoryHandle,
  getDirectoryHandle,
} from "./library-selection-fs-api";

export {
  pickLibraryRootWithFallback,
  getLibraryFilesFromFileList,
} from "./library-selection-fallback";

export {
  checkLibraryPermission,
  requestLibraryPermission,
} from "./library-selection-permissions";

export {
  getSavedLibraryRoot,
  saveLibraryRootLegacy,
} from "./library-selection-root";

export {
  normalizeRelativePath,
  generateFileIdFromPath,
  generateFileId,
  getFileExtension,
  needsReimport,
} from "./library-selection-utils";

import { supportsFileSystemAccess } from "./feature-detection";
import { pickLibraryRootWithFSAPI } from "./library-selection-fs-api";
import { pickLibraryRootWithFallback } from "./library-selection-fallback";
import { getLibraryFilesWithFSAPI } from "./library-selection-fs-api";
import type { LibraryRoot, LibraryFile } from "./library-selection-types";

/** Options for pickLibraryRoot */
export interface PickLibraryRootOptions {
  /** When provided, updates the existing collection's handle instead of creating a new collection (FS API only, for re-select/permission flow) */
  existingCollectionId?: string;
}

/**
 * Pick a library root using File System Access API or fallback
 * 
 * Automatically selects the appropriate method based on browser support.
 * 
 * @param forceReset If true, resets any existing picker state before opening (FS API only)
 * @param options Options for the pick operation. When existingCollectionId is provided (re-select flow), updates the existing collection's handle instead of creating a new collection.
 * @returns Promise resolving to the selected library root
 * @throws Error if user cancels or selection fails
 * @throws Error if existingCollectionId is provided but browser uses fallback (Re-select to fix permissions requires File System Access API)
 * 
 * @example
 * ```typescript
 * try {
 *   const root = await pickLibraryRoot();
 *   console.log(`Selected: ${root.name}`);
 * } catch (error) {
 *   if (error.message === "Folder selection cancelled") {
 *     // User cancelled
 *   }
 * }
 * ```
 */
export async function pickLibraryRoot(
  forceReset: boolean = false,
  options?: PickLibraryRootOptions
): Promise<LibraryRoot> {
  if (supportsFileSystemAccess()) {
    return pickLibraryRootWithFSAPI(forceReset, options);
  } else {
    return pickLibraryRootWithFallback(options);
  }
}

/**
 * Get library files as an async generator
 * 
 * Recursively traverses directory when mode='handle', or processes
 * FileList when mode='fallback'.
 * 
 * @param root Library root to get files from
 * @param onDisconnection Optional callback when network drive disconnection is detected
 * @yields LibraryFile objects
 * @throws Error if directory handle not found (handle mode) or files unavailable (fallback mode)
 * 
 * @example
 * ```typescript
 * for await (const file of getLibraryFiles(root, (error) => {
 *   // Handle disconnection
 * })) {
 *   console.log(`Found: ${file.relativePath}`);
 * }
 * ```
 */
export async function* getLibraryFiles(
  root: LibraryRoot,
  onDisconnection?: (error: Error) => void
): AsyncGenerator<LibraryFile> {
  if (root.mode === "handle") {
    yield* getLibraryFilesWithFSAPI(root, onDisconnection);
  } else {
    // Fallback mode: files were selected via input
    // We need to get them from the stored snapshot
    // Since File objects don't persist, we'll need to prompt for re-selection
    throw new Error(
      "Fallback mode files cannot be retrieved after page reload. Please re-select the folder."
    );
  }
}

// Export saveLibraryRootLegacy as saveLibraryRoot for backward compatibility
export { saveLibraryRootLegacy as saveLibraryRoot } from "./library-selection-root";
