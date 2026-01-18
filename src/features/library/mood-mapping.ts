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
];

const MOOD_SYNONYMS: Array<{ category: string; keywords: string[] }> = [
  { category: "Happy", keywords: ["happy", "joy", "joyful", "cheerful", "bright", "sunny"] },
  { category: "Energetic", keywords: ["energetic", "energy", "power", "driving", "high-energy"] },
  { category: "Relaxed", keywords: ["relaxed", "relaxing", "laid-back", "easygoing", "smooth"] },
  { category: "Melancholic", keywords: ["melancholic", "sad", "somber", "blue", "moody", "wistful"] },
  { category: "Upbeat", keywords: ["upbeat", "bouncy", "feel-good", "positive"] },
  { category: "Calm", keywords: ["calm", "chill", "ambient", "soft", "gentle"] },
  { category: "Intense", keywords: ["intense", "aggressive", "heavy", "hard", "fierce"] },
  { category: "Peaceful", keywords: ["peaceful", "tranquil", "serene", "soothing"] },
  { category: "Exciting", keywords: ["exciting", "thrilling", "euphoric", "anthemic"] },
  { category: "Mellow", keywords: ["mellow", "warm", "cozy", "dreamy", "nostalgic"] },
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

