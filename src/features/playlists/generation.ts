/**
 * Playlist generation engine
 * 
 * Wrapper that uses the deterministic matching engine
 */

import type { PlaylistRequest } from "@/types/playlist";
import type { PlaylistStrategy } from "./strategy";
import type { GeneratedPlaylist, TrackSelection } from "./matching-engine";
import { generateReplacementTracks } from "./matching-engine";
import { getAllTracks } from "@/db/storage";
import { db } from "@/db/schema";
import type { TrackRecord } from "@/db/schema";
import { logger } from "@/lib/logger";
import { applyTempoMappingsToRequest } from "@/lib/tempo-mapping";
import { normalizePlaylistRequest } from "./request-normalization";
import { applyRecentFilter } from "./recent-filter";

// Re-export types from matching engine
export type {
  GeneratedPlaylist,
  TrackSelection,
  TrackReason,
  PlaylistSummary,
} from "./matching-engine";

/**
 * Generate playlist from request and strategy using deterministic matching engine
 * 
 * @param seed Optional seed for deterministic generation. If provided, uses stable mode.
 * @param excludeTrackIds Optional array of track IDs to exclude from generation
 */
export async function generatePlaylistFromStrategy(
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  libraryRootId?: string,
  seed?: string,
  excludeTrackIds?: string[]
): Promise<GeneratedPlaylist> {
  const isBuiltInAgent =
    request.agentType !== "llm" ||
    !request.llmConfig?.apiKey ||
    !request.llmConfig?.provider;

  const normalizedRequest = normalizePlaylistRequest(
    applyTempoMappingsToRequest({
      ...request,
      mood: [...request.mood],
      activity: [...request.activity],
      tempo: { ...request.tempo },
    }),
    isBuiltInAgent ? { mergeInstructions: true } : undefined
  );
  // Get all tracks
  let allTracks: TrackRecord[];
  if (libraryRootId) {
    allTracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
  } else {
    allTracks = await getAllTracks();
  }

  if (allTracks.length === 0) {
    throw new Error("No tracks available in library");
  }

  // Filter out excluded tracks
  if (excludeTrackIds && excludeTrackIds.length > 0) {
    const excludeSet = new Set(excludeTrackIds);
    allTracks = allTracks.filter((t) => !excludeSet.has(t.trackFileId));
  }

  if (allTracks.length === 0) {
    throw new Error("No tracks available after filtering");
  }

  // Apply recent filter when sourcePool is "recent"
  allTracks = applyRecentFilter(allTracks, normalizedRequest);
  if (normalizedRequest.sourcePool === "recent" && allTracks.length === 0) {
    const windowLabel =
      normalizedRequest.recentTrackCount != null
        ? `last ${normalizedRequest.recentTrackCount} tracks`
        : normalizedRequest.recentWindow ?? "30d";
    throw new Error(
      `No recent tracks in the selected window (${windowLabel}). Try a larger window or add more tracks to your collection.`
    );
  }

  // Check if LLM is enabled for tempo detection
  const llmConfig = normalizedRequest.llmConfig;
  const apiKey = llmConfig?.apiKey;
  const useLLM = !!(
    normalizedRequest.agentType === "llm" &&
    llmConfig &&
    apiKey &&
    llmConfig.provider
  );

  // Detect tempo for tracks missing BPM if LLM is enabled
  // Prioritize tracks that match requested genres and tempo requirements
  const hasTempoRequirement = !!(
    normalizedRequest.tempo.bucket || normalizedRequest.tempo.bpmRange
  );
  
  if (useLLM && llmConfig && apiKey) {
    try {
      const { buildMatchingIndex: buildTempIndex } = await import("@/features/library/summarization");
      const tempIndex = await buildTempIndex(libraryRootId);
      
      // Get tracks that match requested genres (prioritize these)
      const genreMatchedTrackIds = new Set<string>();
      for (const genre of normalizedRequest.genres) {
        const genreTracks = tempIndex.byGenre.get(genre) || [];
        genreTracks.forEach((id) => genreMatchedTrackIds.add(id));
      }
      
      // Separate tracks into priority (genre-matched) and regular
      const priorityTracks: TrackRecord[] = [];
      const regularTracks: TrackRecord[] = [];
      
      for (const track of allTracks) {
        if (!track.tech?.bpm && track.tags.title && track.tags.artist) {
          if (genreMatchedTrackIds.has(track.trackFileId)) {
            priorityTracks.push(track);
          } else {
            regularTracks.push(track);
          }
        }
      }
      
      // If tempo is required, increase batch size to detect more tracks
      const batchSize = hasTempoRequirement ? 100 : 50;
      const maxTracks = hasTempoRequirement ? batchSize * 3 : batchSize * 2; // Up to 300 if tempo required, 100 otherwise
      const tracksToDetect = [...priorityTracks, ...regularTracks].slice(0, maxTracks);
      
      if (tracksToDetect.length > 0) {
        const { detectTempoBatchWithLLM } = await import("@/features/library/tempo-detection");
        const { updateTracksTempo } = await import("@/db/storage");

        // Process in batches
        const updates: Array<{ trackFileId: string; libraryRootId: string; bpm: number }> = [];
        
        for (let i = 0; i < tracksToDetect.length; i += batchSize) {
          const batch = tracksToDetect.slice(i, i + batchSize);
          try {
            const detectedTempos = await detectTempoBatchWithLLM(
              batch,
              llmConfig.provider,
              apiKey
            );

            // Collect updates
            for (const [trackFileId, bpm] of detectedTempos.entries()) {
              const track = batch.find((t) => t.trackFileId === trackFileId);
              if (track) {
                updates.push({
                  trackFileId,
                  libraryRootId: track.libraryRootId || libraryRootId || "",
                  bpm,
                });
              }
            }
          } catch (error) {
            logger.warn(`Tempo detection batch ${i / batchSize + 1} failed:`, error);
            // Continue with next batch
          }
        }

        // Update all detected tempos
        if (updates.length > 0) {
          await updateTracksTempo(updates.filter((u) => u.libraryRootId));
          
          // Reload tracks to get updated BPM values
          if (libraryRootId) {
            allTracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
          } else {
            allTracks = await getAllTracks();
          }
          
          // Re-filter excluded tracks and recent filter
          if (excludeTrackIds && excludeTrackIds.length > 0) {
            const excludeSet = new Set(excludeTrackIds);
            allTracks = allTracks.filter((t) => !excludeSet.has(t.trackFileId));
          }
          allTracks = applyRecentFilter(allTracks, normalizedRequest);
        }
      }
    } catch (error) {
      logger.warn("Tempo detection failed, continuing without detected tempos:", error);
    }
  }

  // Build matching index (will use stored BPM values)
  const { buildMatchingIndex } = await import("@/features/library/summarization");
  const matchingIndex = await buildMatchingIndex(libraryRootId);

  // Check if LLM is enabled (reuse from above if already checked)
  const enableLLMRefinement = useLLM; // Enable refinement when LLM is selected
  const enableLLMValidation = useLLM; // Enable validation when LLM is selected

  // Use deterministic matching engine with optional LLM refinement
  const { generatePlaylist: generatePlaylistDeterministic } = await import("./matching-engine");
  let playlist = await generatePlaylistDeterministic(
    libraryRootId,
    normalizedRequest,
    strategy,
    matchingIndex,
    allTracks,
    seed,
    enableLLMRefinement,
    llmConfig?.provider,
    apiKey
  );

  // Detect tempo for all selected tracks that are missing BPM (post-selection detection)
  // This ensures all tracks in the final playlist have tempo information
  if (useLLM && llmConfig && apiKey) {
    try {
      const selectedTracksMissingTempo = playlist.trackSelections
        .filter((selection) => !selection.track.tech?.bpm && selection.track.tags.title && selection.track.tags.artist)
        .map((selection) => selection.track);

      if (selectedTracksMissingTempo.length > 0) {
        const { detectTempoBatchWithLLM } = await import("@/features/library/tempo-detection");
        const { updateTracksTempo } = await import("@/db/storage");

        // Detect tempo for all selected tracks missing BPM
        const detectedTempos = await detectTempoBatchWithLLM(
          selectedTracksMissingTempo,
          llmConfig.provider,
          apiKey
        );

        // Update tracks with detected tempos
        if (detectedTempos.size > 0) {
          const updates = Array.from(detectedTempos.entries()).map(([trackFileId, bpm]) => {
            const track = selectedTracksMissingTempo.find((t) => t.trackFileId === trackFileId);
            return {
              trackFileId,
              libraryRootId: track?.libraryRootId || libraryRootId || "",
              bpm,
            };
          }).filter((u) => u.libraryRootId);

          if (updates.length > 0) {
            await updateTracksTempo(updates);
            
            // Reload tracks and rebuild matching index to get updated BPM values
            if (libraryRootId) {
              allTracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
            } else {
              allTracks = await getAllTracks();
            }
            
            // Re-filter excluded tracks and recent filter
            if (excludeTrackIds && excludeTrackIds.length > 0) {
              const excludeSet = new Set(excludeTrackIds);
              allTracks = allTracks.filter((t) => !excludeSet.has(t.trackFileId));
            }
            allTracks = applyRecentFilter(allTracks, normalizedRequest);
            
            // Rebuild matching index with updated BPM values
            const updatedMatchingIndex = await buildMatchingIndex(libraryRootId);
            
            // Update tempo bucket in playlist summary
            const updatedTempoMix = new Map<string, number>();
            for (const selection of playlist.trackSelections) {
              const track = allTracks.find((t) => t.trackFileId === selection.trackFileId);
              const metadata = updatedMatchingIndex.trackMetadata.get(selection.trackFileId);
              const tempoBucket = metadata?.tempoBucket || "unknown";
              updatedTempoMix.set(tempoBucket, (updatedTempoMix.get(tempoBucket) || 0) + 1);
            }
            
            // Update playlist with new tempo mix
            playlist = {
              ...playlist,
              summary: {
                ...playlist.summary,
                tempoMix: updatedTempoMix,
              },
            };
          }
        }
      }
    } catch (error) {
      logger.warn("Post-selection tempo detection failed:", error);
      // Continue with playlist as-is
    }
  }

  // Validate and generate explanation if LLM is enabled
  if (enableLLMValidation && llmConfig && apiKey) {
    try {
      const { validatePlaylistWithLLM, generatePlaylistExplanation } = await import("./validation");
      
      // Validate playlist
      const validation = await validatePlaylistWithLLM(
        normalizedRequest,
        playlist,
        llmConfig.provider,
        apiKey
      );

      // Generate explanation
      const explanation = await generatePlaylistExplanation(
        normalizedRequest,
        playlist,
        validation,
        llmConfig.provider,
        apiKey
      );

      // Attach validation and explanation to playlist
      return {
        ...playlist,
        validation: validation || undefined,
        explanation: explanation || undefined,
      };
    } catch (error) {
      logger.warn("LLM validation/explanation failed:", error);
      // Return playlist without validation/explanation
      return playlist;
    }
  }

  try {
    const { validatePlaylistDeterministic } = await import("./validation");
    return {
      ...playlist,
      validation: validatePlaylistDeterministic(normalizedRequest, playlist),
    };
  } catch (error) {
    logger.warn("Deterministic validation failed:", error);
    return playlist;
  }
}

