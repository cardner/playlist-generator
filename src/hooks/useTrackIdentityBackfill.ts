import { useCallback, useRef, useState } from "react";
import { resolveTrackIdentitiesForLibrary } from "@/features/library/track-identity";
import { logger } from "@/lib/logger";

export interface TrackIdentityBackfillProgress {
  processed: number;
  total: number;
  updated: number;
}

export function useTrackIdentityBackfill() {
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [progress, setProgress] = useState<TrackIdentityBackfillProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startBackfill = useCallback(
    async (libraryRootId: string, options?: { onlyMissing?: boolean }) => {
      if (!libraryRootId || isBackfilling) {
        return;
      }
      const abortController = new AbortController();
      abortRef.current = abortController;
      setIsBackfilling(true);
      setError(null);
      setProgress({ processed: 0, total: 0, updated: 0 });
      try {
        await resolveTrackIdentitiesForLibrary(libraryRootId, {
          onlyMissing: options?.onlyMissing ?? true,
          signal: abortController.signal,
          onProgress: (next) => setProgress(next),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const message = err instanceof Error ? err.message : "Backfill failed";
        setError(message);
        logger.error("Track identity backfill failed:", err);
      } finally {
        setIsBackfilling(false);
      }
    },
    [isBackfilling]
  );

  const cancelBackfill = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsBackfilling(false);
  }, []);

  return {
    isBackfilling,
    progress,
    error,
    startBackfill,
    cancelBackfill,
  };
}
