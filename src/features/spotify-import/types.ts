/**
 * Spotify Import Types
 * 
 * TypeScript types for Spotify GDPR/Privacy export JSON data structures.
 * These types represent the structure of data exported from Spotify's privacy portal.
 * 
 * @module features/spotify-import/types
 */

/**
 * Spotify track from export JSON
 * 
 * Represents a single track entry from Spotify's export files.
 * The exact structure may vary slightly depending on when the export was created.
 */
export interface SpotifyTrack {
  /** Artist name */
  artist: string;
  /** Track title */
  track: string;
  /** Album name (optional) */
  album?: string;
  /** Album artist (optional, may differ from track artist) */
  albumArtist?: string;
  /** Duration in milliseconds (optional) */
  duration?: number;
  /** Spotify URI (e.g., "spotify:track:4iV5W9uYEdYUVa79Axb7Rh") */
  uri?: string;
  /** ISO date string when track was added to library */
  addedAt?: string;
}

/**
 * Spotify playlist from export JSON
 * 
 * Represents a playlist exported from Spotify.
 * Playlists are typically in separate JSON files (Playlist1.json, Playlist2.json, etc.)
 */
export interface SpotifyPlaylist {
  /** Playlist name */
  name: string;
  /** Playlist description (optional) */
  description?: string;
  /** Array of tracks in the playlist */
  tracks: SpotifyTrack[];
  /** ISO date string when playlist was created */
  created?: string;
  /** ISO date string when playlist was last modified */
  modified?: string;
}

/**
 * Parsed Spotify export data
 * 
 * Contains all data extracted from a Spotify export.
 */
export interface SpotifyExportData {
  /** Saved tracks from "YourLibrary.json" */
  savedTracks: SpotifyTrack[];
  /** Followed artists from "Follow.json" */
  followedArtists: string[];
  /** Playlists from "Playlist*.json" files */
  playlists: SpotifyPlaylist[];
  /** Export metadata */
  metadata: {
    /** Date when export was created (from file timestamps or export date) */
    exportDate: string;
    /** Paths to source JSON files */
    filePaths: string[];
  };
}

/**
 * Spotify import result
 * 
 * Result of importing Spotify data into a collection.
 */
export interface SpotifyImportResult {
  /** ID of the created collection */
  collectionId: string;
  /** Number of tracks imported */
  trackCount: number;
  /** Number of playlists imported */
  playlistCount: number;
  /** Number of followed artists */
  artistCount: number;
  /** Tracks that couldn't be imported (with reasons) */
  errors: Array<{
    track: SpotifyTrack;
    reason: string;
  }>;
}

