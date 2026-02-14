/**
 * Track Query and Search Operations
 * 
 * This module provides query and search functionality for tracks,
 * including text search, genre filtering, and metadata extraction.
 * 
 * @module db/storage-queries
 */

import { db } from "./schema";
import type { TrackRecord } from "./schema";
import { createGenreStatsAccumulator, type GenreWithStats } from "@/features/library/genre-normalization";
import {
  createGenreCoOccurrenceAccumulator,
  type GenreCoOccurrenceMap,
} from "@/features/library/genre-similarity";

/**
 * Search tracks by query (searches title, artist, album)
 * 
 * Performs case-insensitive substring matching across title, artist, and album fields.
 * Uses indexed queries where possible, but requires in-memory filtering for text search
 * since IndexedDB doesn't support full-text search natively.
 * 
 * Performance: For large libraries (10k+ tracks), consider adding a result limit.
 * 
 * @param query - Search query string
 * @param libraryRootId - Optional library root ID to limit search scope
 * @param limit - Optional maximum number of results to return (for performance)
 * @returns Array of matching track records
 * 
 * @example
 * ```typescript
 * const results = await searchTracks('beatles', libraryRootId, 100);
 * ```
 */
export async function searchTracks(
  query: string,
  libraryRootId?: string,
  limit?: number
): Promise<TrackRecord[]> {
  if (!query.trim()) {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  let collection = db.tracks.toCollection();

  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const results: TrackRecord[] = [];

  await collection.each((track) => {
    const title = track.tags.title?.toLowerCase() || "";
    const artist = track.tags.artist?.toLowerCase() || "";
    const album = track.tags.album?.toLowerCase() || "";

    if (title.includes(lowerQuery) || artist.includes(lowerQuery) || album.includes(lowerQuery)) {
      results.push(track);
      if (limit && results.length >= limit) {
        return false;
      }
    }
  });

  return results;
}

/**
 * Filter tracks by genre
 * 
 * Performs case-insensitive genre matching. Requires loading all tracks into memory
 * since genre is stored as an array and IndexedDB doesn't support array indexing.
 * 
 * Performance: For large libraries, consider using getAllGenresWithStats first to
 * verify the genre exists before filtering.
 * 
 * @param genre - Genre name to filter by
 * @param libraryRootId - Optional library root ID to limit search scope
 * @param limit - Optional maximum number of results to return (for performance)
 * @returns Array of matching track records
 * 
 * @example
 * ```typescript
 * const rockTracks = await filterTracksByGenre('Rock', libraryRootId, 500);
 * ```
 */
export async function filterTracksByGenre(
  genre: string,
  libraryRootId?: string,
  limit?: number
): Promise<TrackRecord[]> {
  if (!genre.trim()) {
    return [];
  }

  const lowerGenre = genre.toLowerCase();
  let collection = db.tracks.toCollection();

  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const results: TrackRecord[] = [];

  await collection.each((track) => {
    if (track.tags.genres.some((g) => g.toLowerCase() === lowerGenre)) {
      results.push(track);
      if (limit && results.length >= limit) {
        return false;
      }
    }
  });

  return results;
}

/**
 * Get all unique artists from library
 * 
 * Filters out "Unknown Artist" entries and returns sorted list.
 * 
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of unique artist names
 * 
 * @example
 * ```typescript
 * const artists = await getAllArtists(libraryRootId);
 * ```
 */
export async function getAllArtists(libraryRootId?: string): Promise<string[]> {
  let collection = db.tracks;
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId) as any;
  }

  const artistSet = new Set<string>();
  
  await collection.each((track) => {
    const artist = track.tags.artist?.trim();
    if (artist && artist !== "Unknown Artist") {
      artistSet.add(artist);
    }
  });

  return Array.from(artistSet).sort();
}

/**
 * Get all unique albums from library
 * 
 * Filters out "Unknown Album" entries and returns sorted list.
 * 
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of unique album names
 * 
 * @example
 * ```typescript
 * const albums = await getAllAlbums(libraryRootId);
 * ```
 */
export async function getAllAlbums(libraryRootId?: string): Promise<string[]> {
  let collection = db.tracks;
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId) as any;
  }

  const albumSet = new Set<string>();
  
  await collection.each((track) => {
    const album = track.tags.album?.trim();
    if (album && album !== "Unknown Album") {
      albumSet.add(album);
    }
  });

  return Array.from(albumSet).sort();
}

