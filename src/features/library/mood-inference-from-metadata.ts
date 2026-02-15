/**
 * Genre → Mood Inference (Rule-Based)
 *
 * Infers mood categories from genre tags when explicit mood tags are missing.
 * Uses rule-based mappings consistent with activity-inference and mood-mapping.
 *
 * @module features/library/mood-inference-from-metadata
 */

import { mapMoodTagsToCategories } from "./mood-mapping";

/** Genre keywords mapped to mood tags (lowercase, used for inference) */
const GENRE_TO_MOOD_TAGS: Array<{ keywords: string[]; moodTags: string[] }> = [
  { keywords: ["ambient", "chill", "downtempo", "ambient electronic"], moodTags: ["calm", "dreamy", "atmospheric"] },
  { keywords: ["metal", "hardcore", "punk", "thrash", "death metal"], moodTags: ["intense", "aggressive", "powerful"] },
  { keywords: ["jazz", "folk", "bossa nova", "smooth jazz"], moodTags: ["relaxed", "mellow", "peaceful"] },
  { keywords: ["indie", "acoustic", "singer-songwriter", "americana"], moodTags: ["reflective", "mellow", "thoughtful"] },
  { keywords: ["edm", "house", "techno", "trance", "electro"], moodTags: ["energetic", "euphoric", "exciting"] },
  { keywords: ["disco", "funk", "dance pop"], moodTags: ["upbeat", "happy", "feel-good"] },
  { keywords: ["grunge", "alternative rock"], moodTags: ["dark", "reflective", "melancholic"] },
  { keywords: ["classical", "orchestral", "piano"], moodTags: ["peaceful", "reflective", "calm"] },
  { keywords: ["reggae", "ska", "latin", "reggaeton"], moodTags: ["relaxed", "upbeat", "happy"] },
  { keywords: ["gospel", "worship"], moodTags: ["uplifting", "euphoric", "hopeful"] },
  { keywords: ["blues", "soul"], moodTags: ["melancholic", "reflective", "mellow"] },
  { keywords: ["synth", "synthwave", "new wave"], moodTags: ["nostalgic", "dreamy", "retro"] },
];

/**
 * Infers mood categories from genre tags using rule-based mapping.
 * Output is canonical mood categories via mapMoodTagsToCategories.
 *
 * @param genres - Genre strings from track metadata
 * @returns Canonical mood categories (e.g. ["Calm", "Dreamy"])
 */
export function inferMoodFromGenres(genres: string[]): string[] {
  if (!genres || genres.length === 0) return [];

  const lower = genres.map((g) => g.toLowerCase().trim()).filter(Boolean);
  const inferredTags: string[] = [];

  for (const { keywords, moodTags } of GENRE_TO_MOOD_TAGS) {
    if (keywords.some((kw) => lower.some((g) => g.includes(kw)))) {
      inferredTags.push(...moodTags);
    }
  }

  if (inferredTags.length === 0) return [];

  return mapMoodTagsToCategories(inferredTags);
}
