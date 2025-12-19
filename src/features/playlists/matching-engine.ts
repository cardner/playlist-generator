/**
 * Deterministic matching engine for playlist generation
 * 
 * Selects REAL tracks from IndexedDB using strategy + request.
 * Enforces constraints and provides explainable reasons for each track.
 */

import type { PlaylistRequest } from "@/types/playlist";
import type { PlaylistStrategy } from "./strategy";
import type { MatchingIndex } from "@/features/library/summarization";
import type { TrackRecord } from "@/db/schema";
import type { LLMRefinedTrackScore, LLMProvider } from "@/types/playlist";
import { orderTracks } from "./ordering";
import { normalizeGenre } from "@/features/library/genre-normalization";

export interface TrackReason {
  type: "genre_match" | "tempo_match" | "duration_fit" | "diversity" | "surprise" | "constraint";
  explanation: string;
  score: number;
}

export interface TrackSelection {
  trackFileId: string;
  track: TrackRecord;
  score: number;
  reasons: TrackReason[];
  genreMatch: number;
  tempoMatch: number;
  durationFit: number;
  diversity: number;
  surprise: number;
}

export interface PlaylistSummary {
  totalDuration: number; // seconds
  trackCount: number;
  genreMix: Map<string, number>; // genre -> count
  tempoMix: Map<string, number>; // tempo bucket -> count
  artistMix: Map<string, number>; // artist -> count
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
}

export interface GeneratedPlaylist {
  id: string;
  title: string;
  description: string;
  trackFileIds: string[];
  trackSelections: TrackSelection[];
  orderedTracks?: Array<{
    trackFileId: string;
    position: number;
    section: string;
    reasons: TrackReason[];
    transitionScore: number;
  }>;
  totalDuration: number; // seconds
  summary: PlaylistSummary;
  strategy: PlaylistStrategy;
  createdAt: number;
  validation?: import("@/types/playlist").PlaylistValidation;
  explanation?: import("@/types/playlist").PlaylistExplanation;
  discoveryTracks?: Array<{
    position: number; // Position in playlist (after library track)
    discoveryTrack: import("@/features/discovery/types").DiscoveryTrack;
    inspiringTrackId: string;
    section?: string; // Assigned by ordering engine (warmup/peak/cooldown)
  }>;
}

/**
 * Simple seeded random number generator for deterministic randomness
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * Calculate genre match score (hard/soft matching)
 * Uses normalized genres for matching
 */
function calculateGenreMatch(
  track: TrackRecord,
  requestedGenres: string[],
  strategy: PlaylistStrategy,
  matchingIndex: MatchingIndex
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  let score = 0;

  if (requestedGenres.length === 0) {
    return { score: 1, reasons: [] };
  }

  // Normalize requested genres
  const normalizedRequested = requestedGenres.map((g) => normalizeGenre(g));
  const normalizedRequestedLower = normalizedRequested.map((g) => g.toLowerCase());

  // Get normalized genres for this track from metadata
  const trackMetadata = matchingIndex.trackMetadata.get(track.trackFileId);
  const trackNormalizedGenres = trackMetadata?.normalizedGenres || 
    track.tags.genres.map((g) => normalizeGenre(g));
  const trackNormalizedLower = trackNormalizedGenres.map((g) => g.toLowerCase());

  // Hard match: exact normalized genre match
  const exactMatches = trackNormalizedLower.filter((tg) =>
    normalizedRequestedLower.includes(tg)
  );
  if (exactMatches.length > 0) {
    score = exactMatches.length / normalizedRequested.length;
    // Get display names for matched genres
    const matchedGenres = exactMatches.map((lower) => {
      const normalized = trackNormalizedGenres.find((g) => g.toLowerCase() === lower);
      return normalized || lower;
    });
    reasons.push({
      type: "genre_match",
      explanation: `Matches ${exactMatches.length} requested genre(s): ${matchedGenres.join(", ")}`,
      score: 1.0,
    });
  } else {
    // Soft match: partial/substring match on normalized genres
    const partialMatches = trackNormalizedLower.filter((tg) =>
      normalizedRequestedLower.some((rg) => tg.includes(rg) || rg.includes(tg))
    );
    if (partialMatches.length > 0) {
      score = (partialMatches.length / normalizedRequested.length) * 0.7;
      const matchedGenres = partialMatches.map((lower) => {
        const normalized = trackNormalizedGenres.find((g) => g.toLowerCase() === lower);
        return normalized || lower;
      });
      reasons.push({
        type: "genre_match",
        explanation: `Partial genre match: ${matchedGenres.join(", ")}`,
        score: 0.7,
      });
    } else {
      score = 0;
    }
  }

  // Check against required genres in strategy (normalized)
  if (strategy.constraints.requiredGenres) {
    const requiredNormalized = strategy.constraints.requiredGenres.map((g) =>
      normalizeGenre(g).toLowerCase()
    );
    const hasRequired = trackNormalizedLower.some((tg) => requiredNormalized.includes(tg));
    if (!hasRequired) {
      score *= 0.3; // Heavy penalty for missing required genres
      reasons.push({
        type: "constraint",
        explanation: "Missing required genre",
        score: 0.3,
      });
    }
  }

  return { score, reasons };
}

/**
 * Calculate tempo match score
 */
