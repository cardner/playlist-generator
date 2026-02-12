/**
 * Path similarity and metadata scoring for device path disambiguation.
 * Used when multiple device files share the same filename.
 */

import type { DeviceScanEntry } from "./device-scan";
import type { TrackLookup } from "@/features/playlists/export";

function normalizePathSegments(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .toLowerCase()
    .split("/")
    .filter(Boolean);
}

function pathSimilarityScore(libraryPath: string, devicePath: string): number {
  const libSegs = normalizePathSegments(libraryPath);
  const devSegs = normalizePathSegments(devicePath);
  if (libSegs.length === 0 || devSegs.length === 0) return 0;
  const libSet = new Set(libSegs);
  let matches = 0;
  for (const seg of devSegs) {
    if (libSet.has(seg)) matches += 1;
  }
  return matches / Math.max(libSegs.length, devSegs.length);
}

function metadataScore(
  lookup: TrackLookup,
  devicePath: string
): number {
  const devSegs = normalizePathSegments(devicePath);
  const devLower = devicePath.toLowerCase();
  let score = 0;
  const artist = lookup.track.tags?.artist?.toLowerCase().trim();
  const album = lookup.track.tags?.album?.toLowerCase().trim();
  const title = lookup.track.tags?.title?.toLowerCase().trim();
  if (artist && devLower.includes(artist)) {
    score += 0.4;
  }
  if (album && devLower.includes(album)) {
    score += 0.4;
  }
  if (title && devLower.includes(title)) {
    score += 0.2;
  }
  return score;
}

/**
 * Pick the best device path from candidates using path similarity and metadata.
 *
 * @param lookup Library track lookup
 * @param candidatePaths Device paths that match the filename
 * @returns Best path or undefined if no good match
 */
export function pickBestDevicePath(
  lookup: TrackLookup,
  candidatePaths: string[]
): string | undefined {
  if (candidatePaths.length === 0) return undefined;
  if (candidatePaths.length === 1) return candidatePaths[0];

  const libraryPath = lookup.fileIndex?.relativePath ?? lookup.fileIndex?.name ?? "";
  const PATH_THRESHOLD = 0.2;
  const METADATA_THRESHOLD = 0.2;

  let bestPath: string | undefined;
  let bestScore = 0;

  for (const devicePath of candidatePaths) {
    const pathScore = pathSimilarityScore(libraryPath, devicePath);
    const metaScore = metadataScore(lookup, devicePath);
    const combined = pathScore * 0.6 + metaScore * 0.4;
    if (combined > bestScore && (pathScore >= PATH_THRESHOLD || metaScore >= METADATA_THRESHOLD)) {
      bestScore = combined;
      bestPath = devicePath;
    }
  }

  if (!bestPath && candidatePaths.length > 0) {
    return candidatePaths[0];
  }
  return bestPath;
}

/**
 * Build filename -> paths[] from device scan entries.
 */
export function buildFilenameToPathsMap(
  entries: DeviceScanEntry[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const filename = entry.name.toLowerCase();
    const existing = map.get(filename);
    if (existing) {
      if (!existing.includes(entry.relativePath)) {
        existing.push(entry.relativePath);
      }
    } else {
      map.set(filename, [entry.relativePath]);
    }
  }
  return map;
}

function stripFileExtension(filename: string): string {
  return filename.replace(/\.[a-z0-9]{1,5}$/i, "");
}

export function normalizeFilenameForMatch(filename: string): string {
  return stripFileExtension(filename)
    .toLowerCase()
    .replace(/^[\s._-]*\d{1,3}[\s._-]+/, "")
    .replace(/[\[\](){}]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build normalized filename -> paths[] from device scan entries.
 * Used as fallback when exact filenames differ but represent the same track.
 */
export function buildNormalizedFilenameToPathsMap(
  entries: DeviceScanEntry[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const key = normalizeFilenameForMatch(entry.name);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      if (!existing.includes(entry.relativePath)) {
        existing.push(entry.relativePath);
      }
    } else {
      map.set(key, [entry.relativePath]);
    }
  }
  return map;
}

/**
 * Collect unique device file paths from scan entries.
 */
export function buildUniqueDevicePaths(entries: DeviceScanEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.relativePath)));
}
