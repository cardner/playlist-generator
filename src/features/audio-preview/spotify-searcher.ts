/**
 * Spotify search service for finding track previews
 */

import type { TrackInfo, SampleResult } from './types';

/**
 * Spotify access token (cached)
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Spotify access token using client credentials flow
 */
async function getSpotifyToken(
  clientId?: string,
  clientSecret?: string
): Promise<string | null> {
  if (!clientId || !clientSecret) {
    return null;
  }

  // Check cached token
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const token = data.access_token;
    const expiresIn = data.expires_in || 3600; // Default 1 hour

    cachedToken = {
      token,
      expiresAt: Date.now() + (expiresIn * 1000) - 60000, // Expire 1 minute early
    };

    return token;
  } catch (error) {
    console.error('Failed to get Spotify token:', error);
    return null;
  }
}

/**
 * Search Spotify for a track
 * 
 * @param title Track title
 * @param artist Artist name
 * @param clientId Optional Spotify client ID
 * @param clientSecret Optional Spotify client secret
 * @returns Sample result with preview URL or null if not found
 */
export async function searchSpotify(
  title: string,
  artist: string,
  clientId?: string,
  clientSecret?: string
): Promise<SampleResult | null> {
  try {
    // Get access token
    const token = await getSpotifyToken(clientId, clientSecret);
    
    if (!token) {
      // Without credentials, can't search Spotify
      return null;
    }

    // Build search query
    const query = `artist:"${artist}" track:"${title}"`;
    
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const track = data.tracks?.items?.[0];
    
    if (!track || !track.preview_url) {
      return null;
    }

    return {
      url: track.preview_url,
      platform: 'spotify',
      title: track.name,
      artist: track.artists?.[0]?.name || artist,
      thumbnailUrl: track.album?.images?.[0]?.url,
      duration: track.duration_ms ? Math.floor(track.duration_ms / 1000) : undefined,
    };
  } catch (error) {
    console.error('Spotify search failed:', error);
    return null;
  }
}

