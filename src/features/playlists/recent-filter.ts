/**
 * Recent filter for playlist generation
 *
 * Filters tracks to only include those added recently when sourcePool is "recent".
 * Uses addedAt when available, falls back to updatedAt.
 *
 * @module features/playlists/recent-filter
 */

import type { PlaylistRequest } from "@/types/playlist";
import type { TrackRecord } from "@/db/schema";

const addedAt = (t: TrackRecord) => t.addedAt ?? t.updatedAt;

/**
 * Filter tracks by recent window or count when sourcePool is "recent".
 *
 * @param tracks - Full track list
 * @param request - Playlist request with sourcePool, recentWindow, recentTrackCount
 * @returns Filtered tracks (or original when sourcePool is not "recent")
 */
export function applyRecentFilter(
  tracks: TrackRecord[],
  request: PlaylistRequest
): TrackRecord[] {
  const sourcePool = request.sourcePool ?? "all";
  if (sourcePool !== "recent") return tracks;

  if (request.recentTrackCount != null && request.recentTrackCount > 0) {
    return [...tracks]
      .sort((a, b) => addedAt(b) - addedAt(a))
      .slice(0, request.recentTrackCount);
  }

  const window = request.recentWindow ?? "30d";
  const windowMs =
    window === "7d"
      ? 7 * 24 * 60 * 60 * 1000
      : window === "90d"
        ? 90 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  return tracks.filter((t) => addedAt(t) >= cutoff);
}
