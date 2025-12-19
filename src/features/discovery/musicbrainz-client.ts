/**
 * MusicBrainz API client for querying the MusicBrainz database
 * 
 * Uses the official MusicBrainz API (https://musicbrainz.org/ws/2/)
 * Rate limit: 1 request per second (enforced client-side)
 * 
 * Documentation: https://musicbrainz.org/doc/MusicBrainz_API
 */

import type { MusicBrainzRecordingResult, MusicBrainzRecordingWithDetails } from './musicbrainz-types';

const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'AI-Playlist-Generator/1.0.0 (https://github.com/yourusername/ai-playlist-generator)';

// Rate limiting: 1 request per second
// Use a queue to ensure requests complete before starting the next one
let requestQueue: Array<{
  url: string;
  options: RequestInit;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}> = [];
let isProcessing = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second in milliseconds

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }

  isProcessing = true;
  
  while (requestQueue.length > 0) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    // Wait if needed to respect rate limit
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    const queuedRequest = requestQueue.shift();
    if (!queuedRequest) {
      continue;
    }

    lastRequestTime = Date.now();
    
    try {
      // Make the request and wait for it to complete
      const response = await fetch(queuedRequest.url, {
        ...queuedRequest.options,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
          ...queuedRequest.options.headers,
        },
      });
      
      queuedRequest.resolve(response);
    } catch (error) {
      queuedRequest.reject(error as Error);
    }
  }
  
  isProcessing = false;
}

/**
 * Rate-limited fetch wrapper for MusicBrainz API
 * 
 * Uses a queue to ensure requests complete before starting the next one,
 * respecting the 1 request per second rate limit
 */
async function rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    requestQueue.push({ url, options, resolve, reject });
    processQueue();
  });
}

/**
 * Query parameters for finding similar recordings
 */
export interface FindSimilarRecordingsParams {
  artist: string;
  title: string;
  genres?: string[];
  limit?: number;
}

/**
 * Search parameters for recordings
 */
export interface SearchRecordingsParams {
  artist?: string;
  title?: string;
  limit?: number;
}

/**
 * Check if MusicBrainz is available
 * MusicBrainz API is always available (no configuration needed)
 */
export function isMusicBrainzAvailable(): boolean {
  return true; // MusicBrainz API is publicly available
}

/**
 * Find similar recordings in MusicBrainz database
 * 
 * Uses MusicBrainz API search to find recordings similar to the given artist and title.
 * Searches by artist and title, then filters by genre similarity.
 * 
 * @param params Search parameters
 * @returns Array of similar recordings
 */
