/**
 * Library selection and permission handling
 * 
 * Handles folder selection via File System Access API (Chromium)
 * or fallback file input (other browsers)
 */

import { supportsFileSystemAccess } from "./feature-detection";

/**
 * Library root selection mode
 */
export type LibraryRootMode = "handle" | "fallback";

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

/**
 * Pick a library root using File System Access API or fallback
 * 
 * @returns Promise resolving to the selected library root
 */
export async function pickLibraryRoot(): Promise<LibraryRoot> {
  if (supportsFileSystemAccess()) {
    // Use File System Access API
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
      await saveLibraryRootLegacy(root);

      return root;
    } catch (error) {
      // User cancelled or error occurred
      if ((error as Error).name === "AbortError") {
        throw new Error("Folder selection cancelled");
      }
      throw error;
    }
  } else {
    // Fallback: use file input with webkitdirectory
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
}

/**
 * Reconstruct a LibraryRoot from database data when the record is missing
 * 
 * @param libraryRootId The library root ID to reconstruct
 * @returns Promise resolving to reconstructed library root or null
 */
async function reconstructLibraryRootFromData(
  libraryRootId: string
): Promise<LibraryRoot | null> {
  try {
    const { getTracks, getFileIndexEntries, getScanRuns, getLibraryRoot } = await import("@/db/storage");
    
    // Try to get the root record first (might have been created after tracks)
    const rootRecord = await getLibraryRoot(libraryRootId);
    if (rootRecord) {
      // Convert LibraryRootRecord to LibraryRoot
      const libraryRoot: LibraryRoot = {
        mode: rootRecord.mode as "handle" | "fallback",
        name: rootRecord.name,
      };
      
      if (rootRecord.mode === "handle") {
        libraryRoot.handleId = rootRecord.handleRef || rootRecord.id;
      } else {
        libraryRoot.lastImportedAt = rootRecord.createdAt;
        libraryRoot.handleId = rootRecord.id;
      }
      
      return libraryRoot;
    }
    
    // No root record - try to infer from data
    const tracks = await getTracks(libraryRootId);
    const fileIndex = await getFileIndexEntries(libraryRootId);
    const scanRuns = await getScanRuns(libraryRootId);
    
    if (tracks.length === 0 && fileIndex.length === 0) {
      return null;
    }
    
    // Try to infer mode from fileIndex (if we have relative paths, it's handle mode)
    const hasRelativePaths = fileIndex.some(entry => entry.relativePath);
    const mode: "handle" | "fallback" = hasRelativePaths ? "handle" : "fallback";
    
    // Try to infer name from the most common directory in relative paths
    let inferredName = "Music Library";
    if (fileIndex.length > 0 && hasRelativePaths) {
      const pathParts = fileIndex
        .map(entry => entry.relativePath?.split("/")[0])
        .filter(Boolean) as string[];
      if (pathParts.length > 0) {
        // Get most common root directory name
        const counts = new Map<string, number>();
        for (const part of pathParts) {
          counts.set(part, (counts.get(part) || 0) + 1);
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        inferredName = sorted[0][0] || "Music Library";
      }
    }
    
    // Get the oldest scan run to use its timestamp
    const oldestScanRun = scanRuns.sort((a, b) => a.startedAt - b.startedAt)[0];
    const createdAt = oldestScanRun?.startedAt || Date.now();
    
    const libraryRoot: LibraryRoot = {
      mode,
      name: inferredName,
    };
    
    if (mode === "handle") {
      // For handle mode, use the library root ID as handleId
      libraryRoot.handleId = libraryRootId;
    } else {
      // For fallback mode, use createdAt as lastImportedAt
      libraryRoot.lastImportedAt = createdAt;
      libraryRoot.handleId = libraryRootId;
    }
    
    console.log("reconstructLibraryRootFromData: Reconstructed LibraryRoot:", libraryRoot);
    
    // Save the reconstructed root to the database for future use
    const { saveLibraryRoot } = await import("@/db/storage");
    await saveLibraryRoot(libraryRoot, mode === "handle" ? libraryRootId : undefined);
    
    return libraryRoot;
  } catch (error) {
    console.error("Failed to reconstruct library root from data:", error);
    return null;
  }
}

/**
 * Get saved library root from IndexedDB
 * 
 * @returns Promise resolving to saved library root or null
 */
export async function getSavedLibraryRoot(): Promise<LibraryRoot | null> {
  try {
    // Use Dexie instead of raw IndexedDB
    const { getCurrentLibraryRoot, getAllTracks, getAllFileIndexEntries } = await import("@/db/storage");
    const root = await getCurrentLibraryRoot();
    console.log("getSavedLibraryRoot: Database root record:", root);
    
    if (root) {
      // Convert LibraryRootRecord to LibraryRoot
      const libraryRoot: LibraryRoot = {
        mode: root.mode as "handle" | "fallback",
        name: root.name,
      };
      
      // Set handleId for handle mode, or lastImportedAt for fallback mode
      if (root.mode === "handle") {
        // For handle mode, use handleRef as handleId
        // If handleRef is not set, use the record ID (which should be the handleId)
        libraryRoot.handleId = root.handleRef || root.id;
      } else {
        // For fallback mode, use createdAt as lastImportedAt
        libraryRoot.lastImportedAt = root.createdAt;
        // Also set handleId to the record ID for consistency (getRootId can use either)
        libraryRoot.handleId = root.id;
      }
      
      console.log("getSavedLibraryRoot: Converted to LibraryRoot:", libraryRoot);
      return libraryRoot;
    }
    
    // No root record found - try to reconstruct from existing data
    console.log("getSavedLibraryRoot: No root record found, attempting reconstruction...");
    const allTracks = await getAllTracks();
    const allFileIndex = await getAllFileIndexEntries();
    
    if (allTracks.length === 0 && allFileIndex.length === 0) {
      console.log("getSavedLibraryRoot: No tracks or file index entries found");
      return null;
    }
    
    // Get unique library root IDs from tracks and file index
    const trackRootIds = new Set(allTracks.map(t => t.libraryRootId).filter(Boolean));
    const fileIndexRootIds = new Set(allFileIndex.map(f => f.libraryRootId).filter(Boolean));
    const allRootIds = new Set([...trackRootIds, ...fileIndexRootIds]);
    
    if (allRootIds.size === 0) {
      console.log("getSavedLibraryRoot: No library root IDs found in data");
      return null;
    }
    
    // Use the first (most common) library root ID
    const inferredRootId = Array.from(allRootIds)[0];
    console.log(`getSavedLibraryRoot: Attempting to reconstruct root with ID: ${inferredRootId}`);
    
    // Try to reconstruct the library root from the data
    const reconstructedRoot = await reconstructLibraryRootFromData(inferredRootId);
    
    if (reconstructedRoot) {
      console.log("getSavedLibraryRoot: Successfully reconstructed LibraryRoot:", reconstructedRoot);
      return reconstructedRoot;
    }
    
    console.log("getSavedLibraryRoot: Failed to reconstruct LibraryRoot");
    return null;
  } catch (error) {
    console.error("Failed to get saved library root:", error);
    return null;
  }
}

/**
 * Request permission for a library root
 * 
 * @param root Library root to request permission for
 * @returns Promise resolving to permission status
 */
export async function requestLibraryPermission(
  root: LibraryRoot
): Promise<PermissionStatus> {
  if (root.mode === "handle") {
    // For handle mode, we need to retrieve the handle and check permission
    try {
      const handle = await getDirectoryHandle(root.handleId!);
      if (!handle) {
        return "prompt";
      }

      // Check if we still have permission
      const permissionStatus = await handle.queryPermission({ mode: "read" });

      if (permissionStatus === "prompt") {
        // Request permission
        const newStatus = await handle.requestPermission({ mode: "read" });
        return newStatus;
      }

      return permissionStatus;
    } catch (error) {
      console.error("Failed to request permission:", error);
      return "denied";
    }
  } else {
    // Fallback mode: permission is implicit (user selected files)
    // But we need to check if files are still available
    if (root.lastImportedAt) {
      // Files might not persist, so we consider it "prompt" (needs re-import)
      return "prompt";
    }
    return "granted";
  }
}

/**
 * Get library files as an async generator
 * Recursively traverses directory when mode='handle'
 * 
 * @param root Library root to get files from
 * @yields LibraryFile objects
 */
export async function* getLibraryFiles(
  root: LibraryRoot
): AsyncGenerator<LibraryFile> {
  if (root.mode === "handle") {
    // Handle mode: recursive directory traversal
    const handle = await getDirectoryHandle(root.handleId!);
    if (!handle) {
      throw new Error("Directory handle not found");
    }

    yield* traverseDirectory(handle, "");
  } else {
    // Fallback mode: files were selected via input
    // We need to get them from the stored snapshot
    // Since File objects don't persist, we'll need to prompt for re-selection
    throw new Error(
      "Fallback mode files cannot be retrieved after page reload. Please re-select the folder."
    );
  }
}

/**
 * Get library files from a fallback file list
 * Used when files are selected via input element
 * 
 * @param files FileList from input element
 * @param rootName Root folder name
 * @yields LibraryFile objects
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

    // Generate unique ID based on relativePath || file.name, size, and mtime
    // This matches the requirement: hash(relativePath || file.name, file.size, file.lastModified)
    const pathForId = relativePath || file.name;
    const trackFileId = generateFileIdFromPath(pathForId, file.size, file.lastModified);

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

// ============================================================================
// Internal helpers
// ============================================================================

// Note: Database initialization is now handled by Dexie in @/db/schema
// The old initDB function is no longer needed - all database access uses Dexie

/**
 * Store directory handle in IndexedDB using Dexie
 * 
 * @param handle Directory handle to store
 * @returns Promise resolving to handle ID
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
 */
export async function getDirectoryHandle(
  handleId: string
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const { db } = await import("@/db/schema");
    const record = await db.directoryHandles.get(handleId);
    return record?.handle || null;
  } catch (error) {
    console.error("Failed to get directory handle:", error);
    return null;
  }
}

