"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllSavedPlaylistsWithCollections, deleteSavedPlaylist, savePlaylist } from "@/db/playlist-storage";
import type { GeneratedPlaylist } from "@/features/playlists";
import { PlaylistDisplay } from "@/components/PlaylistDisplay";
import { Music, Trash2, Loader2, AlertCircle, Database, Shuffle } from "lucide-react";
import { getCollection, getCurrentCollectionId } from "@/db/storage";
import { logger } from "@/lib/logger";
import type { PlaylistRequest } from "@/types/playlist";
import { SavePlaylistDialog } from "@/components/SavePlaylistDialog";
import { remixSavedPlaylist } from "@/features/playlists";

interface PlaylistWithCollection {
  playlist: GeneratedPlaylist;
  collectionId?: string;
  collectionName?: string;
  request?: PlaylistRequest;
}

export default function SavedPlaylistsPage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<PlaylistWithCollection[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<GeneratedPlaylist | null>(null);
  const [selectedPlaylistCollectionId, setSelectedPlaylistCollectionId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentCollectionId, setCurrentCollectionId] = useState<string | null>(null);
  const [remixTarget, setRemixTarget] = useState<PlaylistWithCollection | null>(null);
  const [isRemixing, setIsRemixing] = useState(false);

  useEffect(() => {
    loadPlaylists();
    
    // Refresh when collections might change (check periodically)
    const interval = setInterval(() => {
      loadPlaylists();
    }, 3000); // Check every 3 seconds
    
    return () => clearInterval(interval);
  }, []);

  async function loadPlaylists() {
    try {
      setIsLoading(true);
      const saved = await getAllSavedPlaylistsWithCollections();
      const currentId = await getCurrentCollectionId();
      setCurrentCollectionId(currentId || null);

      // Load collection names for each playlist
      const playlistsWithNames = await Promise.all(
        saved.map(async (item) => {
          let collectionName: string | undefined;
          if (item.collectionId) {
            const collection = await getCollection(item.collectionId);
            collectionName = collection?.name;
          }
          return {
            ...item,
            collectionName,
          };
        })
      );

      setPlaylists(playlistsWithNames);
    } catch (err) {
      logger.error("Failed to load saved playlists:", err);
      setError(err instanceof Error ? err.message : "Failed to load playlists");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this playlist?")) {
      return;
    }

    try {
      await deleteSavedPlaylist(id);
      if (selectedPlaylist?.id === id) {
        setSelectedPlaylist(null);
        setSelectedPlaylistCollectionId(undefined);
      }
      await loadPlaylists();
    } catch (err) {
      logger.error("Failed to delete playlist:", err);
      alert("Failed to delete playlist");
    }
  }

  function handleSelectPlaylist(playlist: GeneratedPlaylist, collectionId?: string) {
    setSelectedPlaylist(playlist);
    setSelectedPlaylistCollectionId(collectionId);
  }

  const storePlaylistInSessionStorage = (updated: GeneratedPlaylist) => {
    const serializable = {
      ...updated,
      summary: {
        ...updated.summary,
        genreMix: Object.fromEntries(updated.summary.genreMix),
        tempoMix: Object.fromEntries(updated.summary.tempoMix),
        artistMix: Object.fromEntries(updated.summary.artistMix),
      },
    };
    sessionStorage.setItem("generated-playlist", JSON.stringify(serializable));
  };

  async function handleRemixConfirm(options: { title: string; description?: string }) {
    if (!remixTarget) return;
    setIsRemixing(true);
    try {
      const { playlist: remixed, request } = await remixSavedPlaylist({
        playlist: remixTarget.playlist,
        storedRequest: remixTarget.request,
        libraryRootId: remixTarget.collectionId,
        title: options.title,
        description: options.description,
      });
      await savePlaylist(remixed, remixTarget.collectionId, request);
      storePlaylistInSessionStorage(remixed);
      sessionStorage.setItem("playlist-request", JSON.stringify(request));
      setSelectedPlaylist(remixed);
      setSelectedPlaylistCollectionId(remixTarget.collectionId);
      await loadPlaylists();
    } catch (err) {
      logger.error("Failed to remix playlist:", err);
      alert("Failed to remix playlist");
    } finally {
      setIsRemixing(false);
      setRemixTarget(null);
    }
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  if (selectedPlaylist) {
    return (
      <div>
        <div className="mb-6">
          <button
            onClick={() => {
              setSelectedPlaylist(null);
              setSelectedPlaylistCollectionId(undefined);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm"
          >
            ← Back to Saved Playlists
          </button>
        </div>
        <PlaylistDisplay 
          playlist={selectedPlaylist} 
          playlistCollectionId={selectedPlaylistCollectionId}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="size-12 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm flex items-center justify-center">
            <Music className="size-6 text-white" />
            
          </div>
          <div>
            <h1 className="text-app-primary tracking-tight text-2xl font-semibold">
              Saved Playlists
            </h1>
            <p className="text-app-secondary text-sm">
              View and manage your saved playlists
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 text-sm font-medium mb-1">Error</p>
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="size-8 text-accent-primary animate-spin mx-auto mb-4" />
          <p className="text-app-secondary">Loading playlists...</p>
        </div>
      ) : playlists.length === 0 ? (
        <div className="bg-app-surface rounded-sm border border-app-border p-12 text-center">
          <Music className="size-12 text-app-tertiary mx-auto mb-4" />
          <h2 className="text-app-primary text-xl font-medium mb-2">No Saved Playlists</h2>
          <p className="text-app-secondary mb-6">
            Playlists you save will appear here for easy access.
          </p>
          <button
            onClick={() => router.push("/playlists/new")}
            className="px-6 py-3 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors"
          >
            Create New Playlist
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((item) => {
            const playlist = item.playlist;
            const isFromCurrentCollection = item.collectionId === currentCollectionId;
            
            return (
              <div
                key={playlist.id}
                className="bg-app-surface rounded-sm border border-app-border p-6 hover:border-accent-primary/50 transition-colors cursor-pointer group"
                onClick={() => handleSelectPlaylist(playlist, item.collectionId)}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-app-primary font-semibold truncate mb-1 group-hover:text-accent-primary transition-colors">
                      {playlist.title}
                    </h3>
                    <p className="text-app-secondary text-sm line-clamp-2">
                      {playlist.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemixTarget(item);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-accent-primary hover:bg-accent-primary/10 rounded-sm transition-all"
                      title="Remix playlist"
                    >
                      <Shuffle className="size-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(playlist.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-sm transition-all"
                      title="Delete playlist"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {item.collectionName && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <Database className="size-3 text-app-tertiary" />
                    <span className={`text-xs ${
                      isFromCurrentCollection ? "text-accent-primary" : "text-app-tertiary"
                    }`}>
                      {item.collectionName}
                      {isFromCurrentCollection && " (Current)"}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-app-tertiary text-xs mt-4 pt-4 border-t border-app-border">
                  <div className="flex items-center gap-1">
                    <Music className="size-3" />
                    <span>{playlist.trackFileIds.length} tracks</span>
                  </div>
                  <div>
                    {formatDuration(playlist.totalDuration)}
                  </div>
                </div>
                <div className="text-app-tertiary text-xs mt-2">
                  Saved {formatDate(playlist.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SavePlaylistDialog
        isOpen={!!remixTarget}
        defaultTitle={remixTarget ? `${remixTarget.playlist.title} (Remix)` : "Remix Playlist"}
        defaultDescription={remixTarget?.playlist.description}
        onClose={() => setRemixTarget(null)}
        onConfirm={handleRemixConfirm}
        defaultMode="remix"
        modeOptions={["remix"]}
        titleText="Remix Playlist"
        confirmLabel={isRemixing ? "Remixing..." : "Remix"}
        confirmDisabled={isRemixing}
      />
    </div>
  );
}


