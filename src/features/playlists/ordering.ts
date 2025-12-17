/**
 * Playlist ordering agent
 * 
 * Creates delightful sequencing with arc and transitions
 */

import type { TrackSelection, TrackReason } from "./matching-engine";
import type { PlaylistStrategy } from "./strategy";
import type { PlaylistRequest } from "@/types/playlist";
import type { MatchingIndex } from "@/features/library/summarization";

export interface OrderedTrack {
  trackFileId: string;
  position: number;
  section: string; // "warmup" | "build" | "peak" | "cooldown" | "transition"
  reasons: TrackReason[];
  transitionScore: number; // How well this track transitions from previous
}

export interface OrderedTracks {
  tracks: OrderedTrack[];
  arc: {
    warmup: number;
    build: number;
    peak: number;
    cooldown: number;
  };
}

/**
 * Calculate transition score between two tracks
 */
function calculateTransitionScore(
  current: TrackSelection,
  previous: TrackSelection | null,
  matchingIndex: MatchingIndex
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 1.0;

  if (!previous) {
    return { score: 1.0, reasons: ["First track"] };
  }

  const currentTrack = current.track;
  const previousTrack = previous.track;

  // Penalty for same artist back-to-back
  if (currentTrack.tags.artist === previousTrack.tags.artist) {
    score *= 0.2; // Heavy penalty
    reasons.push("Same artist as previous track");
  }

  // Penalty for same album back-to-back
  if (currentTrack.tags.album === previousTrack.tags.album) {
    score *= 0.5;
    reasons.push("Same album as previous track");
  }

  // Check genre overlap
  const currentGenres = new Set(
    currentTrack.tags.genres.map((g) => g.toLowerCase())
  );
  const previousGenres = new Set(
    previousTrack.tags.genres.map((g) => g.toLowerCase())
  );
  const genreOverlap = Array.from(currentGenres).filter((g) =>
    previousGenres.has(g)
  );

  if (genreOverlap.length > 0) {
    // Light clustering bonus (but not too much)
    score *= 1.1;
    reasons.push(`Genre continuity: ${genreOverlap[0]}`);
  } else {
    // Genre change - slight penalty but acceptable
    score *= 0.9;
    reasons.push("Genre change");
  }

  // Tempo transition
  const currentTempo =
    matchingIndex.trackMetadata.get(currentTrack.trackFileId)?.tempoBucket ||
    "unknown";
  const previousTempo =
    matchingIndex.trackMetadata.get(previousTrack.trackFileId)?.tempoBucket ||
    "unknown";

  if (currentTempo !== "unknown" && previousTempo !== "unknown") {
    const tempoOrder = { slow: 0, medium: 1, fast: 2 };
    const currentTempoValue = tempoOrder[currentTempo as keyof typeof tempoOrder] ?? 1;
    const previousTempoValue = tempoOrder[previousTempo as keyof typeof tempoOrder] ?? 1;
    const tempoDiff = Math.abs(currentTempoValue - previousTempoValue);

    if (tempoDiff === 0) {
      // Same tempo - neutral
      score *= 1.0;
    } else if (tempoDiff === 1) {
      // Adjacent tempo - good transition
      score *= 1.2;
      reasons.push(`Smooth tempo transition: ${previousTempo} → ${currentTempo}`);
    } else {
      // Jump in tempo - acceptable but not ideal
      score *= 0.8;
      reasons.push(`Tempo jump: ${previousTempo} → ${currentTempo}`);
    }
  }

  // Year transition (if available)
  if (currentTrack.tags.year && previousTrack.tags.year) {
    const yearDiff = Math.abs(currentTrack.tags.year - previousTrack.tags.year);
    if (yearDiff < 5) {
      // Similar era - slight bonus
      score *= 1.05;
      reasons.push(`Similar era (${yearDiff} years apart)`);
    } else if (yearDiff > 20) {
      // Big era jump - slight penalty
      score *= 0.95;
      reasons.push(`Era jump (${yearDiff} years apart)`);
    }
  }

  return { score, reasons };
}

/**
 * Assign tracks to sections based on ordering plan
 */
