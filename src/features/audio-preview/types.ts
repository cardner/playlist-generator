/**
 * Types for audio preview feature
 */

/**
 * Track information for searching previews
 */
export interface TrackInfo {
  title: string;
  artist: string;
  album?: string;
  year?: number;
}

/**
 * Result from platform search with preview URL
 */
export interface SampleResult {
  url: string; // Preview URL, embed URL, or blob URL
  platform: 'youtube' | 'spotify' | 'bandcamp' | 'local';
  title: string;
  artist: string;
  thumbnailUrl?: string;
  duration?: number;
  previewStartTime?: number; // For YouTube, start at specific time
  blobFile?: File; // For local files, keep File reference to prevent garbage collection
}

/**
 * Platform configuration
 */
export interface PlatformConfig {
  youtube?: {
    apiKey?: string; // Optional for better results
  };
  spotify?: {
    clientId?: string;
    clientSecret?: string;
  };
  bandcamp?: {
    enabled: boolean;
  };
}

/**
 * Search options
 */
export interface SearchOptions {
  platforms?: ('youtube' | 'spotify' | 'bandcamp')[]; // Which platforms to try
  timeout?: number; // Search timeout in milliseconds
}

