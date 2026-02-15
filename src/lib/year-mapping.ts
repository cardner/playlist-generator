/**
 * Year / Era → Mood and Activity Mapping
 *
 * Maps release year to inferred mood and activity categories.
 * Used when track metadata lacks explicit mood/activity tags.
 *
 * @module lib/year-mapping
 */

import { mapMoodTagsToCategories } from "@/features/library/mood-mapping";
import { mapActivityTagsToCategories } from "@/features/library/activity-mapping";

/** Decade key for mappings (e.g. "80s", "2000s") */
export type DecadeKey =
  | "60s"
  | "70s"
  | "80s"
  | "90s"
  | "2000s"
  | "2010s"
  | "2020s";

/** Mood tags (lowercase) inferred from decade */
const DECADE_TO_MOOD_TAGS: Record<DecadeKey, string[]> = {
  "60s": ["nostalgic", "reflective", "peaceful", "romantic"],
  "70s": ["upbeat", "euphoric", "relaxed", "groovy"],
  "80s": ["nostalgic", "dreamy", "upbeat", "synth"],
  "90s": ["dark", "reflective", "melancholic", "intense"],
  "2000s": ["energetic", "upbeat", "party"],
  "2010s": ["chill", "mellow", "dreamy", "reflective"],
  "2020s": ["work", "commute", "relaxing"],
};

/** Activity tags (lowercase) inferred from decade */
const DECADE_TO_ACTIVITY_TAGS: Record<DecadeKey, string[]> = {
  "60s": ["relaxing", "reading", "meditation"],
  "70s": ["dance", "party", "socializing"],
  "80s": ["dance", "party", "gaming", "workout"],
  "90s": ["workout", "commute", "running"],
  "2000s": ["party", "dance", "workout", "commute"],
  "2010s": ["relaxing", "study", "work", "creative"],
  "2020s": ["work", "commute", "relaxing"],
};

/** Valid year range (1900–2099) */
const MIN_YEAR = 1900;
const MAX_YEAR = 2099;

/**
 * Maps a year to a decade key.
 *
 * @param year - Release year (1900–2099)
 * @returns Decade key or null if year is invalid
 */
export function getDecadeFromYear(year?: number): DecadeKey | null {
  if (typeof year !== "number" || Number.isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return null;
  }
  if (year < 1970) return "60s";
  if (year < 1980) return "70s";
  if (year < 1990) return "80s";
  if (year < 2000) return "90s";
  if (year < 2010) return "2000s";
  if (year < 2020) return "2010s";
  return "2020s";
}

/**
 * Infers mood categories from release year.
 *
 * @param year - Release year from track.tags.year or musicbrainzReleaseYear
 * @returns Canonical mood categories (e.g. ["Nostalgic", "Dreamy"])
 */
export function inferMoodFromYear(year?: number): string[] {
  const decade = getDecadeFromYear(year);
  if (!decade) return [];

  const tags = DECADE_TO_MOOD_TAGS[decade];
  if (!tags || tags.length === 0) return [];

  return mapMoodTagsToCategories(tags);
}

/**
 * Infers activity categories from release year.
 *
 * @param year - Release year from track.tags.year or musicbrainzReleaseYear
 * @returns Canonical activity categories (e.g. ["Dance", "Party"])
 */
export function inferActivityFromYear(year?: number): string[] {
  const decade = getDecadeFromYear(year);
  if (!decade) return [];

  const tags = DECADE_TO_ACTIVITY_TAGS[decade];
  if (!tags || tags.length === 0) return [];

  return mapActivityTagsToCategories(tags);
}
