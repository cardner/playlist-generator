/**
 * iTunes Search API service for finding track previews
 * 
 * Uses Apple's iTunes Search API (no authentication required)
 * Returns 30-second preview URLs when available
 */

import type { TrackInfo, SampleResult } from './types';
import { logger } from '@/lib/logger';

const MIN_REQUEST_INTERVAL_MS = 500;
const RETRY_AFTER_429_MS = 1500;
let lastRequestAt = 0;
let requestQueue: Promise<unknown> = Promise.resolve();

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleRateLimit(): Promise<void> {
  const now = Date.now();
  const waitFor = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - lastRequestAt));
  if (waitFor > 0) {
    await delay(waitFor);
  }
  lastRequestAt = Date.now();
}

async function withRateLimit<T>(task: () => Promise<T>): Promise<T> {
  const taskPromise = requestQueue.then(async () => {
    await scheduleRateLimit();
    return task();
  });
  requestQueue = taskPromise.catch(() => undefined);
  return taskPromise;
}

/**
 * Search iTunes API for a track
 * 
 * @param title Track title
 * @param artist Artist name
 * @param album Optional album name
 * @returns Sample result with preview URL or null if not found
 */
export async function searchiTunes(
  title: string,
  artist: string,
  album?: string
): Promise<SampleResult | null> {
  try {
    // Build search query: prefer artist + title, optionally include album
    let searchTerm = `${artist} ${title}`.trim();
    if (album) {
      searchTerm = `${artist} ${title} ${album}`.trim();
    }

    // iTunes Search API endpoint
    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.set('term', searchTerm);
    url.searchParams.set('media', 'music');
    url.searchParams.set('entity', 'song');
    url.searchParams.set('limit', '10'); // Get multiple results to find best match

    const response = await withRateLimit(() =>
      fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
        },
      })
    );

    if (response.status === 429) {
      logger.warn("iTunes API rate limited (429). Retrying after backoff.");
      await delay(RETRY_AFTER_429_MS);
      const retryResponse = await withRateLimit(() =>
        fetch(url.toString(), {
          headers: {
            'Accept': 'application/json',
          },
        })
      );
      if (!retryResponse.ok) {
        logger.error(`iTunes API error: ${retryResponse.status} ${retryResponse.statusText}`);
        return null;
      }
      const retryData = await retryResponse.json();
      const retryResults = retryData.results || [];
      if (retryResults.length === 0) {
        return null;
      }
      return selectBestMatch(retryResults, title, artist);
    }

    if (!response.ok) {
      logger.error(`iTunes API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const results = data.results || [];

    if (results.length === 0) {
      return null;
    }

    return selectBestMatch(results, title, artist);
  } catch (error) {
    logger.error('iTunes search failed:', error);
    return null;
  }
}

function selectBestMatch(
  results: any[],
  title: string,
  artist: string
): SampleResult | null {
  // Find best matching result by comparing title and artist
  const normalizedTitle = title.toLowerCase().trim();
  const normalizedArtist = artist.toLowerCase().trim();

  let bestMatch = results[0];
  let bestScore = 0;

  for (const result of results) {
    const resultTitle = (result.trackName || '').toLowerCase().trim();
    const resultArtist = (result.artistName || '').toLowerCase().trim();

    // Score based on title and artist match
    let score = 0;

    // Exact title match gets high score
    if (resultTitle === normalizedTitle) {
      score += 10;
    } else if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) {
      score += 5;
    }

    // Exact artist match gets high score
    if (resultArtist === normalizedArtist) {
      score += 10;
    } else if (resultArtist.includes(normalizedArtist) || normalizedArtist.includes(resultArtist)) {
      score += 5;
    }

    // Prefer results with preview URLs
    if (result.previewUrl) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }

  // Check if best match has a preview URL
  if (!bestMatch.previewUrl) {
    return null;
  }

  // Use higher resolution artwork if available
  const artworkUrl = bestMatch.artworkUrl600 || bestMatch.artworkUrl100 || undefined;

  return {
    url: bestMatch.previewUrl,
    platform: 'itunes',
    title: bestMatch.trackName || title,
    artist: bestMatch.artistName || artist,
    thumbnailUrl: artworkUrl,
    duration: undefined, // iTunes API doesn't provide preview duration
    previewStartTime: 0, // iTunes previews always start at beginning
  };
}