/**
 * Generate N replacement tracks for playlist editing (e.g. when user deletes a track).
 * Keeps the same request/strategy context and excludes removed + existing tracks.
 */
export async function generateReplacementTracksFromStrategy(
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  libraryRootId: string | undefined,
  count: number,
  contextSelections: TrackSelection[],
  excludeTrackIds: string[],
  seed?: string
): Promise<TrackSelection[]> {
  const isBuiltInAgent =
    request.agentType !== "llm" ||
    !request.llmConfig?.apiKey ||
    !request.llmConfig?.provider;

  const normalizedRequest = normalizePlaylistRequest(
    applyTempoMappingsToRequest({
      ...request,
      mood: [...request.mood],
      activity: [...request.activity],
      tempo: { ...request.tempo },
    }),
    isBuiltInAgent ? { mergeInstructions: true } : undefined
  );

  let allTracks: TrackRecord[];
  if (libraryRootId) {
    allTracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
  } else {
    allTracks = await getAllTracks();
  }

  if (allTracks.length === 0) {
    return [];
  }

  const excludeSet = new Set(excludeTrackIds);
  allTracks = allTracks.filter((t) => !excludeSet.has(t.trackFileId));

  if (allTracks.length === 0) {
    return [];
  }

  allTracks = applyRecentFilter(allTracks, normalizedRequest);
  if (normalizedRequest.sourcePool === "recent" && allTracks.length === 0) {
    return [];
  }

  const { buildMatchingIndex } = await import("@/features/library/summarization");
  const matchingIndex = await buildMatchingIndex(libraryRootId);

  return generateReplacementTracks(
    normalizedRequest,
    strategy,
    matchingIndex,
    allTracks,
    count,
    contextSelections,
    excludeTrackIds,
    seed
  );
}
