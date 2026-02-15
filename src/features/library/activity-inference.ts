/**
 * Activity Inference for Tracks
 *
 * Infers suitable activities for a track when explicit activity tags are missing.
 * Uses rule-based inference (BPM + genres) and optional LLM-based inference.
 *
 * Rule-based inference:
 * - BPM maps to tempo buckets (slow/medium/fast) which map to activities
 * - Genres map to activities (e.g. ambient → relaxing/meditation, edm → party/dance)
 *
 * @module features/library/activity-inference
 */

import type { TrackRecord } from "@/db/schema";
import type { LLMProvider } from "@/types/playlist";
import { logger } from "@/lib/logger";
import { TEMPO_BUCKET_ACTIVITIES, TEMPO_BUCKET_RANGES } from "@/lib/tempo-mapping";
import {
  getActivityCategories,
  mapActivityTagsToCategories,
  mapMusicBrainzTagsToActivity,
  normalizeActivityCategory,
} from "./activity-mapping";
import { inferActivityFromYear } from "@/lib/year-mapping";

/**
 * Result of LLM-based activity inference.
 * Contains normalized activity categories, confidence, and optional reasoning.
 */
export interface ActivityInferenceResult {
  activity: string[];
  confidence: number;
  reasoning?: string;
}

function getTempoBucketFromBpm(bpm?: number): "slow" | "medium" | "fast" | null {
  if (typeof bpm !== "number" || Number.isNaN(bpm)) return null;
  for (const [bucket, range] of Object.entries(TEMPO_BUCKET_RANGES)) {
    if (bpm >= range.min && bpm <= range.max) {
      return bucket as "slow" | "medium" | "fast";
    }
  }
  return null;
}

function inferActivityTagsFromGenres(genres: string[]): string[] {
  const tags: string[] = [];
  const lower = genres.map((g) => g.toLowerCase());

  if (lower.some((g) => g.includes("ambient") || g.includes("chill") || g.includes("downtempo"))) {
    tags.push("relaxing", "meditation");
  }
  if (lower.some((g) => g.includes("ambient") || g.includes("world") || g.includes("new age"))) {
    tags.push("yoga");
  }
  if (lower.some((g) => g.includes("lofi") || g.includes("classical") || g.includes("piano") || g.includes("acoustic"))) {
    tags.push("study", "reading");
  }
  if (lower.some((g) => g.includes("lofi") || g.includes("chiptune") || g.includes("electronic") || g.includes("synth"))) {
    tags.push("gaming");
  }
  if (lower.some((g) => g.includes("edm") || g.includes("dance") || g.includes("house") || g.includes("techno") || g.includes("electro"))) {
    tags.push("party", "dance", "workout");
  }
  if (lower.some((g) => g.includes("hip hop") || g.includes("rap") || g.includes("trap"))) {
    tags.push("workout", "party");
  }
  if (lower.some((g) => g.includes("metal") || g.includes("hardcore") || g.includes("punk"))) {
    tags.push("workout");
  }
  if (lower.some((g) => g.includes("jazz") || g.includes("folk"))) {
    tags.push("relaxing", "reading");
  }
  if (lower.some((g) => g.includes("indie") || g.includes("acoustic") || g.includes("singer-songwriter"))) {
    tags.push("creative", "reading");
  }
  if (lower.some((g) => g.includes("pop") || g.includes("disco") || g.includes("funk"))) {
    tags.push("cleaning", "dance");
  }
  if (lower.some((g) => g.includes("folk") || g.includes("americana") || g.includes("country"))) {
    tags.push("walking", "gardening");
  }
  if (lower.some((g) => g.includes("reggae") || g.includes("reggaeton") || g.includes("latin"))) {
    tags.push("socializing", "party");
  }

  return tags;
}

/**
 * Infers activity categories from track duration.
 * Short tracks (60–180s) suit workout/running/party; long tracks (300s+) suit relaxing/meditation/reading.
 *
 * @param durationSeconds - Track duration in seconds
 * @returns Canonical activity categories (may be empty)
 */
export function inferActivityFromDuration(durationSeconds?: number): string[] {
  if (typeof durationSeconds !== "number" || Number.isNaN(durationSeconds) || durationSeconds <= 0) {
    return [];
  }
  const tags: string[] = [];
  if (durationSeconds >= 60 && durationSeconds <= 180) {
    tags.push("workout", "running", "party");
  } else if (durationSeconds >= 300) {
    tags.push("relaxing", "meditation", "reading");
  }
  return mapActivityTagsToCategories(tags);
}

