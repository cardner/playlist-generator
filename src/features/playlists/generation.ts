/**
 * Playlist generation engine
 * 
 * Wrapper that uses the deterministic matching engine
 */

import type { PlaylistRequest } from "@/types/playlist";
import type { PlaylistStrategy } from "./strategy";
import type { GeneratedPlaylist } from "./matching-engine";
import { getAllTracks } from "@/db/storage";
import { db } from "@/db/schema";
import type { TrackRecord } from "@/db/schema";

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

  // Build matching index
  const { buildMatchingIndex } = await import("@/features/library/summarization");
  const matchingIndex = await buildMatchingIndex(libraryRootId);

  // Use deterministic matching engine
  const { generatePlaylist: generatePlaylistDeterministic } = await import("./matching-engine");
  return generatePlaylistDeterministic(
    libraryRootId,
    request,
    strategy,
    matchingIndex,
    allTracks,
    seed
  );
}
