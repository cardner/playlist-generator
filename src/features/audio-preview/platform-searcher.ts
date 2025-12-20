/**
 * iTunes Search API searcher
 * 
 * Uses Apple's iTunes Search API to find 30-second track previews
 */

import type { TrackInfo, SampleResult, SearchOptions } from './types';
import { searchiTunes } from './itunes-searcher';
import { logger } from '@/lib/logger';

/**
 * Search for track sample using iTunes API
 * 
 * @param trackInfo Track information (title, artist, album)
 * @param options Search options (timeout - optional, not currently used)
 * @returns Sample result with preview URL or null if not found
 */
export async function searchTrackSample(
  trackInfo: TrackInfo,
  options?: SearchOptions & { trackFileId?: string; libraryRootId?: string }
): Promise<SampleResult | null> {
  try {
    const result = await searchiTunes(
      trackInfo.title,
      trackInfo.artist,
      trackInfo.album
    );

    return result;
  } catch (error) {
    logger.warn(`[Audio Preview] iTunes search failed:`, error);
    return null;
  }
}

