/**
 * LibrarySelector Component
 * 
 * Main component for selecting and managing music library folders.
 * Handles library root selection, permission management, collection switching,
 * and provides UI for library management operations.
 * 
 * Features:
 * - Library folder selection (File System Access API or fallback)
 * - Permission status checking and display
 * - Collection management (create, switch, rename, delete)
 * - Library relinking for moved folders
 * - Library root status display (scanned, needs relink, etc.)
 * - Support for multiple collections (library roots)
 * 
 * State Management:
 * - Uses `useLibraryRoot` hook for library root management
 * - Uses `useLibraryPermissions` hook for permission checking
 * - Uses `useCollectionSelection` hook for collection management
 * - Manages modal states (relink, collection manager)
 * 
 * User Flow:
 * 1. User clicks "Select Music Folder"
 * 2. System dialog opens (File System Access API or file input)
 * 3. User selects folder
 * 4. Permission is requested/checked
 * 5. Library root is saved to IndexedDB
 * 6. Component displays library status
 * 7. User can switch collections or relink if needed
 * 
 * Props:
 * - `onLibrarySelected`: Callback when library is selected
 * - `onPermissionStatus`: Callback when permission status changes
 * - `onCollectionChange`: Callback when collection is switched
 * - `onStartScan`: Callback to trigger scanning
 * - `refreshTrigger`: Number to trigger refresh (for external updates)
 * 
 * @module components/LibrarySelector
 * 
 * @example
 * ```tsx
 * <LibrarySelector
 *   onLibrarySelected={(root) => {
 *     // Handle library selection
 *     setLibraryRoot(root);
 *   }}
 *   onPermissionStatus={(status) => {
 *     // Handle permission status
 *     setPermissionStatus(status);
 *   }}
 *   onStartScan={() => {
 *     // Trigger scanning
 *     startScan();
 *   }}
 * />
 * ```
 */

"use client";

import { useState } from "react";
import { FolderOpen, Music, CheckCircle2, AlertCircle, RefreshCw, Database, ChevronDown, ChevronUp, Edit, X, Check, Settings } from "lucide-react";
import { needsReimport, type LibraryRoot, type PermissionStatus } from "@/lib/library-selection";
import { supportsFileSystemAccess } from "@/lib/feature-detection";
import { RelinkLibraryRoot } from "./RelinkLibraryRoot";
import { hasRelativePaths } from "@/features/library/relink";
import { Modal } from "./Modal";
import { CollectionManager } from "./CollectionManager";
import { SpotifyImport } from "./SpotifyImport";
import { useLibraryRoot } from "@/hooks/useLibraryRoot";
import { useLibraryPermissions } from "@/hooks/useLibraryPermissions";
import { useCollectionSelection } from "@/hooks/useCollectionSelection";
import { logger } from "@/lib/logger";

interface LibrarySelectorProps {
  onLibrarySelected?: (root: LibraryRoot) => void;
  onPermissionStatus?: (status: PermissionStatus) => void;
  onCollectionChange?: (collectionId: string | null) => void;
  onStartScan?: () => void; // Callback to trigger scanning
  refreshTrigger?: number;
}

