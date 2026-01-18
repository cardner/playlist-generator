import type { TrackRecord } from "@/db/schema";

export interface SimilarTracksResult {
  similarArtists: string[];
  similarTracks: TrackRecord[];
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

export function findSimilarTracks(
  track: TrackRecord,
  allTracks: TrackRecord[],
  limit: number = 10
): SimilarTracksResult {
  const genreSet = new Set(track.tags.genres.map((genre) => genre.toLowerCase()));
  const tempoBucket = getTempoBucket(track.tech?.bpm);
  const artist = track.tags.artist?.toLowerCase() || "";

  const scored = allTracks
    .filter((candidate) => candidate.trackFileId !== track.trackFileId)
    .map((candidate) => {
      let score = 0;
      if (candidate.tags.artist?.toLowerCase() === artist) {
        score += 3;
      }

      const candidateGenres = candidate.tags.genres.map((genre) => genre.toLowerCase());
      const genreOverlap = candidateGenres.filter((g) => genreSet.has(g)).length;
      if (genreOverlap > 0) {
        score += Math.min(2, genreOverlap);
      }

      const candidateTempo = getTempoBucket(candidate.tech?.bpm);
      if (tempoBucket !== "unknown" && candidateTempo === tempoBucket) {
        score += 1;
      }

      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const similarTracks = scored.slice(0, limit).map((item) => item.candidate);
  const similarArtists = Array.from(
    new Set(
      similarTracks
        .map((candidate) => candidate.tags.artist)
        .filter((name): name is string => !!name && name.toLowerCase() !== artist)
    )
  ).slice(0, limit);

  return {
    similarArtists,
    similarTracks,
  };
}

