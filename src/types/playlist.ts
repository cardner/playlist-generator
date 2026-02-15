/**
 * Types for playlist generation requests and related data structures
 * 
 * This module defines all TypeScript types and interfaces used throughout
 * the playlist generation system, including request parameters, validation
 * results, and LLM integration types.
 * 
 * @module types/playlist
 */

/**
 * Type of length specification for playlist generation
 * 
 * - "minutes": Playlist length specified in minutes
 * - "tracks": Playlist length specified as number of tracks
 * 
 * @example
 * ```typescript
 * const length: LengthType = "minutes";
 * ```
 */
export type LengthType = "minutes" | "tracks";

/**
 * Specification for playlist length
 * 
 * Defines how long the playlist should be, either by duration (minutes)
 * or by number of tracks.
 * 
 * @example
 * ```typescript
 * // 60-minute playlist
 * const length: LengthSpec = { type: "minutes", value: 60 };
 * 
 * // 20-track playlist
 * const length: LengthSpec = { type: "tracks", value: 20 };
 * ```
 */
export interface LengthSpec {
  /** How the length is specified (minutes or tracks) */
  type: LengthType;
  /** The numeric value (minutes or track count) */
  value: number;
}

/**
 * Tempo specification for playlist generation
 * 
 * Can specify tempo either as a bucket (slow/medium/fast) or as a
 * BPM range. If both are provided, the BPM range takes precedence.
 * 
 * @example
 * ```typescript
 * // Using tempo bucket
 * const tempo: TempoSpec = { bucket: "medium" };
 * 
 * // Using BPM range
 * const tempo: TempoSpec = { bpmRange: { min: 120, max: 140 } };
 * ```
 */
export interface TempoSpec {
  /** Tempo bucket category (optional) */
  bucket?: "slow" | "medium" | "fast";
  /** BPM range specification (optional, takes precedence over bucket) */
  bpmRange?: {
    /** Minimum BPM */
    min: number;
    /** Maximum BPM */
    max: number;
  };
}

/**
 * Type of agent used for playlist generation
 * 
 * - "built-in": Uses the deterministic matching engine (default)
 * - "llm": Uses LLM-powered strategy generation and refinement
 * 
 * @example
 * ```typescript
 * const agentType: AgentType = "llm";
 * ```
 */
export type AgentType = "built-in" | "llm";

/**
 * Supported LLM providers for playlist generation
 * 
 * - "openai": OpenAI GPT models (GPT-3.5, GPT-4)
 * - "gemini": Google Gemini models
 * - "claude": Anthropic Claude models
 * - "local": Local LLM API endpoint
 * 
 * @example
 * ```typescript
 * const provider: LLMProvider = "openai";
 * ```
 */
export type LLMProvider = "openai" | "gemini" | "claude" | "local";

/**
 * Configuration for LLM integration
 * 
 * Contains provider information and API key. The API key is not
 * stored in the request object for security reasons - it's only
 * used during generation and must be provided separately.
 * 
 * @example
 * ```typescript
 * const llmConfig: LLMConfig = {
 *   provider: "openai",
 *   apiKey: "sk-..." // Provided at runtime, not stored
 * };
 * ```
 */
export interface LLMConfig {
  /** LLM provider to use */
  provider: LLMProvider;
  /** API key for the provider (not stored in request, only used during generation) */
  apiKey?: string;
}

/**
 * Complete playlist generation request
 * 
 * Contains all parameters needed to generate a playlist, including
 * genres, mood, activity, tempo, length, and optional discovery
 * settings.
 * 
 * @example
 * ```typescript
 * const request: PlaylistRequest = {
 *   genres: ["rock", "indie"],
 *   length: { type: "minutes", value: 60 },
 *   mood: ["energetic", "uplifting"],
 *   activity: ["workout", "running"],
 *   tempo: { bucket: "fast" },
 *   surprise: 0.3,
 *   minArtists: 10,
 *   suggestedArtists: ["The Beatles", "Radiohead"],
 *   agentType: "built-in"
 * };
 * ```
 */
