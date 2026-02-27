/**
 * Pure TS iPod DB API: replaces WASM surface for parse, model, and write.
 * Use buffers (iTunesDB, SysInfo); no Emscripten FS.
 */

import type { IpodDbModel, IpodTrack, IpodPlaylist, IpodDeviceInfo } from "./db-types";
import { parseITunesDB } from "./itunesdb/parse";
import { serializeITunesDB } from "./itunesdb/serialize";
import { ipodPathToDbFormat } from "./paths-db";
import {
  writeArtwork as writeArtworkImpl,
  type WriteArtworkResult,
} from "./artwork/write-artwork";

/** localStorage key for testing toggle: use TS iPod backend when not "false". */
export const IPOD_TS_BACKEND_STORAGE_KEY = "useIpodTsBackend";

/** When true, use pure TS iPod DB implementation instead of WASM. Default false (WASM). */
export const USE_IPOD_TS_BACKEND = false;

/** Read runtime preference (default WASM). Used by sync to choose TS vs WASM path. */
export function getUseIpodTsBackend(): boolean {
  try {
    if (typeof localStorage === "undefined") return USE_IPOD_TS_BACKEND;
    const v = localStorage.getItem(IPOD_TS_BACKEND_STORAGE_KEY);
    return v === "true";
  } catch {
    return USE_IPOD_TS_BACKEND;
  }
}

/** Set runtime preference for testing (TS backend when true, WASM when false). */
export function setUseIpodTsBackend(value: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(IPOD_TS_BACKEND_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // ignore
  }
}

let lastError: string | null = null;

/** Current model when using TS backend (set after load, used during sync). */
let ipodTsModel: IpodDbModel | null = null;

export function setIpodTsModel(model: IpodDbModel | null): void {
  ipodTsModel = model;
}

export function getIpodTsModel(): IpodDbModel | null {
  return ipodTsModel;
}

function setLastError(msg: string | null): void {
  lastError = msg;
}

export function getLastError(): string | null {
  return lastError;
}

export function createEmptyModel(
  deviceInfo?: IpodDeviceInfo,
  dbversion?: number
): IpodDbModel {
  return {
    dbversion: dbversion ?? 0x0b,
    deviceInfo,
    tracks: [],
    playlists: [{ name: "Library", is_master: true, trackIds: [] }],
  };
}

export function parseITunesDBFromBuffer(buffer: Uint8Array): IpodDbModel | null {
  setLastError(null);
  try {
    return parseITunesDB(buffer);
  } catch (e) {
    setLastError(e instanceof Error ? e.message : String(e));
    return null;
  }
}

export function getDeviceInfo(model: IpodDbModel): IpodDeviceInfo | undefined {
  return model.deviceInfo;
}

export function getTracks(model: IpodDbModel): IpodTrack[] {
  return model.tracks ?? [];
}

export function getPlaylists(model: IpodDbModel): Array<{ name: string; is_master?: boolean }> {
  return (model.playlists ?? []).map((pl) => ({
    name: pl.name,
    is_master: pl.is_master,
  }));
}

export function getPlaylistTracks(
  model: IpodDbModel,
  playlistIndex: number
): IpodTrack[] {
  const playlists = model.playlists ?? [];
  const pl = playlists[playlistIndex];
  if (!pl) return [];
  const tracks = model.tracks ?? [];
  return pl.trackIds
    .map((id) => tracks.find((t) => (t.id ?? 0) === id))
    .filter((t): t is IpodTrack => t != null);
}

export function createPlaylist(model: IpodDbModel, name: string): number {
  const playlists = model.playlists ?? [];
  const idx = playlists.length;
  model.playlists = [...playlists, { name, is_master: false, trackIds: [] }];
  return idx;
}

export function playlistAddTrack(
  model: IpodDbModel,
  playlistIndex: number,
  trackId: number
): void {
  const playlists = model.playlists ?? [];
  const pl = playlists[playlistIndex];
  if (!pl || pl.trackIds.includes(trackId)) return;
  pl.trackIds.push(trackId);
}

