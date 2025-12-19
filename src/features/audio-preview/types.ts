/**
 * Types for audio preview feature
 * 
 * This module defines all TypeScript types and interfaces used throughout
 * the audio preview system. These types ensure type safety and provide
 * clear contracts between components, hooks, and services.
 */

/**
 * Track information required to search for audio previews
 * 
 * Used when querying external APIs (like iTunes) to find preview URLs.
 * All fields except `album` and `year` are required for accurate searching.
 * 
 * @example
 * ```typescript
 * const trackInfo: TrackInfo = {
 *   title: "Bohemian Rhapsody",
 *   artist: "Queen",
 *   album: "A Night at the Opera",
 *   year: 1975
 * };
 * ```
 */
export interface TrackInfo {
  /** The track/song title */
  title: string;
  /** The artist or band name */
  artist: string;
  /** Optional album name - helps improve search accuracy */
  album?: string;
  /** Optional release year - helps improve search accuracy */
  year?: number;
}

/**
 * Result from a platform search containing preview URL and metadata
 * 
 * Returned by search functions when a preview URL is found.
 * Contains the preview URL, platform information, and track metadata
 * that can be used for display and playback.
 * 
 * @example
 * ```typescript
 * const result: SampleResult = {
 *   url: "https://audio-ssl.itunes.apple.com/...",
 *   platform: "itunes",
 *   title: "Bohemian Rhapsody",
 *   artist: "Queen",
 *   thumbnailUrl: "https://is1-ssl.mzstatic.com/...",
 * };
 * ```
 */
export interface SampleResult {
  /** 
   * Preview URL - HTTP/HTTPS URL to the audio preview file
   * This is typically a 30-second preview from iTunes
   */
  url: string;
  
  /** 
   * Platform identifier - currently only 'itunes' is supported
   * Future platforms could include 'spotify', 'youtube', etc.
   */
  platform: 'itunes';
  
  /** Track title from the platform (may differ slightly from search) */
  title: string;
  
  /** Artist name from the platform (may differ slightly from search) */
  artist: string;
  
  /** 
   * Optional thumbnail/artwork URL for display
   * Higher resolution artwork if available (e.g., artworkUrl600)
   */
  thumbnailUrl?: string;
  
  /** 
   * Optional duration in seconds
   * Not always provided by iTunes API for previews
   */
  duration?: number;
  
  /** 
   * Preview start time in seconds
   * Always 0 for iTunes (previews start at beginning of track)
   * Could be non-zero for other platforms that allow custom start times
   */
  previewStartTime?: number;
}

/**
 * Options for searching track previews
 * 
 * Currently minimal, but can be extended for future features like
 * timeout configuration, platform preferences, etc.
 */
export interface SearchOptions {
  /** 
   * Optional timeout in milliseconds
   * Not currently used, but reserved for future timeout handling
   */
  timeout?: number;
  
  /** 
   * Optional track file ID for caching purposes
   * Used internally to associate search results with specific tracks
   */
  trackFileId?: string;
  
  /** 
   * Optional library root ID for context
   * Used internally for library-specific operations
   */
  libraryRootId?: string;
}

/**
 * Utility type: Extract the platform type from SampleResult
 * 
 * Useful for type-safe platform checks and future multi-platform support.
 */
export type PreviewPlatform = SampleResult['platform'];

/**
 * Utility type: Required fields from TrackInfo
 * 
 * Used when you need to ensure title and artist are present.
 */
export type RequiredTrackInfo = Required<Pick<TrackInfo, 'title' | 'artist'>> & Pick<TrackInfo, 'album' | 'year'>;

