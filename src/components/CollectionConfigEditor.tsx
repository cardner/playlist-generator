/**
 * CollectionConfigEditor Component
 * 
 * Modal/form component for editing collection configuration. Allows editing
 * collection name and relinking the directory handle (if using File System
 * Access API).
 * 
 * Features:
 * - Collection name editing with validation
 * - Duplicate name checking
 * - Directory handle relinking (for handle mode)
 * - Collection metadata display (mode, created/updated dates)
 * - Error handling and display
 * - Save/cancel actions
 * 
 * State Management:
 * - Manages form state (name, error, saving, relinking)
 * - Validates name uniqueness
 * - Handles directory relinking
 * 
 * Props:
 * - `collection`: The collection to edit
 * - `onSave`: Callback when changes are saved
 * - `onCancel`: Optional callback when editing is cancelled
 * 
 * @module components/CollectionConfigEditor
 * 
 * @example
 * ```tsx
 * <CollectionConfigEditor
 *   collection={selectedCollection}
 *   onSave={(updated) => {
 *     // Update collection
 *     updateCollection(updated);
 *   }}
 *   onCancel={() => setShowEditor(false)}
 * />
 * ```
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { X, Save, FolderOpen, AlertCircle, Calendar, HardDrive } from "lucide-react";
import type { LibraryRootRecord } from "@/db/schema";
import { updateCollection, relinkCollectionHandle, getAllCollections } from "@/db/storage";
import { pickLibraryRoot } from "@/lib/library-selection";
import { supportsFileSystemAccess } from "@/lib/feature-detection";

interface CollectionConfigEditorProps {
  collection: LibraryRootRecord;
  onSave?: (updatedCollection: LibraryRootRecord) => void;
  onCancel?: () => void;
}

export function CollectionConfigEditor({
  collection,
  onSave,
  onCancel,
}: CollectionConfigEditorProps) {
  const [name, setName] = useState(collection.name);
  const [isRelinking, setIsRelinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const relinkInProgressRef = useRef(false);

  useEffect(() => {
    setName(collection.name);
  }, [collection]);

  const validateName = async (newName: string): Promise<string | null> => {
    if (!newName.trim()) {
      return "Collection name cannot be empty";
    }

    // Check for duplicate names
    const allCollections = await getAllCollections();
    const duplicate = allCollections.find(
      (c) => c.id !== collection.id && c.name.toLowerCase() === newName.toLowerCase().trim()
    );
    if (duplicate) {
      return "A collection with this name already exists";
    }

    return null;
  };

  const handleRelink = async () => {
    if (!supportsFileSystemAccess()) {
      setError("Directory relinking is only available in browsers that support the File System Access API");
      return;
    }

    // Ref-based guard: blocks concurrent calls before React re-renders with disabled button
    if (relinkInProgressRef.current) {
      return;
    }
    relinkInProgressRef.current = true;
    setIsRelinking(true);
    setError(null);

    try {
      // Use pickLibraryRoot with forceReset to clear any stale picker state from other components
      const root = await pickLibraryRoot(true);
      
      if (root.mode !== "handle" || !root.handleId) {
        setError("Failed to get directory handle");
        return;
      }

      // Update the collection's handleRef
      await relinkCollectionHandle(collection.id, root.handleId);

      // Update local state
      const updatedCollection: LibraryRootRecord = {
        ...collection,
        handleRef: root.handleId,
        updatedAt: Date.now(),
      };

      onSave?.(updatedCollection);
    } catch (err) {
      if ((err as Error).name !== "AbortError" && (err as Error).message !== "Folder selection cancelled") {
        const errorMessage = err instanceof Error ? err.message : "Failed to relink directory";
        // Check for "picker already active" error
        if (errorMessage.includes("already active")) {
          setError("Please wait for the current folder selection to complete");
        } else {
          setError(errorMessage);
        }
      }
    } finally {
      relinkInProgressRef.current = false;
      setIsRelinking(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    const trimmedName = name.trim();

    // Validate name
    const validationError = await validateName(trimmedName);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);

    try {
      await updateCollection(collection.id, { name: trimmedName });

      const updatedCollection: LibraryRootRecord = {
        ...collection,
        name: trimmedName,
        updatedAt: Date.now(),
      };

      onSave?.(updatedCollection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save collection");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-app-primary text-xl font-semibold">Edit Collection</h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-2 hover:bg-app-hover rounded-sm transition-colors"
            aria-label="Close"
          >
            <X className="size-5 text-app-secondary" />
          </button>
        )}
      </div>

      {/* Collection Name */}
      <div>
        <label className="block text-app-primary font-medium mb-2 uppercase tracking-wider text-sm">
          Collection Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className="w-full px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
          placeholder="Enter collection name..."
          disabled={isSaving}
        />
        {error && (
          <p className="mt-2 text-red-500 text-sm flex items-center gap-1">
            <AlertCircle className="size-4" />
            {error}
          </p>
        )}
      </div>

      {/* Collection Metadata */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-app-secondary text-sm">
          <HardDrive className="size-4" />
          <span>Mode: {collection.mode === "handle" ? "Persistent Access" : "Fallback"}</span>
        </div>
        <div className="flex items-center gap-2 text-app-secondary text-sm">
          <Calendar className="size-4" />
          <span>Created: {formatDate(collection.createdAt)}</span>
        </div>
        {collection.updatedAt !== collection.createdAt && (
          <div className="flex items-center gap-2 text-app-secondary text-sm">
            <Calendar className="size-4" />
            <span>Last Updated: {formatDate(collection.updatedAt)}</span>
          </div>
        )}
      </div>

      {/* Relink Directory (for handle mode) */}
      {collection.mode === "handle" && (
        <div>
          <label className="block text-app-primary font-medium mb-2 uppercase tracking-wider text-sm">
            Directory Handle
          </label>
          <p className="text-app-secondary text-sm mb-3">
            If your music library folder has been moved, you can relink it to update file paths.
          </p>
          <button
            onClick={handleRelink}
            disabled={isRelinking || isSaving}
            className="flex items-center gap-3 px-4 py-3 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderOpen className="size-5 text-accent-primary shrink-0" />
            <span className="font-medium">
              {isRelinking ? "Selecting Folder..." : "Relink Directory"}
            </span>
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-app-border">
        <button
          onClick={handleSave}
          disabled={isSaving || name.trim() === collection.name}
          className="flex items-center gap-2 px-6 py-3 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          <Save className="size-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-3 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

