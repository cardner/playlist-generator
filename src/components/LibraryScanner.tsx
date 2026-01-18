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
import { InterruptedScanBanner } from "./InterruptedScanBanner";
import { useLibraryScanning } from "@/hooks/useLibraryScanning";
import { useMetadataParsing } from "@/hooks/useMetadataParsing";
import { getInterruptedScans } from "@/db/storage-scan-checkpoints";
import { logger } from "@/lib/logger";

interface LibraryScannerProps {
  libraryRoot: LibraryRoot | null;
  permissionStatus: "granted" | "denied" | "prompt" | null;
  onNewSelection?: () => void; // Callback when a new folder is selected
  onScanComplete?: () => void; // Callback when scan completes (for refreshing browser)
  hasExistingScans?: boolean | null; // Whether there are existing scans (null = checking)
  triggerScan?: boolean; // When true, trigger scan immediately
}

export function LibraryScanner({
  libraryRoot,
  permissionStatus,
  onNewSelection,
  onScanComplete,
  hasExistingScans,
  triggerScan,
}: LibraryScannerProps) {
  const [currentRootId, setCurrentRootId] = useState<string | null>(null);
  const [isNewSelection, setIsNewSelection] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [detectedInterruptedScanRunId, setDetectedInterruptedScanRunId] = useState<string | null>(null);

  // Use hooks for scanning and metadata parsing logic
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
  } = useLibraryScanning({
    libraryRoot,
    permissionStatus,
    onScanComplete: () => {
      // Scan complete callback is handled separately below
    },
  });

  const {
    isParsingMetadata,
    metadataResults,
    metadataProgress,
    error: parseError,
    handleParseMetadata,
    clearError: clearParseError,
  } = useMetadataParsing({
    onParseComplete: onScanComplete,
    scanRunId,
  });

  // Wrapper for handleScan that triggers scanning
  const handleScan = useCallback(async () => {
    await handleScanInternal();
    // Metadata parsing will be triggered automatically by useEffect below
    // when scanResult becomes available
  }, [handleScanInternal]);

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
      !isParsingMetadata &&
      metadataResults === null &&
      libraryRoot.mode === "handle"
    ) {
      // Trigger metadata parsing
      handleParseMetadata(scanResult, libraryRoot, libraryRootId).catch((err) => {
        // Error is already handled by the hook, just log here for debugging
        logger.error("Failed to trigger metadata parsing:", err);
      });
    }
  }, [scanResult, libraryRoot, libraryRootId, isParsingMetadata, metadataResults, handleParseMetadata]);

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
      if (!libraryRoot || permissionStatus !== "granted") {
        setDetectedInterruptedScanRunId(null);
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
          const interrupted = await getInterruptedScans(matchingRoot.id);
          // Use the most recent interrupted scan (last in sorted array)
          if (interrupted.length > 0) {
            const mostRecent = interrupted[interrupted.length - 1];
            setDetectedInterruptedScanRunId(mostRecent.scanRunId);
          } else {
            setDetectedInterruptedScanRunId(null);
          }
        } else {
          setDetectedInterruptedScanRunId(null);
        }
      } catch (error) {
        logger.error("Failed to check for interrupted scans:", error);
        setDetectedInterruptedScanRunId(null);
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
        setCurrentRootId(rootId);
        // If this is a new root (not initial mount), mark as new selection
        if (libraryRoot && !isInitialMount) {
          setIsNewSelection(true);
          onNewSelection?.();
        }
      } else if (libraryRoot === null && currentRootId !== null) {
        // Library root was cleared
        setCurrentRootId(null);
        clearScanResult();
        clearParseError();
      }
    }
  }, [libraryRoot, currentRootId, onNewSelection, isInitialMount, clearScanResult, clearParseError]);

  // Metadata parsing is now handled by useMetadataParsing hook

  // When permission becomes granted for a new selection, trigger scan
  // BUT only if there are no existing scans (to prevent auto-scanning on page load)
  useEffect(() => {
    const rootId = getRootId(libraryRoot);

    // Trigger scan if:
    // 1. triggerScan prop is true (explicit trigger from parent)
    // OR
    // 2. It's a new selection (user explicitly selected a folder)
    //    AND there are no existing scans
    //    AND permission is granted
    //    AND all other conditions are met
    const shouldTriggerScan = triggerScan || (
      isNewSelection &&
      libraryRoot &&
      permissionStatus === "granted" &&
      libraryRoot.mode === "handle" &&
      !isScanning &&
      !scanResult &&
      rootId === currentRootId &&
      hasExistingScans === false // Only auto-scan if we know there are NO existing scans
    );

    if (shouldTriggerScan) {
      // Reset flag first to prevent duplicate scans
      setIsNewSelection(false);
      // Trigger scan immediately
      handleScan();
    }
  }, [isNewSelection, permissionStatus, libraryRoot, isScanning, scanResult, currentRootId, hasExistingScans, triggerScan, handleScan]);

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
    return <MetadataProgress {...metadataProgress} />;
  }

  // Show scanning progress if we're scanning files
  if (isScanning) {
    return <ScanProgress {...(scanProgress || { found: 0, scanned: 0 })} />;
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
    const isComplete = !isParsingMetadata && metadataResults !== null;
    
    return (
      <div className="space-y-4 ">
        {/* Show interrupted scan banner if applicable */}
        {(isMonitoringReconnection || interruptedScanRunId) && (
          <InterruptedScanBanner
            isMonitoringReconnection={isMonitoringReconnection}
            interruptedScanRunId={interruptedScanRunId}
            onCancelAutoResume={cancelReconnectionMonitoring}
            onManualResume={handleResumeScan}
          />
        )}

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

        <ScanResults result={scanResult} onRescan={handleRescan} />
        
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
                    onClick={handleRescan}
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
          {(isMonitoringReconnection || interruptedScanRunId || detectedInterruptedScanRunId) && (
            <InterruptedScanBanner
              isMonitoringReconnection={isMonitoringReconnection}
              interruptedScanRunId={interruptedScanRunId || detectedInterruptedScanRunId}
              onCancelAutoResume={cancelReconnectionMonitoring}
              onManualResume={handleResumeScan}
            />
          )}

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
                  onClick={handleScan}
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
          {(isMonitoringReconnection || interruptedScanRunId || detectedInterruptedScanRunId) && (
            <InterruptedScanBanner
              isMonitoringReconnection={isMonitoringReconnection}
              interruptedScanRunId={interruptedScanRunId || detectedInterruptedScanRunId}
              onCancelAutoResume={cancelReconnectionMonitoring}
              onManualResume={handleResumeScan}
            />
          )}

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

