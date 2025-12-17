/**
 * Playlist storage functions for IndexedDB
 */

import { db } from "./schema";
import type { SavedPlaylistRecord } from "./schema";
import type { GeneratedPlaylist } from "@/features/playlists";

/**
 * Convert GeneratedPlaylist to SavedPlaylistRecord
 */
function playlistToRecord(playlist: GeneratedPlaylist, libraryRootId?: string): SavedPlaylistRecord {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    trackFileIds: playlist.trackFileIds,
    summary: {
      genreMix: playlist.summary.genreMix instanceof Map
        ? Object.fromEntries(playlist.summary.genreMix)
        : playlist.summary.genreMix,
      tempoMix: playlist.summary.tempoMix instanceof Map
        ? Object.fromEntries(playlist.summary.tempoMix)
        : playlist.summary.tempoMix,
      artistMix: playlist.summary.artistMix instanceof Map
        ? Object.fromEntries(playlist.summary.artistMix)
        : playlist.summary.artistMix,
      totalDuration: playlist.summary.totalDuration,
      trackCount: playlist.summary.trackCount,
      avgDuration: playlist.summary.avgDuration,
      minDuration: playlist.summary.minDuration,
      maxDuration: playlist.summary.maxDuration,
    },
    strategy: playlist.strategy,
    libraryRootId,
    createdAt: playlist.createdAt,
    updatedAt: Date.now(),
  };
}

/**
 * Convert SavedPlaylistRecord to GeneratedPlaylist
 */
function recordToPlaylist(record: SavedPlaylistRecord): GeneratedPlaylist {
  const genreMix = record.summary.genreMix instanceof Map
    ? record.summary.genreMix
    : new Map(Object.entries(record.summary.genreMix || {}));
  const tempoMix = record.summary.tempoMix instanceof Map
    ? record.summary.tempoMix
    : new Map(Object.entries(record.summary.tempoMix || {}));
  const artistMix = record.summary.artistMix instanceof Map
    ? record.summary.artistMix
    : new Map(Object.entries(record.summary.artistMix || {}));

  const trackCount = record.summary.trackCount ?? record.trackFileIds.length;
  const avgDuration = record.summary.avgDuration ?? (trackCount > 0 ? record.summary.totalDuration / trackCount : 0);
  const minDuration = record.summary.minDuration ?? avgDuration;
  const maxDuration = record.summary.maxDuration ?? avgDuration;

  return {
    id: record.id,
    title: record.title,
    description: record.description,
    trackFileIds: record.trackFileIds,
    summary: {
      genreMix,
      tempoMix,
      artistMix,
      totalDuration: record.summary.totalDuration,
      trackCount,
      avgDuration,
      minDuration,
      maxDuration,
    },
    strategy: record.strategy,
    createdAt: record.createdAt,
    totalDuration: record.summary.totalDuration,
    trackSelections: [], // Selections not stored, will be empty
  };
}

/**
 * Save a playlist to IndexedDB
 */
export async function savePlaylist(
  playlist: GeneratedPlaylist,
  libraryRootId?: string
): Promise<void> {
  const record = playlistToRecord(playlist, libraryRootId);
  await db.savedPlaylists.put(record);
}

/**
 * Get a saved playlist by ID
 */
export async function getSavedPlaylist(id: string): Promise<GeneratedPlaylist | null> {
  const record = await db.savedPlaylists.get(id);
  if (!record) {
    return null;
  }
  return recordToPlaylist(record);
}

/**
 * Get all saved playlists, sorted by most recent first
 */
export async function getAllSavedPlaylists(): Promise<GeneratedPlaylist[]> {
  const records = await db.savedPlaylists
    .orderBy("updatedAt")
    .reverse()
    .toArray();
  return records.map(recordToPlaylist);
}

/**
 * Update playlist title and description
 */
export async function updatePlaylistMetadata(
  id: string,
  title: string,
  description?: string
): Promise<void> {
  const record = await db.savedPlaylists.get(id);
  if (!record) {
    throw new Error(`Playlist ${id} not found`);
  }
  
  await db.savedPlaylists.update(id, {
    title,
    description: description ?? record.description,
    updatedAt: Date.now(),
  });
}

/**
 * Delete a saved playlist
 */
export async function deleteSavedPlaylist(id: string): Promise<void> {
  await db.savedPlaylists.delete(id);
}

/**
 * Check if a playlist is saved
 */
export async function isPlaylistSaved(id: string): Promise<boolean> {
  const count = await db.savedPlaylists.where("id").equals(id).count();
  return count > 0;
}

