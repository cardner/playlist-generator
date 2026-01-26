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
} from "@/features/playlists/export";
import { supportsFileSystemAccess } from "@/lib/feature-detection";
import { getDirectoryHandle, storeDirectoryHandle } from "@/lib/library-selection-fs-api";
import { logger } from "@/lib/logger";
import type { DeviceProfileRecord } from "@/db/schema";
import { saveDeviceProfile, saveDeviceSyncManifest } from "./device-storage";

export type DevicePlaylistFormat = "m3u" | "pls" | "xspf";
type FileSystemPermissionMode = "read" | "readwrite";

export async function pickDeviceRootHandle(): Promise<{ handleId: string; name: string }> {
  if (!supportsFileSystemAccess()) {
    throw new Error("File System Access API not supported");
  }

  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  const handleId = await storeDirectoryHandle(handle);
  return { handleId, name: handle.name };
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

function sanitizeFilename(input: string): string {
  return input.replace(/[^a-z0-9]/gi, "_").toLowerCase().substring(0, 50);
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
}): Promise<{ playlistPath: string; configHash: string }> {
  const { playlist, trackLookups, deviceProfile } = options;
  const handle = await getDirectoryHandle(deviceProfile.handleRef);

  if (!handle) {
    throw new Error("Device folder handle not found");
  }

  await ensureDirectoryPermission(handle, "readwrite");

  const exportConfig: PlaylistLocationConfig = {
    playlistLocation: deviceProfile.playlistFolder ? "subfolder" : "root",
    playlistSubfolderPath: deviceProfile.playlistFolder || undefined,
    pathStrategy: deviceProfile.pathStrategy,
    absolutePathPrefix:
      deviceProfile.pathStrategy === "absolute"
        ? deviceProfile.absolutePathPrefix
        : undefined,
  };

  const contentResult = (() => {
    switch (deviceProfile.playlistFormat) {
      case "pls":
        return exportPLS(playlist, trackLookups, exportConfig);
      case "xspf":
        return exportXSPF(playlist, trackLookups, exportConfig);
      case "m3u":
      default:
        return exportM3U(playlist, trackLookups, exportConfig);
    }
  })();

  const filename = `${sanitizeFilename(playlist.title)}.${contentResult.extension}`;
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
      trackIds: playlist.trackFileIds,
      format: deviceProfile.playlistFormat,
      playlistFolder: deviceProfile.playlistFolder,
      pathStrategy: deviceProfile.pathStrategy,
      absolutePathPrefix: deviceProfile.absolutePathPrefix,
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