export function playlistRemoveTrack(
  model: IpodDbModel,
  playlistIndex: number,
  trackId: number
): void {
  const playlists = model.playlists ?? [];
  const pl = playlists[playlistIndex];
  if (!pl) return;
  pl.trackIds = pl.trackIds.filter((id) => id !== trackId);
}

/** Pick next Music folder (F00..F49) from existing paths to avoid collision */
function nextMusicFolder(model: IpodDbModel): string {
  const used = new Set<number>();
  for (const t of model.tracks ?? []) {
    const p = t.ipod_path ?? "";
    const m = p.match(/Music[:/]F(\d{2})/);
    if (m) used.add(parseInt(m[1], 10));
  }
  for (let i = 0; i < 50; i++) {
    if (!used.has(i)) return `iPod_Control/Music/F${String(i).padStart(2, "0")}`;
  }
  return "iPod_Control/Music/F00";
}

/** Normalize extension: .m4a, .mp3, etc. Default .mp3 if none. */
function getExtension(filename: string): string {
  const match = filename.match(/\.[^.]+$/);
  const ext = match ? match[0].toLowerCase() : ".mp3";
  return ext === "." ? ".mp3" : ext;
}

/** Collect existing file basenames (last path segment) from all tracks. */
function usedBasenames(model: IpodDbModel): Set<string> {
  const set = new Set<string>();
  for (const t of model.tracks ?? []) {
    const p = (t.ipod_path ?? "").trim();
    if (!p) continue;
    const parts = p.split(/[:/]/).filter(Boolean);
    const base = parts[parts.length - 1];
    if (base) set.add(base);
  }
  return set;
}

/** Next 4-char iPod-style base (AAAA, AAAB, ...) so that base+ext is not in used. */
function next4CharBase(used: Set<string>, ext: string): string {
  for (let i = 0; i < 26 * 26 * 26 * 26; i++) {
    const n = i;
    const c = [
      n % 26,
      Math.floor(n / 26) % 26,
      Math.floor(n / 676) % 26,
      Math.floor(n / 17576) % 26,
    ];
    const base = c.map((k) => String.fromCharCode(65 + k)).join("");
    if (!used.has(base + ext)) return base;
  }
  return "AAAA";
}

/**
 * Return destination path for a new track using iPod-style 4-char filenames
 * (e.g. iPod_Control/Music/F06/ABCD.m4a). Required for the device to recognize files.
 */
export function getTrackDestPath(model: IpodDbModel, filename: string): string {
  const folder = nextMusicFolder(model);
  const ext = getExtension(filename);
  const used = usedBasenames(model);
  const base = next4CharBase(used, ext);
  return `${folder}/${base}${ext}`;
}

/** True if the path's basename is not the 4-char iPod style (e.g. long/library name). */
export function hasLongFilename(relFsPath: string): boolean {
  const parts = relFsPath.replace(/^\/+/, "").split("/").filter(Boolean);
  const base = parts[parts.length - 1] ?? "";
  return !/^[A-Z]{4}\.[a-zA-Z0-9]+$/.test(base);
}

/**
 * Return a new path in the same folder as existingPath but with a 4-char basename.
 * Used when migrating existing tracks from long filenames to iPod naming.
 */
export function getMigrationDestPath(model: IpodDbModel, existingRelFsPath: string): string {
  const normalized = existingRelFsPath.replace(/^\/+/, "").trim();
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return existingRelFsPath;
  const folder = parts.slice(0, -1).join("/");
  const ext = getExtension(parts[parts.length - 1] ?? "");
  const used = usedBasenames(model);
  const base = next4CharBase(used, ext);
  return `${folder}/${base}${ext}`;
}

/** Index of the last-added track (for setTrackPath / finalizeLastTrackNoStat) */
let lastAddedTrackIndex = -1;

