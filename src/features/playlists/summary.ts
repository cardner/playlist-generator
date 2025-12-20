/**
 * Playlist Summary Generation
 * 
 * This module generates summary statistics for generated playlists, including
 * genre mix, tempo distribution, artist diversity, and duration statistics.
 * 
 * @module features/playlists/summary
 */

import type { TrackSelection } from "./matching-engine";
import type { MatchingIndex } from "@/features/library/summarization";
import type { PlaylistSummary } from "./matching-engine";

/**
 * Generate playlist summary from selected tracks
 * 
 * Calculates comprehensive statistics about the playlist including:
 * - Total duration and track count
 * - Genre distribution (genre -> count)
 * - Tempo distribution (tempo bucket -> count)
 * - Artist distribution (artist -> track count)
 * - Duration statistics (average, min, max)
 * 
 * @param selections - Selected tracks with scores and reasons
 * @param matchingIndex - Matching index with tempo bucket metadata
 * @returns Complete playlist summary
 * 
 * @example
 * ```typescript
 * const summary = generatePlaylistSummary(selections, index);
 * // Returns: {
 * //   totalDuration: 3600,
 * //   trackCount: 15,
 * //   genreMix: Map { "Rock" => 8, "Indie" => 7 },
 * //   tempoMix: Map { "medium" => 10, "fast" => 5 },
 * //   artistMix: Map { "Artist1" => 3, "Artist2" => 2 },
 * //   avgDuration: 240,
 * //   minDuration: 180,
 * //   maxDuration: 300
 * // }
 * ```
 */
export function generatePlaylistSummary(
  selections: TrackSelection[],
  matchingIndex: MatchingIndex
): PlaylistSummary {
  const genreMix = new Map<string, number>();
  const tempoMix = new Map<string, number>();
  const artistMix = new Map<string, number>();
  const durations: number[] = [];

  for (const selection of selections) {
    const track = selection.track;
    const metadata = matchingIndex.trackMetadata.get(track.trackFileId);

    // Genre mix
    for (const genre of track.tags.genres) {
      genreMix.set(genre, (genreMix.get(genre) || 0) + 1);
    }

    // Tempo mix
    const tempoBucket = metadata?.tempoBucket || "unknown";
    tempoMix.set(tempoBucket, (tempoMix.get(tempoBucket) || 0) + 1);

    // Artist mix
    artistMix.set(track.tags.artist, (artistMix.get(track.tags.artist) || 0) + 1);

    // Duration stats
    const duration = track.tech?.durationSeconds || 0;
    if (duration > 0) {
      durations.push(duration);
    }
  }

  return {
    totalDuration: selections.reduce(
      (sum, s) => sum + (s.track.tech?.durationSeconds || 0),
      0
    ),
    trackCount: selections.length,
    genreMix,
    tempoMix,
    artistMix,
    avgDuration:
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
    minDuration: durations.length > 0 ? Math.min(...durations) : 0,
    maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
  };
}

