/**
 * Local file player for playing tracks directly from user's library
 * Uses File System Access API to access files without requiring API keys
 */

import type { TrackInfo, SampleResult } from './types';
import { getFileIndexEntry, getCurrentLibraryRoot, getLibraryRoot } from '@/db/storage';
import { getDirectoryHandle } from '@/lib/library-selection';

/**
 * Get local file URL for a track
 * 
 * @param trackFileId Track file ID
 * @param libraryRootId Library root ID
 * @returns Blob URL for the audio file, or null if not accessible
 */
export async function getLocalFileUrl(
  trackFileId: string,
  libraryRootId: string
): Promise<string | null> {
  try {
    // Get file index entry to find relative path
    const fileIndexEntry = await getFileIndexEntry(trackFileId, libraryRootId);
    if (!fileIndexEntry) {
      console.log(`[Local File Player] No file index entry found for track: ${trackFileId}`);
      return null;
    }

    // Get library root to check mode
    let libraryRoot = await getCurrentLibraryRoot();
    if (!libraryRoot || libraryRoot.id !== libraryRootId) {
      // Try to get the specific library root
      libraryRoot = await getLibraryRoot(libraryRootId);
      if (!libraryRoot) {
        console.log(`[Local File Player] Library root not found`);
        return null;
      }
    }
    
    if (libraryRoot.mode !== 'handle') {
      console.log(`[Local File Player] Library root not in handle mode (mode: ${libraryRoot.mode})`);
      return null;
    }

    // Get directory handle
    const handleId = libraryRoot.handleRef || libraryRootId;
    const dirHandle = await getDirectoryHandle(handleId);
    if (!dirHandle) {
      console.log(`[Local File Player] Could not get directory handle for: ${handleId}`);
      return null;
    }

    // Navigate to file using relative path
    if (!fileIndexEntry.relativePath) {
      console.log(`[Local File Player] File index entry missing relativePath for trackFileId: ${trackFileId}`);
      return null;
    }
    const pathParts = fileIndexEntry.relativePath.split('/').filter(Boolean);
    let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle;

    // Navigate through directory structure
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (currentHandle instanceof FileSystemDirectoryHandle) {
        currentHandle = await currentHandle.getDirectoryHandle(part);
      } else {
        console.log(`[Local File Player] Invalid path structure`);
        return null;
      }
    }

    // Get the file handle
    const fileName = pathParts[pathParts.length - 1];
    if (currentHandle instanceof FileSystemDirectoryHandle) {
      const fileHandle = await currentHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      
      // Create blob URL for playback
      // Note: The File object must stay in memory for the blob URL to work
      const blobUrl = URL.createObjectURL(file);
      console.log(`[Local File Player] Created blob URL for: ${fileIndexEntry.relativePath}`);
      
      // Store file reference to prevent garbage collection
      // The blob URL will be valid as long as the File object exists
      return blobUrl;
    }

    return null;
  } catch (error) {
    console.warn(`[Local File Player] Failed to get local file:`, error);
    return null;
  }
}

/**
 * Search for local file preview
 * 
 * @param trackFileId Track file ID
 * @param libraryRootId Library root ID
 * @param trackInfo Track metadata (for result)
 * @returns Sample result with blob URL and File object, or null if not accessible
 */
export async function searchLocalFile(
  trackFileId: string,
  libraryRootId: string,
  trackInfo: TrackInfo
): Promise<SampleResult | null> {
  try {
    // Get file index entry to find relative path
    const fileIndexEntry = await getFileIndexEntry(trackFileId, libraryRootId);
    if (!fileIndexEntry) {
      console.log(`[Local File Player] No file index entry found for track: ${trackFileId}`);
      return null;
    }

    // Get library root to check mode
    let libraryRoot = await getCurrentLibraryRoot();
    if (!libraryRoot || libraryRoot.id !== libraryRootId) {
      libraryRoot = await getLibraryRoot(libraryRootId);
      if (!libraryRoot) {
        console.log(`[Local File Player] Library root not found`);
        return null;
      }
    }
    
    if (libraryRoot.mode !== 'handle') {
      console.log(`[Local File Player] Library root not in handle mode (mode: ${libraryRoot.mode})`);
      return null;
    }

    // Get directory handle
    const handleId = libraryRoot.handleRef || libraryRootId;
    const dirHandle = await getDirectoryHandle(handleId);
    if (!dirHandle) {
      console.log(`[Local File Player] Could not get directory handle for: ${handleId}`);
      return null;
    }

    // Navigate to file using relative path
    if (!fileIndexEntry.relativePath) {
      console.log(`[Local File Player] File index entry missing relativePath for trackFileId: ${trackFileId}`);
      return null;
    }
    const pathParts = fileIndexEntry.relativePath.split('/').filter(Boolean);
    let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle;

    // Navigate through directory structure
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (currentHandle instanceof FileSystemDirectoryHandle) {
        currentHandle = await currentHandle.getDirectoryHandle(part);
      } else {
        console.log(`[Local File Player] Invalid path structure`);
        return null;
      }
    }

    // Get the file handle and File object
    const fileName = pathParts[pathParts.length - 1];
    if (currentHandle instanceof FileSystemDirectoryHandle) {
      const fileHandle = await currentHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      
      // Create blob URL for playback
      // IMPORTANT: The File object must stay in memory for the blob URL to remain valid
      const blobUrl = URL.createObjectURL(file);
      console.log(`[Local File Player] Created blob URL for: ${fileIndexEntry.relativePath}`);
      
      return {
        url: blobUrl,
        platform: 'local' as const,
        title: trackInfo.title,
        artist: trackInfo.artist,
        thumbnailUrl: undefined,
        duration: undefined,
        previewStartTime: 0,
        blobFile: file, // Keep File reference to prevent garbage collection
      };
    }

    return null;
  } catch (error) {
    console.warn(`[Local File Player] Search failed:`, error);
    return null;
  }
}

