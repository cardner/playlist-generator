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

import { useEffect, useState } from "react";
import { FolderOpen, Music, CheckCircle2, AlertCircle, RefreshCw, Database, ChevronDown, ChevronUp, Edit, X, Check, Settings, Download, AlertTriangle } from "lucide-react";
import { needsReimport, type LibraryRoot, type PermissionStatus } from "@/lib/library-selection";
import { getScanRuns, getTracks } from "@/db/storage";
import { supportsFileSystemAccess } from "@/lib/feature-detection";
import { RelinkLibraryRoot } from "./RelinkLibraryRoot";
import { hasRelativePaths } from "@/features/library/relink";
import { Modal } from "./Modal";
import { CollectionManager } from "./CollectionManager";
import { SpotifyImport } from "./SpotifyImport";
import { MetadataEnhancement } from "./MetadataEnhancement";
import { useLibraryRoot } from "@/hooks/useLibraryRoot";
import { useLibraryPermissions } from "@/hooks/useLibraryPermissions";
import { useCollectionSelection } from "@/hooks/useCollectionSelection";
import { logger } from "@/lib/logger";
import { exportCollection } from "@/db/storage-collection-import";

interface LibrarySelectorProps {
  onLibrarySelected?: (root: LibraryRoot) => void;
  onPermissionStatus?: (status: PermissionStatus) => void;
  onCollectionChange?: (collectionId: string | null) => void;
  onStartScan?: () => void; // Callback to trigger scanning
  onMetadataEnhancementComplete?: () => void;
  refreshTrigger?: number;
}

