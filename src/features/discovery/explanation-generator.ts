/**
 * Explanation generator for discovery tracks
 * 
 * Generates 2-3 sentence explanations for why discovery tracks are suggested.
 * Uses template-based approach with optional LLM enhancement.
 */

import type { DiscoveryTrack } from './types';
import type { TrackRecord } from '@/db/schema';
import type { PlaylistRequest, LLMConfig, LLMProvider } from '@/types/playlist';

/**
 * Call LLM API (reuse pattern from validation.ts)
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
      temperature: 0.7,
      max_tokens: 200,
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
          maxOutputTokens: 200,
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
      max_tokens: 200,
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
    }),
  });

  if (!response.ok) {
    throw new Error(`Local LLM API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || "";
}

/**
 * Generate explanation using template-based approach
 * Focuses on how the discovery track relates to user's selected items from collection
 */
function generateTemplateExplanation(
  discoveryTrack: DiscoveryTrack,
  inspiringTrack: TrackRecord,
  request: PlaylistRequest
): string {
  // Check if this was discovered based on selected genres
  const selectedGenres = request.genres || [];
  const matchingGenres = discoveryTrack.genres.filter(dg =>
    selectedGenres.some(sg =>
      dg.toLowerCase().includes(sg.toLowerCase()) ||
      sg.toLowerCase().includes(dg.toLowerCase())
    )
  );

  // Check if this was discovered based on selected albums
  const selectedAlbums = request.suggestedAlbums || [];
  const isFromSelectedAlbum = inspiringTrack.tags.album && selectedAlbums.some(sa =>
    inspiringTrack.tags.album!.toLowerCase().includes(sa.toLowerCase())
  );

  // Check if this was discovered based on selected tracks
  const selectedTracks = request.suggestedTracks || [];
  const isFromSelectedTrack = selectedTracks.some(st =>
    inspiringTrack.tags.title?.toLowerCase().includes(st.toLowerCase())
  );

  // Build explanation focusing on the selection that led to discovery
  let explanation = `"${discoveryTrack.title}" by ${discoveryTrack.artist} was discovered because `;

  if (matchingGenres.length > 0 && selectedGenres.length > 0) {
    explanation += `it shares the ${matchingGenres[0]} genre with your selected ${selectedGenres[0]} collection`;
  } else if (isFromSelectedAlbum && inspiringTrack.tags.album) {
    explanation += `it's similar to "${inspiringTrack.tags.title}" from your selected album "${inspiringTrack.tags.album}"`;
  } else if (isFromSelectedTrack) {
    explanation += `it's similar to "${inspiringTrack.tags.title}" from your selected tracks`;
  } else {
    // Fallback to genre similarity
    const sharedGenres = discoveryTrack.genres.filter(g =>
      inspiringTrack.tags.genres.some(ig =>
        ig.toLowerCase().includes(g.toLowerCase()) ||
        g.toLowerCase().includes(ig.toLowerCase())
      )
    );
    const genreText = sharedGenres.length > 0
      ? sharedGenres[0]
      : discoveryTrack.genres[0] || 'similar style';
    explanation += `it shares the ${genreText} genre with "${inspiringTrack.tags.title || 'the previous track'}"`;
  }

  // Add how they're similar
  const sharedGenres = discoveryTrack.genres.filter(g =>
    inspiringTrack.tags.genres.some(ig =>
      ig.toLowerCase().includes(g.toLowerCase()) ||
      g.toLowerCase().includes(ig.toLowerCase())
    )
  );

  if (sharedGenres.length > 0) {
    explanation += `. Both tracks explore ${sharedGenres[0]}`;
    if (sharedGenres.length > 1) {
      explanation += ` and ${sharedGenres[1]}`;
    }
  } else if (discoveryTrack.genres.length > 0) {
    explanation += `. This track brings a ${discoveryTrack.genres[0]} sound`;
  }

  // Add relationship context if available
  if (discoveryTrack.relationships && discoveryTrack.relationships.length > 0) {
    const rel = discoveryTrack.relationships[0];
    if (rel.type === 'collaboration' || rel.type === 'remix') {
      explanation += `, and features a ${rel.type} with related artists`;
    }
  }

  explanation += '.';

  return explanation;
}

