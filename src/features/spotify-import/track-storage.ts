/**
 * Spotify Track Storage
 * 
 * Functions for storing Spotify tracks as virtual tracks in IndexedDB.
 * Virtual tracks have metadata but no file system references.
 * 
 * @module features/spotify-import/track-storage
 */

import { db, getCompositeId } from "@/db/schema";
import type { TrackRecord } from "@/db/schema";
import type { SpotifyTrack } from "./types";
import { logger } from "@/lib/logger";
import {
  buildMetadataFingerprint,
  resolveGlobalTrackIdentity,
} from "@/features/library/track-identity-utils";

/**
 * Convert Spotify track to TrackRecord format
 * 
 * Creates a virtual track (no filePath/fileName) with Spotify metadata.
 * 
 * @param spotifyTrack - Spotify track data
 * @param libraryRootId - ID of the Spotify collection
 * @param trackFileId - Unique identifier for this track (generated from Spotify URI or artist+track)
 * @returns TrackRecord ready to be stored
 */
export async function spotifyTrackToRecord(
  spotifyTrack: SpotifyTrack,
  libraryRootId: string,
  trackFileId: string
): Promise<TrackRecord> {
  const id = getCompositeId(trackFileId, libraryRootId);
  const now = Date.now();

  // Convert duration from milliseconds to seconds if provided
  let durationSeconds: number | undefined;
  if (spotifyTrack.duration !== undefined && spotifyTrack.duration !== null) {
    durationSeconds = Math.floor(spotifyTrack.duration / 1000);
  }

  const metadataFingerprint = buildMetadataFingerprint(
    {
      title: spotifyTrack.track,
      artist: spotifyTrack.artist,
      album: spotifyTrack.album || "",
      genres: [],
      year: undefined,
      trackNo: undefined,
      discNo: undefined,
    },
    durationSeconds ? { durationSeconds } : undefined
  );
  const identity = resolveGlobalTrackIdentity(
    { musicbrainzId: undefined, isrc: undefined, metadataFingerprint },
    undefined
  );

  // Parse addedAt from Spotify export (ISO string) to Unix ms
  let addedAtMs: number | undefined;
  if (spotifyTrack.addedAt) {
    const parsed = Date.parse(spotifyTrack.addedAt);
    addedAtMs = Number.isNaN(parsed) ? undefined : parsed;
  }
  if (addedAtMs == null) {
    addedAtMs = now;
  }

  return {
    id,
    trackFileId,
    libraryRootId,
    tags: {
      title: spotifyTrack.track,
      artist: spotifyTrack.artist,
      album: spotifyTrack.album || "",
      genres: [], // Spotify exports don't include genres
      year: undefined,
      trackNo: undefined,
      discNo: undefined,
    },
    tech: durationSeconds
      ? {
          durationSeconds,
          // Other tech fields not available from Spotify export
        }
      : undefined,
    source: "spotify",
    spotifyUri: spotifyTrack.uri,
    metadataFingerprint,
    globalTrackId: identity.globalTrackId,
    globalTrackSource: identity.globalTrackSource,
    globalTrackConfidence: identity.globalTrackConfidence,
    updatedAt: now,
    addedAt: addedAtMs,
  };
}

/**
 * Generate a trackFileId from Spotify track data
 * 
 * Uses Spotify URI if available, otherwise generates from artist+track.
 * 
 * @param spotifyTrack - Spotify track data
 * @returns Unique track file ID
 */
export function generateTrackFileId(spotifyTrack: SpotifyTrack): string {
  // If we have a Spotify URI, extract the track ID
  if (spotifyTrack.uri) {
    const match = spotifyTrack.uri.match(/spotify:track:(.+)/);
    if (match && match[1]) {
      return `spotify-${match[1]}`;
    }
  }

  // Otherwise, generate from artist and track name
  const artistSlug = spotifyTrack.artist
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const trackSlug = spotifyTrack.track
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `spotify-${artistSlug}-${trackSlug}`;
}

/**
 * Save Spotify tracks to database
 * 
 * Stores multiple Spotify tracks as virtual tracks in a collection.
 * 
 * @param tracks - Array of Spotify tracks to save
 * @param libraryRootId - ID of the Spotify collection
 * @returns Array of saved TrackRecord objects
 */
export async function saveSpotifyTracks(
  tracks: SpotifyTrack[],
  libraryRootId: string
): Promise<TrackRecord[]> {
  const records: TrackRecord[] = [];

  for (const track of tracks) {
    try {
      const trackFileId = generateTrackFileId(track);
      const compositeId = getCompositeId(trackFileId, libraryRootId);
      const existing = await db.tracks.get(compositeId);
      const record = await spotifyTrackToRecord(track, libraryRootId, trackFileId);

      // Preserve addedAt on re-import; only set from Spotify when inserting new
      if (existing?.addedAt != null && record.addedAt != null) {
        record.addedAt = existing.addedAt;
      }

      // Use put to insert or update (in case of re-import)
      await db.tracks.put(record);
      records.push(record);
    } catch (error) {
      logger.error(`Failed to save Spotify track ${track.artist} - ${track.track}:`, error);
      // Continue with other tracks
    }
  }

  logger.info(`Saved ${records.length} Spotify tracks to collection ${libraryRootId}`);
  return records;
}

/**
 * Get all Spotify tracks for a collection
 * 
 * @param libraryRootId - ID of the Spotify collection
 * @returns Array of TrackRecord objects with source="spotify"
 */
export async function getSpotifyTracks(
  libraryRootId: string
): Promise<TrackRecord[]> {
  const tracks = await db.tracks
    .where("libraryRootId")
    .equals(libraryRootId)
    .filter((track) => track.source === "spotify")
    .toArray();

  return tracks;
}

/**
 * Check if a track has a Spotify URI
 * 
 * @param track - TrackRecord to check
 * @returns True if track has a Spotify URI
 */
export function hasSpotifyUri(track: TrackRecord): boolean {
  return !!track.spotifyUri;
}

/**
 * Get Spotify URI for a track
 * 
 * @param track - TrackRecord
 * @returns Spotify URI or undefined
 */
export function getSpotifyUri(track: TrackRecord): string | undefined {
  return track.spotifyUri;
}

