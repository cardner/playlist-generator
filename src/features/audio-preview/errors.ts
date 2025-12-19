/**
 * Error handling utilities for audio preview feature
 * 
 * Provides standardized error types and handling for audio preview operations.
 * Integrates with the logger utility for consistent error reporting.
 */

import { logger } from '@/lib/logger';
import { formatAudioError, getNoPreviewMessage } from './utils';

/**
 * Error types for audio preview operations
 */
export enum AudioPreviewErrorType {
  /** Invalid or missing preview URL */
  INVALID_URL = 'INVALID_URL',
  /** Network error when fetching preview */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Audio format not supported */
  FORMAT_ERROR = 'FORMAT_ERROR',
  /** Preview not available for this track */
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  /** Playback failed (autoplay blocked, etc.) */
  PLAYBACK_ERROR = 'PLAYBACK_ERROR',
  /** Unknown/unexpected error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Audio preview error class
 * 
 * Provides structured error information for audio preview failures.
 * Includes error type, user-friendly message, and original error.
 */
export class AudioPreviewError extends Error {
  constructor(
    public readonly type: AudioPreviewErrorType,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'AudioPreviewError';
  }
}

/**
 * Create an AudioPreviewError from various error sources
 * 
 * Converts errors from different sources (network, media, API) into
 * standardized AudioPreviewError instances with appropriate types.
 * 
 * @param error The original error
 * @param context Optional context about the operation
 * @returns An AudioPreviewError instance
 */
export function createAudioPreviewError(
  error: unknown,
  context?: string
): AudioPreviewError {
  const message = formatAudioError(error, context);
  
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return new AudioPreviewError(AudioPreviewErrorType.NETWORK_ERROR, message, error);
    }
    
    // Media/codec errors
    if (error.message.includes('media') || error.message.includes('codec')) {
      return new AudioPreviewError(AudioPreviewErrorType.FORMAT_ERROR, message, error);
    }
    
    // Playback errors (autoplay blocked, etc.)
    if (error.message.includes('play') || error.message.includes('autoplay')) {
      return new AudioPreviewError(AudioPreviewErrorType.PLAYBACK_ERROR, message, error);
    }
  }
  
  // Unknown error
  return new AudioPreviewError(AudioPreviewErrorType.UNKNOWN, message, error);
}

/**
 * Handle and log an audio preview error
 * 
 * Logs the error using the logger utility and returns a user-friendly message.
 * This is the main entry point for error handling in audio preview components.
 * 
 * @param error The error to handle
 * @param context Optional context about what operation failed
 * @returns A user-friendly error message for display
 * 
 * @example
 * ```typescript
 * try {
 *   await audio.play();
 * } catch (error) {
 *   const message = handleAudioPreviewError(error, 'playing preview');
 *   setError(message);
 * }
 * ```
 */
export function handleAudioPreviewError(
  error: unknown,
  context?: string
): string {
  const audioError = createAudioPreviewError(error, context);
  
  // Log the error (always logged, even in production)
  logger.error(`[AudioPreview] ${audioError.type}:`, {
    message: audioError.message,
    originalError: audioError.originalError,
    context,
  });
  
  return audioError.message;
}

/**
 * Create an error for when preview is not available
 * 
 * Used when the search API returns null (no preview found).
 * This is not a real error, but we need to inform the user.
 * 
 * @param trackTitle Optional track title for context
 * @returns A user-friendly message
 */
export function createNoPreviewError(trackTitle?: string): string {
  return getNoPreviewMessage(trackTitle);
}

/**
 * Check if an error is a network error
 * 
 * Useful for retry logic or showing specific network error messages.
 * 
 * @param error The error to check
 * @returns True if it's a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof AudioPreviewError) {
    return error.type === AudioPreviewErrorType.NETWORK_ERROR;
  }
  
  if (error instanceof Error) {
    return error.message.includes('network') || error.message.includes('fetch');
  }
  
  return false;
}

/**
 * Check if an error is a playback error (e.g., autoplay blocked)
 * 
 * Useful for showing specific messages about browser autoplay restrictions.
 * 
 * @param error The error to check
 * @returns True if it's a playback error
 */
export function isPlaybackError(error: unknown): boolean {
  if (error instanceof AudioPreviewError) {
    return error.type === AudioPreviewErrorType.PLAYBACK_ERROR;
  }
  
  if (error instanceof Error) {
    return error.message.includes('play') || error.message.includes('autoplay');
  }
  
  return false;
}

