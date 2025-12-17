"use client";

import { useState, useEffect } from "react";
import {
  Music,
  Edit,
  Trash2,
  CheckCircle2,
  Calendar,
  HardDrive,
  X,
  AlertCircle,
  Check,
} from "lucide-react";
import type { LibraryRootRecord } from "@/db/schema";
import {
  getAllCollections,
  getCurrentCollectionId,
  setCurrentCollectionId,
  deleteCollection,
  getTracks,
  getScanRuns,
  updateCollection,
} from "@/db/storage";
import { CollectionConfigEditor } from "./CollectionConfigEditor";

interface CollectionManagerProps {
  onCollectionChange?: (collectionId: string | null) => void;
  refreshTrigger?: number; // Increment to trigger refresh
}

export function CollectionManager({ onCollectionChange, refreshTrigger }: CollectionManagerProps) {
  const [collections, setCollections] = useState<LibraryRootRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineEditingName, setInlineEditingName] = useState<string>("");
  const [inlineEditingError, setInlineEditingError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collectionStats, setCollectionStats] = useState<
    Map<string, { trackCount: number; lastScanDate: number | null }>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const loadCollections = async () => {
    setIsLoading(true);
    try {
      const allCollections = await getAllCollections();
      setCollections(allCollections);

      const currentCollectionId = await getCurrentCollectionId();
      setCurrentId(currentCollectionId || null);

      // Load stats for each collection
      const statsMap = new Map<
        string,
        { trackCount: number; lastScanDate: number | null }
      >();
      for (const collection of allCollections) {
        const tracks = await getTracks(collection.id);
        const scanRuns = await getScanRuns(collection.id);
        const lastScan = scanRuns
          .filter((run) => run.finishedAt)
          .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))[0];

        statsMap.set(collection.id, {
          trackCount: tracks.length,
          lastScanDate: lastScan?.finishedAt || null,
        });
      }
      setCollectionStats(statsMap);
    } catch (error) {
      console.error("Failed to load collections:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, [refreshTrigger]);

  const handleSelectCollection = async (id: string) => {
    await setCurrentCollectionId(id);
    setCurrentId(id);
    onCollectionChange?.(id);
  };

  const handleEditComplete = async (updatedCollection: LibraryRootRecord) => {
    setEditingId(null);
    await loadCollections();
    // If the edited collection is the current one, notify parent
    if (updatedCollection.id === currentId) {
      onCollectionChange?.(updatedCollection.id);
    }
  };

  const handleStartInlineEdit = (collection: LibraryRootRecord) => {
    setInlineEditingId(collection.id);
    setInlineEditingName(collection.name);
    setInlineEditingError(null);
  };

  const handleCancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineEditingName("");
    setInlineEditingError(null);
  };

  const handleSaveInlineEdit = async (collectionId: string) => {
    const trimmedName = inlineEditingName.trim();
    
    if (!trimmedName) {
      setInlineEditingError("Collection name cannot be empty");
      return;
    }

    // Check for duplicate names
    const allCollections = await getAllCollections();
    const duplicate = allCollections.find(
      (c) => c.id !== collectionId && c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setInlineEditingError("A collection with this name already exists");
      return;
    }

    try {
      await updateCollection(collectionId, { name: trimmedName });
      setInlineEditingId(null);
      setInlineEditingName("");
      setInlineEditingError(null);
      await loadCollections();
      
      // If the edited collection is the current one, notify parent
      if (collectionId === currentId) {
        onCollectionChange?.(collectionId);
      }
    } catch (error) {
      console.error("Failed to update collection name:", error);
      setInlineEditingError(error instanceof Error ? error.message : "Failed to save collection name");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this collection? This will permanently remove all tracks, scans, and playlists associated with it.")) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteCollection(id);
      
      // If we deleted the current collection, clear it
      if (id === currentId) {
        setCurrentId(null);
        onCollectionChange?.(null);
      }
      
      // Reload collections after successful delete
      await loadCollections();
    } catch (error) {
      console.error("Failed to delete collection:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to delete collection: ${errorMessage}. Please try again.`);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="bg-app-surface rounded-sm p-6 border border-app-border">
        <p className="text-app-secondary">Loading collections...</p>
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="bg-app-surface rounded-sm p-6 border border-app-border">
        <div className="text-center py-8">
          <Music className="size-12 text-app-tertiary mx-auto mb-4" />
          <h3 className="text-app-primary font-medium mb-2">No Collections</h3>
          <p className="text-app-secondary text-sm">
            Scan a music folder to create your first collection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-app-surface rounded-sm border border-app-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-app-primary text-base font-semibold">All Collections</h2>
      </div>

      <div className="space-y-2">
        {collections.map((collection) => {
          const stats = collectionStats.get(collection.id);
          const isCurrent = collection.id === currentId;
          const isEditing = editingId === collection.id;
          const isDeleting = deletingId === collection.id;

          if (isEditing) {
            return (
              <div
                key={collection.id}
                className="bg-app-hover rounded-sm p-4 border border-app-border"
              >
                <CollectionConfigEditor
                  collection={collection}
                  onSave={handleEditComplete}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            );
          }

          const isInlineEditing = inlineEditingId === collection.id;

          return (
            <div
              key={collection.id}
              className={`bg-app-hover rounded-sm p-3 border ${
                isCurrent ? "border-accent-primary" : "border-app-border"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isInlineEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={inlineEditingName}
                          onChange={(e) => {
                            setInlineEditingName(e.target.value);
                            setInlineEditingError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveInlineEdit(collection.id);
                            } else if (e.key === "Escape") {
                              handleCancelInlineEdit();
                            }
                          }}
                          className="flex-1 px-2 py-1 bg-app-surface text-app-primary rounded-sm border border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveInlineEdit(collection.id)}
                          className="p-1 hover:bg-accent-primary/20 text-accent-primary rounded-sm transition-colors"
                          aria-label="Save"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          onClick={handleCancelInlineEdit}
                          className="p-1 hover:bg-app-surface-hover text-app-secondary rounded-sm transition-colors"
                          aria-label="Cancel"
                        >
                          <X className="size-3.5" />
                        </button>
                        {inlineEditingError && (
                          <span className="text-red-500 text-xs">{inlineEditingError}</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 group">
                          <h3 
                            className="text-app-primary font-medium text-sm truncate cursor-pointer hover:text-accent-primary transition-colors"
                            onClick={() => handleStartInlineEdit(collection)}
                            title="Click to edit name"
                          >
                            {collection.name}
                          </h3>
                          <button
                            onClick={() => handleStartInlineEdit(collection)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-surface rounded-sm transition-all text-app-secondary hover:text-accent-primary"
                            aria-label="Edit collection name"
                            title="Edit collection name"
                          >
                            <Edit className="size-3" />
                          </button>
                        </div>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent-primary/10 text-accent-primary rounded-sm text-[10px] font-medium shrink-0">
                            <CheckCircle2 className="size-2.5" />
                            Current
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-app-secondary">
                    {stats && (
                      <>
                        <span>{stats.trackCount} tracks</span>
                        {stats.lastScanDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="size-2.5" />
                            {formatDate(stats.lastScanDate)}
                          </span>
                        )}
                      </>
                    )}
                    <span className="flex items-center gap-1">
                      <HardDrive className="size-2.5" />
                      {collection.mode === "handle" ? "Persistent" : "Fallback"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!isCurrent && (
                    <button
                      onClick={() => handleSelectCollection(collection.id)}
                      className="px-2 py-1 text-xs bg-app-surface hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors border border-app-border"
                    >
                      Select
                    </button>
                  )}
                  <button
                    onClick={() => setEditingId(collection.id)}
                    disabled={isDeleting}
                    className="p-1.5 hover:bg-app-surface text-app-secondary hover:text-app-primary rounded-sm transition-colors disabled:opacity-50"
                    aria-label="Edit collection"
                  >
                    <Edit className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(collection.id)}
                    disabled={isDeleting || deletingId === collection.id}
                    className="p-1.5 hover:bg-red-500/10 text-app-secondary hover:text-red-500 rounded-sm transition-colors disabled:opacity-50"
                    aria-label="Delete collection"
                  >
                    {deletingId === collection.id ? (
                      <AlertCircle className="size-3.5 animate-pulse" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

