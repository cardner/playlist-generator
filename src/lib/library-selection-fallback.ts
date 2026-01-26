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

/**
 * Pick a library root using fallback file input
 * 
 * Creates a file input element with webkitdirectory attribute and
 * prompts the user to select a folder.
 * 
 * @returns Promise resolving to the selected library root
 * @throws Error if user cancels or no files selected
 * 
 * @example
 * ```typescript
 * try {
 *   const root = await pickLibraryRootWithFallback();
 *   console.log(`Selected: ${root.name}`);
 * } catch (error) {
 *   if (error.message === "Folder selection cancelled") {
 *     // User cancelled
 *   }
 * }
 * ```
 */
export async function pickLibraryRootWithFallback(): Promise<LibraryRoot> {
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

      // Get the directory name from the first file's path
      const firstFile = files[0];
      const pathParts = firstFile.webkitRelativePath.split("/");
      const folderName = pathParts[0] || "Selected Folder";

      const root: LibraryRoot = {
        mode: "fallback",
        name: folderName,
        lastImportedAt: Date.now(),
      };

      // Store fallback root
      try {
        const { saveLibraryRootLegacy } = await import("./library-selection-root");
        await saveLibraryRootLegacy(root);
        resolve(root);
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
    let relativePath: string | undefined;
    if (file.webkitRelativePath) {
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

