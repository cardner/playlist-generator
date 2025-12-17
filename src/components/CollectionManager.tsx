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
} from "lucide-react";
import type { LibraryRootRecord } from "@/db/schema";
import {
  getAllCollections,
  getCurrentCollectionId,
  setCurrentCollectionId,
  deleteCollection,
  getTracks,
  getScanRuns,
} from "@/db/storage";
import { CollectionConfigEditor } from "./CollectionConfigEditor";

interface CollectionManagerProps {
  onCollectionChange?: (collectionId: string | null) => void;
}

export function CollectionManager({ onCollectionChange }: CollectionManagerProps) {
  const [collections, setCollections] = useState<LibraryRootRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
  }, []);

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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this collection? This will permanently remove all tracks, scans, and playlists associated with it.")) {
      return;
    }

    try {
      await deleteCollection(id);
      await loadCollections();
      
      // If we deleted the current collection, clear it
      if (id === currentId) {
        setCurrentId(null);
        onCollectionChange?.(null);
      }
    } catch (error) {
      console.error("Failed to delete collection:", error);
      alert("Failed to delete collection. Please try again.");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-app-primary text-lg font-semibold">Collections</h2>
      </div>

      {collections.map((collection) => {
        const stats = collectionStats.get(collection.id);
        const isCurrent = collection.id === currentId;
        const isEditing = editingId === collection.id;
        const isDeleting = deletingId === collection.id;

        if (isEditing) {
          return (
            <div
              key={collection.id}
              className="bg-app-surface rounded-sm p-6 border border-app-border"
            >
              <CollectionConfigEditor
                collection={collection}
                onSave={handleEditComplete}
                onCancel={() => setEditingId(null)}
              />
            </div>
          );
        }

        return (
          <div
            key={collection.id}
            className={`bg-app-surface rounded-sm p-4 border ${
              isCurrent ? "border-accent-primary" : "border-app-border"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-app-primary font-medium">{collection.name}</h3>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-primary/10 text-accent-primary rounded-sm text-xs font-medium">
                      <CheckCircle2 className="size-3" />
                      Current
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-app-secondary">
                  {stats && (
                    <>
                      <span>{stats.trackCount} tracks</span>
                      {stats.lastScanDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          Last scan: {formatDate(stats.lastScanDate)}
                        </span>
                      )}
                    </>
                  )}
                  <span className="flex items-center gap-1">
                    <HardDrive className="size-3" />
                    {collection.mode === "handle" ? "Persistent" : "Fallback"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isCurrent && (
                  <button
                    onClick={() => handleSelectCollection(collection.id)}
                    className="px-3 py-1.5 text-sm bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors"
                  >
                    Select
                  </button>
                )}
                <button
                  onClick={() => setEditingId(collection.id)}
                  disabled={isDeleting}
                  className="p-2 hover:bg-app-hover text-app-secondary hover:text-app-primary rounded-sm transition-colors disabled:opacity-50"
                  aria-label="Edit collection"
                >
                  <Edit className="size-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this collection? This will permanently remove all tracks, scans, and playlists associated with it.")) {
                      setDeletingId(collection.id);
                      handleDelete(collection.id);
                    }
                  }}
                  disabled={isDeleting}
                  className="p-2 hover:bg-red-500/10 text-app-secondary hover:text-red-500 rounded-sm transition-colors disabled:opacity-50"
                  aria-label="Delete collection"
                >
                  {isDeleting ? (
                    <AlertCircle className="size-4 animate-pulse" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

