/**
 * Playlist Error Utilities
 * 
 * Standardized error handling and types for playlist-related operations.
 * Provides error classes, error checking utilities, and user-friendly error messages.
 * 
 * @example
 * ```tsx
 * import { PlaylistError, isGenerationError, getGenerationErrorMessage } from '@/features/playlists/errors';
 * 
 * try {
 *   await generatePlaylist(request);
 * } catch (error) {
 *   if (isGenerationError(error)) {
 *     const message = getGenerationErrorMessage(error);
 *     logger.error(message);
 *   }
 * }
 * ```
 */

import { logger } from "@/lib/logger";

/**
 * Error types for playlist operations
 */
export enum PlaylistErrorType {
  /** Playlist generation errors */
  GENERATION = "generation",
  /** Validation errors */
  VALIDATION = "validation",
  /** Strategy generation errors */
  STRATEGY = "strategy",
  /** Matching algorithm errors */
  MATCHING = "matching",
  /** Export errors */
  EXPORT = "export",
  /** Unknown or generic errors */
  UNKNOWN = "unknown",
}

/**
 * Base error class for playlist operations
 */
export class PlaylistError extends Error {
  constructor(
    public readonly type: PlaylistErrorType,
    message: string,
    public readonly originalError?: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PlaylistError";
    Object.setPrototypeOf(this, PlaylistError.prototype);
  }
}

/**
 * Playlist generation error
 */
export class GenerationError extends PlaylistError {
  constructor(
    message: string,
    public readonly requestId?: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(PlaylistErrorType.GENERATION, message, originalError, context);
    this.name = "GenerationError";
    Object.setPrototypeOf(this, GenerationError.prototype);
  }
}

/**
 * Playlist validation error
 */
