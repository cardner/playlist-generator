/**
 * LLM Strategy layer for playlist generation
 * 
 * This module handles LLM integration for generating playlist strategies.
 * The LLM only returns rules/strategy, never track lists.
 */

import { z } from "zod";
import type { PlaylistRequest } from "@/types/playlist";
import type { LibrarySummary } from "@/features/library/summarization";
import type { AppSettings } from "@/lib/settings";
import { buildLLMPayload } from "@/features/library/summarization";
import { getSettings } from "@/lib/settings";

/**
 * Zod schema for PlaylistStrategy
 */
export const PlaylistStrategySchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  constraints: z.object({
    minTracks: z.number().int().min(1).optional(),
    maxTracks: z.number().int().min(1).optional(),
    minDuration: z.number().int().min(0).optional(), // seconds
    maxDuration: z.number().int().min(0).optional(), // seconds
    requiredGenres: z.array(z.string()).optional(),
    excludedGenres: z.array(z.string()).optional(),
  }),
  scoringWeights: z.object({
    genreMatch: z.number().min(0).max(1).default(0.3),
    tempoMatch: z.number().min(0).max(1).default(0.25),
    moodMatch: z.number().min(0).max(1).default(0.2),
    activityMatch: z.number().min(0).max(1).default(0.15),
    diversity: z.number().min(0).max(1).default(0.1),
  }),
  diversityRules: z.object({
    maxTracksPerArtist: z.number().int().min(1).default(3),
    artistSpacing: z.number().int().min(1).default(5), // min tracks between same artist
    maxTracksPerGenre: z.number().int().min(1).optional(),
    genreSpacing: z.number().int().min(1).default(3), // min tracks between same genre
  }),
  orderingPlan: z.object({
    sections: z.array(
      z.object({
        name: z.enum(["warmup", "peak", "cooldown", "transition"]),
        startPosition: z.number().min(0).max(1), // 0.0 to 1.0
        endPosition: z.number().min(0).max(1), // 0.0 to 1.0
        tempoTarget: z.enum(["slow", "medium", "fast"]).optional(),
        energyLevel: z.enum(["low", "medium", "high"]).optional(),
      })
    ),
  }),
  vibeTags: z.array(z.string()).min(1).max(10),
  tempoGuidance: z.object({
    targetBucket: z.enum(["slow", "medium", "fast"]).optional(),
    bpmRange: z
      .object({
        min: z.number().int().min(0).max(300),
        max: z.number().int().min(0).max(300),
      })
      .optional(),
    allowVariation: z.boolean().default(true),
  }),
  genreMixGuidance: z.object({
    primaryGenres: z.array(z.string()).min(1),
    secondaryGenres: z.array(z.string()).optional(),
    mixRatio: z
      .object({
        primary: z.number().min(0).max(1).default(0.7),
        secondary: z.number().min(0).max(1).default(0.3),
      })
      .optional(),
  }),
});

export type PlaylistStrategy = z.infer<typeof PlaylistStrategySchema>;

/**
 * Prompt template for LLM
 */
