/**
 * Spotify Export Parser
 * 
 * Parses Spotify GDPR/Privacy export JSON files and extracts tracks, albums,
 * artists, and playlists. Handles various export formats and missing data gracefully.
 * 
 * @module features/spotify-import/parser
 */

import type { SpotifyTrack, SpotifyPlaylist } from "./types";
import type { SpotifyExportData } from "./types";

// Re-export types for convenience
export type { SpotifyTrack, SpotifyPlaylist, SpotifyExportData } from "./types";
import { logger } from "@/lib/logger";

/**
 * Parse a Spotify export JSON file
 * 
 * Handles different file types:
 * - YourLibrary.json: Saved tracks
 * - Follow.json: Followed artists
 * - Playlist*.json: Playlists
 * 
 * @param fileName - Name of the file being parsed
 * @param fileContent - JSON content as string
 * @returns Parsed data or null if file type is not recognized
 */
export function parseSpotifyFile(
  fileName: string,
  fileContent: string
): {
  savedTracks?: SpotifyTrack[];
  followedArtists?: string[];
  playlist?: SpotifyPlaylist;
} | null {
  try {
    const data = JSON.parse(fileContent);

    // Handle "YourLibrary.json" - saved tracks
    if (fileName.toLowerCase().includes("library") || fileName.toLowerCase().includes("saved")) {
      const tracks = extractTracksFromLibrary(data);
      return { savedTracks: tracks };
    }

    // Handle "Follow.json" - followed artists
    if (fileName.toLowerCase().includes("follow")) {
      const artists = extractFollowedArtists(data);
      return { followedArtists: artists };
    }

    // Handle playlist files (Playlist1.json, Playlist2.json, etc.)
    if (fileName.toLowerCase().includes("playlist")) {
      const playlist = extractPlaylist(data, fileName);
      return playlist ? { playlist } : null;
    }

    logger.warn(`Unknown Spotify export file type: ${fileName}`);
    return null;
  } catch (error) {
    logger.error(`Failed to parse Spotify file ${fileName}:`, error);
    return null;
  }
}

/**
 * Extract tracks from "YourLibrary.json" format
 * 
 * Spotify export format may vary, so we handle multiple possible structures.
 */
function extractTracksFromLibrary(data: any): SpotifyTrack[] {
  const tracks: SpotifyTrack[] = [];

  // Handle array format
  if (Array.isArray(data)) {
    for (const item of data) {
      const track = normalizeTrack(item);
      if (track) {
        tracks.push(track);
      }
    }
    return tracks;
  }

  // Handle object with items array
  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items) {
      const track = normalizeTrack(item);
      if (track) {
        tracks.push(track);
      }
    }
    return tracks;
  }

  // Handle object with tracks array
  if (data.tracks && Array.isArray(data.tracks)) {
    for (const item of data.tracks) {
      const track = normalizeTrack(item);
      if (track) {
        tracks.push(track);
      }
    }
    return tracks;
  }

  logger.warn("Unknown library format structure");
  return tracks;
}

/**
 * Normalize a track object to SpotifyTrack format
 * 
 * Handles various field names and structures from different export versions.
 */
function normalizeTrack(item: any): SpotifyTrack | null {
  // Extract track name
  const trackName =
    item.track ||
    item.name ||
    item.title ||
    item.trackName ||
    (item.track && item.track.name) ||
    "";

  // Extract artist
  const artist =
    item.artist ||
    item.artistName ||
    (item.artists && Array.isArray(item.artists) && item.artists[0]?.name) ||
    (item.track && item.track.artists && Array.isArray(item.track.artists) && item.track.artists[0]?.name) ||
    "";

  // Extract album
  const album =
    item.album ||
    item.albumName ||
    item.collectionName ||
    (item.track && item.track.album && item.track.album.name) ||
    undefined;

  // Extract album artist
  const albumArtist =
    item.albumArtist ||
    (item.track && item.track.album && item.track.album.artists && Array.isArray(item.track.album.artists) && item.track.album.artists[0]?.name) ||
    undefined;

  // Extract duration (convert to milliseconds if in seconds)
  let duration: number | undefined;
  if (item.duration) {
    duration = typeof item.duration === "number" ? item.duration : parseInt(item.duration, 10);
    // If duration is less than 100000, assume it's in seconds and convert to milliseconds
    if (duration !== undefined && duration !== null && !isNaN(duration) && duration < 100000) {
      duration = duration * 1000;
    }
  } else if (item.track && item.track.duration_ms) {
    duration = item.track.duration_ms;
  }

  // Extract URI
  const uri =
    item.uri ||
    item.trackUri ||
    (item.track && item.track.uri) ||
    undefined;

  // Extract added date
  const addedAt =
    item.addedAt ||
    item.added_at ||
    item.dateAdded ||
    (item.added_at && new Date(item.added_at).toISOString()) ||
    undefined;

  // Require at least track name and artist
  if (!trackName || !artist) {
    return null;
  }

  return {
    artist: artist.trim(),
    track: trackName.trim(),
    album: album?.trim(),
    albumArtist: albumArtist?.trim(),
    duration,
    uri,
    addedAt,
  };
}

