/**
 * Playlist variant generation
 * 
 * Creates modified versions of playlist requests for quick iteration
 */

import type { PlaylistRequest } from "@/types/playlist";

export type VariantType = "calmer" | "faster" | "more_variety" | "more_genre";

export interface VariantRequest {
  type: VariantType;
  genre?: string; // For "more_genre" variant
}

/**
 * Generate a variant of a playlist request
 */
export function generateVariant(
  originalRequest: PlaylistRequest,
  variant: VariantRequest
): PlaylistRequest {
  const newRequest = { ...originalRequest };

  switch (variant.type) {
    case "calmer":
      // Reduce tempo, add calm moods, reduce surprise
      if (newRequest.tempo.bucket === "fast") {
        newRequest.tempo.bucket = "medium";
      } else if (newRequest.tempo.bucket === "medium") {
        newRequest.tempo.bucket = "slow";
      }
      // Add calm moods if not present
      const calmMoods = ["calm", "relaxed", "peaceful", "mellow", "chill"];
      const hasCalmMood = newRequest.mood.some((m) =>
        calmMoods.includes(m.toLowerCase())
      );
      if (!hasCalmMood) {
        newRequest.mood = [...newRequest.mood, "calm"];
      }
      // Reduce surprise
      newRequest.surprise = Math.max(0, newRequest.surprise - 0.2);
      break;

    case "faster":
      // Increase tempo, add energetic moods, increase surprise slightly
      if (newRequest.tempo.bucket === "slow") {
        newRequest.tempo.bucket = "medium";
      } else if (newRequest.tempo.bucket === "medium") {
        newRequest.tempo.bucket = "fast";
      }
      // Add energetic moods if not present
      const energeticMoods = ["energetic", "upbeat", "exciting", "intense"];
      const hasEnergeticMood = newRequest.mood.some((m) =>
        energeticMoods.includes(m.toLowerCase())
      );
      if (!hasEnergeticMood) {
        newRequest.mood = [...newRequest.mood, "energetic"];
      }
      // Slightly increase surprise
      newRequest.surprise = Math.min(1, newRequest.surprise + 0.1);
      break;

    case "more_variety":
      // Increase surprise, diversify genres
      newRequest.surprise = Math.min(1, newRequest.surprise + 0.3);
      // If only one genre, keep it but increase surprise
      // If multiple genres, that's already variety
      break;

    case "more_genre":
      // Add specific genre to request
      if (variant.genre && !newRequest.genres.includes(variant.genre)) {
        newRequest.genres = [...newRequest.genres, variant.genre];
      }
      break;
  }

  return newRequest;
}

/**
 * Get variant description text
 */
export function getVariantDescription(variant: VariantType): string {
  switch (variant) {
    case "calmer":
      return "Slower tempo, calmer mood";
    case "faster":
      return "Faster tempo, more energy";
    case "more_variety":
      return "More diverse selection";
    case "more_genre":
      return "More of this genre";
  }
}

