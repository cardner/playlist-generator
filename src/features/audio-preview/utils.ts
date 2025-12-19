/**
 * Audio preview utility functions
 * 
 * Provides helper functions for URL validation, error formatting, and audio element management.
 * These utilities are used across audio preview components to ensure consistent behavior.
 */

import type { SampleResult } from './types';

/**
 * Validate that a URL is a valid HTTP/HTTPS URL
 * 
 * This is used to ensure audio preview URLs are safe to use with HTML audio elements.
 * Only HTTP and HTTPS URLs are allowed - no data URLs, blob URLs, or file:// URLs.
 * 
 * @param url The URL to validate
 * @returns True if the URL is valid, false otherwise
 * 
 * @example
 * ```typescript
 * if (isValidPreviewUrl(sampleResult.url)) {
 *   audio.src = sampleResult.url;
 * }
 * ```
 */
export function isValidPreviewUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  
  // Must start with http:// or https://
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Format a user-friendly error message for audio preview failures
 * 
 * Takes an error object or message and converts it to a user-friendly string.
 * Handles various error types (network errors, media errors, etc.) and provides
 * actionable messages.
 * 
 * @param error The error object or message
 * @param context Optional context about what operation failed (e.g., "loading preview", "playing audio")
 * @returns A user-friendly error message
 * 
 * @example
 * ```typescript
 * try {
 *   await audio.play();
 * } catch (error) {
 *   const message = formatAudioError(error, 'playing preview');
 *   onError?.(message);
 * }
 * ```
 */
export function formatAudioError(error: unknown, context?: string): string {
  const contextPrefix = context ? `${context}: ` : '';
  
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return `${contextPrefix}Network error. Please check your internet connection.`;
    }
    
    // Media errors
    if (error.message.includes('media') || error.message.includes('codec')) {
      return `${contextPrefix}Audio format not supported.`;
    }
    
    // Generic error with message
    return `${contextPrefix}${error.message}`;
  }
  
  // Fallback for unknown error types
  return contextPrefix + 'An unexpected error occurred.';
}

/**
 * Get a standardized error message for missing preview URLs
 * 
 * Used when a track doesn't have a preview available from the search API.
 * 
 * @param trackTitle Optional track title for context
 * @returns A user-friendly message indicating preview is not available
 */
export function getNoPreviewMessage(trackTitle?: string): string {
  if (trackTitle) {
    return `Preview not available for "${trackTitle}"`;
  }
  return 'Preview not available for this track';
}

/**
 * Check if an audio element is in a valid state for playback
 * 
 * Validates that an audio element exists and is ready to play.
 * Checks readyState to ensure media is loaded.
 * 
 * @param audio The audio element to check
 * @returns True if the audio element is ready, false otherwise
 */
export function isAudioReady(audio: HTMLAudioElement | null): boolean {
  if (!audio) {
    return false;
  }
  
  // readyState values:
  // 0 = HAVE_NOTHING
  // 1 = HAVE_METADATA
  // 2 = HAVE_CURRENT_DATA
  // 3 = HAVE_FUTURE_DATA
  // 4 = HAVE_ENOUGH_DATA
  return audio.readyState >= 2; // At least HAVE_CURRENT_DATA
}

/**
 * Reset an audio element to its initial state
 * 
 * Pauses playback, resets currentTime to 0, and clears any loading state.
 * Useful when switching between tracks or cleaning up.
 * 
 * @param audio The audio element to reset
 */
export function resetAudioElement(audio: HTMLAudioElement | null): void {
  if (!audio) {
    return;
  }
  
  audio.pause();
  audio.currentTime = 0;
  // Note: We don't clear src here as it might be needed for re-use
}

/**
 * Validate a SampleResult object has all required fields
 * 
 * Ensures that a SampleResult from the API has a valid URL and required fields.
 * Used before attempting to play a preview.
 * 
 * @param sampleResult The sample result to validate
 * @returns True if valid, false otherwise
 */
export function validateSampleResult(sampleResult: SampleResult | null): sampleResult is SampleResult {
  if (!sampleResult) {
    return false;
  }
  
  return isValidPreviewUrl(sampleResult.url) && 
         !!sampleResult.title && 
         !!sampleResult.artist;
}