export async function findSimilarRecordings(
  params: FindSimilarRecordingsParams
): Promise<MusicBrainzRecordingResult[]> {
  try {
    // Build search query: artist:"Artist Name" AND recording:"Track Title"
    const queryParts: string[] = [];
    if (params.artist) {
      queryParts.push(`artist:"${params.artist.replace(/"/g, '\\"')}"`);
    }
    if (params.title) {
      queryParts.push(`recording:"${params.title.replace(/"/g, '\\"')}"`);
    }
    
    if (queryParts.length === 0) {
      return [];
    }

    const query = queryParts.join(' AND ');
    const limit = params.limit || 10;
    
    // Search recordings via MusicBrainz API
    const url = `${MUSICBRAINZ_API_BASE}/recording?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 503) {
        console.warn('MusicBrainz API rate limit exceeded, please wait');
      }
      console.error('MusicBrainz API error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    
    // Transform MusicBrainz API response to our format
    const recordings: MusicBrainzRecordingResult[] = (data.recordings || []).map((rec: any) => {
      const artistCredit = rec['artist-credit']?.[0]?.name || rec['artist-credit']?.[0]?.artist?.name || 'Unknown Artist';
      const release = rec.releases?.[0];
      
      // Extract genres from tags
      const genres = (rec.tags || [])
        .filter((tag: any) => tag.count > 0)
        .map((tag: any) => tag.name)
        .slice(0, 5); // Limit to top 5 genres

      return {
        mbid: rec.id,
        title: rec.title,
        artist: artistCredit,
        album: release?.title,
        genres,
        duration: rec.length ? Math.floor(rec.length / 1000) : undefined, // Convert ms to seconds
        releaseDate: release?.date,
        releaseYear: release?.date ? parseInt(release.date.split('-')[0]) : undefined,
        tags: rec.tags || [],
        relationships: rec.relations || [],
        artists: (rec['artist-credit'] || []).map((ac: any) => ac.name || ac.artist?.name).filter(Boolean),
      };
    });

    // Filter by genre similarity if genres provided
    if (params.genres && params.genres.length > 0 && recordings.length > 0) {
      const requestedGenresLower = params.genres.map(g => g.toLowerCase());
      return recordings.filter(rec => {
        const recGenresLower = rec.genres.map(g => g.toLowerCase());
        return recGenresLower.some(rg => 
          requestedGenresLower.some(req => rg.includes(req) || req.includes(rg))
        );
      }).slice(0, limit);
    }

    return recordings;
  } catch (error) {
    console.error('Failed to query MusicBrainz:', error);
    return [];
  }
}

/**
 * Get detailed recording information by MBID
 * 
 * @param mbid MusicBrainz recording ID
 * @returns Recording details or null if not found
 */
export async function getRecordingDetails(
  mbid: string
): Promise<MusicBrainzRecordingResult | null> {
  try {
    // Include additional data: releases, tags, artist-credits, relations
    const url = `${MUSICBRAINZ_API_BASE}/recording/${mbid}?inc=releases+tags+artist-credits+relations&fmt=json`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      console.error('MusicBrainz API error:', response.status, response.statusText);
      return null;
    }

    const rec = await response.json();
    
    const artistCredit = rec['artist-credit']?.[0]?.name || rec['artist-credit']?.[0]?.artist?.name || 'Unknown Artist';
    const release = rec.releases?.[0];
    const artists = (rec['artist-credit'] || []).map((ac: any) => ac.name || ac.artist?.name).filter(Boolean);
    const genres = (rec.tags || []).filter((tag: any) => tag.count > 0).map((tag: any) => tag.name);
    const tags = (rec.tags || []).map((tag: any) => tag.name);
    
    return {
      mbid: rec.id,
      title: rec.title,
      artist: artistCredit,
      artists: artists,
      album: release?.title,
      albums: rec.releases?.map((r: any) => r.title).filter(Boolean) || [],
      genres: genres,
      duration: rec.length ? Math.floor(rec.length / 1000) : undefined,
      releaseDate: release?.date,
      releaseYear: release?.date ? parseInt(release.date.split('-')[0]) : undefined,
      tags: tags,
      relationships: rec.relations?.map((rel: any) => ({
        type: rel.type,
        target: rel.target || rel['target-credit'] || '',
        targetType: rel['target-type'] || '',
      })) || [],
    };
  } catch (error) {
    console.error('Failed to get recording details:', error);
    return null;
  }
}

/**
 * Search recordings by artist and/or title
 * 
 * @param params Search parameters
 * @returns Array of matching recordings
 */
export async function searchByArtistAndTitle(
  params: SearchRecordingsParams
): Promise<MusicBrainzRecordingResult[]> {
  try {
    const queryParts: string[] = [];
    if (params.artist) {
      queryParts.push(`artist:"${params.artist.replace(/"/g, '\\"')}"`);
    }
    if (params.title) {
      queryParts.push(`recording:"${params.title.replace(/"/g, '\\"')}"`);
    }
    
    if (queryParts.length === 0) {
      return [];
    }

    const query = queryParts.join(' AND ');
    const limit = params.limit || 20;
    
    const url = `${MUSICBRAINZ_API_BASE}/recording?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      console.error('MusicBrainz API error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    
    return (data.recordings || []).map((rec: any) => {
      const artistCredit = rec['artist-credit']?.[0]?.name || rec['artist-credit']?.[0]?.artist?.name || 'Unknown Artist';
      const release = rec.releases?.[0];
      
      return {
        mbid: rec.id,
        title: rec.title,
        artist: artistCredit,
        album: release?.title,
        genres: (rec.tags || []).filter((tag: any) => tag.count > 0).map((tag: any) => tag.name),
        duration: rec.length ? Math.floor(rec.length / 1000) : undefined,
        releaseDate: release?.date,
        releaseYear: release?.date ? parseInt(release.date.split('-')[0]) : undefined,
        tags: rec.tags || [],
        relationships: rec.relations || [],
        artists: (rec['artist-credit'] || []).map((ac: any) => ac.name || ac.artist?.name).filter(Boolean),
      };
    });
  } catch (error) {
    console.error('Failed to search MusicBrainz:', error);
    return [];
  }
}

/**
 * Find recordings by genre
 * 
 * Uses MusicBrainz tag search to find recordings tagged with the genre
 * 
 * @param genre Genre name
 * @param limit Maximum number of results
 * @returns Array of recordings in the genre
 */
export async function findRecordingsByGenre(
  genre: string,
  limit: number = 20
): Promise<MusicBrainzRecordingResult[]> {
  try {
    // Search for recordings tagged with this genre
    const query = `tag:"${genre.replace(/"/g, '\\"')}"`;
    const url = `${MUSICBRAINZ_API_BASE}/recording?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      console.error('MusicBrainz API error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    
    return (data.recordings || []).map((rec: any) => {
      const artistCredit = rec['artist-credit']?.[0]?.name || rec['artist-credit']?.[0]?.artist?.name || 'Unknown Artist';
      const release = rec.releases?.[0];
      
      return {
        mbid: rec.id,
        title: rec.title,
        artist: artistCredit,
        album: release?.title,
        genres: (rec.tags || []).filter((tag: any) => tag.count > 0).map((tag: any) => tag.name),
        duration: rec.length ? Math.floor(rec.length / 1000) : undefined,
        releaseDate: release?.date,
        releaseYear: release?.date ? parseInt(release.date.split('-')[0]) : undefined,
        tags: rec.tags || [],
        relationships: rec.relations || [],
        artists: (rec['artist-credit'] || []).map((ac: any) => ac.name || ac.artist?.name).filter(Boolean),
      };
    });
  } catch (error) {
    console.error('Failed to find recordings by genre:', error);
    return [];
  }
}

/**
 * Find related artists
 * 
 * Searches for artists and uses relationships to find related artists
 * 
 * @param artistName Artist name
 * @param limit Maximum number of results
 * @returns Array of related artist names
 */
export async function findRelatedArtists(
  artistName: string,
  limit: number = 10
): Promise<string[]> {
  try {
    // First, find the artist
    const searchUrl = `${MUSICBRAINZ_API_BASE}/artist?query=artist:"${encodeURIComponent(artistName)}"&limit=1&fmt=json`;
    const searchResponse = await rateLimitedFetch(searchUrl);

    if (!searchResponse.ok) {
      return [];
    }

    const searchData = await searchResponse.json();
    const artist = searchData.artists?.[0];
    
    if (!artist) {
      return [];
    }

    // Get artist details with relationships
    // Note: 'relations' is not a valid inc parameter for artist resource
    // Relationships are included by default in the artist response
    const artistUrl = `${MUSICBRAINZ_API_BASE}/artist/${artist.id}?fmt=json`;
    const artistResponse = await rateLimitedFetch(artistUrl);

    if (!artistResponse.ok) {
      return [];
    }

    const artistData = await artistResponse.json();
    const relations = artistData.relations || [];
    
    // Extract related artist names from relationships
    const relatedArtists = relations
      .filter((rel: any) => rel.type === 'collaboration' || rel.type === 'member of' || rel.type === 'founded')
      .map((rel: any) => rel.artist?.name)
      .filter(Boolean)
      .slice(0, limit);

    return relatedArtists;
  } catch (error) {
    console.error('Failed to find related artists:', error);
    return [];
  }
}

