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

import { useState, useEffect, useCallback } from "react";
import type { LibraryRoot, PermissionStatus } from "@/lib/library-selection";
import { checkLibraryPermission, requestLibraryPermission } from "@/lib/library-selection";
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

  /**
   * Check permission for the current library root (without requesting)
   * This is safe to call automatically as it doesn't require user activation.
   */
  const checkPermission = useCallback(async () => {
    if (!libraryRoot) return;

    try {
      // Use checkLibraryPermission instead of requestLibraryPermission
      // to avoid requiring user activation
      const status = await checkLibraryPermission(libraryRoot);
      setPermissionStatus(status);
      onPermissionStatus?.(status);
    } catch (err) {
      logger.error("Failed to check permission:", err);
      setPermissionStatus("denied");
      onPermissionStatus?.("denied");
    }
  }, [libraryRoot, onPermissionStatus]);

  /**
   * Request permission for the current library root
   * This requires user activation and should only be called in response to user action.
   */
  const requestPermission = useCallback(async () => {
    if (!libraryRoot) return;

    try {
      const status = await requestLibraryPermission(libraryRoot);
      setPermissionStatus(status);
      onPermissionStatus?.(status);
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

