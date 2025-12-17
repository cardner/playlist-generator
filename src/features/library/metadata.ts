/**
 * Metadata extraction and normalization
 * 
 * Handles parsing audio file metadata and normalizing tags
 */

import type { LibraryFile } from "@/lib/library-selection";

/**
 * Normalized metadata tags
 */
export interface NormalizedTags {
  title: string;
  artist: string;
  album: string;
  genres: string[];
  year?: number;
  trackNo?: number;
  discNo?: number;
}

/**
 * Technical information about the audio file
 */
export interface TechInfo {
  durationSeconds?: number;
  codec?: string;
  container?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
}

/**
 * Metadata parsing result
 */
export interface MetadataResult {
  trackFileId: string;
  tags?: NormalizedTags;
  tech?: TechInfo;
  warnings?: string[];
  error?: string;
}

/**
 * Worker message types
 */
export interface MetadataWorkerRequest {
  trackFileId: string;
  file: File;
}

export interface MetadataWorkerResponse {
  trackFileId: string;
  tags?: NormalizedTags;
  tech?: TechInfo;
  warnings?: string[];
  error?: string;
}

/**
 * Normalize title - fallback to filename without extension
 */
export function normalizeTitle(title: string | undefined, filename: string): string {
  if (title && title.trim()) {
    return title.trim();
  }
  // Remove extension from filename
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  return nameWithoutExt.trim() || filename;
}

/**
 * Normalize artist string
 */
export function normalizeArtist(artist: string | undefined): string {
  if (!artist || !artist.trim()) {
    return "Unknown Artist";
  }
  return artist.trim();
}

/**
 * Normalize album string
 */
export function normalizeAlbum(album: string | undefined): string {
  if (!album || !album.trim()) {
    return "Unknown Album";
  }
  return album.trim();
}

/**
 * Normalize genres - deduplicate and trim
 */
export function normalizeGenres(genres: string[] | string | undefined): string[] {
  if (!genres) {
    return [];
  }

  const genreArray = Array.isArray(genres) ? genres : [genres];
  const normalized = genreArray
    .map((g) => (typeof g === "string" ? g.trim() : String(g).trim()))
    .filter((g) => g.length > 0);

  // Deduplicate (case-insensitive)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const genre of normalized) {
    const lower = genre.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(genre);
    }
  }

  return unique;
}

/**
 * Normalize year - safely coerce to number
 */
export function normalizeYear(year: number | string | undefined): number | undefined {
  if (year === undefined || year === null) {
    return undefined;
  }

  if (typeof year === "number") {
    // Sanity check: year should be reasonable
    if (year >= 1900 && year <= 2100) {
      return Math.floor(year);
    }
    return undefined;
  }

  if (typeof year === "string") {
    const parsed = parseInt(year, 10);
    if (!isNaN(parsed) && parsed >= 1900 && parsed <= 2100) {
      return parsed;
    }
  }

  return undefined;
}

/**
 * Normalize track number
 */
export function normalizeTrackNo(
  trackNo: number | { no: number | null; of?: number | null } | undefined | null
): number | undefined {
  if (trackNo === undefined || trackNo === null) {
    return undefined;
  }

  if (typeof trackNo === "number") {
    return trackNo > 0 ? Math.floor(trackNo) : undefined;
  }

  if (typeof trackNo === "object" && "no" in trackNo) {
    const no = trackNo.no;
    if (no !== null && no !== undefined && no > 0) {
      return Math.floor(no);
    }
  }

  return undefined;
}

/**
 * Normalize disc number
 */
export function normalizeDiscNo(
  discNo: number | { no: number | null; of?: number | null } | undefined | null
): number | undefined {
  if (discNo === undefined || discNo === null) {
    return undefined;
  }

  if (typeof discNo === "number") {
    return discNo > 0 ? Math.floor(discNo) : undefined;
  }

  if (typeof discNo === "object" && "no" in discNo) {
    const no = discNo.no;
    if (no !== null && no !== undefined && no > 0) {
      return Math.floor(no);
    }
  }

  return undefined;
}

/**
 * Extract codec and container info from format
 */
export function extractCodecInfo(format: any): { codec?: string; container?: string } {
  const codec = format.codec || format.codecProfile || format.codecName;
  const container = format.container || format.format;

  return {
    codec: codec ? String(codec).toLowerCase() : undefined,
    container: container ? String(container).toLowerCase() : undefined,
  };
}

