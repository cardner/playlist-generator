import type { TrackRecord } from "@/db/schema";
import type { LLMProvider } from "@/types/playlist";
import { logger } from "@/lib/logger";
import { getMoodCategories, normalizeMoodCategory } from "./mood-mapping";

export interface MoodInferenceResult {
  moods: string[];
  confidence: number;
  reasoning?: string;
}

async function callLLMForMood(
  prompt: string,
  provider: LLMProvider,
  apiKey: string
): Promise<string> {
  switch (provider) {
    case "openai":
      return callOpenAIForMood(prompt, apiKey);
    case "gemini":
      return callGeminiForMood(prompt, apiKey);
    case "claude":
      return callClaudeForMood(prompt, apiKey);
    case "local":
      return callLocalLLMForMood(prompt, apiKey);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

async function callOpenAIForMood(prompt: string, apiKey: string): Promise<string> {
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

async function callGeminiForMood(prompt: string, apiKey: string): Promise<string> {
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

async function callClaudeForMood(prompt: string, apiKey: string): Promise<string> {
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

async function callLocalLLMForMood(prompt: string, apiKey: string): Promise<string> {
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

function buildMoodPrompt(track: TrackRecord): string {
  const categories = getMoodCategories().join(", ");
  const bpm = track.tech?.bpm ? `${track.tech.bpm} BPM` : "Unknown";
  const genres = track.tags.genres.length > 0 ? track.tags.genres.join(", ") : "Unknown";

  return `Given the track metadata below, classify the mood into one or more of the following categories:
${categories}

Track: "${track.tags.title}" by ${track.tags.artist}
Album: ${track.tags.album}
Genres: ${genres}
Tempo: ${bpm}
Year: ${track.tags.year || "Unknown"}

Return ONLY a JSON object:
{
  "moods": string[] (use only the provided categories),
  "confidence": number (0-1),
  "reasoning": string (brief explanation)
}`;
}

export async function inferTrackMoodWithLLM(
  track: TrackRecord,
  provider: LLMProvider,
  apiKey: string,
  timeout: number = 15000
): Promise<MoodInferenceResult | null> {
  try {
    const prompt = buildMoodPrompt(track);
    const responsePromise = callLLMForMood(prompt, provider, apiKey);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Mood inference timeout")), timeout)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.moods)) {
      return null;
    }

    const normalized = parsed.moods
      .map((m: string) => normalizeMoodCategory(String(m)))
      .filter((m: string | null): m is string => !!m);

    if (normalized.length === 0) {
      return null;
    }

    return {
      moods: Array.from(new Set(normalized)),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
    };
  } catch (error) {
    logger.warn(`Failed to infer mood for track ${track.trackFileId}:`, error);
    return null;
  }
}

