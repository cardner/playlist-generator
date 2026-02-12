/**
 * Playlist Export and Import Storage Operations
 *
 * Handles exporting saved playlists to JSON files and importing them back,
 * similar to collection database export/import.
 *
 * Includes track metadata (title, artist, album) for fuzzy matching on import
 * when playlists are brought into a different browser or collection.
 *
 * @module db/storage-playlist-import
 */

import { db, getCompositeId } from "./schema";
import type { SavedPlaylistRecord } from "./schema";
import { logger } from "@/lib/logger";
import { fuzzyMatchTrack } from "@/features/playlists/track-fuzzy-match";

/** Track metadata for fuzzy matching on import */
export interface PlaylistExportTrackMetadata {
  trackFileId: string;
  title?: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
}

/** Playlist with optional track metadata for import matching */
export interface PlaylistExportItem extends SavedPlaylistRecord {
  /** Track metadata for fuzzy matching (when exporting from same app) */
  trackMetadata?: PlaylistExportTrackMetadata[];
}

/**
 * Playlist export format
 */
export interface PlaylistExport {
  /** Export format version */
  version: string;
  /** Timestamp when export was created (Unix epoch milliseconds) */
  exportedAt: number;
  /** Saved playlists */
  playlists: PlaylistExportItem[];
}

const EXPORT_VERSION = "1.0.0";

/**
 * Export saved playlists to JSON format
 *
 * Includes track metadata (title, artist, album, duration) for each track
 * so imported playlists can be fuzzy-matched to a different collection.
 *
 * @param playlistIds - Optional array of playlist IDs to export. If omitted, exports all.
 * @returns Promise resolving to export data
 */
export async function exportPlaylists(
  playlistIds?: string[]
): Promise<PlaylistExport> {
  let records: SavedPlaylistRecord[];

  if (playlistIds && playlistIds.length > 0) {
    records = await db.savedPlaylists
      .where("id")
      .anyOf(playlistIds)
      .toArray();
  } else {
    records = await db.savedPlaylists.orderBy("updatedAt").reverse().toArray();
  }

  const playlists: PlaylistExportItem[] = await Promise.all(
    records.map(async (record) => {
      const genreMix =
        record.summary.genreMix instanceof Map
          ? Object.fromEntries(record.summary.genreMix)
          : record.summary.genreMix;
      const tempoMix =
        record.summary.tempoMix instanceof Map
          ? Object.fromEntries(record.summary.tempoMix)
          : record.summary.tempoMix;
      const artistMix =
        record.summary.artistMix instanceof Map
          ? Object.fromEntries(record.summary.artistMix)
          : record.summary.artistMix;

      let trackMetadata: PlaylistExportTrackMetadata[] | undefined;
      if (record.libraryRootId && record.trackFileIds.length > 0) {
        const compositeIds = record.trackFileIds.map((id) =>
          getCompositeId(id, record.libraryRootId!)
        );
        const tracks = await db.tracks.bulkGet(compositeIds);
        trackMetadata = record.trackFileIds.map((trackFileId, i) => {
          const t = tracks[i];
          return {
            trackFileId,
            title: t?.tags?.title,
            artist: t?.tags?.artist,
            album: t?.tags?.album,
            durationSeconds: t?.tech?.durationSeconds,
          };
        });
      }

      return {
        ...record,
        summary: {
          ...record.summary,
          genreMix,
          tempoMix,
          artistMix,
        },
        trackMetadata,
      };
    })
  );

  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    playlists,
  };
}

/**
 * Validate playlist export format
 */
export function validatePlaylistExportFormat(
  data: unknown
): data is PlaylistExport {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  if (
    typeof obj.version !== "string" ||
    typeof obj.exportedAt !== "number" ||
    !Array.isArray(obj.playlists)
  ) {
    return false;
  }

  for (const playlist of obj.playlists) {
    if (
      !playlist ||
      typeof playlist !== "object" ||
      typeof (playlist as SavedPlaylistRecord).id !== "string" ||
      typeof (playlist as SavedPlaylistRecord).title !== "string" ||
      typeof (playlist as SavedPlaylistRecord).description !== "string" ||
      !Array.isArray((playlist as SavedPlaylistRecord).trackFileIds) ||
      !(playlist as SavedPlaylistRecord).summary
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Import playlists from export data
 *
 * Tracks are fuzzy-matched to the target collection using title, artist, album,
 * and duration when trackMetadata is present in the export. This allows
 * playlists imported from another browser or collection to display correctly.
 *
 * @param exportData - Playlist export data
 * @param targetCollectionId - Collection ID to assign imported playlists to
 * @returns Promise resolving to number of playlists imported
 */
export async function importPlaylists(
  exportData: PlaylistExport,
  targetCollectionId: string
): Promise<number> {
  if (!validatePlaylistExportFormat(exportData)) {
    throw new Error("Invalid playlist export format");
  }

  const collection = await db.libraryRoots.get(targetCollectionId);
  if (!collection) {
    throw new Error(`Collection ${targetCollectionId} not found`);
  }

  const targetTracks = await db.tracks
    .where("libraryRootId")
    .equals(targetCollectionId)
    .toArray();

  const newPlaylists: SavedPlaylistRecord[] = await Promise.all(
    exportData.playlists.map(async (playlist) => {
      const newId = `playlist-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const genreMix =
        playlist.summary.genreMix instanceof Map
          ? Object.fromEntries(playlist.summary.genreMix)
          : playlist.summary.genreMix;
      const tempoMix =
        playlist.summary.tempoMix instanceof Map
          ? Object.fromEntries(playlist.summary.tempoMix)
          : playlist.summary.tempoMix;
      const artistMix =
        playlist.summary.artistMix instanceof Map
          ? Object.fromEntries(playlist.summary.artistMix)
          : playlist.summary.artistMix;

      const trackMetadata = playlist.trackMetadata;
      const resolvedTrackFileIds: string[] = [];

      for (let i = 0; i < playlist.trackFileIds.length; i++) {
        const candidateId = playlist.trackFileIds[i];
        const meta = trackMetadata?.[i];

        if (meta?.title && meta?.artist) {
          const matched = fuzzyMatchTrack(
            meta,
            candidateId,
            targetTracks,
            0.6
          );
          if (matched) {
            resolvedTrackFileIds.push(matched);
          }
        } else {
          const exact = targetTracks.find((t) => t.trackFileId === candidateId);
          if (exact) {
            resolvedTrackFileIds.push(exact.trackFileId);
          }
        }
      }

      const matchedCount = resolvedTrackFileIds.length;
      const totalCount = playlist.trackFileIds.length;
      if (matchedCount < totalCount && totalCount > 0) {
        logger.info(
          `Playlist "${playlist.title}": matched ${matchedCount}/${totalCount} tracks to target collection`
        );
      }

      return {
        ...playlist,
        id: newId,
        libraryRootId: targetCollectionId,
        trackFileIds: resolvedTrackFileIds,
        summary: {
          ...playlist.summary,
          genreMix,
          tempoMix,
          artistMix,
          trackCount: resolvedTrackFileIds.length,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    })
  );

  if (newPlaylists.length > 0) {
    await db.savedPlaylists.bulkPut(newPlaylists);
  }

  return newPlaylists.length;
}
