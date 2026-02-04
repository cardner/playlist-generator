/**
 * Playlist storage functions for IndexedDB
 */

import { db } from "./schema";
import type { SavedPlaylistRecord } from "./schema";
import type { GeneratedPlaylist } from "@/features/playlists";
import type { PlaylistRequest } from "@/types/playlist";

/**
 * Remove sensitive request fields before storage.
 */
function sanitizeRequestForStorage(request?: PlaylistRequest): PlaylistRequest | undefined {
  if (!request) return undefined;
  if (!request.llmConfig) return request;
  const { apiKey, ...rest } = request.llmConfig;
  return {
    ...request,
    llmConfig: Object.keys(rest).length > 0 ? rest : undefined,
  };
}

/**
 * Convert GeneratedPlaylist to SavedPlaylistRecord
 */
function playlistToRecord(
  playlist: GeneratedPlaylist,
  libraryRootId?: string,
  request?: PlaylistRequest
): SavedPlaylistRecord {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    request: sanitizeRequestForStorage(request),
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
    customEmoji: playlist.customEmoji,
    discoveryTracks: playlist.discoveryTracks?.map(dt => ({
      position: dt.position,
      mbid: dt.discoveryTrack.mbid,
      title: dt.discoveryTrack.title,
      artist: dt.discoveryTrack.artist,
      album: dt.discoveryTrack.album,
      genres: dt.discoveryTrack.genres,
      duration: dt.discoveryTrack.duration,
      explanation: dt.discoveryTrack.explanation || "",
      inspiringTrackId: dt.inspiringTrackId,
      section: dt.section,
    })),
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
    customEmoji: record.customEmoji,
    discoveryTracks: record.discoveryTracks?.map(dt => ({
      position: dt.position,
      discoveryTrack: {
        mbid: dt.mbid,
        title: dt.title,
        artist: dt.artist,
        album: dt.album,
        genres: dt.genres,
        duration: dt.duration,
        score: 0.8, // Default score (not stored)
        inspiringTrackId: dt.inspiringTrackId,
        explanation: dt.explanation,
      },
      inspiringTrackId: dt.inspiringTrackId,
      section: dt.section,
    })),
  };
}

/**
 * Save a playlist to IndexedDB
 */
export async function savePlaylist(
  playlist: GeneratedPlaylist,
  libraryRootId?: string,
  request?: PlaylistRequest
): Promise<void> {
  const record = playlistToRecord(playlist, libraryRootId, request);
  await db.savedPlaylists.put(record);
}

/**
 * Update an existing saved playlist with new data
 */
export async function updatePlaylist(
  playlist: GeneratedPlaylist,
  libraryRootId?: string,
  request?: PlaylistRequest
): Promise<void> {
  let resolvedRequest = request;
  if (!resolvedRequest) {
    const existing = await db.savedPlaylists.get(playlist.id);
    resolvedRequest = existing?.request;
  }
  const record = playlistToRecord(playlist, libraryRootId, resolvedRequest);
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
 * Get a saved playlist request by ID
 */
export async function getSavedPlaylistRequest(id: string): Promise<PlaylistRequest | undefined> {
  const record = await db.savedPlaylists.get(id);
  return record?.request;
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

/**
 * Get the collection ID for a saved playlist
 */
export async function getPlaylistCollectionId(id: string): Promise<string | undefined> {
  const record = await db.savedPlaylists.get(id);
  return record?.libraryRootId;
}

/**
 * Get all saved playlists with their collection IDs
 */
export async function getAllSavedPlaylistsWithCollections(): Promise<Array<{
  playlist: GeneratedPlaylist;
  collectionId?: string;
  request?: PlaylistRequest;
}>> {
  const records = await db.savedPlaylists
    .orderBy("updatedAt")
    .reverse()
    .toArray();
  const results: Array<{
    playlist: GeneratedPlaylist;
    collectionId?: string;
    request?: PlaylistRequest;
  }> = [];
  for (const record of records) {
    let collectionId = record.libraryRootId;
    if (!collectionId && record.trackFileIds.length > 0) {
      const tracks = await db.tracks
        .where("trackFileId")
        .anyOf(record.trackFileIds)
        .toArray();
      const counts = new Map<string, number>();
      for (const track of tracks) {
        if (!track.libraryRootId) continue;
        counts.set(track.libraryRootId, (counts.get(track.libraryRootId) ?? 0) + 1);
      }
      let bestId: string | undefined;
      let bestCount = 0;
      for (const [id, count] of counts.entries()) {
        if (count > bestCount) {
          bestId = id;
          bestCount = count;
        }
      }
      if (bestId) {
        collectionId = bestId;
        await db.savedPlaylists.update(record.id, { libraryRootId: bestId });
      }
    }
    results.push({
      playlist: recordToPlaylist(record),
      collectionId,
      request: record.request,
    });
  }
  return results;
}

