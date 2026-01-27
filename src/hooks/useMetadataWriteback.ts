/**
 * useMetadataWriteback Hook
 *
 * Handles syncing updated metadata back to files with resume support.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryRoot } from "@/lib/library-selection";
import type { FileIndexEntry } from "@/features/library/scanning";
import { getLibraryFilesForEntries } from "@/features/library/metadata-integration";
import {
  buildWritebackPayload,
  type WritebackField,
} from "@/features/library/metadata-writeback";
import {
  writeMetadataWithFallback,
  requiresFfmpeg,
  preloadFfmpeg,
  validateWritebackForFile,
} from "@/features/library/metadata-writer";
import {
  requestLibraryWritePermission,
  checkLibraryPermission,
} from "@/lib/library-selection-permissions";
import { getLibraryRootHandle } from "@/features/library/metadata-sidecar";
import {
  clearTrackWritebackPending,
  getPendingWritebacks,
  setTrackWritebackError,
} from "@/db/storage-writeback";
import {
  deleteWritebackCheckpoint,
  loadWritebackCheckpoint,
  saveWritebackCheckpoint,
} from "@/db/storage-writeback-checkpoints";
import { getFileIndexEntries } from "@/db/storage";
import { db, getCompositeId } from "@/db/schema";
import { logger } from "@/lib/logger";

export interface WritebackProgress {
  processed: number;
  total: number;
  errors: number;
  currentFile?: string;
}

export interface UseMetadataWritebackReturn {
  isWriting: boolean;
  writebackProgress: WritebackProgress | null;
  error: string | null;
  isValidating: boolean;
  validationResults: Array<{ extension: string; success: boolean; message?: string }> | null;
  validationError: string | null;
  handleWriteback: (root: LibraryRoot, libraryRootId: string) => Promise<void>;
  handleResumeWriteback: (
    root: LibraryRoot,
    libraryRootId: string,
    writebackRunId: string
  ) => Promise<void>;
  handleValidateWriteback: (
    root: LibraryRoot,
    libraryRootId: string
  ) => Promise<void>;
  clearError: () => void;
  clearValidation: () => void;
}

const CHECKPOINT_INTERVAL = 50;

export function useMetadataWriteback(): UseMetadataWritebackReturn {
  const [isWriting, setIsWriting] = useState(false);
  const [writebackProgress, setWritebackProgress] = useState<WritebackProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<
    Array<{ extension: string; success: boolean; message?: string }> | null
  >(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const isWritingRef = useRef(false);

  useEffect(() => {
    isWritingRef.current = isWriting;
  }, [isWriting]);

  const runWriteback = useCallback(
    async (
      root: LibraryRoot,
      libraryRootId: string,
      writebackRunId: string,
      resumeCheckpoint?: { lastWrittenIndex: number; errors: number }
    ) => {
      if (root.mode !== "handle") {
        setError("Writeback requires File System Access API.");
        return;
      }

      const permission = await requestLibraryWritePermission(root);
      if (permission !== "granted") {
        setError("Write permission is required to sync metadata to files.");
        return;
      }

      const rootHandle = await getLibraryRootHandle(libraryRootId);
      if (!rootHandle) {
        setError("Directory handle not available for writeback.");
        return;
      }

      const pending = await getPendingWritebacks(libraryRootId);
      if (pending.length === 0) {
        setWritebackProgress(null);
        return;
      }

      const fileIndexEntries = await getFileIndexEntries(libraryRootId);
      const fileIndexMap = new Map(
        fileIndexEntries.map((entry) => [entry.trackFileId, entry])
      );
      const pendingByTrackId = new Map(
        pending.map((record) => [
          record.trackFileId,
          record.pendingFields as WritebackField[],
        ])
      );

      const entriesToWrite: FileIndexEntry[] = [];
      for (const record of pending) {
        const entry = fileIndexMap.get(record.trackFileId);
        if (entry) {
          entriesToWrite.push(entry);
        }
      }

      if (entriesToWrite.some((entry) => requiresFfmpeg(entry.extension))) {
        setWritebackProgress({
          processed: 0,
          total: entriesToWrite.length,
          errors: 0,
          currentFile: "Preparing media writeback engine...",
        });
        try {
          await preloadFfmpeg();
        } catch (loadError) {
          logger.warn("Failed to preload FFmpeg", loadError);
        }
      }

      entriesToWrite.sort((a, b) => {
        const aPath = a.relativePath || a.name;
        const bPath = b.relativePath || b.name;
        return aPath.localeCompare(bPath);
      });

      const startIndex = resumeCheckpoint
        ? Math.min(resumeCheckpoint.lastWrittenIndex + 1, entriesToWrite.length)
        : 0;
      let processed = startIndex;
      let errors = resumeCheckpoint?.errors ?? 0;
      let lastSavedIndex = startIndex - 1;

      await saveWritebackCheckpoint(
        writebackRunId,
        libraryRootId,
        entriesToWrite.length,
        Math.max(startIndex - 1, -1),
        entriesToWrite[startIndex]?.relativePath || entriesToWrite[startIndex]?.name,
        errors,
        false
      );

      const entriesToFetch = entriesToWrite.slice(startIndex);
      if (entriesToFetch.length === 0) {
        await deleteWritebackCheckpoint(writebackRunId);
        setWritebackProgress(null);
        return;
      }
      const libraryFiles = await getLibraryFilesForEntries(
        root,
        entriesToFetch,
        libraryRootId
      );
      const libraryFileMap = new Map(
        libraryFiles.map((file) => [file.trackFileId, file])
      );

      setWritebackProgress({
        processed,
        total: entriesToWrite.length,
        errors,
      });

      for (let index = startIndex; index < entriesToWrite.length; index += 1) {
        if (!isWritingRef.current) {
          break;
        }
        const entry = entriesToWrite[index];
        const libraryFile = libraryFileMap.get(entry.trackFileId);
        const pendingFields = pendingByTrackId.get(entry.trackFileId) ?? [];

        if (!libraryFile) {
          errors += 1;
          await setTrackWritebackError(
            entry.trackFileId,
            libraryRootId,
            "File not found for writeback."
          );
        } else {
          const track = await db.tracks.get(getCompositeId(entry.trackFileId, libraryRootId));
          if (!track) {
            errors += 1;
            await setTrackWritebackError(
              entry.trackFileId,
              libraryRootId,
              "Track metadata missing for writeback."
            );
          } else {
            try {
              const payload = buildWritebackPayload(track);
              const result = await writeMetadataWithFallback(
                libraryFile,
                payload,
                rootHandle
              );
              if (result.success) {
                await clearTrackWritebackPending(
                  entry.trackFileId,
                  libraryRootId,
                  pendingFields,
                  result.target
                );
              } else {
                errors += 1;
                await setTrackWritebackError(
                  entry.trackFileId,
                  libraryRootId,
                  result.error || "Writeback failed."
                );
              }
            } catch (writeError) {
              errors += 1;
              await setTrackWritebackError(
                entry.trackFileId,
                libraryRootId,
                writeError instanceof Error ? writeError.message : String(writeError)
              );
            }
          }
        }

        processed += 1;
        const currentPath = entry.relativePath || entry.name;
        setWritebackProgress({
          processed,
          total: entriesToWrite.length,
          errors,
          currentFile: currentPath,
        });

        if (index - lastSavedIndex >= CHECKPOINT_INTERVAL) {
          lastSavedIndex = index;
          await saveWritebackCheckpoint(
            writebackRunId,
            libraryRootId,
            entriesToWrite.length,
            index,
            currentPath,
            errors,
            false
          );
        }
      }

      await deleteWritebackCheckpoint(writebackRunId);
      setWritebackProgress(null);
    },
    []
  );

  const handleWriteback = useCallback(
    async (root: LibraryRoot, libraryRootId: string) => {
      const writebackRunId = `writeback-${libraryRootId}-${Date.now()}`;
      try {
        setIsWriting(true);
        setError(null);
        await runWriteback(root, libraryRootId, writebackRunId);
      } catch (err) {
        logger.error("Writeback failed:", err);
        setError(err instanceof Error ? err.message : String(err));
        await saveWritebackCheckpoint(
          writebackRunId,
          libraryRootId,
          writebackProgress?.total ?? 0,
          (writebackProgress?.processed ?? 1) - 1,
          writebackProgress?.currentFile,
          writebackProgress?.errors ?? 0,
          true
        );
      } finally {
        setIsWriting(false);
      }
    },
    [runWriteback, writebackProgress]
  );

  const handleResumeWriteback = useCallback(
    async (root: LibraryRoot, libraryRootId: string, writebackRunId: string) => {
      try {
        setIsWriting(true);
        setError(null);
        const checkpoint = await loadWritebackCheckpoint(writebackRunId);
        await runWriteback(root, libraryRootId, writebackRunId, checkpoint || undefined);
      } catch (err) {
        logger.error("Writeback resume failed:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsWriting(false);
      }
    },
    [runWriteback]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearValidation = useCallback(() => {
    setValidationResults(null);
    setValidationError(null);
  }, []);

  const handleValidateWriteback = useCallback(
    async (root: LibraryRoot, libraryRootId: string) => {
      if (root.mode !== "handle") {
        setValidationError("Writeback validation requires File System Access API.");
        return;
      }

      const permission = await checkLibraryPermission(root);
      if (permission !== "granted") {
        setValidationError("Read permission is required to validate writeback.");
        return;
      }

      setIsValidating(true);
      setValidationError(null);
      setValidationResults(null);

      try {
        const entries = await getFileIndexEntries(libraryRootId);
        const sampleByExtension = new Map<string, FileIndexEntry>();
        for (const entry of entries) {
          if (!sampleByExtension.has(entry.extension)) {
            sampleByExtension.set(entry.extension, entry);
          }
        }

        const sampleEntries = Array.from(sampleByExtension.values()).filter((entry) =>
          ["mp3", "m4a", "aac", "alac", "flac"].includes(entry.extension)
        );
        if (sampleEntries.length === 0) {
          setValidationError("No supported audio files found for validation.");
          return;
        }

        const libraryFiles = await getLibraryFilesForEntries(
          root,
          sampleEntries,
          libraryRootId
        );
        const fileMap = new Map(
          libraryFiles.map((file) => [file.trackFileId, file])
        );

        const results: Array<{ extension: string; success: boolean; message?: string }> = [];
        for (const entry of sampleEntries) {
          const file = fileMap.get(entry.trackFileId);
          if (!file) {
            results.push({
              extension: entry.extension,
              success: false,
              message: "File not accessible for validation.",
            });
            continue;
          }
          const track = await db.tracks.get(getCompositeId(entry.trackFileId, libraryRootId));
          const payload =
            track?.tags
              ? buildWritebackPayload(track)
              : {
                  tags: {
                    title: entry.name,
                    artist: "Unknown Artist",
                    album: "Unknown Album",
                    genres: [],
                  },
                };
          const result = await validateWritebackForFile(file, payload);
          results.push({
            extension: entry.extension,
            success: result.success,
            message: result.error,
          });
        }

        setValidationResults(results);
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  return {
    isWriting,
    writebackProgress,
    error,
    isValidating,
    validationResults,
    validationError,
    handleWriteback,
    handleResumeWriteback,
    handleValidateWriteback,
    clearError,
    clearValidation,
  };
}

