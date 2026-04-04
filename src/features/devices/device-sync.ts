/**
 * USB device sync helpers.
 */

import type { GeneratedPlaylist } from "@/features/playlists";
import {
  exportM3U,
  exportPLS,
  exportXSPF,
  type TrackLookup,
  type PlaylistLocationConfig,
  type PathStrategy,
} from "@/features/playlists/export";
import { supportsFileSystemAccess } from "@/lib/feature-detection";
import { getDirectoryHandle, storeDirectoryHandle } from "@/lib/library-selection-fs-api";
import { logger } from "@/lib/logger";
import { formatPlaylistFilenameStem } from "@/lib/playlist-filename";
import type { DeviceProfileRecord } from "@/db/schema";
import { getLibraryRoot } from "@/db/storage";
import { saveDeviceProfile, saveDeviceSyncManifest } from "./device-storage";
import type { DeviceScanEntry } from "./device-scan";
import { buildDeviceMatchCandidates } from "./device-scan";
import {
  buildNormalizedFilenameToPathsMap,
  buildUniqueDevicePaths,
  normalizeFilenameForMatch,
  pickBestDevicePath,
} from "./path-matching";
import { sanitizePathSegment } from "./path-segment";
import { syncPlaylistsToIpod, type IpodSyncResult } from "./ipod";

export { sanitizePathSegment } from "./path-segment";

export type DevicePlaylistFormat = "m3u" | "pls" | "xspf";
type FileSystemPermissionMode = "read" | "readwrite";

type DevicePathMap = Map<string, string>;

export type PlaylistPathValidationResult = {
  total: number;
  missing: number;
  missingSamples: string[];
};

function resolveDevicePathMatch(
  lookup: TrackLookup,
  devicePathMap: DevicePathMap,
  options?: {
    normalizedFilenameToPaths?: Map<string, string[]>;
    metadataCandidatePaths?: string[];
  }
): string | undefined {
  if (!lookup.fileIndex) return undefined;

  // 1) Primary: content hashes end-to-end
  if (lookup.fileIndex.fullContentHash) {
    const byFullHash = devicePathMap.get(lookup.fileIndex.fullContentHash);
    if (byFullHash) return byFullHash;
  }
  if (lookup.fileIndex.contentHash) {
    const byPartialHash = devicePathMap.get(lookup.fileIndex.contentHash);
    if (byPartialHash) return byPartialHash;
  }

  // 2) Fallback: normalized filename match
  const normalizedFilenameToPaths = options?.normalizedFilenameToPaths;
  if (normalizedFilenameToPaths) {
    const normalized = normalizeFilenameForMatch(lookup.fileIndex.name);
    if (normalized) {
      const candidatePaths = normalizedFilenameToPaths.get(normalized);
      if (candidatePaths && candidatePaths.length > 0) {
        const byNormalizedName = pickBestDevicePath(lookup, candidatePaths);
        if (byNormalizedName) return byNormalizedName;
      }
    }
  }

  // 3) Final fallback: metadata/path scoring across scanned paths
  const metadataCandidatePaths = options?.metadataCandidatePaths;
  if (metadataCandidatePaths && metadataCandidatePaths.length > 0) {
    const byMetadata = pickBestDevicePath(lookup, metadataCandidatePaths);
    if (byMetadata) return byMetadata;
  }

  // Backward compatibility with legacy key maps (filename/size/mtime)
  const candidates = buildDeviceMatchCandidates({
    filename: lookup.fileIndex.name,
    size: lookup.fileIndex.size,
    mtime: lookup.fileIndex.mtime,
  });
  for (const candidate of candidates) {
    const path = devicePathMap.get(candidate);
    if (path) return path;
  }

  return undefined;
}

