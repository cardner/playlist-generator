/**
 * Spotify Track Matching
 * 
 * Fuzzy matching algorithm to match Spotify tracks to local files.
 * Uses artist name, track title, and optionally album name for matching.
 * 
 * @module features/spotify-import/matching
 */

import type { TrackRecord } from "@/db/schema";
import type { SpotifyTrack } from "./types";
import { logger } from "@/lib/logger";

/**
 * Match result with confidence score
 */
export interface MatchResult {
  /** Spotify track being matched */
  spotifyTrack: SpotifyTrack;
  /** Matched local track (if found) */
  localTrack?: TrackRecord;
  /** Confidence score (0-1, where 1 is exact match) */
  confidence: number;
  /** Type of match */
  matchType: "exact" | "fuzzy" | "none";
}

/**
 * Normalize string for comparison
 * 
 * Removes special characters, converts to lowercase, and trims whitespace.
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9\s]/g, "") // Remove special characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 * 
 * Returns a similarity score (0-1) where 1 is identical.
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  const distance = matrix[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
}

/**
 * Match a single Spotify track to local tracks
 * 
 * @param spotifyTrack - Spotify track to match
 * @param localTracks - Array of local tracks to search
 * @param minConfidence - Minimum confidence threshold (default: 0.7)
 * @returns Match result with best match
 */
export function matchSpotifyTrack(
  spotifyTrack: SpotifyTrack,
  localTracks: TrackRecord[],
  minConfidence: number = 0.7
): MatchResult {
  let bestMatch: MatchResult = {
    spotifyTrack,
    confidence: 0,
    matchType: "none",
  };

  const spotifyArtist = normalizeString(spotifyTrack.artist);
  const spotifyTitle = normalizeString(spotifyTrack.track);
  const spotifyAlbum = spotifyTrack.album ? normalizeString(spotifyTrack.album) : null;

  for (const localTrack of localTracks) {
    // Skip Spotify tracks (only match to local files)
    if (localTrack.source === "spotify") {
      continue;
    }

    const localArtist = normalizeString(localTrack.tags.artist);
    const localTitle = normalizeString(localTrack.tags.title);
    const localAlbum = localTrack.tags.album ? normalizeString(localTrack.tags.album) : null;

    // Calculate similarity scores
    const artistSimilarity = levenshteinSimilarity(spotifyArtist, localArtist);
    const titleSimilarity = levenshteinSimilarity(spotifyTitle, localTitle);
    const albumSimilarity =
      spotifyAlbum && localAlbum ? levenshteinSimilarity(spotifyAlbum, localAlbum) : 0.5; // Neutral if missing

    // Weighted confidence score
    // Artist and title are most important
    let confidence = (artistSimilarity * 0.4 + titleSimilarity * 0.5);
    
    // Boost confidence if album matches
    if (spotifyAlbum && localAlbum && albumSimilarity > 0.8) {
      confidence += 0.1;
    }

    // Exact match bonus
    if (artistSimilarity === 1.0 && titleSimilarity === 1.0) {
      confidence = 1.0;
    }

    if (confidence > bestMatch.confidence) {
      bestMatch = {
        spotifyTrack,
        localTrack,
        confidence,
        matchType:
          confidence === 1.0 ? "exact" : confidence >= minConfidence ? "fuzzy" : "none",
      };
    }
  }

  return bestMatch;
}

/**
 * Match multiple Spotify tracks to local tracks
 * 
 * @param spotifyTracks - Array of Spotify tracks to match
 * @param localTracks - Array of local tracks to search
 * @param minConfidence - Minimum confidence threshold (default: 0.7)
 * @returns Array of match results
 */
export function matchSpotifyTracks(
  spotifyTracks: SpotifyTrack[],
  localTracks: TrackRecord[],
  minConfidence: number = 0.7
): MatchResult[] {
  return spotifyTracks.map((track) => matchSpotifyTrack(track, localTracks, minConfidence));
}

/**
 * Get match statistics
 * 
 * @param matches - Array of match results
 * @returns Statistics about matches
 */
export function getMatchStatistics(matches: MatchResult[]): {
  total: number;
  exact: number;
  fuzzy: number;
  none: number;
  averageConfidence: number;
} {
  const total = matches.length;
  const exact = matches.filter((m) => m.matchType === "exact").length;
  const fuzzy = matches.filter((m) => m.matchType === "fuzzy").length;
  const none = matches.filter((m) => m.matchType === "none").length;
  const averageConfidence =
    matches.reduce((sum, m) => sum + m.confidence, 0) / total || 0;

  return {
    total,
    exact,
    fuzzy,
    none,
    averageConfidence,
  };
}

