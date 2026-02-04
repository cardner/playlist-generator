/**
 * Activity Mapping and Normalization
 *
 * Maps free-form activity tags (e.g. "gym", "chill", "lofi") to canonical activity
 * categories used across the app. This ensures consistent matching when users request
 * playlists for activities like "workout" or "study".
 *
 * Canonical categories: Workout, Running, Study, Work, Commute, Cooking, Party,
 * Dance, Relaxing, Meditation, Reading, Sleep.
 *
 * @module features/library/activity-mapping
 */

const ACTIVITY_CATEGORIES = [
  "Workout",
  "Running",
  "Study",
  "Work",
  "Commute",
  "Cooking",
  "Party",
  "Dance",
  "Relaxing",
  "Meditation",
  "Reading",
  "Sleep",
];

const ACTIVITY_SYNONYMS: Array<{ category: string; keywords: string[] }> = [
  { category: "Workout", keywords: ["workout", "gym", "training", "exercise", "lifting", "fit"] },
  { category: "Running", keywords: ["running", "jog", "jogging", "cardio", "sprint"] },
  { category: "Study", keywords: ["study", "studying", "focus", "focused", "concentration", "lofi"] },
  { category: "Work", keywords: ["work", "working", "office", "productivity"] },
  { category: "Commute", keywords: ["commute", "driving", "travel", "road", "car"] },
  { category: "Cooking", keywords: ["cooking", "kitchen", "baking", "dinner"] },
  { category: "Party", keywords: ["party", "celebration", "festival", "night out"] },
  { category: "Dance", keywords: ["dance", "dancing", "club", "edm", "house", "techno"] },
  { category: "Relaxing", keywords: ["relax", "relaxed", "chill", "laid-back", "easygoing", "calm"] },
  { category: "Meditation", keywords: ["meditation", "mindful", "ambient", "zen", "breathing"] },
  { category: "Reading", keywords: ["reading", "book", "novel"] },
  { category: "Sleep", keywords: ["sleep", "sleeping", "bedtime", "nap", "dream", "sleepy"] },
];

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim();
}

/**
 * Returns the list of canonical activity categories.
 * Use this when you need to validate or display activity options.
 *
 * @returns Array of canonical activity names (e.g. "Workout", "Study", "Relaxing")
 */
export function getActivityCategories(): string[] {
  return [...ACTIVITY_CATEGORIES];
}

/**
 * Maps raw activity tags to canonical categories.
 * Handles synonyms (e.g. "gym" → "Workout", "chill" → "Relaxing") and
 * exact matches. Duplicates are removed.
 *
 * @param tags - Raw activity strings from track metadata or user input
 * @returns Canonical activity categories (e.g. ["Workout", "Relaxing"])
 */
export function mapActivityTagsToCategories(tags: string[]): string[] {
  if (!tags || tags.length === 0) return [];

  const mapped = new Set<string>();
  for (const raw of tags) {
    const normalized = normalizeTag(raw);
    if (!normalized) continue;

    for (const { category, keywords } of ACTIVITY_SYNONYMS) {
      if (keywords.some((keyword) => normalized.includes(keyword))) {
        mapped.add(category);
      }
    }

    for (const category of ACTIVITY_CATEGORIES) {
      if (normalized === category.toLowerCase()) {
        mapped.add(category);
      }
    }
  }

  return Array.from(mapped);
}

/**
 * Normalizes a single activity value to a canonical category.
 * Returns null if the value doesn't match any known category.
 *
 * @param value - Raw activity string (e.g. "workout", "Gym")
 * @returns Canonical category or null if no match
 */
export function normalizeActivityCategory(value: string): string | null {
  const normalized = value.toLowerCase().trim();
  const match = ACTIVITY_CATEGORIES.find((category) => category.toLowerCase() === normalized);
  return match || null;
}
