/**
 * Metadata Extraction and Normalization
 * 
 * This module handles parsing audio file metadata and normalizing tags to ensure
 * consistent data formats across different file types and metadata sources.
 * 
 * Key Features:
 * - Normalizes tags (title, artist, album, genres, year, track numbers)
 * - Extracts technical information (duration, codec, bitrate, BPM)
 * - Handles missing or malformed metadata gracefully
 * - Provides fallback values for missing data
 * 
 * @module features/library/metadata
 * 
 * @example
 * ```typescript
 * import { normalizeTitle, normalizeArtist, normalizeGenres } from '@/features/library/metadata';
 * 
 * const title = normalizeTitle(metadata.title, filename);
 * const artist = normalizeArtist(metadata.artist);
 * const genres = normalizeGenres(metadata.genre);
 * ```
 */

import type { LibraryFile } from "@/lib/library-selection";

/**
 * Normalized metadata tags
 * 
 * Represents standardized metadata tags extracted from audio files.
 * All fields are normalized to ensure consistency across the application.
 * 
 * @example
 * ```typescript
 * const tags: NormalizedTags = {
 *   title: "Bohemian Rhapsody",
 *   artist: "Queen",
 *   album: "A Night at the Opera",
 *   genres: ["Rock", "Progressive Rock"],
 *   year: 1975,
 *   trackNo: 1,
 *   discNo: 1
 * };
 * ```
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
 * 
 * Contains technical metadata extracted from the audio file, including
 * codec information, audio properties, and optionally detected tempo (BPM).
 * 
 * @example
 * ```typescript
 * const tech: TechInfo = {
 *   durationSeconds: 355,
 *   codec: "mp3",
 *   container: "mp3",
 *   bitrate: 320,
 *   sampleRate: 44100,
 *   channels: 2,
 *   bpm: 72
 * };
 * ```
 */
export interface TechInfo {
  durationSeconds?: number;
  codec?: string;
  container?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  bpm?: number; // Beats per minute (tempo)
  bpmConfidence?: number; // Confidence score 0-1
  bpmSource?: 'id3' | 'local-file' | 'itunes-preview' | 'manual'; // Source of BPM data
  bpmMethod?: 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined'; // Detection method used
}

/**
 * Metadata parsing result
 * 
 * Represents the result of parsing metadata from an audio file.
 * Includes normalized tags, technical information, and any warnings or errors.
 * acoustidId is set when the file has AcoustID in its tags (for transcode-safe device matching).
 * 
 * @example
 * ```typescript
 * const result: MetadataResult = {
 *   trackFileId: "file123",
 *   tags: { title: "Song", artist: "Artist", album: "Album", genres: [] },
 *   tech: { durationSeconds: 240 },
 *   warnings: ["Missing year information"]
 * };
 * ```
 */
export interface MetadataResult {
  trackFileId: string;
  tags?: NormalizedTags;
  tech?: TechInfo;
  isrc?: string;
  /** AcoustID from file tags when present (for iPod/device matching across transcodes) */
  acoustidId?: string;
  /** Embedded cover art (transferable from worker); used for artwork cache and UI */
  picture?: { format: string; data: ArrayBuffer };
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
  isrc?: string;
  acoustidId?: string;
  /** Embedded cover art (transferable); used for artwork cache and UI */
  picture?: { format: string; data: ArrayBuffer };
  warnings?: string[];
  error?: string;
}

/**
 * Normalize title - fallback to filename without extension
 * 
 * Normalizes track title, falling back to filename (without extension) if title is missing.
 * Trims whitespace and ensures a non-empty string is returned.
 * 
 * @param title - Track title from metadata (may be undefined)
 * @param filename - Filename as fallback
 * @returns Normalized title string
 * 
 * @example
 * ```typescript
 * normalizeTitle("  Song Title  ", "track.mp3") // Returns: "Song Title"
 * normalizeTitle(undefined, "My Song.mp3") // Returns: "My Song"
 * ```
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
 * 
 * Normalizes artist name, returning "Unknown Artist" if missing or empty.
 * Trims whitespace and ensures a non-empty string is returned.
 * 
 * @param artist - Artist name from metadata (may be undefined)
 * @returns Normalized artist string (never empty)
 * 
 * @example
 * ```typescript
 * normalizeArtist("  The Beatles  ") // Returns: "The Beatles"
 * normalizeArtist(undefined) // Returns: "Unknown Artist"
 * ```
 */
