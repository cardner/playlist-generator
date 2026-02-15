/**
 * Genre Similarity and Co-occurrence
 *
 * Provides similar-genre suggestions based on:
 * - Library co-occurrence (genres that appear together on tracks)
 * - Static genre taxonomy fallback
 *
 * @module features/library/genre-similarity
 */

import {
  createGenreMappingAccumulator,
  normalizeGenre,
} from "@/features/library/genre-normalization";

/**
 * Static taxonomy: genre -> related genres (siblings/subgenres).
 * Used when co-occurrence data is sparse.
 */
const STATIC_GENRE_TAXONOMY: Record<string, string[]> = {
  Rock: ["Classic Rock", "Indie Rock", "Punk", "Hard Rock", "Progressive Rock", "Alternative Rock", "Soft Rock", "Southern Rock", "Folk Rock"],
  "Indie Rock": ["Rock", "Alternative Rock", "Indie", "Indie Pop"],
  "Alternative Rock": ["Rock", "Indie Rock", "Grunge", "Punk Rock"],
  "Progressive Rock": ["Rock", "Prog Rock", "Art Rock"],
  "Classic Rock": ["Rock", "Hard Rock", "Blues Rock"],
  "Hard Rock": ["Rock", "Heavy Metal", "Classic Rock"],
  "Punk Rock": ["Rock", "Punk", "Alternative Rock"],
  Punk: ["Punk Rock", "Rock", "Alternative"],
  Metal: ["Heavy Metal", "Death Metal", "Black Metal", "Power Metal", "Thrash Metal"],
  "Heavy Metal": ["Metal", "Hard Rock", "Rock"],
  "Death Metal": ["Metal", "Heavy Metal", "Black Metal"],
  Jazz: ["Smooth Jazz", "Jazz Fusion", "Acid Jazz", "Bebop", "Swing", "Blues"],
  "Smooth Jazz": ["Jazz", "R&B", "Soul"],
  "Jazz Fusion": ["Jazz", "Fusion", "Progressive Rock"],
  "Acid Jazz": ["Jazz", "Funk", "Soul"],
  Electronic: ["House", "Techno", "Trance", "Ambient", "IDM", "EDM"],
  House: ["Electronic", "Disco", "Techno"],
  Techno: ["Electronic", "House", "Industrial"],
  Trance: ["Electronic", "House", "Ambient"],
  Ambient: ["Electronic", "Drone", "New Age"],
  "Hip Hop": ["Rap", "R&B", "Soul", "Funk"],
  Rap: ["Hip Hop", "R&B", "Soul"],
  "R&B": ["Soul", "Hip Hop", "Funk", "Gospel"],
  Soul: ["R&B", "Funk", "Gospel", "Blues"],
  Pop: ["Pop Rock", "Dance", "Indie Pop", "Electropop"],
  "Pop Rock": ["Pop", "Rock", "Soft Rock"],
  Folk: ["Folk Rock", "Country", "Singer-Songwriter", "Celtic", "Bluegrass"],
  "Folk Rock": ["Folk", "Rock", "Country Rock"],
  Country: ["Folk", "Bluegrass", "Americana", "Country Rock"],
  Classical: ["Baroque", "Romantic", "Opera", "Chamber Music", "Symphony"],
  Reggae: ["Dub", "Ska", "Dancehall"],
  Ska: ["Reggae", "Rock", "Punk"],
  Blues: ["Blues Rock", "Jazz", "Soul", "R&B"],
};

export type GenreCoOccurrenceMap = Map<string, Map<string, number>>;

/**
 * Create a streaming accumulator for genre co-occurrence.
 * For each track with multiple genres, counts pairs of genres that appear together.
 */
export function createGenreCoOccurrenceAccumulator() {
  const { normalizeTrackGenres } = createGenreMappingAccumulator();
  const coOccurrence: GenreCoOccurrenceMap = new Map();

  const addTrack = (track: {
    tags: { genres: string[] };
    trackFileId?: string;
    id?: string;
  }) => {
    const normalizedGenres = normalizeTrackGenres(track.tags.genres);
    const unique = [...new Set(normalizedGenres)].filter((g) => g.length > 0);

    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const g1 = unique[i];
        const g2 = unique[j];
        if (g1 === g2) continue;

        if (!coOccurrence.has(g1)) coOccurrence.set(g1, new Map());
        if (!coOccurrence.has(g2)) coOccurrence.set(g2, new Map());

        const m1 = coOccurrence.get(g1)!;
        const m2 = coOccurrence.get(g2)!;
        m1.set(g2, (m1.get(g2) ?? 0) + 1);
        m2.set(g1, (m2.get(g1) ?? 0) + 1);
      }
    }
  };

  const finalize = (): GenreCoOccurrenceMap => coOccurrence;

  return { addTrack, finalize };
}

/**
 * Find a matching key in the static taxonomy (case-insensitive, supports variations).
 */
function findTaxonomyKey(genre: string): string | null {
  const normalized = normalizeGenre(genre);
  const lower = normalized.toLowerCase();

  for (const key of Object.keys(STATIC_GENRE_TAXONOMY)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

/**
 * Get similar genres for the given selected genres.
 * Combines co-occurrence scores and static taxonomy fallback.
 * Only returns genres that exist in the library.
 *
 * @param selectedGenres - Genres the user has already selected
 * @param libraryGenres - All genres in the user's library (normalized)
 * @param coOccurrence - Co-occurrence map from getGenreCoOccurrence
 * @param limit - Max number of suggestions (default 6)
 */
export function getSimilarGenres(
  selectedGenres: string[],
  libraryGenres: string[],
  coOccurrence: GenreCoOccurrenceMap,
  limit: number = 6
): string[] {
  const librarySet = new Set(libraryGenres.map((g) => normalizeGenre(g)));
  const selectedSet = new Set(
    selectedGenres.map((g) => normalizeGenre(g)).filter(Boolean)
  );

  if (selectedSet.size === 0) return [];

  const scores = new Map<string, number>();

  // 1. Co-occurrence: aggregate scores from all selected genres
  for (const genre of selectedSet) {
    const normalized = normalizeGenre(genre);
    const coMap = coOccurrence.get(normalized);
    if (coMap) {
      for (const [coGenre, count] of coMap) {
        if (selectedSet.has(normalizeGenre(coGenre))) continue;
        if (!librarySet.has(normalizeGenre(coGenre))) continue;
        const existing = scores.get(coGenre) ?? 0;
        scores.set(coGenre, existing + count);
      }
    }
  }

  // 2. Static taxonomy fallback when co-occurrence is sparse
  if (scores.size < limit) {
    for (const genre of selectedSet) {
      const normalized = normalizeGenre(genre);
      const key = findTaxonomyKey(normalized);
      if (!key || !STATIC_GENRE_TAXONOMY[key]) continue;

      for (const related of STATIC_GENRE_TAXONOMY[key]) {
        const relatedNorm = normalizeGenre(related);
        if (selectedSet.has(relatedNorm)) continue;
        if (!librarySet.has(relatedNorm)) continue;
        const libMatch = libraryGenres.find((lg) => normalizeGenre(lg) === relatedNorm);
        const displayGenre = libMatch ?? related;
        const existing = scores.get(displayGenre) ?? 0;
        scores.set(displayGenre, existing + 1);
      }
    }
  }

  // Sort by score descending, then alphabetically; take top N
  return Array.from(scores.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, limit)
    .map(([g]) => g);
}
