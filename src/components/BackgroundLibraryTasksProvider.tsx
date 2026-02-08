"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { LibraryRoot, PermissionStatus } from "@/lib/library-selection";
import { useLibraryScanning } from "@/hooks/useLibraryScanning";
import { useMetadataParsing } from "@/hooks/useMetadataParsing";
import { useMetadataEnhancement } from "@/hooks/useMetadataEnhancement";

type VoidCallback = () => void;

interface BackgroundLibraryTasksContextValue {
  libraryRoot: LibraryRoot | null;
  permissionStatus: PermissionStatus | null;
  setLibraryRoot: (root: LibraryRoot | null) => void;
  setPermissionStatus: (status: PermissionStatus | null) => void;
  setOnScanComplete: (callback?: VoidCallback) => void;
  setOnProcessingProgress: (callback?: VoidCallback) => void;
  scanning: ReturnType<typeof useLibraryScanning>;
  metadataParsing: ReturnType<typeof useMetadataParsing>;
  metadataEnhancement: ReturnType<typeof useMetadataEnhancement>;
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
  const onScanCompleteRef = useRef<VoidCallback | undefined>(undefined);
  const onProcessingProgressRef = useRef<VoidCallback | undefined>(undefined);

  const setOnScanComplete = useCallback((callback?: VoidCallback) => {
    onScanCompleteRef.current = callback;
  }, []);

  const setOnProcessingProgress = useCallback((callback?: VoidCallback) => {
    onProcessingProgressRef.current = callback;
  }, []);

  const scanning = useLibraryScanning({
    libraryRoot,
    permissionStatus,
  });

  const metadataParsing = useMetadataParsing({
    onParseComplete: () => onScanCompleteRef.current?.(),
    onProcessingProgress: () => onProcessingProgressRef.current?.(),
    scanRunId: scanning.scanRunId,
  });

  const metadataEnhancement = useMetadataEnhancement();

  const value = useMemo(
    () => ({
      libraryRoot,
      permissionStatus,
      setLibraryRoot,
      setPermissionStatus,
      setOnScanComplete,
      setOnProcessingProgress,
      scanning,
      metadataParsing,
      metadataEnhancement,
    }),
    [
      libraryRoot,
      permissionStatus,
      setLibraryRoot,
      setPermissionStatus,
      setOnScanComplete,
      setOnProcessingProgress,
      scanning,
      metadataParsing,
      metadataEnhancement,
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
