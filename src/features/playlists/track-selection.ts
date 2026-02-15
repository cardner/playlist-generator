/**
 * Track Selection and LLM Refinement
 * 
 * This module handles comprehensive track scoring and LLM-powered refinement
 * for playlist generation. It combines algorithmic scoring with semantic
 * understanding from LLMs to select the best tracks for playlists.
 * 
 * @module features/playlists/track-selection
 */

import type { TrackRecord } from "@/db/schema";
import type { PlaylistRequest, LLMRefinedTrackScore, LLMProvider } from "@/types/playlist";
import type { PlaylistStrategy } from "./strategy";
import type { MatchingIndex } from "@/features/library/summarization";
import type { TrackSelection, TrackReason } from "./matching-engine";
import {
  calculateGenreMatch,
  calculateTempoMatch,
  calculateMoodMatch,
  calculateActivityMatch,
  calculateDurationFit,
  calculateDiversity,
  calculateSurprise,
  calculateInstructionMatch,
} from "./scoring";
import { logger } from "@/lib/logger";

/**
 * Context of artists and genres related to user suggestions.
 * Passed to scoreTrack() to apply affinity bonuses for tracks from suggested
 * artists or similar genres (e.g. "Related to suggested artist: X").
 */
export interface AffinityContext {
  artists: Set<string>;
  genres: Set<string>;
}

/**
 * Score a track comprehensively
 * 
 * Combines all scoring factors (genre, tempo, duration, diversity, surprise)
 * with suggestion bonuses to produce a final score. This is the main function
 * used to evaluate tracks during playlist generation.
 * 
 * @param track - Track to score
 * @param request - Playlist request (contains genres, tempo, suggestions, etc.)
 * @param strategy - Playlist strategy (contains scoring weights)
 * @param matchingIndex - Matching index with normalized metadata
 * @param previousTracks - Previously selected tracks (for diversity/surprise)
 * @param currentDuration - Current playlist duration in seconds
 * @param targetDuration - Target playlist duration in seconds
 * @param remainingSlots - Number of remaining track slots
 * @param affinityContext - Optional context of suggested artists/genres for affinity bonus
 * @returns Complete track selection with score and reasons
 * 
 * @example
 * ```typescript
 * const selection = scoreTrack(
 *   track,
 *   request,
 *   strategy,
 *   index,
 *   previousTracks,
 *   1800,
 *   3600,
 *   10
 * );
 * ```
 */
export function scoreTrack(
  track: TrackRecord,
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  matchingIndex: MatchingIndex,
  previousTracks: TrackRecord[],
  currentDuration: number,
  targetDuration: number,
  remainingSlots: number,
  affinityContext?: AffinityContext
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
  const moodMatch = calculateMoodMatch(track, request, matchingIndex);
  const activityMatch = calculateActivityMatch(track, request);
  const instructionMatch = calculateInstructionMatch(
    track,
    request.llmAdditionalInstructions
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

  // Affinity bonus for related artists/genres
  let affinityBonus = 0;
  const affinityReasons: TrackReason[] = [];
  if (affinityContext && (affinityContext.artists.size > 0 || affinityContext.genres.size > 0)) {
    const artist = track.tags.artist?.toLowerCase().trim();
    if (artist && affinityContext.artists.has(artist)) {
      affinityBonus += 0.1;
      affinityReasons.push({
        type: "affinity",
        explanation: `Related to suggested artist: ${track.tags.artist}`,
        score: 0.1,
      });
    }

    const normalizedGenres =
      matchingIndex.trackMetadata.get(track.trackFileId)?.normalizedGenres ||
      track.tags.genres;
    const hasGenreAffinity = normalizedGenres.some((g) =>
      affinityContext.genres.has(g.toLowerCase())
    );
    if (hasGenreAffinity) {
      affinityBonus += 0.05;
      affinityReasons.push({
        type: "affinity",
        explanation: "Related to suggested genres/artists",
        score: 0.05,
      });
    }

    affinityBonus = Math.min(0.15, affinityBonus);
  }

  // Combine all reasons
  const reasons: TrackReason[] = [
    ...genreMatch.reasons,
    ...tempoMatch.reasons,
    ...moodMatch.reasons,
    ...activityMatch.reasons,
    ...durationFit.reasons,
    ...diversity.reasons,
    ...surprise.reasons,
    ...instructionMatch.reasons,
    ...suggestionReasons,
    ...affinityReasons,
  ];

  const instructionWeight = request.llmAdditionalInstructions?.trim() ? 0.1 : 0;

  // Calculate weighted score with suggestion bonus
  const score =
    genreMatch.score * weights.genreMatch +
    tempoMatch.score * weights.tempoMatch +
    moodMatch.score * weights.moodMatch +
    activityMatch.score * weights.activityMatch +
    durationFit.score * 0.15 + // Duration fit weight
    diversity.score * weights.diversity +
    surprise.score * (request.surprise * 0.1) + // Surprise weight scales with surprise level
    instructionMatch.score * instructionWeight +
    suggestionBonus +
    affinityBonus; // Add bonuses (can push score above 1.0)

  return {
    trackFileId: track.trackFileId,
    track,
    score,
    reasons,
    genreMatch: genreMatch.score,
    tempoMatch: tempoMatch.score,
    moodMatch: moodMatch.score,
    activityMatch: activityMatch.score,
    durationFit: durationFit.score,
    diversity: diversity.score,
    surprise: surprise.score,
  };
}

/**
 * Refine track scores using LLM for semantic understanding
 * 
 * Takes the top N algorithmically-scored tracks and uses an LLM to refine
 * their scores based on semantic understanding of mood, activity, and genre
 * relationships. Falls back to algorithmic scores if LLM fails.
 * 
 * @param candidates - Top-scored track candidates
 * @param request - Playlist request (contains mood, activity, etc.)
 * @param previousTracks - Previously selected tracks for context
 * @param remainingSlots - Number of remaining slots
 * @param provider - LLM provider to use
 * @param apiKey - API key for LLM provider
 * @param topN - Number of top candidates to refine (default: 25)
 * @param timeout - Timeout in milliseconds (default: 20000)
 * @returns Map of trackFileId -> refined score, or null if refinement failed
 * 
 * @example
 * ```typescript
 * const refinedScores = await refineTrackSelectionWithLLM(
 *   candidates,
 *   request,
 *   previousTracks,
 *   5,
 *   "openai",
 *   apiKey
 * );
 * ```
 */
export async function refineTrackSelectionWithLLM(
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
    logger.warn("LLM track refinement failed:", error);
    return null; // Fall back to algorithmic scores only
  }
}