export function normalizeArtist(artist: string | undefined): string {
  if (!artist || !artist.trim()) {
    return "Unknown Artist";
  }
  return artist.trim();
}

/**
 * Normalize album string
 * 
 * Normalizes album name, returning "Unknown Album" if missing or empty.
 * Trims whitespace and ensures a non-empty string is returned.
 * 
 * @param album - Album name from metadata (may be undefined)
 * @returns Normalized album string (never empty)
 * 
 * @example
 * ```typescript
 * normalizeAlbum("  Abbey Road  ") // Returns: "Abbey Road"
 * normalizeAlbum(undefined) // Returns: "Unknown Album"
 * ```
 */
export function normalizeAlbum(album: string | undefined): string {
  if (!album || !album.trim()) {
    return "Unknown Album";
  }
  return album.trim();
}

/**
 * Normalize ISRC (International Standard Recording Code)
 *
 * ISRCs must be exactly 12 alphanumeric characters in format: CC-XXX-YY-NNNNN
 * - CC: 2-letter country code
 * - XXX: 3-character registrant code
 * - YY: 2-digit year
 * - NNNNN: 5-digit designation code
 * 
 * Hyphens are optional and stripped during normalization.
 * Returns undefined for invalid ISRCs to prevent incorrect cross-collection matching.
 */
export function normalizeIsrc(isrc?: string | string[] | null): string | undefined {
  if (!isrc) return undefined;
  const value = Array.isArray(isrc) ? isrc[0] : isrc;
  if (!value) return undefined;
  
  // Trim and convert to uppercase first
  const trimmed = value.trim().toUpperCase();
  
  // Remove only hyphens (hyphens are optional in ISRC format)
  const normalized = trimmed.replace(/-/g, '');
  
  // ISRC must be exactly 12 alphanumeric characters
  if (normalized.length !== 12) return undefined;
  if (!/^[A-Z0-9]{12}$/.test(normalized)) return undefined;
  
  return normalized;
}

/** Known tag names for AcoustID across formats (ID3, iTunes, Vorbis, etc.) */
const ACOUSTID_TAG_KEYS = [
  "acoustid id",
  "acoustid_id",
  "acoustid fingerprint",
  "acoustid_fingerprint",
];

/**
 * Extract AcoustID from music-metadata result (common or native format-specific tags).
 * Tries metadata.common first, then scans metadata.native for known AcoustID keys.
 * Accepts IAudioMetadata or any object with common/native shape.
 */
export function extractAcoustId(metadata: unknown): string | string[] | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const m = metadata as Record<string, unknown>;
  const common = m.common as Record<string, unknown> | undefined;
  if (common && typeof common === "object") {
    const fromCommon =
      (common.acoustidId as string | undefined) ??
      (common.acoustid_id as string | undefined);
    if (fromCommon) return fromCommon;
  }
  const native = m.native as Record<string, Record<string, unknown[]>> | undefined;
  if (!native || typeof native !== "object") return undefined;
  for (const formatTags of Object.values(native)) {
    if (!formatTags || typeof formatTags !== "object") continue;
    for (const [key, value] of Object.entries(formatTags)) {
      const keyLower = String(key).toLowerCase();
      if (
        ACOUSTID_TAG_KEYS.some((k) => keyLower.includes(k)) &&
        Array.isArray(value) &&
        value.length > 0
      ) {
        const first = value[0];
        if (typeof first === "string" && first.trim()) return first;
        if (first != null) return String(first).trim() || undefined;
      }
    }
  }
  return undefined;
}