function calculateTempoMatch(
  track: TrackRecord,
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  matchingIndex: MatchingIndex
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  let score = 0.5; // Default neutral

  const trackTempoBucket =
    matchingIndex.trackMetadata.get(track.trackFileId)?.tempoBucket ||
    "unknown";

  // Match tempo bucket
  if (request.tempo.bucket) {
    if (trackTempoBucket === request.tempo.bucket) {
      score = 1.0;
      reasons.push({
        type: "tempo_match",
        explanation: `Matches tempo bucket: ${request.tempo.bucket}`,
        score: 1.0,
      });
    } else if (trackTempoBucket === "unknown") {
      score = 0.5; // Neutral for unknown
    } else {
      score = 0.2; // Low score for wrong tempo
    }
  }

  // Match BPM range if specified
  if (request.tempo.bpmRange) {
    // Note: BPM not currently extracted, so this is placeholder
    // When BPM is available, check if track BPM falls within range
    if (trackTempoBucket === "unknown") {
      score = 0.5;
    }
  }

  // Check strategy tempo guidance
  if (strategy.tempoGuidance.targetBucket) {
    if (trackTempoBucket === strategy.tempoGuidance.targetBucket) {
      score = Math.max(score, 0.9);
    } else if (
      strategy.tempoGuidance.allowVariation &&
      trackTempoBucket !== "unknown"
    ) {
      score = Math.max(score, 0.6); // Allow some variation
    }
  }

  return { score, reasons };
}

/**
 * Calculate duration fit score
 */
function calculateDurationFit(
  track: TrackRecord,
  targetDuration: number, // seconds
  currentDuration: number, // seconds
  remainingSlots: number
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  const trackDuration = track.tech?.durationSeconds || 180; // Default 3 min
  const newDuration = currentDuration + trackDuration;
  const remainingDuration = targetDuration - currentDuration;
  const avgRemaining = remainingDuration / Math.max(remainingSlots, 1);

  // Score based on how well this track fits the remaining duration
  const durationDiff = Math.abs(trackDuration - avgRemaining);
  const maxDiff = avgRemaining * 0.5; // 50% tolerance
  const fitScore = Math.max(0, 1 - durationDiff / maxDiff);

  if (fitScore > 0.8) {
    reasons.push({
      type: "duration_fit",
      explanation: `Duration fits well (${Math.round(trackDuration / 60)}:${String(Math.round(trackDuration % 60)).padStart(2, "0")})`,
      score: fitScore,
    });
  } else if (fitScore > 0.5) {
    reasons.push({
      type: "duration_fit",
      explanation: `Duration acceptable`,
      score: fitScore,
    });
  }

  return { score: fitScore, reasons };
}

/**
 * Calculate diversity score with penalties
 */
function calculateDiversity(
  track: TrackRecord,
  previousTracks: TrackRecord[],
  strategy: PlaylistStrategy
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  let score = 1.0;

  const diversityRules = strategy.diversityRules;
  const recentTracks = previousTracks.slice(-diversityRules.artistSpacing);
  const recentArtists = new Set(recentTracks.map((t) => t.tags.artist));
  const recentGenres = new Set(
    recentTracks.flatMap((t) => t.tags.genres.map((g) => g.toLowerCase()))
  );

  // Artist diversity
  const artistCount = previousTracks.filter(
    (t) => t.tags.artist === track.tags.artist
  ).length;

  if (artistCount >= diversityRules.maxTracksPerArtist) {
    score *= 0.1; // Heavy penalty
    reasons.push({
      type: "diversity",
      explanation: `Too many tracks from ${track.tags.artist} (${artistCount})`,
      score: 0.1,
    });
  } else if (recentArtists.has(track.tags.artist)) {
    score *= 0.3; // Penalty for recent artist
    reasons.push({
      type: "diversity",
      explanation: `Same artist appeared recently`,
      score: 0.3,
    });
  } else {
    reasons.push({
      type: "diversity",
      explanation: `Good artist diversity`,
      score: 1.0,
    });
  }

  // Genre diversity
  const trackGenres = track.tags.genres.map((g) => g.toLowerCase());
  const hasRecentGenre = trackGenres.some((g) => recentGenres.has(g));

  if (hasRecentGenre) {
    score *= 0.7; // Light penalty for recent genre
  }

  // Album diversity (bonus)
  const recentAlbums = new Set(recentTracks.map((t) => t.tags.album));
  if (!recentAlbums.has(track.tags.album)) {
    score *= 1.1; // Small bonus for different album
  }

  return { score, reasons };
}

/**
 * Calculate surprise factor (include nearby genres/artists)
 */
function calculateSurprise(
  track: TrackRecord,
  requestedGenres: string[],
  previousTracks: TrackRecord[],
  matchingIndex: MatchingIndex,
  surpriseLevel: number
): { score: number; reasons: TrackReason[] } {
  const reasons: TrackReason[] = [];
  let score = 0;

  if (surpriseLevel < 0.1) {
    return { score: 0, reasons: [] }; // No surprise for very safe playlists
  }

  // Normalize requested genres
  const normalizedRequested = requestedGenres.map((g) => normalizeGenre(g));
  const normalizedRequestedLower = normalizedRequested.map((g) => g.toLowerCase());

  // Get normalized genres for this track
  const trackMetadata = matchingIndex.trackMetadata.get(track.trackFileId);
  const trackNormalizedGenres = trackMetadata?.normalizedGenres || 
    track.tags.genres.map((g) => normalizeGenre(g));
  const trackNormalizedLower = trackNormalizedGenres.map((g) => g.toLowerCase());

  // Check if track has requested genres (using normalized)
  const hasRequestedGenre = trackNormalizedLower.some((tg) =>
    normalizedRequestedLower.includes(tg)
  );

  if (!hasRequestedGenre) {
    // This is a surprise track - check if it's "nearby"
    // Find artists that appear with requested genres (using normalized genres)
    const artistsWithRequestedGenres = new Set<string>();
    for (const genre of normalizedRequestedLower) {
      const genreTracks = matchingIndex.byGenre.get(genre) || [];
      for (const trackId of genreTracks) {
        const metadata = matchingIndex.trackMetadata.get(trackId);
        if (metadata) {
          artistsWithRequestedGenres.add(metadata.artist);
        }
      }
    }

    // If this artist appears with requested genres, it's a good surprise
    if (artistsWithRequestedGenres.has(track.tags.artist)) {
      score = surpriseLevel * 0.5; // Moderate surprise bonus
      reasons.push({
        type: "surprise",
        explanation: `Surprise track from ${track.tags.artist} (related to requested genres)`,
        score: score,
      });
    } else {
      // Check if any previous tracks share normalized genres with this track
      const previousNormalizedGenres = new Set<string>();
      for (const prevTrack of previousTracks) {
        const prevMetadata = matchingIndex.trackMetadata.get(prevTrack.trackFileId);
        const prevNormalized = prevMetadata?.normalizedGenres || 
          prevTrack.tags.genres.map((g) => normalizeGenre(g));
        prevNormalized.forEach((g) => previousNormalizedGenres.add(g.toLowerCase()));
      }
      const sharedGenres = trackNormalizedLower.filter((g) => previousNormalizedGenres.has(g));

      if (sharedGenres.length > 0) {
        score = surpriseLevel * 0.3; // Small surprise bonus
        const sharedGenreDisplay = trackNormalizedGenres.find((g) => 
          sharedGenres.includes(g.toLowerCase())
        ) || sharedGenres[0];
        reasons.push({
          type: "surprise",
          explanation: `Surprise track with shared genre: ${sharedGenreDisplay}`,
          score: score,
        });
      }
    }
  }

  return { score, reasons };
}

