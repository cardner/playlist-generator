/**
 * Playlist Import Dialog Component
 *
 * Dialog for confirming playlist import. User selects the target collection
 * to assign imported playlists to.
 *
 * @module components/PlaylistImportDialog
 */

"use client";

import { useState } from "react";
import { Music, Calendar, CheckCircle2 } from "lucide-react";
import type { PlaylistExport } from "@/db/storage-playlist-import";
import type { LibraryRootRecord } from "@/db/schema";
import { Dialog, Button } from "@/design-system/components";

interface PlaylistImportDialogProps {
  /** Export data being imported */
  exportData: PlaylistExport;
  /** Available collections to assign playlists to */
  collections: LibraryRootRecord[];
  /** Callback when user confirms import */
  onConfirm: (targetCollectionId: string) => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Whether import is in progress */
  importing?: boolean;
}

export function PlaylistImportDialog({
  exportData,
  collections,
  onConfirm,
  onCancel,
  importing = false,
}: PlaylistImportDialogProps) {
  const [targetCollectionId, setTargetCollectionId] = useState<string>(
    collections[0]?.id ?? ""
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleConfirm = () => {
    if (targetCollectionId) {
      onConfirm(targetCollectionId);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()} title="Import Playlists">
      <Dialog.Body className="p-6">
        {/* Import Preview */}
        <div className="mb-6 p-4 bg-app-hover rounded-sm border border-app-border">
          <h3 className="text-app-primary font-medium mb-3 text-sm uppercase tracking-wider">
            Playlists to Import
          </h3>
          <div className="space-y-2 text-sm mb-3">
            {exportData.playlists.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Music className="size-4 text-app-secondary shrink-0" />
                <span className="text-app-primary truncate">{p.title}</span>
                <span className="text-app-tertiary text-xs shrink-0">
                  ({p.trackFileIds.length} tracks)
                </span>
              </div>
            ))}
            {exportData.playlists.length > 5 && (
              <div className="text-app-tertiary text-xs pl-6">
                +{exportData.playlists.length - 5} more playlists
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-app-secondary text-xs">
            <span>{exportData.playlists.length} playlists total</span>
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {formatDate(exportData.exportedAt)}
            </span>
          </div>
        </div>

        {/* Target Collection Selection */}
        <div className="mb-6">
          <h3 className="text-app-primary font-medium text-sm uppercase tracking-wider mb-3">
            Target Collection
          </h3>
          <p className="text-app-secondary text-sm mb-3">
            Select the collection to assign these playlists to. Tracks will be
            fuzzy-matched by title, artist, and album when possible.
          </p>
          <select
            value={targetCollectionId}
            onChange={(e) => setTargetCollectionId(e.target.value)}
            className="w-full px-4 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm disabled:opacity-50"
            disabled={importing || collections.length === 0}
          >
            {collections.length === 0 ? (
              <option value="">No collections available</option>
            ) : (
              collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Info */}
        <div className="mb-6 p-3 bg-app-hover rounded-sm border border-app-border">
          <div className="flex items-start gap-2 text-sm text-app-secondary">
            <CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" />
            <span>
              Imported playlists will receive new IDs. Original playlists are
              not modified.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={
              importing ||
              !targetCollectionId ||
              collections.length === 0 ||
              exportData.playlists.length === 0
            }
          >
            {importing ? "Importing..." : "Import Playlists"}
          </Button>
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
