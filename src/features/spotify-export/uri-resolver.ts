/**
 * Spotify URI Resolver
 * 
 * Resolves Spotify URIs for playlist tracks by looking up Spotify metadata
 * from imported collections or linked tracks.
 * 
 * @module features/spotify-export/uri-resolver
 */

import { db } from "@/db/schema";
import type { TrackRecord } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Resolve Spotify URI for a track
 * 
 * Attempts to find a Spotify URI for a track by:
 * 1. Checking if track has spotifyUri stored
 * 2. Looking up linked Spotify track
 * 3. Searching for matching Spotify track in collections
 * 
 * @param track - Track to resolve URI for
 * @param libraryRootId - Optional library root ID to search within
 * @returns Spotify URI or undefined
 */
export async function resolveSpotifyUri(
  track: TrackRecord,
  libraryRootId?: string
): Promise<string | undefined> {
  // If track already has a Spotify URI, use it
  if (track.spotifyUri) {
    return track.spotifyUri;
  }

  // If track is linked to a Spotify track, get URI from linked track
  if (track.linkedLocalTrackId) {
    try {
      const linkedTrack = await db.tracks.get(track.linkedLocalTrackId);
      if (linkedTrack?.spotifyUri) {
        return linkedTrack.spotifyUri;
      }
    } catch (error) {
      logger.debug(`Failed to get linked track ${track.linkedLocalTrackId}:`, error);
    }
  }

  // Search for matching Spotify track in collections
  if (libraryRootId) {
    // Search within the same collection first
    const spotifyTracks = await db.tracks
      .where("libraryRootId")
      .equals(libraryRootId)
      .filter((t) => t.source === "spotify")
      .toArray();

    const match = findMatchingSpotifyTrack(track, spotifyTracks);
    if (match) {
      return match.spotifyUri;
    }
  }

  // Search all Spotify collections
  const allSpotifyTracks = await db.tracks
    .filter((t) => t.source === "spotify")
    .toArray();

  const match = findMatchingSpotifyTrack(track, allSpotifyTracks);
  return match?.spotifyUri;
}

/**
 * Find matching Spotify track by artist and title
 */
function findMatchingSpotifyTrack(
  track: TrackRecord,
  spotifyTracks: TrackRecord[]
): TrackRecord | undefined {
  const normalizedArtist = track.tags.artist.toLowerCase().trim();
  const normalizedTitle = track.tags.title.toLowerCase().trim();

  return spotifyTracks.find((st) => {
    const stArtist = st.tags.artist.toLowerCase().trim();
    const stTitle = st.tags.title.toLowerCase().trim();
    return stArtist === normalizedArtist && stTitle === normalizedTitle;
  });
}

/**
 * Resolve Spotify URIs for multiple tracks
 * 
 * @param tracks - Array of tracks to resolve
 * @param libraryRootId - Optional library root ID to search within
 * @returns Map of trackFileId -> Spotify URI (or undefined)
 */
export async function resolveSpotifyUris(
  tracks: TrackRecord[],
  libraryRootId?: string
): Promise<Map<string, string | undefined>> {
  const uriMap = new Map<string, string | undefined>();

  // Resolve URIs in parallel for better performance
  const resolutions = await Promise.all(
    tracks.map(async (track) => {
      const uri = await resolveSpotifyUri(track, libraryRootId);
      return { trackFileId: track.trackFileId, uri };
    })
  );

  for (const { trackFileId, uri } of resolutions) {
    uriMap.set(trackFileId, uri);
  }

  return uriMap;
}

/**
 * Check if a collection has Spotify tracks
 * 
 * @param libraryRootId - Library root ID to check
 * @returns True if collection contains Spotify tracks
 */
export async function hasSpotifyTracks(libraryRootId: string): Promise<boolean> {
  const count = await db.tracks
    .where("libraryRootId")
    .equals(libraryRootId)
    .filter((t) => t.source === "spotify")
    .count();

  return count > 0;
}