/**
 * Score a track comprehensively
 */
function scoreTrack(
  track: TrackRecord,
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  matchingIndex: MatchingIndex,
  previousTracks: TrackRecord[],
  currentDuration: number,
  targetDuration: number,
  remainingSlots: number
): TrackSelection {
  const weights = strategy.scoringWeights;

  // Calculate component scores
  const genreMatch = calculateGenreMatch(
    track,
    request.genres,
    strategy,
    matchingIndex
  );
  const tempoMatch = calculateTempoMatch(
    track,
    request,
    strategy,
    matchingIndex
  );
  const durationFit = calculateDurationFit(
    track,
    targetDuration,
    currentDuration,
    remainingSlots
  );
  const diversity = calculateDiversity(track, previousTracks, strategy);
  const surprise = calculateSurprise(
    track,
    request.genres,
    previousTracks,
    matchingIndex,
    request.surprise
  );

  // Check if track matches suggestions (bonus score)
  let suggestionBonus = 0;
  const suggestionReasons: TrackReason[] = [];
  
  if (request.suggestedArtists && request.suggestedArtists.length > 0) {
    const artist = track.tags.artist?.toLowerCase().trim();
    const suggestedArtistsLower = request.suggestedArtists.map((a) => a.toLowerCase().trim());
    if (artist && suggestedArtistsLower.includes(artist)) {
      suggestionBonus += 0.3;
      suggestionReasons.push({
        type: "constraint",
        explanation: `From suggested artist: ${track.tags.artist}`,
        score: 0.3,
      });
    }
  }
  
  if (request.suggestedAlbums && request.suggestedAlbums.length > 0) {
    const album = track.tags.album?.toLowerCase().trim();
    const suggestedAlbumsLower = request.suggestedAlbums.map((a) => a.toLowerCase().trim());
    if (album && suggestedAlbumsLower.includes(album)) {
      suggestionBonus += 0.3;
      suggestionReasons.push({
        type: "constraint",
        explanation: `From suggested album: ${track.tags.album}`,
        score: 0.3,
      });
    }
  }
  
  if (request.suggestedTracks && request.suggestedTracks.length > 0) {
    const title = track.tags.title?.toLowerCase().trim();
    const suggestedTracksLower = request.suggestedTracks.map((t) => t.toLowerCase().trim());
    if (title && suggestedTracksLower.includes(title)) {
      suggestionBonus += 0.5; // Higher bonus for exact track match
      suggestionReasons.push({
        type: "constraint",
        explanation: `Suggested track: ${track.tags.title}`,
        score: 0.5,
      });
    }
  }

  // Combine all reasons
  const reasons: TrackReason[] = [
    ...genreMatch.reasons,
    ...tempoMatch.reasons,
    ...durationFit.reasons,
    ...diversity.reasons,
    ...surprise.reasons,
    ...suggestionReasons,
  ];

  // Calculate weighted score with suggestion bonus
  const score =
    genreMatch.score * weights.genreMatch +
    tempoMatch.score * weights.tempoMatch +
    durationFit.score * 0.15 + // Duration fit weight
    diversity.score * weights.diversity +
    surprise.score * (request.surprise * 0.1) + // Surprise weight scales with surprise level
    suggestionBonus; // Add suggestion bonus (can push score above 1.0)

  return {
    trackFileId: track.trackFileId,
    track,
    score,
    reasons,
    genreMatch: genreMatch.score,
    tempoMatch: tempoMatch.score,
    durationFit: durationFit.score,
    diversity: diversity.score,
    surprise: surprise.score,
  };
}

/**
 * Refine track scores using LLM for semantic understanding
 */
