/**
 * USB device scan helpers for path detection.
 */

import { logger } from "@/lib/logger";
import { hashFileContent, hashFullFileContent } from "@/lib/file-hash";

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "aac",
  "ogg",
  "wav",
  "wma",
  "alac",
  "aiff",
  "aif",
]);

export type DeviceScanProgress = {
  scanned: number;
  matched: number;
  hashed: number;
};

export type DeviceScanEntry = {
  matchKey: string;
  relativePath: string;
  contentHash?: string;
  fullContentHash?: string;
  name: string;
  size: number;
  mtime: number;
};

export type DeviceScanResult = {
  pathMap: Map<string, string>;
  entries: DeviceScanEntry[];
  finalProgress: DeviceScanProgress;
};

export function buildDeviceMatchKey(
  filename: string,
  size: number,
  mtime: number
): string {
  return `${filename.toLowerCase()}|${size}|${mtime}`;
}

export function buildDeviceMatchCandidates(options: {
  filename: string;
  size?: number;
  mtime?: number;
}): string[] {
  const filename = options.filename.toLowerCase();
  const candidates: string[] = [];
  // Primary: filename|size (mtime often changes when copying to device)
  if (typeof options.size === "number") {
    candidates.push(`${filename}|${options.size}`);
  }
  // Fallback: filename only
  candidates.push(filename);
  // Backward compatibility: filename|size|mtime for existing cached scans
  if (typeof options.size === "number" && typeof options.mtime === "number") {
    candidates.push(buildDeviceMatchKey(filename, options.size, options.mtime));
  }
  return Array.from(new Set(candidates));
}

/**
 * Check if a track is on the USB device based on device path map.
 * Uses filename and size from the track's file index to match against scanned device paths.
 */
export function isTrackOnDeviceUsb(
  track: { fileName?: string; fileSize?: number; trackFileId?: string },
  devicePathMap: Map<string, string>,
  fileIndexMap?: Map<string, { name: string; size?: number; mtime?: number }>
): boolean {
  if (!devicePathMap || devicePathMap.size === 0) return false;
  const filename = track.fileName ?? fileIndexMap?.get(track.trackFileId ?? "")?.name;
  if (!filename) return false;
  const size = track.fileSize ?? fileIndexMap?.get(track.trackFileId ?? "")?.size;
  const mtime = fileIndexMap?.get(track.trackFileId ?? "")?.mtime;
  const candidates = buildDeviceMatchCandidates({
    filename,
    size,
    mtime: typeof mtime === "number" ? mtime : undefined,
  });
  for (const key of candidates) {
    if (devicePathMap.has(key)) return true;
  }
  return false;
}

type FileSystemPermissionMode = "read" | "readwrite";

async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode
): Promise<void> {
  const current = await handle.queryPermission({ mode });
  if (current === "granted") return;
  try {
    const requested = await handle.requestPermission({ mode });
    if (requested !== "granted") {
      throw new Error("Permission denied for device folder");
    }
  } catch (error) {
    const err = error as DOMException;
    if (err?.name === "NoModificationAllowedError" && mode === "read") {
      logger.warn("Read-only device permission fallback", err);
      return;
    }
    throw error;
  }
}

