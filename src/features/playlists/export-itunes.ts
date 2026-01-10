/**
 * iTunes XML Export
 * 
 * Exports playlists in iTunes Library XML format for direct import into
 * iTunes and Apple Music.
 * 
 * Format: iTunes Library XML (.xml)
 * 
 * @module features/playlists/export-itunes
 */

import type { GeneratedPlaylist } from "./matching-engine";
import type { TrackLookup, PlaylistLocationConfig } from "./export";
import { getTrackPath } from "./export";
import { escapeXML } from "./export";
import { normalizePathForService } from "@/lib/path-normalization";

/**
 * Export playlist as iTunes XML format
 * 
 * Generates an iTunes Library XML file that can be imported directly
 * into iTunes or Apple Music. Includes track metadata and playlist structure.
 * 
 * @param playlist - Generated playlist to export
 * @param trackLookups - Track lookup data with file paths
 * @param config - Playlist location configuration
 * @param libraryPath - Optional iTunes library path for path conversion
 * @returns Export result with XML content
 * 
 * @example
 * ```typescript
 * const result = exportITunesXML(playlist, trackLookups, config, '/Users/me/Music/iTunes');
 * ```
 */
export function exportITunesXML(
  playlist: GeneratedPlaylist,
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig,
  libraryPath?: string
): {
  content: string;
  mimeType: string;
  extension: string;
  hasRelativePaths: boolean;
} {
  let hasRelativePaths = true;
  const lines: string[] = [];

  // iTunes XML header
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">');
  lines.push('<plist version="1.0">');
  lines.push('<dict>');
  lines.push('  <key>Major Version</key><integer>1</integer>');
  lines.push('  <key>Minor Version</key><integer>1</integer>');
  lines.push('  <key>Date</key><date>' + new Date().toISOString() + '</date>');
  lines.push('  <key>Application Version</key><string>AI Playlist Generator</string>');
  lines.push('  <key>Features</key><integer>5</integer>');
  lines.push('  <key>Show Content Ratings</key><true/>');
  lines.push('  <key>Music Folder</key><string>file://' + (libraryPath || '') + '/</string>');
  lines.push('  <key>Library Persistent ID</key><string>' + generatePersistentId() + '</string>');
  lines.push('  <key>Tracks</key>');
  lines.push('  <dict>');

  // Generate track entries with iTunes-style IDs
  const trackEntries: Array<{ id: number; lookup: TrackLookup }> = [];
  playlist.trackFileIds.forEach((trackFileId, index) => {
    const lookup = trackLookups.find((t) => t.track.trackFileId === trackFileId);
    if (!lookup) return;

    const trackId = index + 1; // iTunes uses sequential IDs starting from 1
    trackEntries.push({ id: trackId, lookup });
  });

  // Add track entries
  trackEntries.forEach(({ id, lookup }) => {
    const track = lookup.track;
    const { path, hasRelativePath } = getTrackPath(lookup, config);
    if (!hasRelativePath) {
      hasRelativePaths = false;
    }

    // Normalize path for iTunes (forward slashes)
    let normalizedPath = normalizePathForService(path, 'itunes');
    
    // If libraryPath is provided, ensure path is absolute
    if (libraryPath) {
      const libraryRootNormalized = normalizePathForService(libraryPath, 'itunes');
      
      // If path is relative, make it absolute using library root
      if (!normalizedPath.startsWith('/') && !normalizedPath.match(/^[A-Za-z]:/)) {
        const root = libraryRootNormalized.endsWith('/') 
          ? libraryRootNormalized.slice(0, -1) 
          : libraryRootNormalized;
        normalizedPath = `${root}/${normalizedPath}`;
      }
    }
    
    // Ensure path starts with / for file:// URL (Mac) or drive letter (Windows)
    // iTunes expects file:// URLs with absolute paths
    let fileUrl: string;
    if (normalizedPath.match(/^[A-Za-z]:/)) {
      // Windows path: file:///C:/Music/Track.mp3
      fileUrl = 'file:///' + normalizedPath;
    } else if (normalizedPath.startsWith('/')) {
      // Unix/Mac path: file:///Users/me/Music/Track.mp3
      fileUrl = 'file://' + normalizedPath;
    } else {
      // Relative path: make it absolute with library root or use as-is
      if (libraryPath) {
        const libraryRootNormalized = normalizePathForService(libraryPath, 'itunes');
        const root = libraryRootNormalized.endsWith('/') 
          ? libraryRootNormalized.slice(0, -1) 
          : libraryRootNormalized;
        fileUrl = 'file://' + root + '/' + normalizedPath;
      } else {
        // Fallback: assume it's relative to current directory
        fileUrl = 'file:///' + normalizedPath;
      }
    }

    const title = track.tags.title || "Unknown Title";
    const artist = track.tags.artist || "Unknown Artist";
    const album = track.tags.album || "Unknown Album";
    const duration = track.tech?.durationSeconds || 0;
    const year = track.tags.year;
    const trackNumber = track.tags.trackNo;
    const genres = track.enhancedMetadata?.genres || track.tags.genres || [];
    const tempo = track.enhancedMetadata?.tempo || track.tech?.bpm;

    lines.push(`    <key>${id}</key>`);
    lines.push('    <dict>');
    lines.push('      <key>Track ID</key><integer>' + id + '</integer>');
    lines.push('      <key>Name</key><string>' + escapeXML(title) + '</string>');
    lines.push('      <key>Artist</key><string>' + escapeXML(artist) + '</string>');
    lines.push('      <key>Album</key><string>' + escapeXML(album) + '</string>');
    lines.push('      <key>Total Time</key><integer>' + (duration * 1000) + '</integer>');
    lines.push('      <key>Location</key><string>' + escapeXML(fileUrl) + '</string>');
    if (year) {
      lines.push('      <key>Year</key><integer>' + year + '</integer>');
    }
    if (trackNumber) {
      lines.push('      <key>Track Number</key><integer>' + trackNumber + '</integer>');
    }
    if (genres.length > 0) {
      lines.push('      <key>Genre</key><string>' + escapeXML(genres[0]) + '</string>');
    }
    if (tempo) {
      // iTunes BPM field only accepts integers, so convert string tempo categories to approximate BPM
      if (typeof tempo === "number") {
        lines.push('      <key>BPM</key><integer>' + tempo + '</integer>');
      } else if (typeof tempo === "string") {
        // Convert tempo category to approximate BPM range midpoint
        const categoryBpm: Record<string, number> = {
          slow: 80,
          medium: 120,
          fast: 160,
        };
        const bpm = categoryBpm[tempo.toLowerCase()];
        if (bpm) {
          lines.push('      <key>BPM</key><integer>' + bpm + '</integer>');
        }
      }
    }
    lines.push('      <key>Persistent ID</key><string>' + generatePersistentId() + '</string>');
    lines.push('    </dict>');
  });

  lines.push('  </dict>');
  lines.push('  <key>Playlists</key>');
  lines.push('  <array>');
  lines.push('    <dict>');
  lines.push('      <key>Name</key><string>' + escapeXML(playlist.title) + '</string>');
  lines.push('      <key>Description</key><string>' + escapeXML(playlist.description) + '</string>');
  lines.push('      <key>Playlist Items</key>');
  lines.push('      <array>');

  // Add playlist items
  trackEntries.forEach(({ id }) => {
    lines.push('        <dict>');
    lines.push('          <key>Track ID</key><integer>' + id + '</integer>');
    lines.push('        </dict>');
  });

  lines.push('      </array>');
  lines.push('      <key>Playlist Persistent ID</key><string>' + generatePersistentId() + '</string>');
  lines.push('    </dict>');
  lines.push('  </array>');
  lines.push('</dict>');
  lines.push('</plist>');

  return {
    content: lines.join("\n") + "\n",
    mimeType: "application/xml",
    extension: "xml",
    hasRelativePaths,
  };
}

/**
 * Generate a persistent ID for iTunes (16-character hex string)
 * 
 * @returns Persistent ID string
 */
function generatePersistentId(): string {
  // Generate a random 16-character hex string (8 bytes)
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