function assignToSections(
  tracks: TrackSelection[],
  strategy: PlaylistStrategy,
  matchingIndex: MatchingIndex
): Map<string, TrackSelection[]> {
  const sections = new Map<string, TrackSelection[]>();
  const orderingPlan = strategy.orderingPlan;

  // Initialize sections
  for (const section of orderingPlan.sections) {
    sections.set(section.name, []);
  }

  // Calculate section boundaries
  const totalTracks = tracks.length;
  const sectionBoundaries: Array<{
    name: string;
    start: number;
    end: number;
    tempoTarget?: string;
    energyLevel?: string;
  }> = [];

  for (const section of orderingPlan.sections) {
    const start = Math.floor(section.startPosition * totalTracks);
    const end = Math.floor(section.endPosition * totalTracks);
    sectionBoundaries.push({
      name: section.name,
      start,
      end,
      tempoTarget: section.tempoTarget,
      energyLevel: section.energyLevel,
    });
  }

  // Sort tracks by score (best tracks first)
  const sortedTracks = [...tracks].sort((a, b) => b.score - a.score);

  // Distribute tracks to sections
  const usedTracks = new Set<string>();
  
  for (const boundary of sectionBoundaries) {
    const sectionTracks: TrackSelection[] = [];
    const sectionSize = boundary.end - boundary.start;

    // Filter tracks that haven't been assigned yet
    let candidates = sortedTracks.filter(
      (t) => !usedTracks.has(t.trackFileId)
    );

    // Filter by tempo if specified
    if (boundary.tempoTarget) {
      const tempoTracks = matchingIndex.byTempoBucket.get(boundary.tempoTarget as any) || [];
      const tempoSet = new Set(tempoTracks);
      // Prefer tempo matches, but don't exclude others if not enough
      const tempoMatches = candidates.filter((t) => tempoSet.has(t.trackFileId));
      if (tempoMatches.length >= sectionSize) {
        candidates = tempoMatches;
      }
    }

    // Take tracks for this section
    for (let i = 0; i < sectionSize && candidates.length > 0; i++) {
      const selected = candidates[0];
      sectionTracks.push(selected);
      usedTracks.add(selected.trackFileId);
      candidates = candidates.slice(1);
    }

    sections.set(boundary.name, sectionTracks);
  }

  // Assign any remaining tracks to the peak section
  const remaining = sortedTracks.filter((t) => !usedTracks.has(t.trackFileId));
  if (remaining.length > 0) {
    const peakTracks = sections.get("peak") || [];
    peakTracks.push(...remaining);
    sections.set("peak", peakTracks);
  }

  return sections;
}

/**
 * Order tracks within a section with transition awareness
 */
function orderSectionTracks(
  sectionTracks: TrackSelection[],
  previousTrack: TrackSelection | null,
  matchingIndex: MatchingIndex
): TrackSelection[] {
  if (sectionTracks.length === 0) {
    return [];
  }

  if (sectionTracks.length === 1) {
    return sectionTracks;
  }

  // Use a greedy algorithm: pick the best transition from remaining tracks
  const ordered: TrackSelection[] = [];
  const remaining = [...sectionTracks];
  let currentPrevious = previousTrack;

  while (remaining.length > 0) {
    // Score each remaining track for transition quality
    const scored = remaining.map((track) => {
      const transition = calculateTransitionScore(
        track,
        currentPrevious,
        matchingIndex
      );
      return {
        track,
        transitionScore: transition.score,
        reasons: transition.reasons,
      };
    });

    // Sort by transition score (best transitions first)
    scored.sort((a, b) => b.transitionScore - a.transitionScore);

    // Pick the best transition
    const best = scored[0];
    ordered.push(best.track);
    currentPrevious = best.track;

    // Remove from remaining
    const index = remaining.findIndex(
      (t) => t.trackFileId === best.track.trackFileId
    );
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }

  return ordered;
}

/**
 * Insert surprise tracks at defined positions
 */
