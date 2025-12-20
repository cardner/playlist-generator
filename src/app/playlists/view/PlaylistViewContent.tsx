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
            
            // Try to get collection ID from saved playlist record
            if (playlistId) {
              try {
                const collectionId = await getPlaylistCollectionId(playlistId);
                setPlaylistCollectionId(collectionId);
              } catch (err) {
                logger.error("Failed to load playlist collection ID:", err);
                // Not a critical error, continue without collection ID
              }
            }
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
      <div className="max-w-4xl mx-auto">
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
      <div className="max-w-4xl mx-auto text-center">
        <Loader2 className="size-10 text-accent-primary animate-spin mx-auto mb-6" />
        <p className="text-app-primary">Loading playlist...</p>
      </div>
    );
  }

  return <PlaylistDisplay playlist={playlist} playlistCollectionId={playlistCollectionId} />;
}

