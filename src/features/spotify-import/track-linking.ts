/**
 * Spotify Track Linking
 * 
 * Links matched Spotify tracks to local TrackRecord instances.
 * Stores bidirectional references between Spotify and local tracks.
 * 
 * @module features/spotify-import/track-linking
 */

import { db } from "@/db/schema";
import type { TrackRecord } from "@/db/schema";
import type { MatchResult } from "./matching";
import { logger } from "@/lib/logger";

/**
 * Link a Spotify track to a local track
 * 
 * Updates both tracks to reference each other:
 * - Spotify track gets linkedLocalTrackId
 * - Local track gets spotifyMetadata
 * 
 * @param spotifyTrack - Spotify track record
 * @param localTrack - Local track record to link to
 */
export async function linkSpotifyToLocal(
  spotifyTrack: TrackRecord,
  localTrack: TrackRecord
): Promise<void> {
  if (spotifyTrack.source !== "spotify") {
    throw new Error("Can only link Spotify tracks to local tracks");
  }

  if (localTrack.source === "spotify") {
    throw new Error("Cannot link Spotify track to another Spotify track");
  }

  try {
    // Update Spotify track with link to local track
    await db.tracks.update(spotifyTrack.id, {
      linkedLocalTrackId: localTrack.id,
      updatedAt: Date.now(),
    });

    // Update local track with Spotify metadata
    await db.tracks.update(localTrack.id, {
      spotifyUri: spotifyTrack.spotifyUri,
      updatedAt: Date.now(),
    });

    logger.info(
      `Linked Spotify track ${spotifyTrack.id} to local track ${localTrack.id}`
    );
  } catch (error) {
    logger.error("Failed to link Spotify track to local track:", error);
    throw error;
  }
}

/**
 * Unlink a Spotify track from its local track
 * 
 * Removes the bidirectional references.
 * 
 * @param spotifyTrack - Spotify track record
 */
export async function unlinkSpotifyTrack(spotifyTrack: TrackRecord): Promise<void> {
  if (spotifyTrack.source !== "spotify" || !spotifyTrack.linkedLocalTrackId) {
    return; // Nothing to unlink
  }

  try {
    const localTrackId = spotifyTrack.linkedLocalTrackId;

    // Remove link from Spotify track
    await db.tracks.update(spotifyTrack.id, {
      linkedLocalTrackId: undefined,
      updatedAt: Date.now(),
    });

    // Try to remove Spotify metadata from local track (if it exists)
    try {
      const localTrack = await db.tracks.get(localTrackId);
      if (localTrack && localTrack.spotifyUri === spotifyTrack.spotifyUri) {
        await db.tracks.update(localTrackId, {
          spotifyUri: undefined,
          updatedAt: Date.now(),
        });
      }
    } catch (err) {
      // Local track might not exist, ignore
      logger.debug(`Local track ${localTrackId} not found for unlinking`);
    }

    logger.info(`Unlinked Spotify track ${spotifyTrack.id} from local track`);
  } catch (error) {
    logger.error("Failed to unlink Spotify track:", error);
    throw error;
  }
}

/**
 * Apply match results by linking tracks
 * 
 * Links all matched tracks from match results.
 * 
 * @param matches - Array of match results with matchType "exact" or "fuzzy"
 * @param spotifyTracks - Map of Spotify track file IDs to TrackRecord
 */
export async function applyMatches(
  matches: MatchResult[],
  spotifyTracks: Map<string, TrackRecord>
): Promise<{
  linked: number;
  failed: number;
}> {
  let linked = 0;
  let failed = 0;

  for (const match of matches) {
    if (match.matchType === "none" || !match.localTrack) {
      continue;
    }

    // Find Spotify track record by matching artist and title
    let spotifyTrackRecord: TrackRecord | undefined;
    for (const [trackFileId, track] of spotifyTracks.entries()) {
      if (
        track.tags.artist.toLowerCase() === match.spotifyTrack.artist.toLowerCase() &&
        track.tags.title.toLowerCase() === match.spotifyTrack.track.toLowerCase()
      ) {
        spotifyTrackRecord = track;
        break;
      }
    }

    if (!spotifyTrackRecord) {
      logger.warn(`Spotify track record not found for match`);
      failed++;
      continue;
    }

    try {
      await linkSpotifyToLocal(spotifyTrackRecord, match.localTrack);
      linked++;
    } catch (error) {
      logger.error(`Failed to link track ${match.spotifyTrack.artist} - ${match.spotifyTrack.track}:`, error);
      failed++;
    }
  }

  return { linked, failed };
}

/**
 * Get linked local track for a Spotify track
 * 
 * @param spotifyTrack - Spotify track record
 * @returns Linked local track or null
 */
export async function getLinkedLocalTrack(
  spotifyTrack: TrackRecord
): Promise<TrackRecord | null> {
  if (!spotifyTrack.linkedLocalTrackId) {
    return null;
  }

  const localTrack = await db.tracks.get(spotifyTrack.linkedLocalTrackId);
  return localTrack && localTrack.source !== "spotify" ? localTrack : null;
}

