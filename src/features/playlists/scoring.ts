/**
 * Track Scoring Functions
 * 
 * This module contains all scoring calculation functions used to evaluate
 * how well tracks match playlist requirements. Each function returns a score
 * (0-1) and reasons explaining the score.
 * 
 * @module features/playlists/scoring
 */

import type { TrackRecord } from "@/db/schema";
import type { PlaylistRequest } from "@/types/playlist";
import type { PlaylistStrategy } from "./strategy";
import type { MatchingIndex } from "@/features/library/summarization";
import { normalizeGenre } from "@/features/library/genre-normalization";
import type { TrackReason } from "./matching-engine";

/**
 * Calculate genre match score (hard/soft matching)
 * 
 * Uses normalized genres for matching. Supports both exact matches (hard)
 * and partial/substring matches (soft). Applies penalties for missing
 * required genres from strategy.
 * 
 * @param track - Track to score
 * @param requestedGenres - Genres requested by user
 * @param strategy - Playlist strategy (may contain required genres)
 * @param matchingIndex - Matching index with normalized genre metadata
 * @returns Score (0-1) and reasons for the score
 * 
 * @example
 * ```typescript
 * const result = calculateGenreMatch(track, ["rock", "indie"], strategy, index);
 * // Returns: { score: 0.8, reasons: [{ type: "genre_match", ... }] }
 * ```
 */
export function calculateGenreMatch(
  track: TrackRecord,
  requestedGenres: string[],
  strategy: PlaylistStrategy,
  matchingIndex: MatchingIndex
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  let score = 0;

  if (requestedGenres.length === 0) {
    return { score: 1, reasons: [] };
  }

  // Normalize requested genres
  const normalizedRequested = requestedGenres.map((g) => normalizeGenre(g));
  const normalizedRequestedLower = normalizedRequested.map((g) => g.toLowerCase());

  // Get normalized genres for this track from metadata
  const trackMetadata = matchingIndex.trackMetadata.get(track.trackFileId);
  const trackNormalizedGenres = trackMetadata?.normalizedGenres || 
    track.tags.genres.map((g) => normalizeGenre(g));
  const trackNormalizedLower = trackNormalizedGenres.map((g) => g.toLowerCase());

  // Hard match: exact normalized genre match
  const exactMatches = trackNormalizedLower.filter((tg) =>
    normalizedRequestedLower.includes(tg)
  );
  if (exactMatches.length > 0) {
    score = exactMatches.length / normalizedRequested.length;
    // Get display names for matched genres
    const matchedGenres = exactMatches.map((lower) => {
      const normalized = trackNormalizedGenres.find((g) => g.toLowerCase() === lower);
      return normalized || lower;
    });
    reasons.push({
      type: "genre_match",
      explanation: `Matches ${exactMatches.length} requested genre(s): ${matchedGenres.join(", ")}`,
      score: 1.0,
    });
  } else {
    // Soft match: partial/substring match on normalized genres
    const partialMatches = trackNormalizedLower.filter((tg) =>
      normalizedRequestedLower.some((rg) => tg.includes(rg) || rg.includes(tg))
    );
    if (partialMatches.length > 0) {
      score = (partialMatches.length / normalizedRequested.length) * 0.7;
      const matchedGenres = partialMatches.map((lower) => {
        const normalized = trackNormalizedGenres.find((g) => g.toLowerCase() === lower);
        return normalized || lower;
      });
      reasons.push({
        type: "genre_match",
        explanation: `Partial genre match: ${matchedGenres.join(", ")}`,
        score: 0.7,
      });
    } else {
      score = 0;
    }
  }

  // Check against required genres in strategy (normalized)
  if (strategy.constraints.requiredGenres) {
    const requiredNormalized = strategy.constraints.requiredGenres.map((g) =>
      normalizeGenre(g).toLowerCase()
    );
    const hasRequired = trackNormalizedLower.some((tg) => requiredNormalized.includes(tg));
    if (!hasRequired) {
      score *= 0.3; // Heavy penalty for missing required genres
      reasons.push({
        type: "constraint",
        explanation: "Missing required genre",
        score: 0.3,
      });
    }
  }

  return { score, reasons };
}

/**
 * Calculate tempo match score
 * 
 * Scores tracks based on tempo bucket matching (slow/medium/fast) and
 * optionally BPM range matching. Considers strategy tempo guidance.
 * 
 * @param track - Track to score
 * @param request - Playlist request (contains tempo specification)
 * @param strategy - Playlist strategy (may contain tempo guidance)
 * @param matchingIndex - Matching index with tempo bucket metadata
 * @returns Score (0-1) and reasons for the score
 * 
 * @example
 * ```typescript
 * const result = calculateTempoMatch(track, request, strategy, index);
 * // Returns: { score: 1.0, reasons: [{ type: "tempo_match", ... }] }
 * ```
 */