async function refineTrackSelectionWithLLM(
  candidates: TrackSelection[],
  request: PlaylistRequest,
  previousTracks: TrackRecord[],
  remainingSlots: number,
  provider: LLMProvider,
  apiKey: string,
  topN: number = 25,
  timeout: number = 20000
): Promise<Map<string, LLMRefinedTrackScore> | null> {
  try {
    // Take top N candidates
    const topCandidates = candidates.slice(0, topN);
    if (topCandidates.length === 0) {
      return null;
    }

    // Build prompt
    const prompt = buildRefinementPrompt(request, topCandidates, previousTracks, remainingSlots);

    // Call LLM with timeout
    const responsePromise = callLLMForRefinement(prompt, provider, apiKey);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Refinement timeout")), timeout)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const jsonStr = extractJSONFromResponse(response);
    const parsed = JSON.parse(jsonStr);

    // Build map of refined scores - map by trackFileId
    const refinedScores = new Map<string, LLMRefinedTrackScore>();
    if (Array.isArray(parsed.tracks)) {
      for (const item of parsed.tracks) {
        // item.trackFileId is actually the index (1-based) from the prompt
        const index = parseInt(item.trackFileId || "0", 10);
        if (index > 0 && index <= topCandidates.length) {
          const candidate = topCandidates[index - 1];
          if (candidate && typeof item.refinedScore === "number") {
            refinedScores.set(candidate.trackFileId, {
              trackFileId: candidate.trackFileId,
              refinedScore: Math.max(0, Math.min(1, item.refinedScore)),
              explanation: item.explanation || "",
              semanticMatch: {
                moodMatch: item.semanticMatch?.moodMatch === true,
                activityMatch: item.semanticMatch?.activityMatch === true,
                genreRelationship: item.semanticMatch?.genreRelationship || "unknown",
              },
            });
          }
        }
      }
    }

    return refinedScores.size > 0 ? refinedScores : null;
  } catch (error) {
    console.warn("LLM track refinement failed:", error);
    return null; // Fall back to algorithmic scores only
  }
}

/**
 * Call LLM API for track refinement
 */
