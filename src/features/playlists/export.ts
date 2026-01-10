/**
 * Playlist Export Functionality
 * 
 * This module provides functionality to export generated playlists in various formats
 * that can be imported into music players and other applications.
 * 
 * Supported Formats:
 * - **M3U**: Standard playlist format (UTF-8 with #EXTM3U header)
 * - **PLS**: Winamp playlist format
 * - **XSPF**: XML Shareable Playlist Format (open standard)
 * - **CSV**: Comma-separated values (for spreadsheet import)
 * - **JSON**: Structured data format (for programmatic use)
 * 
 * Path Strategies:
 * - **relative-to-playlist**: Paths relative to playlist file location
 * - **relative-to-library-root**: Paths relative to library root folder
 * - **absolute**: Full absolute file paths
 * 
 * Features:
 * - Handles missing file paths gracefully
 * - Escapes special characters for each format
 * - Supports discovery tracks (external URLs)
 * - Formats duration as MM:SS
 * - Normalizes file paths for cross-platform compatibility
 * 
 * @module features/playlists/export
 * 
 * @example
 * ```typescript
 * import { exportPlaylist } from '@/features/playlists/export';
 * 
 * const result = await exportPlaylist(playlist, 'm3u', trackLookups, config);
 * // Returns: { content: '#EXTM3U\n...', mimeType: 'audio/x-mpegurl', extension: 'm3u' }
 * ```
 */

import type { GeneratedPlaylist } from "./matching-engine";
import type { TrackRecord, FileIndexRecord } from "@/db/schema";
import { logger } from "@/lib/logger";

export interface TrackLookup {
  track: TrackRecord;
  fileIndex?: FileIndexRecord | undefined;
}

export interface ExportResult {
  content: string;
  mimeType: string;
  extension: string;
  hasRelativePaths: boolean;
}

export type PathStrategy = "relative-to-playlist" | "relative-to-library-root" | "absolute";

export interface PlaylistLocationConfig {
  playlistLocation: "root" | "subfolder";
  pathStrategy: PathStrategy;
  absolutePathPrefix?: string; // Prefix to prepend to relative paths for absolute path generation
}

/**
 * Escape string for M3U/PLS format
 */
export function escapeM3U(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/**
 * Escape string for CSV
 */
function escapeCSV(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Escape XML text
 */
export function escapeXML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format duration as MM:SS
 */
function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds)) {
    return "0:00";
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}


/**
 * Normalize a file path for export
 * - Converts backslashes to forward slashes
 * - Removes double slashes
 * - Removes trailing slashes
 * - Handles empty segments
 * 
 * @param path Raw path string
 * @returns Normalized path
 */
function normalizePath(path: string): string {
  if (!path) return path;
  
  // Convert backslashes to forward slashes
  let normalized = path.replace(/\\/g, "/");
  
  // Remove double slashes (but preserve leading // for UNC paths if needed)
  normalized = normalized.replace(/([^:])\/\/+/g, "$1/");
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "");
  
  // Remove empty segments (but preserve leading/trailing slashes for absolute paths)
  const segments = normalized.split("/").filter(seg => seg.length > 0);
  
  // Reconstruct path
  if (normalized.startsWith("/")) {
    return "/" + segments.join("/");
  }
  
  return segments.join("/");
}

/**
 * Calculate relative path from playlist location to track location
 * 
 * @param trackPath Path to track (relative to library root)
 * @param playlistLocation Where playlist is located ("root" or "subfolder")
 * @returns Path relative to playlist file
 */
function calculateRelativePath(trackPath: string, playlistLocation: "root" | "subfolder"): string {
  const normalizedTrack = normalizePath(trackPath);
  
  if (playlistLocation === "root") {
    // Playlist is in root, track path is already relative to root
    return normalizedTrack;
  } else {
    // Playlist is in subfolder (e.g., "playlists/"), need to go up one level
    return `../${normalizedTrack}`;
  }
}

/**
 * Get file path for track based on export strategy
 * 
 * @param trackLookup Track lookup with file index
 * @param config Playlist location and path strategy configuration
 * @returns Path string and whether it's a valid relative path
 */
