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
 * Request permission for a library root
 * 
 * For handle mode: checks and requests permission using File System Access API.
 * For fallback mode: returns "prompt" if files need re-import, "granted" otherwise.
 * 
 * @param root Library root to request permission for
 * @returns Promise resolving to permission status
 * 
 * @example
 * ```typescript
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
        // Request permission
        const newStatus = await handle.requestPermission({ mode: "read" });
        return newStatus;
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