function normalizeAbsolutePrefix(prefix?: string): string | undefined {
  if (!prefix) return undefined;
  const trimmed = prefix.trim();
  if (!trimmed) return undefined;
  let normalized = trimmed.replace(/\\/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  normalized = normalized.replace(/\/+$/, "");
  return normalized || undefined;
}

export function applyDevicePathMap(
  trackLookups: TrackLookup[],
  devicePathMap?: DevicePathMap,
  options?: {
    absolutePrefix?: string;
    deviceEntries?: DeviceScanEntry[];
  }
): TrackLookup[] {
  if (!devicePathMap || devicePathMap.size === 0) {
    return trackLookups;
  }

  const normalizedPrefix = normalizeAbsolutePrefix(options?.absolutePrefix);
  const prefixTopSegment = normalizedPrefix
    ? normalizedPrefix.split(/[\\/]+/).filter(Boolean).pop()
    : undefined;
  const normalizedFilenameToPaths =
    options?.deviceEntries && options.deviceEntries.length > 0
      ? buildNormalizedFilenameToPathsMap(options.deviceEntries)
      : null;
  const metadataCandidatePaths =
    options?.deviceEntries && options.deviceEntries.length > 0
      ? buildUniqueDevicePaths(options.deviceEntries)
      : null;

  return trackLookups.map((lookup) => {
    if (!lookup.fileIndex) return lookup;
    let mappedPath = resolveDevicePathMatch(lookup, devicePathMap, {
      normalizedFilenameToPaths: normalizedFilenameToPaths ?? undefined,
      metadataCandidatePaths: metadataCandidatePaths ?? undefined,
    });
    if (!mappedPath) return lookup;
    if (normalizedPrefix && !mappedPath.startsWith("/")) {
      if (prefixTopSegment && mappedPath.toLowerCase().startsWith(`${prefixTopSegment.toLowerCase()}/`)) {
        mappedPath = `${normalizedPrefix}/${mappedPath.substring(prefixTopSegment.length + 1)}`;
      } else {
        mappedPath = `${normalizedPrefix}/${mappedPath}`;
      }
    }
    return {
      ...lookup,
      fileIndex: {
        ...lookup.fileIndex,
        relativePath: mappedPath,
      },
    };
  });
}

function applyAbsolutePrefixToLookups(
  trackLookups: TrackLookup[],
  absolutePrefix?: string
): TrackLookup[] {
  const normalizedPrefix = normalizeAbsolutePrefix(absolutePrefix);
  if (!normalizedPrefix) {
    return trackLookups;
  }
  const prefixTopSegment = normalizedPrefix.split(/[\\/]+/).filter(Boolean).pop();
  return trackLookups.map((lookup) => {
    if (!lookup.fileIndex?.relativePath) return lookup;
    const relativePath = lookup.fileIndex.relativePath;
    const isAbsolute =
      relativePath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(relativePath);
    if (isAbsolute) {
      return lookup;
    }
    const cleanRelative = relativePath.replace(/^[\\/]+/, "");
    const withPrefix =
      prefixTopSegment && cleanRelative.toLowerCase().startsWith(`${prefixTopSegment.toLowerCase()}/`)
        ? `${normalizedPrefix}/${cleanRelative.substring(prefixTopSegment.length + 1)}`
        : `${normalizedPrefix}/${cleanRelative}`;
    return {
      ...lookup,
      fileIndex: {
        ...lookup.fileIndex,
        relativePath: withPrefix,
      },
    };
  });
}

function inferCommonTopFolder(devicePathMap?: DevicePathMap): string | null {
  if (!devicePathMap || devicePathMap.size === 0) {
    return null;
  }
  const counts = new Map<string, number>();
  for (const path of devicePathMap.values()) {
    const normalized = path.replace(/^[\\/]+/, "").replace(/\\/g, "/");
    const [top] = normalized.split("/").filter(Boolean);
    if (!top) continue;
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [segment, count] of counts.entries()) {
    if (count > bestCount) {
      best = segment;
      bestCount = count;
    }
  }
  return best;
}

function inferAbsolutePrefixFromDevice(options: {
  handleName: string;
  devicePathMap?: DevicePathMap;
}): string {
  const topFolder = inferCommonTopFolder(options.devicePathMap);
  if (topFolder) {
    return `/${options.handleName}/${topFolder}`;
  }
  return `/${options.handleName}`;
}

function normalizeDevicePath(input: string): string {
  if (!input) return input;
  let normalized = input.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }
  normalized = normalized.replace(/^file:\/\//i, "");
  normalized = normalized.replace(/\\/g, "/");
  normalized = normalized.replace(/([^:])\/\/+/g, "$1/");
  return normalized;
}

function normalizeRelativeSegments(input: string): string {
  const normalized = normalizeDevicePath(input);
  const isAbsolute = normalized.startsWith("/");
  const segments = normalized.split("/").filter(Boolean);
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }
    stack.push(segment);
  }
  const joined = stack.join("/");
  return isAbsolute ? `/${joined}` : joined;
}