/**
 * Call LLM API for track refinement
 * 
 * Routes the refinement request to the appropriate LLM provider API.
 * 
 * @param prompt - Refinement prompt
 * @param provider - LLM provider
 * @param apiKey - API key for provider
 * @returns LLM response string
 * @throws Error if provider is unsupported or API call fails
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

/**
 * Call OpenAI API for track refinement
 * 
 * @param prompt - Refinement prompt
 * @param apiKey - OpenAI API key
 * @returns LLM response string
 * @throws Error if API call fails
 */
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

/**
 * Call Google Gemini API for track refinement
 * 
 * @param prompt - Refinement prompt
 * @param apiKey - Gemini API key
 * @returns LLM response string
 * @throws Error if API call fails
 */
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

/**
 * Call Anthropic Claude API for track refinement
 * 
 * @param prompt - Refinement prompt
 * @param apiKey - Claude API key
 * @returns LLM response string
 * @throws Error if API call fails
 */
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

/**
 * Call local LLM API for track refinement
 * 
 * Supports Ollama and other local LLM servers. The apiKey can be a full URL
 * or will default to localhost:11434 (Ollama default).
 * 
 * @param prompt - Refinement prompt
 * @param apiKey - Local LLM API endpoint URL or empty string for default
 * @returns LLM response string
 * @throws Error if API call fails
 */
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
 * 
 * LLMs sometimes wrap JSON in markdown code blocks or include extra text.
 * This function extracts the JSON object from the response.
 * 
 * @param response - Raw LLM response string
 * @returns Extracted JSON string
 * 
 * @example
 * ```typescript
 * const json = extractJSONFromResponse("```json\n{...}\n```");
 * // Returns: "{...}"
 * ```
 */
export function extractJSONFromResponse(response: string): string {
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
 * Build refinement prompt for LLM
 * 
 * Creates a detailed prompt that includes the user's request, current playlist
 * context, and candidate tracks for the LLM to evaluate.
 * 
 * @param request - Playlist request
 * @param candidates - Track candidates to evaluate
 * @param previousTracks - Previously selected tracks
 * @param remainingSlots - Number of remaining slots
 * @returns Formatted prompt string
 */
export function buildRefinementPrompt(
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
    const moodTags = track.enhancedMetadata?.mood?.length
      ? track.enhancedMetadata.mood.join(", ")
      : "Unknown";
    const activityTags = track.enhancedMetadata?.activity?.length
      ? track.enhancedMetadata.activity.join(", ")
      : "Unknown";
    const bpm = track.tech?.bpm ? `${track.tech.bpm} BPM` : "Unknown";
    return `${idx + 1}. "${track.tags.title}" by ${track.tags.artist} (${track.tags.genres.join(", ")}) - ${Math.round((track.tech?.durationSeconds || 180) / 60)}:${String(Math.round((track.tech?.durationSeconds || 180) % 60)).padStart(2, "0")} | BPM: ${bpm} | Mood: ${moodTags} | Activity: ${activityTags}`;
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

