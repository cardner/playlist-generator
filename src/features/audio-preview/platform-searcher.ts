/**
 * Unified platform searcher with fallback chain
 * 
 * Tries platforms in order: YouTube Music → Spotify → Bandcamp
 */

import type { TrackInfo, SampleResult, SearchOptions, PlatformConfig } from './types';
import { searchYouTubeMusic } from './youtube-searcher';
import { searchSpotify } from './spotify-searcher';
import { searchBandcamp } from './bandcamp-searcher';
import { searchLocalFile } from './local-file-player';
import { getAudioPreviewConfig } from '@/lib/audio-preview-config';

/**
 * Search for track sample across multiple platforms
 * 
 * @param trackInfo Track information (title, artist, album)
 * @param options Search options (platforms to try, timeout)
 * @returns Sample result from first successful platform, or null if all fail
 */
export async function searchTrackSample(
  trackInfo: TrackInfo,
  options?: SearchOptions & { trackFileId?: string; libraryRootId?: string }
): Promise<SampleResult | null> {
  const config = getAudioPreviewConfig();
  // Try local file first, then YouTube/Spotify
  // Exclude bandcamp by default since API route doesn't exist yet
  const platforms = options?.platforms || ['local', 'youtube', 'spotify'];
  const timeout = options?.timeout || 10000; // 10 second default timeout

  console.log(`[Audio Preview] Searching for: "${trackInfo.artist}" - "${trackInfo.title}"`);

  // Try each platform in order
  for (const platform of platforms) {
    try {
      console.log(`[Audio Preview] Trying platform: ${platform}`);
      let result: SampleResult | null = null;

      switch (platform) {
        case 'local':
          // Try local file first if trackFileId and libraryRootId are provided
          if (options?.trackFileId && options?.libraryRootId) {
            result = await Promise.race([
              searchLocalFile(
                options.trackFileId,
                options.libraryRootId,
                trackInfo
              ),
              new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeout)
              ),
            ]).catch((error) => {
              console.warn(`[Audio Preview] Local file search error:`, error);
              return null;
            });
          } else {
            console.log(`[Audio Preview] Local: No trackFileId/libraryRootId provided, skipping`);
            result = null;
          }
          break;

        case 'youtube':
          if (!config.youtube?.apiKey) {
            console.log(`[Audio Preview] YouTube: No API key configured, skipping`);
            result = null;
          } else {
            result = await Promise.race([
              searchYouTubeMusic(
                trackInfo.title,
                trackInfo.artist,
                config.youtube?.apiKey
              ),
              new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeout)
              ),
            ]).catch((error) => {
              console.warn(`[Audio Preview] YouTube search error:`, error);
              return null;
            });
          }
          break;

        case 'spotify':
          if (!config.spotify?.clientId || !config.spotify?.clientSecret) {
            console.log(`[Audio Preview] Spotify: No credentials configured, skipping`);
            result = null;
          } else {
            result = await Promise.race([
              searchSpotify(
                trackInfo.title,
                trackInfo.artist,
                config.spotify?.clientId,
                config.spotify?.clientSecret
              ),
              new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeout)
              ),
            ]).catch((error) => {
              console.warn(`[Audio Preview] Spotify search error:`, error);
              return null;
            });
          }
          break;

        case 'bandcamp':
          result = await Promise.race([
            searchBandcamp(trackInfo.title, trackInfo.artist),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), timeout)
            ),
          ]).catch((error) => {
            console.warn(`[Audio Preview] Bandcamp search error:`, error);
            return null;
          });
          break;
      }

      if (result) {
        console.log(`[Audio Preview] Found preview on ${platform}:`, result.url);
        return result;
      } else {
        console.log(`[Audio Preview] No result from ${platform}`);
      }
    } catch (error) {
      console.warn(`[Audio Preview] Failed to search ${platform}:`, error);
      // Continue to next platform
    }
  }

  // All platforms failed
  const hasConfig = !!(config.youtube?.apiKey || (config.spotify?.clientId && config.spotify?.clientSecret));
  if (!hasConfig) {
    console.warn(`[Audio Preview] All platforms failed - no API keys configured. YouTube or Spotify credentials required.`);
  } else {
    console.warn(`[Audio Preview] All platforms failed for: "${trackInfo.artist}" - "${trackInfo.title}"`);
  }
  return null;
}

/**
 * Check if a platform is available/configured
 */
export function isPlatformAvailable(
  platform: 'youtube' | 'spotify' | 'bandcamp',
  config?: PlatformConfig
): boolean {
  const platformConfig = config || getAudioPreviewConfig();

  switch (platform) {
    case 'youtube':
      return true; // YouTube works without API key (limited)
    case 'spotify':
      return !!(
        platformConfig.spotify?.clientId &&
        platformConfig.spotify?.clientSecret
      );
    case 'bandcamp':
      return platformConfig.bandcamp?.enabled !== false;
    default:
      return false;
  }
}

