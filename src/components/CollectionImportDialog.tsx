/**
 * Collection Import Dialog Component
 *
 * Dialog for confirming collection import when a collection with the same name exists.
 * Allows user to choose: replace existing, create new with modified name, or cancel.
 *
 * @module components/CollectionImportDialog
 */

"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Music, Calendar, HardDrive } from "lucide-react";
import type { CollectionExport } from "@/db/storage-collection-import";
import type { LibraryRootRecord } from "@/db/schema";
import { Dialog, Button, Input } from "@/design-system/components";

interface CollectionImportDialogProps {
  /** Export data being imported */
  exportData: CollectionExport;
  /** Existing collection with same name (if any) */
  existingCollection?: LibraryRootRecord;
  /** Existing collection stats */
  existingStats?: {
    trackCount: number;
    lastScanDate: number | null;
  };
  /** Callback when user confirms import */
  onConfirm: (options: { replaceExisting: boolean; newName?: string; setAsCurrent?: boolean }) => void;
  /** Callback when user cancels */
  onCancel: () => void;
}

export function CollectionImportDialog({
  exportData,
  existingCollection,
  existingStats,
  onConfirm,
  onCancel,
}: CollectionImportDialogProps) {
  const [action, setAction] = useState<"replace" | "create">(existingCollection ? "replace" : "create");
  const [newName, setNewName] = useState("");
  const [setAsCurrent, setSetAsCurrent] = useState(true);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleConfirm = () => {
    if (action === "create" && existingCollection && !newName.trim()) {
      return;
    }
    onConfirm({
      replaceExisting: action === "replace",
      newName: action === "create" && existingCollection ? newName.trim() : undefined,
      setAsCurrent,
    });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()} title="Import Collection">
      <Dialog.Body className="p-6">
        {/* Import Preview */}
        <div className="mb-6 p-4 bg-app-hover rounded-sm border border-app-border">
          <h3 className="text-app-primary font-medium mb-3 text-sm uppercase tracking-wider">
            Collection to Import
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Music className="size-4 text-app-secondary" />
              <span className="text-app-primary font-medium">{exportData.collection.name}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-app-secondary">
              <span>{exportData.tracks.length} tracks</span>
              {exportData.savedPlaylists.length > 0 && (
                <span>{exportData.savedPlaylists.length} playlists</span>
              )}
              {exportData.scanRuns.length > 0 && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {formatDate(exportData.exportedAt)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <HardDrive className="size-3" />
                {exportData.collection.mode === "handle" ? "Persistent" : "Fallback"}
              </span>
            </div>
          </div>
        </div>

        {/* Conflict Warning */}
        {existingCollection && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-sm">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-yellow-500 font-medium mb-1">Collection Name Conflict</h3>
                <p className="text-app-secondary text-sm">
                  A collection named &quot;{existingCollection.name}&quot; already exists.
                </p>
              </div>
            </div>
            <div className="ml-7 p-3 bg-app-surface rounded-sm border border-app-border">
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Music className="size-3.5 text-app-secondary" />
                  <span className="text-app-primary">{existingCollection.name}</span>
                </div>
                {existingStats && (
                  <div className="flex flex-wrap items-center gap-3 text-app-secondary text-xs">
                    <span>{existingStats.trackCount} tracks</span>
                    {existingStats.lastScanDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {formatDate(existingStats.lastScanDate)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Selection */}
        <div className="mb-6 space-y-3">
          <h3 className="text-app-primary font-medium text-sm uppercase tracking-wider mb-3">
            Import Options
          </h3>

          {existingCollection ? (
            <>
              <label className="flex items-start gap-3 p-3 border border-app-border rounded-sm cursor-pointer hover:bg-app-hover transition-colors">
                <input
                  type="radio"
                  name="import-action"
                  value="replace"
                  checked={action === "replace"}
                  onChange={() => setAction("replace")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-app-primary font-medium text-sm mb-1">Replace Existing Collection</div>
                  <div className="text-app-secondary text-xs">
                    Delete the existing collection and import the new one. This action cannot be undone.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 border border-app-border rounded-sm cursor-pointer hover:bg-app-hover transition-colors">
                <input
                  type="radio"
                  name="import-action"
                  value="create"
                  checked={action === "create"}
                  onChange={() => setAction("create")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-app-primary font-medium text-sm mb-1">Create New Collection</div>
                  <div className="text-app-secondary text-xs mb-2">
                    Keep the existing collection and create a new one with a different name.
                  </div>
                  {action === "create" && (
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={`${exportData.collection.name} (1)`}
                      className="mt-2"
                    />
                  )}
                </div>
              </label>
            </>
          ) : (
            <div className="p-3 border border-app-border rounded-sm bg-app-hover">
              <div className="flex items-center gap-2 text-app-primary text-sm">
                <CheckCircle2 className="size-4 text-green-500" />
                <span>No conflicts detected. Collection will be imported with its original name.</span>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 p-3 border border-app-border rounded-sm cursor-pointer hover:bg-app-hover transition-colors">
            <input
              type="checkbox"
              checked={setAsCurrent}
              onChange={(e) => setSetAsCurrent(e.target.checked)}
            />
            <span className="text-app-primary text-sm">Set as current collection after import</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={action === "create" && existingCollection && !newName.trim()}
          >
            {action === "replace" ? "Replace and Import" : "Import Collection"}
          </Button>
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
