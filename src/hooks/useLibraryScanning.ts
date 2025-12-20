/**
 * useLibraryScanning Hook
 * 
 * Manages library scanning state and logic, including progress tracking,
 * error handling, and scan result management.
 * 
 * @example
 * ```tsx
 * const {
 *   isScanning,
 *   scanResult,
 *   scanProgress,
 *   error,
 *   handleScan,
 *   handleRescan,
 *   clearError,
 * } = useLibraryScanning({
 *   libraryRoot,
 *   permissionStatus,
 *   onScanComplete,
 * });
 * ```
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { LibraryRoot } from "@/lib/library-selection";
import type { ScanResult, ScanProgressCallback } from "@/features/library";
import { scanLibraryWithPersistence } from "@/features/library/scanning-persist";
import { logger } from "@/lib/logger";

export interface UseLibraryScanningOptions {
  /** The library root to scan */
  libraryRoot: LibraryRoot | null;
  /** Permission status for accessing the library */
  permissionStatus: "granted" | "denied" | "prompt" | null;
  /** Callback when scan completes */
  onScanComplete?: () => void;
}

export interface ScanProgress {
  found: number;
  scanned: number;
  currentFile?: string;
}

export interface UseLibraryScanningReturn {
  /** Whether a scan is currently in progress */
  isScanning: boolean;
  /** The result of the scan */
  scanResult: ScanResult | null;
  /** Current scan progress */
  scanProgress: ScanProgress | null;
  /** Current error message, if any */
  error: string | null;
  /** Library root ID from the scan result */
  libraryRootId: string | null;
  /** Scan run ID from the scan result */
  scanRunId: string | null;
  /** Start a new scan */
  handleScan: () => Promise<void>;
  /** Rescan the library (clears previous result first) */
  handleRescan: () => Promise<void>;
  /** Clear the current error */
  clearError: () => void;
  /** Clear the scan result */
  clearScanResult: () => void;
}

/**
 * Hook for managing library scanning
 */
export function useLibraryScanning(
  options: UseLibraryScanningOptions
): UseLibraryScanningReturn {
  const { libraryRoot, permissionStatus, onScanComplete } = options;

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryRootId, setLibraryRootId] = useState<string | null>(null);
  const [scanRunId, setScanRunId] = useState<string | null>(null);

  // Use ref for callback to avoid recreating handleScan when callback changes
  const onScanCompleteRef = useRef(onScanComplete);
  useEffect(() => {
    onScanCompleteRef.current = onScanComplete;
  }, [onScanComplete]);

  /**
   * Start scanning the library
   */
  const handleScan = useCallback(async () => {
    if (!libraryRoot || permissionStatus !== "granted") {
      return;
    }

    setIsScanning(true);
    setError(null);
    setScanProgress({ found: 0, scanned: 0 });

    const onProgress: ScanProgressCallback = (progress) => {
      setScanProgress(progress);
    };

    try {
      let result: ScanResult;
      let rootId: string;

      if (libraryRoot.mode === "handle") {
        const scanResult = await scanLibraryWithPersistence(libraryRoot, onProgress);
        result = scanResult.result;
        rootId = scanResult.libraryRoot.id;
        setLibraryRootId(rootId);

        // Get scan run ID
        const { getScanRuns } = await import("@/db/storage");
        const runs = await getScanRuns(rootId);
        if (runs.length > 0) {
          setScanRunId(runs[runs.length - 1].id);
        }
      } else {
        // Fallback mode requires file list - this shouldn't happen in normal flow
        throw new Error(
          "Fallback mode scanning requires file list. Please re-select your folder."
        );
      }

      setScanResult(result);
      onScanCompleteRef.current?.();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to scan library";
      setError(errorMessage);
      logger.error("Scan error:", err);
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  }, [libraryRoot, permissionStatus]); // Removed onScanComplete dependency - using ref instead

  /**
   * Rescan the library (clears previous result first)
   */
  const handleRescan = useCallback(async () => {
    setScanResult(null);
    setError(null);
    await handleScan();
  }, [handleScan]);

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear the scan result
   */
  const clearScanResult = useCallback(() => {
    setScanResult(null);
    setError(null);
  }, []);

  return {
    isScanning,
    scanResult,
    scanProgress,
    error,
    libraryRootId,
    scanRunId,
    handleScan,
    handleRescan,
    clearError,
    clearScanResult,
  };
}

