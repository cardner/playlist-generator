/**
 * Feature Detection Utilities
 * 
 * This module provides functions to detect browser capabilities and API support.
 * Useful for feature detection and graceful degradation when APIs are not available.
 * 
 * @module lib/feature-detection
 * 
 * @example
 * ```typescript
 * if (supportsFileSystemAccess()) {
 *   // Use File System Access API
 * } else {
 *   // Fall back to file input
 * }
 * ```
 */

/**
 * Checks if the browser supports the File System Access API
 * (available in Chromium-based browsers)
 * 
 * @returns true if File System Access API is supported
 */
export function supportsFileSystemAccess(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    "showDirectoryPicker" in window &&
    "showOpenFilePicker" in window &&
    typeof window.showDirectoryPicker === "function" &&
    typeof window.showOpenFilePicker === "function"
  );
}

/**
 * Checks if the browser supports IndexedDB
 * 
 * @returns true if IndexedDB is supported
 */
export function supportsIndexedDB(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return "indexedDB" in window && window.indexedDB !== null;
}

/**
 * Checks if the browser supports Cache Storage API
 * 
 * @returns true if Cache Storage API is supported
 */
export function supportsCacheStorage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return "caches" in window && typeof window.caches !== "undefined";
}

/**
 * Checks if the browser supports Web Workers
 * 
 * @returns true if Web Workers are supported
 */
export function supportsWebWorkers(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return typeof Worker !== "undefined";
}

