/**
 * Playlist Export and Import Storage Operations
 *
 * Handles exporting saved playlists to JSON files and importing them back,
 * similar to collection database export/import.
 *
 * @module db/storage-playlist-import
 */

import { db } from "./schema";
import type { SavedPlaylistRecord } from "./schema";
import { logger } from "@/lib/logger";

/**
 * Playlist export format
 */
export interface PlaylistExport {
  /** Export format version */
  version: string;
  /** Timestamp when export was created (Unix epoch milliseconds) */
  exportedAt: number;
  /** Saved playlists */
  playlists: SavedPlaylistRecord[];
}

const EXPORT_VERSION = "1.0.0";

/**
 * Export saved playlists to JSON format
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

  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    playlists: records.map((record) => {
      // Ensure Maps are serialized as plain objects
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

      return {
        ...record,
        summary: {
          ...record.summary,
          genreMix,
          tempoMix,
          artistMix,
        },
      };
    }),
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

  const newPlaylists: SavedPlaylistRecord[] = exportData.playlists.map(
    (playlist) => {
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

      return {
        ...playlist,
        id: newId,
        libraryRootId: targetCollectionId,
        summary: {
          ...playlist.summary,
          genreMix,
          tempoMix,
          artistMix,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
  );

  if (newPlaylists.length > 0) {
    await db.savedPlaylists.bulkPut(newPlaylists);
  }

  return newPlaylists.length;
}
