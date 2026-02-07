"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PlaylistDisplay } from "@/components/PlaylistDisplay";
import type { GeneratedPlaylist } from "@/features/playlists";
import { Loader2, AlertCircle } from "lucide-react";
import { getPlaylistCollectionId } from "@/db/playlist-storage";
import { logger } from "@/lib/logger";

export function PlaylistViewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const playlistId = searchParams.get("id");
  const [playlist, setPlaylist] = useState<GeneratedPlaylist | null>(null);
  const [playlistCollectionId, setPlaylistCollectionId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPlaylist() {
      if (!playlistId) {
        router.push("/playlists/new");
        return;
      }

      // Load playlist from sessionStorage
      const stored = sessionStorage.getItem("generated-playlist");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as GeneratedPlaylist;
          // Verify it matches the ID in URL
          if (parsed.id === playlistId) {
            // Convert plain objects back to Maps (JSON.stringify converts Maps to {})
            if (parsed.summary) {
              parsed.summary.genreMix = new Map(
                Object.entries(parsed.summary.genreMix || {})
              );
              parsed.summary.tempoMix = new Map(
                Object.entries(parsed.summary.tempoMix || {})
              );
              parsed.summary.artistMix = new Map(
                Object.entries(parsed.summary.artistMix || {})
              );
            }
            setPlaylist(parsed);
            
            // Get collection ID for track lookups. Try saved playlist first, then
            // fall back to playlist-request in sessionStorage (for newly generated playlists).
            let collectionId: string | undefined;
            try {
              collectionId = await getPlaylistCollectionId(playlistId);
            } catch (err) {
              logger.error("Failed to load playlist collection ID:", err);
            }
            if (!collectionId) {
              const requestStored = sessionStorage.getItem("playlist-request");
              if (requestStored) {
                try {
                  const request = JSON.parse(requestStored) as { collectionId?: string };
                  collectionId = request.collectionId;
                } catch {
                  // Ignore parse errors
                }
              }
            }
            setPlaylistCollectionId(collectionId);
          } else {
            setError("Playlist ID mismatch");
          }
        } catch (err) {
          logger.error("Failed to parse playlist:", err);
          setError("Failed to load playlist");
        }
      } else {
        setError("Playlist not found");
      }
    }
    
    loadPlaylist();
  }, [playlistId, router]);

  if (error) {
    return (
      <div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-8 text-center">
          <AlertCircle className="size-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-red-500 mb-3 text-xl font-semibold">
            Playlist Not Found
          </h2>
          <p className="text-red-500 mb-6">{error}</p>
          <button
            onClick={() => router.push("/playlists/new")}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-sm transition-colors"
          >
            Create New Playlist
          </button>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="text-center">
        <Loader2 className="size-10 text-accent-primary animate-spin mx-auto mb-6" />
        <p className="text-app-primary">Loading playlist...</p>
      </div>
    );
  }

  return <PlaylistDisplay playlist={playlist} playlistCollectionId={playlistCollectionId} />;
}

