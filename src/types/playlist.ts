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

export type AgentType = "built-in" | "llm";
export type LLMProvider = "openai" | "gemini" | "claude" | "local";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string; // Not stored in request, only used during generation
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
  agentType?: AgentType; // "built-in" or "llm"
  llmConfig?: LLMConfig; // LLM provider configuration
}

export interface PlaylistRequestErrors {
  genres?: string;
  length?: string;
  mood?: string;
  activity?: string;
  tempo?: string;
  surprise?: string;
}

export interface PlaylistValidation {
  isValid: boolean;
  score: number; // 0-1
  requirementCoverage: {
    genres: { met: boolean; score: number; explanation: string };
    mood: { met: boolean; score: number; explanation: string };
    activity: { met: boolean; score: number; explanation: string };
    tempo: { met: boolean; score: number; explanation: string };
    length: { met: boolean; score: number; explanation: string };
    diversity: { met: boolean; score: number; explanation: string };
  };
  issues: string[];
  strengths: string[];
  suggestions: string[];
}

export interface PlaylistExplanation {
  explanation: string; // Natural language explanation
  keyTracks: Array<{ trackFileId: string; reason: string }>;
  flowDescription: string;
}

export interface LLMRefinedTrackScore {
  trackFileId: string;
  refinedScore: number; // 0-1
  explanation: string;
  semanticMatch: {
    moodMatch: boolean;
    activityMatch: boolean;
    genreRelationship: string; // e.g., "closely related", "distant but compatible"
  };
}