function stripVolumePrefixes(path: string, prefixes: string[]): string {
  if (prefixes.length === 0) return path;
  const normalizedPath = normalizeRelativeSegments(path);
  const lowerPath = normalizedPath.toLowerCase();
  for (const prefix of prefixes) {
    const normalizedPrefix = normalizeRelativeSegments(prefix);
    if (!normalizedPrefix) continue;
    const prefixWithSlash = normalizedPrefix.endsWith("/")
      ? normalizedPrefix
      : `${normalizedPrefix}/`;
    const lowerPrefix = prefixWithSlash.toLowerCase();
    if (lowerPath.startsWith(lowerPrefix)) {
      return normalizedPath.slice(prefixWithSlash.length);
    }
  }
  return normalizedPath;
}

function buildVolumePrefixes(options: {
  absolutePathPrefix?: string;
  handleName?: string;
  extra?: string[];
}): string[] {
  const prefixes: string[] = [];
  if (options.absolutePathPrefix) {
    prefixes.push(options.absolutePathPrefix);
  }
  if (options.handleName) {
    prefixes.push(`/Volumes/${options.handleName}`);
  }
  if (options.extra) {
    prefixes.push(...options.extra);
  }
  return prefixes;
}

function resolvePlaylistEntryToDeviceRelative(options: {
  entryPath: string;
  playlistPath: string;
  pathStrategy: PathStrategy;
  volumePrefixes: string[];
}): string {
  const { entryPath, playlistPath, pathStrategy, volumePrefixes } = options;
  let normalized = normalizeRelativeSegments(entryPath);
  const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(entryPath);
  const isAbsolute =
    normalized.startsWith("/") || isWindowsAbsolute || entryPath.startsWith("file://");

  if (isAbsolute) {
    let absolutePath = normalizeRelativeSegments(entryPath);
    absolutePath = absolutePath.replace(/^[a-zA-Z]:[\\/]+/, "/");
    absolutePath = stripVolumePrefixes(absolutePath, volumePrefixes);
    return normalizeRelativeSegments(absolutePath).replace(/^\/+/, "");
  }

  if (pathStrategy === "relative-to-playlist") {
    const normalizedPlaylist = normalizeRelativeSegments(playlistPath);
    const lastSlash = normalizedPlaylist.lastIndexOf("/");
    const playlistDir = lastSlash >= 0 ? normalizedPlaylist.slice(0, lastSlash) : "";
    if (playlistDir) {
      const normalizedEntry = normalizeRelativeSegments(normalized);
      const playlistPrefix = `${playlistDir}/`;
      if (normalizedEntry.toLowerCase().startsWith(playlistPrefix.toLowerCase())) {
        return normalizedEntry.replace(/^\/+/, "");
      }
    }
    const combined = playlistDir
      ? `${playlistDir}/${normalized}`
      : normalized;
    return normalizeRelativeSegments(combined).replace(/^\/+/, "");
  }

  return normalizeRelativeSegments(normalized).replace(/^\/+/, "");
}