/**
 * Normalize AcoustID to a single trimmed string (for storage and matching).
 * Accepts string or array (takes first element).
 */
export function normalizeAcoustId(
  value?: string | string[] | null
): string | undefined {
  if (!value) return undefined;
  const single = Array.isArray(value) ? value[0] : value;
  if (single == null) return undefined;
  const trimmed = String(single).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalize genres - deduplicate and trim
 * 
 * Normalizes genre tags by:
 * - Converting single strings to arrays
 * - Trimming whitespace
 * - Removing empty genres
 * - Deduplicating (case-insensitive)
 * 
 * @param genres - Genre tags (string, array, or undefined)
 * @returns Array of normalized, unique genre strings
 * 
 * @example
 * ```typescript
 * normalizeGenres("Rock, Pop") // Returns: ["Rock", "Pop"]
 * normalizeGenres(["Rock", "rock", "Pop"]) // Returns: ["Rock", "Pop"]
 * normalizeGenres(undefined) // Returns: []
 * ```
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
 * 
 * Validates and normalizes year values. Only accepts years between 1900 and 2099.
 * Returns undefined for invalid or out-of-range values.
 * 
 * @param year - Year value (number, string, or undefined)
 * @returns Normalized year number (1900-2099) or undefined
 * 
 * @example
 * ```typescript
 * normalizeYear(1975) // Returns: 1975
 * normalizeYear("1980") // Returns: 1980
 * normalizeYear(1800) // Returns: undefined (out of range)
 * normalizeYear("invalid") // Returns: undefined
 * ```
 */
export function normalizeYear(year: number | string | undefined): number | undefined {
  if (year === undefined || year === null) {
    return undefined;
  }

  if (typeof year === "number") {
    // Sanity check: year should be reasonable
    if (year >= 1900 && year <= 2099) {
      return Math.floor(year);
    }
    return undefined;
  }

  if (typeof year === "string") {
    const parsed = parseInt(year, 10);
    if (!isNaN(parsed) && parsed >= 1900 && parsed <= 2099) {
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

/**
 * Enhanced metadata from MusicBrainz API and audio analysis
 * 
 * Contains enriched metadata that supplements the basic tags extracted from audio files.
 * This includes genres from MusicBrainz, similar artists, tempo/BPM from audio analysis,
 * mood tags, and manual edits made by the user.
 * 
 * @example
 * ```typescript
 * const enhanced: EnhancedMetadata = {
 *   genres: ["Rock", "Progressive Rock"],
 *   similarArtists: ["Led Zeppelin", "Pink Floyd"],
 *   tempo: 120,
 *   mood: ["energetic", "uplifting"],
 *   musicbrainzTags: ["classic rock", "progressive"],
 *   manualEditDate: Date.now(),
 *   manualFields: ["genres", "tempo"]
 * };
 * ```
 */
export interface EnhancedMetadata {
  /** Enhanced genres from MusicBrainz or manual edits */
  genres?: string[];
  /** Related artists from MusicBrainz */
  similarArtists?: string[];
  /** BPM detected via audio analysis or manual input (number), or tempo category (string) */
  tempo?: number | "slow" | "medium" | "fast";
  /** Mood tags (manual edits or future acoustic analysis) */
  mood?: string[];
  /** Activity tags (manual edits or inferred from audio/metadata) */
  activity?: string[];
  /** Additional tags from MusicBrainz */
  musicbrainzTags?: string[];
  /** Release year from MusicBrainz */
  musicbrainzReleaseYear?: number;
  /** Duration (seconds) from MusicBrainz */
  musicbrainzDurationSeconds?: number;
  /** Timestamp when manual edits were last made */
  manualEditDate?: number;
  /** Array of field names that were manually edited (e.g., ['genres', 'tempo']) */
  manualFields?: string[];
}

