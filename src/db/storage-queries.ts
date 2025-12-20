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
import { getNormalizedGenresWithStats, type GenreWithStats } from "@/features/library/genre-normalization";

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

  const allTracks = await collection.toArray();

  const filtered = allTracks.filter((track) => {
    const title = track.tags.title?.toLowerCase() || "";
    const artist = track.tags.artist?.toLowerCase() || "";
    const album = track.tags.album?.toLowerCase() || "";

    return (
      title.includes(lowerQuery) ||
      artist.includes(lowerQuery) ||
      album.includes(lowerQuery)
    );
  });

  // Apply limit if specified
  return limit ? filtered.slice(0, limit) : filtered;
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

  const allTracks = await collection.toArray();

  const filtered = allTracks.filter((track) =>
    track.tags.genres.some(
      (g) => g.toLowerCase() === lowerGenre
    )
  );

  // Apply limit if specified
  return limit ? filtered.slice(0, limit) : filtered;
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

  const allTracks = await collection.toArray();
  const artistSet = new Set<string>();
  
  for (const track of allTracks) {
    const artist = track.tags.artist?.trim();
    if (artist && artist !== "Unknown Artist") {
      artistSet.add(artist);
    }
  }

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

  const allTracks = await collection.toArray();
  const albumSet = new Set<string>();
  
  for (const track of allTracks) {
    const album = track.tags.album?.trim();
    if (album && album !== "Unknown Album") {
      albumSet.add(album);
    }
  }

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

  const allTracks = await collection.toArray();
  const titleSet = new Set<string>();
  
  for (const track of allTracks) {
    const title = track.tags.title?.trim();
    if (title && title !== "Unknown Title") {
      titleSet.add(title);
    }
  }

  return Array.from(titleSet).sort();
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
  let tracks: TrackRecord[];

  if (libraryRootId) {
    tracks = await db.tracks.where("libraryRootId").equals(libraryRootId).toArray();
  } else {
    tracks = await db.tracks.toArray();
  }

  return getNormalizedGenresWithStats(tracks);
}

