/**
 * TypeScript types for MusicBrainz entities
 * 
 * Maps MusicBrainz database schema to application types
 */

/**
 * MusicBrainz Recording entity
 */
export interface MusicBrainzRecording {
  id: string; // MBID (UUID)
  gid: string; // Global ID
  name: string; // Recording title
  length?: number; // Duration in milliseconds
  comment?: string;
  edits_pending: number;
  last_updated?: string; // ISO timestamp
}

/**
 * MusicBrainz Artist entity
 */
export interface MusicBrainzArtist {
  id: number;
  gid: string; // MBID (UUID)
  name: string;
  sort_name: string;
  begin_date_year?: number;
  begin_date_month?: number;
  begin_date_day?: number;
  end_date_year?: number;
  end_date_month?: number;
  end_date_day?: number;
  type?: number; // Artist type ID
  area?: number; // Area ID
  gender?: number; // Gender ID
  comment?: string;
  edits_pending: number;
  last_updated?: string;
}

/**
 * MusicBrainz Release entity
 */
export interface MusicBrainzRelease {
  id: number;
  gid: string; // MBID (UUID)
  name: string; // Release title
  artist_credit: number; // Artist credit ID
  release_group: number; // Release group ID
  status?: number; // Release status ID
  packaging?: number; // Packaging type ID
  language?: number; // Language ID
  script?: number; // Script ID
  barcode?: string;
  comment?: string;
  edits_pending: number;
  quality: number; // Data quality
  last_updated?: string;
}

/**
 * MusicBrainz Release Group entity
 */
export interface MusicBrainzReleaseGroup {
  id: number;
  gid: string; // MBID (UUID)
  name: string; // Release group title
  artist_credit: number; // Artist credit ID
  type?: number; // Release group type ID (album, single, etc.)
  comment?: string;
  edits_pending: number;
  last_updated?: string;
}

/**
 * MusicBrainz Tag entity
 */
export interface MusicBrainzTag {
  id: number;
  name: string; // Tag name (e.g., genre)
  ref_count?: number; // Number of times tag is used
}

/**
 * MusicBrainz Genre entity
 */
export interface MusicBrainzGenre {
  id: number;
  gid: string; // MBID (UUID)
  name: string;
  comment?: string;
}

/**
 * MusicBrainz Relationship entity
 */
export interface MusicBrainzRelationship {
  id: number;
  link_type: number; // Relationship type ID
  entity0: number; // First entity ID
  entity1: number; // Second entity ID
  begin_date_year?: number;
  begin_date_month?: number;
  begin_date_day?: number;
  end_date_year?: number;
  end_date_month?: number;
  end_date_day?: number;
  ended: boolean;
}

/**
 * Recording with artist and release information
 * This is a combined view for easier querying
 */
export interface MusicBrainzRecordingWithDetails {
  recording: MusicBrainzRecording;
  artist_credit: {
    id: number;
    name: string; // Combined artist name
    artists: Array<{
      artist: MusicBrainzArtist;
      position: number;
      name?: string; // Credit name if different
    }>;
  };
  releases: Array<{
    release: MusicBrainzRelease;
    release_group: MusicBrainzReleaseGroup;
  }>;
  tags?: MusicBrainzTag[];
  genres?: MusicBrainzGenre[];
}

/**
 * Simplified recording result for discovery
 */
export interface MusicBrainzRecordingResult {
  mbid: string; // Recording MBID
  title: string;
  artist: string; // Primary artist name
  artists: string[]; // All artist names
  album?: string; // Primary release title
  albums?: string[]; // All release titles
  genres: string[];
  duration?: number; // Duration in seconds
  releaseDate?: string; // ISO date string
  releaseYear?: number;
  tags?: string[]; // User tags
  relationships?: Array<{
    type: string;
    target: string; // Target entity name
    targetType: string; // artist, release, etc.
  }>;
}

