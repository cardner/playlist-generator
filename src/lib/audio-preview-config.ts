/**
 * Configuration for audio preview platforms
 */

import type { PlatformConfig } from '@/features/audio-preview/types';

let cachedConfig: PlatformConfig | null = null;

/**
 * Get audio preview platform configuration
 * 
 * Reads from localStorage in browser or environment variables on server
 */
export function getAudioPreviewConfig(): PlatformConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    // Server-side: use environment variables
    const config: PlatformConfig = {
      youtube: {
        apiKey: process.env.YOUTUBE_API_KEY,
      },
      spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      },
      bandcamp: {
        enabled: process.env.BANDCAMP_ENABLED !== 'false',
      },
    };

    cachedConfig = config;
    return config;
  } else {
    // Browser-side: check localStorage
    const stored = localStorage.getItem('audio-preview-config');
    if (stored) {
      try {
        cachedConfig = JSON.parse(stored);
        return cachedConfig!;
      } catch (e) {
        console.error('Failed to parse audio preview config:', e);
      }
    }

    // Return default config
    const defaultConfig: PlatformConfig = {
      youtube: {
        apiKey: undefined, // Optional
      },
      spotify: {
        clientId: undefined,
        clientSecret: undefined,
      },
      bandcamp: {
        enabled: true,
      },
    };

    cachedConfig = defaultConfig;
    return defaultConfig;
  }
}

/**
 * Set audio preview platform configuration
 */
export function setAudioPreviewConfig(config: PlatformConfig): void {
  cachedConfig = config;

  if (typeof window !== 'undefined') {
    localStorage.setItem('audio-preview-config', JSON.stringify(config));
  }
}

/**
 * Clear cached configuration
 */
export function clearAudioPreviewConfig(): void {
  cachedConfig = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('audio-preview-config');
  }
}

