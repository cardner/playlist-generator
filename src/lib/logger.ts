/**
 * Logger utility for consistent error and debug logging
 * 
 * Provides a centralized logging interface that gates debug/info logs
 * based on environment (development vs production).
 * 
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   
 *   // Errors are always logged
 *   logger.error('Something went wrong', error);
 *   
 *   // Warnings and info only in development
 *   logger.warn('This is a warning');
 *   logger.info('Debug information');
 */

/**
 * Logger interface for consistent logging across the application
 */
export const logger = {
  /**
   * Log an error message
   * Errors are always logged, even in production
   * 
   * @param message Error message
   * @param args Additional arguments (error objects, context, etc.)
   */
  error: (message: string, ...args: any[]): void => {
    // Always log errors - they're important for debugging production issues
    console.error(message, ...args);
    // TODO: Could integrate with error tracking service here (e.g., Sentry)
  },

  /**
   * Log a warning message
   * Warnings are only logged in development mode
   * 
   * @param message Warning message
   * @param args Additional arguments
   */
  warn: (message: string, ...args: any[]): void => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(message, ...args);
    }
  },

  /**
   * Log an info/debug message
   * Info messages are only logged in development mode
   * 
   * @param message Info message
   * @param args Additional arguments
   */
  info: (message: string, ...args: any[]): void => {
    if (process.env.NODE_ENV === 'development') {
      console.log(message, ...args);
    }
  },

  /**
   * Log a debug message (alias for info)
   * Debug messages are only logged in development mode
   * 
   * @param message Debug message
   * @param args Additional arguments
   */
  debug: (message: string, ...args: any[]): void => {
    if (process.env.NODE_ENV === 'development') {
      console.log(message, ...args);
    }
  },
};

