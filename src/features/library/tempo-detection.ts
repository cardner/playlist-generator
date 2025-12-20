/**
 * LLM-powered tempo (BPM) detection for tracks missing tempo metadata
 */

import type { TrackRecord } from "@/db/schema";
import type { LLMProvider } from "@/types/playlist";
import { logger } from "@/lib/logger";

export interface TempoDetectionResult {
  trackFileId: string;
  bpm: number;
  confidence: number;
  reasoning?: string;
}

/**
 * Call LLM API for tempo detection
 */
async function callLLMForTempo(
  prompt: string,
  provider: LLMProvider,
  apiKey: string
): Promise<string> {
  switch (provider) {
    case "openai":
      return callOpenAIForTempo(prompt, apiKey);
    case "gemini":
      return callGeminiForTempo(prompt, apiKey);
    case "claude":
      return callClaudeForTempo(prompt, apiKey);
    case "local":
      return callLocalLLMForTempo(prompt, apiKey);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

async function callOpenAIForTempo(prompt: string, apiKey: string): Promise<string> {
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

async function callGeminiForTempo(prompt: string, apiKey: string): Promise<string> {
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

async function callClaudeForTempo(prompt: string, apiKey: string): Promise<string> {
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

async function callLocalLLMForTempo(prompt: string, apiKey: string): Promise<string> {
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

/**
 * Detect tempo (BPM) for a single track using LLM
 */
export async function detectTempoWithLLM(
  track: TrackRecord,
  provider: LLMProvider,
  apiKey: string,
  timeout: number = 15000
): Promise<number | null> {
  try {
    const prompt = buildTempoDetectionPrompt(track);

    const responsePromise = callLLMForTempo(prompt, provider, apiKey);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Tempo detection timeout")), timeout)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed.bpm === "number" && parsed.bpm >= 60 && parsed.bpm <= 200) {
      return Math.round(parsed.bpm);
    }

    return null;
  } catch (error) {
    logger.warn(`Failed to detect tempo for track ${track.trackFileId}:`, error);
    return null;
  }
}

/**
 * Detect tempo for multiple tracks in a single LLM call (batched)
 */
export async function detectTempoBatchWithLLM(
  tracks: TrackRecord[],
  provider: LLMProvider,
  apiKey: string,
  timeout: number = 30000
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  if (tracks.length === 0) {
    return results;
  }

  try {
    const prompt = buildBatchTempoDetectionPrompt(tracks);

    const responsePromise = callLLMForTempo(prompt, provider, apiKey);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Batch tempo detection timeout")), timeout)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed.tracks)) {
      // Create a map of index to trackFileId for lookup
      const indexToTrackId = new Map<number, string>();
      tracks.forEach((track, idx) => {
        indexToTrackId.set(idx + 1, track.trackFileId); // 1-based index
      });
      
      for (const item of parsed.tracks) {
        // Handle both string trackFileId and numeric index
        let trackFileId: string | undefined;
        if (typeof item.trackFileId === "string") {
          // Try to match by trackFileId directly
          const matchingTrack = tracks.find((t) => t.trackFileId === item.trackFileId);
          if (matchingTrack) {
            trackFileId = item.trackFileId;
          } else {
            // Try parsing as number (index)
            const index = parseInt(item.trackFileId, 10);
            if (!isNaN(index) && indexToTrackId.has(index)) {
              trackFileId = indexToTrackId.get(index);
            }
          }
        } else if (typeof item.trackFileId === "number") {
          // LLM returned index instead of trackFileId
          trackFileId = indexToTrackId.get(item.trackFileId);
        }
        
        if (
          trackFileId &&
          typeof item.bpm === "number" &&
          item.bpm >= 60 &&
          item.bpm <= 200
        ) {
          results.set(trackFileId, Math.round(item.bpm));
        }
      }
      
      // Log results (only warn if no results)
      if (results.size === 0) {
        logger.warn(`No tempo detected. LLM response structure:`, parsed);
      }
    } else if (parsed.bpm && typeof parsed.bpm === "number") {
      // Handle case where LLM returns single BPM for all tracks (fallback)
      // Use heuristic: assign same BPM to all tracks (not ideal but better than nothing)
      const bpm = Math.round(parsed.bpm);
      if (bpm >= 60 && bpm <= 200) {
        for (const track of tracks) {
          results.set(track.trackFileId, bpm);
        }
      }
    } else {
      logger.warn(`LLM did not return expected format. Response:`, parsed);
    }
  } catch (error) {
    logger.warn("Batch tempo detection failed:", error);
    // Try individual detection as fallback for critical tracks
    if (tracks.length <= 5) {
      for (const track of tracks) {
        try {
          const bpm = await detectTempoWithLLM(track, provider, apiKey, 10000);
          if (bpm !== null) {
            results.set(track.trackFileId, bpm);
          }
        } catch (err) {
          // Skip this track
        }
      }
    }
  }

  return results;
}

/**
 * Build prompt for single track tempo detection
 */
function buildTempoDetectionPrompt(track: TrackRecord): string {
  const duration = track.tech?.durationSeconds
    ? `${Math.round(track.tech.durationSeconds / 60)}:${String(Math.round(track.tech.durationSeconds % 60)).padStart(2, "0")}`
    : "Unknown";

  return `Estimate the BPM (beats per minute) for this music track based on its metadata:

Track: "${track.tags.title}" by ${track.tags.artist}
Album: ${track.tags.album}
Genres: ${track.tags.genres.join(", ") || "Unknown"}
Year: ${track.tags.year || "Unknown"}
Duration: ${duration}

Consider:
- Genre characteristics (e.g., dubstep ~140-150 BPM, ambient ~60-80 BPM, house ~120-130 BPM, rock ~100-140 BPM, pop ~100-130 BPM)
- Artist's typical style and tempo
- Track title hints (e.g., "slow", "fast", "ballad", "upbeat")
- Era/decade (e.g., disco ~120 BPM, modern EDM ~128-140 BPM, classic rock ~100-120 BPM)
- Duration patterns (very short tracks might be faster)

Return ONLY a JSON object:
{
  "bpm": number (estimated BPM, 60-200 range),
  "confidence": number (0-1, how confident you are),
  "reasoning": string (brief explanation)
}`;
}

/**
 * Build prompt for batch tempo detection
 */
function buildBatchTempoDetectionPrompt(tracks: TrackRecord[]): string {
  const tracksList = tracks.map((track, idx) => {
    const duration = track.tech?.durationSeconds
      ? `${Math.round(track.tech.durationSeconds / 60)}:${String(Math.round(track.tech.durationSeconds % 60)).padStart(2, "0")}`
      : "Unknown";
    
    return `Track ${idx + 1}:
   Track ID: ${idx + 1} (use this number in your response)
   Track File ID: ${track.trackFileId}
   Title: "${track.tags.title}"
   Artist: ${track.tags.artist}
   Album: ${track.tags.album}
   Genres: ${track.tags.genres.join(", ") || "Unknown"}
   Duration: ${duration}
   Year: ${track.tags.year || "Unknown"}`;
  }).join("\n\n");

  return `Estimate the BPM (beats per minute) for each of these music tracks based on their metadata:

TRACKS:
${tracksList}

For each track, consider:
- Genre characteristics (e.g., dubstep ~140-150 BPM, ambient ~60-80 BPM, house ~120-130 BPM, rock ~100-140 BPM, pop ~100-130 BPM)
- Artist's typical style and tempo
- Track title hints (e.g., "slow", "fast", "ballad", "upbeat")
- Era/decade (e.g., disco ~120 BPM, modern EDM ~128-140 BPM, classic rock ~100-120 BPM)
- Duration patterns

IMPORTANT: Use the Track ID number (1, 2, 3, etc.) from the list above as the trackFileId in your response.

Return ONLY a JSON object with an array:
{
  "tracks": [
    {
      "trackFileId": number (the Track ID number from the list above: 1, 2, 3, etc.),
      "bpm": number (estimated BPM, 60-200 range),
      "confidence": number (0-1),
      "reasoning": string (brief explanation)
    }
  ]
}

For example, if estimating tempo for "Track 1", use trackFileId: 1.`;
}

