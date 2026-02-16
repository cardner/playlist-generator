/**
 * Deterministic Matching Engine for Playlist Generation
 * 
 * This is the core orchestrator for playlist generation. It selects real tracks from
 * IndexedDB using a combination of user request parameters and LLM-generated strategy.
 * The engine enforces constraints and provides explainable reasons for each track selection.
 * 
 * Generation Pipeline:
 * 1. **Filtering**: Filters candidate tracks based on constraints (genre, tempo, duration)
 * 2. **Scoring**: Scores tracks using multiple factors (genre match, tempo, diversity, surprise)
 * 3. **Selection**: Selects top-scoring tracks with optional LLM refinement
 * 4. **Summary**: Generates summary statistics (genre mix, tempo distribution, etc.)
 * 5. **Ordering**: Orders tracks using flow arc (warmup → build → peak → cooldown)
 * 6. **Discovery**: Integrates discovery tracks (if enabled) after library tracks
 * 
 * Key Features:
 * - Deterministic selection (same request = same playlist, unless LLM refinement is used)
 * - Explainable reasons for each track selection
 * - Constraint enforcement (required genres, tempo ranges, duration limits)
 * - Flow arc ordering for smooth listening experience
 * - Discovery track integration for music exploration
 * 
 * @module features/playlists/matching-engine
 * 
 * @example
 * ```typescript
 * import { generatePlaylist } from '@/features/playlists/matching-engine';
 * 
 * const playlist = await generatePlaylist(request, strategy, index);
 * // Returns: GeneratedPlaylist with tracks, summary, and ordering
 * ```
 */

import type { PlaylistRequest } from "@/types/playlist";
import type { PlaylistStrategy } from "./strategy";
import type { MatchingIndex } from "@/features/library/summarization";
import type { TrackRecord } from "@/db/schema";
import type { LLMRefinedTrackScore, LLMProvider } from "@/types/playlist";
import { orderTracks } from "./ordering";
import { normalizeGenre } from "@/features/library/genre-normalization";
import { logger } from "@/lib/logger";
import { scoreTrack, refineTrackSelectionWithLLM } from "./track-selection";
import { generatePlaylistSummary } from "./summary";
import { mapMoodTagsToCategories } from "@/features/library/mood-mapping";
import { mapActivityTagsToCategories } from "@/features/library/activity-mapping";
import { inferActivityFromTrack } from "@/features/library/activity-inference";

