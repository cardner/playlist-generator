/**
 * YouTube Music search service for finding track previews
 */

import type { TrackInfo, SampleResult } from './types';

/**
 * Search YouTube Music for a track
 * 
 * @param title Track title
 * @param artist Artist name
 * @param apiKey Optional YouTube Data API key for better results
 * @returns Sample result with preview URL or null if not found
 */
export async function searchYouTubeMusic(
  title: string,
  artist: string,
  apiKey?: string
): Promise<SampleResult | null> {
  try {
    // Build search query
    const query = `${artist} ${title}`.trim();
    
    if (apiKey) {
      // Use YouTube Data API v3 for better results
      return await searchWithAPI(query, apiKey, title, artist);
    } else {
      // Fallback to web search approach
      return await searchWithoutAPI(query, title, artist);
    }
  } catch (error) {
    console.error('YouTube Music search failed:', error);
    return null;
  }
}

/**
 * Search using YouTube Data API v3
 */
async function searchWithAPI(
  query: string,
  apiKey: string,
  title: string,
  artist: string
): Promise<SampleResult | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=1&key=${apiKey}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const video = data.items?.[0];
    
    if (!video) {
      return null;
    }

    const videoId = video.id.videoId;
    
    return {
      url: `https://www.youtube.com/embed/${videoId}?autoplay=1&start=0`,
      platform: 'youtube',
      title: video.snippet.title,
      artist: artist,
      thumbnailUrl: video.snippet.thumbnails?.default?.url,
      duration: undefined,
      previewStartTime: 0,
    };
  } catch (error) {
    console.error('YouTube API search failed:', error);
    return null;
  }
}

/**
 * Search without API key (uses YouTube Music search page)
 * Note: This is a fallback and may be less reliable
 * 
 * For now, returns null to fall back to next platform.
 * In production, you could:
 * 1. Use a server-side proxy to scrape YouTube Music search
 * 2. Use YouTube's oEmbed API (limited)
 * 3. Require API key for YouTube functionality
 */
async function searchWithoutAPI(
  query: string,
  title: string,
  artist: string
): Promise<SampleResult | null> {
  // Without API key, we can't reliably search YouTube Music
  // Return null to try next platform (Spotify or Bandcamp)
  return null;
}

/**
 * Extract video ID from YouTube URL
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/.*[?&]v=([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