export function LibrarySelector({
  onLibrarySelected,
  onPermissionStatus,
  onCollectionChange,
  onStartScan,
  refreshTrigger,
}: LibrarySelectorProps) {
  const [showRelink, setShowRelink] = useState(false);
  const [showCollectionManagerModal, setShowCollectionManagerModal] = useState(false);
  const [showSpotifyImport, setShowSpotifyImport] = useState(false);

  // Use hooks for library root, permissions, and collection management
  const {
    currentRoot,
    currentRootId,
    isLoading,
    error,
    canRelink,
    hasCompletedScan,
    hasRelativePathsCheck,
    handleChooseFolder,
    loadSavedLibrary,
  } = useLibraryRoot({
    onLibrarySelected,
    loadOnMount: true,
  });

  const { permissionStatus, checkPermission, requestPermission } = useLibraryPermissions({
    libraryRoot: currentRoot,
    onPermissionStatus,
    autoCheck: true,
  });

  const {
    currentCollectionId,
    currentCollectionName,
    collections,
    isEditingCollectionName,
    editingCollectionName,
    setEditingCollectionName,
    editingCollectionError,
    clearEditingCollectionError,
    showCollectionDropdown,
    handleSwitchCollection,
    handleStartEditCollectionName,
    handleSaveCollectionName,
    handleCancelEditCollectionName,
    setShowCollectionDropdown,
    loadCurrentCollection,
    dropdownRef,
  } = useCollectionSelection({
    refreshTrigger,
    onCollectionChange: async (collectionId) => {
      if (collectionId) {
        await loadCurrentCollection();
        await loadSavedLibrary();
        onCollectionChange?.(collectionId);
      } else {
        await loadCurrentCollection();
        await loadSavedLibrary();
        onCollectionChange?.(null);
      }
    },
    loadOnMount: true,
  });

  // Handle collection switching - also reload library root
  const handleSwitchCollectionWithReload = async (collectionId: string) => {
    await handleSwitchCollection(collectionId);
    await loadSavedLibrary();
  };

  const fileSystemSupported = supportsFileSystemAccess();
  const isHandleMode = currentRoot?.mode === "handle";
  const isFallbackMode = currentRoot?.mode === "fallback";

  return (
    <>
      <div className="max-w-6xl">
        <div className="bg-app-surface rounded-sm shadow-2xl p-6 md:p-8">
          <div className="text-center mb-6 relative">
            <button
              onClick={() => setShowCollectionManagerModal(true)}
              className="absolute top-0 right-0 p-2 hover:bg-app-hover rounded-sm transition-colors text-app-secondary hover:text-app-primary"
              aria-label="Manage collections"
              title="Manage collections"
            >
              <Settings className="size-5" />
            </button>
            <div className="inline-flex items-center justify-center size-16 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm mb-4">
              <Music className="size-8 text-white" />
            </div>

            <h2 className="text-app-primary mb-2 text-xl">Scan Your Music Library</h2>
            <p className="text-app-secondary mb-6 max-w-lg mx-auto leading-relaxed text-sm">
              Select your music folder to scan and analyze your audio files. We&apos;ll read the metadata to help create personalized playlists.
            </p>

          {/* Compact Status Bar */}
          {currentRoot && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              {/* Current Collection */}
              <div className="bg-app-hover rounded-sm p-3 border border-app-border relative">
                <div className="flex items-center gap-1.5 mb-1">
                  <Database className="size-3.5 text-accent-primary" />
                  <p className="text-app-secondary text-[10px] uppercase tracking-wider font-medium">
                    Current Collection
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    {isEditingCollectionName ? (
                      <div className="flex-1 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingCollectionName}
                          onChange={(e) => {
                            setEditingCollectionName(e.target.value);
                            clearEditingCollectionError();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveCollectionName();
                            } else if (e.key === "Escape") {
                              handleCancelEditCollectionName();
                            }
                          }}
                          className="flex-1 px-2 py-1 bg-app-surface text-app-primary rounded-sm border border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-sm"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveCollectionName}
                          className="p-1 hover:bg-accent-primary/20 text-accent-primary rounded-sm transition-colors shrink-0"
                          aria-label="Save"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          onClick={handleCancelEditCollectionName}
                          className="p-1 hover:bg-app-surface-hover text-app-secondary rounded-sm transition-colors shrink-0"
                          aria-label="Cancel"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 flex items-center gap-1.5 group min-w-0">
                          <p className="text-app-primary text-sm font-medium truncate">{currentCollectionName || "None"}</p>
                          {currentCollectionName && (
                            <button
                              onClick={handleStartEditCollectionName}
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-surface rounded-sm transition-all text-app-secondary hover:text-accent-primary shrink-0"
                              aria-label="Edit collection name"
                              title="Edit collection name"
                            >
                              <Edit className="size-3" />
                            </button>
                          )}
                        </div>
                        {collections.length > 1 && (
                          <div className="relative shrink-0" ref={dropdownRef}>
                            <button
                              onClick={() => setShowCollectionDropdown(!showCollectionDropdown)}
                              className="p-1 hover:bg-app-surface-hover rounded-sm transition-colors"
                              aria-label="Switch collection"
                            >
                              {showCollectionDropdown ? (
                                <ChevronUp className="size-4 text-app-secondary" />
                              ) : (
                                <ChevronDown className="size-4 text-app-secondary" />
                              )}
                            </button>
                            {showCollectionDropdown && (
                              <div className="absolute top-full right-0 mt-1 bg-app-surface border border-app-border rounded-sm shadow-lg z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
                                {collections.map((collection) => (
                                  <button
                                    key={collection.id}
                                    onClick={() => handleSwitchCollectionWithReload(collection.id)}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-app-hover transition-colors ${
                                      collection.id === currentCollectionId
                                        ? "bg-accent-primary/10 text-accent-primary"
                                        : "text-app-primary"
                                    }`}
                                  >
                                    <div className="font-medium">{collection.name}</div>
                                    {collection.id === currentCollectionId && (
                                      <div className="text-xs text-accent-primary mt-0.5">Current</div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {editingCollectionError && (
                    <div className="p-1.5 bg-red-500/10 border border-red-500/20 rounded-sm text-red-500 text-xs">
                      {editingCollectionError}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Folder */}
              <div className="bg-app-hover rounded-sm p-3 border border-app-border">
                <p className="text-app-secondary text-[10px] uppercase tracking-wider font-medium mb-1">
                  Selected Folder
                </p>
                <p className="text-app-primary text-sm font-medium truncate">{currentRoot.name}</p>
              </div>

              {/* Permission */}
              {permissionStatus && (
                <div className="bg-app-hover rounded-sm p-3 border border-app-border">
                  <p className="text-app-secondary text-[10px] uppercase tracking-wider font-medium mb-1">
                    Permission
                  </p>
                  <p className={`text-sm font-medium ${
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
            </div>
          )}

          {/* Warnings and Actions */}
          {currentRoot && (
            <div className="space-y-3 mb-6">
              {isFallbackMode && needsReimport(currentRoot) && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm flex items-start gap-2 text-left">
                  <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-500 text-xs">
                    Files selected via fallback mode cannot persist after page reload. You&apos;ll need to re-select the folder.
                  </p>
                </div>
              )}

              {permissionStatus === "prompt" && isHandleMode && (
                <div className="space-y-2">
                <button
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      // First, try requesting permission with the cached handle
                      // This should show the browser permission prompt if user activation is preserved
                      logger.debug("Attempting to request permission...");
                      await requestPermission();
                      
                      // Check permission status after request
                      await checkPermission();
                    }}
                  className="px-3 py-1.5 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors border border-app-border uppercase tracking-wider text-xs"
                >
                    Request permission
                  </button>
                  <p className="text-app-tertiary text-xs">
                    If no permission prompt appears, re-select your folder to get a fresh permission request.
                  </p>
                  <button
                    onClick={async () => {
                      // Re-select folder to get a fresh handle
                      // Force reset any existing picker state to ensure dialog always opens
                      // showDirectoryPicker() will automatically request permission and grant it
                      try {
                        const { pickLibraryRoot } = await import("@/lib/library-selection");
                        // Pass forceReset=true to ensure picker always opens
                        const newRoot = await pickLibraryRoot(true);
                        // pickLibraryRoot uses showDirectoryPicker which automatically grants permission
                        onLibrarySelected?.(newRoot);
                      } catch (error) {
                        // User cancelled or error occurred - that's OK
                        const errorMessage = (error as Error).message;
                        if (errorMessage === "Folder selection cancelled") {
                          // User cancelled - that's fine, don't log
                          return;
                        }
                        logger.error("Failed to re-select folder:", error);
                      }
                    }}
                    className="px-3 py-1.5 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors border border-accent-primary uppercase tracking-wider text-xs"
                  >
                    Re-select folder
                </button>
                </div>
              )}
              
              {permissionStatus === "denied" && isHandleMode && (
                <div className="space-y-2">
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm text-left">
                    <p className="text-red-500 text-xs mb-2">
                      Permission was denied. Please re-select your folder to grant access again.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      // Re-select folder to get a new handle and request permission
                      try {
                        const { pickLibraryRoot } = await import("@/lib/library-selection");
                        const newRoot = await pickLibraryRoot(true);
                        onLibrarySelected?.(newRoot);
                      } catch (error) {
                        // User cancelled or error occurred - that's OK
                      }
                    }}
                    className="px-3 py-1.5 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors border border-accent-primary uppercase tracking-wider text-xs"
                  >
                    Re-select folder
                  </button>
                </div>
              )}

              {hasRelativePathsCheck === false && currentRootId && hasCompletedScan && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-sm text-left">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertCircle className="size-4 text-yellow-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-yellow-500 text-xs font-medium mb-1">
                        Missing Relative Paths
                      </p>
                      <p className="text-yellow-500 text-xs">
                        Your library doesn&apos;t have relative paths stored. Playlist exports may not work correctly.
                      </p>
                    </div>
                  </div>
                  {canRelink && (
                    <>
                      {showRelink ? (
                        <RelinkLibraryRoot
                          libraryRootId={currentRootId}
                          onRelinkComplete={async (newRootId) => {
                            setShowRelink(false);
                            // Reload saved library to update state (including rootId and relative paths check)
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
                          className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded-sm transition-colors text-xs"
                        >
                          <RefreshCw className="size-3.5" />
                          Relink Library Root
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {!isLoading ? (
            <>
              {currentRoot && currentCollectionId ? (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      // Trigger scan by notifying parent that library is selected
                      // This will cause LibraryScanner to show scan UI and allow scanning
                      if (currentRoot) {
                        onLibrarySelected?.(currentRoot);
                        onStartScan?.();
                      }
                    }}
                    disabled={isLoading || permissionStatus !== "granted"}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                  >
                    <Music className="size-4" />
                    <span>Start Scanning</span>
                  </button>
                  <button
                    onClick={handleChooseFolder}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                  >
                    <FolderOpen className="size-4" />
                    <span>Add New Collection</span>
                  </button>
                  <button
                    onClick={() => setShowSpotifyImport(true)}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                  >
                    <Music className="size-4" />
                    <span>Import from Spotify</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={handleChooseFolder}
                      disabled={isLoading}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                    >
                      <FolderOpen className="size-4" />
                      <span>Select Music Folder</span>
                    </button>
                    <button
                      onClick={() => setShowSpotifyImport(true)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                    >
                      <Music className="size-4" />
                      <span>Import from Spotify</span>
                    </button>
                  </div>

                  <p className="text-app-tertiary mt-3 text-xs">
                    Supported formats: MP3, M4A, FLAC, WAV, OGG, and more
                  </p>
                </>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-accent-primary">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-accent-primary border-t-transparent" />
                <span className="uppercase tracking-wider text-sm">Selecting Folder...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-sm flex items-start gap-2 text-left max-w-lg mx-auto">
              <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-500 text-xs">{error}</p>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-app-border">
            <div className="flex items-start gap-3 text-left max-w-2xl mx-auto">
              <CheckCircle2 className="size-4 text-accent-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="text-app-primary mb-1 text-sm font-medium">Privacy First</h4>
                <p className="text-app-secondary text-xs leading-relaxed">
                  All music files are processed locally in your browser. No files are uploaded to any server. Your music library stays completely private.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Collection Manager Modal */}
      <Modal
        isOpen={showCollectionManagerModal}
        onClose={() => setShowCollectionManagerModal(false)}
        title="Manage Collections"
      >
        <CollectionManager
          refreshTrigger={refreshTrigger}
          onCollectionChange={async (collectionId) => {
            if (collectionId) {
              await loadCurrentCollection();
              await loadSavedLibrary();
              onCollectionChange?.(collectionId);
            } else {
              await loadCurrentCollection();
              await loadSavedLibrary();
              onCollectionChange?.(null);
            }
            setShowCollectionManagerModal(false);
          }}
        />
      </Modal>

      {/* Spotify Import Modal */}
      <Modal
        isOpen={showSpotifyImport}
        onClose={() => setShowSpotifyImport(false)}
        title="Import from Spotify"
      >
        <SpotifyImport
          onImportComplete={async (collectionId) => {
            // Set the new collection as current
            await loadCurrentCollection();
            await loadSavedLibrary();
            onCollectionChange?.(collectionId);
            setShowSpotifyImport(false);
          }}
          onClose={() => setShowSpotifyImport(false)}
        />
      </Modal>
    </>
  );
}

