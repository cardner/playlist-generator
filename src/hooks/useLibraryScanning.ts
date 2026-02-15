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
import { NetworkDriveDisconnectedError, isNetworkDriveDisconnectedError } from "@/features/library/network-drive-errors";
import { ReconnectionMonitor } from "@/features/library/reconnection-monitor";
import { getDirectoryHandle } from "@/lib/library-selection-fs-api";
import { deleteCheckpoint } from "@/db/storage-scan-checkpoints";
import { logger } from "@/lib/logger";

export interface UseLibraryScanningOptions {
  /** The library root to scan */
  libraryRoot: LibraryRoot | null;
  /** Permission status for accessing the library */
  permissionStatus: "granted" | "denied" | "prompt" | null;
  /** Callback when scan completes */
  onScanComplete?: () => void;
  /** When rescanning, the existing collection id to update (avoids creating a duplicate) */
  existingCollectionId?: string | null;
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
  /** Whether reconnection monitoring is active */
  isMonitoringReconnection: boolean;
  /** ID of the interrupted scan run (if any) */
  interruptedScanRunId: string | null;
  /** Start a new scan */
  handleScan: () => Promise<void>;
  /** Resume an interrupted scan */
  handleResumeScan: (scanRunId: string) => Promise<void>;
  /** Rescan the library (clears previous result first) */
  handleRescan: () => Promise<void>;
  /** Clear the current error */
  clearError: () => void;
  /** Clear the scan result */
  clearScanResult: () => void;
  /** Cancel reconnection monitoring */
  cancelReconnectionMonitoring: () => void;
  /** Pause an in-progress scan */
  pauseScan: () => void;
  /** Stop an in-progress scan */
  stopScan: () => void;
}

/**
 * Hook for managing library scanning
 */
