"use client";

import { useState, useEffect } from "react";
import { FolderOpen, Music, CheckCircle2, AlertCircle, RefreshCw, Database } from "lucide-react";
import {
  pickLibraryRoot,
  getSavedLibraryRoot,
  requestLibraryPermission,
  needsReimport,
  type LibraryRoot,
  type PermissionStatus,
} from "@/lib/library-selection";
import { supportsFileSystemAccess } from "@/lib/feature-detection";
import { RelinkLibraryRoot } from "./RelinkLibraryRoot";
import { hasRelativePaths } from "@/features/library/relink";
import { getCurrentLibraryRoot, getCurrentCollectionId, getCollection } from "@/db/storage";

interface LibrarySelectorProps {
  onLibrarySelected?: (root: LibraryRoot) => void;
  onPermissionStatus?: (status: PermissionStatus) => void;
}

export function LibrarySelector({
  onLibrarySelected,
  onPermissionStatus,
}: LibrarySelectorProps) {
  const [currentRoot, setCurrentRoot] = useState<LibraryRoot | null>(null);
  const [currentRootId, setCurrentRootId] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRelink, setShowRelink] = useState(false);
  const [hasRelativePathsCheck, setHasRelativePathsCheck] = useState<boolean | null>(null);
  const [currentCollectionName, setCurrentCollectionName] = useState<string | null>(null);

  // Load saved library root on mount
  // But don't trigger onLibrarySelected to prevent auto-scanning
  useEffect(() => {
    loadSavedLibrary();
    loadCurrentCollection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload current collection name when root changes
  useEffect(() => {
    loadCurrentCollection();
  }, [currentRootId]);

  async function loadCurrentCollection() {
    try {
      const collectionId = await getCurrentCollectionId();
      if (collectionId) {
        const collection = await getCollection(collectionId);
        if (collection) {
          setCurrentCollectionName(collection.name);
        } else {
          setCurrentCollectionName(null);
        }
      } else {
        setCurrentCollectionName(null);
      }
    } catch (err) {
      console.error("Failed to load current collection:", err);
      setCurrentCollectionName(null);
    }
  }

  // Only call onLibrarySelected when user explicitly selects a folder
  // Not when loading a saved library

  // Check permission when root changes
  useEffect(() => {
    if (currentRoot) {
      checkPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoot]);

  async function loadSavedLibrary() {
    try {
      const saved = await getSavedLibraryRoot();
      if (saved) {
        setCurrentRoot(saved);
        // Don't call onLibrarySelected here - let LibraryPage handle it
        // This prevents triggering a new scan when loading existing library
        
        // Get root ID from database
        const rootRecord = await getCurrentLibraryRoot();
        if (rootRecord) {
          setCurrentRootId(rootRecord.id);
          // Check if relative paths exist
          const hasPaths = await hasRelativePaths(rootRecord.id);
          setHasRelativePathsCheck(hasPaths);
        }
      }
    } catch (err) {
      console.error("Failed to load saved library:", err);
    }
  }

  async function checkPermission() {
    if (!currentRoot) return;

    try {
      const status = await requestLibraryPermission(currentRoot);
      setPermissionStatus(status);
      onPermissionStatus?.(status);
    } catch (err) {
      console.error("Failed to check permission:", err);
      setPermissionStatus("denied");
    }
  }

  async function handleChooseFolder() {
    setIsLoading(true);
    setError(null);

    try {
      const root = await pickLibraryRoot();
      console.log("Folder selected:", root);
      
      // Update local state first
      setCurrentRoot(root);
      
      // Notify parent immediately so UI updates
      onLibrarySelected?.(root);
      
      // Get root ID from database after saving (with small delay to ensure save completes)
      await new Promise(resolve => setTimeout(resolve, 50));
      const rootRecord = await getCurrentLibraryRoot();
      if (rootRecord) {
        setCurrentRootId(rootRecord.id);
        const hasPaths = await hasRelativePaths(rootRecord.id);
        setHasRelativePathsCheck(hasPaths);
        // Reload current collection name since a new collection was just created
        await loadCurrentCollection();
      }
      
      // Check permission immediately after notifying parent
      const status = await requestLibraryPermission(root);
      console.log("Permission status:", status);
      setPermissionStatus(status);
      onPermissionStatus?.(status);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to select folder";
      if (errorMessage !== "Folder selection cancelled") {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }

  const fileSystemSupported = supportsFileSystemAccess();
  const isHandleMode = currentRoot?.mode === "handle";
  const isFallbackMode = currentRoot?.mode === "fallback";

  return (
    <div className="max-w-4xl">
      <div className="bg-app-surface rounded-sm shadow-2xl p-8 md:p-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center size-20 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm mb-6">
            <Music className="size-10 text-white" />
          </div>

          <h2 className="text-app-primary mb-3">Scan Your Music Library</h2>
          <p className="text-app-secondary mb-8 max-w-lg mx-auto leading-relaxed">
            Select your music folder to scan and analyze your audio files. We&apos;ll read the metadata to help create personalized playlists.
          </p>

          {currentRoot ? (
            <div className="space-y-4 mb-8">
              {currentCollectionName && (
                <div className="bg-accent-primary/10 rounded-sm p-4 border border-accent-primary/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="size-4 text-accent-primary" />
                    <p className="text-app-secondary text-xs uppercase tracking-wider">
                      Current Collection
                    </p>
                  </div>
                  <p className="text-app-primary font-medium">{currentCollectionName}</p>
                </div>
              )}
              <div className="bg-app-hover rounded-sm p-4 border border-app-border">
                <p className="text-app-secondary text-xs uppercase tracking-wider mb-1">
                  Selected folder
                </p>
                <p className="text-app-primary">{currentRoot.name}</p>
              </div>

              {permissionStatus && (
                <div className="bg-app-hover rounded-sm p-4 border border-app-border">
                  <p className="text-app-secondary text-xs uppercase tracking-wider mb-1">
                    Permission
                  </p>
                  <p className={`text-sm ${
                    permissionStatus === "granted"
                      ? "text-accent-primary"
                      : permissionStatus === "denied"
                      ? "text-red-500"
                      : "text-app-tertiary"
                  }`}>
                    {permissionStatus === "granted"
                      ? "Granted"
                      : permissionStatus === "denied"
                      ? "Denied"
                      : "Prompt Required"}
                  </p>
                </div>
              )}

              {isFallbackMode && needsReimport(currentRoot) && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-sm flex items-start gap-3 text-left">
                  <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-500 text-sm">
                      Files selected via fallback mode cannot persist after page reload. You&apos;ll need to re-select the folder.
                    </p>
                  </div>
                </div>
              )}

              {permissionStatus === "prompt" && isHandleMode && (
                <button
                  onClick={checkPermission}
                  className="px-4 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors border border-app-border uppercase tracking-wider text-xs"
                >
                  Re-request permission
                </button>
              )}

              {hasRelativePathsCheck === false && currentRootId && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-sm text-left">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertCircle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-yellow-500 text-sm font-medium mb-1">
                        Missing Relative Paths
                      </p>
                      <p className="text-yellow-500 text-sm">
                        Your library doesn&apos;t have relative paths stored. Playlist exports may not work correctly.
                      </p>
                    </div>
                  </div>
                  {showRelink ? (
                    <RelinkLibraryRoot
                      libraryRootId={currentRootId}
                      onRelinkComplete={async (newRootId) => {
                        setCurrentRootId(newRootId);
                        const hasPaths = await hasRelativePaths(newRootId);
                        setHasRelativePathsCheck(hasPaths);
                        setShowRelink(false);
                        // Reload saved library to update state
                        await loadSavedLibrary();
                      }}
                      onError={() => {
                        // Reset relink UI on error
                        setShowRelink(false);
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setShowRelink(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded-sm transition-colors text-sm"
                    >
                      <RefreshCw className="size-4" />
                      Relink Library Root
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {!isLoading ? (
            <>
              <button
                onClick={handleChooseFolder}
                disabled={isLoading}
                className="inline-flex items-center gap-3 px-8 py-4 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
              >
                <FolderOpen className="size-5" />
                <span>Select Music Folder</span>
              </button>

              <p className="text-app-tertiary mt-4 text-sm">
                Supported formats: MP3, M4A, FLAC, WAV, OGG, and more
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3 text-accent-primary">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent-primary border-t-transparent" />
                <span className="uppercase tracking-wider">Selecting Folder...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-sm flex items-start gap-3 text-left max-w-lg mx-auto">
              <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-app-border">
            <div className="flex items-start gap-4 text-left max-w-2xl mx-auto">
              <CheckCircle2 className="size-5 text-accent-primary shrink-0 mt-1" />
              <div>
                <h4 className="text-app-primary mb-2">Privacy First</h4>
                <p className="text-app-secondary text-sm leading-relaxed">
                  All music files are processed locally in your browser. No files are uploaded to any server. Your music library stays completely private.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