export function calculateTempoMatch(
  track: TrackRecord,
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  matchingIndex: MatchingIndex
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  let score = 0.5; // Default neutral

  const trackTempoBucket =
    matchingIndex.trackMetadata.get(track.trackFileId)?.tempoBucket ||
    "unknown";

  // Match tempo bucket
  if (request.tempo.bucket) {
    if (trackTempoBucket === request.tempo.bucket) {
      score = 1.0;
      reasons.push({
        type: "tempo_match",
        explanation: `Matches tempo bucket: ${request.tempo.bucket}`,
        score: 1.0,
      });
    } else if (trackTempoBucket === "unknown") {
      score = 0.5; // Neutral for unknown
    } else {
      score = 0.2; // Low score for wrong tempo
    }
  }

  // Match BPM range if specified
  if (request.tempo.bpmRange) {
    const { min, max } = request.tempo.bpmRange;
    const trackBpm = track.tech?.bpm;
    if (typeof trackBpm === "number") {
      if (trackBpm >= min && trackBpm <= max) {
        score = Math.max(score, 1.0);
        reasons.push({
          type: "tempo_match",
          explanation: `Matches BPM range: ${min}-${max}`,
          score: 1.0,
        });
      } else {
        score = Math.max(score, 0.2);
      }
    } else if (trackTempoBucket === "unknown") {
      score = 0.5;
    }
  }

  // Check strategy tempo guidance
  if (strategy.tempoGuidance.targetBucket) {
    if (trackTempoBucket === strategy.tempoGuidance.targetBucket) {
      score = Math.max(score, 0.9);
    } else if (
      strategy.tempoGuidance.allowVariation &&
      trackTempoBucket !== "unknown"
    ) {
      score = Math.max(score, 0.6); // Allow some variation
    }
  }

  return { score, reasons };
}

/**
 * Calculate duration fit score
 * 
 * Scores tracks based on how well their duration fits the remaining
 * playlist duration. Tracks that match the average remaining duration
 * get higher scores.
 * 
 * @param track - Track to score
 * @param targetDuration - Target total playlist duration in seconds
 * @param currentDuration - Current playlist duration in seconds
 * @param remainingSlots - Number of remaining track slots
 * @returns Score (0-1) and reasons for the score
 * 
 * @example
 * ```typescript
 * const result = calculateDurationFit(track, 3600, 1800, 10);
 * // Returns: { score: 0.9, reasons: [{ type: "duration_fit", ... }] }
 * ```
 */
export function calculateDurationFit(
  track: TrackRecord,
  targetDuration: number, // seconds
  currentDuration: number, // seconds
  remainingSlots: number
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  const trackDuration = track.tech?.durationSeconds || 180; // Default 3 min
  const newDuration = currentDuration + trackDuration;
  const remainingDuration = targetDuration - currentDuration;
  const avgRemaining = remainingDuration / Math.max(remainingSlots, 1);

  // Score based on how well this track fits the remaining duration
  const durationDiff = Math.abs(trackDuration - avgRemaining);
  const maxDiff = avgRemaining * 0.5; // 50% tolerance
  const fitScore = Math.max(0, 1 - durationDiff / maxDiff);

  if (fitScore > 0.8) {
    reasons.push({
      type: "duration_fit",
      explanation: `Duration fits well (${Math.round(trackDuration / 60)}:${String(Math.round(trackDuration % 60)).padStart(2, "0")})`,
      score: fitScore,
    });
  } else if (fitScore > 0.5) {
    reasons.push({
      type: "duration_fit",
      explanation: `Duration acceptable`,
      score: fitScore,
    });
  }

  return { score: fitScore, reasons };
}

/**
 * Calculate diversity score with penalties
 * 
 * Scores tracks based on artist, genre, and album diversity. Applies
 * penalties for tracks that repeat artists or genres too frequently,
 * and bonuses for tracks from different albums.
 * 
 * @param track - Track to score
 * @param previousTracks - Previously selected tracks in playlist
 * @param strategy - Playlist strategy (contains diversity rules)
 * @returns Score (0-1) and reasons for the score
 * 
 * @example
 * ```typescript
 * const result = calculateDiversity(track, previousTracks, strategy);
 * // Returns: { score: 0.7, reasons: [{ type: "diversity", ... }] }
 * ```
 */