function buildPrompt(
  request: PlaylistRequest,
  summary: LibrarySummary,
  settings: AppSettings
): string {
  const payload = buildLLMPayload(request, summary, settings);

  return `You are a music playlist curation assistant. Your task is to generate a playlist STRATEGY (not a track list) based on the user's request and their music library statistics.

IMPORTANT RULES:
- You MUST return ONLY valid JSON matching the PlaylistStrategy schema
- You MUST NOT include any track names, artist names, or file paths
- You MUST return a strategy/ruleset that can be used to select tracks algorithmically
- Your response must be valid JSON only, no markdown, no explanations

USER REQUEST:
${JSON.stringify(payload.request, null, 2)}

LIBRARY SUMMARY:
- Total tracks: ${payload.librarySummary.totalTracks}
- Top genres: ${payload.librarySummary.genreCounts
    .slice(0, 10)
    .map((g) => `${g.genre} (${g.count})`)
    .join(", ")}
- Tempo distribution: Slow: ${payload.librarySummary.tempoDistribution.slow}, Medium: ${payload.librarySummary.tempoDistribution.medium}, Fast: ${payload.librarySummary.tempoDistribution.fast}
- Average track duration: ${Math.round(
    payload.librarySummary.durationStats.avg
  )} seconds
${payload.librarySummary.artistCounts
  ? `- Top artists: ${payload.librarySummary.artistCounts
      .slice(0, 10)
      .map((a) => `${a.artist} (${a.count})`)
      .join(", ")}`
  : ""}

PLAYLIST STRATEGY SCHEMA:
{
  "title": "string (playlist title, max 100 chars)",
  "description": "string (playlist description, 10-500 chars)",
  "constraints": {
    "minTracks": "number (optional)",
    "maxTracks": "number (optional)",
    "minDuration": "number in seconds (optional)",
    "maxDuration": "number in seconds (optional)",
    "requiredGenres": "array of strings (optional)",
    "excludedGenres": "array of strings (optional)"
  },
  "scoringWeights": {
    "genreMatch": "number 0-1 (default 0.3)",
    "tempoMatch": "number 0-1 (default 0.25)",
    "moodMatch": "number 0-1 (default 0.2)",
    "activityMatch": "number 0-1 (default 0.15)",
    "diversity": "number 0-1 (default 0.1)"
  },
  "diversityRules": {
    "maxTracksPerArtist": "number (default 3)",
    "artistSpacing": "number (default 5)",
    "maxTracksPerGenre": "number (optional)",
    "genreSpacing": "number (default 3)"
  },
  "orderingPlan": {
    "sections": [
      {
        "name": "warmup|peak|cooldown|transition",
        "startPosition": "number 0-1",
        "endPosition": "number 0-1",
        "tempoTarget": "slow|medium|fast (optional)",
        "energyLevel": "low|medium|high (optional)"
      }
    ]
  },
  "vibeTags": ["array of strings (1-10 tags)"],
  "tempoGuidance": {
    "targetBucket": "slow|medium|fast (optional)",
    "bpmRange": {"min": "number 0-300", "max": "number 0-300"} (optional),
    "allowVariation": "boolean (default true)"
  },
  "genreMixGuidance": {
    "primaryGenres": ["array of strings"],
    "secondaryGenres": ["array of strings (optional)"],
    "mixRatio": {"primary": "number 0-1", "secondary": "number 0-1"} (optional)
  }
}

Generate a strategy that:
1. Matches the user's requested genres, mood, activity, and tempo preferences
2. Respects the playlist length (${payload.request.length.value} ${payload.request.length.type})
3. Creates a good flow with warmup/peak/cooldown sections
4. Ensures diversity (max ${payload.request.surprise < 0.5 ? "conservative" : payload.request.surprise < 0.8 ? "moderate" : "adventurous"} diversity based on surprise level ${payload.request.surprise})
5. Uses appropriate tempo guidance based on the requested tempo (${JSON.stringify(payload.request.tempo)})

Return ONLY the JSON object, no other text.`;
}

/**
 * Call LLM API (placeholder - implement with your LLM provider)
 */