export function addTrack(
  model: IpodDbModel,
  metadata: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    trackNr?: number;
    year?: number;
    durationMs?: number;
    sizeBytes?: number;
    filetype?: string;
  }
): number {
  const tracks = model.tracks ?? [];
  const id = tracks.length > 0 ? Math.max(...tracks.map((t) => t.id ?? 0)) + 1 : 0;
  const track: IpodTrack = {
    id,
    title: metadata.title ?? "",
    artist: metadata.artist ?? "Unknown Artist",
    album: metadata.album ?? "Unknown Album",
    genre: metadata.genre ?? "",
    track_nr: metadata.trackNr ?? 0,
    year: metadata.year ?? 0,
    tracklen: metadata.durationMs ?? 180000,
    size: metadata.sizeBytes ?? 0,
    ipod_path: undefined,
  };
  model.tracks = [...tracks, track];
  lastAddedTrackIndex = model.tracks.length - 1;
  const lib = model.playlists?.find((p) => p.is_master);
  if (lib) lib.trackIds.push(id);
  return lastAddedTrackIndex;
}

export function updateTrack(
  model: IpodDbModel,
  trackIndex: number,
  metadata: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    trackNr?: number;
    year?: number;
    rating?: number;
  }
): void {
  const tracks = model.tracks ?? [];
  const t = tracks[trackIndex];
  if (!t) return;
  if (metadata.title !== undefined) t.title = metadata.title;
  if (metadata.artist !== undefined) t.artist = metadata.artist;
  if (metadata.album !== undefined) t.album = metadata.album;
  if (metadata.genre !== undefined) t.genre = metadata.genre;
  if (metadata.trackNr !== undefined) t.track_nr = metadata.trackNr;
  if (metadata.year !== undefined) t.year = metadata.year;
}

export function setTrackPath(model: IpodDbModel, trackIndex: number, ipodPath: string): void {
  const tracks = model.tracks ?? [];
  const t = tracks[trackIndex];
  if (t) t.ipod_path = ipodPathToDbFormat(ipodPath);
}

export function finalizeLastTrackNoStat(
  model: IpodDbModel,
  destPath: string,
  sizeBytes: number
): number {
  if (lastAddedTrackIndex < 0) return -1;
  const t = model.tracks?.[lastAddedTrackIndex];
  if (!t) return -1;
  t.ipod_path = ipodPathToDbFormat(destPath);
  t.size = sizeBytes;
  return 0;
}

/**
 * Remove track at index from model (e.g. after failed file write).
 * Also removes the track id from all playlist trackIds.
 */
export function removeTrackByIndex(model: IpodDbModel, trackIndex: number): void {
  const tracks = model.tracks ?? [];
  const t = tracks[trackIndex];
  if (!t) return;
  const id = t.id ?? 0;
  model.tracks = tracks.filter((_, i) => i !== trackIndex);
  for (const pl of model.playlists ?? []) {
    pl.trackIds = pl.trackIds.filter((tid) => tid !== id);
  }
}

export function writeITunesDB(model: IpodDbModel): Uint8Array | null {
  setLastError(null);
  try {
    return serializeITunesDB(model);
  } catch (e) {
    setLastError(e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Set JPEG artwork for a track (in-memory; Phase 6 will persist to ArtworkDB/ITHMB) */
export function setTrackArtwork(
  model: IpodDbModel,
  trackIndex: number,
  jpegBytes: Uint8Array
): number {
  if (!model.artwork) model.artwork = [];
  const existing = model.artwork.find((a) => a.trackIndex === trackIndex);
  const entry = { trackIndex, jpegBytes };
  if (existing) {
    const i = model.artwork.indexOf(existing);
    model.artwork[i] = entry;
  } else {
    model.artwork.push(entry);
  }
  return 0;
}

export type { WriteArtworkResult };

/** Write ArtworkDB and ITHMB buffers from model (Phase 6; may return empty if not implemented). */
export function writeArtwork(model: IpodDbModel): WriteArtworkResult {
  return writeArtworkImpl(model);
}