async function callLLMForRefinement(
  prompt: string,
  provider: LLMProvider,
  apiKey: string
): Promise<string> {
  switch (provider) {
    case "openai":
      return callOpenAIForRefinement(prompt, apiKey);
    case "gemini":
      return callGeminiForRefinement(prompt, apiKey);
    case "claude":
      return callClaudeForRefinement(prompt, apiKey);
    case "local":
      return callLocalLLMForRefinement(prompt, apiKey);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

async function callOpenAIForRefinement(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

async function callGeminiForRefinement(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callClaudeForRefinement(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

async function callLocalLLMForRefinement(prompt: string, apiKey: string): Promise<string> {
  const baseUrl = apiKey.startsWith("http") ? apiKey : `http://localhost:11434`;
  const endpoint = apiKey.startsWith("http") 
    ? `${apiKey}/api/generate` 
    : `${baseUrl}/api/generate`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama2",
      prompt: prompt,
      stream: false,
      format: "json",
    }),
  });

  if (!response.ok) {
    throw new Error(`Local LLM API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || "";
}

/**
 * Extract JSON from LLM response
 */
function extractJSONFromResponse(response: string): string {
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  
  const jsonObjectMatch = response.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    return jsonObjectMatch[0];
  }
  
  return response.trim();
}

/**
 * Build refinement prompt
 */
function buildRefinementPrompt(
  request: PlaylistRequest,
  candidates: TrackSelection[],
  previousTracks: TrackRecord[],
  remainingSlots: number
): string {
  const previousTracksList = previousTracks
    .slice(-5) // Last 5 tracks for context
    .map((t) => `"${t.tags.title}" by ${t.tags.artist}`)
    .join(", ");

  const candidatesList = candidates.map((candidate, idx) => {
    const track = candidate.track;
    return `${idx + 1}. "${track.tags.title}" by ${track.tags.artist} (${track.tags.genres.join(", ")}) - ${Math.round((track.tech?.durationSeconds || 180) / 60)}:${String(Math.round((track.tech?.durationSeconds || 180) % 60)).padStart(2, "0")}`;
  }).join("\n");

  return `You are evaluating music tracks for playlist inclusion. Given the user's request and track metadata, score each track (0-1) and explain why it matches or doesn't match semantically.

USER REQUEST:
- Genres: ${request.genres.join(", ") || "Any"}
- Mood: ${request.mood.join(", ") || "Any"}
- Activity: ${request.activity.join(", ") || "Any"}
- Tempo: ${request.tempo.bucket || "Any"}
- Surprise level: ${request.surprise} (0=safe, 1=adventurous)

CURRENT PLAYLIST CONTEXT:
- Tracks already selected: ${previousTracksList || "None"}
- Remaining slots: ${remainingSlots}

CANDIDATE TRACKS:
${candidatesList}

For each track, provide:
- trackFileId: string (use the track number from the list above, e.g., "1", "2", etc. - we'll map it back)
- refinedScore: number (0-1) - semantic match score
- explanation: string (why it matches/doesn't match semantically)
- semanticMatch: object { moodMatch: boolean, activityMatch: boolean, genreRelationship: string }

Consider:
- Semantic understanding of mood/activity (e.g., "energetic" vs "upbeat", "working out" needs high energy)
- Cultural context (e.g., certain artists/styles are known for specific activities)
- Genre relationships (e.g., "indie rock" and "alternative" overlap)
- How well the track fits the overall playlist flow

Return ONLY valid JSON matching this schema:
{
  "tracks": [
    {
      "trackFileId": string (track number as string, e.g., "1"),
      "refinedScore": number (0-1),
      "explanation": string,
      "semanticMatch": {
        "moodMatch": boolean,
        "activityMatch": boolean,
        "genreRelationship": string
      }
    }
  ]
}`;
}

/**
 * Generate playlist with deterministic track selection
 */
export async function generatePlaylist(
  libraryRootId: string | undefined,
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  index: MatchingIndex,
  allTracks: TrackRecord[],
  seed?: string | number,
  enableLLMRefinement?: boolean,
  llmProvider?: LLMProvider,
  llmApiKey?: string
): Promise<GeneratedPlaylist> {
  // Use provided seed, or generate from playlist ID, or use request-based seed
  let seedValue: number;
  if (typeof seed === "string") {
    // Hash string to number
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    seedValue = Math.abs(hash);
  } else if (typeof seed === "number") {
    seedValue = seed;
  } else {
    // Default: use request-based seed for consistency
    seedValue = request.genres.join(",").length + request.length.value;
  }
  const rng = new SeededRandom(seedValue);

  // Calculate target duration
  // In discovery mode, halve the target because each library track will get a discovery track
  // So if user wants 30 tracks, we select 15 library tracks (which become 30 with discovery)
  // If user wants 30 minutes, we select ~15 minutes of library tracks (which become ~30 with discovery)
  const baseTargetDurationSeconds =
    request.length.type === "minutes"
      ? request.length.value * 60
      : request.length.value * 180; // Estimate 3 min per track
  
  const targetDurationSeconds = request.enableDiscovery
    ? baseTargetDurationSeconds / 2 // Halve for discovery mode (each library track gets a discovery track)
    : baseTargetDurationSeconds;

  const durationTolerance = targetDurationSeconds * 0.05; // ±5% tolerance
  
  // Adjust target track count for discovery mode
  // In discovery mode, halve the target because each library track will get a discovery track
  const targetTrackCount = request.enableDiscovery
    ? Math.ceil(request.length.value / 2) // Halve for discovery mode
    : request.length.value;

  // Get candidate tracks
  const candidateIds = new Set<string>();

  // Start with required genres or requested genres
  const genresToMatch =
    strategy.constraints.requiredGenres || request.genres;

  if (genresToMatch.length > 0) {
    for (const genre of genresToMatch) {
      const genreTracks = index.byGenre.get(genre) || [];
      for (const trackId of genreTracks) {
        candidateIds.add(trackId);
      }
    }
  } else {
    // No genre filter - use all tracks
    index.allTrackIds.forEach((id) => candidateIds.add(id));
  }

  // Remove excluded genres
  if (strategy.constraints.excludedGenres) {
    for (const genre of strategy.constraints.excludedGenres) {
      const excludedTracks = index.byGenre.get(genre) || [];
      for (const trackId of excludedTracks) {
        candidateIds.delete(trackId);
      }
    }
  }

  // Filter by tempo if strict
  if (
    strategy.tempoGuidance.targetBucket &&
    !strategy.tempoGuidance.allowVariation
  ) {
    const tempoTracks =
      index.byTempoBucket.get(strategy.tempoGuidance.targetBucket) || [];
    const tempoSet = new Set(tempoTracks);
    for (const trackId of candidateIds) {
      if (!tempoSet.has(trackId)) {
        candidateIds.delete(trackId);
      }
    }
  }

  // Filter out disallowed artists
  if (request.disallowedArtists && request.disallowedArtists.length > 0) {
    const disallowedSet = new Set(
      request.disallowedArtists.map((a) => a.toLowerCase().trim())
    );
    const filteredIds = new Set<string>();
    for (const trackId of candidateIds) {
      const track = allTracks.find((t) => t.trackFileId === trackId);
      if (track) {
        const artist = track.tags.artist?.toLowerCase().trim();
        if (!artist || !disallowedSet.has(artist)) {
          filteredIds.add(trackId);
        }
      }
    }
    candidateIds.clear();
    for (const id of filteredIds) {
      candidateIds.add(id);
    }
  }

  if (candidateIds.size === 0) {
    throw new Error("No tracks match the playlist criteria");
  }

  // Convert to track objects
  const candidates = Array.from(candidateIds)
    .map((id) => allTracks.find((t) => t.trackFileId === id))
    .filter((t): t is TrackRecord => !!t);

  // Collect suggested tracks to prioritize/include
  const suggestedTrackIds = new Set<string>();
  
  // Add tracks from suggested artists
  if (request.suggestedArtists && request.suggestedArtists.length > 0) {
    const suggestedArtistsSet = new Set(
      request.suggestedArtists.map((a) => a.toLowerCase().trim())
    );
    for (const track of allTracks) {
      const artist = track.tags.artist?.toLowerCase().trim();
      if (artist && suggestedArtistsSet.has(artist)) {
        suggestedTrackIds.add(track.trackFileId);
      }
    }
  }

  // Add tracks from suggested albums
  if (request.suggestedAlbums && request.suggestedAlbums.length > 0) {
    const suggestedAlbumsSet = new Set(
      request.suggestedAlbums.map((a) => a.toLowerCase().trim())
    );
    for (const track of allTracks) {
      const album = track.tags.album?.toLowerCase().trim();
      if (album && suggestedAlbumsSet.has(album)) {
        suggestedTrackIds.add(track.trackFileId);
      }
    }
  }

  // Add exact suggested tracks
  if (request.suggestedTracks && request.suggestedTracks.length > 0) {
    const suggestedTracksSet = new Set(
      request.suggestedTracks.map((t) => t.toLowerCase().trim())
    );
    for (const track of allTracks) {
      const title = track.tags.title?.toLowerCase().trim();
      if (title && suggestedTracksSet.has(title)) {
        suggestedTrackIds.add(track.trackFileId);
      }
    }
  }

  // Select tracks
  const selected: TrackSelection[] = [];
  let currentDuration = 0;
  let llmRefinementCalled = false; // Track if LLM refinement has been called
  
  // First, add suggested tracks that match criteria
  const suggestedCandidates = Array.from(suggestedTrackIds)
    .map((id) => allTracks.find((t) => t.trackFileId === id))
    .filter((t): t is TrackRecord => !!t && candidateIds.has(t.trackFileId));
  
  // Add suggested tracks first (up to a reasonable limit)
  const maxSuggestedTracks = request.length.type === "tracks" 
    ? Math.min(suggestedCandidates.length, Math.floor(targetTrackCount * 0.4)) // Up to 40% of playlist
    : Math.min(suggestedCandidates.length, 15); // Or up to 15 tracks for duration-based playlists
  
  for (let i = 0; i < maxSuggestedTracks && i < suggestedCandidates.length; i++) {
    const track = suggestedCandidates[i];
    const remainingSlots =
      request.length.type === "tracks"
        ? targetTrackCount - selected.length
        : Math.ceil(
            (targetDurationSeconds - currentDuration) / 180
          );
    const selection = scoreTrack(
      track,
      request,
      strategy,
      index,
      selected.map((s) => s.track),
      currentDuration,
      targetDurationSeconds,
      remainingSlots
    );
    selected.push(selection);
    currentDuration += track.tech?.durationSeconds || 180;
    
    // Check if we've already met the target
    if (request.length.type === "minutes") {
      if (currentDuration >= targetDurationSeconds - durationTolerance) {
        break;
      }
    } else {
      if (selected.length >= targetTrackCount) {
        break;
      }
    }
  }
  const maxIterations = request.length.type === "tracks" 
    ? targetTrackCount * 2 
    : 1000; // Safety limit

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Check if we've met the target
    if (request.length.type === "minutes") {
      if (
        currentDuration >= targetDurationSeconds - durationTolerance &&
        currentDuration <= targetDurationSeconds + durationTolerance
      ) {
        break; // Within tolerance
      }
      if (currentDuration > targetDurationSeconds + durationTolerance) {
        // Overshot - remove last track if possible
        if (selected.length > 0) {
          const last = selected.pop()!;
          currentDuration -= last.track.tech?.durationSeconds || 180;
        }
        break;
      }
    } else {
      // Track count target
      if (selected.length >= targetTrackCount) {
        break;
      }
    }

    // Score remaining candidates
    const remainingSlots =
      request.length.type === "tracks"
        ? targetTrackCount - selected.length
        : Math.ceil(
            (targetDurationSeconds - currentDuration) / 180
          ); // Estimate slots

    const scored = candidates
      .filter((t) => !selected.some((s) => s.trackFileId === t.trackFileId))
      .map((track) =>
        scoreTrack(
          track,
          request,
          strategy,
          index,
          selected.map((s) => s.track),
          currentDuration,
          targetDurationSeconds,
          remainingSlots
        )
      );

    if (scored.length === 0) {
      break; // No more candidates
    }

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Apply LLM refinement if enabled (only once per playlist generation to avoid timeout loops)
    if (enableLLMRefinement && llmProvider && llmApiKey && scored.length > 0 && !llmRefinementCalled) {
      try {
        // Only refine on first iteration when we have a good candidate pool
        const refinedScores = await refineTrackSelectionWithLLM(
          scored,
          request,
          selected.map((s) => s.track),
          remainingSlots,
          llmProvider,
          llmApiKey,
          25, // topN
          30000 // Increased timeout to 30 seconds
        );

        if (refinedScores) {
          // Blend algorithmic scores (70%) with LLM scores (30%)
          for (const selection of scored) {
            const refined = refinedScores.get(selection.trackFileId);
            if (refined) {
              selection.score = selection.score * 0.7 + refined.refinedScore * 0.3;
              // Add LLM explanation to reasons
              selection.reasons.push({
                type: "constraint",
                explanation: `LLM: ${refined.explanation}`,
                score: refined.refinedScore,
              });
            }
          }
          // Re-sort after refinement
          scored.sort((a, b) => b.score - a.score);
          llmRefinementCalled = true; // Mark as called to prevent further calls
        }
      } catch (error) {
        console.warn("LLM refinement failed, using algorithmic scores:", error);
        // Continue with algorithmic scores only, mark as called to prevent retries
        llmRefinementCalled = true;
      }
    }

    // Apply surprise factor: occasionally pick from top N instead of just top 1
    const surpriseWindow = Math.max(
      1,
      Math.floor(scored.length * (1 - request.surprise * 0.5))
    );
    const topCandidates = scored.slice(0, Math.min(10, surpriseWindow));
    const selectedCandidate =
      topCandidates[Math.floor(rng.next() * topCandidates.length)];

    selected.push(selectedCandidate);
    currentDuration +=
      selectedCandidate.track.tech?.durationSeconds || 180;
  }

  // Enforce minArtists constraint if specified
  if (request.minArtists && request.minArtists > 0) {
    const uniqueArtists = new Set(selected.map((s) => s.track.tags.artist).filter(Boolean));
    
    if (uniqueArtists.size < request.minArtists) {
      // Need more artists - try to add or replace tracks with tracks from different artists
      const neededArtists = request.minArtists - uniqueArtists.size;
      const artistTrackMap = new Map<string, TrackRecord[]>();
      
      // Build map of artist -> available tracks
      for (const track of candidates) {
        const artist = track.tags.artist;
        if (artist && !uniqueArtists.has(artist) && candidateIds.has(track.trackFileId)) {
          if (!artistTrackMap.has(artist)) {
            artistTrackMap.set(artist, []);
          }
          artistTrackMap.get(artist)!.push(track);
        }
      }
      
      // Get available artists sorted by track count (prefer artists with more tracks)
      const availableArtists = Array.from(artistTrackMap.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, neededArtists);
      
      if (availableArtists.length > 0) {
        // Try to add tracks first if we haven't reached the length limit
        const canAddMore = request.length.type === "tracks"
          ? selected.length < targetTrackCount
          : currentDuration < targetDurationSeconds + durationTolerance;
        
        if (canAddMore) {
          // Add tracks from new artists
          for (const [newArtist, newTracks] of availableArtists) {
            if (uniqueArtists.size >= request.minArtists) break;
            
            // Find a good track from this artist
            const remainingSlots = request.length.type === "tracks"
              ? targetTrackCount - selected.length
              : Math.ceil((targetDurationSeconds - currentDuration) / 180);
            
            for (const newTrack of newTracks) {
              if (uniqueArtists.size >= request.minArtists) break;
              if (selected.some((s) => s.trackFileId === newTrack.trackFileId)) continue;
              
              const newSelection = scoreTrack(
                newTrack,
                request,
                strategy,
                index,
                selected.map((s) => s.track),
                currentDuration,
                targetDurationSeconds,
                remainingSlots
              );
              
              selected.push(newSelection);
              currentDuration += newTrack.tech?.durationSeconds || 180;
              uniqueArtists.add(newArtist);
              
              // Check if we've exceeded length limit
              if (request.length.type === "tracks" && selected.length >= targetTrackCount) {
                break;
              }
              if (request.length.type === "minutes" && currentDuration >= targetDurationSeconds + durationTolerance) {
                break;
              }
            }
          }
        }
        
        // If we still need more artists and can't add more, replace lowest-scoring tracks
        if (uniqueArtists.size < request.minArtists) {
          selected.sort((a, b) => a.score - b.score); // Sort ascending (lowest first)
          
          for (let i = 0; i < selected.length && uniqueArtists.size < request.minArtists; i++) {
            // Find an artist we haven't used yet
            for (const [newArtist, newTracks] of availableArtists) {
              if (uniqueArtists.has(newArtist)) continue;
              
              // Find a track from this artist
              const newTrack = newTracks.find((t) => 
                candidateIds.has(t.trackFileId) && 
                !selected.some((s) => s.trackFileId === t.trackFileId)
              );
              
              if (newTrack) {
                const oldSelection = selected[i];
                const remainingSlots = request.length.type === "tracks"
                  ? targetTrackCount - selected.length + 1
                  : Math.ceil((targetDurationSeconds - currentDuration + (oldSelection.track.tech?.durationSeconds || 180)) / 180);
                
                const newSelection = scoreTrack(
                  newTrack,
                  request,
                  strategy,
                  index,
                  selected.slice(i + 1).map((s) => s.track),
                  currentDuration - (oldSelection.track.tech?.durationSeconds || 180),
                  targetDurationSeconds,
                  remainingSlots
                );
                
                // Update duration
                currentDuration = currentDuration - (oldSelection.track.tech?.durationSeconds || 180) + (newTrack.tech?.durationSeconds || 180);
                
                selected[i] = newSelection;
                uniqueArtists.add(newArtist);
                break;
              }
            }
          }
          
          // Re-sort by score descending for final ordering
          selected.sort((a, b) => b.score - a.score);
        }
      }
    }
  }

  // Trim to exact count if needed
  if (request.length.type === "tracks") {
    const exactCount = targetTrackCount;
    if (selected.length > exactCount) {
      // Remove lowest scoring tracks
      selected.sort((a, b) => b.score - a.score);
      selected.splice(exactCount);
    }
  }

  // Recalculate duration after trimming
  const finalDuration = selected.reduce(
    (sum, s) => sum + (s.track.tech?.durationSeconds || 0),
    0
  );

  // Build summary
  const genreMix = new Map<string, number>();
  const tempoMix = new Map<string, number>();
  const artistMix = new Map<string, number>();
  const durations: number[] = [];

  for (const selection of selected) {
    const track = selection.track;
    const metadata = index.trackMetadata.get(track.trackFileId);

    // Genre mix
    for (const genre of track.tags.genres) {
      genreMix.set(genre, (genreMix.get(genre) || 0) + 1);
    }

    // Tempo mix
    const tempoBucket = metadata?.tempoBucket || "unknown";
    tempoMix.set(tempoBucket, (tempoMix.get(tempoBucket) || 0) + 1);

    // Artist mix
    artistMix.set(track.tags.artist, (artistMix.get(track.tags.artist) || 0) + 1);

    // Duration stats
    const duration = track.tech?.durationSeconds || 0;
    if (duration > 0) {
      durations.push(duration);
    }
  }

  const summary: PlaylistSummary = {
    totalDuration: finalDuration,
    trackCount: selected.length,
    genreMix,
    tempoMix,
    artistMix,
    avgDuration:
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
    minDuration: durations.length > 0 ? Math.min(...durations) : 0,
    maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
  };

  // Generate playlist ID (deterministic based on inputs)
  const idSeed = `${libraryRootId || "all"}-${JSON.stringify(request)}-${Date.now()}`;
  // Simple hash for ID generation (avoiding Buffer in browser)
  let hash = 0;
  for (let i = 0; i < idSeed.length; i++) {
    const char = idSeed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const playlistId = `playlist-${Math.abs(hash).toString(36)}-${Date.now()}`;

  // Discovery tracks integration (before ordering)
  const discoveryTracks: Array<{
    position: number;
    discoveryTrack: import("@/features/discovery/types").DiscoveryTrack;
    inspiringTrackId: string;
    section?: string;
  }> = [];

  if (request.enableDiscovery) {
    try {
      const { findDiscoveryTracks } = await import("@/features/discovery/discovery-engine");
      const { generateExplanation } = await import("@/features/discovery/explanation-generator");
      
      // Discovery frequency: Always 1:1 ratio (one discovery track per library track)
      const shouldIncludeDiscovery = (index: number): boolean => {
        return true; // Always include discovery track for each library track
      };

      // Find discovery tracks based on user selections from collection
      // Prioritize tracks that match selected genres, albums, or tracks
      const discoveryPromises: Promise<void>[] = [];
      const usedMbids = new Set<string>();

      // Get tracks that match user's selections (genres, artists, albums, tracks)
      const selectedTracksForDiscovery = selected.filter(sel => {
        const track = sel.track;
        
        // Check if track matches selected genres
        const matchesGenre = request.genres.length === 0 || 
          request.genres.some(genre =>
            track.tags.genres.some(tg =>
              tg.toLowerCase().includes(genre.toLowerCase()) ||
              genre.toLowerCase().includes(tg.toLowerCase())
            )
          );
        
        // Check if track matches selected artists
        const matchesArtist = !request.suggestedArtists || request.suggestedArtists.length === 0 ||
          request.suggestedArtists.some(artist =>
            track.tags.artist?.toLowerCase().includes(artist.toLowerCase())
          );
        
        // Check if track matches selected albums
        const matchesAlbum = !request.suggestedAlbums || request.suggestedAlbums.length === 0 ||
          request.suggestedAlbums.some(album =>
            track.tags.album?.toLowerCase().includes(album.toLowerCase())
          );
        
        // Check if track matches selected tracks
        const matchesTrack = !request.suggestedTracks || request.suggestedTracks.length === 0 ||
          request.suggestedTracks.some(st =>
            track.tags.title?.toLowerCase().includes(st.toLowerCase())
          );
        
        return matchesGenre || matchesArtist || matchesAlbum || matchesTrack;
      });

      // Use selected tracks if available, otherwise use all selected tracks
      const tracksToDiscoverFrom = selectedTracksForDiscovery.length > 0
        ? selectedTracksForDiscovery
        : selected;

      // Process discovery tracks sequentially to respect rate limits
      // This ensures each request completes before starting the next one
      for (let i = 0; i < tracksToDiscoverFrom.length; i++) {
        const originalIndex = selected.findIndex(s => s.trackFileId === tracksToDiscoverFrom[i].trackFileId);
        
        // Always include discovery track (1:1 ratio)
        if (originalIndex >= 0 && !shouldIncludeDiscovery(originalIndex)) {
          continue;
        }

        const libraryTrack = tracksToDiscoverFrom[i].track;
        
        try {
          // Wait for discovery tracks to be found (rate limiting handled in musicbrainz-client)
          const candidates = await findDiscoveryTracks({
            libraryTrack,
            userLibrary: allTracks,
            request,
            strategy,
            excludeMbids: Array.from(usedMbids),
          });

          if (candidates.length === 0) {
            continue;
          }

          // Select best candidate
          const bestCandidate = candidates[0];
          usedMbids.add(bestCandidate.mbid);

          // Generate explanation that references user's selections
          const explanation = await generateExplanation(
            bestCandidate,
            libraryTrack,
            request,
            request.llmConfig
          );

          bestCandidate.explanation = explanation;

          // Add to discovery tracks array
          discoveryTracks.push({
            position: originalIndex >= 0 ? originalIndex + 1 : i + 1,
            discoveryTrack: bestCandidate,
            inspiringTrackId: libraryTrack.trackFileId,
          });
        } catch (error) {
          console.warn(`Failed to find discovery track for ${libraryTrack.tags.title}:`, error);
          // Continue with next track even if this one fails
        }
      }
      
      // Deduplicate discovery tracks by MBID (keep first occurrence)
      const seenMbids = new Set<string>();
      const deduplicatedDiscoveryTracks: typeof discoveryTracks = [];
      for (const dt of discoveryTracks) {
        if (!seenMbids.has(dt.discoveryTrack.mbid)) {
          seenMbids.add(dt.discoveryTrack.mbid);
          deduplicatedDiscoveryTracks.push(dt);
        }
      }
      // Replace discoveryTracks array with deduplicated version
      discoveryTracks.length = 0;
      discoveryTracks.push(...deduplicatedDiscoveryTracks);
    } catch (error) {
      console.warn("Discovery track generation failed:", error);
      // Continue without discovery tracks
    }
  }

  // Order tracks with arc and transitions
  // Note: Discovery tracks will be inserted into the final playlist after ordering
  const ordered = orderTracks(selected, strategy, request, index);

  // Build final track list with discovery tracks inserted
  const finalTrackFileIds: string[] = [];
  const finalOrderedTracks: typeof ordered.tracks = [];
  
  // Track which discovery tracks have already been added to prevent duplicates
  const addedDiscoveryMbids = new Set<string>();
  
  // Insert discovery tracks after their inspiring tracks
  for (let i = 0; i < ordered.tracks.length; i++) {
    const orderedTrack = ordered.tracks[i];
    finalTrackFileIds.push(orderedTrack.trackFileId);
    finalOrderedTracks.push(orderedTrack);

    // Check if there's a discovery track for this position
    const discoveryTrack = discoveryTracks.find(
      dt => dt.inspiringTrackId === orderedTrack.trackFileId
    );

    if (discoveryTrack && !addedDiscoveryMbids.has(discoveryTrack.discoveryTrack.mbid)) {
      // Insert discovery track after the inspiring track
      // Use a special marker ID for discovery tracks (mbid prefixed)
      const discoveryTrackFileId = `discovery:${discoveryTrack.discoveryTrack.mbid}`;
      finalTrackFileIds.push(discoveryTrackFileId);
      
      // Mark this discovery track as added to prevent duplicates
      addedDiscoveryMbids.add(discoveryTrack.discoveryTrack.mbid);
      
      // Update discovery track with section information
      discoveryTrack.section = orderedTrack.section;
      
      // Add to ordered tracks with same section as inspiring track
      finalOrderedTracks.push({
        trackFileId: discoveryTrackFileId,
        position: finalOrderedTracks.length + 1,
        section: orderedTrack.section, // Use same section as inspiring track
        reasons: [{
          type: "constraint" as const,
          explanation: discoveryTrack.discoveryTrack.explanation || "Discovery track",
          score: discoveryTrack.discoveryTrack.score,
        }],
        transitionScore: 0.8, // Good transition score
      });
    }
  }

  return {
    id: playlistId,
    title: strategy.title,
    description: strategy.description,
    trackFileIds: finalTrackFileIds,
    trackSelections: selected, // Keep original selections for reference
    orderedTracks: finalOrderedTracks,
    totalDuration: finalDuration,
    summary,
    strategy,
    createdAt: Date.now(),
    discoveryTracks: discoveryTracks.length > 0 ? discoveryTracks : undefined,
  };
}

