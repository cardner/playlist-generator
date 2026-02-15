/**
 * Instruction Parsing for Built-in Playlist Agents
 *
 * Parses user-provided additional instructions (llmAdditionalInstructions) into
 * structured fields that the built-in matching engine can use: mood, activity,
 * genres, and strategy hints (tempo, diversity, duration).
 *
 * @module features/playlists/instruction-parsing
 */

import type { PlaylistRequest } from "@/types/playlist";
import { mapMoodTagsToCategories, normalizeMoodCategory } from "@/features/library/mood-mapping";
import {
  mapActivityTagsToCategories,
  normalizeActivityCategory,
} from "@/features/library/activity-mapping";
import { normalizeGenre } from "@/features/library/genre-normalization";

/** Stopwords to skip when extracting keywords from user instructions */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "with", "to", "of", "in", "on",
  "at", "is", "it", "my", "i", "me", "like", "some", "more", "less", "only",
  "no", "not", "all", "any", "be", "so", "just", "very", "too", "that", "this",
]);

/**
 * Extract meaningful tokens from free text (words and 2-word phrases).
 * Filters stopwords, trims, lowercases.
 */
export function extractInstructionTokens(text: string): string[] {
  if (!text?.trim()) return [];
  const tokens: string[] = [];
  const words = text
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w'-]/g, "");
    if (word.length >= 2 && !STOPWORDS.has(word)) {
      tokens.push(word);
    }
    if (i < words.length - 1) {
      const nextWord = words[i + 1].replace(/[^\w'-]/g, "");
      if (nextWord.length >= 2 && !STOPWORDS.has(nextWord)) {
        tokens.push(`${word} ${nextWord}`);
      }
    }
  }
  return [...new Set(tokens)];
}

/**
 * Parse additional instructions into mood categories.
 * Uses the same mapping as normalizeMoodList.
 */
export function parseMoodFromInstructions(instructions: string | undefined): string[] {
  if (!instructions?.trim()) return [];
  const tokens = extractInstructionTokens(instructions);
  const categories: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const cat = normalizeMoodCategory(token);
    if (cat && !seen.has(cat)) {
      seen.add(cat);
      categories.push(cat);
    }
  }
  const mapped = mapMoodTagsToCategories(tokens);
  for (const m of mapped) {
    if (!seen.has(m)) {
      seen.add(m);
      categories.push(m);
    }
  }
  return categories;
}

/**
 * Parse additional instructions into activity categories.
 */
export function parseActivityFromInstructions(instructions: string | undefined): string[] {
  if (!instructions?.trim()) return [];
  const tokens = extractInstructionTokens(instructions);
  const categories: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const cat = normalizeActivityCategory(token);
    if (cat && !seen.has(cat)) {
      seen.add(cat);
      categories.push(cat);
    }
  }
  const mapped = mapActivityTagsToCategories(tokens);
  for (const m of mapped) {
    if (!seen.has(m)) {
      seen.add(m);
      categories.push(m);
    }
  }
  return categories;
}

/**
 * Parse additional instructions into genre-like tokens.
 * Only returns tokens that match known library genres when knownGenres is provided.
 * When knownGenres is empty/undefined, returns [] to avoid adding random words.
 */
export function parseGenresFromInstructions(
  instructions: string | undefined,
  knownGenres?: string[]
): string[] {
  if (!instructions?.trim()) return [];
  const tokens = extractInstructionTokens(instructions);
  if (!knownGenres?.length) return [];
  const knownLower = new Set(knownGenres.map((g) => normalizeGenre(g).toLowerCase()));
  return tokens.filter((t) => knownLower.has(t.toLowerCase()));
}

/**
 * Hints extracted from instructions to adjust strategy/request.
 */
export interface InstructionHints {
  /** Override tempo bucket if detected */
  tempoBucket?: "slow" | "medium" | "fast";
  /** Adjust surprise/diversity (added to current value) */
  surpriseBoost?: number;
  /** Max duration in seconds for individual tracks */
  maxDurationSeconds?: number;
  /** Min duration in seconds for individual tracks */
  minDurationSeconds?: number;
}

/**
 * Simple keyword rules to extract strategy hints from instructions.
 */
export function parseStrategyHintsFromInstructions(
  instructions: string | undefined
): InstructionHints {
  if (!instructions?.trim()) return {};
  const lower = instructions.toLowerCase();
  const hints: InstructionHints = {};

  if (/\b(no slow|upbeat only|fast only|high energy|no chill)\b/.test(lower)) {
    hints.tempoBucket = "fast";
  } else if (/\b(slow only|chill only|calm only|no fast|relaxing only)\b/.test(lower)) {
    hints.tempoBucket = "slow";
  }

  if (/\b(more variety|mix it up|diverse|eclectic|varied|different)\b/.test(lower)) {
    hints.surpriseBoost = 0.2;
  } else if (/\b(safe|predictable|familiar|same vibe)\b/.test(lower)) {
    hints.surpriseBoost = -0.2;
  }

  if (/\b(short tracks?|under 3 min|under 3 minutes)\b/.test(lower)) {
    hints.maxDurationSeconds = 180;
  } else if (/\b(long tracks?|extended|over 5 min)\b/.test(lower)) {
    hints.minDurationSeconds = 300;
  }

  return hints;
}

/**
 * Apply instruction hints to a request. Returns a new request with overrides.
 */
export function applyInstructionHintsToRequest(
  request: PlaylistRequest,
  hints: InstructionHints
): PlaylistRequest {
  let result = { ...request };
  if (hints.tempoBucket && !result.tempo?.bpmRange) {
    result = {
      ...result,
      tempo: { ...(result.tempo || {}), bucket: hints.tempoBucket },
    };
  }
  if (hints.surpriseBoost != null) {
    result = {
      ...result,
      surprise: Math.max(0, Math.min(1, (result.surprise ?? 0.5) + hints.surpriseBoost)),
    };
  }
  return result;
}

/**
 * Merge parsed mood/activity/genres from instructions into existing request arrays.
 * Deduplicates. Used only when agentType is "built-in".
 */
export function mergeInstructionsIntoRequest(
  request: PlaylistRequest,
  knownGenres?: string[]
): PlaylistRequest {
  const instructions = request.llmAdditionalInstructions;
  if (!instructions?.trim()) return request;

  const extraMood = parseMoodFromInstructions(instructions);
  const extraActivity = parseActivityFromInstructions(instructions);
  const extraGenres = parseGenresFromInstructions(instructions, knownGenres);

  if (extraMood.length === 0 && extraActivity.length === 0 && extraGenres.length === 0) {
    return request;
  }

  const mood = [...(request.mood || []), ...extraMood];
  const activity = [...(request.activity || []), ...extraActivity];
  const genres = [...(request.genres || []), ...extraGenres];

  return {
    ...request,
    mood: [...new Set(mood)],
    activity: [...new Set(activity)],
    genres: [...new Set(genres)],
  };
}
