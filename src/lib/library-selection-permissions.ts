/**
 * Permission Management for Library Selection
 * 
 * This module handles permission checking and requesting for library
 * access, supporting both File System Access API and fallback modes.
 * 
 * @module lib/library-selection-permissions
 */

import { logger } from "./logger";
import type { LibraryRoot, PermissionStatus } from "./library-selection-types";
import { getDirectoryHandle } from "./library-selection-fs-api";

/**
 * Check permission for a library root (without requesting)
 * 
 * For handle mode: checks permission status using File System Access API.
 * For fallback mode: returns "prompt" if files need re-import, "granted" otherwise.
 * 
 * This function does NOT request permission - it only checks the current status.
 * Use `requestLibraryPermission` if you need to actually request permission.
 * 
 * @param root Library root to check permission for
 * @returns Promise resolving to permission status
 * 
 * @example
 * ```typescript
 * const status = await checkLibraryPermission(root);
 * if (status === "granted") {
 *   // Can access files
 * } else if (status === "prompt") {
 *   // Need to request permission
 * }
 * ```
 */
export async function checkLibraryPermission(
  root: LibraryRoot
): Promise<PermissionStatus> {
  if (root.mode === "handle") {
    // For handle mode, we need to retrieve the handle and check permission
    try {
      const handle = await getDirectoryHandle(root.handleId!);
      if (!handle) {
        return "prompt";
      }

      // Only check permission, don't request it
      const permissionStatus = await handle.queryPermission({ mode: "read" });
      return permissionStatus;
    } catch (error) {
      logger.error("Failed to check permission:", error);
      return "denied";
    }
  } else {
    // Fallback mode: permission is implicit (user selected files)
    // But we need to check if files are still available
    if (root.lastImportedAt) {
      // Files might not persist, so we consider it "prompt" (needs re-import)
      return "prompt";
    }
    return "granted";
  }
}

/**
 * Request permission for a library root
 * 
 * For handle mode: checks and requests permission using File System Access API.
 * For fallback mode: returns "prompt" if files need re-import, "granted" otherwise.
 * 
 * IMPORTANT: This function calls `requestPermission()` which requires user activation.
 * Only call this in response to a user action (e.g., button click).
 * 
 * @param root Library root to request permission for
 * @returns Promise resolving to permission status
 * 
 * @example
 * ```typescript
 * // Only call this in response to user action
 * const status = await requestLibraryPermission(root);
 * if (status === "granted") {
 *   // Can access files
 * } else if (status === "prompt") {
 *   // Need to request permission or re-import
 * } else {
 *   // Permission denied
 * }
 * ```
 */
export async function requestLibraryPermission(
  root: LibraryRoot
): Promise<PermissionStatus> {
  if (root.mode === "handle") {
    // For handle mode, we need to retrieve the handle and request permission
    try {
      const handleId = root.handleId;
      if (!handleId) {
        logger.warn("No handleId found in library root, cannot request permission");
        return "prompt";
      }

      logger.debug(`Attempting to retrieve handle with ID: ${handleId}`);
      const handle = await getDirectoryHandle(handleId);
      if (!handle) {
        logger.warn(`Directory handle not found for handleId: ${handleId}`);
        return "prompt";
      }

      // IMPORTANT: Call requestPermission() immediately after getting the handle
      // to minimize async operations that could lose user activation.
      // We'll check status after requesting, not before, to preserve user activation.
      try {
        logger.debug("Calling handle.requestPermission({ mode: 'read' }) immediately...");
        logger.debug("This should show the browser permission prompt if user activation is still valid");
        
        // Call requestPermission() directly - this should show the browser prompt
        // The promise resolves when user interacts with prompt or if no prompt is shown
        const newStatus = await handle.requestPermission({ mode: "read" });
        logger.debug(`Permission request completed. Result: ${newStatus}`);
        
        return newStatus;
      } catch (error) {
        // If requestPermission fails, log the error and check current status as fallback
        const err = error as Error;
        logger.error("requestPermission threw an error:", err);
        logger.error("Error name:", err.name);
        logger.error("Error message:", err.message);
        
        // Check if it's a specific error type indicating user activation was lost
        if (err.name === "NotAllowedError" || err.message?.includes("user activation")) {
          logger.error("User activation was lost. This can happen if too many async operations occurred before calling requestPermission.");
        }
        
        // Fallback: check current status
        try {
          const currentStatus = await handle.queryPermission({ mode: "read" });
          logger.debug(`Fallback: Current permission status is ${currentStatus}`);
          return currentStatus;
        } catch (queryError) {
          logger.error("Failed to query permission after request failed:", queryError);
          return "denied";
        }
      }
    } catch (error) {
      logger.error("Failed to request permission:", error);
      return "denied";
    }
  } else {
    // Fallback mode: permission is implicit (user selected files)
    // But we need to check if files are still available
    if (root.lastImportedAt) {
      // Files might not persist, so we consider it "prompt" (needs re-import)
      return "prompt";
    }
    return "granted";
  }
}

/**
 * Request write permission for a library root
 *
 * IMPORTANT: This must be called in response to a user action.
 */
export async function requestLibraryWritePermission(
  root: LibraryRoot
): Promise<PermissionStatus> {
  if (root.mode !== "handle") {
    return "denied";
  }

  try {
    const handleId = root.handleId;
    if (!handleId) {
      logger.warn("No handleId found in library root, cannot request write permission");
      return "prompt";
    }
    const handle = await getDirectoryHandle(handleId);
    if (!handle) {
      logger.warn(`Directory handle not found for handleId: ${handleId}`);
      return "prompt";
    }

    const newStatus = await handle.requestPermission({ mode: "readwrite" });
    return newStatus;
  } catch (error) {
    logger.error("Failed to request write permission:", error);
    return "denied";
  }
}

