"use client";

import { useState, useEffect, useCallback } from "react";
import type { LibraryRoot } from "@/lib/library-selection";
import {
  type ScanResult,
  type ScanProgressCallback,
  parseMetadataForFiles,
  type MetadataResult,
  type MetadataProgressCallback,
} from "@/features/library";
import { scanLibraryWithPersistence } from "@/features/library/scanning-persist";
import { getLibraryFilesForEntries } from "@/features/library/metadata-integration";
import {
  saveTrackMetadata,
  removeTrackMetadata,
  updateScanRun,
} from "@/db/storage";
import { isQuotaExceededError, getStorageQuotaInfo, formatStorageSize } from "@/db/storage-errors";
import { ScanProgress } from "./ScanProgress";
import { ScanResults } from "./ScanResults";
import { MetadataProgress } from "./MetadataProgress";

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
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanProgress, setScanProgress] = useState<{
    found: number;
    scanned: number;
    currentFile?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentRootId, setCurrentRootId] = useState<string | null>(null);
  const [isParsingMetadata, setIsParsingMetadata] = useState(false);
  const [metadataResults, setMetadataResults] = useState<MetadataResult[] | null>(null);
  const [filesToParse, setFilesToParse] = useState<any[]>([]);
  const [metadataProgress, setMetadataProgress] = useState<{
    parsed: number;
    total: number;
    errors: number;
    currentFile?: string;
    batch?: number;
    totalBatches?: number;
    estimatedTimeRemaining?: number;
  } | null>(null);
  const [currentLibraryRootId, setCurrentLibraryRootId] = useState<string | null>(null);
  const [scanRunId, setScanRunId] = useState<string | null>(null);
  const [refreshBrowser, setRefreshBrowser] = useState(0);
  const [isNewSelection, setIsNewSelection] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);

  // Get current root ID
  const getRootId = (root: LibraryRoot | null): string | null => {
    if (!root) return null;
    return `${root.mode}-${root.name}-${root.handleId || root.lastImportedAt}`;
  };

  // Mark initial mount as complete after first render
  useEffect(() => {
    setIsInitialMount(false);
  }, []);

  // Debug: Log when libraryRoot prop changes
  useEffect(() => {
    console.log("LibraryScanner: libraryRoot prop changed:", libraryRoot, {
      name: libraryRoot?.name,
      mode: libraryRoot?.mode,
      handleId: libraryRoot?.handleId,
    });
  }, [libraryRoot]);

  // Clear scan result when library root changes
  useEffect(() => {
    const rootId = getRootId(libraryRoot);
    console.log("Root change effect", {
      rootId,
      currentRootId,
      hasLibraryRoot: !!libraryRoot,
      isInitialMount,
      rootName: libraryRoot?.name,
    });
    
    // Update currentRootId when libraryRoot changes (even if rootId is null)
    if (rootId !== currentRootId) {
      if (rootId) {
        console.log("Library root changed, clearing scan result", { rootId, currentRootId });
        setScanResult(null);
        setError(null);
        setCurrentRootId(rootId);
        // If this is a new root (not initial mount), mark as new selection
        if (libraryRoot && !isInitialMount) {
          console.log("Marking as new selection");
          setIsNewSelection(true);
          onNewSelection?.();
        }
      } else if (libraryRoot === null && currentRootId !== null) {
        // Library root was cleared
        console.log("Library root cleared");
        setCurrentRootId(null);
        setScanResult(null);
        setError(null);
      }
    }
  }, [libraryRoot, currentRootId, onNewSelection, isInitialMount]);

  // Define handleParseMetadata first since handleScan depends on it
  const handleParseMetadata = useCallback(async (
    result: ScanResult,
    root: LibraryRoot,
    libraryRootId: string
  ) => {
    if (root.mode !== "handle") {
      return; // Only handle mode supports metadata parsing
    }

    try {
      setIsParsingMetadata(true);
      setMetadataProgress({
        parsed: 0,
        total: result.entries.length,
        errors: 0,
      });

      // Get entries that need metadata parsing (added + changed)
      // For now, parse all entries (can be optimized to only parse added/changed)
      const entriesToParse = result.entries;

      // Get LibraryFile objects for these entries
      console.log(`Getting library files for ${entriesToParse.length} entries...`);
      const libraryFiles = await getLibraryFilesForEntries(root, entriesToParse);
      console.log(`Retrieved ${libraryFiles.length} library files`);

      if (libraryFiles.length === 0) {
        console.warn("No library files found for entries - cannot parse metadata");
        console.log("This might happen if files were moved or the directory handle is invalid");
        setIsParsingMetadata(false);
        setMetadataProgress(null);
        // Still notify completion - file index is saved even if metadata parsing fails
        onScanComplete?.();
        return;
      }

      // Use batched parsing for large libraries to prevent timeouts
      const useBatched = libraryFiles.length > 1000;
      let results: MetadataResult[];
      let successCount: number;
      let errorCount: number;
      
      if (useBatched) {
        console.log(`Starting batched metadata parsing for ${libraryFiles.length} files...`);
        
        // Import batched parser
        const { parseMetadataBatched } = await import("@/features/library/metadata-batched");
        
        // Adjust batch size and concurrency based on library size
        const batchSize = libraryFiles.length > 10000 ? 500 : 1000;
        const concurrency = libraryFiles.length > 5000 ? 2 : 3;
        
        console.log(`Using batched parsing: batch size ${batchSize}, concurrency ${concurrency}`);
        
        const onBatchedProgress = (progress: any) => {
          const percent = Math.round((progress.parsed / progress.total) * 100);
          const timeRemaining = progress.estimatedTimeRemaining 
            ? `${Math.round(progress.estimatedTimeRemaining / 60)}m ${progress.estimatedTimeRemaining % 60}s`
            : "calculating...";
          
          console.log(
            `Batch ${progress.batch}/${progress.totalBatches}: ` +
            `${progress.parsed}/${progress.total} (${percent}%) - ` +
            `${progress.errors} errors, ${progress.saved} saved - ` +
            `ETA: ${timeRemaining}`
          );
          
          // Update UI progress state
          setMetadataProgress({
            parsed: progress.parsed,
            total: progress.total,
            errors: progress.errors,
            currentFile: progress.currentFile,
            batch: progress.batch,
            totalBatches: progress.totalBatches,
            estimatedTimeRemaining: progress.estimatedTimeRemaining,
          });
        };
        
        results = await parseMetadataBatched(
          libraryFiles,
          libraryRootId,
          onBatchedProgress,
          {
            batchSize,
            concurrency,
            saveAfterEachBatch: true, // Save incrementally
          }
        );
        
        console.log(`Batched metadata parsing complete: ${results.length} results`);
        
        successCount = results.filter((r) => !r.error && r.tags).length;
        errorCount = results.filter((r) => r.error).length;
        console.log(`Parsing results: ${successCount} successful, ${errorCount} errors`);
        
        setMetadataResults(results);
        
        // Verify final count (tracks were saved incrementally during batching)
        const { getTracks } = await import("@/db/storage");
        const savedTracks = await getTracks(libraryRootId);
        const savedCount = savedTracks.length;
        
        console.log(`Final verification: ${savedCount} tracks in database (expected ${successCount})`);
        
        if (savedCount < successCount) {
          console.warn(`Warning: Expected ${successCount} tracks but only ${savedCount} were saved`);
        } else if (savedCount > 0) {
          console.log(`✓ Successfully saved ${savedCount} tracks to IndexedDB`);
        }
      } else {
        // For smaller libraries, use direct parsing (faster)
        console.log(`Starting metadata parsing for ${libraryFiles.length} files...`);
        
        // Adjust concurrency based on library size
        const concurrency = libraryFiles.length > 500 ? 3 : 5;
        console.log(`Using concurrency level: ${concurrency}`);
        
        const onMetadataProgress: MetadataProgressCallback = (progress) => {
          // Log progress more frequently for large libraries
          const logInterval = libraryFiles.length > 500 ? 50 : 100;
          if (progress.parsed % logInterval === 0 || progress.parsed === progress.total) {
            const percent = Math.round((progress.parsed / progress.total) * 100);
            console.log(`Metadata parsing progress: ${progress.parsed}/${progress.total} (${percent}%) - ${progress.errors} errors`);
          }
          
          // Update UI progress state
          setMetadataProgress({
            parsed: progress.parsed,
            total: progress.total,
            errors: progress.errors,
            currentFile: progress.currentFile,
          });
        };

        results = await parseMetadataForFiles(libraryFiles, onMetadataProgress, concurrency);
        console.log(`Metadata parsing complete: ${results.length} results`);
        
        successCount = results.filter((r) => !r.error && r.tags).length;
        errorCount = results.filter((r) => r.error).length;
        console.log(`Parsing results: ${successCount} successful, ${errorCount} errors`);
        
        setMetadataResults(results);

        // Persist metadata results (with progress tracking for large libraries)
        try {
          console.log(`Saving ${successCount} tracks to database...`);
          await saveTrackMetadata(
            results,
            libraryRootId,
            (progress) => {
              if (progress.processed % 100 === 0 || progress.processed === progress.total) {
                console.log(`Saving metadata: ${progress.processed}/${progress.total}`);
              }
            }
          );
          
          // Verify data was saved successfully
          const { getTracks } = await import("@/db/storage");
          const savedTracks = await getTracks(libraryRootId);
          const savedCount = savedTracks.length;
          const expectedCount = successCount;
          
          console.log(`Metadata saved: ${savedCount} tracks in database (expected ${expectedCount})`);
          
          if (savedCount < expectedCount) {
            console.warn(`Warning: Expected ${expectedCount} tracks but only ${savedCount} were saved`);
          } else if (savedCount > 0) {
            console.log(`✓ Successfully saved ${savedCount} tracks to IndexedDB`);
          }
        } catch (err) {
          console.error("Error saving track metadata:", err);
          // Handle quota errors during metadata saving
          if (isQuotaExceededError(err)) {
            const quotaInfo = await getStorageQuotaInfo();
            const quotaMessage = quotaInfo
              ? `Storage quota exceeded while saving metadata. You're using ${quotaInfo.usagePercent.toFixed(1)}% of available storage. Please clean up old data.`
              : "Storage quota exceeded while saving metadata. Please clean up old data.";
            setError(quotaMessage);
            throw err; // Re-throw to stop processing
          }
          throw err; // Re-throw other errors
        }
      }

      // Update scan run with parse error count (for both batched and direct parsing)
      if (scanRunId) {
        await updateScanRun(scanRunId, errorCount);
      }

      // Remove metadata for deleted tracks
      if (result.removed > 0) {
        // Get removed entries from the diff (they're not in result.entries)
        // For now, we'll handle this in scanning-persist.ts
        // This is a placeholder - actual removal happens during scanning
      }
      
      // Final verification
      const { getFileIndexEntries, getTracks } = await import("@/db/storage");
      const savedFileIndex = await getFileIndexEntries(libraryRootId);
      const savedTracks = await getTracks(libraryRootId);
      console.log(`Final verification - File index: ${savedFileIndex.length} entries, Tracks: ${savedTracks.length} tracks`);
      
      if (savedTracks.length === 0 && successCount > 0) {
        console.error("ERROR: Tracks were parsed but not saved to database!");
        setError("Failed to save tracks to database. Please try scanning again.");
      } else if (savedTracks.length > 0) {
        console.log(`✓ Successfully saved ${savedTracks.length} tracks to IndexedDB`);
      }
      
      // Notify parent that scan and data persistence is complete
      // This will trigger refresh of LibrarySummary and LibraryBrowser
      console.log("✓ Scan complete - data persisted successfully, notifying parent component");
      onScanComplete?.();
    } catch (err) {
      console.error("Failed to parse metadata:", err);
      setError(`Failed to parse metadata: ${err instanceof Error ? err.message : String(err)}`);
      // Don't fail the scan if metadata parsing fails, but still notify completion
      // The file index is already saved, so we can still show results
      onScanComplete?.();
    } finally {
      setIsParsingMetadata(false);
      setMetadataProgress(null); // Clear progress when done
    }
  }, [onScanComplete, scanRunId]);

  const handleScan = useCallback(async () => {
    if (!libraryRoot || permissionStatus !== "granted") {
      console.log("Cannot scan: missing root or permission", { libraryRoot: !!libraryRoot, permissionStatus });
      return;
    }

    console.log("Starting scan", { libraryRoot: libraryRoot.name, mode: libraryRoot.mode });
    setIsScanning(true);
    setError(null);
    setScanProgress({ found: 0, scanned: 0 });

    const onProgress: ScanProgressCallback = (progress) => {
      setScanProgress(progress);
    };

    try {
      let result: ScanResult;
      let libraryRootId: string;

      if (libraryRoot.mode === "handle") {
        console.log("Scanning with handle mode");
        const scanResult = await scanLibraryWithPersistence(libraryRoot, onProgress);
        result = scanResult.result;
        libraryRootId = scanResult.libraryRoot.id;
        setCurrentLibraryRootId(libraryRootId);
        
        // Get scan run ID (we'll need to track this)
        const { getScanRuns } = await import("@/db/storage");
        const runs = await getScanRuns(libraryRootId);
        if (runs.length > 0) {
          setScanRunId(runs[runs.length - 1].id);
        }
        
        console.log("Scan complete", result);
      } else {
        // Fallback mode requires file list - this shouldn't happen in normal flow
        throw new Error(
          "Fallback mode scanning requires file list. Please re-select your folder."
        );
      }

      setScanResult(result);

      // Verify file index was saved after scanning
      const { getFileIndexEntries } = await import("@/db/storage");
      const savedFileIndex = await getFileIndexEntries(libraryRootId);
      console.log(`File index saved after scan: ${savedFileIndex.length} entries (expected ${result.total})`);

      // After scanning, parse metadata for added/changed files
      if (result.added > 0 || result.changed > 0) {
        await handleParseMetadata(result, libraryRoot, libraryRootId);
      } else {
        // If no new/changed files, still verify persistence and notify completion
        console.log("No new or changed files, verifying existing data...");
        const { getTracks } = await import("@/db/storage");
        const existingTracks = await getTracks(libraryRootId);
        console.log(`Existing tracks in database: ${existingTracks.length}`);
        
        // Notify completion even if no metadata parsing was needed
        onScanComplete?.();
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to scan library";
      setError(errorMessage);
      console.error("Scan error:", err);
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  }, [libraryRoot, permissionStatus, handleParseMetadata, onScanComplete]);

  // When permission becomes granted for a new selection, trigger scan
  // BUT only if there are no existing scans (to prevent auto-scanning on page load)
  useEffect(() => {
    const rootId = getRootId(libraryRoot);
    console.log("Permission effect check", {
      isNewSelection,
      hasLibraryRoot: !!libraryRoot,
      permissionStatus,
      mode: libraryRoot?.mode,
      isScanning,
      hasScanResult: !!scanResult,
      rootId,
      currentRootId,
      rootIdMatch: rootId === currentRootId,
      hasExistingScans,
    });

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
      console.log("Triggering scan", { triggerScan, isNewSelection });
      // Reset flag first to prevent duplicate scans
      setIsNewSelection(false);
      // Trigger scan immediately
      handleScan();
    }
  }, [isNewSelection, permissionStatus, libraryRoot, isScanning, scanResult, currentRootId, hasExistingScans, triggerScan, handleScan]);

  // Note: Auto-scan is handled by the permission effect above
  // handleParseMetadata and handleScan are defined above, before the useEffect

  const handleRescan = () => {
    setScanResult(null);
    setError(null);
    handleScan();
  };

  if (!libraryRoot) {
    return (
      <div className="max-w-4xl">
        <div className="bg-app-surface rounded-sm shadow-2xl p-6">
          <p className="text-app-secondary">
            Select a music library folder to begin scanning.
          </p>
        </div>
      </div>
    );
  }

  // Show folder info even if permission not granted yet
  if (permissionStatus !== "granted") {
    return (
      <div className="max-w-4xl">
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
      <div className="max-w-4xl">
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
      <div className="max-w-4xl">
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
    const isComplete = !isParsingMetadata && (metadataResults !== null || filesToParse.length === 0);
    
    return (
      <div className="space-y-4 max-w-4xl">
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
      <div className="max-w-4xl">
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
    );
  }
  
  // If we have existing scans but libraryRoot is not loaded yet, show loading state
  if (hasExistingScans === true && !libraryRoot) {
    return (
      <div className="max-w-4xl">
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
      <div className="max-w-4xl">
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
    );
  }
  
  // No library root selected - return null (LibrarySelector will show the prompt)
  return null;
}

