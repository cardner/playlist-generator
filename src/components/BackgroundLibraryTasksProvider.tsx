"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { LibraryRoot, PermissionStatus } from "@/lib/library-selection";
import { useLibraryScanning } from "@/hooks/useLibraryScanning";
import { useMetadataParsing } from "@/hooks/useMetadataParsing";
import { useMetadataEnhancement } from "@/hooks/useMetadataEnhancement";
import { useTrackIdentityBackfill } from "@/hooks/useTrackIdentityBackfill";

type VoidCallback = () => void;

interface BackgroundLibraryTasksContextValue {
  libraryRoot: LibraryRoot | null;
  permissionStatus: PermissionStatus | null;
  libraryRootId: string | null;
  existingCollectionId: string | null;
  setLibraryRoot: (root: LibraryRoot | null) => void;
  setPermissionStatus: (status: PermissionStatus | null) => void;
  setLibraryRootId: (id: string | null) => void;
  setExistingCollectionId: (id: string | null) => void;
  setOnScanComplete: (callback?: VoidCallback) => void;
  setOnProcessingProgress: (callback?: VoidCallback) => void;
  scanning: ReturnType<typeof useLibraryScanning>;
  metadataParsing: ReturnType<typeof useMetadataParsing>;
  metadataEnhancement: ReturnType<typeof useMetadataEnhancement>;
  trackIdentityBackfill: ReturnType<typeof useTrackIdentityBackfill>;
}

const BackgroundLibraryTasksContext =
  createContext<BackgroundLibraryTasksContextValue | null>(null);

export function BackgroundLibraryTasksProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [libraryRoot, setLibraryRoot] = useState<LibraryRoot | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);
  const [libraryRootId, setLibraryRootId] = useState<string | null>(null);
  const [existingCollectionId, setExistingCollectionId] = useState<string | null>(null);
  const onScanCompleteRef = useRef<VoidCallback | undefined>(undefined);
  const onProcessingProgressRef = useRef<VoidCallback | undefined>(undefined);
  const lastBackfillRootRef = useRef<string | null>(null);

  const setOnScanComplete = useCallback((callback?: VoidCallback) => {
    onScanCompleteRef.current = callback;
  }, []);

  const setOnProcessingProgress = useCallback((callback?: VoidCallback) => {
    onProcessingProgressRef.current = callback;
  }, []);

  const scanning = useLibraryScanning({
    libraryRoot,
    permissionStatus,
    existingCollectionId,
  });

  const metadataParsing = useMetadataParsing({
    onParseComplete: () => onScanCompleteRef.current?.(),
    onProcessingProgress: () => onProcessingProgressRef.current?.(),
    scanRunId: scanning.scanRunId,
  });

  const metadataEnhancement = useMetadataEnhancement();
  const trackIdentityBackfill = useTrackIdentityBackfill();
  const { isBackfilling, startBackfill } = trackIdentityBackfill;

  useEffect(() => {
    if (
      libraryRootId &&
      libraryRootId !== lastBackfillRootRef.current &&
      !isBackfilling
    ) {
      lastBackfillRootRef.current = libraryRootId;
      startBackfill(libraryRootId, { onlyMissing: true });
    }
  }, [libraryRootId, isBackfilling, startBackfill]);

  const value = useMemo(
    () => ({
      libraryRoot,
      permissionStatus,
      libraryRootId,
      existingCollectionId,
      setLibraryRoot,
      setPermissionStatus,
      setLibraryRootId,
      setExistingCollectionId,
      setOnScanComplete,
      setOnProcessingProgress,
      scanning,
      metadataParsing,
      metadataEnhancement,
      trackIdentityBackfill,
    }),
    [
      libraryRoot,
      permissionStatus,
      libraryRootId,
      existingCollectionId,
      setLibraryRoot,
      setPermissionStatus,
      setLibraryRootId,
      setExistingCollectionId,
      setOnScanComplete,
      setOnProcessingProgress,
      scanning,
      metadataParsing,
      metadataEnhancement,
      trackIdentityBackfill,
    ]
  );

  return (
    <BackgroundLibraryTasksContext.Provider value={value}>
      {children}
    </BackgroundLibraryTasksContext.Provider>
  );
}

export function useBackgroundLibraryTasks() {
  const context = useContext(BackgroundLibraryTasksContext);
  if (!context) {
    throw new Error(
      "useBackgroundLibraryTasks must be used within BackgroundLibraryTasksProvider"
    );
  }
  return context;
}