export function getTrackPath(
  trackLookup: TrackLookup,
  config?: PlaylistLocationConfig
): {
  path: string;
  hasRelativePath: boolean;
} {
  const strategy = config?.pathStrategy || "absolute";
  const playlistLocation = config?.playlistLocation || "root";
  const absolutePathPrefix = config?.absolutePathPrefix || "";

  // Prefer relativePath from fileIndex
  if (trackLookup.fileIndex?.relativePath) {
    const relativePath = trackLookup.fileIndex.relativePath;
    
    switch (strategy) {
      case "relative-to-playlist":
        // Path relative to where playlist file is located
        const relativeToPlaylist = calculateRelativePath(relativePath, playlistLocation);
        return {
          path: normalizePath(relativeToPlaylist),
          hasRelativePath: true,
        };
        
      case "relative-to-library-root":
        // Path relative to library root (as stored)
        return {
          path: normalizePath(relativePath),
          hasRelativePath: true,
        };
        
      case "absolute":
        // Absolute path: prepend prefix to relative path
        const normalizedRelative = normalizePath(relativePath);
        const normalizedPrefix = normalizePath(absolutePathPrefix);
        
        // Ensure prefix ends with / if it's not empty
        const prefix = normalizedPrefix && !normalizedPrefix.endsWith("/") 
          ? normalizedPrefix + "/" 
          : normalizedPrefix;
        
        // Ensure path doesn't start with / if prefix is provided (to avoid double slashes)
        const pathWithoutLeadingSlash = normalizedRelative.startsWith("/") 
          ? normalizedRelative.substring(1) 
          : normalizedRelative;
        
        const absolutePath = prefix + pathWithoutLeadingSlash;
        return {
          path: normalizePath(absolutePath),
          hasRelativePath: true,
        };
        
      default:
        // Default to absolute
        const defaultNormalized = normalizePath(relativePath);
        const defaultPrefix = normalizePath(absolutePathPrefix);
        const defaultPrefixWithSlash = defaultPrefix && !defaultPrefix.endsWith("/") 
          ? defaultPrefix + "/" 
          : defaultPrefix;
        const defaultPathWithoutSlash = defaultNormalized.startsWith("/") 
          ? defaultNormalized.substring(1) 
          : defaultNormalized;
        return {
          path: normalizePath(defaultPrefixWithSlash + defaultPathWithoutSlash),
          hasRelativePath: true,
        };
    }
  }

  // Fallback to filename (no relative path available)
  const filename = trackLookup.fileIndex?.name || trackLookup.track.trackFileId;
  return {
    path: normalizePath(filename),
    hasRelativePath: false,
  };
}

/**
 * Export playlist as M3U format
 */
export function exportM3U(
  playlist: GeneratedPlaylist,
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig
): ExportResult {
  let hasRelativePaths = true;
  const lines: string[] = [];

  // M3U header
  lines.push("#EXTM3U");
  lines.push(`#EXTINF:-1,${escapeM3U(playlist.title)}`);
  // Note: #PLAYLIST: tag removed - not part of M3U standard and causes issues with Jellyfin

  // Add tracks
  for (const trackFileId of playlist.trackFileIds) {
    const lookup = trackLookups.find((t) => t.track.trackFileId === trackFileId);
    if (!lookup) continue;

    const track = lookup.track;
    const { path, hasRelativePath } = getTrackPath(lookup, config);
    if (!hasRelativePath) {
      hasRelativePaths = false;
    }

    const duration = track.tech?.durationSeconds || -1;
    const title = track.tags.title || "Unknown Title";
    const artist = track.tags.artist || "Unknown Artist";

    // M3U entry: #EXTINF:duration,artist - title
    lines.push(`#EXTINF:${duration},${escapeM3U(`${artist} - ${title}`)}`);
    lines.push(path);
  }

  return {
    content: lines.join("\n") + "\n",
    mimeType: "audio/x-mpegurl",
    extension: "m3u",
    hasRelativePaths,
  };
}

/**
 * Export playlist as PLS format
 */
export function exportPLS(
  playlist: GeneratedPlaylist,
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig
): ExportResult {
  let hasRelativePaths = true;
  const lines: string[] = [];

  // PLS header
  lines.push("[playlist]");
  lines.push(`NumberOfEntries=${playlist.trackFileIds.length}`);
  lines.push(`Version=2`);

  // Add tracks
  playlist.trackFileIds.forEach((trackFileId, index) => {
    const lookup = trackLookups.find((t) => t.track.trackFileId === trackFileId);
    if (!lookup) return;

    const track = lookup.track;
    const { path, hasRelativePath } = getTrackPath(lookup, config);
    if (!hasRelativePath) {
      hasRelativePaths = false;
    }

    const duration = track.tech?.durationSeconds || -1;
    const title = track.tags.title || "Unknown Title";
    const artist = track.tags.artist || "Unknown Artist";

    const trackNum = index + 1;
    lines.push(`File${trackNum}=${path}`);
    lines.push(`Title${trackNum}=${escapeM3U(`${artist} - ${title}`)}`);
    lines.push(`Length${trackNum}=${duration}`);
  });

  return {
    content: lines.join("\n") + "\n",
    mimeType: "audio/x-scpls",
    extension: "pls",
    hasRelativePaths,
  };
}

/**
 * Export playlist as XSPF format
 */