/**
 * Infers activity categories for a track using BPM and genres (no LLM).
 * Used when a track has no explicit activity tags. Returns canonical categories
 * from activity-mapping (e.g. "Workout", "Study", "Relaxing").
 *
 * @param track - Track with tech.bpm and tags.genres
 * @returns Canonical activity categories (may be empty)
 */
export function inferActivityFromTrack(track: TrackRecord): string[] {
  const inferred: string[] = [];
  const bpmBucket = getTempoBucketFromBpm(track.tech?.bpm);
  if (bpmBucket) {
    inferred.push(...TEMPO_BUCKET_ACTIVITIES[bpmBucket]);
  }

  inferred.push(...inferActivityTagsFromGenres(track.tags.genres));

  let mapped = mapActivityTagsToCategories(inferred);

  if (mapped.length === 0) {
    const fromDuration = inferActivityFromDuration(track.tech?.durationSeconds);
    if (fromDuration.length > 0) return fromDuration;

    const fromMusicBrainz = mapMusicBrainzTagsToActivity(
      track.enhancedMetadata?.musicbrainzTags || []
    );
    if (fromMusicBrainz.length > 0) return fromMusicBrainz;

    const fromYear = inferActivityFromYear(
      track.tags.year ?? track.enhancedMetadata?.musicbrainzReleaseYear
    );
    if (fromYear.length > 0) return fromYear;
  }

  return mapped;
}

async function callLLMForActivity(
  prompt: string,
  provider: LLMProvider,
  apiKey: string
): Promise<string> {
  switch (provider) {
    case "openai":
      return callOpenAIForActivity(prompt, apiKey);
    case "gemini":
      return callGeminiForActivity(prompt, apiKey);
    case "claude":
      return callClaudeForActivity(prompt, apiKey);
    case "local":
      return callLocalLLMForActivity(prompt, apiKey);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

async function callOpenAIForActivity(prompt: string, apiKey: string): Promise<string> {
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
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

async function callGeminiForActivity(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
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

async function callClaudeForActivity(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 2048,
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

async function callLocalLLMForActivity(prompt: string, apiKey: string): Promise<string> {
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

function extractJSON(response: string): string {
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

function buildActivityPrompt(track: TrackRecord): string {
  const categories = getActivityCategories().join(", ");
  const bpm = track.tech?.bpm ? `${track.tech.bpm} BPM` : "Unknown";
  const genres = track.tags.genres.length > 0 ? track.tags.genres.join(", ") : "Unknown";
  const moods =
    track.enhancedMetadata?.mood && track.enhancedMetadata.mood.length > 0
      ? track.enhancedMetadata.mood.join(", ")
      : "Unknown";

  return `Given the track metadata below, classify suitable activities into one or more of the following categories:
${categories}

Track: "${track.tags.title}" by ${track.tags.artist}
Album: ${track.tags.album}
Genres: ${genres}
Tempo: ${bpm}
Mood Tags: ${moods}
Year: ${track.tags.year || "Unknown"}

Return ONLY a JSON object:
{
  "activity": string[] (use only the provided categories),
  "confidence": number (0-1),
  "reasoning": string (brief explanation)
}`;
}

/**
 * Infers activity categories for a track using an LLM.
 * Use when rule-based inference is insufficient or for higher-quality tags.
 * Returns null on timeout or parse errors.
 *
 * @param track - Track to infer activities for
 * @param provider - LLM provider (openai, gemini, claude, local)
 * @param apiKey - API key for the provider
 * @param timeout - Max wait time in ms (default 15000)
 * @returns Activity inference result or null on failure
 */
export async function inferTrackActivityWithLLM(
  track: TrackRecord,
  provider: LLMProvider,
  apiKey: string,
  timeout: number = 15000
): Promise<ActivityInferenceResult | null> {
  try {
    const prompt = buildActivityPrompt(track);
    const responsePromise = callLLMForActivity(prompt, provider, apiKey);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Activity inference timeout")), timeout)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.activity)) {
      return null;
    }

    const normalized = parsed.activity
      .map((a: string) => normalizeActivityCategory(String(a)))
      .filter((a: string | null): a is string => !!a);

    if (normalized.length === 0) {
      return null;
    }

    return {
      activity: Array.from(new Set(normalized)),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
    };
  } catch (error) {
    logger.warn(`Failed to infer activity for track ${track.trackFileId}:`, error);
    return null;
  }
}
