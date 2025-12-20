/**
 * Library Summarization for Matching and LLM Payloads
 * 
 * This module provides aggregated statistics and optimized indexes for playlist generation.
 * It analyzes the user's music library to create summaries that can be used for:
 * - Matching tracks based on genre, artist, tempo, and duration
 * - Building LLM payloads for playlist strategy generation
 * - Providing library statistics to the UI
 * 
 * Key Features:
 * - Genre and artist distribution analysis
 * - Tempo bucket classification (slow/medium/fast)
 * - Duration statistics (min, max, average, total)
 * - Recently added tracks tracking
 * - Optimized matching indexes for fast playlist generation
 * 
 * Privacy: Artist counts are only included if privacy settings allow sending track names to LLM.
 * 
 * @module features/library/summarization
 * 
 * @example
 * ```typescript
 * import { getCurrentLibrarySummary, buildMatchingIndex } from '@/features/library/summarization';
 * 
 * // Get library summary
 * const summary = await getCurrentLibrarySummary();
 * console.log(`Library has ${summary.totalTracks} tracks`);
 * 
 * // Build matching index for playlist generation
 * const index = await buildMatchingIndex();
 * const rockTracks = index.byGenre.get('Rock') || [];
 * ```
 */

import type { TrackRecord, ScanRunRecord } from "@/db/schema";
import { getAllTracks, getCurrentLibraryRoot } from "@/db/storage";
import { db } from "@/db/schema";
import type { PlaylistRequest } from "@/types/playlist";
import type { AppSettings } from "@/lib/settings";
import { buildGenreMappings, normalizeGenre } from "@/features/library/genre-normalization";

export interface GenreCount {
  genre: string;
  count: number;
}

export interface ArtistCount {
  artist: string;
  count: number;
}

export type TempoBucket = "slow" | "medium" | "fast" | "unknown";

export interface TempoDistribution {
  slow: number;
  medium: number;
  fast: number;
  unknown: number;
}

export interface DurationStats {
  min: number; // seconds
  max: number; // seconds
  avg: number; // seconds
  total: number; // total seconds
}

export interface LibrarySummary {
  totalTracks: number;
  genreCounts: GenreCount[];
  artistCounts?: ArtistCount[]; // Only included if privacy allows
  tempoDistribution: TempoDistribution;
  durationStats: DurationStats;
  recentlyAdded: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
}

export interface MatchingIndex {
  // Maps normalized genre to array of trackFileIds
  byGenre: Map<string, string[]>;
  
  // Maps artist to array of trackFileIds
  byArtist: Map<string, string[]>;
  
  // Maps tempo bucket to array of trackFileIds
  byTempoBucket: Map<TempoBucket, string[]>;
  
  // Maps duration bucket (in seconds) to array of trackFileIds
  // Buckets: 0-60, 60-180, 180-300, 300-600, 600+
  byDurationBucket: Map<string, string[]>;
  
  // All track IDs for quick lookup
  allTrackIds: Set<string>;
  
  // Track metadata lookup
  trackMetadata: Map<string, {
    genres: string[]; // Original genres
    normalizedGenres: string[]; // Normalized genres
    artist: string;
    duration?: number;
    tempoBucket?: TempoBucket;
  }>;
  
  // Genre normalization mappings
  genreMappings: {
    originalToNormalized: Map<string, string>;
    normalizedToOriginals: Map<string, Set<string>>;
  };
}

export interface LLMPayload {
  request: {
    genres: string[];
    length: {
      type: "minutes" | "tracks";
      value: number;
    };
    mood: string[];
    activity: string[];
    tempo: {
      bucket?: "slow" | "medium" | "fast";
      bpmRange?: { min: number; max: number };
    };
    surprise: number;
  };
  librarySummary: {
    totalTracks: number;
    genreCounts: GenreCount[];
    artistCounts?: ArtistCount[];
    tempoDistribution: TempoDistribution;
    durationStats: DurationStats;
  };
  // Only included if allowSendingTrackNamesToLLM is true
  tracks?: Array<{
    id: string; // trackFileId (no path)
    title?: string;
    artist?: string;
    genre?: string[];
    duration?: number;
  }>;
}