/**
 * Get all unique track titles from library
 * 
 * Filters out "Unknown Title" entries and returns sorted list.
 * 
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of unique track titles
 * 
 * @example
 * ```typescript
 * const titles = await getAllTrackTitles(libraryRootId);
 * ```
 */
export async function getAllTrackTitles(libraryRootId?: string): Promise<string[]> {
  let collection = db.tracks;
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId) as any;
  }

  const titleSet = new Set<string>();
  
  await collection.each((track) => {
    const title = track.tags.title?.trim();
    if (title && title !== "Unknown Title") {
      titleSet.add(title);
    }
  });

  return Array.from(titleSet).sort();
}

/**
 * Search artists by query (case-insensitive prefix matching)
 * 
 * Optimized for large collections by:
 * - Using libraryRootId index for efficient filtering
 * - Early termination when limit is reached
 * - Prefix matching for better performance
 * 
 * @param query - Search query string (minimum 1 character)
 * @param limit - Maximum number of results to return (default: 50)
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of matching artist names
 * 
 * @example
 * ```typescript
 * const artists = await searchArtists('beat', 20, libraryRootId);
 * ```
 */
export async function searchArtists(
  query: string,
  limit: number = 50,
  libraryRootId?: string
): Promise<string[]> {
  // Empty query returns empty array (caller should use getTopArtists for initial display)
  if (!query || query.trim().length === 0) {
    return [];
  }

  const lowerQuery = query.toLowerCase().trim();
  let collection = db.tracks.toCollection();
  
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const artistSet = new Set<string>();
  const artistLowerMap = new Map<string, string>(); // lower -> original
  
  // Process tracks with early termination
  await collection.each((track) => {
    if (artistSet.size >= limit) {
      return false; // Stop iteration
    }

    const artist = track.tags.artist?.trim();
    if (!artist || artist === "Unknown Artist") {
      return; // Continue to next track
    }

    const lowerArtist = artist.toLowerCase();
    
    // Check if already added (case-insensitive)
    if (artistLowerMap.has(lowerArtist)) {
      return; // Already added
    }

    // Prefix match
    if (lowerArtist.startsWith(lowerQuery)) {
      artistSet.add(artist);
      artistLowerMap.set(lowerArtist, artist);
    }
  });

  // Sort results: exact matches first, then alphabetical
  const results = Array.from(artistSet);
  const exactMatch = results.find(a => a.toLowerCase() === lowerQuery);
  const otherMatches = results.filter(a => a.toLowerCase() !== lowerQuery).sort();
  
  return exactMatch ? [exactMatch, ...otherMatches] : otherMatches;
}

/**
 * Search albums by query (case-insensitive prefix matching)
 * 
 * Optimized for large collections with early termination and prefix matching.
 * 
 * @param query - Search query string (minimum 1 character)
 * @param limit - Maximum number of results to return (default: 50)
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of matching album names
 * 
 * @example
 * ```typescript
 * const albums = await searchAlbums('abbey', 20, libraryRootId);
 * ```
 */
export async function searchAlbums(
  query: string,
  limit: number = 50,
  libraryRootId?: string
): Promise<string[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const lowerQuery = query.toLowerCase().trim();
  let collection = db.tracks.toCollection();
  
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const albumSet = new Set<string>();
  const albumLowerMap = new Map<string, string>(); // lower -> original
  
  // Process tracks with early termination
  await collection.each((track) => {
    if (albumSet.size >= limit) {
      return false; // Stop iteration
    }

    const album = track.tags.album?.trim();
    if (!album || album === "Unknown Album") {
      return; // Continue to next track
    }

    const lowerAlbum = album.toLowerCase();
    
    // Check if already added (case-insensitive)
    if (albumLowerMap.has(lowerAlbum)) {
      return; // Already added
    }

    // Prefix match
    if (lowerAlbum.startsWith(lowerQuery)) {
      albumSet.add(album);
      albumLowerMap.set(lowerAlbum, album);
    }
  });

  // Sort results: exact matches first, then alphabetical
  const results = Array.from(albumSet);
  const exactMatch = results.find(a => a.toLowerCase() === lowerQuery);
  const otherMatches = results.filter(a => a.toLowerCase() !== lowerQuery).sort();
  
  return exactMatch ? [exactMatch, ...otherMatches] : otherMatches;
}

/**
 * Search track titles by query (case-insensitive prefix matching)
 * 
 * Optimized for large collections with early termination and prefix matching.
 * 
 * @param query - Search query string (minimum 1 character)
 * @param limit - Maximum number of results to return (default: 50)
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of matching track titles
 * 
 * @example
 * ```typescript
 * const titles = await searchTrackTitles('hey jude', 20, libraryRootId);
 * ```
 */
