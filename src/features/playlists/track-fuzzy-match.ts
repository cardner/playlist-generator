/**
 * Fuzzy track matching for playlist import
 *
 * Matches tracks by title, artist, album, and duration when importing playlists
 * from another browser or collection where trackFileIds differ.
 *
 * @module features/playlists/track-fuzzy-match
 */

import type { TrackRecord } from "@/db/schema";

export interface TrackMetadataForMatch {
  trackFileId: string;
  title?: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
}

function normalize(s: string | undefined): string {
  if (!s || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score how well a track matches the given metadata (0-1).
 * Higher is better.
 */
function scoreMatch(
  meta: TrackMetadataForMatch,
  track: TrackRecord
): number {
  const titleA = normalize(meta.title);
  const artistA = normalize(meta.artist);
  const albumA = normalize(meta.album);
  const titleB = normalize(track.tags?.title);
  const artistB = normalize(track.tags?.artist);
  const albumB = normalize(track.tags?.album);

  if (!titleA || !artistA) return 0;

  let score = 0;
  let maxScore = 0;

  // Artist match (weight: 2)
  maxScore += 2;
  if (artistB && artistA === artistB) {
    score += 2;
  } else if (artistB && artistA.includes(artistB)) {
    score += 1.5;
  } else if (artistB && artistB.includes(artistA)) {
    score += 1.5;
  }

  // Title match (weight: 3)
  maxScore += 3;
  if (titleB && titleA === titleB) {
    score += 3;
  } else if (titleB && titleA.includes(titleB)) {
    score += 2;
  } else if (titleB && titleB.includes(titleA)) {
    score += 2;
  }

  // Album match (optional, weight: 1)
  if (albumA && albumB) {
    maxScore += 1;
    if (albumA === albumB) {
      score += 1;
    } else if (albumA.includes(albumB) || albumB.includes(albumA)) {
      score += 0.5;
    }
  }

  // Duration match (optional, weight: 1) - within 5 seconds
  if (
    typeof meta.durationSeconds === "number" &&
    typeof track.tech?.durationSeconds === "number"
  ) {
    maxScore += 1;
    const diff = Math.abs(meta.durationSeconds - track.tech.durationSeconds);
    if (diff <= 2) {
      score += 1;
    } else if (diff <= 5) {
      score += 0.5;
    }
  }

  return maxScore > 0 ? score / maxScore : 0;
}

/**
 * Find the best matching track in the target collection.
 *
 * @param meta - Track metadata from export (title, artist, album, duration)
 * @param candidateTrackFileId - Original trackFileId (for exact match first)
 * @param targetTracks - Tracks in the target collection
 * @param minScore - Minimum score (0-1) to consider a match (default 0.6)
 * @returns Matched trackFileId or null
 */
export function fuzzyMatchTrack(
  meta: TrackMetadataForMatch,
  candidateTrackFileId: string,
  targetTracks: TrackRecord[],
  minScore: number = 0.6
): string | null {
  // Exact trackFileId match first (same collection re-import)
  const exact = targetTracks.find((t) => t.trackFileId === candidateTrackFileId);
  if (exact) return exact.trackFileId;

  // Need metadata for fuzzy match
  if (!meta.title || !meta.artist) return null;

  let best: { trackFileId: string; score: number } | null = null;

  for (const track of targetTracks) {
    const s = scoreMatch(meta, track);
    if (s >= minScore && (!best || s > best.score)) {
      best = { trackFileId: track.trackFileId, score: s };
    }
  }

  return best?.trackFileId ?? null;
}