export function LibrarySelector({
  onLibrarySelected,
  onPermissionStatus,
  onCollectionChange,
  onStartScan,
  onMetadataEnhancementComplete,
  refreshTrigger,
}: LibrarySelectorProps) {
  const [showRelink, setShowRelink] = useState(false);
  const [showCollectionManagerModal, setShowCollectionManagerModal] = useState(false);
  const [showSpotifyImport, setShowSpotifyImport] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [trackCount, setTrackCount] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [enhanceAction, setEnhanceAction] = useState<(() => void) | null>(null);

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
    handleReSelectFolder,
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

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      if (!currentRootId) {
        setTrackCount(null);
        setLastSyncedAt(null);
        return;
      }
      try {
        const [tracks, scanRuns] = await Promise.all([
          getTracks(currentRootId),
          getScanRuns(currentRootId),
        ]);
        if (cancelled) return;
        setTrackCount(tracks.length);
        const lastFinished = scanRuns
          .filter((run) => run.finishedAt)
          .reduce<number | null>(
            (latest, run) =>
              run.finishedAt && (!latest || run.finishedAt > latest)
                ? run.finishedAt
                : latest,
            null
          );
        setLastSyncedAt(lastFinished);
      } catch (statsError) {
        if (!cancelled) {
          logger.error("Failed to load collection stats:", statsError);
          setTrackCount(null);
          setLastSyncedAt(null);
        }
      }
    };
    loadStats();
    return () => {
      cancelled = true;
    };
  }, [currentRootId]);

  const handleExportCollection = async (collectionId: string) => {
    setExportingId(collectionId);
    try {
      const exportData = await exportCollection(collectionId);
      const collection = collections.find((c) => c.id === collectionId);
      const fileName = `${collection?.name || "collection"}-${Date.now()}.json`;

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (exportError) {
      logger.error("Failed to export collection:", exportError);
      alert(
        `Failed to export collection: ${
          exportError instanceof Error ? exportError.message : "Unknown error"
        }`
      );
    } finally {
      setExportingId(null);
    }
  };

  const fileSystemSupported = supportsFileSystemAccess();
  const isHandleMode = currentRoot?.mode === "handle";
  const isFallbackMode = currentRoot?.mode === "fallback";
  const warningMessage =
    error ??
    (isFallbackMode && currentRoot && needsReimport(currentRoot)
      ? "Files selected via fallback mode cannot persist after page reload. You'll need to re-select the folder."
      : hasRelativePathsCheck === false && currentRootId && hasCompletedScan
      ? "Missing relative paths. Playlist exports may not work correctly."
      : null);
  const otherCollections = collections.filter((collection) => collection.id !== currentCollectionId);
  const showGhostCard = currentRoot && otherCollections.length === 0;
  const showPermissionActions =
    isHandleMode && (permissionStatus === "prompt" || permissionStatus === "denied");

  const formatSyncDate = (timestamp: number | null) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <div className="max-w-6xl">
        <div className="bg-app-surface rounded-sm shadow-2xl p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-4">
              <div className="inline-flex items-center justify-center size-12 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm">
                <Music className="size-6 text-white" />
              </div>
              <div>
                <h2 className="text-app-primary text-lg">Scan Your Music Library</h2>
                <p className="text-app-secondary max-w-lg leading-relaxed text-sm">
                  Select your music folder to scan and analyze your audio files. We&apos;ll read the metadata to help create personalized playlists.
                </p>
              </div>
            </div>
            {!isLoading && (
              <div className="flex flex-col items-end gap-2">
                {currentRoot && currentCollectionId && (
                  <button
                    onClick={handleChooseFolder}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-xs"
                  >
                    <FolderOpen className="size-3.5" />
                    <span>Add New Collection</span>
                  </button>
                )}
                <button
                  onClick={() => setShowSpotifyImport(true)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-xs"
                >
                  <Music className="size-3.5" />
                  <span>Import from Spotify</span>
                </button>
              </div>
            )}
          </div>

          {/* Compact Collection Summary */}
          {currentRoot && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-app-hover rounded-sm border border-app-border p-3 md:p-4 md:col-span-2 relative">
                <div className="absolute left-3 top-5">
                  <div className="relative">
                    <Database className="size-4 text-accent-primary" />
                    {warningMessage && (
                      <span
                        title={warningMessage}
                        className="absolute -left-2 -top-1"
                      >
                        <AlertTriangle className="size-3.5 text-yellow-400" aria-hidden />
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0 pl-6">
                  <div className="flex items-baseline gap-2">
                  {isEditingCollectionName ? (
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                      <span
                        title={
                          permissionStatus === "granted"
                            ? "Permission granted"
                            : permissionStatus === "denied"
                            ? "Permission denied"
                            : "Permission prompt required"
                        }
                        className="shrink-0"
                      >
                        {permissionStatus === "granted" ? (
                          <CheckCircle2 className="size-4 text-accent-primary" aria-hidden />
                        ) : permissionStatus === "denied" ? (
                          <X className="size-4 text-red-500" aria-hidden />
                        ) : (
                          <AlertCircle className="size-4 text-app-tertiary" aria-hidden />
                        )}
                      </span>
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
                      <div className="flex-1 flex flex-col gap-1.5 min-w-0 group">
                        <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          title={
                            permissionStatus === "granted"
                              ? "Permission granted"
                              : permissionStatus === "denied"
                              ? "Permission denied"
                              : "Permission prompt required"
                          }
                          className="shrink-0"
                        >
                          {permissionStatus === "granted" ? (
                            <CheckCircle2 className="size-4 text-accent-primary" aria-hidden />
                          ) : permissionStatus === "denied" ? (
                            <X className="size-4 text-red-500" aria-hidden />
                          ) : (
                            <AlertCircle className="size-4 text-app-tertiary" aria-hidden />
                          )}
                        </span>
                        <p className="text-app-primary text-base font-semibold truncate -mt-0.5">
                          {currentCollectionName || "None"}
                        </p>
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
                        {currentCollectionId && (
                          <button
                            onClick={() => handleExportCollection(currentCollectionId)}
                            disabled={exportingId === currentCollectionId}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-surface rounded-sm transition-all text-app-secondary hover:text-app-primary shrink-0 disabled:opacity-50"
                            aria-label="Export collection"
                            title="Export collection"
                          >
                            <Download className="size-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setShowCollectionManagerModal(true)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-surface rounded-sm transition-all text-app-secondary hover:text-app-primary shrink-0"
                          aria-label="Manage collections"
                          title="Manage collections"
                        >
                          <Settings className="size-3.5" />
                        </button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              if (currentRoot) {
                                onLibrarySelected?.(currentRoot);
                                onStartScan?.();
                              }
                            }}
                            disabled={isLoading || permissionStatus !== "granted"}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-[10px] w-fit"
                          >
                            <Music className="size-3.5" />
                            <span>Start Scanning</span>
                          </button>
                          <button
                            onClick={() => enhanceAction?.()}
                            disabled={!enhanceAction || isLoading || !currentRootId}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-[10px] w-fit"
                          >
                            <span>Enhance metadata</span>
                          </button>
                        </div>
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
                  <div className="mt-2 p-1.5 bg-red-500/10 border border-red-500/20 rounded-sm text-red-500 text-xs">
                    {editingCollectionError}
                  </div>
                )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {showPermissionActions ? (
                      <div className="flex flex-col items-end gap-1">
                        {permissionStatus === "prompt" && (
                          <button
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              logger.debug("Attempting to request permission...");
                              await requestPermission();
                              await checkPermission();
                            }}
                            className="px-2 py-0.5 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors border border-app-border uppercase tracking-wider text-[9px]"
                          >
                            Request permission
                          </button>
                        )}
                        <button
                          onClick={handleReSelectFolder}
                          disabled={isLoading}
                          className="px-2 py-0.5 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors border border-accent-primary uppercase tracking-wider text-[9px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Re-select folder
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-[10px] text-app-tertiary space-y-1 max-w-[220px]">
                        <div className="flex items-center justify-end gap-1">
                          <span>Tracks</span>
                          <span className="text-app-secondary tabular-nums">
                            {trackCount ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <span>Last synced</span>
                          <span className="text-app-secondary tabular-nums">
                            {formatSyncDate(lastSyncedAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <span>Folder</span>
                          <span
                            className="text-app-secondary truncate max-w-[140px]"
                            title={currentRoot.name}
                          >
                            {currentRoot.name}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {otherCollections.map((collection) => (
                <button
                  key={collection.id}
                  onClick={() => handleSwitchCollectionWithReload(collection.id)}
                  className="bg-app-hover rounded-sm border border-app-border p-3 text-left hover:bg-app-surface-hover transition-colors md:col-span-1"
                >
                  <div className="text-[10px] uppercase tracking-wider text-app-tertiary mb-1">Collection</div>
                  <div className="text-app-primary text-sm font-semibold truncate">
                    {collection.name}
                  </div>
                </button>
              ))}
              {showGhostCard && (
                <button
                  onClick={handleChooseFolder}
                  className="bg-app-surface/40 border border-dashed border-app-border p-4 text-center hover:bg-app-surface-hover transition-colors md:col-span-1 rounded-md flex flex-col items-center justify-center gap-2"
                >
                  <div className="text-[10px] uppercase tracking-wider text-app-tertiary">
                    Add a collection
                  </div>
                  <span className="text-app-tertiary text-2xl leading-none">+</span>
                </button>
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
              {!currentRoot || !currentCollectionId ? (
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
                  </div>

                  <p className="text-app-tertiary mt-3 text-xs">
                    Supported formats: MP3, M4A, FLAC, WAV, OGG, and more
                  </p>
                </>
              ) : null}
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
            <div className={currentRootId ? "grid gap-4 md:grid-cols-2" : ""}>
              <div className="flex items-start gap-3 text-left max-w-2xl mx-auto md:max-w-none">
                <CheckCircle2 className="size-4 text-accent-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-app-primary mb-2 text-sm font-medium">Privacy First</h4>
                  <p className="text-app-secondary text-xs leading-relaxed">
                    All music files are processed locally in your browser. No files are uploaded to any server. Your music library stays completely private.
                  </p>
                </div>
              </div>
              {currentRootId && (
                <MetadataEnhancement
                  libraryRootId={currentRootId}
                  onComplete={onMetadataEnhancementComplete}
                  hideActionButton={true}
                  onStartEnhancementReady={(start) => setEnhanceAction(() => start)}
                />
              )}
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

