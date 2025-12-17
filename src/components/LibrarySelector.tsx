"use client";

import { useState, useEffect, useRef } from "react";
import { FolderOpen, Music, CheckCircle2, AlertCircle, RefreshCw, Database, ChevronDown, ChevronUp, Edit, X, Check, Settings } from "lucide-react";
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
import { getCurrentLibraryRoot, getCurrentCollectionId, getCollection, getAllCollections, setCurrentCollectionId, updateCollection } from "@/db/storage";
import type { LibraryRootRecord } from "@/db/schema";
import { Modal } from "./Modal";
import { CollectionManager } from "./CollectionManager";

interface LibrarySelectorProps {
  onLibrarySelected?: (root: LibraryRoot) => void;
  onPermissionStatus?: (status: PermissionStatus) => void;
  onCollectionChange?: (collectionId: string | null) => void;
  refreshTrigger?: number;
}

export function LibrarySelector({
  onLibrarySelected,
  onPermissionStatus,
  onCollectionChange,
  refreshTrigger,
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
  const [currentCollectionId, setCurrentCollectionId] = useState<string | null>(null);
  const [collections, setCollections] = useState<LibraryRootRecord[]>([]);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const [isEditingCollectionName, setIsEditingCollectionName] = useState(false);
  const [editingCollectionName, setEditingCollectionName] = useState<string>("");
  const [editingCollectionError, setEditingCollectionError] = useState<string | null>(null);
  const [showCollectionManagerModal, setShowCollectionManagerModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load saved library root on mount
  // But don't trigger onLibrarySelected to prevent auto-scanning
  useEffect(() => {
    loadSavedLibrary();
    loadCurrentCollection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load collections list
  useEffect(() => {
    loadCollections();
  }, [refreshTrigger]);

  // Reload current collection name when root changes or periodically to catch collection switches
  useEffect(() => {
    loadCurrentCollection();
    
    // Set up interval to check for collection changes (e.g., when switched from CollectionManager)
    const interval = setInterval(() => {
      loadCurrentCollection();
    }, 2000); // Check every 2 seconds
    
    return () => clearInterval(interval);
  }, [currentRootId, refreshTrigger]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCollectionDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function loadCollections() {
    try {
      const allCollections = await getAllCollections();
      setCollections(allCollections);
    } catch (err) {
      console.error("Failed to load collections:", err);
    }
  }

  async function loadCurrentCollection() {
    try {
      const collectionId = await getCurrentCollectionId();
      setCurrentCollectionId(collectionId || null);
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
      setCurrentCollectionId(null);
    }
  }

  async function handleSwitchCollection(collectionId: string) {
    await setCurrentCollectionId(collectionId);
    setShowCollectionDropdown(false);
    await loadCurrentCollection();
    onCollectionChange?.(collectionId);
  }

  async function handleStartEditCollectionName() {
    if (currentCollectionId) {
      const collection = await getCollection(currentCollectionId);
      if (collection) {
        setIsEditingCollectionName(true);
        setEditingCollectionName(collection.name);
        setEditingCollectionError(null);
      }
    }
  }

  async function handleSaveCollectionName() {
    if (!currentCollectionId) return;

    const trimmedName = editingCollectionName.trim();
    
    if (!trimmedName) {
      setEditingCollectionError("Collection name cannot be empty");
      return;
    }

    // Check for duplicate names
    const allCollections = await getAllCollections();
    const duplicate = allCollections.find(
      (c) => c.id !== currentCollectionId && c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setEditingCollectionError("A collection with this name already exists");
      return;
    }

    try {
      await updateCollection(currentCollectionId, { name: trimmedName });
      setIsEditingCollectionName(false);
      setEditingCollectionName("");
      setEditingCollectionError(null);
      await loadCurrentCollection();
      onCollectionChange?.(currentCollectionId);
    } catch (error) {
      console.error("Failed to update collection name:", error);
      setEditingCollectionError(error instanceof Error ? error.message : "Failed to save collection name");
    }
  }

  function handleCancelEditCollectionName() {
    setIsEditingCollectionName(false);
    setEditingCollectionName("");
    setEditingCollectionError(null);
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
                            setEditingCollectionError(null);
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
                                    onClick={() => handleSwitchCollection(collection.id)}
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
                <button
                  onClick={checkPermission}
                  className="px-3 py-1.5 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors border border-app-border uppercase tracking-wider text-xs"
                >
                  Re-request permission
                </button>
              )}

              {hasRelativePathsCheck === false && currentRootId && (
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
                      className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded-sm transition-colors text-xs"
                    >
                      <RefreshCw className="size-3.5" />
                      Relink Library Root
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!isLoading ? (
            <>
              <button
                onClick={handleChooseFolder}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
              >
                <FolderOpen className="size-4" />
                <span>Select Music Folder</span>
              </button>

              <p className="text-app-tertiary mt-3 text-xs">
                Supported formats: MP3, M4A, FLAC, WAV, OGG, and more
              </p>
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
    </>
  );
}