export function exportXSPF(
  playlist: GeneratedPlaylist,
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig
): ExportResult {
  let hasRelativePaths = true;
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<playlist version="1" xmlns="http://xspf.org/ns/0/">');
  lines.push("  <title>" + escapeXML(playlist.title) + "</title>");
  lines.push("  <annotation>" + escapeXML(playlist.description) + "</annotation>");
  lines.push("  <trackList>");

  // Add tracks
  playlist.trackFileIds.forEach((trackFileId) => {
    const lookup = trackLookups.find((t) => t.track.trackFileId === trackFileId);
    if (!lookup) return;

    const track = lookup.track;
    const { path, hasRelativePath } = getTrackPath(lookup, config);
    if (!hasRelativePath) {
      hasRelativePaths = false;
    }

    const title = track.tags.title || "Unknown Title";
    const artist = track.tags.artist || "Unknown Artist";
    const album = track.tags.album || "Unknown Album";
    const duration = track.tech?.durationSeconds
      ? Math.round(track.tech.durationSeconds * 1000)
      : undefined;
    const genres = track.enhancedMetadata?.genres || track.tags.genres || [];
    const tempo = track.enhancedMetadata?.tempo || track.tech?.bpm;

    lines.push("    <track>");
    lines.push("      <location>" + escapeXML(path) + "</location>");
    lines.push("      <title>" + escapeXML(title) + "</title>");
    lines.push("      <creator>" + escapeXML(artist) + "</creator>");
    lines.push("      <album>" + escapeXML(album) + "</album>");
    if (duration) {
      lines.push(`      <duration>${duration}</duration>`);
    }
    if (track.tags.year) {
      lines.push(`      <date>${track.tags.year}</date>`);
    }
    if (genres.length > 0) {
      genres.forEach(genre => {
        lines.push(`      <meta rel="genre">${escapeXML(genre)}</meta>`);
      });
    }
    if (tempo) {
      lines.push(`      <meta rel="bpm">${tempo}</meta>`);
    }
    lines.push("    </track>");
  });

  lines.push("  </trackList>");
  lines.push("</playlist>");

  return {
    content: lines.join("\n") + "\n",
    mimeType: "application/xspf+xml",
    extension: "xspf",
    hasRelativePaths,
  };
}

/**
 * Export playlist as CSV format
 */
export function exportCSV(
  playlist: GeneratedPlaylist,
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig
): ExportResult {
  const lines: string[] = [];

  // CSV header
  lines.push("Position,Title,Artist,Album,Genre,Duration,Path");

  // Add tracks
  playlist.trackFileIds.forEach((trackFileId, index) => {
    const lookup = trackLookups.find((t) => t.track.trackFileId === trackFileId);
    if (!lookup) return;

    const track = lookup.track;
    const { path } = getTrackPath(lookup, config);

    const position = index + 1;
    const title = track.tags.title || "Unknown Title";
    const artist = track.tags.artist || "Unknown Artist";
    const album = track.tags.album || "Unknown Album";
    const genres = track.tags.genres.join("; ") || "";
    const duration = formatDuration(track.tech?.durationSeconds);

    lines.push(
      [
        position,
        escapeCSV(title),
        escapeCSV(artist),
        escapeCSV(album),
        escapeCSV(genres),
        duration,
        escapeCSV(path),
      ].join(",")
    );
  });

  return {
    content: lines.join("\n") + "\n",
    mimeType: "text/csv",
    extension: "csv",
    hasRelativePaths: true, // CSV always works
  };
}

/**
 * Export playlist as JSON format
 */
export function exportJSON(
  playlist: GeneratedPlaylist,
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig
): ExportResult {
  const tracks = playlist.trackFileIds.map((trackFileId, index) => {
    const lookup = trackLookups.find((t) => t.track.trackFileId === trackFileId);
    if (!lookup) return null;

    const track = lookup.track;
    const { path, hasRelativePath } = getTrackPath(lookup, config);

    return {
      position: index + 1,
      trackFileId: track.trackFileId,
      title: track.tags.title || "Unknown Title",
      artist: track.tags.artist || "Unknown Artist",
      album: track.tags.album || "Unknown Album",
      genres: track.tags.genres,
      year: track.tags.year,
      duration: track.tech?.durationSeconds,
      durationFormatted: formatDuration(track.tech?.durationSeconds),
      path,
      hasRelativePath,
    };
  }).filter((t): t is NonNullable<typeof t> => t !== null);

  const exportData = {
    playlist: {
      id: playlist.id,
      title: playlist.title,
      description: playlist.description,
      totalDuration: playlist.totalDuration,
      totalDurationFormatted: formatDuration(playlist.totalDuration),
      trackCount: playlist.trackFileIds.length,
      createdAt: playlist.createdAt,
    },
    summary: {
      genreMix:
        playlist.summary.genreMix instanceof Map
          ? Object.fromEntries(playlist.summary.genreMix)
          : playlist.summary.genreMix,
      tempoMix:
        playlist.summary.tempoMix instanceof Map
          ? Object.fromEntries(playlist.summary.tempoMix)
          : playlist.summary.tempoMix,
      artistMix:
        playlist.summary.artistMix instanceof Map
          ? Object.fromEntries(playlist.summary.artistMix)
          : playlist.summary.artistMix,
    },
    tracks,
    strategy: playlist.strategy,
  };

  return {
    content: JSON.stringify(exportData, null, 2) + "\n",
    mimeType: "application/json",
    extension: "json",
    hasRelativePaths: true, // JSON always works
  };
}

/**
 * Download file using Blob API
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  
  // Handle cleanup after download starts
  const cleanup = () => {
    // Delay revocation to ensure download has started
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  };
  
  // Clean up on both success and error
  link.addEventListener('load', cleanup);
  link.addEventListener('error', (e) => {
    logger.warn('Download link error:', e);
    cleanup();
  });
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Fallback cleanup if events don't fire
  cleanup();
}

