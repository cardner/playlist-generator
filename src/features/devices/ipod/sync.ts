import type { GeneratedPlaylist } from "@/features/playlists";
import type { TrackLookup } from "@/features/playlists/export";
import type { DeviceProfileRecord } from "@/db/schema";
import { db, getCompositeId } from "@/db/schema";
import { getLibraryRoot } from "@/db/storage";
import { getDeviceTrackMappings, saveDeviceTrackMapping } from "@/features/devices/device-storage";
import { getDirectoryHandle } from "@/lib/library-selection-fs-api";
import { logger } from "@/lib/logger";
import { hashDeviceFileContent } from "@/features/devices/device-scan";
import {
  initIpodWasm,
  isIpodWasmReady,
  wasmAddTrack,
  wasmCall,
  wasmCallWithError,
  wasmCallWithStrings,
  wasmGetJson,
  wasmGetString,
  wasmSetTrackArtwork,
  wasmUpdateTrack,
} from "./wasm";
import { extractArtworkFromFile } from "./artwork-extract";
import { resizeToIpodThumbnail } from "./artwork-resize";
import { createIpodPaths } from "./paths";
import {
  reserveVirtualPath,
  setupWasmFilesystem,
  syncDbToIpod,
  syncDbToIpodFromBuffers,
  readIpodBuffersFromHandle,
  verifyIpodStructure,
  deleteFileFromIpodRelativePath,
  writeFileToIpodRelativePath,
} from "./fs-sync";
import { createTranscodePool } from "./transcode";
import {
  USE_IPOD_TS_BACKEND,
  getIpodTsModel,
  setIpodTsModel,
  parseITunesDBFromBuffer,
  getDeviceInfo,
  getTracks,
  getPlaylists,
  getPlaylistTracks,
  createPlaylist as apiCreatePlaylist,
  playlistAddTrack as apiPlaylistAddTrack,
  playlistRemoveTrack as apiPlaylistRemoveTrack,
  addTrack as apiAddTrack,
  updateTrack as apiUpdateTrack,
  getTrackDestPath as apiGetTrackDestPath,
  setTrackPath as apiSetTrackPath,
  finalizeLastTrackNoStat as apiFinalizeLastTrackNoStat,
  hasLongFilename as apiHasLongFilename,
  getMigrationDestPath as apiGetMigrationDestPath,
  setTrackArtwork as apiSetTrackArtwork,
  writeITunesDB as apiWriteITunesDB,
  writeArtwork as apiWriteArtwork,
  getLastError,
} from "./ipod-db-api";
import { getDeviceInfoFromSysInfo } from "./device/parse-sysinfo";
import { createIpodPathsTs } from "./paths";
import { supportsArtwork as modelSupportsArtwork } from "./firewire-setup";

/**
 * iPod playlist sync: matches playlist tracks to existing device tracks when possible to avoid
 * duplicate files. Matching order: (1) persisted library→device mapping, (2) AcoustID from
 * metadata, (3) content hash, (4) tag+size, (5) tag-only with duration tolerance, (6) size+hash.
 * When no match is found, the track is copied and a mapping is saved for next sync.
 * Per-playlist dedupe ensures the same device track is not added twice to a playlist.
 */

