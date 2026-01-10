/**
 * Media Server Export Formats
 * 
 * Exports playlists optimized for Jellyfin and Plex media servers.
 * Handles service-specific path requirements and directory structures.
 * 
 * Formats:
 * - Jellyfin M3U: Optimized for Jellyfin media server
 * - Plex M3U: Optimized for Plex media server
 * 
 * @module features/playlists/export-media-servers
 */

import type { GeneratedPlaylist } from "./matching-engine";
import type { TrackLookup, PlaylistLocationConfig } from "./export";
import { getTrackPath } from "./export";
import { escapeM3U } from "./export";
import { normalizePathForService, convertToServicePath, type ServiceConfig } from "@/lib/path-normalization";

/**
 * Export playlist as Jellyfin-optimized M3U format
 * 
 * Generates an M3U playlist with paths optimized for Jellyfin media server.
 * Handles both local and network paths, and supports Jellyfin's library structure.
 * 
 * @param playlist - Generated playlist to export
 * @param trackLookups - Track lookup data with file paths
 * @param config - Playlist location configuration
 * @param jellyfinConfig - Jellyfin-specific configuration
 * @returns Export result with M3U content
 * 
 * @example
 * ```typescript
 * const result = exportJellyfinM3U(playlist, trackLookups, config, {
 *   libraryRoot: '/media/music',
 *   useNetworkPaths: false
 * });
 * ```
 */
export function exportJellyfinM3U(
  playlist: GeneratedPlaylist,
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig,
  jellyfinConfig?: ServiceConfig
): {
  content: string;
  mimeType: string;
  extension: string;
  hasRelativePaths: boolean;
} {
  let hasRelativePaths = true;
  const lines: string[] = [];

  // M3U header
  lines.push("#EXTM3U");
  lines.push(`#EXTINF:-1,${escapeM3U(playlist.title)}`);

  // Add tracks
  for (const trackFileId of playlist.trackFileIds) {
    const lookup = trackLookups.find((t) => t.track.trackFileId === trackFileId);
    if (!lookup) continue;

    const track = lookup.track;
    let { path, hasRelativePath } = getTrackPath(lookup, config);
    
    // Convert path for Jellyfin if config provided
    if (jellyfinConfig) {
      const serviceConfig: ServiceConfig = {
        ...jellyfinConfig,
        service: 'jellyfin', // Ensure service is set correctly
      };
      
      // If library root is configured, ensure path is relative to it or absolute
      if (jellyfinConfig.libraryRoot) {
        // Use convertToServicePath to handle path conversion
        path = convertToServicePath(path, serviceConfig);
      } else {
        // Just normalize for Jellyfin format
        path = normalizePathForService(path, 'jellyfin');
      }
    } else {
      path = normalizePathForService(path, 'jellyfin');
    }
    
    // Remove trailing slashes for Jellyfin
    path = path.replace(/\/+$/, '');
    
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
 * Export playlist as Plex-optimized M3U format
 * 
 * Generates an M3U playlist with paths optimized for Plex media server.
 * Handles Plex's media library structure and path requirements.
 * 
 * @param playlist - Generated playlist to export
 * @param trackLookups - Track lookup data with file paths
 * @param config - Playlist location configuration
 * @param plexConfig - Plex-specific configuration
 * @returns Export result with M3U content
 * 
 * @example
 * ```typescript
 * const result = exportPlexM3U(playlist, trackLookups, config, {
 *   libraryRoot: '/media/music',
 *   useNetworkPaths: true
 * });
 * ```
 */
export function exportPlexM3U(
  playlist: GeneratedPlaylist,
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig,
  plexConfig?: ServiceConfig
): {
  content: string;
  mimeType: string;
  extension: string;
  hasRelativePaths: boolean;
} {
  let hasRelativePaths = true;
  const lines: string[] = [];

  // M3U header
  lines.push("#EXTM3U");
  lines.push(`#EXTINF:-1,${escapeM3U(playlist.title)}`);

  // Add tracks
  for (const trackFileId of playlist.trackFileIds) {
    const lookup = trackLookups.find((t) => t.track.trackFileId === trackFileId);
    if (!lookup) continue;

    const track = lookup.track;
    let { path, hasRelativePath } = getTrackPath(lookup, config);
    
    // Convert path for Plex if config provided
    if (plexConfig) {
      const serviceConfig: ServiceConfig = {
        ...plexConfig,
        service: 'plex', // Ensure service is set correctly
      };
      
      // Plex requires absolute paths matching its library configuration
      if (plexConfig.libraryRoot) {
        // Use convertToServicePath to handle path conversion
        path = convertToServicePath(path, serviceConfig);
        
        // If path is still relative, make it absolute using library root
        if (!path.startsWith('/') && !path.match(/^[A-Za-z]:/) && !path.startsWith('\\\\')) {
          const libraryRoot = normalizePathForService(plexConfig.libraryRoot, 'plex');
          const root = libraryRoot.endsWith('/') ? libraryRoot.slice(0, -1) : libraryRoot;
          path = `${root}/${path}`;
        }
      } else {
        // Just normalize for Plex format
        path = normalizePathForService(path, 'plex');
      }
    } else {
      path = normalizePathForService(path, 'plex');
    }
    
    // Remove trailing slashes for Plex
    path = path.replace(/\/+$/, '');
    
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

