/**
 * Spotify Playlist Exporter
 * 
 * Converts GeneratedPlaylist to Spotify-compatible JSON format.
 * Maps playlist tracks to Spotify URIs and generates export files.
 * 
 * @module features/spotify-export/playlist-exporter
 */

import type { GeneratedPlaylist } from "@/features/playlists";
import type { TrackRecord } from "@/db/schema";
import { resolveSpotifyUris } from "./uri-resolver";
import { logger } from "@/lib/logger";

/**
 * Spotify playlist export format
 * 
 * Matches the structure of Spotify export JSON files.
 */
export interface SpotifyPlaylistExport {
  name: string;
  description?: string;
  items: Array<{
    track: {
      name: string;
      uri: string;
      artists: Array<{ name: string }>;
      album?: { name: string };
    };
    addedAt?: string;
  }>;
}

/**
 * Spotify GDPR playlist export format
 * 
 * Matches the structure of Spotify's Playlist*.json files.
 */
export interface SpotifyPlaylistExportFile {
  playlists: Array<{
    name: string;
    lastModifiedDate: string;
    items: Array<{
      track: {
        trackName: string;
        artistName: string;
        albumName: string | null;
        trackUri: string;
      };
      addedDate: string;
    }>;
  }>;
}

/**
 * Export result with statistics
 */
export interface ExportResult {
  /** Exported playlist data */
  playlist: SpotifyPlaylistExport;
  /** Number of tracks with Spotify URIs */
  tracksWithUris: number;
  /** Number of tracks without URIs (skipped) */
  tracksWithoutUris: number;
  /** Total tracks in playlist */
  totalTracks: number;
}

/**
 * Convert GeneratedPlaylist to Spotify export format
 * 
 * @param playlist - Generated playlist to export
 * @param tracks - Map of trackFileId -> TrackRecord
 * @param libraryRootId - Optional library root ID for URI resolution
 * @returns Export result with playlist data and statistics
 */
export async function exportPlaylistToSpotify(
  playlist: GeneratedPlaylist,
  tracks: Map<string, TrackRecord>,
  libraryRootId?: string
): Promise<ExportResult> {
  // Resolve Spotify URIs for all tracks
  const trackRecords = Array.from(tracks.values());
  const uriMap = await resolveSpotifyUris(trackRecords, libraryRootId);

  const items: SpotifyPlaylistExport["items"] = [];
  let tracksWithUris = 0;
  let tracksWithoutUris = 0;

  // Process tracks in playlist order
  for (const trackFileId of playlist.trackFileIds) {
    const track = tracks.get(trackFileId);
    if (!track) {
      logger.warn(`Track ${trackFileId} not found in tracks map`);
      tracksWithoutUris++;
      continue;
    }

    const uri = uriMap.get(trackFileId);

    if (!uri) {
      // Skip tracks without Spotify URIs
      tracksWithoutUris++;
      continue;
    }

    // Extract artist(s) - handle multiple artists if stored as comma-separated
    const artists = track.tags.artist
      .split(/[,&]/)
      .map((a) => a.trim())
      .filter(Boolean)
      .map((name) => ({ name }));

    if (artists.length === 0) {
      artists.push({ name: track.tags.artist || "Unknown Artist" });
    }

    items.push({
      track: {
        name: track.tags.title,
        uri,
        artists,
        album: track.tags.album ? { name: track.tags.album } : undefined,
      },
      // Use current date as addedAt (Spotify exports include this)
      addedAt: new Date().toISOString(),
    });

    tracksWithUris++;
  }

  const exportedPlaylist: SpotifyPlaylistExport = {
    name: playlist.title,
    description: playlist.description || playlist.customEmoji
      ? `${playlist.customEmoji || ""} ${playlist.description || ""}`.trim()
      : undefined,
    items,
  };

  return {
    playlist: exportedPlaylist,
    tracksWithUris,
    tracksWithoutUris,
    totalTracks: playlist.trackFileIds.length,
  };
}

/**
 * Generate JSON string from export data
 * 
 * @param exportData - Export result
 * @returns JSON string
 */
export function generateSpotifyJSON(exportData: ExportResult): string {
  return JSON.stringify(exportData.playlist, null, 2);
}

/**
 * Generate Spotify GDPR playlist JSON (Playlist*.json style)
 * 
 * @param exportData - Export result
 * @returns JSON string
 */
export function generateSpotifyExportJSON(exportData: ExportResult): string {
  const formatDate = (value?: string) => {
    if (!value) {
      return new Date().toISOString().split("T")[0];
    }
    return value.split("T")[0];
  };

  const playlistFile: SpotifyPlaylistExportFile = {
    playlists: [
      {
        name: exportData.playlist.name,
        lastModifiedDate: formatDate(),
        items: exportData.playlist.items.map((item) => ({
          track: {
            trackName: item.track.name,
            artistName: item.track.artists.map((artist) => artist.name).join(", "),
            albumName: item.track.album?.name ?? null,
            trackUri: item.track.uri,
          },
          addedDate: formatDate(item.addedAt),
        })),
      },
    ],
  };

  return JSON.stringify(playlistFile, null, 2);
}

/**
 * Generate CSV from export data
 * 
 * @param exportData - Export result
 * @returns CSV string
 */
export function generateSpotifyCSV(exportData: ExportResult): string {
  const lines: string[] = ["Track,Artist,Album,Spotify URI"];

  for (const item of exportData.playlist.items) {
    const track = item.track;
    const artist = track.artists.map((a) => a.name).join(", ");
    const album = track.album?.name || "";
    const uri = track.uri;

    // Escape commas and quotes in CSV
    const escapeCSV = (str: string) => {
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    lines.push(
      `${escapeCSV(track.name)},${escapeCSV(artist)},${escapeCSV(album)},${uri}`
    );
  }

  return lines.join("\n");
}

/**
 * Generate M3U playlist with Spotify URIs
 * 
 * @param exportData - Export result
 * @returns M3U string
 */
export function generateSpotifyM3U(exportData: ExportResult): string {
  const lines: string[] = ["#EXTM3U"];

  for (const item of exportData.playlist.items) {
    const track = item.track;
    const artist = track.artists.map((a) => a.name).join(", ");
    const duration = "-1"; // Duration not available in Spotify export format

    lines.push(`#EXTINF:${duration},${artist} - ${track.name}`);
    lines.push(track.uri);
  }

  return lines.join("\n");
}

