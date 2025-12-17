/**
 * Types for playlist generation requests
 */

export type LengthType = "minutes" | "tracks";

export interface LengthSpec {
  type: LengthType;
  value: number;
}

export interface TempoSpec {
  bucket?: "slow" | "medium" | "fast";
  bpmRange?: {
    min: number;
    max: number;
  };
}

export interface PlaylistRequest {
  genres: string[];
  length: LengthSpec;
  mood: string[];
  activity: string[];
  tempo: TempoSpec;
  surprise: number; // 0.0 (safe) to 1.0 (adventurous)
  minArtists?: number; // Minimum number of unique artists to include (controls variety)
  disallowedArtists?: string[]; // Artists to exclude from playlist
  suggestedArtists?: string[]; // Artists to prioritize/include in playlist
  suggestedAlbums?: string[]; // Albums to prioritize/include in playlist
  suggestedTracks?: string[]; // Track names to prioritize/include in playlist
}

export interface PlaylistRequestErrors {
  genres?: string;
  length?: string;
  mood?: string;
  activity?: string;
  tempo?: string;
  surprise?: string;
}