/**
 * Calculate tempo bucket from BPM
 * Note: BPM is not currently extracted from metadata, but structure supports it
 */
function getTempoBucket(bpm?: number): TempoBucket {
  if (typeof bpm !== "number" || isNaN(bpm)) {
    return "unknown";
  }
  if (bpm < 90) return "slow";
  if (bpm < 140) return "medium";
  return "fast";
}

/**
 * Get duration bucket for a track
 */
function getDurationBucket(durationSeconds?: number): string {
  if (typeof durationSeconds !== "number" || isNaN(durationSeconds)) {
    return "unknown";
  }
  if (durationSeconds < 60) return "0-60";
  if (durationSeconds < 180) return "60-180";
  if (durationSeconds < 300) return "180-300";
  if (durationSeconds < 600) return "300-600";
  return "600+";
}

/**
 * Summarize library for a given library root
 */
export async function summarizeLibrary(
  libraryRootId?: string,
  includeArtists: boolean = false
): Promise<LibrarySummary> {
  // Get tracks
  let tracks: TrackRecord[];
  if (libraryRootId) {
    tracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
  } else {
    tracks = await getAllTracks();
  }

  const totalTracks = tracks.length;

  // Genre counts
  const genreMap = new Map<string, number>();
  for (const track of tracks) {
    for (const genre of track.tags.genres) {
      genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
    }
  }
  const genreCounts: GenreCount[] = Array.from(genreMap.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count);

  // Artist counts (only if privacy allows)
  let artistCounts: ArtistCount[] | undefined;
  if (includeArtists) {
    const artistMap = new Map<string, number>();
    for (const track of tracks) {
      const artist = track.tags.artist || "Unknown Artist";
      artistMap.set(artist, (artistMap.get(artist) || 0) + 1);
    }
    artistCounts = Array.from(artistMap.entries())
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Tempo distribution (currently all unknown since BPM not extracted)
  const tempoDistribution: TempoDistribution = {
    slow: 0,
    medium: 0,
    fast: 0,
    unknown: totalTracks, // All unknown until BPM extraction is added
  };

  // Duration stats
  const durations = tracks
    .map((t) => t.tech?.durationSeconds)
    .filter((d): d is number => typeof d === "number" && !isNaN(d));

  let durationStats: DurationStats;
  if (durations.length > 0) {
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const total = durations.reduce((sum, d) => sum + d, 0);
    const avg = total / durations.length;
    durationStats = { min, max, avg, total };
  } else {
    durationStats = { min: 0, max: 0, avg: 0, total: 0 };
  }

  // Recently added counts (based on updatedAt timestamps)
  const now = Date.now();
  const last24Hours = now - 24 * 60 * 60 * 1000;
  const last7Days = now - 7 * 24 * 60 * 60 * 1000;
  const last30Days = now - 30 * 24 * 60 * 60 * 1000;

  let last24HoursCount = 0;
  let last7DaysCount = 0;
  let last30DaysCount = 0;

  for (const track of tracks) {
    const updatedAt = track.updatedAt;
    if (updatedAt >= last24Hours) last24HoursCount++;
    if (updatedAt >= last7Days) last7DaysCount++;
    if (updatedAt >= last30Days) last30DaysCount++;
  }

  return {
    totalTracks,
    genreCounts,
    artistCounts,
    tempoDistribution,
    durationStats,
    recentlyAdded: {
      last24Hours: last24HoursCount,
      last7Days: last7DaysCount,
      last30Days: last30DaysCount,
    },
  };
}

/**
 * Build optimized matching index for fast scoring
 */
export async function buildMatchingIndex(
  libraryRootId?: string
): Promise<MatchingIndex> {
  // Get tracks
  let tracks: TrackRecord[];
  if (libraryRootId) {
    tracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
  } else {
    tracks = await getAllTracks();
  }

  // Build genre normalization mappings
  const { originalToNormalized, normalizedToOriginals } = buildGenreMappings(tracks);

  const byGenre = new Map<string, string[]>();
  const byArtist = new Map<string, string[]>();
  const byTempoBucket = new Map<TempoBucket, string[]>();
  const byDurationBucket = new Map<string, string[]>();
  const allTrackIds = new Set<string>();
  const trackMetadata = new Map<
    string,
    {
      genres: string[];
      normalizedGenres: string[];
      artist: string;
      duration?: number;
      tempoBucket?: TempoBucket;
    }
  >();

  // Initialize tempo buckets
  byTempoBucket.set("slow", []);
  byTempoBucket.set("medium", []);
  byTempoBucket.set("fast", []);
  byTempoBucket.set("unknown", []);

  for (const track of tracks) {
    const trackFileId = track.trackFileId;
    allTrackIds.add(trackFileId);

    // Normalize genres for this track
    const normalizedGenres = track.tags.genres.map((g) => {
      return originalToNormalized.get(g) || normalizeGenre(g);
    });

    // Index by normalized genre (aggregate all original variations)
    for (const normalizedGenre of normalizedGenres) {
      if (!byGenre.has(normalizedGenre)) {
        byGenre.set(normalizedGenre, []);
      }
      // Only add if not already in the list (avoid duplicates)
      const genreTracks = byGenre.get(normalizedGenre)!;
      if (!genreTracks.includes(trackFileId)) {
        genreTracks.push(trackFileId);
      }
    }

    // Index by artist
    const artist = track.tags.artist || "Unknown Artist";
    if (!byArtist.has(artist)) {
      byArtist.set(artist, []);
    }
    byArtist.get(artist)!.push(trackFileId);

    // Index by tempo bucket (use stored BPM if available)
    const tempoBucket = getTempoBucket(track.tech?.bpm);
    byTempoBucket.get(tempoBucket)!.push(trackFileId);

    // Index by duration bucket
    const duration = track.tech?.durationSeconds;
    const durationBucket = getDurationBucket(duration);
    if (!byDurationBucket.has(durationBucket)) {
      byDurationBucket.set(durationBucket, []);
    }
    byDurationBucket.get(durationBucket)!.push(trackFileId);

    // Store metadata with both original and normalized genres
    trackMetadata.set(trackFileId, {
      genres: track.tags.genres, // Original genres
      normalizedGenres, // Normalized genres
      artist: track.tags.artist || "Unknown Artist",
      duration,
      tempoBucket, // Calculated from track.tech?.bpm
    });
  }

  return {
    byGenre,
    byArtist,
    byTempoBucket,
    byDurationBucket,
    allTrackIds,
    trackMetadata,
    genreMappings: {
      originalToNormalized,
      normalizedToOriginals,
    },
  };
}

/**
 * Build LLM payload with privacy controls
 */
export function buildLLMPayload(
  request: PlaylistRequest,
  summary: LibrarySummary,
  settings: AppSettings
): LLMPayload {
  const payload: LLMPayload = {
    request: {
      genres: request.genres,
      length: request.length,
      mood: request.mood,
      activity: request.activity,
      tempo: request.tempo,
      surprise: request.surprise,
    },
    librarySummary: {
      totalTracks: summary.totalTracks,
      genreCounts: summary.genreCounts,
      tempoDistribution: summary.tempoDistribution,
      durationStats: summary.durationStats,
    },
  };

  // Include artist counts only if privacy allows
  if (summary.artistCounts) {
    payload.librarySummary.artistCounts = summary.artistCounts;
  }

  // Include track details only if explicitly enabled
  if (settings.allowSendingTrackNamesToLLM) {
    // Note: This would require loading tracks, but we'll keep it minimal
    // In practice, you'd load tracks here and include them
    payload.tracks = []; // Placeholder - would be populated with actual tracks
  }

  return payload;
}

/**
 * Get library summary for current library root
 * 
 * @param includeArtists Whether to include artist counts (privacy-sensitive)
 * @param libraryRootId Optional library root ID to summarize. If not provided, uses current collection.
 */
export async function getCurrentLibrarySummary(
  includeArtists: boolean = false,
  libraryRootId?: string
): Promise<LibrarySummary> {
  if (libraryRootId) {
    return summarizeLibrary(libraryRootId, includeArtists);
  }
  const root = await getCurrentLibraryRoot();
  return summarizeLibrary(root?.id, includeArtists);
}

