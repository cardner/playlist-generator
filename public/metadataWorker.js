/**
 * Metadata extraction worker
 * 
 * Parses audio file metadata in a background thread
 */

import { parseBlob } from 'https://cdn.jsdelivr.net/npm/music-metadata@11.10.3/lib/index.js';

// Handle messages from main thread
self.onmessage = async (event) => {
  const { trackFileId, file } = event.data;

  try {
    // Parse metadata using music-metadata
    const metadata = await parseBlob(file);

    // Normalize tags
    const normalizeTitle = (title, filename) => {
      if (title && title.trim()) {
        return title.trim();
      }
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
      return nameWithoutExt.trim() || filename;
    };

    const normalizeArtist = (artist) => {
      if (!artist || !artist.trim()) {
        return "Unknown Artist";
      }
      return artist.trim();
    };

    const normalizeAlbum = (album) => {
      if (!album || !album.trim()) {
        return "Unknown Album";
      }
      return album.trim();
    };

    const normalizeGenres = (genres) => {
      if (!genres) return [];
      const genreArray = Array.isArray(genres) ? genres : [genres];
      const normalized = genreArray
        .map((g) => (typeof g === "string" ? g.trim() : String(g).trim()))
        .filter((g) => g.length > 0);
      const seen = new Set();
      const unique = [];
      for (const genre of normalized) {
        const lower = genre.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          unique.push(genre);
        }
      }
      return unique;
    };

    const normalizeYear = (year) => {
      if (year === undefined || year === null) return undefined;
      if (typeof year === "number") {
        if (year >= 1900 && year <= 2100) {
          return Math.floor(year);
        }
        return undefined;
      }
      if (typeof year === "string") {
        const parsed = parseInt(year, 10);
        if (!isNaN(parsed) && parsed >= 1900 && parsed <= 2100) {
          return parsed;
        }
      }
      return undefined;
    };

    const normalizeTrackNo = (trackNo) => {
      if (trackNo === undefined || trackNo === null) return undefined;
      if (typeof trackNo === "number") {
        return trackNo > 0 ? Math.floor(trackNo) : undefined;
      }
      if (typeof trackNo === "object" && "no" in trackNo) {
        return trackNo.no > 0 ? Math.floor(trackNo.no) : undefined;
      }
      return undefined;
    };

    const normalizeDiscNo = (discNo) => {
      if (discNo === undefined || discNo === null) return undefined;
      if (typeof discNo === "number") {
        return discNo > 0 ? Math.floor(discNo) : undefined;
      }
      if (typeof discNo === "object" && "no" in discNo) {
        return discNo.no > 0 ? Math.floor(discNo.no) : undefined;
      }
      return undefined;
    };

    const tags = {
      title: normalizeTitle(metadata.common.title, file.name),
      artist: normalizeArtist(metadata.common.artist),
      album: normalizeAlbum(metadata.common.album),
      genres: normalizeGenres(metadata.common.genre),
      year: normalizeYear(metadata.common.year),
      trackNo: normalizeTrackNo(metadata.common.track),
      discNo: normalizeDiscNo(metadata.common.disk),
    };

    // Extract tech info
    const tech = {
      durationSeconds: metadata.format.duration
        ? Math.round(metadata.format.duration)
        : undefined,
      bitrate: metadata.format.bitrate,
      sampleRate: metadata.format.sampleRate,
      channels: metadata.format.numberOfChannels,
      codec: metadata.format.codec ? String(metadata.format.codec).toLowerCase() : undefined,
      container: metadata.format.container ? String(metadata.format.container).toLowerCase() : undefined,
    };

    // Collect warnings
    const warnings = [];
    if (!metadata.common.title) {
      warnings.push("No title tag found, using filename");
    }
    if (!metadata.common.artist) {
      warnings.push("No artist tag found, using 'Unknown Artist'");
    }
    if (!metadata.common.album) {
      warnings.push("No album tag found, using 'Unknown Album'");
    }
    if (!metadata.format.duration) {
      warnings.push("Duration not available");
    }

    self.postMessage({
      trackFileId,
      tags,
      tech,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error parsing metadata";
    self.postMessage({
      trackFileId,
      error: errorMessage,
    });
  }
};

