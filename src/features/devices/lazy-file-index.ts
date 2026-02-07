/**
 * Lazy file index resolution from file system.
 * When fileIndex is missing, try to locate the file via library root using metadata.
 */

import type { LibraryRoot } from "@/lib/library-selection";
import { getDirectoryHandle } from "@/lib/library-selection-fs-api";
import type { TrackRecord } from "@/db/schema";
import type { FileIndexRecord } from "@/db/schema";
import { getCompositeId } from "@/db/schema";
import { hashFileContent } from "@/lib/file-hash";

function sanitizeForPath(s: string): string {
  return s
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCandidatePaths(track: TrackRecord): string[] {
  const artist = sanitizeForPath(track.tags?.artist ?? "Unknown");
  const album = sanitizeForPath(track.tags?.album ?? "Unknown");
  const title = sanitizeForPath(track.tags?.title ?? "Unknown");
  const candidates: string[] = [];
  const exts = ["mp3", "flac", "m4a", "ogg", "wav"];
  for (const ext of exts) {
    candidates.push(`${artist}/${album}/${title}.${ext}`);
    candidates.push(`${artist}/${album}/01 - ${title}.${ext}`);
    candidates.push(`${artist}/${album}/01 ${title}.${ext}`);
    candidates.push(`${artist} - ${album}/${title}.${ext}`);
    candidates.push(`${artist}/${title}.${ext}`);
    candidates.push(`${title}.${ext}`);
  }
  return [...new Set(candidates)];
}

async function tryGetFileAtPath(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<{ file: File; path: string } | null> {
  try {
    const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) return null;
    let current: FileSystemDirectoryHandle = root;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: false });
    }
    const fileHandle = await current.getFileHandle(parts[parts.length - 1], {
      create: false,
    });
    const file = await fileHandle.getFile();
    return { file, path: relativePath };
  } catch {
    return null;
  }
}

/**
 * Try to build a synthetic fileIndex for a track by locating the file on disk.
 * Only works when library root is in handle mode.
 *
 * @param track Track record with metadata
 * @param root Library root (must be handle mode)
 * @param libraryRootId Library root ID for the synthetic entry
 * @returns Synthetic FileIndexRecord or undefined
 */
export async function tryLazyFileIndex(
  track: TrackRecord,
  root: LibraryRoot,
  libraryRootId: string
): Promise<FileIndexRecord | undefined> {
  if (root.mode !== "handle" || !root.handleId) return undefined;
  const handle = await getDirectoryHandle(root.handleId);
  if (!handle) return undefined;

  const candidates = buildCandidatePaths(track);
  for (const path of candidates) {
    const result = await tryGetFileAtPath(handle, path);
    if (result) {
      const contentHash = await hashFileContent(result.file, 256 * 1024);
      const ext = result.file.name.split(".").pop()?.toLowerCase() ?? "mp3";
      return {
        id: getCompositeId(track.trackFileId, libraryRootId),
        trackFileId: track.trackFileId,
        libraryRootId,
        relativePath: result.path,
        name: result.file.name,
        extension: ext,
        size: result.file.size,
        mtime: result.file.lastModified,
        contentHash,
        updatedAt: Date.now(),
      };
    }
  }
  return undefined;
}