export function useLibraryScanning(
  options: UseLibraryScanningOptions
): UseLibraryScanningReturn {
  const { libraryRoot, permissionStatus, onScanComplete, existingCollectionId } = options;

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryRootId, setLibraryRootId] = useState<string | null>(null);
  const [scanRunId, setScanRunId] = useState<string | null>(null);
  const [isMonitoringReconnection, setIsMonitoringReconnection] = useState(false);
  const [interruptedScanRunId, setInterruptedScanRunId] = useState<string | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const scanCancelModeRef = useRef<"pause" | "stop" | null>(null);

  // Use ref for callback to avoid recreating handleScan when callback changes
  const onScanCompleteRef = useRef(onScanComplete);
  useEffect(() => {
    onScanCompleteRef.current = onScanComplete;
  }, [onScanComplete]);

  // Store reconnection monitor instance
  const reconnectionMonitorRef = useRef<ReconnectionMonitor | null>(null);
  
  // Store handleResumeScan ref to avoid circular dependency
  const handleResumeScanRef = useRef<((scanRunId: string) => Promise<void>) | null>(null);

  const cancelScan = useCallback(
    async (mode: "pause" | "stop") => {
      if (!scanAbortControllerRef.current) {
        return;
      }
      scanCancelModeRef.current = mode;
      scanAbortControllerRef.current.abort();
      if (mode === "stop" && scanRunId) {
        try {
          await deleteCheckpoint(scanRunId);
        } catch (error) {
          logger.warn("Failed to delete scan checkpoint after stop", error);
        }
      }
    },
    [scanRunId]
  );

  const pauseScan = useCallback(() => {
    void cancelScan("pause");
  }, [cancelScan]);

  const stopScan = useCallback(() => {
    void cancelScan("stop");
  }, [cancelScan]);

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
    scanCancelModeRef.current = null;
    const abortController = new AbortController();
    scanAbortControllerRef.current = abortController;

    const onProgress: ScanProgressCallback = (progress) => {
      setScanProgress(progress);
    };

    try {
      let result: ScanResult;
      let rootId: string;

      if (libraryRoot.mode === "handle") {
        const scanResult = await scanLibraryWithPersistence(
          libraryRoot,
          onProgress,
          undefined,
          {
            signal: abortController.signal,
            onScanRunCreated: (id) => setScanRunId(id),
            ...(existingCollectionId != null && existingCollectionId !== ""
              ? { existingLibraryRootId: existingCollectionId }
              : {}),
          }
        );
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
      setIsMonitoringReconnection(false);
      setInterruptedScanRunId(null);
      onScanCompleteRef.current?.();
    } catch (err) {
      // Handle network drive disconnection
      if (err instanceof DOMException && err.name === "AbortError") {
        setIsMonitoringReconnection(false);
        if (scanCancelModeRef.current === "pause") {
          setInterruptedScanRunId(scanRunId);
        } else if (scanCancelModeRef.current === "stop") {
          setInterruptedScanRunId(null);
          setScanResult(null);
          setScanRunId(null);
        }
      } else if (isNetworkDriveDisconnectedError(err)) {
        logger.warn("Network drive disconnected during scan", err);
        setInterruptedScanRunId(err.scanRunId);
        setIsMonitoringReconnection(true);
        
        // Start reconnection monitoring if we have a directory handle
        if (libraryRoot?.mode === "handle" && libraryRoot.handleId) {
          try {
            const directoryHandle = await getDirectoryHandle(libraryRoot.handleId);
            if (directoryHandle) {
              const monitor = new ReconnectionMonitor({
                directoryHandle,
                onReconnected: async () => {
                  // Auto-resume scan when reconnected
                  logger.info("Network drive reconnected, resuming scan");
                  setIsMonitoringReconnection(false);
                  if (handleResumeScanRef.current) {
                    await handleResumeScanRef.current(err.scanRunId);
                  }
                },
              });
              
              reconnectionMonitorRef.current = monitor;
              monitor.startMonitoring();
            }
          } catch (monitorError) {
            logger.error("Failed to start reconnection monitoring:", monitorError);
            setError(
              "Network drive disconnected. Please reconnect and manually resume the scan."
            );
            setIsMonitoringReconnection(false);
          }
        } else {
          setError(
            "Network drive disconnected. Please reconnect and manually resume the scan."
          );
          setIsMonitoringReconnection(false);
        }
      } else {
        // Handle other errors
        let errorMessage: string;
        
        if (err instanceof DOMException && err.name === "NotFoundError") {
          errorMessage =
            "Some files or directories on the network drive could not be accessed. " +
            "This is common with network drives. Please ensure the network drive is connected " +
            "and accessible. The scan will continue with accessible files.";
        } else if (err instanceof Error) {
          // Check if error message mentions network drive or NotFoundError
          if (
            err.message.includes("NotFoundError") ||
            err.message.includes("network drive") ||
            err.message.includes("could not be found")
          ) {
            errorMessage =
              "Some files or directories could not be accessed during scanning. " +
              "This may occur with network drives. Please ensure the network drive is connected " +
              "and accessible. The scan will continue with accessible files.";
          } else {
            errorMessage = err.message;
          }
        } else {
          errorMessage = "Failed to scan library";
        }
        
        setError(errorMessage);
        logger.error("Scan error:", err);
      }
    } finally {
      setIsScanning(false);
      setScanProgress(null);
      scanAbortControllerRef.current = null;
    }
  }, [libraryRoot, permissionStatus, scanRunId, existingCollectionId]); // Removed onScanComplete dependency - using ref instead

  /**
   * Resume an interrupted scan from a checkpoint
   */
  const handleResumeScan = useCallback(async (resumeScanRunId: string) => {
    if (!libraryRoot || permissionStatus !== "granted") {
      return;
    }

    // Validate directory handle before attempting resume
    if (libraryRoot.mode === "handle" && libraryRoot.handleId) {
      try {
        const directoryHandle = await getDirectoryHandle(libraryRoot.handleId);
        if (!directoryHandle) {
          setError(
            "Cannot resume scan: Directory handle is no longer valid. " +
            "Please re-select your library folder and start a new scan."
          );
          setIsScanning(false);
          setScanProgress(null);
          return;
        }
        
        // Test access to the directory handle
        try {
          await directoryHandle.getDirectoryHandle(".", { create: false });
        } catch (accessError) {
          if (accessError instanceof DOMException && accessError.name === "NotFoundError") {
            setError(
              "Cannot resume scan: Directory is no longer accessible. " +
              "This may occur if the network drive disconnected or the folder was moved. " +
              "Please re-select your library folder and start a new scan."
            );
            setIsScanning(false);
            setScanProgress(null);
            return;
          }
          throw accessError;
        }
      } catch (handleError) {
        logger.error("Failed to validate directory handle for resume:", handleError);
        setError(
          "Cannot resume scan: Directory handle is invalid. " +
          "Please re-select your library folder and start a new scan."
        );
        setIsScanning(false);
        setScanProgress(null);
        return;
      }
    }

    setIsScanning(true);
    setError(null);
    setScanProgress({ found: 0, scanned: 0 });
    setInterruptedScanRunId(null);
    scanCancelModeRef.current = null;
    const abortController = new AbortController();
    scanAbortControllerRef.current = abortController;

    const onProgress: ScanProgressCallback = (progress) => {
      setScanProgress(progress);
    };

    try {
      const scanResult = await scanLibraryWithPersistence(
        libraryRoot,
        onProgress,
        resumeScanRunId,
        {
          signal: abortController.signal,
          onScanRunCreated: (id) => setScanRunId(id),
          ...(existingCollectionId != null && existingCollectionId !== ""
            ? { existingLibraryRootId: existingCollectionId }
            : {}),
        }
      );
      const result = scanResult.result;
      const rootId = scanResult.libraryRoot.id;
      
      setScanResult(result);
      setLibraryRootId(rootId);
      setIsMonitoringReconnection(false);
      setInterruptedScanRunId(null);
      
      // Get scan run ID
      const { getScanRuns } = await import("@/db/storage");
      const runs = await getScanRuns(rootId);
      if (runs.length > 0) {
        setScanRunId(runs[runs.length - 1].id);
      }
      
      onScanCompleteRef.current?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (scanCancelModeRef.current === "pause") {
          setInterruptedScanRunId(resumeScanRunId);
        } else if (scanCancelModeRef.current === "stop") {
          setInterruptedScanRunId(null);
          setScanResult(null);
          setScanRunId(null);
        }
        return;
      }
      // Re-throw disconnection errors to trigger monitoring again
      if (isNetworkDriveDisconnectedError(err)) {
        throw err;
      }
      
      // Handle directory handle errors
      if (err instanceof DOMException && err.name === "NotFoundError") {
        setError(
          "Cannot resume scan: Directory is no longer accessible. " +
          "This may occur if the network drive disconnected or the folder was moved. " +
          "Please re-select your library folder and start a new scan."
        );
      } else {
        let errorMessage: string;
        if (err instanceof Error) {
          errorMessage = err.message;
        } else {
          errorMessage = "Failed to resume scan";
        }
        
        setError(errorMessage);
      }
      
      logger.error("Resume scan error:", err);
    } finally {
      setIsScanning(false);
      setScanProgress(null);
      scanAbortControllerRef.current = null;
    }
  }, [libraryRoot, permissionStatus, existingCollectionId]);

  /**
   * Rescan the library (clears previous result first)
   */
  const handleRescan = useCallback(async () => {
    setScanResult(null);
    setError(null);
    await handleScan();
  }, [handleScan]);

  /**
   * Cancel reconnection monitoring
   */
  const cancelReconnectionMonitoring = useCallback(() => {
    if (reconnectionMonitorRef.current) {
      reconnectionMonitorRef.current.stopMonitoring();
      reconnectionMonitorRef.current = null;
    }
    setIsMonitoringReconnection(false);
  }, []);

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

  // Cleanup reconnection monitor on unmount
  useEffect(() => {
    return () => {
      if (reconnectionMonitorRef.current) {
        reconnectionMonitorRef.current.stopMonitoring();
      }
    };
  }, []);

  return {
    isScanning,
    scanResult,
    scanProgress,
    error,
    libraryRootId,
    scanRunId,
    isMonitoringReconnection,
    interruptedScanRunId,
    handleScan,
    handleResumeScan,
    handleRescan,
    clearError,
    clearScanResult,
    cancelReconnectionMonitoring,
    pauseScan,
    stopScan,
  };
}