export async function searchTrackTitles(
  query: string,
  limit: number = 50,
  libraryRootId?: string
): Promise<string[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const lowerQuery = query.toLowerCase().trim();
  let collection = db.tracks.toCollection();
  
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const titleSet = new Set<string>();
  const titleLowerMap = new Map<string, string>(); // lower -> original
  
  // Process tracks with early termination
  await collection.each((track) => {
    if (titleSet.size >= limit) {
      return false; // Stop iteration
    }

    const title = track.tags.title?.trim();
    if (!title || title === "Unknown Title") {
      return; // Continue to next track
    }

    const lowerTitle = title.toLowerCase();
    
    // Check if already added (case-insensitive)
    if (titleLowerMap.has(lowerTitle)) {
      return; // Already added
    }

    // Prefix match
    if (lowerTitle.startsWith(lowerQuery)) {
      titleSet.add(title);
      titleLowerMap.set(lowerTitle, title);
    }
  });

  // Sort results: exact matches first, then alphabetical
  const results = Array.from(titleSet);
  const exactMatch = results.find(t => t.toLowerCase() === lowerQuery);
  const otherMatches = results.filter(t => t.toLowerCase() !== lowerQuery).sort();
  
  return exactMatch ? [exactMatch, ...otherMatches] : otherMatches;
}

/**
 * Search tracks by artist name (case-insensitive substring match)
 */
export async function searchTracksByArtist(
  artist: string,
  limit: number = 50,
  libraryRootId?: string
): Promise<TrackRecord[]> {
  if (!artist.trim()) {
    return [];
  }

  const lowerQuery = artist.toLowerCase();
  let collection = db.tracks.toCollection();
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const results: TrackRecord[] = [];

  await collection.each((track) => {
    if ((track.tags.artist || "").toLowerCase().includes(lowerQuery)) {
      results.push(track);
      if (limit && results.length >= limit) {
        return false;
      }
    }
  });

  return results;
}

/**
 * Search tracks by album name (case-insensitive substring match)
 */
export async function searchTracksByAlbum(
  album: string,
  limit: number = 50,
  libraryRootId?: string
): Promise<TrackRecord[]> {
  if (!album.trim()) {
    return [];
  }

  const lowerQuery = album.toLowerCase();
  let collection = db.tracks.toCollection();
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const results: TrackRecord[] = [];

  await collection.each((track) => {
    if ((track.tags.album || "").toLowerCase().includes(lowerQuery)) {
      results.push(track);
      if (limit && results.length >= limit) {
        return false;
      }
    }
  });

  return results;
}

type TempoQuery = "slow" | "medium" | "fast" | { min: number; max: number };

function getTempoBucket(bpm?: number): "slow" | "medium" | "fast" | "unknown" {
  if (typeof bpm !== "number" || Number.isNaN(bpm)) {
    return "unknown";
  }
  if (bpm < 90) return "slow";
  if (bpm < 140) return "medium";
  return "fast";
}

/**
 * Search tracks by tempo bucket or BPM range
 */
export async function searchTracksByTempo(
  tempo: TempoQuery,
  limit: number = 50,
  libraryRootId?: string
): Promise<TrackRecord[]> {
  let collection = db.tracks.toCollection();
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const results: TrackRecord[] = [];

  await collection.each((track) => {
    const bpm = track.tech?.bpm;
    if (typeof tempo === "string") {
      if (getTempoBucket(bpm) === tempo) {
        results.push(track);
      }
    } else if (typeof bpm === "number" && bpm >= tempo.min && bpm <= tempo.max) {
      results.push(track);
    }

    if (limit && results.length >= limit) {
      return false;
    }
  });

  return results;
}

/**
 * Search tracks by existing mood tags in enhanced metadata
 */
export async function searchTracksByMood(
  mood: string,
  limit: number = 50,
  libraryRootId?: string
): Promise<TrackRecord[]> {
  if (!mood.trim()) {
    return [];
  }

  const lowerQuery = mood.toLowerCase();
  let collection = db.tracks.toCollection();
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const results: TrackRecord[] = [];

  await collection.each((track) => {
    if ((track.enhancedMetadata?.mood || []).some((tag) => tag.toLowerCase().includes(lowerQuery))) {
      results.push(track);
      if (limit && results.length >= limit) {
        return false;
      }
    }
  });

  return results;
}

