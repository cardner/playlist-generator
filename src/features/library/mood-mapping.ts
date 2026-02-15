const MOOD_CATEGORIES = [
  "Happy",
  "Energetic",
  "Relaxed",
  "Melancholic",
  "Upbeat",
  "Calm",
  "Intense",
  "Peaceful",
  "Exciting",
  "Mellow",
  "Romantic",
  "Dark",
  "Nostalgic",
  "Dreamy",
  "Aggressive",
  "Uplifting",
  "Reflective",
  "Euphoric",
];

const MOOD_SYNONYMS: Array<{ category: string; keywords: string[] }> = [
  { category: "Happy", keywords: ["happy", "joy", "joyful", "cheerful", "bright", "sunny"] },
  { category: "Energetic", keywords: ["energetic", "energy", "power", "driving", "high-energy"] },
  { category: "Relaxed", keywords: ["relaxed", "relaxing", "laid-back", "easygoing", "smooth"] },
  { category: "Melancholic", keywords: ["melancholic", "sad", "somber", "blue", "moody", "wistful"] },
  { category: "Upbeat", keywords: ["upbeat", "bouncy", "feel-good", "positive"] },
  { category: "Calm", keywords: ["calm", "chill", "ambient", "soft", "gentle"] },
  { category: "Intense", keywords: ["intense", "heavy", "hard", "fierce", "powerful"] },
  { category: "Peaceful", keywords: ["peaceful", "tranquil", "serene", "soothing"] },
  { category: "Exciting", keywords: ["exciting", "thrilling", "anthemic"] },
  { category: "Mellow", keywords: ["mellow", "warm", "cozy"] },
  { category: "Romantic", keywords: ["romantic", "love", "loving", "tender", "intimate"] },
  { category: "Dark", keywords: ["dark", "brooding", "ominous", "noir", "gothic"] },
  { category: "Nostalgic", keywords: ["nostalgic", "retro", "throwback", "memories", "yearning"] },
  { category: "Dreamy", keywords: ["dreamy", "ethereal", "floating", "atmospheric", "hypnotic"] },
  { category: "Aggressive", keywords: ["aggressive", "angry", "hostile", "harsh", "intense"] },
  { category: "Uplifting", keywords: ["uplifting", "inspiring", "hopeful", "euphoric", "triumphant"] },
  { category: "Reflective", keywords: ["reflective", "thoughtful", "contemplative", "introspective"] },
  { category: "Euphoric", keywords: ["euphoric", "ecstatic", "blissful", "transcendent"] },
];

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim();
}

export function getMoodCategories(): string[] {
  return [...MOOD_CATEGORIES];
}

export function mapMoodTagsToCategories(tags: string[]): string[] {
  if (!tags || tags.length === 0) return [];

  const mapped = new Set<string>();
  for (const raw of tags) {
    const normalized = normalizeTag(raw);
    if (!normalized) continue;

    for (const { category, keywords } of MOOD_SYNONYMS) {
      if (keywords.some((keyword) => normalized.includes(keyword))) {
        mapped.add(category);
      }
    }

    // Direct match to existing category name
    for (const category of MOOD_CATEGORIES) {
      if (normalized === category.toLowerCase()) {
        mapped.add(category);
      }
    }
  }

  return Array.from(mapped);
}

export function normalizeMoodCategory(value: string): string | null {
  const normalized = value.toLowerCase().trim();
  const match = MOOD_CATEGORIES.find((category) => category.toLowerCase() === normalized);
  return match || null;
}

/**
 * Maps MusicBrainz tags to canonical mood categories.
 * MusicBrainz tags (e.g. "classic rock", "sad", "anthemic") often overlap with
 * mood keywords; this runs them through the same synonym mapping.
 *
 * @param tags - Raw tags from track.enhancedMetadata.musicbrainzTags
 * @returns Canonical mood categories
 */
export function mapMusicBrainzTagsToMood(tags: string[]): string[] {
  if (!tags || tags.length === 0) return [];
  return mapMoodTagsToCategories(tags);
}

