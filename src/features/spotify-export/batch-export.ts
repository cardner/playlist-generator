/**
 * Batch Export for Spotify Playlists
 * 
 * Export multiple playlists at once, optionally as a ZIP archive.
 * 
 * @module features/spotify-export/batch-export
 */

import type { GeneratedPlaylist } from "@/features/playlists";
import type { TrackRecord } from "@/db/schema";
import type { ExportFormat } from "./export-options";
import { exportPlaylistToSpotify } from "./playlist-exporter";
import { generateExportFile } from "./export-options";
import { logger } from "@/lib/logger";

/**
 * Batch export result
 */
export interface BatchExportResult {
  /** Successfully exported playlists */
  exported: Array<{
    playlistId: string;
    playlistName: string;
    tracksWithUris: number;
    tracksWithoutUris: number;
  }>;
  /** Failed exports */
  failed: Array<{
    playlistId: string;
    playlistName: string;
    error: string;
  }>;
  /** Export files */
  files: Array<{
    name: string;
    content: string;
    mimeType: string;
  }>;
}

/**
 * Export multiple playlists
 * 
 * @param playlists - Array of playlists to export
 * @param tracksMap - Map of playlist ID -> Map of trackFileId -> TrackRecord
 * @param format - Export format
 * @param libraryRootIds - Optional map of playlist ID -> library root ID
 * @returns Batch export result
 */
export async function batchExportPlaylists(
  playlists: GeneratedPlaylist[],
  tracksMap: Map<string, Map<string, TrackRecord>>,
  format: ExportFormat = "json",
  libraryRootIds?: Map<string, string>
): Promise<BatchExportResult> {
  const exported: BatchExportResult["exported"] = [];
  const failed: BatchExportResult["failed"] = [];
  const files: BatchExportResult["files"] = [];

  for (const playlist of playlists) {
    try {
      const tracks = tracksMap.get(playlist.id);
      if (!tracks) {
        failed.push({
          playlistId: playlist.id,
          playlistName: playlist.title,
          error: "Tracks not found",
        });
        continue;
      }

      const libraryRootId = libraryRootIds?.get(playlist.id);
      const exportData = await exportPlaylistToSpotify(playlist, tracks, libraryRootId);

      if (exportData.tracksWithUris === 0) {
        failed.push({
          playlistId: playlist.id,
          playlistName: playlist.title,
          error: "No tracks with Spotify URIs found",
        });
        continue;
      }

      const file = generateExportFile(exportData, format, playlist.title);
      files.push({
        name: file.name,
        content: file.content,
        mimeType: file.mimeType,
      });

      exported.push({
        playlistId: playlist.id,
        playlistName: playlist.title,
        tracksWithUris: exportData.tracksWithUris,
        tracksWithoutUris: exportData.tracksWithoutUris,
      });
    } catch (error) {
      logger.error(`Failed to export playlist ${playlist.id}:`, error);
      failed.push({
        playlistId: playlist.id,
        playlistName: playlist.title,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { exported, failed, files };
}

/**
 * Generate manifest file for batch export
 * 
 * @param result - Batch export result
 * @returns Manifest content as string
 */
export function generateManifest(result: BatchExportResult): string {
  const manifest = {
    exported: result.exported.length,
    failed: result.failed.length,
    playlists: result.exported.map((e) => ({
      name: e.playlistName,
      tracksWithUris: e.tracksWithUris,
      tracksWithoutUris: e.tracksWithoutUris,
    })),
    errors: result.failed.map((f) => ({
      name: f.playlistName,
      error: f.error,
    })),
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(manifest, null, 2);
}