/**
 * Get top N most common artists (for initial display when no query)
 * 
 * Counts track occurrences per artist and returns the most common ones.
 * 
 * @param limit - Maximum number of results to return (default: 20)
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of most common artist names
 * 
 * @example
 * ```typescript
 * const topArtists = await getTopArtists(20, libraryRootId);
 * ```
 */
export async function getTopArtists(
  limit: number = 20,
  libraryRootId?: string
): Promise<string[]> {
  let collection = db.tracks.toCollection();
  
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const artistCounts = new Map<string, number>();
  
  await collection.each((track) => {
    const artist = track.tags.artist?.trim();
    if (artist && artist !== "Unknown Artist") {
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
  });

  // Sort by count (descending), then by name (ascending)
  const sorted = Array.from(artistCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1]; // Higher count first
      }
      return a[0].localeCompare(b[0]); // Alphabetical if same count
    })
    .slice(0, limit)
    .map(([artist]) => artist);

  return sorted;
}

/**
 * Get top N most common albums (for initial display when no query)
 * 
 * @param limit - Maximum number of results to return (default: 20)
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of most common album names
 */
export async function getTopAlbums(
  limit: number = 20,
  libraryRootId?: string
): Promise<string[]> {
  let collection = db.tracks.toCollection();
  
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const albumCounts = new Map<string, number>();
  
  await collection.each((track) => {
    const album = track.tags.album?.trim();
    if (album && album !== "Unknown Album") {
      albumCounts.set(album, (albumCounts.get(album) || 0) + 1);
    }
  });

  // Sort by count (descending), then by name (ascending)
  const sorted = Array.from(albumCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1]; // Higher count first
      }
      return a[0].localeCompare(b[0]); // Alphabetical if same count
    })
    .slice(0, limit)
    .map(([album]) => album);

  return sorted;
}

/**
 * Get top N most common track titles (for initial display when no query)
 * 
 * @param limit - Maximum number of results to return (default: 20)
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of most common track titles
 */
export async function getTopTrackTitles(
  limit: number = 20,
  libraryRootId?: string
): Promise<string[]> {
  let collection = db.tracks.toCollection();
  
  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const titleCounts = new Map<string, number>();
  
  await collection.each((track) => {
    const title = track.tags.title?.trim();
    if (title && title !== "Unknown Title") {
      titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
    }
  });

  // Sort by count (descending), then by name (ascending)
  const sorted = Array.from(titleCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1]; // Higher count first
      }
      return a[0].localeCompare(b[0]); // Alphabetical if same count
    })
    .slice(0, limit)
    .map(([title]) => title);

  return sorted;
}

/**
 * Get all unique genres from library
 * 
 * Returns normalized genre names (without statistics).
 * 
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Sorted array of normalized genre names
 * 
 * @example
 * ```typescript
 * const genres = await getAllGenres(libraryRootId);
 * ```
 */
export async function getAllGenres(libraryRootId?: string): Promise<string[]> {
  const genresWithStats = await getAllGenresWithStats(libraryRootId);
  return genresWithStats.map((g) => g.normalized);
}

/**
 * Get all normalized genres with statistics (track counts)
 * 
 * Returns genres with their normalized names and track counts.
 * Useful for displaying genre distribution in the UI.
 * 
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Array of genre statistics with normalized names and counts
 * 
 * @example
 * ```typescript
 * const genresWithStats = await getAllGenresWithStats(libraryRootId);
 * // Returns: [{ normalized: 'Rock', count: 150 }, ...]
 * ```
 */
export async function getAllGenresWithStats(
  libraryRootId?: string
): Promise<GenreWithStats[]> {
  let collection = db.tracks.toCollection();

  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const accumulator = createGenreStatsAccumulator();
  await collection.each((track) => {
    accumulator.addTrack(track);
  });
  return accumulator.finalize();
}

/**
 * Get genre co-occurrence map for similar-genre suggestions.
 * For each genre, counts how often it appears on the same track as other genres.
 *
 * @param libraryRootId - Optional library root ID to limit scope
 * @returns Map of genre -> Map of co-occurring genre -> count
 */
export async function getGenreCoOccurrence(
  libraryRootId?: string
): Promise<GenreCoOccurrenceMap> {
  let collection = db.tracks.toCollection();

  if (libraryRootId) {
    collection = db.tracks.where("libraryRootId").equals(libraryRootId);
  }

  const accumulator = createGenreCoOccurrenceAccumulator();
  await collection.each((track) => {
    accumulator.addTrack(track);
  });
  return accumulator.finalize();
}

