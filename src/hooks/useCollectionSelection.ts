/**
 * useCollectionSelection Hook
 * 
 * Manages collection selection, switching, and name editing.
 * Handles loading collections, switching between them, and editing collection names.
 * 
 * @example
 * ```tsx
 * const {
 *   currentCollectionId,
 *   currentCollectionName,
 *   collections,
 *   isEditingCollectionName,
 *   editingCollectionError,
 *   showCollectionDropdown,
 *   handleSwitchCollection,
 *   handleStartEditCollectionName,
 *   handleSaveCollectionName,
 *   handleCancelEditCollectionName,
 *   setShowCollectionDropdown,
 * } = useCollectionSelection({
 *   refreshTrigger,
 *   onCollectionChange,
 * });
 * ```
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getCurrentCollectionId,
  getCollection,
  getAllCollections,
  setCurrentCollectionId as setCurrentCollectionIdInDb,
  updateCollection,
} from "@/db/storage";
import { logger } from "@/lib/logger";

export interface UseCollectionSelectionOptions {
  /** Refresh trigger to reload collections */
  refreshTrigger?: number;
  /** Callback when collection changes */
  onCollectionChange?: (collectionId: string | null) => void;
  /** Whether to load current collection on mount */
  loadOnMount?: boolean;
}

export interface UseCollectionSelectionReturn {
  /** Current collection ID */
  currentCollectionId: string | null;
  /** Current collection name */
  currentCollectionName: string | null;
  /** All available collections */
  collections: Array<{ id: string; name: string }>;
  /** Whether collection name is being edited */
  isEditingCollectionName: boolean;
  /** Current editing collection name value */
  editingCollectionName: string;
  /** Set editing collection name value */
  setEditingCollectionName: (name: string) => void;
  /** Error message for collection name editing */
  editingCollectionError: string | null;
  /** Clear editing collection error */
  clearEditingCollectionError: () => void;
  /** Whether collection dropdown is visible */
  showCollectionDropdown: boolean;
  /** Switch to a different collection */
  handleSwitchCollection: (collectionId: string) => Promise<void>;
  /** Start editing collection name */
  handleStartEditCollectionName: () => Promise<void>;
  /** Save edited collection name */
  handleSaveCollectionName: () => Promise<void>;
  /** Cancel editing collection name */
  handleCancelEditCollectionName: () => void;
  /** Set collection dropdown visibility */
  setShowCollectionDropdown: (show: boolean) => void;
  /** Load current collection */
  loadCurrentCollection: () => Promise<void>;
  /** Load all collections */
  loadCollections: () => Promise<void>;
  /** Ref for dropdown element (for click outside detection) */
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook for managing collection selection and editing
 */
export function useCollectionSelection(
  options: UseCollectionSelectionOptions = {}
): UseCollectionSelectionReturn {
  const { refreshTrigger, onCollectionChange, loadOnMount = true } = options;

  const [currentCollectionId, setCurrentCollectionId] = useState<string | null>(null);
  const [currentCollectionName, setCurrentCollectionName] = useState<string | null>(null);
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([]);
  const [isEditingCollectionName, setIsEditingCollectionName] = useState(false);
  const [editingCollectionName, setEditingCollectionName] = useState<string>("");
  const [editingCollectionError, setEditingCollectionError] = useState<string | null>(null);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * Load all collections
   */
  const loadCollections = useCallback(async () => {
    try {
      const allCollections = await getAllCollections();
      setCollections(allCollections);
    } catch (err) {
      logger.error("Failed to load collections:", err);
    }
  }, []);

  /**
   * Load current collection
   */
  const loadCurrentCollection = useCallback(async () => {
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
      logger.error("Failed to load current collection:", err);
      setCurrentCollectionName(null);
      setCurrentCollectionId(null);
    }
  }, []);

  /**
   * Switch to a different collection
   */
  const handleSwitchCollection = useCallback(
    async (collectionId: string) => {
      await setCurrentCollectionIdInDb(collectionId);
      setShowCollectionDropdown(false);
      await loadCurrentCollection();
      onCollectionChange?.(collectionId);
    },
    [loadCurrentCollection, onCollectionChange]
  );

  /**
   * Start editing collection name
   */
  const handleStartEditCollectionName = useCallback(async () => {
    if (currentCollectionId) {
      const collection = await getCollection(currentCollectionId);
      if (collection) {
        setIsEditingCollectionName(true);
        setEditingCollectionName(collection.name);
        setEditingCollectionError(null);
      }
    }
  }, [currentCollectionId]);

  /**
   * Save edited collection name
   */
  const handleSaveCollectionName = useCallback(async () => {
    if (!currentCollectionId) return;

    const trimmedName = editingCollectionName.trim();

    if (!trimmedName) {
      setEditingCollectionError("Collection name cannot be empty");
      return;
    }

    // Check for duplicate names
    const allCollections = await getAllCollections();
    const duplicate = allCollections.find(
      (c) =>
        c.id !== currentCollectionId &&
        c.name.toLowerCase() === trimmedName.toLowerCase()
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
      logger.error("Failed to update collection name:", error);
      setEditingCollectionError(
        error instanceof Error
          ? error.message
          : "Failed to save collection name"
      );
    }
  }, [
    currentCollectionId,
    editingCollectionName,
    loadCurrentCollection,
    onCollectionChange,
  ]);

  /**
   * Cancel editing collection name
   */
  const handleCancelEditCollectionName = useCallback(() => {
    setIsEditingCollectionName(false);
    setEditingCollectionName("");
    setEditingCollectionError(null);
  }, []);

  /**
   * Clear editing collection error
   */
  const clearEditingCollectionError = useCallback(() => {
    setEditingCollectionError(null);
  }, []);

  // Load collections on mount and when refresh trigger changes
  useEffect(() => {
    loadCollections();
  }, [refreshTrigger, loadCollections]);

  // Load current collection on mount and periodically
  useEffect(() => {
    if (loadOnMount) {
      loadCurrentCollection();
    }

    // Set up interval to check for collection changes (e.g., when switched from CollectionManager)
    const interval = setInterval(() => {
      loadCurrentCollection();
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [loadOnMount, loadCurrentCollection]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowCollectionDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return {
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
    loadCollections,
    dropdownRef,
  };
}

