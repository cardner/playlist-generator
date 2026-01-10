/**
 * Spotify Playlist Import
 * 
 * Imports Spotify playlists as collections or saved playlists.
 * Maps playlist tracks to imported Spotify tracks.
 * 
 * @module features/spotify-import/playlist-collection
 */

import { db } from "@/db/schema";
import type { LibraryRootRecord, SavedPlaylistRecord } from "@/db/schema";
import type { SpotifyPlaylist } from "./types";
import { getSpotifyTracks, generateTrackFileId } from "./track-storage";
import { createSpotifyCollection } from "./collection-creator";
import { logger } from "@/lib/logger";

/**
 * Import Spotify playlists as separate collections
 * 
 * Creates one collection per playlist, each containing only the tracks from that playlist.
 * 
 * @param playlists - Array of Spotify playlists to import
 * @param baseCollectionName - Base name for collections (will append playlist name)
 * @returns Array of created collection IDs
 */
export async function importPlaylistsAsCollections(
  playlists: SpotifyPlaylist[],
  baseCollectionName: string = "Spotify Playlist"
): Promise<string[]> {
  const collectionIds: string[] = [];

  for (const playlist of playlists) {
    try {
      // Create a collection for this playlist
      const collectionName = `${baseCollectionName}: ${playlist.name}`;
      const now = Date.now();
      const collectionId = `spotify-playlist-${now}-${Math.random().toString(36).substr(2, 9)}`;

      const libraryRoot: LibraryRootRecord = {
        id: collectionId,
        mode: "spotify",
        name: collectionName,
        spotifyExportMetadata: {
          exportDate: new Date().toISOString(),
          filePaths: [],
        },
        createdAt: now,
        updatedAt: now,
      };

      await db.libraryRoots.put(libraryRoot);

      // Import tracks for this playlist
      const { saveSpotifyTracks } = await import("./track-storage");
      await saveSpotifyTracks(playlist.tracks, collectionId);

      collectionIds.push(collectionId);
      logger.info(`Imported playlist "${playlist.name}" as collection ${collectionId}`);
    } catch (error) {
      logger.error(`Failed to import playlist "${playlist.name}":`, error);
    }
  }

  return collectionIds;
}

/**
 * Import Spotify playlists as saved playlists
 * 
 * Creates SavedPlaylistRecord entries linked to the main Spotify collection.
 * 
 * @param playlists - Array of Spotify playlists to import
 * @param libraryRootId - ID of the main Spotify collection
 * @returns Array of created playlist IDs
 */
export async function importPlaylistsAsSavedPlaylists(
  playlists: SpotifyPlaylist[],
  libraryRootId: string
): Promise<string[]> {
  const playlistIds: string[] = [];

  // Get all Spotify tracks from the collection to map playlist tracks
  const spotifyTracks = await getSpotifyTracks(libraryRootId);
  const trackMap = new Map<string, string>(); // Spotify URI or artist+track -> trackFileId

  for (const track of spotifyTracks) {
    if (track.spotifyUri) {
      trackMap.set(track.spotifyUri, track.trackFileId);
    }
    // Also index by artist+track for fallback matching
    const key = `${track.tags.artist}|${track.tags.title}`.toLowerCase();
    trackMap.set(key, track.trackFileId);
  }

  for (const playlist of playlists) {
    try {
      // Map playlist tracks to trackFileIds
      const trackFileIds: string[] = [];

      for (const spotifyTrack of playlist.tracks) {
        // Try to find track by URI first
        let trackFileId: string | undefined;

        if (spotifyTrack.uri) {
          trackFileId = trackMap.get(spotifyTrack.uri);
        }

        // Fallback to artist+track matching
        if (!trackFileId) {
          const key = `${spotifyTrack.artist}|${spotifyTrack.track}`.toLowerCase();
          trackFileId = trackMap.get(key);
        }

        // Generate trackFileId if not found (will create virtual track)
        if (!trackFileId) {
          trackFileId = generateTrackFileId(spotifyTrack);
        }

        trackFileIds.push(trackFileId);
      }

      // Create saved playlist record
      const playlistId = `spotify-playlist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = Date.now();

      // Calculate total duration
      const totalDuration = playlist.tracks.reduce((sum, track) => {
        return sum + (track.duration ? Math.floor(track.duration / 1000) : 0);
      }, 0);

      const savedPlaylist: SavedPlaylistRecord = {
        id: playlistId,
        title: playlist.name,
        description: playlist.description || `Imported from Spotify: ${playlist.name}`,
        trackFileIds,
        summary: {
          genreMix: {},
          tempoMix: {},
          artistMix: {},
          totalDuration,
          trackCount: trackFileIds.length,
          avgDuration: trackFileIds.length > 0 ? totalDuration / trackFileIds.length : 0,
        },
        strategy: {
          title: playlist.name,
          description: playlist.description || "",
          constraints: {},
          scoringWeights: {},
          diversityRules: {},
          vibeTags: [],
        },
        libraryRootId,
        createdAt: playlist.created ? new Date(playlist.created).getTime() : now,
        updatedAt: playlist.modified ? new Date(playlist.modified).getTime() : now,
      };

      await db.savedPlaylists.put(savedPlaylist);
      playlistIds.push(playlistId);

      logger.info(`Imported playlist "${playlist.name}" as saved playlist ${playlistId}`);
    } catch (error) {
      logger.error(`Failed to import playlist "${playlist.name}":`, error);
    }
  }

  return playlistIds;
}