export class ValidationError extends PlaylistError {
  constructor(
    message: string,
    public readonly validationErrors?: Record<string, string>,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(PlaylistErrorType.VALIDATION, message, originalError, context);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Strategy generation error
 */
export class StrategyError extends PlaylistError {
  constructor(
    message: string,
    public readonly fallbackUsed?: boolean,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(PlaylistErrorType.STRATEGY, message, originalError, context);
    this.name = "StrategyError";
    Object.setPrototypeOf(this, StrategyError.prototype);
  }
}

/**
 * Matching algorithm error
 */
export class MatchingError extends PlaylistError {
  constructor(
    message: string,
    public readonly trackCount?: number,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(PlaylistErrorType.MATCHING, message, originalError, context);
    this.name = "MatchingError";
    Object.setPrototypeOf(this, MatchingError.prototype);
  }
}

/**
 * Export error
 */
export class ExportError extends PlaylistError {
  constructor(
    message: string,
    public readonly format?: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(PlaylistErrorType.EXPORT, message, originalError, context);
    this.name = "ExportError";
    Object.setPrototypeOf(this, ExportError.prototype);
  }
}

/**
 * Type guard to check if an error is a PlaylistError
 */
export function isPlaylistError(error: unknown): error is PlaylistError {
  return error instanceof PlaylistError;
}

/**
 * Type guard to check if an error is a GenerationError
 */
export function isGenerationError(error: unknown): error is GenerationError {
  return error instanceof GenerationError;
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if an error is a StrategyError
 */
export function isStrategyError(error: unknown): error is StrategyError {
  return error instanceof StrategyError;
}

/**
 * Type guard to check if an error is a MatchingError
 */
export function isMatchingError(error: unknown): error is MatchingError {
  return error instanceof MatchingError;
}

/**
 * Type guard to check if an error is an ExportError
 */
export function isExportError(error: unknown): error is ExportError {
  return error instanceof ExportError;
}

/**
 * Get user-friendly error message for generation errors
 */
export function getGenerationErrorMessage(error: unknown): string {
  if (isGenerationError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("no tracks") || message.includes("empty")) {
      return "No tracks found in your library. Please scan your library first.";
    }
    
    if (message.includes("timeout") || message.includes("timed out")) {
      return "Playlist generation timed out. Please try again with fewer constraints.";
    }
    
    if (message.includes("llm") || message.includes("api")) {
      return "AI service error. Using fallback generation method.";
    }
    
    if (message.includes("quota") || message.includes("storage")) {
      return "Storage quota exceeded. Please free up space and try again.";
    }
  }

  return "Failed to generate playlist. Please try again.";
}

/**
 * Get user-friendly error message for validation errors
 */
export function getValidationErrorMessage(error: unknown): string {
  if (isValidationError(error)) {
    if (error.validationErrors) {
      const errors = Object.values(error.validationErrors);
      if (errors.length > 0) {
        return errors.join(". ");
      }
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("invalid") || message.includes("validation")) {
      return "Invalid playlist request. Please check your settings.";
    }
    
    if (message.includes("required") || message.includes("missing")) {
      return "Required fields are missing. Please fill in all required fields.";
    }
  }

  return "Playlist validation failed. Please check your settings.";
}

/**
 * Get user-friendly error message for strategy errors
 */
export function getStrategyErrorMessage(error: unknown): string {
  if (isStrategyError(error)) {
    if (error.fallbackUsed) {
      return "AI strategy generation failed. Using fallback strategy.";
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("llm") || message.includes("api") || message.includes("openai") || message.includes("gemini")) {
      return "AI service error. Using fallback strategy.";
    }
    
    if (message.includes("timeout")) {
      return "Strategy generation timed out. Using fallback strategy.";
    }
  }

  return "Failed to generate playlist strategy. Using fallback.";
}

/**
 * Get user-friendly error message for matching errors
 */
export function getMatchingErrorMessage(error: unknown): string {
  if (isMatchingError(error)) {
    if (error.trackCount !== undefined && error.trackCount === 0) {
      return "No tracks matched your criteria. Please adjust your settings.";
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("no tracks") || message.includes("empty")) {
      return "No tracks matched your criteria. Please adjust your settings.";
    }
    
    if (message.includes("constraint") || message.includes("too strict")) {
      return "Your constraints are too strict. Please relax your requirements.";
    }
  }

  return "Failed to match tracks. Please try adjusting your settings.";
}

/**
 * Get user-friendly error message for export errors
 */
export function getExportErrorMessage(error: unknown): string {
  if (isExportError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("format") || message.includes("unsupported")) {
      return `Unsupported export format${error instanceof ExportError && error.format ? `: ${error.format}` : ""}.`;
    }
    
    if (message.includes("permission") || message.includes("access")) {
      return "Cannot access file system. Please check your browser permissions.";
    }
    
    if (message.includes("download") || message.includes("save")) {
      return "Failed to download playlist file. Please try again.";
    }
  }

  return "Failed to export playlist. Please try again.";
}

/**
 * Get user-friendly error message for any playlist error
 */
export function getPlaylistErrorMessage(error: unknown): string {
  if (isPlaylistError(error)) {
    switch (error.type) {
      case PlaylistErrorType.GENERATION:
        return getGenerationErrorMessage(error);
      case PlaylistErrorType.VALIDATION:
        return getValidationErrorMessage(error);
      case PlaylistErrorType.STRATEGY:
        return getStrategyErrorMessage(error);
      case PlaylistErrorType.MATCHING:
        return getMatchingErrorMessage(error);
      case PlaylistErrorType.EXPORT:
        return getExportErrorMessage(error);
      default:
        return error.message || "An unknown error occurred.";
    }
  }

  // Fallback for non-PlaylistError errors
  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown error occurred.";
}

/**
 * Wrap an error in a PlaylistError with appropriate type
 */
export function wrapPlaylistError(
  error: unknown,
  type: PlaylistErrorType,
  context?: Record<string, unknown>
): PlaylistError {
  if (isPlaylistError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  
  switch (type) {
    case PlaylistErrorType.GENERATION:
      return new GenerationError(message, undefined, error, context);
    case PlaylistErrorType.VALIDATION:
      return new ValidationError(message, undefined, error, context);
    case PlaylistErrorType.STRATEGY:
      return new StrategyError(message, false, error, context);
    case PlaylistErrorType.MATCHING:
      return new MatchingError(message, undefined, error, context);
    case PlaylistErrorType.EXPORT:
      return new ExportError(message, undefined, error, context);
    default:
      return new PlaylistError(PlaylistErrorType.UNKNOWN, message, error, context);
  }
}

/**
 * Log a playlist error with appropriate level and context
 */
export function logPlaylistError(
  error: unknown,
  operation: string,
  context?: Record<string, unknown>
): void {
  if (isPlaylistError(error)) {
    logger.error(`[${error.type}] ${operation}:`, error.message, {
      ...error.context,
      ...context,
      originalError: error.originalError,
    });
  } else {
    logger.error(`[Playlist] ${operation}:`, error, context);
  }
}