export interface PlaylistRequest {
  /** Array of genre names to include in the playlist */
  genres: string[];
  /** Length specification (minutes or tracks) */
  length: LengthSpec;
  /** Array of mood descriptors (e.g., "energetic", "chill", "uplifting") */
  mood: string[];
  /** Array of activity descriptors (e.g., "workout", "study", "party") */
  activity: string[];
  /** Tempo specification (bucket or BPM range) */
  tempo: TempoSpec;
  /** Surprise factor: 0.0 (safe/predictable) to 1.0 (adventurous/unexpected) */
  surprise: number;
  /** Minimum number of unique artists to include (controls variety) */
  minArtists?: number;
  /** Artists to exclude from the playlist */
  disallowedArtists?: string[];
  /** Artists to prioritize/include in the playlist */
  suggestedArtists?: string[];
  /** Albums to prioritize/include in the playlist */
  suggestedAlbums?: string[];
  /** Track names to prioritize/include in the playlist */
  suggestedTracks?: string[];
  /** Agent type: "built-in" (deterministic) or "llm" (AI-powered) */
  agentType?: AgentType;
  /** LLM provider configuration (only used if agentType is "llm") */
  llmConfig?: LLMConfig;
  /** Enable music discovery feature (adds new tracks not in library) */
  enableDiscovery?: boolean;
  /** How often to insert discovery tracks: "every", "every_other", or "custom" */
  discoveryFrequency?: "every" | "every_other" | "custom";
  /** Source pool for track selection: "all" (default) or "recent" (recent additions only) */
  sourcePool?: "all" | "recent";
  /** When sourcePool is "recent", time window for recent tracks (default "30d") */
  recentWindow?: "7d" | "30d" | "90d";
  /** When sourcePool is "recent", alternative to recentWindow: use last N tracks */
  recentTrackCount?: number;
  /** Optional extra instructions for the LLM when agentType is "llm" (e.g. "favor 80s production", "no ballads") */
  llmAdditionalInstructions?: string;
}

/**
 * Validation errors for playlist request fields
 * 
 * Used to report field-specific validation errors during form submission.
 * Each field can have an error message string if validation fails.
 * 
 * @example
 * ```typescript
 * const errors: PlaylistRequestErrors = {
 *   genres: "At least one genre is required",
 *   length: "Length must be greater than 0"
 * };
 * ```
 */
export interface PlaylistRequestErrors {
  /** Error message for genres field */
  genres?: string;
  /** Error message for length field */
  length?: string;
  /** Error message for mood field */
  mood?: string;
  /** Error message for activity field */
  activity?: string;
  /** Error message for tempo field */
  tempo?: string;
  /** Error message for surprise field */
  surprise?: string;
}

/**
 * Playlist validation result from LLM analysis
 * 
 * Contains detailed validation information including requirement coverage,
 * issues, strengths, and suggestions for improvement.
 * 
 * @example
 * ```typescript
 * const validation: PlaylistValidation = {
 *   isValid: true,
 *   score: 0.85,
 *   requirementCoverage: {
 *     genres: { met: true, score: 0.9, explanation: "Good genre coverage" },
 *     // ... other requirements
 *   },
 *   issues: [],
 *   strengths: ["Good tempo consistency", "Excellent diversity"],
 *   suggestions: ["Consider adding more variety in artists"]
 * };
 * ```
 */
export interface PlaylistValidation {
  /** Whether the playlist meets all requirements */
  isValid: boolean;
  /** Overall validation score from 0.0 to 1.0 */
  score: number;
  /** Coverage analysis for each requirement */
  requirementCoverage: {
    /** Genre requirement coverage */
    genres: { met: boolean; score: number; explanation: string };
    /** Mood requirement coverage */
    mood: { met: boolean; score: number; explanation: string };
    /** Activity requirement coverage */
    activity: { met: boolean; score: number; explanation: string };
    /** Tempo requirement coverage */
    tempo: { met: boolean; score: number; explanation: string };
    /** Length requirement coverage */
    length: { met: boolean; score: number; explanation: string };
    /** Diversity requirement coverage */
    diversity: { met: boolean; score: number; explanation: string };
  };
  /** List of issues found in the playlist */
  issues: string[];
  /** List of strengths identified in the playlist */
  strengths: string[];
  /** Suggestions for improving the playlist */
  suggestions: string[];
}

