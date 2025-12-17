/**
 * Local storage utilities for playlist draft state
 */

import type { PlaylistRequest } from "@/types/playlist";

const DRAFT_STORAGE_KEY = "playlist-draft";

export function savePlaylistDraft(request: Partial<PlaylistRequest>): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(request));
  } catch (error) {
    console.error("Failed to save playlist draft:", error);
  }
}

export function loadPlaylistDraft(): Partial<PlaylistRequest> | null {
  try {
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as Partial<PlaylistRequest>;
  } catch (error) {
    console.error("Failed to load playlist draft:", error);
    return null;
  }
}

export function clearPlaylistDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear playlist draft:", error);
  }
}