/**
 * Extract followed artists from "Follow.json" format
 */
function extractFollowedArtists(data: any): string[] {
  const artists: string[] = [];

  // Handle array format
  if (Array.isArray(data)) {
    for (const item of data) {
      const artist = extractArtistName(item);
      if (artist) {
        artists.push(artist);
      }
    }
    return artists;
  }

  // Handle object with items array
  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items) {
      const artist = extractArtistName(item);
      if (artist) {
        artists.push(artist);
      }
    }
    return artists;
  }

  // Handle object with artists array
  if (data.artists && Array.isArray(data.artists)) {
    for (const item of data.artists) {
      const artist = extractArtistName(item);
      if (artist) {
        artists.push(artist);
      }
    }
    return artists;
  }

  return artists;
}

/**
 * Extract artist name from various formats
 */
function extractArtistName(item: any): string | null {
  const name =
    item.name ||
    item.artist ||
    item.artistName ||
    (item.artist && item.artist.name) ||
    "";

  return name ? name.trim() : null;
}

/**
 * Extract playlist from playlist JSON file
 */
function extractPlaylist(data: any, fileName: string): SpotifyPlaylist | null {
  // Extract playlist name
  const name =
    data.name ||
    data.playlistName ||
    data.title ||
    fileName.replace(/\.json$/i, "").replace(/playlist/i, "Playlist ").trim() ||
    "Unnamed Playlist";

  // Extract description
  const description =
    data.description ||
    data.desc ||
    undefined;

  // Extract tracks
  const tracks: SpotifyTrack[] = [];
  const items = data.items || data.tracks || (Array.isArray(data) ? data : []);

  for (const item of items) {
    const track = normalizeTrack(item);
    if (track) {
      tracks.push(track);
    }
  }

  // Extract dates
  const created =
    data.created ||
    data.createdAt ||
    data.dateCreated ||
    undefined;

  const modified =
    data.modified ||
    data.modifiedAt ||
    data.lastModified ||
    data.updatedAt ||
    undefined;

  return {
    name: name.trim(),
    description: description?.trim(),
    tracks,
    created,
    modified,
  };
}

/**
 * Parse multiple Spotify export files
 * 
 * Processes an array of files and combines the results.
 * 
 * @param files - Array of { fileName, content } objects
 * @returns Combined export data
 */
export function parseSpotifyExport(
  files: Array<{ fileName: string; content: string }>
): SpotifyExportData {
  const savedTracks: SpotifyTrack[] = [];
  const followedArtists: string[] = [];
  const playlists: SpotifyPlaylist[] = [];
  const filePaths: string[] = [];

  for (const file of files) {
    filePaths.push(file.fileName);
    const result = parseSpotifyFile(file.fileName, file.content);

    if (result?.savedTracks) {
      savedTracks.push(...result.savedTracks);
    }

    if (result?.followedArtists) {
      followedArtists.push(...result.followedArtists);
    }

    if (result?.playlist) {
      playlists.push(result.playlist);
    }
  }

  // Remove duplicate tracks (by URI if available, otherwise by artist+track)
  const uniqueTracks = deduplicateTracks(savedTracks);

  // Remove duplicate artists
  const uniqueArtists = Array.from(new Set(followedArtists.map((a) => a.trim())));

  return {
    savedTracks: uniqueTracks,
    followedArtists: uniqueArtists,
    playlists,
    metadata: {
      exportDate: new Date().toISOString(),
      filePaths,
    },
  };
}

/**
 * Remove duplicate tracks from array
 */
function deduplicateTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seen = new Set<string>();
  const unique: SpotifyTrack[] = [];

  for (const track of tracks) {
    // Use URI as primary key if available
    const key = track.uri || `${track.artist.toLowerCase()}|${track.track.toLowerCase()}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(track);
    }
  }

  return unique;
}

