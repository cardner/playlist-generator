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
import { saveDeviceProfile, saveDeviceSyncManifest } from "./device-storage";
import type { DeviceScanEntry } from "./device-scan";
import { buildDeviceMatchCandidates } from "./device-scan";
import {
  buildNormalizedFilenameToPathsMap,
  buildUniqueDevicePaths,
  normalizeFilenameForMatch,
  pickBestDevicePath,
} from "./path-matching";
import { syncPlaylistsToIpod } from "./ipod";

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

async function getFileHandleFromRelativePath(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> {
  const normalized = normalizeRelativeSegments(relativePath).replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Invalid path");
  }
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = await current.getDirectoryHandle(parts[index], { create: false });
  }
  return current.getFileHandle(parts[parts.length - 1], { create: false });
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

  const content = await readDeviceTextFile(handle, playlistPath);
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

  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  const handleId = await storeDirectoryHandle(handle);
  return { handleId, name: handle.name };
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
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
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
}): Promise<{ playlistPath: string; configHash: string }> {
  const {
    playlist,
    trackLookups,
    deviceProfile,
    devicePathMap,
    deviceEntries,
    onlyIncludeMatchedPaths,
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

  const effectiveTrackLookups =
    onlyIncludeMatchedPaths && devicePathMap
      ? mappedTrackLookups.filter((lookup) => {
          const matchedPath = resolveDevicePathMatch(lookup, devicePathMap, {
            normalizedFilenameToPaths,
            metadataCandidatePaths,
          });
          return Boolean(matchedPath);
        })
      : mappedTrackLookups;

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
    ? `${deviceProfile.playlistFolder.replace(/[\\/]+$/g, "")}/${filename}`
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
  }>;
  devicePathMap?: DevicePathMap;
  deviceEntries?: DeviceScanEntry[];
  onlyIncludeMatchedPaths?: boolean;
  /** When true, only add playlist entries for tracks already on device (iPod); skip copying missing */
  onlyReferenceExistingTracks?: boolean;
  /** When true, replace existing iPod playlist with same name (clear then add synced tracks) */
  overwriteExistingPlaylist?: boolean;
}): Promise<{ playlistPath?: string; configHash?: string }> {
  const {
    deviceProfile,
    targets,
    devicePathMap,
    deviceEntries,
    onlyIncludeMatchedPaths,
    onlyReferenceExistingTracks,
    overwriteExistingPlaylist,
  } = options;
  if (deviceProfile.deviceType === "ipod") {
    const ipodTargets = targets.map((t) => ({
      ...t,
      onlyReferenceExistingTracks: t.onlyReferenceExistingTracks ?? onlyReferenceExistingTracks,
    }));
    await syncPlaylistsToIpod({
      deviceProfile,
      targets: ipodTargets,
      overwriteExistingPlaylist,
    });
    return {};
  }

  let lastResult: { playlistPath: string; configHash: string } | null = null;
  for (const target of targets) {
    lastResult = await syncPlaylistToDevice({
      playlist: target.playlist,
      trackLookups: target.trackLookups,
      deviceProfile,
      devicePathMap,
      deviceEntries,
      onlyIncludeMatchedPaths,
    });
  }
  return lastResult ?? {};
}