/**
 * Generate explanation with optional LLM enhancement
 * 
 * @param discoveryTrack The discovery track to explain
 * @param inspiringTrack The library track that inspired this discovery
 * @param request Playlist request
 * @param llmConfig Optional LLM configuration for enhancement
 * @returns 2-3 sentence explanation
 */
export async function generateExplanation(
  discoveryTrack: DiscoveryTrack,
  inspiringTrack: TrackRecord,
  request: PlaylistRequest,
  llmConfig?: LLMConfig
): Promise<string> {
  // Always generate template explanation first
  const templateExplanation = generateTemplateExplanation(
    discoveryTrack,
    inspiringTrack,
    request
  );

  // If LLM is not configured, return template explanation
  if (!llmConfig || !llmConfig.apiKey || !llmConfig.provider) {
    return templateExplanation;
  }

  // Try to enhance with LLM
  try {
    const enhancedExplanation = await generateLLMExplanation(
      discoveryTrack,
      inspiringTrack,
      request,
      templateExplanation,
      llmConfig.provider,
      llmConfig.apiKey
    );
    return enhancedExplanation;
  } catch (error) {
    console.warn('LLM explanation generation failed, using template:', error);
    return templateExplanation;
  }
}

/**
 * Generate LLM-enhanced explanation
 */
async function generateLLMExplanation(
  discoveryTrack: DiscoveryTrack,
  inspiringTrack: TrackRecord,
  request: PlaylistRequest,
  templateExplanation: string,
  provider: LLMProvider,
  apiKey: string
): Promise<string> {
  const selectedGenres = request.genres || [];
  const selectedAlbums = request.suggestedAlbums || [];
  const selectedTracks = request.suggestedTracks || [];
  
  const prompt = `Generate a 2-3 sentence explanation for why a discovery track is suggested in a playlist based on the user's selections from their music collection.

DISCOVERY TRACK (new track NOT in user's collection):
- Title: ${discoveryTrack.title}
- Artist: ${discoveryTrack.artist}
- Album: ${discoveryTrack.album || 'Unknown'}
- Genres: ${discoveryTrack.genres.join(', ') || 'Unknown'}
${discoveryTrack.releaseYear ? `- Release Year: ${discoveryTrack.releaseYear}` : ''}

INSPIRING TRACK (from user's selected collection):
- Title: ${inspiringTrack.tags.title || 'Unknown'}
- Artist: ${inspiringTrack.tags.artist || 'Unknown'}
- Album: ${inspiringTrack.tags.album || 'Unknown'}
- Genres: ${inspiringTrack.tags.genres.join(', ') || 'Unknown'}

USER'S SELECTIONS FROM COLLECTION:
${selectedGenres.length > 0 ? `- Selected Genres: ${selectedGenres.join(', ')}` : ''}
${selectedAlbums.length > 0 ? `- Selected Albums: ${selectedAlbums.join(', ')}` : ''}
${selectedTracks.length > 0 ? `- Selected Tracks: ${selectedTracks.join(', ')}` : ''}

PLAYLIST CONTEXT:
- Mood: ${request.mood.join(', ') || 'Not specified'}
- Activity: ${request.activity.join(', ') || 'Not specified'}

TEMPLATE EXPLANATION (use as reference but make it more natural):
${templateExplanation}

Generate a natural, engaging 2-3 sentence explanation that:
1. Explains WHY this track was discovered (references the user's selected genres/albums/tracks from their collection)
2. Describes HOW it's similar to the inspiring track (shared genres, style, artist relationships)
3. Makes it clear this is a NEW track not in their collection that was found via MusicBrainz
4. Is conversational and helps the user understand the connection

Return ONLY the explanation text, no quotes or markdown formatting.`;

  const response = await callLLM(prompt, provider, apiKey);
  
  // Clean up response
  let explanation = response.trim();
  
  // Remove markdown code blocks if present
  explanation = explanation.replace(/```[a-z]*\n?/g, '').replace(/```/g, '');
  
  // Remove quotes if wrapped
  if ((explanation.startsWith('"') && explanation.endsWith('"')) ||
      (explanation.startsWith("'") && explanation.endsWith("'"))) {
    explanation = explanation.slice(1, -1);
  }
  
  // Ensure it's 2-3 sentences (split by periods, keep first 3)
  const sentences = explanation.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 3) {
    explanation = sentences.slice(0, 3).join('. ') + '.';
  }
  
  return explanation.trim() || templateExplanation;
}

