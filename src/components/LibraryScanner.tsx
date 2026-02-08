/**
 * LibraryScanner Component
 * 
 * Orchestrates the library scanning and metadata parsing workflow.
 * Manages the complete process from file scanning to metadata extraction,
 * displaying progress and results to the user.
 * 
 * Features:
 * - File system scanning with progress tracking
 * - Metadata parsing with progress tracking
 * - Error handling and display
 * - Scan result summary
 * - Automatic metadata parsing after scan completion
 * - Support for rescanning existing libraries
 * - Handles both File System Access API and fallback modes
 * 
 * Workflow:
 * 1. User selects library folder (via LibrarySelector)
 * 2. Component triggers file scanning
 * 3. Displays scan progress (files found, scanned)
 * 4. On scan completion, automatically triggers metadata parsing
 * 5. Displays metadata parsing progress
 * 6. Shows final results summary
 * 
 * State Management:
 * - Uses `useLibraryScanning` hook for scanning logic
 * - Uses `useMetadataParsing` hook for metadata parsing logic
 * - Manages component-level state for UI coordination
 * - Handles callbacks for scan completion and new selections
 * 
 * Props:
 * - `libraryRoot`: The selected library root (null if not selected)
 * - `permissionStatus`: Current permission status for file access
 * - `onNewSelection`: Callback when a new folder is selected
 * - `onScanComplete`: Callback when scan and parsing complete
 * - `hasExistingScans`: Whether there are existing scans (for UI state)
 * - `triggerScan`: Flag to trigger scan immediately
 * 
 * @module components/LibraryScanner
 * 
 * @example
 * ```tsx
 * <LibraryScanner
 *   libraryRoot={selectedRoot}
 *   permissionStatus="granted"
 *   onScanComplete={() => {
 *     // Refresh library browser
 *     refreshLibrary();
 *   }}
 *   triggerScan={shouldScan}
 * />
 * ```
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import type { LibraryRoot } from "@/lib/library-selection";
import { ScanProgress } from "./ScanProgress";
import { ScanResults } from "./ScanResults";
import { MetadataProgress } from "./MetadataProgress";
import { TempoDetectionProgress } from "./TempoDetectionProgress";
import { InterruptedScanBanner } from "./InterruptedScanBanner";
import { useMetadataWriteback } from "@/hooks/useMetadataWriteback";
import { useWakeLock } from "@/hooks/useWakeLock";
import { getResumableScans } from "@/db/storage-scan-checkpoints";
import { getInterruptedProcessingCheckpoints } from "@/db/storage-processing-checkpoints";
import { getInterruptedWritebackCheckpoints } from "@/db/storage-writeback-checkpoints";
import { logger } from "@/lib/logger";
import { useBackgroundLibraryTasks } from "./BackgroundLibraryTasksProvider";

interface LibraryScannerProps {
  libraryRoot: LibraryRoot | null;
  permissionStatus: "granted" | "denied" | "prompt" | null;
  onNewSelection?: () => void; // Callback when a new folder is selected
  onScanComplete?: () => void; // Callback when scan completes (for refreshing browser)
  hasExistingScans?: boolean | null; // Whether there are existing scans (null = checking)
  triggerScan?: boolean; // When true, trigger scan immediately
  onProcessingProgress?: () => void; // Callback when processing checkpoints update
}

export function LibraryScanner({
  libraryRoot,
  permissionStatus,
  onNewSelection,
  onScanComplete,
  hasExistingScans,
  triggerScan,
  onProcessingProgress,
}: LibraryScannerProps) {
  const [currentRootId, setCurrentRootId] = useState<string | null>(null);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [detectedResumableScanRunId, setDetectedResumableScanRunId] = useState<string | null>(null);
  const [detectedResumableLastPath, setDetectedResumableLastPath] = useState<string | null>(null);
  const [hasCheckedResumable, setHasCheckedResumable] = useState(false);
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(false);
  const [processingCheckpoint, setProcessingCheckpoint] = useState<{
    scanRunId: string;
    libraryRootId: string;
    lastProcessedPath?: string;
  } | null>(null);
  const [unprocessedCount, setUnprocessedCount] = useState<number | null>(null);
  const [writebackCheckpoint, setWritebackCheckpoint] = useState<{
    writebackRunId: string;
    libraryRootId: string;
    lastWrittenPath?: string;
  } | null>(null);

  const backgroundTasks = useBackgroundLibraryTasks();

  // Keep background task inputs up to date so work continues across pages.
  useEffect(() => {
    backgroundTasks.setLibraryRoot(libraryRoot);
  }, [backgroundTasks, libraryRoot]);

  useEffect(() => {
    backgroundTasks.setPermissionStatus(permissionStatus);
  }, [backgroundTasks, permissionStatus]);

  useEffect(() => {
    backgroundTasks.setOnScanComplete(onScanComplete);
    return () => backgroundTasks.setOnScanComplete(undefined);
  }, [backgroundTasks, onScanComplete]);

  useEffect(() => {
    backgroundTasks.setOnProcessingProgress(onProcessingProgress);
    return () => backgroundTasks.setOnProcessingProgress(undefined);
  }, [backgroundTasks, onProcessingProgress]);

  // Use background hooks for scanning and metadata parsing logic
  const {
    isScanning,
    scanResult,
    scanProgress,
    error: scanError,
    libraryRootId,
    scanRunId,
    isMonitoringReconnection,
    interruptedScanRunId,
    handleScan: handleScanInternal,
    handleResumeScan,
    handleRescan,
    clearError: clearScanError,
    clearScanResult,
    cancelReconnectionMonitoring,
    pauseScan,
    stopScan,
  } = backgroundTasks.scanning;

  const {
    isParsingMetadata,
    metadataResults,
    metadataProgress,
    isDetectingTempo,
    tempoProgress,
    error: parseError,
    handleParseMetadata,
    handleResumeProcessing,
    handleProcessUnprocessed,
    clearError: clearParseError,
    clearMetadataResults,
    pauseProcessing,
    stopProcessing,
    pauseTempoDetection,
    stopTempoDetection,
  } = backgroundTasks.metadataParsing;

  const {
    isWriting: isWritingWriteback,
    handleResumeWriteback,
  } = useMetadataWriteback();

  // Prevent screen sleep during scanning and processing
  const isProcessing = isScanning || isParsingMetadata || isDetectingTempo || isWritingWriteback;
  useWakeLock(isProcessing);

  const renderProcessingResumeBanner = () => {
    if (
      !processingCheckpoint ||
      isParsingMetadata ||
      metadataResults !== null ||
      !libraryRoot
    ) {
      return null;
    }

    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-yellow-800">
              Processing Interrupted
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                Metadata processing was interrupted. You can resume from where it
                left off.
              </p>
              {processingCheckpoint.lastProcessedPath && (
                <p className="mt-2 text-xs text-yellow-700">
                  Last processed: {processingCheckpoint.lastProcessedPath}
                </p>
              )}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() =>
                    handleResumeProcessing(
                      libraryRoot,
                      processingCheckpoint.libraryRootId,
                      processingCheckpoint.scanRunId
                    )
                  }
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  Resume Processing
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderUnprocessedBanner = () => {
    if (
      !libraryRoot ||
      libraryRoot.mode !== "handle" ||
      permissionStatus !== "granted" ||
      unprocessedCount === null ||
      unprocessedCount === 0
    ) {
      return null;
    }

    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-sm p-4">
        <div className="flex items-start gap-3">
          <div className="size-8 bg-blue-500/20 rounded-sm flex items-center justify-center shrink-0">
            <svg className="size-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-blue-500 font-medium mb-1">Tracks Pending Processing</h3>
            <p className="text-app-secondary text-sm mb-3">
              {unprocessedCount} scanned tracks have not been processed yet.
            </p>
            <button
              onClick={() => {
                clearMetadataResults();
                clearParseError();
                if (libraryRootId) {
                  handleProcessUnprocessed(
                    libraryRoot,
                    libraryRootId,
                    scanRunId || undefined
                  );
                }
              }}
              disabled={!libraryRootId}
              className="px-3 py-2 bg-blue-500 text-white rounded-sm text-xs uppercase tracking-wider hover:bg-blue-400 transition-colors"
            >
              {libraryRootId ? "Process Pending Tracks" : "Loading Library..."}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderWritebackResumeBanner = () => {
    if (!writebackCheckpoint || isWritingWriteback || !libraryRoot) {
      return null;
    }

    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-yellow-800">
              Metadata Sync Interrupted
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                Metadata sync was interrupted. You can resume from where it
                left off.
              </p>
              {writebackCheckpoint.lastWrittenPath && (
                <p className="mt-2 text-xs text-yellow-700">
                  Last synced: {writebackCheckpoint.lastWrittenPath}
                </p>
              )}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() =>
                    handleResumeWriteback(
                      libraryRoot,
                      writebackCheckpoint.libraryRootId,
                      writebackCheckpoint.writebackRunId
                    )
                  }
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  Resume Metadata Sync
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Wrapper for handleScan that triggers scanning
  const handleScan = useCallback(async () => {
    clearMetadataResults();
    clearParseError();
    setAutoProcessEnabled(true);
    await handleScanInternal();
    // Metadata parsing will be triggered automatically by useEffect below
    // when scanResult becomes available
  }, [clearMetadataResults, clearParseError, handleScanInternal]);

  const handleRescanWithReset = useCallback(async () => {
    clearMetadataResults();
    clearParseError();
    setAutoProcessEnabled(true);
    await handleRescan();
  }, [clearMetadataResults, clearParseError, handleRescan]);

  const handleManualResumeScan = useCallback(
    async (resumeScanRunId: string) => {
      setAutoProcessEnabled(true);
      await handleResumeScan(resumeScanRunId);
    },
    [handleResumeScan]
  );

  const handlePauseProcessing = useCallback(() => {
    setAutoProcessEnabled(false);
    pauseProcessing();
  }, [pauseProcessing]);

  const handleStopProcessing = useCallback(() => {
    setAutoProcessEnabled(false);
    stopProcessing();
  }, [stopProcessing]);

  // Combine errors from scanning and parsing
  const error = scanError || parseError;

  // Trigger metadata parsing when scan completes
  useEffect(() => {
    // Only trigger if:
    // 1. Scan result is available
    // 2. Library root is available
    // 3. Library root ID is available
    // 4. Not already parsing metadata
    // 5. Metadata hasn't been parsed yet (no results)
    // 6. Library root is in "handle" mode (required for metadata parsing)
    if (
      scanResult &&
      libraryRoot &&
      libraryRootId &&
      scanRunId &&
      !isParsingMetadata &&
      metadataResults === null &&
      autoProcessEnabled &&
      libraryRoot.mode === "handle" &&
      permissionStatus === "granted"
    ) {
      // Trigger metadata parsing
      handleParseMetadata(scanResult, libraryRoot, libraryRootId).catch((err) => {
        // Error is already handled by the hook, just log here for debugging
        logger.error("Failed to trigger metadata parsing:", err);
      });
    }
  }, [
    scanResult,
    libraryRoot,
    libraryRootId,
    scanRunId,
    isParsingMetadata,
    metadataResults,
    autoProcessEnabled,
    permissionStatus,
    handleParseMetadata,
  ]);

  // Get current root ID
  const getRootId = (root: LibraryRoot | null): string | null => {
    if (!root) return null;
    return `${root.mode}-${root.name}-${root.handleId || root.lastImportedAt}`;
  };

  // Mark initial mount as complete after first render
  useEffect(() => {
    setIsInitialMount(false);
  }, []);

  // Check for interrupted scans on mount and when library root changes
  useEffect(() => {
    const checkInterruptedScans = async () => {
      if (!libraryRoot) {
        setDetectedResumableScanRunId(null);
        setDetectedResumableLastPath(null);
        setHasCheckedResumable(true);
        return;
      }

      try {
        // Get library root ID from the root object
        // We need to check if there's a stored library root with this handleId
        const { getAllLibraryRoots } = await import("@/db/storage");
        const roots = await getAllLibraryRoots();
        
        // Find matching root by handleRef or name
        const matchingRoot = roots.find(
          (r) =>
            (libraryRoot.mode === "handle" &&
              r.handleRef === libraryRoot.handleId) ||
            r.name === libraryRoot.name
        );

        if (matchingRoot) {
          const resumable = await getResumableScans(matchingRoot.id);
          // Use the most recent resumable scan (last in sorted array)
          if (resumable.length > 0) {
            const mostRecent = resumable[resumable.length - 1];
            setDetectedResumableScanRunId(mostRecent.scanRunId);
            setDetectedResumableLastPath(mostRecent.lastScannedPath ?? null);
          } else {
            setDetectedResumableScanRunId(null);
            setDetectedResumableLastPath(null);
          }
          const processing = await getInterruptedProcessingCheckpoints(matchingRoot.id);
          if (processing.length > 0) {
            const mostRecentProcessing = processing[processing.length - 1];
            setProcessingCheckpoint({
              scanRunId: mostRecentProcessing.scanRunId,
              libraryRootId: mostRecentProcessing.libraryRootId,
              lastProcessedPath: mostRecentProcessing.lastProcessedPath,
            });
          } else {
            setProcessingCheckpoint(null);
          }
          const writebacks = await getInterruptedWritebackCheckpoints(matchingRoot.id);
          if (writebacks.length > 0) {
            const mostRecentWriteback = writebacks[writebacks.length - 1];
            setWritebackCheckpoint({
              writebackRunId: mostRecentWriteback.writebackRunId,
              libraryRootId: mostRecentWriteback.libraryRootId,
              lastWrittenPath: mostRecentWriteback.lastWrittenPath,
            });
          } else {
            setWritebackCheckpoint(null);
          }
        } else {
          setDetectedResumableScanRunId(null);
          setDetectedResumableLastPath(null);
          setProcessingCheckpoint(null);
          setWritebackCheckpoint(null);
        }
      } catch (error) {
        logger.error("Failed to check for interrupted scans:", error);
        setDetectedResumableScanRunId(null);
        setDetectedResumableLastPath(null);
        setProcessingCheckpoint(null);
        setWritebackCheckpoint(null);
      } finally {
        setHasCheckedResumable(true);
      }
    };

    checkInterruptedScans();
  }, [libraryRoot, permissionStatus]);

  // Clear scan result when library root changes
  useEffect(() => {
    const rootId = getRootId(libraryRoot);
    
    // Update currentRootId when libraryRoot changes (even if rootId is null)
    if (rootId !== currentRootId) {
      if (rootId) {
        clearScanResult();
        clearParseError();
        clearMetadataResults();
        setCurrentRootId(rootId);
        setHasCheckedResumable(false);
        setAutoProcessEnabled(false);
        // If this is a new root (not initial mount), mark as new selection
        if (libraryRoot && !isInitialMount) {
          onNewSelection?.();
        }
      } else if (libraryRoot === null && currentRootId !== null) {
        // Library root was cleared
        setCurrentRootId(null);
        clearScanResult();
        clearParseError();
      }
    }
  }, [
    libraryRoot,
    currentRootId,
    onNewSelection,
    isInitialMount,
    clearScanResult,
    clearParseError,
    clearMetadataResults,
  ]);

  useEffect(() => {
    const updateProcessingStatus = async () => {
      if (!libraryRootId) {
        setUnprocessedCount(null);
        return;
      }
      try {
        const { getFileIndexEntries, getTracks } = await import("@/db/storage");
        const [entries, tracks] = await Promise.all([
          getFileIndexEntries(libraryRootId),
          getTracks(libraryRootId),
        ]);
        const processedIds = new Set(tracks.map((track) => track.trackFileId));
        const missingCount = entries.filter(
          (entry) => !processedIds.has(entry.trackFileId)
        ).length;
        setUnprocessedCount(missingCount);
      } catch (error) {
        logger.error("Failed to compute unprocessed tracks:", error);
        setUnprocessedCount(null);
      }
    };

    updateProcessingStatus();
  }, [libraryRootId, scanResult, metadataResults, isParsingMetadata]);

  // Metadata parsing is now handled by useMetadataParsing hook

  // Trigger scan only when explicitly requested by parent
  useEffect(() => {
    const rootId = getRootId(libraryRoot);

    // Trigger scan if the parent explicitly requested it
    const shouldTriggerScan =
      !!triggerScan &&
      libraryRoot &&
      permissionStatus === "granted" &&
      libraryRoot.mode === "handle" &&
      !isScanning &&
      !scanResult &&
      hasCheckedResumable &&
      !detectedResumableScanRunId &&
      !processingCheckpoint &&
      (unprocessedCount === null || unprocessedCount === 0) &&
      rootId === currentRootId &&
      hasExistingScans === false; // Only auto-scan if we know there are NO existing scans

    if (shouldTriggerScan) {
      // Trigger scan immediately
      handleScan();
    }
  }, [
    permissionStatus,
    libraryRoot,
    isScanning,
    scanResult,
    detectedResumableScanRunId,
    hasCheckedResumable,
    processingCheckpoint,
    unprocessedCount,
    currentRootId,
    hasExistingScans,
    triggerScan,
    handleScan,
  ]);

  // Note: Auto-scan is handled by the permission effect above
  // handleParseMetadata and handleScan are defined above, before the useEffect

  // handleRescan is provided by useLibraryScanning hook

  if (!libraryRoot) {
    return (
      <p> 
        {/* <!-- LibrarySelector will show the prompt -->  */}
      </p>
    );
  }

  // Show folder info even if permission not granted yet
  if (permissionStatus !== "granted") {
    return (
      <div className="">
        {(isMonitoringReconnection || interruptedScanRunId || detectedResumableScanRunId) && (
          <InterruptedScanBanner
            isMonitoringReconnection={isMonitoringReconnection}
            interruptedScanRunId={interruptedScanRunId || detectedResumableScanRunId}
            lastScannedPath={interruptedScanRunId ? null : detectedResumableLastPath}
            onCancelAutoResume={cancelReconnectionMonitoring}
            onManualResume={handleManualResumeScan}
          />
        )}
        {renderProcessingResumeBanner()}
        {renderUnprocessedBanner()}
        {renderWritebackResumeBanner()}
        <div className="bg-app-surface rounded-sm border border-app-border p-6">
          <div className="mb-4">
            <p className="text-app-secondary text-xs uppercase tracking-wider mb-1">
              Selected Folder
            </p>
            <p className="text-app-primary text-lg font-medium">{libraryRoot.name}</p>
          </div>
          
          {permissionStatus === "prompt" && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-sm">
              <p className="text-yellow-500 text-sm">
                Permission required to scan library. Please grant access to your selected folder.
              </p>
            </div>
          )}
          
          {permissionStatus === "denied" && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-sm">
              <p className="text-red-500 text-sm">
                Permission denied. Please re-select your folder and grant access.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (libraryRoot.mode === "fallback") {
    return (
      <div className="">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-sm">
          <p className="text-red-500 text-sm">
            Fallback mode: Please re-select your folder to scan. Files cannot be
            accessed after page reload in fallback mode.
          </p>
        </div>
      </div>
    );
  }

  // Show metadata parsing progress if we're processing files
  if (isParsingMetadata && metadataProgress) {
    return (
      <MetadataProgress
        {...metadataProgress}
        onPause={handlePauseProcessing}
        onStop={handleStopProcessing}
      />
    );
  }

  // Show tempo detection progress if running
  if (isDetectingTempo && tempoProgress) {
    return (
      <TempoDetectionProgress
        processed={tempoProgress.processed}
        total={tempoProgress.total}
        detected={tempoProgress.detected}
        currentTrack={tempoProgress.currentTrack}
        onPause={pauseTempoDetection}
        onStop={stopTempoDetection}
      />
    );
  }

  // Show scanning progress if we're scanning files
  if (isScanning) {
    return (
      <ScanProgress
        {...(scanProgress || { found: 0, scanned: 0 })}
        onPause={pauseScan}
        onStop={stopScan}
      />
    );
  }

  if (error) {
    return (
      <div className="">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-sm mb-4">
          <p className="text-red-500 mb-4 text-sm">{error}</p>
          <button
            onClick={handleScan}
            className="px-4 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors uppercase tracking-wider text-xs"
          >
            Retry Scan
          </button>
        </div>
      </div>
    );
  }

  if (scanResult) {
    const isComplete =
      !isParsingMetadata &&
      metadataResults !== null &&
      (unprocessedCount === null || unprocessedCount === 0);
    
    return (
      <div className="space-y-4 ">
        {/* Show interrupted scan banner if applicable */}
        {(isMonitoringReconnection || interruptedScanRunId) && (
          <InterruptedScanBanner
            isMonitoringReconnection={isMonitoringReconnection}
            interruptedScanRunId={interruptedScanRunId}
            lastScannedPath={null}
            onCancelAutoResume={cancelReconnectionMonitoring}
            onManualResume={handleManualResumeScan}
          />
        )}
        {renderProcessingResumeBanner()}
        {renderUnprocessedBanner()}
        {renderWritebackResumeBanner()}

        {/* Show folder info */}
        <div className="bg-app-surface rounded-sm border border-app-border p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-app-secondary text-xs uppercase tracking-wider mb-1">
                Selected Folder
              </p>
              <p className="text-app-primary text-lg font-medium">{libraryRoot.name}</p>
            </div>
            {isComplete && (
              <div className="flex items-center gap-2">
                <div className="px-3 py-1 bg-green-500/10 text-green-500 rounded-sm text-xs font-medium uppercase tracking-wider">
                  Ready
                </div>
                <div className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-sm text-xs font-medium uppercase tracking-wider">
                  Saved
                </div>
              </div>
            )}
          </div>
          
          {/* File count */}
          <div className="mt-4 pt-4 border-t border-app-border">
            <p className="text-app-secondary text-sm">
              <span className="font-medium text-app-primary">{scanResult.total}</span> audio files found
              {isComplete && (
                <span className="ml-2 text-green-500">• Data saved and ready</span>
              )}
            </p>
          </div>
        </div>

        {scanResult.migration?.totalMigrated ? (
          <div className="bg-app-surface rounded-sm border border-app-border p-4">
            <h4 className="text-app-primary text-sm uppercase tracking-wider mb-2">
              Migration Diagnostics
            </h4>
            <p className="text-app-secondary text-xs mb-2">
              Migrated {scanResult.migration.totalMigrated} track IDs to the stable scheme.
            </p>
            {scanResult.migration.samples.length > 0 && (
              <div className="text-xs text-app-tertiary space-y-1">
                {scanResult.migration.samples.map((sample) => (
                  <div key={sample.from} className="truncate">
                    {sample.path ? `${sample.path} — ` : ""}
                    {sample.from} → {sample.to}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <ScanResults result={scanResult} onRescan={handleRescanWithReset} />
        
        {/* Metadata parsing progress is shown via MetadataProgress component above */}
        {/* This section is kept for when parsing completes but results aren't ready yet */}
        {isParsingMetadata && !metadataProgress && (
          <div className="bg-app-surface rounded-sm border border-app-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent-primary border-t-transparent" />
              <h3 className="text-app-primary uppercase tracking-wider text-xs">Processing Files...</h3>
            </div>
            <p className="text-app-secondary text-sm">
              Processing metadata for {scanResult.total} files. This may take a while for large libraries...
            </p>
          </div>
        )}

        {isComplete && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-sm p-6">
            <div className="flex items-start gap-3">
              <div className="size-10 bg-green-500/20 rounded-sm flex items-center justify-center shrink-0">
                <svg className="size-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-green-500 font-medium mb-2">Library Indexed Successfully</h3>
                <p className="text-app-secondary text-sm mb-4">
                  Your music library has been scanned and indexed. You can now browse your library and create playlists.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/playlists/new"
                    className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors text-sm font-medium"
                  >
                    Create Playlist
                  </a>
                  <button
                    onClick={handleRescanWithReset}
                    className="px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
                  >
                    Rescan Library
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {metadataResults && metadataResults.length > 0 && !isParsingMetadata && (
          <div className="bg-app-surface rounded-sm border border-app-border p-4">
            <p className="text-app-secondary text-sm">
              Metadata parsed for <span className="font-medium text-app-primary">{metadataResults.filter((r) => !r.error).length}</span> files
              {metadataResults.filter((r) => r.error).length > 0 && (
                <span className="text-red-500 ml-2">
                  ({metadataResults.filter((r) => r.error).length} errors)
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Show folder selected but not scanned yet
  // Show different UI based on whether we have existing scans
  if (hasExistingScans === true && libraryRoot) {
    // Show manual rescan option for existing library
    return (
      <div className="">
        <div className="space-y-4">
          {/* Show interrupted scan banner if applicable */}
          {(isMonitoringReconnection || interruptedScanRunId || detectedResumableScanRunId) && (
            <InterruptedScanBanner
              isMonitoringReconnection={isMonitoringReconnection}
              interruptedScanRunId={interruptedScanRunId || detectedResumableScanRunId}
              lastScannedPath={interruptedScanRunId ? null : detectedResumableLastPath}
              onCancelAutoResume={cancelReconnectionMonitoring}
              onManualResume={handleManualResumeScan}
            />
          )}
          {renderProcessingResumeBanner()}
          {renderUnprocessedBanner()}
          {renderWritebackResumeBanner()}

          <div className="bg-app-surface rounded-sm border border-app-border p-6">
            <div className="mb-4">
              <p className="text-app-secondary text-xs uppercase tracking-wider mb-1">
                Selected Folder
              </p>
              <p className="text-app-primary text-lg font-medium">{libraryRoot.name}</p>
            </div>
            
            <div className="pt-4 border-t border-app-border">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-app-primary mb-1 uppercase tracking-wider text-xs">Library Already Scanned</h2>
                  <p className="text-app-secondary text-sm">
                    Your library has been previously scanned. You can browse your tracks below or rescan to update the index.
                  </p>
                </div>
                <button
                  onClick={handleRescanWithReset}
                  disabled={isScanning || hasExistingScans === null}
                  className="px-6 py-3 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase tracking-wider text-xs"
                >
                  Rescan Library
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // If we have existing scans but libraryRoot is not loaded yet, show loading state
  if (hasExistingScans === true && !libraryRoot) {
    return (
      <div className="">
        <div className="bg-app-surface rounded-sm border border-app-border p-6">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-accent-primary border-t-transparent" />
            <p className="text-app-secondary text-sm">Loading library information...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show scan prompt for new library (only if libraryRoot exists)
  if (libraryRoot) {
    return (
      <div className="">
        <div className="space-y-4">
          {/* Show interrupted scan banner if applicable */}
          {(isMonitoringReconnection || interruptedScanRunId || detectedResumableScanRunId) && (
            <InterruptedScanBanner
              isMonitoringReconnection={isMonitoringReconnection}
              interruptedScanRunId={interruptedScanRunId || detectedResumableScanRunId}
              lastScannedPath={interruptedScanRunId ? null : detectedResumableLastPath}
              onCancelAutoResume={cancelReconnectionMonitoring}
              onManualResume={handleManualResumeScan}
            />
          )}
          {renderProcessingResumeBanner()}
          {renderUnprocessedBanner()}
          {renderWritebackResumeBanner()}

          <div className="bg-app-surface rounded-sm border border-app-border p-6">
            <div className="mb-4">
              <p className="text-app-secondary text-xs uppercase tracking-wider mb-1">
                Selected Folder
              </p>
              <p className="text-app-primary text-lg font-medium">{libraryRoot.name}</p>
            </div>
            
            <div className="pt-4 border-t border-app-border">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-app-primary mb-1 uppercase tracking-wider text-xs">Ready to Scan</h2>
                  <p className="text-app-secondary text-sm">
                    Click the button below to scan your music library for audio files.
                  </p>
                </div>
                <button
                  onClick={handleScan}
                  disabled={isScanning || hasExistingScans === null}
                  className="px-6 py-3 bg-accent-primary text-white rounded-sm hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase tracking-wider text-xs"
                >
                  {hasExistingScans === null ? "Checking..." : "Start Scan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // No library root selected - return null (LibrarySelector will show the prompt)
  return null;
}

