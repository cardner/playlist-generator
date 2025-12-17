"use client";

import { useState, useEffect } from "react";
import { LibrarySelector } from "@/components/LibrarySelector";
import { LibraryScanner } from "@/components/LibraryScanner";
import { LibraryBrowser } from "@/components/LibraryBrowser";
import { LibrarySummary } from "@/components/LibrarySummary";
import { StorageWarning } from "@/components/StorageWarning";
import { getCurrentLibraryRoot, getCurrentCollectionId } from "@/db/storage";
import { ensureMigrationComplete } from "@/db/migration-helper";
import type { LibraryRoot } from "@/lib/library-selection";
import type { PermissionStatus } from "@/lib/library-selection";

export default function LibraryPage() {
  const [libraryRoot, setLibraryRoot] = useState<LibraryRoot | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus | null>(null);
  const [browserRefresh, setBrowserRefresh] = useState(0);
  const [currentLibraryRootId, setCurrentLibraryRootId] = useState<string | null>(null);
  const [isNewSelection, setIsNewSelection] = useState(false);
  const [hasExistingScans, setHasExistingScans] = useState<boolean | null>(null); // null = checking
  const [collectionRefresh, setCollectionRefresh] = useState(0);
  const [triggerScan, setTriggerScan] = useState(false);

  // Check for existing scans on mount (but not when isNewSelection is true)
  useEffect(() => {
    // Skip check if user just selected a new folder
    if (isNewSelection) {
      return;
    }
    
    async function checkExistingScans() {
      // Wait for database migration to complete before accessing database
      await ensureMigrationComplete();
      
      try {
        console.log("LibraryPage: Checking for existing scans...");
        let root = await getCurrentLibraryRoot();
        console.log("LibraryPage: Current library root from DB:", root);
        
        // If no library root record exists, check if we have tracks/fileIndex entries
        // and try to infer the library root ID from them
        if (!root) {
          console.log("LibraryPage: No library root record found, checking for tracks/fileIndex...");
          const { getAllTracks, getAllFileIndexEntries } = await import("@/db/storage");
          const allTracks = await getAllTracks();
          const allFileIndex = await getAllFileIndexEntries();
          
          console.log(`LibraryPage: Found ${allTracks.length} tracks, ${allFileIndex.length} file index entries`);
          
          if (allTracks.length === 0 && allFileIndex.length === 0) {
            // No data found
            console.log("LibraryPage: No tracks or file index entries found");
            setHasExistingScans(false);
            return;
          }
          
          // Get unique library root IDs from tracks and file index
          const trackRootIds = new Set(allTracks.map(t => t.libraryRootId).filter(Boolean));
          const fileIndexRootIds = new Set(allFileIndex.map(f => f.libraryRootId).filter(Boolean));
          const allRootIds = new Set([...trackRootIds, ...fileIndexRootIds]);
          
          console.log(`LibraryPage: Found library root IDs:`, Array.from(allRootIds));
          
          if (allRootIds.size > 0) {
            // Use the first (or most common) library root ID
            const inferredRootId = Array.from(allRootIds)[0];
            console.log(`LibraryPage: Inferred library root ID: ${inferredRootId}`);
            
            // Try to get scan runs for this root ID
            const { getScanRuns } = await import("@/db/storage");
            const scanRuns = await getScanRuns(inferredRootId);
            const hasSuccessfulScan = scanRuns.some(run => run.finishedAt && run.total > 0);
            const hasData = allTracks.length > 0 || allFileIndex.length > 0;
            
            console.log(`LibraryPage: hasSuccessfulScan=${hasSuccessfulScan}, hasData=${hasData}`);
            
            if (hasData && hasSuccessfulScan) {
              // We have data but no library root record - try to reconstruct it
              console.warn("LibraryPage: Found tracks/fileIndex but no library root record - attempting reconstruction");
              setCurrentLibraryRootId(inferredRootId);
              setHasExistingScans(true);
              
              // Try to reconstruct the library root from the data
              const { getSavedLibraryRoot } = await import("@/lib/library-selection");
              const reconstructedRoot = await getSavedLibraryRoot();
              
              if (reconstructedRoot) {
                console.log("LibraryPage: Successfully reconstructed library root:", reconstructedRoot);
                setLibraryRoot(reconstructedRoot);
                // Request permission for the reconstructed root
                const { requestLibraryPermission } = await import("@/lib/library-selection");
                const permission = await requestLibraryPermission(reconstructedRoot);
                setPermissionStatus(permission);
              } else {
                console.warn("LibraryPage: Failed to reconstruct library root - components will work with root ID only");
                // LibraryBrowser and LibrarySummary can still work with just the root ID
              }
              return;
            }
          }
          
          // No data found
          console.log("LibraryPage: No tracks or file index entries found");
          setHasExistingScans(false);
          return;
        }
        
        // We have a library root record - proceed normally
        // Check if there are existing tracks or file index entries
        const { getTracks, getFileIndexEntries, getScanRuns } = await import("@/db/storage");
        const tracks = await getTracks(root.id);
        const fileIndex = await getFileIndexEntries(root.id);
        const scanRuns = await getScanRuns(root.id);
        
        console.log(`LibraryPage: Found ${tracks.length} tracks, ${fileIndex.length} file index entries, ${scanRuns.length} scan runs`);
        
        // Consider it an existing scan if we have tracks or file index entries
        // and at least one successful scan run
        const hasSuccessfulScan = scanRuns.some(run => run.finishedAt && run.total > 0);
        const hasData = tracks.length > 0 || fileIndex.length > 0;
        
        console.log(`LibraryPage: hasSuccessfulScan=${hasSuccessfulScan}, hasData=${hasData}`);
        
        setHasExistingScans(hasData && hasSuccessfulScan);
        setCurrentLibraryRootId(root.id);
        
        // If we have existing scans, load the saved library root
        if (hasData && hasSuccessfulScan) {
          console.log("LibraryPage: Loading saved library root...");
          const { getSavedLibraryRoot } = await import("@/lib/library-selection");
          const savedRoot = await getSavedLibraryRoot();
          console.log("LibraryPage: getSavedLibraryRoot returned:", savedRoot);
          
          if (savedRoot) {
            console.log("LibraryPage: Setting library root state:", savedRoot);
            setLibraryRoot(savedRoot);
            // Also request permission for the saved root
            const { requestLibraryPermission } = await import("@/lib/library-selection");
            const permission = await requestLibraryPermission(savedRoot);
            console.log("LibraryPage: Permission status:", permission);
            setPermissionStatus(permission);
          } else {
            console.warn("LibraryPage: getSavedLibraryRoot returned null");
          }
        } else {
          setHasExistingScans(false);
        }
      } catch (err) {
        console.error("Failed to check existing scans:", err);
        setHasExistingScans(false);
      }
    }
    checkExistingScans();
  }, [isNewSelection]); // Skip if new selection was made

  // Debug: Log when libraryRoot changes
  useEffect(() => {
    console.log("LibraryPage: libraryRoot state changed:", libraryRoot);
  }, [libraryRoot]);

  // Update library root ID when root changes or after scan completes
  useEffect(() => {
    async function updateRootId() {
      // Wait for database migration to complete before accessing database
      await ensureMigrationComplete();
      
      try {
        if (libraryRoot) {
          // Small delay to ensure the root is saved to IndexedDB
          await new Promise(resolve => setTimeout(resolve, 100));
          const root = await getCurrentLibraryRoot();
          setCurrentLibraryRootId(root?.id || null);
        } else {
          // Check if there's an existing library root in the database
          const root = await getCurrentLibraryRoot();
          setCurrentLibraryRootId(root?.id || null);
        }
      } catch (err) {
        console.error("Failed to update root ID:", err);
        // Don't set state on error - let user retry
      }
    }
    updateRootId();
  }, [libraryRoot, browserRefresh]); // Also update when browserRefresh changes (scan completes)

  const handleNewSelection = () => {
    setIsNewSelection(true);
    setHasExistingScans(false); // User explicitly selected a new folder
  };
  
  // Reset isNewSelection flag after a delay to allow checkExistingScans to run again if needed
  useEffect(() => {
    if (isNewSelection) {
      const timer = setTimeout(() => {
        setIsNewSelection(false);
      }, 5000); // Reset after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [isNewSelection]);

  // Update hasExistingScans when scan completes (scan is now complete)
  const handleScanComplete = async () => {
    // Verify data persistence before refreshing
    console.log("Scan complete callback triggered, verifying data persistence...");
    
    // Small delay to ensure all database writes are complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify data exists in database
    const { getCurrentLibraryRoot, getFileIndexEntries, getTracks } = await import("@/db/storage");
    const root = await getCurrentLibraryRoot();
    
    if (root) {
      const fileIndex = await getFileIndexEntries(root.id);
      const tracks = await getTracks(root.id);
      console.log(`Data persistence verified: ${fileIndex.length} file index entries, ${tracks.length} tracks`);
      
      // Update root ID to ensure components have latest data
      setCurrentLibraryRootId(root.id);
      
      // Mark that we now have existing scans
      setHasExistingScans(true);
    }
    
    // Refresh browser and summary when scan completes
    setBrowserRefresh((prev) => prev + 1);
  };

  return (
    <>
      <header className="mb-8 md:mb-12">
        <h1 className="text-app-primary tracking-tight">Music Library</h1>
      </header>

      <div className="mb-4">
        <LibrarySelector
          key={collectionRefresh}
          refreshTrigger={collectionRefresh}
          onLibrarySelected={(root) => {
            console.log("LibraryPage: Folder selected", root);
            setLibraryRoot(root);
            setIsNewSelection(true);
            // Explicitly set to false (not null) so LibraryScanner shows scan button immediately
            setHasExistingScans(false);
          }}
          onPermissionStatus={(status) => {
            console.log("LibraryPage: Permission status", status);
            setPermissionStatus(status);
          }}
          onStartScan={() => {
            // When user clicks "Start Scanning" from a saved collection,
            // ensure hasExistingScans is false so LibraryScanner shows scan button
            // and trigger scan immediately
            setHasExistingScans(false);
            setIsNewSelection(true);
            setTriggerScan(true);
            // Reset triggerScan after a short delay to allow it to be triggered again
            setTimeout(() => setTriggerScan(false), 100);
          }}
          onCollectionChange={async (collectionId) => {
            if (collectionId) {
              // Reload library root for the selected collection
              const root = await getCurrentLibraryRoot();
              if (root) {
                const { getSavedLibraryRoot, requestLibraryPermission } = await import("@/lib/library-selection");
                const savedRoot = await getSavedLibraryRoot();
                if (savedRoot) {
                  setLibraryRoot(savedRoot);
                  const permission = await requestLibraryPermission(savedRoot);
                  setPermissionStatus(permission);
                }
                setCurrentLibraryRootId(root.id);
                // Refresh all components to show new collection data
                setCollectionRefresh((prev) => prev + 1);
                setBrowserRefresh((prev) => prev + 1);
              }
            } else {
              setLibraryRoot(null);
              setCurrentLibraryRootId(null);
              setCollectionRefresh((prev) => prev + 1);
              setBrowserRefresh((prev) => prev + 1);
            }
          }}
        />
      </div>

      <div className="mb-4">
        <LibraryScanner
          libraryRoot={libraryRoot}
          permissionStatus={permissionStatus}
          onNewSelection={handleNewSelection}
          hasExistingScans={hasExistingScans}
          onScanComplete={handleScanComplete}
          triggerScan={triggerScan}
        />
      </div>

      <div className="mb-4">
        <StorageWarning />
      </div>

      <div className="mb-4">
        <LibrarySummary 
          libraryRootId={currentLibraryRootId || undefined}
          refreshTrigger={browserRefresh}
        />
      </div>

      <div className="mb-4">
        <LibraryBrowser key={browserRefresh} />
      </div>
    </>
  );
}