async function* traverseDevice(
  handle: FileSystemDirectoryHandle,
  relativePath: string
): AsyncGenerator<{ path: string; file: File }> {
  try {
    for await (const [name, entry] of handle.entries()) {
      const currentPath = relativePath ? `${relativePath}/${name}` : name;
      try {
        if (entry.kind === "directory") {
          yield* traverseDevice(entry as FileSystemDirectoryHandle, currentPath);
        } else {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          yield { path: currentPath, file };
        }
      } catch (error) {
        const err = error as DOMException;
        if (err?.name === "NoModificationAllowedError") {
          logger.warn(`Skipping read-only entry: ${currentPath}`, err);
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    const err = error as DOMException;
    if (err?.name === "NoModificationAllowedError") {
      logger.warn(`Skipping read-only directory: ${relativePath || "root"}`, err);
      return;
    }
    throw error;
  }
}

export async function scanDeviceForPaths(options: {
  handle: FileSystemDirectoryHandle;
  onProgress?: (progress: DeviceScanProgress) => void;
  includePaths?: string[];
  computeContentHash?: boolean;
  computeFullContentHash?: boolean;
  maxHashBytes?: number;
  targetKeyMap?: Map<string, Set<string>>;
  targetTrackCount?: number;
}): Promise<DeviceScanResult> {
  const {
    handle,
    onProgress,
    includePaths,
    computeContentHash,
    computeFullContentHash,
    maxHashBytes,
    targetKeyMap,
    targetTrackCount,
  } = options;
  await ensureDirectoryPermission(handle, "read");

  const map = new Map<string, string>();
  const entries: DeviceScanEntry[] = [];
  const progress: DeviceScanProgress = { scanned: 0, matched: 0, hashed: 0 };
  const matchedTrackIds = new Set<string>();

  const includePrefixes = (includePaths || [])
    .map((path) => path.replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter(Boolean);
  const includePrefixesLower = includePrefixes.map((prefix) => prefix.toLowerCase());

  try {
    for await (const entry of traverseDevice(handle, "")) {
      progress.scanned += 1;
      const extension = entry.path.split(".").pop()?.toLowerCase() || "";
      if (!AUDIO_EXTENSIONS.has(extension)) {
        onProgress?.(progress);
        continue;
      }

      if (includePrefixesLower.length > 0) {
        const entryPathLower = entry.path.toLowerCase();
        if (!includePrefixesLower.some((prefix) => entryPathLower.startsWith(prefix))) {
          onProgress?.(progress);
          continue;
        }
      }

      const candidates = buildDeviceMatchCandidates({
        filename: entry.file.name,
        size: entry.file.size,
        mtime: entry.file.lastModified,
      });
      let contentHash: string | undefined;
      let fullContentHash: string | undefined;
      if (computeContentHash) {
        contentHash = await hashFileContent(entry.file, maxHashBytes);
        if (contentHash) {
          progress.hashed += 1;
        }
      }
      if (computeFullContentHash) {
        fullContentHash = await hashFullFileContent(entry.file);
        if (fullContentHash) {
          progress.hashed += 1;
        }
      }
      let matchedTarget = false;
      if (targetKeyMap && targetKeyMap.size > 0) {
        for (const candidate of candidates) {
          const trackIds = targetKeyMap.get(candidate);
          if (trackIds) {
            matchedTarget = true;
            for (const trackId of trackIds) {
              matchedTrackIds.add(trackId);
            }
          }
        }
        if (!matchedTarget && fullContentHash) {
          const trackIds = targetKeyMap.get(fullContentHash);
          if (trackIds) {
            matchedTarget = true;
            for (const trackId of trackIds) {
              matchedTrackIds.add(trackId);
            }
          }
        }
        if (!matchedTarget && contentHash) {
          const trackIds = targetKeyMap.get(contentHash);
          if (trackIds) {
            matchedTarget = true;
            for (const trackId of trackIds) {
              matchedTrackIds.add(trackId);
            }
          }
        }
        // Relaxed matching: always add all device files to map/entries
        // so filename-only fallback can resolve paths when exact keys don't match
      }

      for (const candidate of candidates) {
        map.set(candidate, entry.path);
      }
      if (fullContentHash) {
        map.set(fullContentHash, entry.path);
      }
      if (contentHash) {
        map.set(contentHash, entry.path);
      }

      for (const candidate of candidates) {
        entries.push({
          matchKey: candidate,
          relativePath: entry.path,
          contentHash,
          fullContentHash,
          name: entry.file.name,
          size: entry.file.size,
          mtime: entry.file.lastModified,
        });
      }
      if (fullContentHash) {
        entries.push({
          matchKey: fullContentHash,
          relativePath: entry.path,
          contentHash,
          fullContentHash,
          name: entry.file.name,
          size: entry.file.size,
          mtime: entry.file.lastModified,
        });
      }
      if (contentHash) {
        entries.push({
          matchKey: contentHash,
          relativePath: entry.path,
          contentHash,
          fullContentHash,
          name: entry.file.name,
          size: entry.file.size,
          mtime: entry.file.lastModified,
        });
      }

      if (targetKeyMap && targetKeyMap.size > 0) {
        progress.matched = matchedTrackIds.size;
      } else {
        progress.matched += 1;
      }
      onProgress?.(progress);

      // No early exit: scan full device so map has all files for filename-only fallback
    }
  } catch (error) {
    logger.error("Device scan failed:", error);
    throw error;
  }

  return { pathMap: map, entries, finalProgress: { ...progress } };
}

/** @deprecated Use hashFileContent from @/lib/file-hash */
export const hashDeviceFileContent = hashFileContent;
