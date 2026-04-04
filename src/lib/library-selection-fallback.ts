/**
 * Fallback File Input Operations
 * 
 * This module handles folder selection using the fallback file input
 * method (webkitdirectory) for browsers that don't support the
 * File System Access API.
 * 
 * @module lib/library-selection-fallback
 */

import type { LibraryRoot, LibraryFile } from "./library-selection-types";
import { normalizeRelativePath, generateFileIdFromPath, getFileExtension } from "./library-selection-utils";

/** Options for pickLibraryRootWithFallback */
export interface PickLibraryRootFallbackOptions {
  /** When provided, updates this collection to fallback mode instead of creating a new one (e.g. Safari re-select) */
  existingCollectionId?: string;
}

/** Result of fallback folder pick: root metadata plus the FileList for scanning in the same session */
export interface PickLibraryRootFallbackResult {
  root: LibraryRoot;
  files: FileList;
}

/**
 * Pick a library root using fallback file input
 * 
 * Creates a file input element with webkitdirectory attribute and
 * prompts the user to select a folder.
 * 
 * @param options Options for the pick operation. When existingCollectionId is provided, updates that collection to fallback mode.
 * @returns Promise resolving to the selected library root and FileList (for scanning in same session)
 * @throws Error if user cancels or no files selected
 * 
 * @example
 * ```typescript
 * try {
 *   const { root, files } = await pickLibraryRootWithFallback();
 *   console.log(`Selected: ${root.name}`, files.length, "files");
 * } catch (error) {
 *   if (error.message === "Folder selection cancelled") {
 *     // User cancelled
 *   }
 * }
 * ```
 */
export async function pickLibraryRootWithFallback(
  options?: PickLibraryRootFallbackOptions
): Promise<PickLibraryRootFallbackResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;

    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const files = target.files;

      if (!files || files.length === 0) {
        reject(new Error("No files selected"));
        return;
      }

      // Get the directory name from the first file's path (Safari may have empty webkitRelativePath)
      const firstFile = files[0];
      const relativePath = firstFile.webkitRelativePath;
      const folderName =
        relativePath && relativePath.length > 0
          ? relativePath.split("/")[0] || "Selected Folder"
          : "Selected Folder";

      const root: LibraryRoot = {
        mode: "fallback",
        name: folderName,
        lastImportedAt: Date.now(),
      };

      try {
        const { saveLibraryRoot } = await import("@/db/storage");
        if (options?.existingCollectionId) {
          await saveLibraryRoot(root, undefined, {
            existingCollectionId: options.existingCollectionId,
            setAsCurrent: true,
          });
        } else {
          const { saveLibraryRootLegacy } = await import("./library-selection-root");
          await saveLibraryRootLegacy(root);
        }
        resolve({ root, files });
      } catch (error) {
        reject(error);
      }
    };

    input.oncancel = () => {
      reject(new Error("Folder selection cancelled"));
    };

    input.click();
  });
}

/**
 * Get library files from a fallback file list
 * 
 * Used when files are selected via input element with webkitdirectory.
 * Processes the FileList and yields LibraryFile objects.
 * 
 * @param files FileList from input element
 * @param rootName Root folder name
 * @yields LibraryFile objects
 * 
 * @example
 * ```typescript
 * const input = document.querySelector('input[type="file"]');
 * if (input.files) {
 *   for await (const file of getLibraryFilesFromFileList(input.files, "Music")) {
 *     console.log(`Found: ${file.relativePath}`);
 *   }
 * }
 * ```
 */
export async function* getLibraryFilesFromFileList(
  files: FileList,
  rootName: string
): AsyncGenerator<LibraryFile> {
  for (const file of Array.from(files)) {
    // Extract relative path (remove root folder name)
    // webkitRelativePath format: "rootName/path/to/file.mp3"
    // We want: "path/to/file.mp3"
    // Safari (and some older browsers) may have empty webkitRelativePath - use file.name as fallback
    let relativePath: string | undefined;
    if (file.webkitRelativePath && file.webkitRelativePath.length > 0) {
      // Remove root folder name prefix
      const pathWithoutRoot = file.webkitRelativePath.replace(
        new RegExp(`^${rootName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`),
        ""
      );
      relativePath = pathWithoutRoot || undefined;

      // Normalize the relative path
      if (relativePath) {
        relativePath = normalizeRelativePath(relativePath);
      }
    }
    if (relativePath === undefined) {
      relativePath = file.name;
    }

    // Generate stable ID based on relativePath || file.name and size
    const pathForId = relativePath || file.name;
    const trackFileId = generateFileIdFromPath(pathForId, file.size);

    // Get file extension
    const extension = getFileExtension(file.name);

    yield {
      file,
      trackFileId,
      relativePath,
      extension,
      size: file.size,
      mtime: file.lastModified,
    };
  }
}

