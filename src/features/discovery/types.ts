/**
 * Types for music discovery feature
 */

import type { TrackRecord } from '@/db/schema';
import type { PlaylistRequest } from '@/types/playlist';
import type { PlaylistStrategy } from '@/features/playlists/strategy';
import type { MusicBrainzRecordingResult } from './musicbrainz-types';

/**
 * Discovery track - a track suggested from MusicBrainz that's not in user's library
 */
export interface DiscoveryTrack {
  mbid: string; // MusicBrainz ID
  title: string;
  artist: string;
  album?: string;
  genres: string[];
  duration?: number; // Duration in seconds
  releaseDate?: string; // ISO date string
  releaseYear?: number;
  score: number; // Relevance score (0-1)
  inspiringTrackId: string; // Which library track inspired this discovery
  explanation?: string; // Generated explanation for why this track is suggested
  tags?: string[]; // MusicBrainz tags
  relationships?: Array<{
    type: string;
    target: string;
    targetType: string;
  }>;
}

/**
 * Discovery track with position in playlist
 */
export interface DiscoveryTrackPlacement {
  position: number; // Position in playlist (after library track)
  discoveryTrack: DiscoveryTrack;
  inspiringTrackId: string;
  inspiringTrack?: TrackRecord; // Reference to the inspiring track
  section?: string; // Assigned by ordering engine (warmup/peak/cooldown)
}

/**
 * Parameters for finding discovery tracks
 */
export interface FindDiscoveryTracksParams {
  libraryTrack: TrackRecord;
  userLibrary: TrackRecord[];
  request: PlaylistRequest;
  strategy: PlaylistStrategy;
  excludeMbids?: string[]; // MBIDs to exclude (already suggested)
}

/**
 * Options for discovery track generation
 */
export interface DiscoveryOptions {
  enabled: boolean;
  frequency: 'every' | 'every_other' | 'custom';
  maxPerPlaylist?: number; // Maximum discovery tracks per playlist
  minScore?: number; // Minimum relevance score (0-1)
}

