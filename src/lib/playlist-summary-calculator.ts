import type { PlaylistSummary } from "@/features/playlists";

export interface SummaryTrackInput {
  trackFileId: string;
  genres: string[];
  artist?: string;
  durationSeconds?: number;
  bpm?: number;
}

type TempoBucket = "slow" | "medium" | "fast" | "unknown";

function getTempoBucket(bpm?: number): TempoBucket {
  if (typeof bpm !== "number" || Number.isNaN(bpm)) {
    return "unknown";
  }
  if (bpm < 90) return "slow";
  if (bpm < 140) return "medium";
  return "fast";
}

export function calculatePlaylistSummaryFromTracks(
  tracks: SummaryTrackInput[]
): PlaylistSummary {
  const genreMix = new Map<string, number>();
  const tempoMix = new Map<string, number>();
  const artistMix = new Map<string, number>();
  const durations: number[] = [];

  for (const track of tracks) {
    for (const genre of track.genres) {
      genreMix.set(genre, (genreMix.get(genre) || 0) + 1);
    }

    const tempoBucket = getTempoBucket(track.bpm);
    tempoMix.set(tempoBucket, (tempoMix.get(tempoBucket) || 0) + 1);

    const artist = track.artist || "Unknown Artist";
    artistMix.set(artist, (artistMix.get(artist) || 0) + 1);

    const duration = track.durationSeconds || 0;
    if (duration > 0) {
      durations.push(duration);
    }
  }

  const totalDuration = tracks.reduce(
    (sum, track) => sum + (track.durationSeconds || 0),
    0
  );

  return {
    totalDuration,
    trackCount: tracks.length,
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

