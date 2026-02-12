/**
 * Playlist Request Normalization
 *
 * Normalizes mood and activity lists in playlist requests so they use canonical
 * categories. This ensures consistent matching between user input (e.g. "chill",
 * "gym") and track metadata (e.g. "Relaxing", "Workout").
 *
 * Call normalizePlaylistRequest() before passing a request to the matching engine.
 *
 * @module features/playlists/request-normalization
 */

import type { PlaylistRequest } from "@/types/playlist";
import { mapMoodTagsToCategories, normalizeMoodCategory } from "@/features/library/mood-mapping";
import { mapActivityTagsToCategories, normalizeActivityCategory } from "@/features/library/activity-mapping";

function normalizeTagList(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeMoodList(values: string[]): string[] {
  const cleaned = normalizeTagList(values);
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of cleaned) {
    const category = normalizeMoodCategory(raw);
    if (category && !seen.has(category)) {
      seen.add(category);
      normalized.push(category);
    }
  }

  const mapped = mapMoodTagsToCategories(cleaned);
  for (const category of mapped) {
    if (!seen.has(category)) {
      seen.add(category);
      normalized.push(category);
    }
  }

  return normalized.length > 0 ? normalized : cleaned;
}

function normalizeActivityList(values: string[]): string[] {
  const cleaned = normalizeTagList(values);
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of cleaned) {
    const category = normalizeActivityCategory(raw);
    if (category && !seen.has(category)) {
      seen.add(category);
      normalized.push(category);
    }
  }

  const mapped = mapActivityTagsToCategories(cleaned);
  for (const category of mapped) {
    if (!seen.has(category)) {
      seen.add(category);
      normalized.push(category);
    }
  }

  return normalized.length > 0 ? normalized : cleaned;
}

/**
 * Normalizes mood and activity arrays in a playlist request to canonical categories.
 * Trims whitespace, maps synonyms to categories, and deduplicates. Returns a new
 * request object; does not mutate the original.
 * Also applies defaults for sourcePool and recentWindow when sourcePool is "recent".
 *
 * @param request - Raw playlist request from user input
 * @returns New request with normalized mood and activity arrays
 */
export function normalizePlaylistRequest(request: PlaylistRequest): PlaylistRequest {
  const sourcePool = request.sourcePool ?? "all";
  const recentWindow =
    sourcePool === "recent" && !request.recentWindow && !request.recentTrackCount
      ? "30d"
      : request.recentWindow;

  const genres = Array.isArray(request.genres) ? request.genres : [];
  const mood = normalizeMoodList(request.mood || []);
  const activity = normalizeActivityList(request.activity || []);

  return {
    ...request,
    genres,
    mood,
    activity,
    sourcePool,
    recentWindow,
  };
}
