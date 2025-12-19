/**
 * Bandcamp search service for finding track previews
 * 
 * Note: Bandcamp doesn't have an official API, so this uses web search
 * or would require a server-side proxy for HTML parsing
 */

import type { TrackInfo, SampleResult } from './types';

/**
 * Search Bandcamp for a track
 * 
 * @param title Track title
 * @param artist Artist name
 * @returns Sample result with preview URL or null if not found
 */
export async function searchBandcamp(
  title: string,
  artist: string
): Promise<SampleResult | null> {
  try {
    // Bandcamp search URL
    const query = `${artist} ${title}`.trim();
    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}`;
    
    // Since Bandcamp doesn't have a public API and CORS prevents direct HTML parsing,
    // we would need a server-side proxy to:
    // 1. Fetch the search results page
    // 2. Parse HTML to find track URLs
    // 3. Fetch track page to find preview URL
    
    // For now, return null to indicate Bandcamp search requires server-side implementation
    // In a production environment, you'd call an API endpoint that does the scraping server-side
    
    // Attempt to use Bandcamp's search API endpoint if available
    // Note: This requires a server-side API route to be implemented
    // For now, skip Bandcamp search to avoid 404 errors
    // TODO: Implement /api/bandcamp/search route or remove Bandcamp from platform list
    return null;
    
    // Uncomment when API route is implemented:
    /*
    try {
      const response = await fetch(`/api/bandcamp/search?q=${encodeURIComponent(query)}`, {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.previewUrl) {
          return {
            url: data.previewUrl,
            platform: 'bandcamp',
            title: data.title || title,
            artist: data.artist || artist,
            thumbnailUrl: data.thumbnailUrl,
            duration: data.duration,
          };
        }
      }
    } catch (error) {
      // API endpoint not available, continue to return null
      console.debug('Bandcamp API not available:', error);
    }
    */

    return null;
  } catch (error) {
    console.error('Bandcamp search failed:', error);
    return null;
  }
}

