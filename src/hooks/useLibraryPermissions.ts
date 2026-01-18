/**
 * useLibraryPermissions Hook
 * 
 * Manages library permission checking and status tracking.
 * Handles requesting permissions and tracking permission state.
 * 
 * @example
 * ```tsx
 * const {
 *   permissionStatus,
 *   checkPermission,
 * } = useLibraryPermissions({
 *   libraryRoot,
 *   onPermissionStatus,
 * });
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { LibraryRoot, PermissionStatus } from "@/lib/library-selection";
import { checkLibraryPermission, requestLibraryPermission } from "@/lib/library-selection";
import { getDirectoryHandle } from "@/lib/library-selection-fs-api";
import { logger } from "@/lib/logger";

export interface UseLibraryPermissionsOptions {
  /** The library root to check permissions for */
  libraryRoot: LibraryRoot | null;
  /** Callback when permission status changes */
  onPermissionStatus?: (status: PermissionStatus) => void;
  /** Whether to check permission automatically when root changes */
  autoCheck?: boolean;
}

export interface UseLibraryPermissionsReturn {
  /** Current permission status */
  permissionStatus: PermissionStatus | null;
  /** Check permission for the current library root (without requesting) */
  checkPermission: () => Promise<void>;
  /** Request permission for the current library root (requires user activation) */
  requestPermission: () => Promise<void>;
}

/**
 * Hook for managing library permissions
 */
export function useLibraryPermissions(
  options: UseLibraryPermissionsOptions
): UseLibraryPermissionsReturn {
  const { libraryRoot, onPermissionStatus, autoCheck = true } = options;

  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);
  
  // Cache the handle to avoid async retrieval on button click (preserves user activation)
  const handleCacheRef = useRef<FileSystemDirectoryHandle | null>(null);
  const handleIdRef = useRef<string | null>(null);

  /**
   * Check permission for the current library root (without requesting)
   * This is safe to call automatically as it doesn't require user activation.
   * Also caches the handle for faster permission requests.
   */
  const checkPermission = useCallback(async () => {
    if (!libraryRoot) return;

    try {
      // Use checkLibraryPermission instead of requestLibraryPermission
      // to avoid requiring user activation
      const status = await checkLibraryPermission(libraryRoot);
      setPermissionStatus(status);
      onPermissionStatus?.(status);
      
      // Cache the handle for faster permission requests (preserves user activation)
      if (libraryRoot.mode === "handle" && libraryRoot.handleId) {
        try {
          const handle = await getDirectoryHandle(libraryRoot.handleId);
          if (handle) {
            handleCacheRef.current = handle;
            handleIdRef.current = libraryRoot.handleId;
            logger.debug("Cached directory handle for faster permission requests");
          }
        } catch (err) {
          // Failed to cache handle - not critical, just log
          logger.debug("Failed to cache handle:", err);
        }
      }
    } catch (err) {
      logger.error("Failed to check permission:", err);
      setPermissionStatus("denied");
      onPermissionStatus?.("denied");
    }
  }, [libraryRoot, onPermissionStatus]);

  /**
   * Request permission for the current library root
   * This requires user activation and should only be called in response to user action.
   * 
   * IMPORTANT: This must be called synchronously from a user event handler to preserve
   * user activation context. We cache the handle to avoid async retrieval on click.
   */
  const requestPermission = useCallback(async () => {
    if (!libraryRoot || libraryRoot.mode !== "handle") {
      logger.warn("Cannot request permission: no library root or not in handle mode");
      return;
    }

    const handleId = libraryRoot.handleId;
    if (!handleId) {
      logger.warn("Cannot request permission: no handleId");
      return;
    }

    logger.debug("requestPermission called for library root:", libraryRoot.name);
    
    try {
      // Try to use cached handle first to preserve user activation
      let handle = handleCacheRef.current;
      
      // If handle is not cached or handleId changed, get it (but this loses user activation)
      if (!handle || handleIdRef.current !== handleId) {
        logger.debug("Handle not cached, retrieving from IndexedDB (this may lose user activation)");
        handle = await getDirectoryHandle(handleId);
        if (handle) {
          handleCacheRef.current = handle;
          handleIdRef.current = handleId;
        }
      } else {
        logger.debug("Using cached handle (preserves user activation)");
      }
      
      if (!handle) {
        logger.warn("Directory handle not found");
        setPermissionStatus("prompt");
        onPermissionStatus?.("prompt");
        return;
      }

      // Check current status before requesting to detect if prompt was shown
      const statusBeforeRequest = await handle.queryPermission({ mode: "read" });
      logger.debug(`Status before request: ${statusBeforeRequest}`);
      
      // Call requestPermission immediately with cached handle
      // This should preserve user activation better
      logger.debug("Calling handle.requestPermission({ mode: 'read' }) with cached handle...");
      const newStatus = await handle.requestPermission({ mode: "read" });
      logger.debug(`Permission request completed. Result: ${newStatus}`);
      
      // If status didn't change from "prompt" to something else, the browser likely didn't show a prompt
      // This happens when the handle is stale or browser won't re-prompt
      if (statusBeforeRequest === "prompt" && newStatus === "prompt") {
        logger.warn("Permission request returned 'prompt' without change - browser did not show prompt.");
        logger.warn("This usually means the handle is stale or browser won't re-prompt. User needs to re-select folder.");
        // The UI will show a message suggesting re-selection
      }
      
      setPermissionStatus(newStatus);
      onPermissionStatus?.(newStatus);
    } catch (err) {
      logger.error("Failed to request permission:", err);
      setPermissionStatus("denied");
      onPermissionStatus?.("denied");
    }
  }, [libraryRoot, onPermissionStatus]);

  // Auto-check permission when root changes (without requesting)
  useEffect(() => {
    if (autoCheck && libraryRoot) {
      checkPermission();
    }
  }, [autoCheck, libraryRoot, checkPermission]);

  return {
    permissionStatus,
    checkPermission,
    requestPermission,
  };
}

