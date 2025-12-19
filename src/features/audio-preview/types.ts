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
  url: string; // Preview URL from iTunes
  platform: 'itunes';
  title: string;
  artist: string;
  thumbnailUrl?: string;
  duration?: number;
  previewStartTime?: number; // Always 0 for iTunes (previews start at beginning)
}

/**
 * Search options
 */
export interface SearchOptions {
  timeout?: number; // Search timeout in milliseconds (optional, not currently used)
}