async function callLLM(
  prompt: string,
  provider: string,
  apiKey: string
): Promise<string> {
  // Implement LLM API calls based on provider
  switch (provider) {
    case "openai":
      return callOpenAI(prompt, apiKey);
    case "gemini":
      return callGemini(prompt, apiKey);
    case "claude":
      return callClaude(prompt, apiKey);
    case "local":
      return callLocalLLM(prompt, apiKey);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // Using a more cost-effective model
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

async function callGemini(prompt: string, apiKey: string): Promise<string> {
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
            parts: [
              {
                text: prompt,
              },
            ],
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

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307", // Using cost-effective model
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

async function callLocalLLM(prompt: string, apiKey: string): Promise<string> {
  // For local services like Ollama, LM Studio, etc.
  // The apiKey can be used as the base URL or auth token depending on the service
  // Default to common Ollama endpoint if apiKey looks like a URL, otherwise use as-is
  
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
      model: "llama2", // Default model, can be configured
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
 * Extract JSON from LLM response (handles markdown code blocks)
 */
function extractJSON(response: string): string {
  // Remove markdown code blocks if present
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  
  // Try to find JSON object
  const jsonObjectMatch = response.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    return jsonObjectMatch[0];
  }
  
  return response.trim();
}

/**
 * Generate fallback strategy using heuristics
 */
export function fallbackStrategy(
  request: PlaylistRequest,
  summary: LibrarySummary
): PlaylistStrategy {
  // Calculate target track count
  const targetTracks =
    request.length.type === "tracks"
      ? request.length.value
      : Math.ceil(request.length.value / (summary.durationStats.avg / 60));

  // Determine tempo target from request
  const tempoTarget =
    request.tempo.bucket ||
    (request.tempo.bpmRange
      ? request.tempo.bpmRange.min < 90
        ? "slow"
        : request.tempo.bpmRange.max > 140
        ? "fast"
        : "medium"
      : "medium");

  // Determine energy level from mood
  const energyLevel =
    request.mood.some((m) =>
      ["energetic", "upbeat", "exciting", "intense"].includes(
        m.toLowerCase()
      )
    )
      ? "high"
      : request.mood.some((m) =>
          ["calm", "relaxed", "peaceful", "mellow"].includes(m.toLowerCase())
        )
      ? "low"
      : "medium";

  // Create ordering plan based on length
  const sections: Array<{
    name: "warmup" | "peak" | "cooldown" | "transition";
    startPosition: number;
    endPosition: number;
    tempoTarget?: "slow" | "medium" | "fast";
    energyLevel?: "low" | "medium" | "high";
  }> = [];
  
  if (targetTracks >= 10) {
    // Warmup section (first 20%)
    sections.push({
      name: "warmup",
      startPosition: 0,
      endPosition: 0.2,
      tempoTarget: (tempoTarget === "fast" ? "medium" : tempoTarget) as "slow" | "medium" | "fast",
      energyLevel: "low",
    });

    // Peak section (middle 60%)
    sections.push({
      name: "peak",
      startPosition: 0.2,
      endPosition: 0.8,
      tempoTarget: tempoTarget as "slow" | "medium" | "fast",
      energyLevel: energyLevel as "low" | "medium" | "high",
    });

    // Cooldown section (last 20%)
    sections.push({
      name: "cooldown",
      startPosition: 0.8,
      endPosition: 1.0,
      tempoTarget: (tempoTarget === "slow" ? "medium" : "slow") as "slow" | "medium" | "fast",
      energyLevel: "low",
    });
  } else {
    // Short playlist - just peak
    sections.push({
      name: "peak",
      startPosition: 0,
      endPosition: 1.0,
      tempoTarget: tempoTarget as "slow" | "medium" | "fast",
      energyLevel: energyLevel as "low" | "medium" | "high",
    });
  }

  // Calculate diversity based on surprise level and minArtists constraint
  const diversityMultiplier = 0.5 + request.surprise * 0.5; // 0.5 to 1.0
  
  // If minArtists is specified, calculate maxTracksPerArtist to ensure we meet that requirement
  let maxTracksPerArtist: number;
  if (request.minArtists && request.minArtists > 0) {
    // Ensure we can fit at least minArtists artists
    // If we have targetTracks and want minArtists, max tracks per artist should be roughly targetTracks / minArtists
    maxTracksPerArtist = Math.max(1, Math.floor(targetTracks / request.minArtists));
    // But don't make it too restrictive - cap at a reasonable maximum
    maxTracksPerArtist = Math.min(maxTracksPerArtist, Math.max(1, Math.round(3 * diversityMultiplier)));
  } else {
    // Use surprise-based calculation
    maxTracksPerArtist = Math.max(1, Math.round(3 * diversityMultiplier));
  }
  
  const artistSpacing = Math.max(1, Math.round(5 * diversityMultiplier));

  // Genre mix guidance
  const primaryGenres =
    request.genres.length > 0
      ? request.genres.slice(0, 3)
      : summary.genreCounts.slice(0, 3).map((g) => g.genre);
  const secondaryGenres =
    request.genres.length > 3
      ? request.genres.slice(3)
      : summary.genreCounts.slice(3, 6).map((g) => g.genre);

  // Generate title and description
  const genreStr = primaryGenres.join(", ");
  const moodStr = request.mood.join(", ");
  const activityStr = request.activity.join(", ");

  const title = `${moodStr} ${genreStr} for ${activityStr}`.slice(0, 100);
  const description = `A ${request.length.value} ${request.length.type === "minutes" ? "minute" : "track"} playlist featuring ${genreStr}${moodStr ? ` with a ${moodStr} mood` : ""}${activityStr ? `, perfect for ${activityStr}` : ""}.`;

  return {
    title,
    description,
    constraints: {
      minTracks: request.length.type === "tracks" ? request.length.value : undefined,
      maxTracks: request.length.type === "tracks" ? request.length.value : undefined,
      minDuration:
        request.length.type === "minutes"
          ? request.length.value * 60
          : undefined,
      maxDuration:
        request.length.type === "minutes"
          ? request.length.value * 60
          : undefined,
      requiredGenres: request.genres.length > 0 ? request.genres : undefined,
    },
    scoringWeights: {
      genreMatch: 0.3,
      tempoMatch: 0.25,
      moodMatch: 0.2,
      activityMatch: 0.15,
      diversity: 0.1,
    },
    diversityRules: {
      maxTracksPerArtist,
      artistSpacing,
      genreSpacing: Math.max(1, Math.round(3 * diversityMultiplier)),
    },
    orderingPlan: {
      sections,
    },
    vibeTags: [...request.mood, ...request.activity, ...primaryGenres].slice(
      0,
      10
    ),
    tempoGuidance: {
      targetBucket: tempoTarget,
      bpmRange: request.tempo.bpmRange,
      allowVariation: request.surprise > 0.3,
    },
    genreMixGuidance: {
      primaryGenres,
      secondaryGenres: secondaryGenres.length > 0 ? secondaryGenres : undefined,
      mixRatio: {
        primary: 0.7,
        secondary: 0.3,
      },
    },
  };
}

/**
 * Get playlist strategy from LLM or fallback
 */
export async function getStrategy(
  request: PlaylistRequest,
  summary: LibrarySummary,
  settings?: AppSettings
): Promise<PlaylistStrategy> {
  const appSettings = settings || getSettings();

  // Check if LLM is requested and configured
  const llmConfig = request.llmConfig;
  const apiKey = llmConfig?.apiKey;
  const useLLM = request.agentType === "llm" && llmConfig && apiKey && llmConfig.provider;
  
  // Fallback to built-in agents if LLM not configured
  if (!useLLM || !llmConfig || !apiKey) {
    return fallbackStrategy(request, summary);
  }

  try {
    // Build prompt
    const prompt = buildPrompt(request, summary, appSettings);

    // Call LLM with provider-specific configuration
    // TypeScript now knows llmConfig and apiKey are defined due to the checks above
    const response = await callLLM(
      prompt,
      llmConfig.provider,
      apiKey
    );

    // Extract JSON
    const jsonStr = extractJSON(response);

    // Parse and validate
    const parsed = JSON.parse(jsonStr);
    const validated = PlaylistStrategySchema.parse(parsed);

    return validated;
  } catch (error) {
    console.warn("LLM strategy generation failed, using fallback:", error);
    return fallbackStrategy(request, summary);
  }
}

