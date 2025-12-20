/**
 * Playlist Naming Utilities
 * 
 * This module generates creative playlist titles and subtitles based on the playlist
 * request and strategy. It can optionally include emojis that match the mood, activity,
 * or genre of the playlist.
 * 
 * Naming Strategy:
 * 1. Uses strategy title if available and meaningful
 * 2. Falls back to combining mood, activity, and genre
 * 3. Generates descriptive subtitle
 * 4. Selects appropriate emoji based on mood/activity/genre
 * 
 * Emoji Selection Priority:
 * 1. Mood emojis (calm → 🌊, energetic → ⚡)
 * 2. Activity emojis (workout → 💪, studying → 📚)
 * 3. Genre emojis (rock → 🎸, jazz → 🎷)
 * 4. Vibe tags from strategy
 * 
 * @module features/playlists/naming
 * 
 * @example
 * ```typescript
 * import { generatePlaylistTitle } from '@/features/playlists/naming';
 * 
 * const { title, subtitle, emoji } = generatePlaylistTitle(request, strategy, true);
 * // Returns: { title: "Energetic Workout", subtitle: "Rock & Pop • energetic vibes • for workout", emoji: "💪" }
 * ```
 */

import type { PlaylistRequest } from "@/types/playlist";
import type { PlaylistStrategy } from "./strategy";

const MOOD_EMOJIS: Record<string, string> = {
  calm: "🌊",
  relaxed: "😌",
  peaceful: "🧘",
  mellow: "🌙",
  chill: "❄️",
  energetic: "⚡",
  upbeat: "🎉",
  exciting: "🔥",
  intense: "💥",
  happy: "😊",
  sad: "💙",
  nostalgic: "📸",
  romantic: "💕",
  dreamy: "✨",
};

const ACTIVITY_EMOJIS: Record<string, string> = {
  workout: "💪",
  running: "🏃",
  studying: "📚",
  working: "💼",
  driving: "🚗",
  party: "🎊",
  cooking: "👨‍🍳",
  relaxing: "🛋️",
  sleep: "😴",
  focus: "🎯",
};

const GENRE_EMOJIS: Record<string, string> = {
  rock: "🎸",
  pop: "🎤",
  jazz: "🎷",
  classical: "🎹",
  electronic: "🎧",
  hip: "🎵",
  rap: "🎤",
  country: "🤠",
  blues: "🎸",
  metal: "🤘",
  indie: "🎨",
  folk: "🪕",
};

/**
 * Select emoji for playlist based on mood, activity, or genre
 */
function selectEmoji(
  request: PlaylistRequest,
  strategy: PlaylistStrategy
): string | null {
  // Try mood first
  for (const mood of request.mood) {
    const emoji = MOOD_EMOJIS[mood.toLowerCase()];
    if (emoji) return emoji;
  }

  // Try activity
  for (const activity of request.activity) {
    const emoji = ACTIVITY_EMOJIS[activity.toLowerCase()];
    if (emoji) return emoji;
  }

  // Try genre
  for (const genre of request.genres) {
    const emoji = GENRE_EMOJIS[genre.toLowerCase()];
    if (emoji) return emoji;
  }

  // Try vibe tags
  for (const tag of strategy.vibeTags) {
    const emoji = MOOD_EMOJIS[tag.toLowerCase()] || ACTIVITY_EMOJIS[tag.toLowerCase()];
    if (emoji) return emoji;
  }

  return null;
}

/**
 * Generate playlist title with optional emoji
 */
export function generatePlaylistTitle(
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  includeEmoji: boolean = true
): { title: string; subtitle: string; emoji: string | null } {
  // Use strategy title if available and good
  let title = strategy.title;
  let subtitle = strategy.description;

  // If title is too generic, enhance it
  if (title.length < 10 || title === "Unknown Playlist") {
    const moodStr = request.mood.length > 0 ? request.mood[0] : "";
    const activityStr = request.activity.length > 0 ? request.activity[0] : "";
    const genreStr = request.genres.length > 0 ? request.genres[0] : "";

    if (moodStr && activityStr) {
      title = `${moodStr} ${activityStr}`;
    } else if (moodStr && genreStr) {
      title = `${moodStr} ${genreStr}`;
    } else if (genreStr) {
      title = `${genreStr} Mix`;
    } else {
      title = "My Playlist";
    }

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Generate subtitle if needed
  if (!subtitle || subtitle.length < 20) {
    const parts: string[] = [];
    
    if (request.genres.length > 0) {
      parts.push(request.genres.slice(0, 2).join(" & "));
    }
    
    if (request.mood.length > 0) {
      parts.push(request.mood[0] + " vibes");
    }
    
    if (request.activity.length > 0) {
      parts.push(`for ${request.activity[0]}`);
    }

    subtitle = parts.length > 0
      ? parts.join(" • ")
      : `${request.length.value} ${request.length.type === "minutes" ? "minutes" : "tracks"}`;
  }

  // Truncate if too long
  if (title.length > 50) {
    title = title.substring(0, 47) + "...";
  }
  if (subtitle.length > 100) {
    subtitle = subtitle.substring(0, 97) + "...";
  }

  const emoji = includeEmoji ? selectEmoji(request, strategy) : null;

  return { title, subtitle, emoji };
}