const DEFAULT_MOUNTPOINT = "/iPod";
const IPOD_DB_WRITE_TIMEOUT_MS = 600_000; // 10 min after last track/file transfer; device write can be very slow
const transcodePool = createTranscodePool({ concurrency: 2 });

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${message} (timed out after ${ms / 1000}s)`)),
        ms
      )
    ),
  ]);
}
const TRANSCODE_TIMEOUT_MS = 120000;

type IpodSyncTarget = {
  playlist: GeneratedPlaylist;
  trackLookups: TrackLookup[];
  libraryRootId?: string;
  mirrorMode?: boolean;
  mirrorDeleteFromDevice?: boolean;
  /** When true, only add playlist entries for tracks already on device; skip copying missing */
  onlyReferenceExistingTracks?: boolean;
  /** When true, only add tracks to device/Library; do not create a named playlist */
  libraryOnly?: boolean;
};

type IpodTrack = {
  id: number;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  track_nr?: number;
  year?: number;
  size?: number;
  tracklen?: number;
  ipod_path?: string;
};

export type IpodSyncResult = {
  playlistCount: number;
  trackCount: number;
  deviceInfo?: {
    model_name?: string;
    generation_name?: string;
    model_number?: string;
    generation?: number;
    capacity_gb?: number;
    ipod_model?: number;
    checksum_type?: number;
    device_recognized?: boolean;
  };
};

function getFiletypeFromName(filename: string): string {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".aac")) return "AAC audio file";
  if (lower.endsWith(".wav")) return "WAV audio file";
  if (lower.endsWith(".aiff") || lower.endsWith(".aif")) return "AIFF audio file";
  return "MPEG audio file";
}

function isFlacFile(filename: string): boolean {
  return String(filename || "").toLowerCase().endsWith(".flac");
}

function normalizeTag(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function buildTagKey(input: {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  trackNo?: number | null;
}): string {
  return [
    normalizeTag(input.artist),
    normalizeTag(input.title),
    normalizeTag(input.album),
    input.trackNo ?? 0,
  ].join("|");
}

function buildTagSizeKey(input: {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  trackNo?: number | null;
  size?: number | null;
}): string {
  return `${buildTagKey(input)}|${input.size ?? 0}`;
}

function metadataNeedsUpdate(lookup: TrackLookup, ipodTrack: IpodTrack): boolean {
  const tags = lookup.track.tags;
  const lookupGenre = tags.genres?.[0] || "";
  const sameTitle = normalizeTag(tags.title) === normalizeTag(ipodTrack.title);
  const sameArtist = normalizeTag(tags.artist) === normalizeTag(ipodTrack.artist);
  const sameAlbum = normalizeTag(tags.album) === normalizeTag(ipodTrack.album);
  const sameGenre = normalizeTag(lookupGenre) === normalizeTag(ipodTrack.genre);
  const sameTrackNo = (tags.trackNo ?? 0) === (ipodTrack.track_nr ?? 0);
  const sameYear = (tags.year ?? 0) === (ipodTrack.year ?? 0);
  return !(sameTitle && sameArtist && sameAlbum && sameGenre && sameTrackNo && sameYear);
}

async function getFileHandleFromRelativePath(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> {
  const normalized = relativePath.replace(/^\/+/, "");
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

async function hashIpodTrackFile(
  ipodHandle: FileSystemDirectoryHandle,
  ipodPath: string,
  paths: ReturnType<typeof createIpodPaths>
): Promise<string | null> {
  try {
    const relFsPath = paths.toRelFsPathFromIpodDbPath(ipodPath);
    const fileHandle = await getFileHandleFromRelativePath(ipodHandle, relFsPath);
    const file = await fileHandle.getFile();
    return (await hashDeviceFileContent(file)) ?? null;
  } catch (error) {
    logger.warn("Failed to hash iPod track file", error);
    return null;
  }
}

async function getFileFromLibrary(
  libraryRootId: string | undefined,
  lookup: TrackLookup
): Promise<File | null> {
  if (!libraryRootId) return null;
  if (!lookup.fileIndex?.relativePath) return null;
  const root = await getLibraryRoot(libraryRootId);
  if (!root?.handleRef) return null;
  const rootHandle = await getDirectoryHandle(root.handleRef);
  if (!rootHandle) return null;
  const relativePath = lookup.fileIndex.relativePath.replace(/^\/+/, "");
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  let current = rootHandle;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = await current.getDirectoryHandle(parts[i], { create: false });
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: false });
  return await fileHandle.getFile();
}

async function ensurePlaylistIndex(
  name: string,
  playlistCache: Map<string, number>,
  options?: { clearIfExisting?: boolean },
  model?: import("./db-types").IpodDbModel | null
) {
  if (playlistCache.has(name)) {
    return playlistCache.get(name)!;
  }
  if (model) {
    const playlists = getPlaylists(model);
    for (let i = 0; i < playlists.length; i += 1) {
      if (playlists[i]?.name === name) {
        if (options?.clearIfExisting) {
          const playlistTracks = getPlaylistTracks(model, i);
          for (const playlistTrack of playlistTracks) {
            if (typeof playlistTrack.id === "number") {
              apiPlaylistRemoveTrack(model, i, playlistTrack.id);
            }
          }
        }
        playlistCache.set(name, i);
        return i;
      }
    }
    const idx = apiCreatePlaylist(model, name);
    playlistCache.set(name, idx);
    return idx;
  }
  const playlists = wasmGetJson("ipod_get_all_playlists_json") as
    | Array<{ name: string; is_master?: boolean }>
    | null;
  if (Array.isArray(playlists)) {
    for (let i = 0; i < playlists.length; i += 1) {
      const pl = playlists[i];
      if (pl?.name === name) {
        if (options?.clearIfExisting) {
          const playlistTracks = wasmGetJson("ipod_get_playlist_tracks_json", i) as
            | IpodTrack[]
            | null;
          if (Array.isArray(playlistTracks)) {
            for (const playlistTrack of playlistTracks) {
              if (typeof playlistTrack.id === "number") {
                wasmCall("ipod_playlist_remove_track", i, playlistTrack.id);
              }
            }
          }
        }
        playlistCache.set(name, i);
        return i;
      }
    }
  }
  const idx = wasmCallWithStrings("ipod_create_playlist", [name]);
  if (typeof idx === "number" && idx >= 0) {
    playlistCache.set(name, idx);
    return idx;
  }
  throw new Error(`Failed to create playlist "${name}" on iPod`);
}

export async function loadIpodDeviceInfo(handleRef: string) {
  const ipodHandle = await getDirectoryHandle(handleRef);
  if (!ipodHandle) {
    throw new Error("Device folder handle not found");
  }
  const isValid = await verifyIpodStructure(ipodHandle);
  if (!isValid) {
    throw new Error(
      "Selected folder does not look like an iPod root. If the device was disconnected, remove it and re-select the iPod."
    );
  }
  if (USE_IPOD_TS_BACKEND) {
    const { iTunesDB, SysInfo } = await readIpodBuffersFromHandle(ipodHandle);
    const model = parseITunesDBFromBuffer(iTunesDB);
    if (!model) throw new Error("Failed to parse iTunesDB");
    if (SysInfo) {
      model.deviceInfo = { ...model.deviceInfo, ...getDeviceInfoFromSysInfo(SysInfo) };
    }
    setIpodTsModel(model);
    return getDeviceInfo(model) as IpodSyncResult["deviceInfo"];
  }
  const wasmReady = await initIpodWasm();
  if (!wasmReady || !isIpodWasmReady()) {
    throw new Error("Failed to initialize iPod WASM");
  }
  await setupWasmFilesystem(ipodHandle, DEFAULT_MOUNTPOINT);
  const parseResult = wasmCallWithError("ipod_parse_db");
  if (parseResult !== 0) {
    throw new Error("Failed to parse iTunesDB");
  }
  return wasmGetJson("ipod_get_device_info_json") as IpodSyncResult["deviceInfo"];
}

export async function loadIpodTracks(handleRef: string): Promise<IpodTrack[]> {
  const ipodHandle = await getDirectoryHandle(handleRef);
  if (!ipodHandle) {
    throw new Error("Device folder handle not found");
  }
  const isValid = await verifyIpodStructure(ipodHandle);
  if (!isValid) {
    throw new Error(
      "Selected folder does not look like an iPod root. If the device was disconnected, remove it and re-select the iPod."
    );
  }
  if (USE_IPOD_TS_BACKEND) {
    let model = getIpodTsModel();
    if (!model) {
      const { iTunesDB } = await readIpodBuffersFromHandle(ipodHandle);
      model = parseITunesDBFromBuffer(iTunesDB);
      if (model) setIpodTsModel(model);
    }
    return model ? getTracks(model) : [];
  }
  const wasmReady = await initIpodWasm();
  if (!wasmReady || !isIpodWasmReady()) {
    throw new Error("Failed to initialize iPod WASM");
  }
  await setupWasmFilesystem(ipodHandle, DEFAULT_MOUNTPOINT);
  const parseResult = wasmCallWithError("ipod_parse_db");
  if (parseResult !== 0) {
    throw new Error("Failed to parse iTunesDB");
  }
  return (wasmGetJson("ipod_get_all_tracks_json") as IpodTrack[]) || [];
}

export async function syncPlaylistsToIpod(options: {
  deviceProfile: DeviceProfileRecord;
  targets: IpodSyncTarget[];
  onProgress?: (progress: { current: number; total: number; title?: string }) => void;
  /** When true, clear existing playlist with same name before adding synced tracks */
  overwriteExistingPlaylist?: boolean;
}): Promise<IpodSyncResult> {
  const { deviceProfile, targets, onProgress, overwriteExistingPlaylist } = options;
  if (!deviceProfile.handleRef) {
    throw new Error("Device folder handle not found");
  }
  const missingRoot = targets.find((target) => !target.libraryRootId);
  if (missingRoot) {
    throw new Error("iPod sync requires a library root for file access.");
  }
  const ipodHandle = await getDirectoryHandle(deviceProfile.handleRef);
  if (!ipodHandle) {
    throw new Error("Device folder handle not found");
  }

  const isValid = await verifyIpodStructure(ipodHandle);
  if (!isValid) {
    throw new Error(
      "Selected folder does not look like an iPod root. If the device was disconnected, remove it and re-select the iPod."
    );
  }

  let model: import("./db-types").IpodDbModel | null = null;
  if (USE_IPOD_TS_BACKEND) {
    model = getIpodTsModel();
    if (!model) {
      const { iTunesDB } = await readIpodBuffersFromHandle(ipodHandle);
      model = parseITunesDBFromBuffer(iTunesDB);
      if (model) setIpodTsModel(model);
    }
  }
  if (!USE_IPOD_TS_BACKEND) {
    const wasmReady = await initIpodWasm();
    if (!wasmReady || !isIpodWasmReady()) {
      throw new Error("Failed to initialize iPod WASM");
    }
    await setupWasmFilesystem(ipodHandle, DEFAULT_MOUNTPOINT);
    const parseResult = wasmCallWithError("ipod_parse_db");
    if (parseResult !== 0) {
      throw new Error("Failed to parse iTunesDB");
    }
  }

  const flacAvailable = await transcodePool.init();
  if (!flacAvailable) {
    logger.warn("FFmpeg not available; FLAC tracks will be skipped.");
  }

  const paths = USE_IPOD_TS_BACKEND ? createIpodPathsTs(DEFAULT_MOUNTPOINT) : createIpodPaths(DEFAULT_MOUNTPOINT);
  const artworkSupported =
    typeof deviceProfile.usbProductId === "number" && modelSupportsArtwork(deviceProfile.usbProductId);
  const playlistIndexCache = new Map<string, number>();
  const ipodTracks = USE_IPOD_TS_BACKEND && model ? getTracks(model) : (wasmGetJson("ipod_get_all_tracks_json") as IpodTrack[]) || [];
  const ipodTrackById = new Map<number, IpodTrack>();
  const ipodTrackByTagSize = new Map<string, number>();
  const ipodTrackByTag = new Map<string, number[]>();
  const ipodTrackBySize = new Map<number, number[]>();
  for (const track of ipodTracks) {
    if (typeof track.id !== "number") continue;
    ipodTrackById.set(track.id, track);
    const tagKey = buildTagKey({
      title: track.title,
      artist: track.artist,
      album: track.album,
      trackNo: track.track_nr,
    });
    const tagSizeKey = buildTagSizeKey({
      title: track.title,
      artist: track.artist,
      album: track.album,
      trackNo: track.track_nr,
      size: track.size,
    });
    if (!ipodTrackByTagSize.has(tagSizeKey)) {
      ipodTrackByTagSize.set(tagSizeKey, track.id);
    }
    const list = ipodTrackByTag.get(tagKey) ?? [];
    list.push(track.id);
    ipodTrackByTag.set(tagKey, list);
    if (typeof track.size === "number") {
      const sizeList = ipodTrackBySize.get(track.size) ?? [];
      sizeList.push(track.id);
      ipodTrackBySize.set(track.size, sizeList);
    }
  }
  const ipodHashCache = new Map<number, string | null>();

  const mappings = await getDeviceTrackMappings(deviceProfile.id);
  const libraryToDevice = new Map<string, number>(
    mappings.map((m) => [m.libraryTrackId, m.deviceTrackId])
  );
  const acoustidToDevice = new Map<string, number>();
  for (const m of mappings) {
    if (m.acoustidId) acoustidToDevice.set(m.acoustidId, m.deviceTrackId);
  }

  let ipodTrackByContentHash: Map<string, number> | null = null;
  const DURATION_MATCH_TOLERANCE_MS = 2000;

  let totalTracks = 0;
  for (const target of targets) {
    totalTracks += target.playlist.trackFileIds.length;
  }
  let processed = 0;
  logger.info(`Starting iPod sync: ${targets.length} playlist(s), ${totalTracks} track(s)`);

  for (const target of targets) {
    const libraryOnly = target.libraryOnly === true;
    const playlistIndex = libraryOnly
      ? null
      : await ensurePlaylistIndex(
          target.playlist.title,
          playlistIndexCache,
          { clearIfExisting: overwriteExistingPlaylist },
          USE_IPOD_TS_BACKEND ? model ?? undefined : undefined
        );
    const playlistAddedTrackIds = new Set<number>();
    const desiredKeys = target.mirrorMode
      ? new Set(
          target.trackLookups.map((lookup) =>
            buildTagKey({
              title: lookup.track.tags.title,
              artist: lookup.track.tags.artist,
              album: lookup.track.tags.album,
              trackNo: lookup.track.tags.trackNo ?? 0,
            })
          )
        )
      : null;
    for (const lookup of target.trackLookups) {
      processed += 1;
      if (processed % 10 === 0 || processed === totalTracks) {
        logger.info(`Processed ${processed}/${totalTracks} track(s)`);
      }
      onProgress?.({
        current: processed,
        total: totalTracks,
        title: target.playlist.title,
      });

      const file = await getFileFromLibrary(target.libraryRootId, lookup);
      if (!file) {
        logger.warn("Missing file for track", { trackFileId: lookup.track.trackFileId });
        continue;
      }

      let effectiveFile = file;
      if (isFlacFile(file.name)) {
        if (!flacAvailable) {
          logger.warn("Skipping FLAC track because FFmpeg is unavailable", {
            trackFileId: lookup.track.trackFileId,
          });
          continue;
        }
        try {
          effectiveFile = await Promise.race([
            transcodePool.transcodeFlacToAlacM4a(file),
            new Promise<File>((_, reject) =>
              setTimeout(() => reject(new Error("FLAC transcode timeout")), TRANSCODE_TIMEOUT_MS)
            ),
          ]);
        } catch (error) {
          logger.warn("FLAC transcode failed; skipping track", error);
          continue;
        }
      }

      const libraryKey = getCompositeId(
        lookup.track.trackFileId,
        lookup.track.libraryRootId ?? target.libraryRootId ?? ""
      );
      let matchedTrackId: number | undefined = libraryToDevice.get(libraryKey) ?? undefined;
      if (!matchedTrackId && lookup.track.acoustidId) {
        matchedTrackId = acoustidToDevice.get(lookup.track.acoustidId) ?? undefined;
      }
      if (!matchedTrackId && lookup.fileIndex?.contentHash) {
        if (ipodTrackByContentHash === null) {
          ipodTrackByContentHash = new Map();
          for (const track of ipodTracks) {
            if (typeof track.id !== "number" || !track.ipod_path) continue;
            const hash = await hashIpodTrackFile(ipodHandle, track.ipod_path, paths);
            if (hash) ipodTrackByContentHash.set(hash, track.id);
          }
        }
        matchedTrackId = ipodTrackByContentHash.get(lookup.fileIndex.contentHash) ?? undefined;
      }

      const lookupTagKey = buildTagKey({
        title: lookup.track.tags.title,
        artist: lookup.track.tags.artist,
        album: lookup.track.tags.album,
        trackNo: lookup.track.tags.trackNo ?? 0,
      });
      const lookupTagSizeKey = buildTagSizeKey({
        title: lookup.track.tags.title,
        artist: lookup.track.tags.artist,
        album: lookup.track.tags.album,
        trackNo: lookup.track.tags.trackNo ?? 0,
        size: !isFlacFile(file.name) ? effectiveFile.size : undefined,
      });
      if (matchedTrackId === undefined) {
        matchedTrackId = ipodTrackByTagSize.get(lookupTagSizeKey) ?? undefined;
      }
      if (!matchedTrackId) {
        const candidates = ipodTrackByTag.get(lookupTagKey);
        if (candidates && candidates.length > 0) {
          if (candidates.length === 1) {
            const candidateId = candidates[0];
            const durationMs = lookup.track.tech?.durationSeconds
              ? Math.round(lookup.track.tech.durationSeconds * 1000)
              : null;
            const ipodTr = ipodTrackById.get(candidateId);
            const durationOk =
              durationMs == null ||
              ipodTr?.tracklen == null ||
              Math.abs((ipodTr.tracklen ?? 0) - durationMs) <= DURATION_MATCH_TOLERANCE_MS;
            if (durationOk) matchedTrackId = candidateId;
          } else {
            let localHash: string | null = null;
            if (typeof effectiveFile.size === "number") {
              localHash = (await hashDeviceFileContent(effectiveFile)) ?? null;
            }
            if (localHash) {
              for (const candidateId of candidates) {
                let hash = ipodHashCache.get(candidateId) ?? null;
                if (hash === null) {
                  const track = ipodTrackById.get(candidateId);
                  if (track?.ipod_path) {
                    hash = await hashIpodTrackFile(ipodHandle, track.ipod_path, paths);
                    ipodHashCache.set(candidateId, hash);
                  }
                }
                if (hash && hash === localHash) {
                  matchedTrackId = candidateId;
                  break;
                }
              }
            }
            if (!matchedTrackId) {
              const durationMs = lookup.track.tech?.durationSeconds
                ? Math.round(lookup.track.tech.durationSeconds * 1000)
                : null;
              if (durationMs) {
                let bestId = candidates[0];
                let bestDiff = Number.POSITIVE_INFINITY;
                for (const id of candidates) {
                  const track = ipodTrackById.get(id);
                  if (!track) continue;
                  const diff = Math.abs((track.tracklen ?? 0) - durationMs);
                  if (diff < bestDiff) {
                    bestDiff = diff;
                    bestId = id;
                  }
                }
                matchedTrackId = bestId;
              } else {
                matchedTrackId = candidates[0];
              }
            }
          }
        }
      }

      if (!matchedTrackId && typeof effectiveFile.size === "number") {
        const candidates = ipodTrackBySize.get(effectiveFile.size) ?? [];
        if (candidates.length > 0) {
          const localHash = await hashDeviceFileContent(effectiveFile);
          if (localHash) {
            for (const candidateId of candidates.slice(0, 5)) {
              let hash = ipodHashCache.get(candidateId) ?? null;
              if (hash === null) {
                const track = ipodTrackById.get(candidateId);
                if (track?.ipod_path) {
                  hash = await hashIpodTrackFile(ipodHandle, track.ipod_path, paths);
                  ipodHashCache.set(candidateId, hash);
                }
              }
              if (hash && hash === localHash) {
                matchedTrackId = candidateId;
                break;
              }
            }
          }
        }
      }

      if (target.onlyReferenceExistingTracks && matchedTrackId === undefined) {
        continue;
      }

      if (typeof matchedTrackId === "number") {
        const ipodTrack = ipodTrackById.get(matchedTrackId);
        if (ipodTrack && metadataNeedsUpdate(lookup, ipodTrack)) {
          const tags = lookup.track.tags;
          const updatePayload = {
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            genre: tags.genres?.[0] || "",
            trackNr: tags.trackNo ?? 0,
            year: tags.year ?? 0,
          };
          if (USE_IPOD_TS_BACKEND && model) {
            const trackIndex = model.tracks.findIndex((t) => t.id === matchedTrackId);
            if (trackIndex >= 0) apiUpdateTrack(model, trackIndex, updatePayload);
          } else {
            wasmUpdateTrack({
              trackIndex: matchedTrackId,
              ...updatePayload,
              rating: -1,
            });
          }
          ipodTrackById.set(matchedTrackId, {
            ...ipodTrack,
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            genre: tags.genres?.[0] || "",
            track_nr: tags.trackNo ?? 0,
            year: tags.year ?? 0,
          });
        }
        if (USE_IPOD_TS_BACKEND && model && ipodTrack?.ipod_path) {
          const relFsPath = paths.toRelFsPathFromIpodDbPath(ipodTrack.ipod_path);
          if (apiHasLongFilename(relFsPath)) {
            try {
              const fileHandle = await getFileHandleFromRelativePath(ipodHandle, relFsPath);
              const fileOnDevice = await fileHandle.getFile();
              const newPath = apiGetMigrationDestPath(model, relFsPath);
              logger.info(`Migrating track to iPod 4-char name: ${relFsPath} -> ${newPath}`);
              await writeFileToIpodRelativePath(ipodHandle, newPath, fileOnDevice);
              const trackIndex = model.tracks.findIndex((t) => t.id === matchedTrackId);
              if (trackIndex >= 0) apiSetTrackPath(model, trackIndex, newPath);
              await deleteFileFromIpodRelativePath(ipodHandle, relFsPath);
              ipodTrack.ipod_path = paths.toIpodDbPathFromRel(newPath) ?? ipodTrack.ipod_path;
              ipodTrackById.set(matchedTrackId, { ...ipodTrack, ipod_path: ipodTrack.ipod_path });
            } catch (migErr) {
              logger.warn("Failed to migrate track to 4-char filename", { relFsPath, error: migErr });
            }
          }
        }
        if (!playlistAddedTrackIds.has(matchedTrackId)) {
            if (playlistIndex !== null) {
              if (USE_IPOD_TS_BACKEND && model) {
                apiPlaylistAddTrack(model, playlistIndex, matchedTrackId);
              } else {
                wasmCall("ipod_playlist_add_track", playlistIndex, matchedTrackId);
              }
            }
          playlistAddedTrackIds.add(matchedTrackId);
        }
        continue;
      }

      const tags = lookup.track.tags;
      const tech = lookup.track.tech;
      let trackIndex: number;
      let destPath: string;
      let relFsPath: string;
      if (USE_IPOD_TS_BACKEND && model) {
        trackIndex = apiAddTrack(model, {
          title: tags.title,
          artist: tags.artist,
          album: tags.album,
          genre: tags.genres?.[0] || "",
          trackNr: tags.trackNo ?? 0,
          year: tags.year ?? 0,
          durationMs: tech?.durationSeconds ? Math.round(tech.durationSeconds * 1000) : undefined,
          sizeBytes: effectiveFile.size,
          filetype: getFiletypeFromName(effectiveFile.name),
        });
        destPath = apiGetTrackDestPath(model, effectiveFile.name);
        relFsPath = destPath;
      } else {
        trackIndex = wasmAddTrack({
          title: tags.title,
          artist: tags.artist,
          album: tags.album,
          genre: tags.genres?.[0] || "",
          trackNr: tags.trackNo ?? 0,
          cdNr: tags.discNo ?? 0,
          year: tags.year ?? 0,
          durationMs: tech?.durationSeconds ? Math.round(tech.durationSeconds * 1000) : undefined,
          bitrateKbps: tech?.bitrate,
          samplerateHz: tech?.sampleRate,
          sizeBytes: effectiveFile.size,
          filetype: getFiletypeFromName(effectiveFile.name),
        });
        if (trackIndex < 0) {
          logger.warn("Failed to add track to iPod", { trackFileId: lookup.track.trackFileId });
          continue;
        }
        const destPathPtr = wasmCallWithStrings("ipod_get_track_dest_path", [effectiveFile.name]);
        if (!destPathPtr) {
          logger.warn("Failed to get iPod destination path");
          continue;
        }
        destPath = wasmGetString(destPathPtr) ?? "";
        wasmCall("ipod_free_string", destPathPtr);
        if (!destPath) {
          logger.warn("Failed to read iPod destination path");
          continue;
        }
        relFsPath = paths.toRelFsPathFromVfs(destPath);
      }

      if (trackIndex < 0) {
        logger.warn("Failed to add track to iPod", { trackFileId: lookup.track.trackFileId });
        continue;
      }

      if (!USE_IPOD_TS_BACKEND) reserveVirtualPath(destPath);
      if (USE_IPOD_TS_BACKEND && model) {
        logger.info(`Writing file to iPod: ${relFsPath}`);
        await writeFileToIpodRelativePath(ipodHandle, relFsPath, effectiveFile);
        logger.info(`Wrote file to iPod: ${relFsPath}`);
        apiFinalizeLastTrackNoStat(model, relFsPath, effectiveFile.size);
      } else {
        logger.info(`Writing file to iPod: ${relFsPath}`);
        await writeFileToIpodRelativePath(ipodHandle, relFsPath, effectiveFile);
        logger.info(`Wrote file to iPod: ${relFsPath}`);
        const finalizeResult = wasmCallWithStrings(
          "ipod_finalize_last_track_no_stat",
          [destPath],
          [effectiveFile.size]
        );
        if (finalizeResult !== 0) {
          const ipodPath = paths.toIpodDbPathFromRel(relFsPath) || "";
          wasmCallWithStrings("ipod_track_set_path", [ipodPath], [trackIndex]);
        }
      }

      const trackIdForMapping = USE_IPOD_TS_BACKEND && model ? model.tracks[trackIndex].id : trackIndex;
      if (!playlistAddedTrackIds.has(trackIdForMapping)) {
          if (playlistIndex !== null) {
            if (USE_IPOD_TS_BACKEND && model) {
              apiPlaylistAddTrack(model, playlistIndex, trackIdForMapping);
            } else {
              wasmCall("ipod_playlist_add_track", playlistIndex, trackIndex);
            }
          }
        playlistAddedTrackIds.add(trackIdForMapping);
      }
      await saveDeviceTrackMapping(
        deviceProfile.id,
        libraryKey,
        trackIdForMapping,
        lookup.track.acoustidId
      );
      const newTrack: IpodTrack =
        USE_IPOD_TS_BACKEND && model
          ? {
              ...(model.tracks[trackIndex] as IpodTrack),
              ipod_path: paths.toIpodDbPathFromRel(relFsPath) || undefined,
            }
          : {
              id: trackIndex,
              title: tags.title,
              artist: tags.artist,
              album: tags.album,
              genre: tags.genres?.[0] || "",
              track_nr: tags.trackNo ?? 0,
              year: tags.year ?? 0,
              size: effectiveFile.size,
              ipod_path: paths.toIpodDbPathFromRel(relFsPath) || undefined,
            };
      ipodTrackById.set(newTrack.id, newTrack);
      const newTagKey = buildTagKey({
        title: newTrack.title,
        artist: newTrack.artist,
        album: newTrack.album,
        trackNo: newTrack.track_nr,
      });
      const newTagSizeKey = buildTagSizeKey({
        title: newTrack.title,
        artist: newTrack.artist,
        album: newTrack.album,
        trackNo: newTrack.track_nr,
        size: newTrack.size,
      });
      ipodTrackByTagSize.set(newTagSizeKey, newTrack.id);
      const newList = ipodTrackByTag.get(newTagKey) ?? [];
      newList.push(newTrack.id);
      ipodTrackByTag.set(newTagKey, newList);
      if (typeof newTrack.size === "number") {
        const sizeList = ipodTrackBySize.get(newTrack.size) ?? [];
        sizeList.push(newTrack.id);
        ipodTrackBySize.set(newTrack.size, sizeList);
      }

      // Artwork: only for models that support it; prefer cache, else extract from file, resize, set on track
      if (artworkSupported) {
        try {
          const libraryRootId = target.libraryRootId;
          const compositeId =
            libraryRootId != null
              ? getCompositeId(lookup.track.trackFileId, libraryRootId)
              : null;
          let jpegBytes: Uint8Array | null = null;
          if (compositeId) {
            const cached = await db.artworkCache.get(compositeId);
            if (cached?.thumbnail) {
              const buf = await cached.thumbnail.arrayBuffer();
              jpegBytes = new Uint8Array(buf);
            }
          }
          if (!jpegBytes?.length) {
            const picture = await extractArtworkFromFile(file);
            if (picture) {
              jpegBytes = await resizeToIpodThumbnail(picture);
            }
          }
          if (jpegBytes && jpegBytes.length > 0) {
            if (USE_IPOD_TS_BACKEND && model) {
              apiSetTrackArtwork(model, trackIndex, jpegBytes);
            } else {
              const artResult = wasmSetTrackArtwork(trackIndex, jpegBytes);
              if (artResult !== 0) {
                logger.debug("Track artwork not set (WASM artwork API may be unavailable)", {
                  trackIndex,
                });
              }
            }
          }
        } catch (err) {
          logger.warn("Failed to extract or set track artwork", { trackFileId: lookup.track.trackFileId, err });
        }
      }
    }

    if (!libraryOnly && target.mirrorMode && desiredKeys && playlistIndex !== null) {
      const playlistTracks =
        USE_IPOD_TS_BACKEND && model
          ? getPlaylistTracks(model, playlistIndex)
          : (wasmGetJson("ipod_get_playlist_tracks_json", playlistIndex) as IpodTrack[] | null);
      if (Array.isArray(playlistTracks)) {
        for (const playlistTrack of playlistTracks) {
          const key = buildTagKey({
            title: playlistTrack.title,
            artist: playlistTrack.artist,
            album: playlistTrack.album,
            trackNo: playlistTrack.track_nr,
          });
          if (!desiredKeys.has(key)) {
            if (USE_IPOD_TS_BACKEND && model) {
              apiPlaylistRemoveTrack(model, playlistIndex, playlistTrack.id);
            } else {
              wasmCall("ipod_playlist_remove_track", playlistIndex, playlistTrack.id);
            }
            if (target.mirrorDeleteFromDevice && playlistTrack.ipod_path) {
              const relFsPath = paths.toRelFsPathFromIpodDbPath(playlistTrack.ipod_path);
              try {
                await deleteFileFromIpodRelativePath(ipodHandle, relFsPath);
              } catch (error) {
                logger.warn("Failed to delete iPod track file", error);
              }
            }
          }
        }
      }
    }
  }

  logger.info("Writing iTunesDB...");
  if (USE_IPOD_TS_BACKEND && model) {
    const iTunesDB = apiWriteITunesDB(model);
    if (!iTunesDB || getLastError()) {
      throw new Error(`Failed to write iTunesDB: ${getLastError() ?? "unknown"}`);
    }
    const roundTrip = parseITunesDBFromBuffer(iTunesDB);
    if (!roundTrip) {
      throw new Error(
        "iTunesDB round-trip parse failed; aborting write to prevent device corruption."
      );
    }
    const expectedTrackCount = model.tracks?.length ?? 0;
    const expectedPlaylistCount = model.playlists?.length ?? 0;
    if (roundTrip.tracks.length !== expectedTrackCount) {
      throw new Error(
        `iTunesDB round-trip track count mismatch (${roundTrip.tracks.length} vs ${expectedTrackCount}); aborting write.`
      );
    }
    if ((roundTrip.playlists ?? []).length !== expectedPlaylistCount) {
      throw new Error(
        "iTunesDB round-trip playlist count mismatch; aborting write."
      );
    }
    const { ArtworkDB, ITHMB } = artworkSupported ? apiWriteArtwork(model) : {};
    if (artworkSupported && (ArtworkDB ?? (ITHMB && ITHMB.size > 0))) {
      logger.info("Serialized artwork (ArtworkDB + ITHMB) for device");
    }
    logger.info("Serialized iTunesDB, writing to device...");
    const syncResult = await withTimeout(
      syncDbToIpodFromBuffers(ipodHandle, {
        iTunesDB,
        ArtworkDB: artworkSupported ? (ArtworkDB ?? undefined) : undefined,
        ITHMB: artworkSupported ? ITHMB : undefined,
      }),
      IPOD_DB_WRITE_TIMEOUT_MS,
      "Writing iTunesDB to device"
    );
    if (!syncResult.ok) {
      throw new Error("Failed to sync iTunesDB to iPod");
    }
    logger.info("Sync complete. Eject the iPod from your system (e.g. Finder) before unplugging.");
    const deviceInfo = getDeviceInfo(model) as IpodSyncResult["deviceInfo"];
    const playlistCount = targets.filter((t) => !t.libraryOnly).length;
    return {
      playlistCount,
      trackCount: totalTracks,
      deviceInfo,
    };
  }

  const writeResult = wasmCallWithError("ipod_write_db");
  if (writeResult !== 0) {
    throw new Error("Failed to write iTunesDB");
  }
  logger.info("Successfully wrote iTunesDB");
  logger.info("Syncing iTunesDB to iPod...");
  const syncResult = await syncDbToIpod(ipodHandle, DEFAULT_MOUNTPOINT);
  if (!syncResult.ok) {
    throw new Error("Failed to sync iTunesDB to iPod");
  }
  logger.info("Sync complete");

  const deviceInfo = wasmGetJson("ipod_get_device_info_json") as IpodSyncResult["deviceInfo"];
  return {
    playlistCount: targets.length,
    trackCount: totalTracks,
    deviceInfo,
  };
}