/**
 * Save library root to IndexedDB (legacy - use db/storage instead)
 * 
 * @param root Library root to save
 */
async function saveLibraryRootLegacy(root: LibraryRoot): Promise<void> {
  // Use new Dexie storage layer
  const { saveLibraryRoot: saveRoot } = await import("@/db/storage");
  await saveRoot(root, root.handleId);
}

/**
 * Recursively traverse directory and yield files
 * 
 * @param handle Directory handle
 * @param relativePath Current relative path
 * @yields LibraryFile objects
 */
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

/**
 * Generate a unique file ID from path, size, and mtime
 * Matches requirement: hash(relativePath || file.name, file.size, file.lastModified)
 * 
 * Uses a Unicode-safe hash function (btoa can't handle non-ASCII characters)
 * 
 * @param path Relative path or file name
 * @param size File size in bytes
 * @param mtime Last modified time
 * @returns Unique file ID
 */
function generateFileIdFromPath(path: string, size: number, mtime: number): string {
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
 * Uses relativePath if available, otherwise file.name
 * 
 * @param file File object
 * @param relativePath Optional relative path
 * @returns Unique file ID
 */
function generateFileId(file: File, relativePath?: string): string {
  const pathForId = relativePath || file.name;
  return generateFileIdFromPath(pathForId, file.size, file.lastModified);
}

/**
 * Get file extension from filename
 * 
 * @param filename File name
 * @returns Lowercase extension (without dot)
 */
function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) {
    return "";
  }
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Check if fallback mode files need to be re-imported
 * (Files don't persist after page reload)
 * 
 * @param root Library root to check
 * @returns true if files need to be re-imported
 */
export function needsReimport(root: LibraryRoot): boolean {
  if (root.mode === "fallback") {
    // Fallback files always need re-import after reload
    // We can't reliably detect if files are still available
    return true;
  }
  return false;
}

// Export saveLibraryRootLegacy for backward compatibility
export { saveLibraryRootLegacy as saveLibraryRoot };