/**
 * Natural language explanation of a generated playlist
 * 
 * Provides human-readable explanations of why tracks were selected
 * and how the playlist flows.
 * 
 * @example
 * ```typescript
 * const explanation: PlaylistExplanation = {
 *   explanation: "This playlist combines energetic rock tracks...",
 *   keyTracks: [
 *     { trackFileId: "abc123", reason: "Perfect tempo match" }
 *   ],
 *   flowDescription: "Starts energetic, builds to peak, then winds down"
 * };
 * ```
 */
export interface PlaylistExplanation {
  /** Natural language explanation of the playlist */
  explanation: string;
  /** Key tracks and why they were selected */
  keyTracks: Array<{ trackFileId: string; reason: string }>;
  /** Description of the playlist's flow/arc */
  flowDescription: string;
}

/**
 * LLM-refined track score with semantic matching information
 * 
 * Used when LLM refinement is enabled to provide enhanced scoring
 * based on semantic understanding of mood, activity, and genre relationships.
 * 
 * @example
 * ```typescript
 * const refinedScore: LLMRefinedTrackScore = {
 *   trackFileId: "abc123",
 *   refinedScore: 0.85,
 *   explanation: "Matches energetic mood and workout activity",
 *   semanticMatch: {
 *     moodMatch: true,
 *     activityMatch: true,
 *     genreRelationship: "closely related"
 *   }
 * };
 * ```
 */
export interface LLMRefinedTrackScore {
  /** Unique identifier for the track */
  trackFileId: string;
  /** Refined score from 0.0 to 1.0 (may exceed 1.0 with bonuses) */
  refinedScore: number;
  /** Explanation of why this score was assigned */
  explanation: string;
  /** Semantic matching analysis */
  semanticMatch: {
    /** Whether the track matches the requested mood */
    moodMatch: boolean;
    /** Whether the track matches the requested activity */
    activityMatch: boolean;
    /** Description of genre relationship (e.g., "closely related", "distant but compatible") */
    genreRelationship: string;
  };
}

/**
 * Utility type: Extract all keys from PlaylistRequest that are optional
 */
export type OptionalPlaylistRequestKeys = {
  [K in keyof PlaylistRequest]-?: {} extends Pick<PlaylistRequest, K> ? K : never;
}[keyof PlaylistRequest];

/**
 * Utility type: Extract all keys from PlaylistRequest that are required
 */
export type RequiredPlaylistRequestKeys = {
  [K in keyof PlaylistRequest]-?: {} extends Pick<PlaylistRequest, K> ? never : K;
}[keyof PlaylistRequest];

/**
 * Partial playlist request (all fields optional)
 * 
 * Useful for draft storage and incremental updates.
 */
export type PartialPlaylistRequest = Partial<PlaylistRequest>;

/**
 * Helper function to check if a playlist request is valid
 * 
 * @param request - The playlist request to validate
 * @returns True if the request has all required fields with valid values
 * 
 * @example
 * ```typescript
 * if (isValidPlaylistRequest(request)) {
 *   await generatePlaylist(request);
 * }
 * ```
 */
export function isValidPlaylistRequest(request: Partial<PlaylistRequest>): request is PlaylistRequest {
  const isRecentOnly = request.sourcePool === "recent";
  const hasRequiredGenres = isRecentOnly
    ? true
    : Array.isArray(request.genres) && request.genres.length > 0;
  const hasRequiredMood = isRecentOnly
    ? true
    : Array.isArray(request.mood) && request.mood.length > 0;
  const hasRequiredActivity = isRecentOnly
    ? true
    : Array.isArray(request.activity) && request.activity.length > 0;

  return (
    hasRequiredGenres &&
    request.length !== undefined &&
    request.length.type !== undefined &&
    request.length.value !== undefined &&
    request.length.value > 0 &&
    hasRequiredMood &&
    hasRequiredActivity &&
    request.tempo !== undefined &&
    typeof request.surprise === "number" &&
    request.surprise >= 0 &&
    request.surprise <= 1
  );
}

