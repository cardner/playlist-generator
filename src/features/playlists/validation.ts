/**
 * LLM-powered playlist validation and explanation generation
 */

import type { PlaylistRequest } from "@/types/playlist";
import type { GeneratedPlaylist } from "./matching-engine";
import type { PlaylistValidation, PlaylistExplanation } from "@/types/playlist";
import type { LLMProvider } from "@/types/playlist";
import { logger } from "@/lib/logger";

/**
 * Call LLM API (reuse pattern from strategy.ts)
 */
async function callLLM(
  prompt: string,
  provider: LLMProvider,
  apiKey: string
): Promise<string> {
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
      model: "claude-3-haiku-20240307",
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
 * Validate playlist against user requirements using LLM
 */
export async function validatePlaylistWithLLM(
  request: PlaylistRequest,
  playlist: GeneratedPlaylist,
  provider: LLMProvider,
  apiKey: string,
  timeout: number = 30000
): Promise<PlaylistValidation | null> {
  try {
    // Build prompt
    const prompt = buildValidationPrompt(request, playlist);

    // Call LLM with timeout
    const responsePromise = callLLM(prompt, provider, apiKey);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Validation timeout")), timeout)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    return {
      isValid: parsed.isValid === true,
      score: Math.max(0, Math.min(1, parsed.score || 0)),
      requirementCoverage: {
        genres: {
          met: parsed.requirementCoverage?.genres?.met === true,
          score: Math.max(0, Math.min(1, parsed.requirementCoverage?.genres?.score || 0)),
          explanation: parsed.requirementCoverage?.genres?.explanation || "",
        },
        mood: {
          met: parsed.requirementCoverage?.mood?.met === true,
          score: Math.max(0, Math.min(1, parsed.requirementCoverage?.mood?.score || 0)),
          explanation: parsed.requirementCoverage?.mood?.explanation || "",
        },
        activity: {
          met: parsed.requirementCoverage?.activity?.met === true,
          score: Math.max(0, Math.min(1, parsed.requirementCoverage?.activity?.score || 0)),
          explanation: parsed.requirementCoverage?.activity?.explanation || "",
        },
        tempo: {
          met: parsed.requirementCoverage?.tempo?.met === true,
          score: Math.max(0, Math.min(1, parsed.requirementCoverage?.tempo?.score || 0)),
          explanation: parsed.requirementCoverage?.tempo?.explanation || "",
        },
        length: {
          met: parsed.requirementCoverage?.length?.met === true,
          score: Math.max(0, Math.min(1, parsed.requirementCoverage?.length?.score || 0)),
          explanation: parsed.requirementCoverage?.length?.explanation || "",
        },
        diversity: {
          met: parsed.requirementCoverage?.diversity?.met === true,
          score: Math.max(0, Math.min(1, parsed.requirementCoverage?.diversity?.score || 0)),
          explanation: parsed.requirementCoverage?.diversity?.explanation || "",
        },
      },
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch (error) {
    logger.warn("LLM validation failed:", error);
    return null; // Return null on failure - playlist is still valid, just unvalidated
  }
}

/**
 * Generate human-readable explanation for playlist
 */
export async function generatePlaylistExplanation(
  request: PlaylistRequest,
  playlist: GeneratedPlaylist,
  validation: PlaylistValidation | null,
  provider: LLMProvider,
  apiKey: string,
  timeout: number = 30000
): Promise<PlaylistExplanation | null> {
  try {
    // Build prompt
    const prompt = buildExplanationPrompt(request, playlist, validation);

    // Call LLM with timeout
    const responsePromise = callLLM(prompt, provider, apiKey);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Explanation timeout")), timeout)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr);

    return {
      explanation: parsed.explanation || "",
      keyTracks: Array.isArray(parsed.keyTracks) ? parsed.keyTracks : [],
      flowDescription: parsed.flowDescription || "",
    };
  } catch (error) {
    logger.warn("LLM explanation generation failed:", error);
    return null;
  }
}

/**
 * Build validation prompt
 */
function buildValidationPrompt(
  request: PlaylistRequest,
  playlist: GeneratedPlaylist
): string {
  // Format tracks for prompt
  const tracksList = playlist.trackSelections
    .slice(0, 50) // Limit to first 50 tracks to avoid token limits
    .map((selection, idx) => {
      const track = selection.track;
      return `${idx + 1}. "${track.tags.title}" by ${track.tags.artist} (${track.tags.genres.join(", ")})`;
    })
    .join("\n");

  // Format discovery tracks if present
  const discoveryTracksList = playlist.discoveryTracks
    ? playlist.discoveryTracks
        .slice(0, 20) // Limit discovery tracks
        .map((dt, idx) => {
          const dtrack = dt.discoveryTrack;
          return `[DISCOVERY] "${dtrack.title}" by ${dtrack.artist} (${dtrack.genres.join(", ")}) - Suggested because: ${dtrack.explanation || "Similar to library track"}`;
        })
        .join("\n")
    : "";

  // Format summary
  const genreMix = Array.from(playlist.summary.genreMix.entries())
    .map(([genre, count]) => `${genre}: ${count}`)
    .join(", ");
  const tempoMix = Array.from(playlist.summary.tempoMix.entries())
    .map(([tempo, count]) => `${tempo}: ${count}`)
    .join(", ");
  const artistMix = Array.from(playlist.summary.artistMix.entries())
    .slice(0, 10)
    .map(([artist, count]) => `${artist}: ${count}`)
    .join(", ");

  return `Validate this playlist against the user's requirements:

USER REQUEST:
- Genres: ${request.genres.join(", ") || "Any"}
- Mood: ${request.mood.join(", ") || "Any"}
- Activity: ${request.activity.join(", ") || "Any"}
- Tempo: ${request.tempo.bucket || "Any"} ${request.tempo.bpmRange ? `(${request.tempo.bpmRange.min}-${request.tempo.bpmRange.max} BPM)` : ""}
- Length: ${request.length.value} ${request.length.type}
- Surprise level: ${request.surprise} (0=safe, 1=adventurous)
${request.minArtists ? `- Minimum artists: ${request.minArtists}` : ""}

GENERATED PLAYLIST:
- Title: ${playlist.title}
- Description: ${playlist.description}
- Total tracks: ${playlist.summary.trackCount}
- Total duration: ${Math.round(playlist.totalDuration / 60)} minutes
- Genre mix: ${genreMix || "None"}
- Tempo mix: ${tempoMix || "None"}
- Top artists: ${artistMix || "None"}

TRACKS:
${tracksList}
${discoveryTracksList ? `\nDISCOVERY TRACKS (not in user's library, suggested for exploration):\n${discoveryTracksList}` : ""}

Evaluate:
1. Does it match requested genres? (with tolerance for genre relationships)
2. Does it match requested mood/activity?
3. Does it match requested tempo?
4. Does it meet length requirements?
5. Is there good diversity?
6. Are there any obvious mismatches?
${playlist.discoveryTracks && playlist.discoveryTracks.length > 0 ? "7. Do discovery tracks enhance the playlist and align with the user's preferences?" : ""}

Return ONLY valid JSON matching this schema:
{
  "isValid": boolean,
  "score": number (0-1),
  "requirementCoverage": {
    "genres": { "met": boolean, "score": number (0-1), "explanation": string },
    "mood": { "met": boolean, "score": number (0-1), "explanation": string },
    "activity": { "met": boolean, "score": number (0-1), "explanation": string },
    "tempo": { "met": boolean, "score": number (0-1), "explanation": string },
    "length": { "met": boolean, "score": number (0-1), "explanation": string },
    "diversity": { "met": boolean, "score": number (0-1), "explanation": string }
  },
  "issues": string[],
  "strengths": string[],
  "suggestions": string[]
}`;
}

/**
 * Build explanation prompt
 */
function buildExplanationPrompt(
  request: PlaylistRequest,
  playlist: GeneratedPlaylist,
  validation: PlaylistValidation | null
): string {
  // Format tracks with reasons
  const tracksWithReasons = playlist.trackSelections
    .slice(0, 30) // Limit to avoid token limits
    .map((selection, idx) => {
      const track = selection.track;
      const reasons = selection.reasons
        .slice(0, 3)
        .map((r) => r.explanation)
        .join("; ");
      return `${idx + 1}. "${track.tags.title}" by ${track.tags.artist} - ${reasons || "Selected for playlist"}`;
    })
    .join("\n");

  const validationInfo = validation
    ? `\nVALIDATION RESULTS:\n- Overall score: ${(validation.score * 100).toFixed(0)}%\n- Strengths: ${validation.strengths.join(", ")}\n- Issues: ${validation.issues.join(", ") || "None"}`
    : "";

  return `Generate a natural language explanation (2-4 paragraphs) for why this playlist meets the user's requirements.

USER REQUEST:
- Genres: ${request.genres.join(", ") || "Any"}
- Mood: ${request.mood.join(", ") || "Any"}
- Activity: ${request.activity.join(", ") || "Any"}
- Tempo: ${request.tempo.bucket || "Any"}
- Length: ${request.length.value} ${request.length.type}
${request.surprise > 0.3 ? `- Surprise level: ${request.surprise} (includes some adventurous choices)` : ""}

GENERATED PLAYLIST:
- Title: ${playlist.title}
- Description: ${playlist.description}
- Total tracks: ${playlist.summary.trackCount}
- Total duration: ${Math.round(playlist.totalDuration / 60)} minutes
${validationInfo}

TRACK SELECTION REASONS:
${tracksWithReasons}

Write an explanation that:
1. Summarizes how the playlist matches the request
2. Highlights 3-5 key tracks and why they're perfect for this playlist
3. Explains the playlist's flow and structure
4. Mentions any creative choices or surprises
5. Uses natural, conversational language

Return ONLY valid JSON matching this schema:
{
  "explanation": string (2-4 paragraphs),
  "keyTracks": [
    { "trackFileId": string, "reason": string }
  ],
  "flowDescription": string (1-2 sentences about the playlist's flow)
}`;
}

