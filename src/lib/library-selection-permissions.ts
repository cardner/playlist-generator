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
    // For handle mode, we need to retrieve the handle and check permission
    try {
      const handle = await getDirectoryHandle(root.handleId!);
      if (!handle) {
        return "prompt";
      }

      // Check if we still have permission
      const permissionStatus = await handle.queryPermission({ mode: "read" });

      if (permissionStatus === "prompt") {
        // Request permission (requires user activation)
        try {
          const newStatus = await handle.requestPermission({ mode: "read" });
          return newStatus;
        } catch (error) {
          // If requestPermission fails (e.g., no user activation), return current status
          logger.error("Failed to request permission:", error);
          return permissionStatus; // Return the current status, don't throw
        }
      }

      return permissionStatus;
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