async function readDeviceTextFile(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<string> {
  const fileHandle = await getFileHandleFromRelativePath(root, relativePath);
  const file = await fileHandle.getFile();
  return await file.text();
}

function parseM3UPaths(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function fileExistsOnDevice(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<boolean> {
  try {
    await getFileHandleFromRelativePath(root, relativePath);
    return true;
  } catch (error) {
    const err = error as DOMException;
    if (err?.name === "NotFoundError") {
      return false;
    }
    logger.warn("Path validation failed for entry", { relativePath, error: err });
    return false;
  }
}

export async function validatePlaylistOnDevice(options: {
  deviceHandleRef: string;
  playlistPath: string;
  pathStrategy: PathStrategy;
  absolutePathPrefix?: string;
  devicePathMap?: DevicePathMap;
  volumePrefixes?: string[];
}): Promise<PlaylistPathValidationResult> {
  const {
    deviceHandleRef,
    playlistPath,
    pathStrategy,
    absolutePathPrefix,
    devicePathMap,
    volumePrefixes,
  } = options;
  const handle = await getDirectoryHandle(deviceHandleRef);
  if (!handle) {
    throw new Error("Device folder handle not found");
  }
  await ensureDirectoryPermission(handle, "read");

  const prefixes = buildVolumePrefixes({
    absolutePathPrefix,
    handleName: handle.name,
    extra: volumePrefixes,
  });

  const pathToRead = buildSanitizedRelativePath(playlistPath) || playlistPath;
  const content = await readDeviceTextFile(handle, pathToRead);
  const entries = parseM3UPaths(content);
  const normalizedMap = devicePathMap
    ? new Set(
        Array.from(devicePathMap.values()).map((value) =>
          normalizeRelativeSegments(value).replace(/^\/+/, "")
        )
      )
    : null;

  const result: PlaylistPathValidationResult = {
    total: entries.length,
    missing: 0,
    missingSamples: [],
  };

  for (const entry of entries) {
    const resolved = resolvePlaylistEntryToDeviceRelative({
      entryPath: entry,
      playlistPath,
      pathStrategy,
      volumePrefixes: prefixes,
    });

    if (!resolved) {
      result.missing += 1;
      if (result.missingSamples.length < 5) {
        result.missingSamples.push(entry);
      }
      continue;
    }

    if (normalizedMap && normalizedMap.has(resolved)) {
      continue;
    }

    const exists = await fileExistsOnDevice(handle, resolved);
    if (!exists) {
      result.missing += 1;
      if (result.missingSamples.length < 5) {
        result.missingSamples.push(resolved);
      }
    }
  }

  return result;
}

export async function pickDeviceRootHandle(): Promise<{ handleId: string; name: string }> {
  if (!supportsFileSystemAccess()) {
    throw new Error("File System Access API not supported");
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const handleId = await storeDirectoryHandle(handle);
    return { handleId, name: handle.name };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Folder selection was cancelled");
    }
    throw err;
  }
}

export async function checkDeviceWriteAccess(handleRef: string): Promise<boolean> {
  const handle = await getDirectoryHandle(handleRef);
  if (!handle) {
    throw new Error("Device folder handle not found");
  }

  await ensureDirectoryPermission(handle, "readwrite");

  const probeName = ".apg-write-check.tmp";
  const fileHandle = await handle.getFileHandle(probeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write("write-check");
  await writable.close();
  await handle.removeEntry(probeName);
  return true;
}

async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode
): Promise<void> {
  const current = await handle.queryPermission({ mode });
  if (current === "granted") return;
  const requested = await handle.requestPermission({ mode });
  if (requested !== "granted") {
    throw new Error("Permission denied for device folder");
  }
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

async function getOrCreateDirectory(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemDirectoryHandle> {
  const normalized = relativePath.replace(/^[\\/]+|[\\/]+$/g, "");
  if (!normalized) {
    return root;
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  let current = root;
  for (const part of parts) {
    const safe = sanitizePathSegment(part, "_");
    current = await current.getDirectoryHandle(safe, { create: true });
  }
  return current;
}

/** Build the sanitized relative path that matches what getOrCreateDirectory creates. Used so stored playlistPath can be read back. */
function buildSanitizedRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/^[\\/]+|[\\/]+$/g, "");
  if (!normalized) return "";
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts.map((p) => sanitizePathSegment(p, "_")).join("/");
}

async function getFileHandleFromRelativePath(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> {
  const normalized = normalizeRelativeSegments(relativePath).replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Invalid path");
  }
  try {
    let current = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      current = await current.getDirectoryHandle(parts[index], { create: false });
    }
    return current.getFileHandle(parts[parts.length - 1], { create: false });
  } catch (err) {
    const msg = typeof (err as Error).message === "string" ? (err as Error).message : "";
    if (msg.includes("Name is not allowed")) {
      throw new Error(
        `Device path contains a name not allowed by the browser: ${relativePath}`
      );
    }
    throw err;
  }
}

async function getFileFromLibrary(
  libraryRootId: string,
  lookup: TrackLookup
): Promise<File | null> {
  if (!lookup.fileIndex?.relativePath) return null;
  const root = await getLibraryRoot(libraryRootId);
  if (!root?.handleRef) return null;
  const rootHandle = await getDirectoryHandle(root.handleRef);
  if (!rootHandle) return null;
  const relativePath = lookup.fileIndex.relativePath.replace(/^\/+/, "");
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  try {
    let current = rootHandle;
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = await current.getDirectoryHandle(parts[i], { create: false });
    }
    const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: false });
    return await fileHandle.getFile();
  } catch (err) {
    const msg = typeof (err as Error).message === "string" ? (err as Error).message : "";
    if (msg.includes("Name is not allowed")) {
      throw new Error(
        `Library path contains a name not allowed on this device: ${relativePath}`
      );
    }
    throw err;
  }
}

function sanitizeDeviceFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "track";
}

/** Sanitize artist/album for use as directory name. Returns fallback if empty after sanitization. */
function sanitizeDeviceDirName(value: string | undefined, fallback: string): string {
  if (!value || typeof value !== "string") return fallback;
  const sanitized = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
  return sanitized || fallback;
}

/** Build Artist/Album subpath for device sync. Exported for testing. */
export function buildDeviceTrackSubPath(
  artist: string | undefined,
  album: string | undefined
): string {
  const a = sanitizeDeviceDirName(artist, "Unknown Artist");
  const b = sanitizeDeviceDirName(album, "Unknown Album");
  return `${a}/${b}`.replace(/\/+/g, "/");
}

async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  filename: string,
  content: string
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function syncPlaylistToDevice(options: {
  playlist: GeneratedPlaylist;
  trackLookups: TrackLookup[];
  deviceProfile: DeviceProfileRecord;
  devicePathMap?: DevicePathMap;
  deviceEntries?: DeviceScanEntry[];
  onlyIncludeMatchedPaths?: boolean;
  /** When set with deviceMusicFolder, copy tracks not on device from library to device. */
  libraryRootId?: string;
  /** Folder on device for copied tracks (e.g. MUSIC). Used when libraryRootId is set. */
  deviceMusicFolder?: string;
  /** Progress during copy phase: current index, total tracks, optional track title. */
  onProgress?: (progress: { current: number; total: number; title?: string }) => void;
}): Promise<{ playlistPath: string; configHash: string }> {
  const {
    playlist,
    trackLookups,
    deviceProfile,
    devicePathMap,
    deviceEntries,
    onlyIncludeMatchedPaths,
    libraryRootId,
    deviceMusicFolder,
    onProgress,
  } = options;
  if (!deviceProfile.handleRef) {
    throw new Error("Device folder handle not found");
  }
  const handle = await getDirectoryHandle(deviceProfile.handleRef);

  if (!handle) {
    throw new Error("Device folder handle not found");
  }

  await ensureDirectoryPermission(handle, "readwrite");

  const inferredAbsolutePrefix =
    deviceProfile.pathStrategy === "absolute" && !deviceProfile.absolutePathPrefix
      ? inferAbsolutePrefixFromDevice({ handleName: handle.name, devicePathMap })
      : deviceProfile.absolutePathPrefix;

  const exportConfig: PlaylistLocationConfig = {
    playlistLocation: deviceProfile.playlistFolder ? "subfolder" : "root",
    playlistSubfolderPath: deviceProfile.playlistFolder || undefined,
    pathStrategy: deviceProfile.pathStrategy,
    absolutePathPrefix:
      deviceProfile.pathStrategy === "absolute" ? inferredAbsolutePrefix : undefined,
  };

  let mappedTrackLookups = applyDevicePathMap(trackLookups, devicePathMap, {
    absolutePrefix:
      deviceProfile.pathStrategy === "absolute" ? inferredAbsolutePrefix : undefined,
    deviceEntries,
  });
  if (deviceProfile.pathStrategy === "absolute") {
    mappedTrackLookups = applyAbsolutePrefixToLookups(
      mappedTrackLookups,
      inferredAbsolutePrefix
    );
  }

  const normalizedFilenameToPaths =
    deviceEntries && deviceEntries.length > 0
      ? buildNormalizedFilenameToPathsMap(deviceEntries)
      : undefined;
  const metadataCandidatePaths =
    deviceEntries && deviceEntries.length > 0
      ? buildUniqueDevicePaths(deviceEntries)
      : undefined;

  const copyToDevice =
    Boolean(libraryRootId && deviceMusicFolder);
  const totalTracks = trackLookups.length;

  let effectiveTrackLookups: TrackLookup[];
  if (copyToDevice) {
    const usedPaths = new Set<string>();
    effectiveTrackLookups = [];
    let processed = 0;
    for (const trackFileId of playlist.trackFileIds) {
      const lookup = mappedTrackLookups.find((t) => t.track.trackFileId === trackFileId);
      if (!lookup) continue;
      const matchedPath = resolveDevicePathMatch(lookup, devicePathMap ?? new Map(), {
        normalizedFilenameToPaths,
        metadataCandidatePaths,
      });
      if (matchedPath) {
        effectiveTrackLookups.push(lookup);
      } else {
        const file = await getFileFromLibrary(libraryRootId!, lookup);
        if (!file) {
          logger.warn("Skip track (file not found in library)", {
            trackFileId,
            relativePath: lookup.fileIndex?.relativePath,
          });
          processed += 1;
          onProgress?.({ current: processed, total: totalTracks, title: lookup.track.tags?.title });
          continue;
        }
        const subPath = buildDeviceTrackSubPath(
          lookup.track.tags?.artist,
          lookup.track.tags?.album
        );
        const trackDir = await getOrCreateDirectory(
          handle,
          `${deviceMusicFolder}/${subPath}`.replace(/\/+/g, "/")
        );
        const baseName = lookup.fileIndex?.name ?? `${lookup.track.trackFileId}.mp3`;
        let deviceName = sanitizeDeviceFilename(baseName);
        let deviceRelativePath = `${deviceMusicFolder}/${subPath}/${deviceName}`.replace(/\/+/g, "/");
        let n = 0;
        while (usedPaths.has(deviceRelativePath.toLowerCase())) {
          n += 1;
          const ext = deviceName.includes(".") ? deviceName.slice(deviceName.lastIndexOf(".")) : "";
          const stem = deviceName.includes(".") ? deviceName.slice(0, deviceName.lastIndexOf(".")) : deviceName;
          deviceName = `${stem} (${n})${ext}`;
          deviceRelativePath = `${deviceMusicFolder}/${subPath}/${deviceName}`.replace(/\/+/g, "/");
        }
        usedPaths.add(deviceRelativePath.toLowerCase());
        const fileHandle = await trackDir.getFileHandle(deviceName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();
        effectiveTrackLookups.push({
          ...lookup,
          fileIndex: lookup.fileIndex
            ? { ...lookup.fileIndex, relativePath: deviceRelativePath }
            : undefined,
        });
      }
      processed += 1;
      onProgress?.({ current: processed, total: totalTracks, title: lookup.track.tags?.title });
    }
  } else {
    effectiveTrackLookups =
      onlyIncludeMatchedPaths && devicePathMap
        ? mappedTrackLookups.filter((lookup) => {
            const matchedPath = resolveDevicePathMatch(lookup, devicePathMap, {
              normalizedFilenameToPaths,
              metadataCandidatePaths,
            });
            return Boolean(matchedPath);
          })
        : mappedTrackLookups;
  }

  const contentResult = (() => {
    switch (deviceProfile.playlistFormat) {
      case "pls":
        return exportPLS(playlist, effectiveTrackLookups, exportConfig);
      case "xspf":
        return exportXSPF(playlist, effectiveTrackLookups, exportConfig);
      case "m3u":
      default:
        return exportM3U(playlist, effectiveTrackLookups, exportConfig);
    }
  })();

  const filename = `${formatPlaylistFilenameStem(playlist.title)}.${contentResult.extension}`;
  const targetDirectory = await getOrCreateDirectory(
    handle,
    deviceProfile.playlistFolder
  );

  await writeTextFile(targetDirectory, filename, contentResult.content);

  const playlistPath = deviceProfile.playlistFolder
    ? buildSanitizedRelativePath(
        `${deviceProfile.playlistFolder.replace(/[\\/]+$/g, "")}/${filename}`
      )
    : filename;

  const configHash = hashString(
    JSON.stringify({
      playlistId: playlist.id,
      trackIds: effectiveTrackLookups.map((item) => item.track.trackFileId),
      format: deviceProfile.playlistFormat,
      playlistFolder: deviceProfile.playlistFolder,
      pathStrategy: deviceProfile.pathStrategy,
      absolutePathPrefix: inferredAbsolutePrefix,
    })
  );

  const now = Date.now();
  await saveDeviceProfile({
    id: deviceProfile.id,
    label: deviceProfile.label,
    handleRef: deviceProfile.handleRef,
    playlistFormat: deviceProfile.playlistFormat,
    playlistFolder: deviceProfile.playlistFolder,
    pathStrategy: deviceProfile.pathStrategy,
    absolutePathPrefix: deviceProfile.absolutePathPrefix,
    lastSyncAt: now,
  });

  await saveDeviceSyncManifest({
    id: `${deviceProfile.id}-${playlist.id}`,
    deviceId: deviceProfile.id,
    playlistId: playlist.id,
    playlistTitle: playlist.title,
    playlistPath,
    playlistFormat: deviceProfile.playlistFormat,
    trackCount: playlist.trackFileIds.length,
    configHash,
    lastSyncedAt: now,
  });

  logger.info("Device sync completed", {
    deviceId: deviceProfile.id,
    playlistId: playlist.id,
    playlistPath,
  });

  return { playlistPath, configHash };
}

export async function syncPlaylistsToDevice(options: {
  deviceProfile: DeviceProfileRecord;
  targets: Array<{
    playlist: GeneratedPlaylist;
    trackLookups: TrackLookup[];
    libraryRootId?: string;
    mirrorMode?: boolean;
    mirrorDeleteFromDevice?: boolean;
    onlyReferenceExistingTracks?: boolean;
    libraryOnly?: boolean;
  }>;
  devicePathMap?: DevicePathMap;
  deviceEntries?: DeviceScanEntry[];
  onlyIncludeMatchedPaths?: boolean;
  /** Folder on device for copying tracks not on device (e.g. MUSIC). Used when target.libraryRootId is set. */
  deviceMusicFolder?: string;
  /** When true, only add playlist entries for tracks already on device (iPod); skip copying missing */
  onlyReferenceExistingTracks?: boolean;
  /** When true, replace existing iPod playlist with same name (clear then add synced tracks) */
  overwriteExistingPlaylist?: boolean;
  /** Cumulative progress: current index, total items, optional title (tracks for iPod/copy, playlists for others) */
  onProgress?: (progress: { current: number; total: number; title?: string }) => void;
}): Promise<{ playlistPath?: string; configHash?: string; failedTracks?: IpodSyncResult["failedTracks"] }> {
  const {
    deviceProfile,
    targets,
    devicePathMap,
    deviceEntries,
    onlyIncludeMatchedPaths,
    deviceMusicFolder,
    onlyReferenceExistingTracks,
    overwriteExistingPlaylist,
    onProgress,
  } = options;
  if (deviceProfile.deviceType === "ipod") {
    const ipodTargets = targets.map((t) => ({
      ...t,
      onlyReferenceExistingTracks: t.onlyReferenceExistingTracks ?? onlyReferenceExistingTracks,
    }));
    const result = await syncPlaylistsToIpod({
      deviceProfile,
      targets: ipodTargets,
      overwriteExistingPlaylist,
      onProgress,
    });
    return { failedTracks: result?.failedTracks };
  }

  let lastResult: { playlistPath: string; configHash: string } | null = null;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    if (targets.length > 1) {
      onProgress?.({
        current: index + 1,
        total: targets.length,
        title: target.playlist.title,
      });
    }
    lastResult = await syncPlaylistToDevice({
      playlist: target.playlist,
      trackLookups: target.trackLookups,
      deviceProfile,
      devicePathMap,
      deviceEntries,
      onlyIncludeMatchedPaths,
      libraryRootId: target.libraryRootId,
      deviceMusicFolder,
      onProgress: targets.length === 1 ? onProgress : undefined,
    });
  }
  return lastResult ?? {};
}
