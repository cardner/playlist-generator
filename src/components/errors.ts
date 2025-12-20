/**
 * Component Error Utilities
 * 
 * Standardized error handling and types for UI component operations.
 * Provides error classes, error checking utilities, and user-friendly error messages.
 * 
 * @example
 * ```tsx
 * import { ComponentError, isFormError, getFormErrorMessage } from '@/components/errors';
 * 
 * try {
 *   await submitForm(data);
 * } catch (error) {
 *   if (isFormError(error)) {
 *     const message = getFormErrorMessage(error);
 *     setError(message);
 *   }
 * }
 * ```
 */

import { logger } from "@/lib/logger";

/**
 * Error types for component operations
 */
export enum ComponentErrorType {
  /** Form validation errors */
  FORM = "form",
  /** File upload/selection errors */
  FILE = "file",
  /** Network/API errors */
  NETWORK = "network",
  /** State management errors */
  STATE = "state",
  /** Unknown or generic errors */
  UNKNOWN = "unknown",
}

/**
 * Base error class for component operations
 */
export class ComponentError extends Error {
  constructor(
    public readonly type: ComponentErrorType,
    message: string,
    public readonly originalError?: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ComponentError";
    Object.setPrototypeOf(this, ComponentError.prototype);
  }
}

/**
 * Form validation error
 */
export class FormError extends ComponentError {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(ComponentErrorType.FORM, message, originalError, context);
    this.name = "FormError";
    Object.setPrototypeOf(this, FormError.prototype);
  }
}

/**
 * File operation error
 */
export class FileError extends ComponentError {
  constructor(
    message: string,
    public readonly fileName?: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(ComponentErrorType.FILE, message, originalError, context);
    this.name = "FileError";
    Object.setPrototypeOf(this, FileError.prototype);
  }
}

/**
 * Network/API error
 */
export class NetworkError extends ComponentError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(ComponentErrorType.NETWORK, message, originalError, context);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * State management error
 */
export class StateError extends ComponentError {
  constructor(
    message: string,
    public readonly stateKey?: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(ComponentErrorType.STATE, message, originalError, context);
    this.name = "StateError";
    Object.setPrototypeOf(this, StateError.prototype);
  }
}

/**
 * Type guard to check if an error is a ComponentError
 */
export function isComponentError(error: unknown): error is ComponentError {
  return error instanceof ComponentError;
}

/**
 * Type guard to check if an error is a FormError
 */
export function isFormError(error: unknown): error is FormError {
  return error instanceof FormError;
}

/**
 * Type guard to check if an error is a FileError
 */
export function isFileError(error: unknown): error is FileError {
  return error instanceof FileError;
}

/**
 * Type guard to check if an error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Type guard to check if an error is a StateError
 */
export function isStateError(error: unknown): error is StateError {
  return error instanceof StateError;
}

/**
 * Get user-friendly error message for form errors
 */
export function getFormErrorMessage(error: unknown): string {
  if (isFormError(error)) {
    if (error.fieldErrors) {
      const errors = Object.values(error.fieldErrors);
      if (errors.length > 0) {
        return errors.join(". ");
      }
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("required") || message.includes("missing")) {
      return "Please fill in all required fields.";
    }
    
    if (message.includes("invalid") || message.includes("format")) {
      return "Invalid input format. Please check your entries.";
    }
    
    if (message.includes("validation")) {
      return "Form validation failed. Please check your entries.";
    }
  }

  return "Form error. Please check your entries and try again.";
}

/**
 * Get user-friendly error message for file errors
 */
export function getFileErrorMessage(error: unknown): string {
  if (isFileError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("permission") || message.includes("access")) {
      return "Cannot access file. Please check your browser permissions.";
    }
    
    if (message.includes("not found") || message.includes("missing")) {
      return "File not found. Please select a valid file.";
    }
    
    if (message.includes("too large") || message.includes("size")) {
      return "File is too large. Please select a smaller file.";
    }
    
    if (message.includes("format") || message.includes("unsupported")) {
      return "Unsupported file format. Please select a supported file type.";
    }
  }

  return "File error. Please try selecting the file again.";
}

/**
 * Get user-friendly error message for network errors
 */
export function getNetworkErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "Authentication failed. Please check your API keys.";
    }
    if (error.statusCode === 429) {
      return "Rate limit exceeded. Please try again later.";
    }
    if (error.statusCode === 500 || error.statusCode === 502 || error.statusCode === 503) {
      return "Server error. Please try again later.";
    }
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("network") || message.includes("fetch") || message.includes("connection")) {
      return "Network error. Please check your internet connection.";
    }
    
    if (message.includes("timeout")) {
      return "Request timed out. Please try again.";
    }
    
    if (message.includes("cors")) {
      return "Cross-origin request blocked. Please check your configuration.";
    }
  }

  return "Network error. Please try again.";
}

/**
 * Get user-friendly error message for state errors
 */
export function getStateErrorMessage(error: unknown): string {
  if (isStateError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("state") || message.includes("update")) {
      return "State update failed. Please refresh the page.";
    }
    
    if (message.includes("storage") || message.includes("localstorage")) {
      return "Storage error. Please check your browser settings.";
    }
  }

  return "State error. Please refresh the page.";
}

/**
 * Get user-friendly error message for any component error
 */
export function getComponentErrorMessage(error: unknown): string {
  if (isComponentError(error)) {
    switch (error.type) {
      case ComponentErrorType.FORM:
        return getFormErrorMessage(error);
      case ComponentErrorType.FILE:
        return getFileErrorMessage(error);
      case ComponentErrorType.NETWORK:
        return getNetworkErrorMessage(error);
      case ComponentErrorType.STATE:
        return getStateErrorMessage(error);
      default:
        return error.message || "An unknown error occurred.";
    }
  }

  // Fallback for non-ComponentError errors
  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown error occurred.";
}

/**
 * Wrap an error in a ComponentError with appropriate type
 */
export function wrapComponentError(
  error: unknown,
  type: ComponentErrorType,
  context?: Record<string, unknown>
): ComponentError {
  if (isComponentError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  
  switch (type) {
    case ComponentErrorType.FORM:
      return new FormError(message, undefined, error, context);
    case ComponentErrorType.FILE:
      return new FileError(message, undefined, error, context);
    case ComponentErrorType.NETWORK:
      return new NetworkError(message, undefined, error, context);
    case ComponentErrorType.STATE:
      return new StateError(message, undefined, error, context);
    default:
      return new ComponentError(ComponentErrorType.UNKNOWN, message, error, context);
  }
}

/**
 * Log a component error with appropriate level and context
 */
export function logComponentError(
  error: unknown,
  operation: string,
  context?: Record<string, unknown>
): void {
  if (isComponentError(error)) {
    logger.error(`[${error.type}] ${operation}:`, error.message, {
      ...error.context,
      ...context,
      originalError: error.originalError,
    });
  } else {
    logger.error(`[Component] ${operation}:`, error, context);
  }
}