export function calculateDiversity(
  track: TrackRecord,
  previousTracks: TrackRecord[],
  strategy: PlaylistStrategy
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  let score = 1.0;

  const diversityRules = strategy.diversityRules;
  const recentTracks = previousTracks.slice(-diversityRules.artistSpacing);
  const recentArtists = new Set(recentTracks.map((t) => t.tags.artist));
  const recentGenres = new Set(
    recentTracks.flatMap((t) => t.tags.genres.map((g) => g.toLowerCase()))
  );

  // Artist diversity
  const artistCount = previousTracks.filter(
    (t) => t.tags.artist === track.tags.artist
  ).length;

  if (artistCount >= diversityRules.maxTracksPerArtist) {
    score *= 0.1; // Heavy penalty
    reasons.push({
      type: "diversity",
      explanation: `Too many tracks from ${track.tags.artist} (${artistCount})`,
      score: 0.1,
    });
  } else if (recentArtists.has(track.tags.artist)) {
    score *= 0.3; // Penalty for recent artist
    reasons.push({
      type: "diversity",
      explanation: `Same artist appeared recently`,
      score: 0.3,
    });
  } else {
    reasons.push({
      type: "diversity",
      explanation: `Good artist diversity`,
      score: 1.0,
    });
  }

  // Genre diversity
  const trackGenres = track.tags.genres.map((g) => g.toLowerCase());
  const hasRecentGenre = trackGenres.some((g) => recentGenres.has(g));

  if (hasRecentGenre) {
    score *= 0.7; // Light penalty for recent genre
  }

  // Album diversity (bonus)
  const recentAlbums = new Set(recentTracks.map((t) => t.tags.album));
  if (!recentAlbums.has(track.tags.album)) {
    score *= 1.1; // Small bonus for different album
  }

  return { score, reasons };
}

/**
 * Calculate surprise factor (include nearby genres/artists)
 * 
 * Scores tracks that don't match requested genres but are related
 * through shared artists or genres. Higher surprise levels allow
 * more adventurous track selections.
 * 
 * @param track - Track to score
 * @param requestedGenres - Genres requested by user
 * @param previousTracks - Previously selected tracks in playlist
 * @param matchingIndex - Matching index with genre/artist relationships
 * @param surpriseLevel - Surprise level (0.0 = safe, 1.0 = adventurous)
 * @returns Score (0-1) and reasons for the score
 * 
 * @example
 * ```typescript
 * const result = calculateSurprise(track, ["rock"], previousTracks, index, 0.5);
 * // Returns: { score: 0.25, reasons: [{ type: "surprise", ... }] }
 * ```
 */
export function calculateSurprise(
  track: TrackRecord,
  requestedGenres: string[],
  previousTracks: TrackRecord[],
  matchingIndex: MatchingIndex,
  surpriseLevel: number
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  let score = 0;

  if (surpriseLevel < 0.1) {
    return { score: 0, reasons: [] }; // No surprise for very safe playlists
  }

  // Normalize requested genres
  const normalizedRequested = requestedGenres.map((g) => normalizeGenre(g));
  const normalizedRequestedLower = normalizedRequested.map((g) => g.toLowerCase());

  // Get normalized genres for this track
  const trackMetadata = matchingIndex.trackMetadata.get(track.trackFileId);
  const trackNormalizedGenres = trackMetadata?.normalizedGenres || 
    track.tags.genres.map((g) => normalizeGenre(g));
  const trackNormalizedLower = trackNormalizedGenres.map((g) => g.toLowerCase());

  // Check if track has requested genres (using normalized)
  const hasRequestedGenre = trackNormalizedLower.some((tg) =>
    normalizedRequestedLower.includes(tg)
  );

  if (!hasRequestedGenre) {
    // This is a surprise track - check if it's "nearby"
    // Find artists that appear with requested genres (using normalized genres)
    const artistsWithRequestedGenres = new Set<string>();
    for (const genre of normalizedRequestedLower) {
      const genreTracks = matchingIndex.byGenre.get(genre) || [];
      for (const trackId of genreTracks) {
        const metadata = matchingIndex.trackMetadata.get(trackId);
        if (metadata) {
          artistsWithRequestedGenres.add(metadata.artist);
        }
      }
    }

    // If this artist appears with requested genres, it's a good surprise
    if (artistsWithRequestedGenres.has(track.tags.artist)) {
      score = surpriseLevel * 0.5; // Moderate surprise bonus
      reasons.push({
        type: "surprise",
        explanation: `Surprise track from ${track.tags.artist} (related to requested genres)`,
        score: score,
      });
    } else {
      // Check if any previous tracks share normalized genres with this track
      const previousNormalizedGenres = new Set<string>();
      for (const prevTrack of previousTracks) {
        const prevMetadata = matchingIndex.trackMetadata.get(prevTrack.trackFileId);
        const prevNormalized = prevMetadata?.normalizedGenres || 
          prevTrack.tags.genres.map((g) => normalizeGenre(g));
        prevNormalized.forEach((g) => previousNormalizedGenres.add(g.toLowerCase()));
      }
      const sharedGenres = trackNormalizedLower.filter((g) => previousNormalizedGenres.has(g));

      if (sharedGenres.length > 0) {
        score = surpriseLevel * 0.3; // Small surprise bonus
        const sharedGenreDisplay = trackNormalizedGenres.find((g) => 
          sharedGenres.includes(g.toLowerCase())
        ) || sharedGenres[0];
        reasons.push({
          type: "surprise",
          explanation: `Surprise track with shared genre: ${sharedGenreDisplay}`,
          score: score,
        });
      }
    }
  }

  return { score, reasons };
}

