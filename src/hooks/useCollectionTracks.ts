/**
 * useCollectionTracks hook
 *
 * Loads tracks for a collection from IndexedDB. Used by DeviceSyncPanel and
 * CollectionSyncBrowser for collection sync flows.
 */

import { useEffect, useState } from "react";
import { db } from "@/db/schema";
import { getFileIndexEntries } from "@/db/storage";

export interface CollectionTrack {
  trackFileId: string;
  title: string;
  artist?: string;
  album?: string;
  trackNo?: number;
  addedAt?: number;
  fileName?: string;
  fileSize?: number;
  genre?: string;
  durationSeconds?: number;
  bpm?: number;
}

export type CollectionTracksStatus = "idle" | "loading" | "ready" | "error";

export interface UseCollectionTracksResult {
  tracks: CollectionTrack[];
  status: CollectionTracksStatus;
  error: string | null;
}

/**
 * Load tracks for a collection. Skips loading when enabled is false or collectionId is empty.
 */
export function useCollectionTracks(
  collectionId: string,
  enabled: boolean
): UseCollectionTracksResult {
  const [tracks, setTracks] = useState<CollectionTrack[]>([]);
  const [status, setStatus] = useState<CollectionTracksStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !collectionId) {
      setTracks([]);
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setStatus("loading");
      setError(null);
      try {
        const dbTracks = await db.tracks
          .where("libraryRootId")
          .equals(collectionId)
          .toArray();
        const fileIndexEntries = await getFileIndexEntries(collectionId);
        const fileIndexMap = new Map(
          fileIndexEntries.map((entry) => [entry.trackFileId, entry])
        );

        if (cancelled) return;

        const mapped: CollectionTrack[] = dbTracks.map((track) => {
          const fileIndex = fileIndexMap.get(track.trackFileId);
          const fallbackTitle = fileIndex?.name || track.trackFileId;
          const genres = track.tags?.genres;
          return {
            trackFileId: track.trackFileId,
            title: track.tags?.title || fallbackTitle,
            artist: track.tags?.artist,
            album: track.tags?.album,
            trackNo: track.tags?.trackNo,
            addedAt: fileIndex?.updatedAt ?? track.updatedAt,
            fileName: fileIndex?.name,
            fileSize: fileIndex?.size,
            genre: Array.isArray(genres) && genres.length > 0 ? genres.join(", ") : undefined,
            durationSeconds: track.tech?.durationSeconds,
            bpm: track.tech?.bpm,
          };
        });

        setTracks(mapped);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Failed to load collection tracks");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [collectionId, enabled]);

  return { tracks, status, error };
}