export interface TrackReason {
  type:
    | "genre_match"
    | "tempo_match"
    | "mood_match"
    | "activity_match"
    | "duration_fit"
    | "diversity"
    | "surprise"
    | "constraint"
    | "affinity";
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
  moodMatch: number;
  activityMatch: number;
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
  /** Custom emoji selected by user (overrides auto-selected emoji) */
  customEmoji?: string | null;
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

/** Returns canonical mood categories for a track (from tags or tempo fallback). */
function getMappedMoodTags(track: TrackRecord): string[] {
  return mapMoodTagsToCategories(track.enhancedMetadata?.mood || []);
}

/** Returns canonical activity categories for a track (from tags or inference). */
function getMappedActivityTags(track: TrackRecord): string[] {
  const mapped = mapActivityTagsToCategories(track.enhancedMetadata?.activity || []);
  if (mapped.length > 0) {
    return mapped;
  }
  return inferActivityFromTrack(track);
}

/**
 * Context of artists and genres related to user suggestions.
 * Used to give affinity bonuses to tracks from suggested artists or similar genres.
 */
interface AffinityContext {
  artists: Set<string>;
  genres: Set<string>;
}

function normalizeKey(value?: string): string {
  return value?.toLowerCase().trim() || "";
}

/**
 * Builds affinity context from suggested artists/albums/tracks.
 * Includes similar artists from track metadata. Used to seed candidate pools
 * and apply affinity bonuses during scoring.
 */
function buildAffinityContext(request: PlaylistRequest, allTracks: TrackRecord[]): AffinityContext {
  const context: AffinityContext = {
    artists: new Set<string>(),
    genres: new Set<string>(),
  };

  const suggestedArtists = (request.suggestedArtists || []).map(normalizeKey).filter(Boolean);
  const suggestedAlbums = (request.suggestedAlbums || []).map(normalizeKey).filter(Boolean);
  const suggestedTracks = (request.suggestedTracks || []).map(normalizeKey).filter(Boolean);

  for (const artist of suggestedArtists) {
    context.artists.add(artist);
  }

  for (const track of allTracks) {
    const artistKey = normalizeKey(track.tags.artist);
    const albumKey = normalizeKey(track.tags.album);
    const titleKey = normalizeKey(track.tags.title);

    const isSuggestedArtist = artistKey && suggestedArtists.includes(artistKey);
    const isSuggestedAlbum = albumKey && suggestedAlbums.includes(albumKey);
    const isSuggestedTrack = titleKey && suggestedTracks.includes(titleKey);

    if (isSuggestedArtist || isSuggestedAlbum || isSuggestedTrack) {
      if (artistKey) {
        context.artists.add(artistKey);
      }
      for (const genre of track.tags.genres) {
        const normalized = normalizeGenre(genre).toLowerCase();
        if (normalized) {
          context.genres.add(normalized);
        }
      }
      for (const similar of track.enhancedMetadata?.similarArtists || []) {
        const similarKey = normalizeKey(similar);
        if (similarKey) {
          context.artists.add(similarKey);
        }
      }
    }
  }

  return context;
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
  const affinityContext = buildAffinityContext(request, allTracks);

  // Start with required genres or requested genres; include secondary genres from mix guidance when present
  let genresToMatch =
    strategy.constraints.requiredGenres || request.genres;
  if (strategy.genreMixGuidance) {
    const mixGenres = [
      ...(strategy.genreMixGuidance.primaryGenres || []),
      ...(strategy.genreMixGuidance.secondaryGenres || []),
    ];
    if (mixGenres.length > 0) {
      genresToMatch = [...new Set([...genresToMatch, ...mixGenres])];
    }
  }

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

  // Seed candidate pool with affinity artists (suggested or similar)
  if (affinityContext.artists.size > 0) {
    for (const track of allTracks) {
      const artistKey = normalizeKey(track.tags.artist);
      if (artistKey && affinityContext.artists.has(artistKey)) {
        candidateIds.add(track.trackFileId);
      }
    }
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

  // Filter by mood/activity when tags are available (balanced mode)
  if ((request.mood.length > 0 || request.activity.length > 0) && candidateIds.size > 0) {
    const filteredIds = new Set<string>();
    for (const trackId of candidateIds) {
      const track = allTracks.find((t) => t.trackFileId === trackId);
      if (!track) continue;

      const moodTags = getMappedMoodTags(track);
      const activityTags = getMappedActivityTags(track);

      const moodPass =
        request.mood.length === 0 ||
        moodTags.length === 0 ||
        moodTags.some((m) => request.mood.includes(m));
      const activityPass =
        request.activity.length === 0 ||
        activityTags.length === 0 ||
        activityTags.some((a) => request.activity.includes(a));

      if (moodPass && activityPass) {
        filteredIds.add(trackId);
      }
    }

    if (filteredIds.size > 0) {
      candidateIds.clear();
      for (const id of filteredIds) {
        candidateIds.add(id);
      }
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
      remainingSlots,
      affinityContext
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
          remainingSlots,
          affinityContext
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
        logger.warn("LLM refinement failed, using algorithmic scores:", error);
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

  // Generate summary statistics
  const summary = generatePlaylistSummary(selected, index);

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
          logger.warn(`Failed to find discovery track for ${libraryTrack.tags.title}:`, error);
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
      logger.warn("Discovery track generation failed:", error);
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

/**
 * Generate N replacement tracks for playlist editing (e.g. when user deletes a track).
 * Uses the same candidate filtering and scoring as full generation, but excludes
 * context tracks and returns only the requested count.
 *
 * @param count Number of replacement tracks to generate
 * @param contextSelections Existing track selections (used for diversity/scoring context)
 * @param excludeTrackIds Track IDs to exclude (e.g. user-removed tracks)
 * @param seed Optional seed for deterministic selection
 */
export function generateReplacementTracks(
  request: PlaylistRequest,
  strategy: PlaylistStrategy,
  index: MatchingIndex,
  allTracks: TrackRecord[],
  count: number,
  contextSelections: TrackSelection[],
  excludeTrackIds: string[],
  seed?: string | number
): TrackSelection[] {
  const excludeSet = new Set([
    ...excludeTrackIds,
    ...contextSelections.map((s) => s.trackFileId),
  ]);

  let seedValue: number;
  if (typeof seed === "string") {
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
    seedValue = request.genres.join(",").length + request.length.value;
  }
  const rng = new SeededRandom(seedValue);

  const targetDurationSeconds =
    request.length.type === "minutes"
      ? request.length.value * 60
      : request.length.value * 180;
  const affinityContext = buildAffinityContext(request, allTracks);

  const candidateIds = new Set<string>();
  let genresToMatch = strategy.constraints.requiredGenres || request.genres;
  if (strategy.genreMixGuidance) {
    const mixGenres = [
      ...(strategy.genreMixGuidance.primaryGenres || []),
      ...(strategy.genreMixGuidance.secondaryGenres || []),
    ];
    if (mixGenres.length > 0) {
      genresToMatch = [...new Set([...genresToMatch, ...mixGenres])];
    }
  }

  if (genresToMatch.length > 0) {
    for (const genre of genresToMatch) {
      const genreTracks = index.byGenre.get(genre) || [];
      for (const trackId of genreTracks) {
        candidateIds.add(trackId);
      }
    }
  } else {
    index.allTrackIds.forEach((id) => candidateIds.add(id));
  }

  if (affinityContext.artists.size > 0) {
    for (const track of allTracks) {
      const artistKey = normalizeKey(track.tags.artist);
      if (artistKey && affinityContext.artists.has(artistKey)) {
        candidateIds.add(track.trackFileId);
      }
    }
  }

  if (strategy.constraints.excludedGenres) {
    for (const genre of strategy.constraints.excludedGenres) {
      const excludedTracks = index.byGenre.get(genre) || [];
      for (const trackId of excludedTracks) {
        candidateIds.delete(trackId);
      }
    }
  }

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

  if ((request.mood.length > 0 || request.activity.length > 0) && candidateIds.size > 0) {
    const filteredIds = new Set<string>();
    for (const trackId of candidateIds) {
      const track = allTracks.find((t) => t.trackFileId === trackId);
      if (!track) continue;

      const moodTags = getMappedMoodTags(track);
      const activityTags = getMappedActivityTags(track);

      const moodPass =
        request.mood.length === 0 ||
        moodTags.length === 0 ||
        moodTags.some((m) => request.mood.includes(m));
      const activityPass =
        request.activity.length === 0 ||
        activityTags.length === 0 ||
        activityTags.some((a) => request.activity.includes(a));

      if (moodPass && activityPass) {
        filteredIds.add(trackId);
      }
    }

    if (filteredIds.size > 0) {
      candidateIds.clear();
      for (const id of filteredIds) {
        candidateIds.add(id);
      }
    }
  }

  for (const id of excludeSet) {
    candidateIds.delete(id);
  }

  const candidates = Array.from(candidateIds)
    .map((id) => allTracks.find((t) => t.trackFileId === id))
    .filter((t): t is TrackRecord => !!t);

  if (candidates.length === 0) {
    return [];
  }

  const previousTracks = contextSelections.map((s) => s.track);
  const currentDuration = previousTracks.reduce(
    (sum, t) => sum + (t.tech?.durationSeconds || 180),
    0
  );

  const result: TrackSelection[] = [];
  let workingCandidates = [...candidates];

  for (let i = 0; i < count && workingCandidates.length > 0; i++) {
    const remainingSlots = count - result.length;
    const scored = workingCandidates.map((track) =>
      scoreTrack(
        track,
        request,
        strategy,
        index,
        [...previousTracks, ...result.map((r) => r.track)],
        currentDuration + result.reduce((s, r) => s + (r.track.tech?.durationSeconds || 180), 0),
        targetDurationSeconds,
        remainingSlots,
        affinityContext
      )
    );

    scored.sort((a, b) => b.score - a.score);

    const surpriseWindow = Math.max(
      1,
      Math.floor(scored.length * (1 - request.surprise * 0.5))
    );
    const topCandidates = scored.slice(0, Math.min(10, surpriseWindow));
    const selected = topCandidates[Math.floor(rng.next() * topCandidates.length)];

    result.push(selected);
    workingCandidates = workingCandidates.filter(
      (t) => t.trackFileId !== selected.trackFileId
    );
  }

  return result;
}

