/**
 * Hook for managing audio preview state across multiple tracks
 * 
 * This hook manages the state for audio previews when dealing with multiple
 * tracks (like in a playlist). It handles:
 * - Caching search results per track
 * - Tracking which track is currently playing
 * - Managing loading and error states per track
 * - Providing efficient state updates
 * 
 * This is used in components like PlaylistDisplay where multiple tracks
 * can have previews, and we need to manage state for all of them efficiently.
 * 
 * @example
 * ```typescript
 * const {
 *   playingTrackId,
 *   searchingTrackId,
 *   getSampleResult,
 *   getError,
 *   setSampleResult,
 *   setError,
 *   setPlayingTrack,
 *   clearPlayingTrack,
 * } = useAudioPreviewState();
 * 
 * // Check if a track is playing
 * const isPlaying = playingTrackId === trackFileId;
 * 
 * // Get cached result
 * const cachedResult = getSampleResult(trackFileId);
 * ```
 */

import { useState, useCallback, useMemo } from 'react';
import type { SampleResult } from '@/features/audio-preview/types';

/**
 * Return value from useAudioPreviewState hook
 */
export interface UseAudioPreviewStateReturn {
  /** ID of the track currently playing (null if none) */
  playingTrackId: string | null;
  /** ID of the track currently being searched (null if none) */
  searchingTrackId: string | null;
  /** Get cached sample result for a track */
  getSampleResult: (trackFileId: string) => SampleResult | undefined;
  /** Get error message for a track */
  getError: (trackFileId: string) => string | undefined;
  /** Check if a track has a cached result */
  hasSampleResult: (trackFileId: string) => boolean;
  /** Check if a track has an error */
  hasError: (trackFileId: string) => boolean;
  /** Set sample result for a track */
  setSampleResult: (trackFileId: string, result: SampleResult) => void;
  /** Set error for a track */
  setError: (trackFileId: string, error: string) => void;
  /** Clear error for a track */
  clearError: (trackFileId: string) => void;
  /** Set the currently playing track */
  setPlayingTrack: (trackFileId: string | null) => void;
  /** Clear the currently playing track */
  clearPlayingTrack: () => void;
  /** Set the currently searching track */
  setSearchingTrack: (trackFileId: string | null) => void;
  /** Clear all cached results (useful when playlist changes) */
  clearAll: () => void;
}

/**
 * Hook for managing audio preview state across multiple tracks
 * 
 * Provides efficient state management for audio previews in a multi-track
 * context. Uses Maps internally for O(1) lookups and efficient updates.
 * 
 * State is organized as:
 * - `trackSampleResults`: Map of trackFileId -> SampleResult (cached search results)
 * - `trackErrors`: Map of trackFileId -> error message (per-track errors)
 * - `playingTrackId`: Currently playing track ID (only one can play at a time)
 * - `searchingTrackId`: Currently searching track ID (only one search at a time)
 * 
 * @returns State management functions and current state
 */
export function useAudioPreviewState(): UseAudioPreviewStateReturn {
  // Use Maps for efficient lookups and updates
  const [trackSampleResults, setTrackSampleResults] = useState<Map<string, SampleResult>>(new Map());
  const [trackErrors, setTrackErrors] = useState<Map<string, string>>(new Map());
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [searchingTrackId, setSearchingTrackId] = useState<string | null>(null);

  /**
   * Get cached sample result for a track
   */
  const getSampleResult = useCallback((trackFileId: string): SampleResult | undefined => {
    return trackSampleResults.get(trackFileId);
  }, [trackSampleResults]);

  /**
   * Get error message for a track
   */
  const getError = useCallback((trackFileId: string): string | undefined => {
    return trackErrors.get(trackFileId);
  }, [trackErrors]);

  /**
   * Check if a track has a cached result
   */
  const hasSampleResult = useCallback((trackFileId: string): boolean => {
    return trackSampleResults.has(trackFileId);
  }, [trackSampleResults]);

  /**
   * Check if a track has an error
   */
  const hasError = useCallback((trackFileId: string): boolean => {
    return trackErrors.has(trackFileId);
  }, [trackErrors]);

  /**
   * Set sample result for a track
   * 
   * Caches the search result so we don't need to search again if the user
   * wants to replay the preview.
   */
  const setSampleResult = useCallback((trackFileId: string, result: SampleResult): void => {
    setTrackSampleResults(prev => {
      const newMap = new Map(prev);
      newMap.set(trackFileId, result);
      return newMap;
    });
    // Clear any previous error for this track
    setTrackErrors(prev => {
      const newMap = new Map(prev);
      newMap.delete(trackFileId);
      return newMap;
    });
  }, []);

  /**
   * Set error for a track
   */
  const setError = useCallback((trackFileId: string, error: string): void => {
    setTrackErrors(prev => {
      const newMap = new Map(prev);
      newMap.set(trackFileId, error);
      return newMap;
    });
  }, []);

  /**
   * Clear error for a track
   */
  const clearError = useCallback((trackFileId: string): void => {
    setTrackErrors(prev => {
      const newMap = new Map(prev);
      newMap.delete(trackFileId);
      return newMap;
    });
  }, []);

  /**
   * Set the currently playing track
   * 
   * Only one track can play at a time. Setting a new track will
   * automatically clear the previous playing track.
   */
  const setPlayingTrack = useCallback((trackFileId: string | null): void => {
    setPlayingTrackId(trackFileId);
  }, []);

  /**
   * Clear the currently playing track
   */
  const clearPlayingTrack = useCallback((): void => {
    setPlayingTrackId(null);
  }, []);

  /**
   * Set the currently searching track
   */
  const setSearchingTrack = useCallback((trackFileId: string | null): void => {
    setSearchingTrackId(trackFileId);
  }, []);

  /**
   * Clear all cached results and errors
   * 
   * Useful when the playlist changes or component unmounts.
   */
  const clearAll = useCallback((): void => {
    setTrackSampleResults(new Map());
    setTrackErrors(new Map());
    setPlayingTrackId(null);
    setSearchingTrackId(null);
  }, []);

  return {
    playingTrackId,
    searchingTrackId,
    getSampleResult,
    getError,
    hasSampleResult,
    hasError,
    setSampleResult,
    setError,
    clearError,
    setPlayingTrack,
    clearPlayingTrack,
    setSearchingTrack,
    clearAll,
  };
}