function insertSurpriseTracks(
  ordered: TrackSelection[],
  allTracks: TrackSelection[],
  strategy: PlaylistStrategy,
  request: PlaylistRequest,
  matchingIndex: MatchingIndex
): TrackSelection[] {
  if (request.surprise < 0.3 || ordered.length < 5) {
    return ordered; // Not enough surprise or too few tracks
  }

  const surpriseCount = Math.floor(ordered.length * request.surprise * 0.1); // 0-10% of tracks
  if (surpriseCount === 0) {
    return ordered;
  }

  // Find tracks that are "surprise" candidates (not in main selection)
  const selectedIds = new Set(ordered.map((t) => t.trackFileId));
  const surpriseCandidates = allTracks.filter(
    (t) => !selectedIds.has(t.trackFileId) && t.surprise > 0.3
  );

  if (surpriseCandidates.length === 0) {
    return ordered;
  }

  // Sort surprise candidates by surprise score
  surpriseCandidates.sort((a, b) => b.surprise - a.surprise);

  // Insert surprises at strategic positions (25%, 50%, 75% through playlist)
  const positions = [
    Math.floor(ordered.length * 0.25),
    Math.floor(ordered.length * 0.5),
    Math.floor(ordered.length * 0.75),
  ].slice(0, surpriseCount);

  const result = [...ordered];
  let insertOffset = 0;

  for (let i = 0; i < Math.min(surpriseCount, surpriseCandidates.length); i++) {
    const position = positions[i] + insertOffset;
    const surpriseTrack = surpriseCandidates[i];

    // Add surprise reason
    const surpriseReason: TrackReason = {
      type: "surprise",
      explanation: `Surprise track at position ${position + 1}`,
      score: surpriseTrack.surprise,
    };
    surpriseTrack.reasons.push(surpriseReason);

    result.splice(position, 0, surpriseTrack);
    insertOffset++; // Adjust positions for subsequent inserts
  }

  return result;
}

/**
 * Order tracks with arc and transitions
 */
export function orderTracks(
  trackCandidates: TrackSelection[],
  strategy: PlaylistStrategy,
  request: PlaylistRequest,
  matchingIndex: MatchingIndex
): OrderedTracks {
  if (trackCandidates.length === 0) {
    return {
      tracks: [],
      arc: { warmup: 0, build: 0, peak: 0, cooldown: 0 },
    };
  }

  // Assign tracks to sections based on ordering plan
  const sections = assignToSections(trackCandidates, strategy, matchingIndex);

  // Order tracks within each section with transition awareness
  const ordered: TrackSelection[] = [];
  let previousTrack: TrackSelection | null = null;

  // Process sections in order (warmup → build → peak → cooldown → transition)
  const sectionOrder = ["warmup", "build", "peak", "cooldown", "transition"];
  for (const sectionName of sectionOrder) {
    const sectionTracks = sections.get(sectionName) || [];
    if (sectionTracks.length === 0) continue;

    // Order this section with transition awareness
    const orderedSection = orderSectionTracks(
      sectionTracks,
      previousTrack,
      matchingIndex
    );

    // Update previous track for next section transition
    if (orderedSection.length > 0) {
      previousTrack = orderedSection[orderedSection.length - 1];
    }

    ordered.push(...orderedSection);
  }

  // Insert surprise tracks if requested
  const finalOrdered = insertSurpriseTracks(
    ordered,
    trackCandidates,
    strategy,
    request,
    matchingIndex
  );

  // Build ordered tracks with positions and sections
  const orderedTracks: OrderedTrack[] = finalOrdered.map((selection, index) => {
    // Determine which section this track belongs to
    const positionRatio = index / finalOrdered.length;
    let section = "peak"; // default

    for (const sectionDef of strategy.orderingPlan.sections) {
      if (
        positionRatio >= sectionDef.startPosition &&
        positionRatio < sectionDef.endPosition
      ) {
        section = sectionDef.name;
        break;
      }
    }

    // Calculate transition score from previous track
    const previous =
      index > 0 ? finalOrdered[index - 1] : null;
    const transition = calculateTransitionScore(
      selection,
      previous,
      matchingIndex
    );

    return {
      trackFileId: selection.trackFileId,
      position: index + 1,
      section,
      reasons: selection.reasons,
      transitionScore: transition.score,
    };
  });

  // Calculate arc statistics
  const arc = {
    warmup: orderedTracks.filter((t) => t.section === "warmup").length,
    build: orderedTracks.filter((t) => t.section === "build").length,
    peak: orderedTracks.filter((t) => t.section === "peak").length,
    cooldown: orderedTracks.filter((t) => t.section === "cooldown").length,
  };

  return {
    tracks: orderedTracks,
    arc,
  };
}

