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
  countLibraryFilesWithFSAPI,
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

import { prefersLibraryFolderFallback, supportsFileSystemAccess } from "./feature-detection";
import { pickLibraryRootWithFSAPI } from "./library-selection-fs-api";
import { pickLibraryRootWithFallback } from "./library-selection-fallback";
import { getLibraryFilesWithFSAPI } from "./library-selection-fs-api";
import type { LibraryRoot, LibraryFile } from "./library-selection-types";

/** Options for pickLibraryRoot */
export interface PickLibraryRootOptions {
  /** When provided, updates the existing collection's handle instead of creating a new collection (FS API only, for re-select/permission flow) */
  existingCollectionId?: string;
}

/** Result of pickLibraryRoot when using fallback (Safari etc.): root plus FileList for scanning in same session */
export type { PickLibraryRootFallbackResult } from "./library-selection-fallback";

/**
 * Pick a library root using File System Access API or fallback
 * 
 * Automatically selects the appropriate method based on browser support.
 * When fallback is used, returns { root, files } so the caller can run a scan in the same session.
 * 
 * @param forceReset If true, resets any existing picker state before opening (FS API only)
 * @param options Options for the pick operation. When existingCollectionId is provided (re-select flow), updates the existing collection's handle instead of creating a new collection.
 * @returns Promise resolving to the selected library root (FS API) or { root, files } (fallback)
 * @throws Error if user cancels or selection fails
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await pickLibraryRoot();
 *   const root = 'files' in result ? result.root : result;
 *   const files = 'files' in result ? result.files : undefined;
 *   onLibrarySelected(root, files);
 * } catch (error) {
 *   if (error.message === "Folder selection cancelled") { }
 * }
 * ```
 */
export async function pickLibraryRoot(
  forceReset: boolean = false,
  options?: PickLibraryRootOptions
): Promise<LibraryRoot | import("./library-selection-fallback").PickLibraryRootFallbackResult> {
  const useFileSystemAccess =
    supportsFileSystemAccess() && !prefersLibraryFolderFallback();
  if (useFileSystemAccess) {
    return pickLibraryRootWithFSAPI(forceReset, options);
  }
  return pickLibraryRootWithFallback(options);
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
