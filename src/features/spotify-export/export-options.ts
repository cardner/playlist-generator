/**
 * Spotify Export Options
 * 
 * Multiple export format support for Spotify playlists.
 * 
 * @module features/spotify-export/export-options
 */

import type { ExportResult } from "./playlist-exporter";
import { generateSpotifyJSON, generateSpotifyCSV, generateSpotifyM3U } from "./playlist-exporter";

/**
 * Export format options
 */
export type ExportFormat = "json" | "csv" | "m3u";

/**
 * Export file metadata
 */
export interface ExportFile {
  /** File name */
  name: string;
  /** File content */
  content: string;
  /** MIME type */
  mimeType: string;
  /** File extension */
  extension: string;
}

/**
 * Generate export file for a format
 * 
 * @param exportData - Export result
 * @param format - Export format
 * @param playlistName - Playlist name for filename
 * @returns Export file data
 */
export function generateExportFile(
  exportData: ExportResult,
  format: ExportFormat,
  playlistName: string
): ExportFile {
  const sanitizedName = playlistName
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  switch (format) {
    case "json":
      return {
        name: `${sanitizedName}.json`,
        content: generateSpotifyJSON(exportData),
        mimeType: "application/json",
        extension: "json",
      };

    case "csv":
      return {
        name: `${sanitizedName}.csv`,
        content: generateSpotifyCSV(exportData),
        mimeType: "text/csv",
        extension: "csv",
      };

    case "m3u":
      return {
        name: `${sanitizedName}.m3u`,
        content: generateSpotifyM3U(exportData),
        mimeType: "audio/x-mpegurl",
        extension: "m3u",
      };
  }
}

/**
 * Download export file
 * 
 * Creates a download link and triggers download in browser.
 * 
 * @param file - Export file to download
 */
export function downloadExportFile(file: ExportFile): void {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy export content to clipboard
 * 
 * @param content - Content to copy
 * @returns Promise that resolves when copied
 */
export async function copyToClipboard(content: string): Promise<void> {
  await navigator.clipboard.writeText(content);
}

