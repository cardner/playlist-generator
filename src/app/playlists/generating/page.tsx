"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlaylistRequest } from "@/types/playlist";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import {
  getStrategy,
  generatePlaylistFromStrategy,
  type GeneratedPlaylist,
} from "@/features/playlists";
import { getCurrentLibrarySummary } from "@/features/library/summarization";
import { getCurrentLibraryRoot } from "@/db/storage";

export default function GeneratingPage() {
  const router = useRouter();
  const [request, setRequest] = useState<PlaylistRequest | null>(null);
  const [playlist, setPlaylist] = useState<GeneratedPlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);

  // Redirect when playlist is ready
  useEffect(() => {
    if (playlist) {
      router.push(`/playlists/view?id=${playlist.id}`);
    }
  }, [playlist, router]);

  useEffect(() => {
    async function generatePlaylist() {
      try {
        // Load request from sessionStorage
        const stored = sessionStorage.getItem("playlist-request");
        if (!stored) {
          router.push("/playlists/new");
          return;
        }

        const playlistRequestData = JSON.parse(stored) as PlaylistRequest & { collectionId?: string };
        setRequest(playlistRequestData);

        // Use collectionId from request if available, otherwise use current collection
        const collectionId = playlistRequestData.collectionId || (await getCurrentLibraryRoot())?.id;

        // Get library summary
        const summary = await getCurrentLibrarySummary(false, collectionId);
        const root = collectionId ? { id: collectionId } : await getCurrentLibraryRoot();

        // Get strategy (from LLM or fallback)
        const strategy = await getStrategy(playlistRequestData, summary);

        // Generate playlist
        const generated = await generatePlaylistFromStrategy(
          playlistRequestData,
          strategy,
          collectionId
        );

        setPlaylist(generated);
        setIsGenerating(false);

        // Store playlist in sessionStorage for result page
        // Convert Maps to plain objects for JSON serialization
        const serializable = {
          ...generated,
          summary: {
            ...generated.summary,
            genreMix: Object.fromEntries(generated.summary.genreMix),
            tempoMix: Object.fromEntries(generated.summary.tempoMix),
            artistMix: Object.fromEntries(generated.summary.artistMix),
          },
        };
        sessionStorage.setItem("generated-playlist", JSON.stringify(serializable));
      } catch (err) {
        console.error("Failed to generate playlist:", err);
        setError(
          err instanceof Error ? err.message : "Failed to generate playlist"
        );
        setIsGenerating(false);
      }
    }

    generatePlaylist();
  }, [router]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-8 text-center">
          <AlertCircle className="size-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-red-500 mb-3 text-xl font-semibold">
            Generation Failed
          </h2>
          <p className="text-red-500 mb-6">{error}</p>
          <button
            onClick={() => router.push("/playlists/new")}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (playlist) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <Loader2 className="size-10 text-accent-primary animate-spin mx-auto mb-6" />
        <p className="text-app-primary">Redirecting to playlist...</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <Loader2 className="size-10 text-accent-primary animate-spin mx-auto mb-6" />
        <p className="text-app-primary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-app-surface rounded-sm shadow-2xl p-8 md:p-12 text-center">
        <div className="inline-flex items-center justify-center size-20 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm mb-6">
          <Sparkles className="size-10 text-white animate-pulse" />
        </div>

        <h2 className="text-app-primary mb-3 text-2xl font-semibold">
          Generating Your Playlist
        </h2>
        <p className="text-app-secondary mb-8 max-w-lg mx-auto">
          We&apos;re creating a personalized playlist based on your preferences.
          This may take a moment...
        </p>

        <div className="space-y-2 text-left max-w-md mx-auto bg-app-hover rounded-sm p-4">
          <p className="text-app-secondary text-sm">
            <strong>Genres:</strong> {request.genres.join(", ") || "Any"}
          </p>
          <p className="text-app-secondary text-sm">
            <strong>Length:</strong> {request.length.value}{" "}
            {request.length.type === "minutes" ? "minutes" : "tracks"}
          </p>
          <p className="text-app-secondary text-sm">
            <strong>Mood:</strong> {request.mood.join(", ") || "Any"}
          </p>
          <p className="text-app-secondary text-sm">
            <strong>Activity:</strong> {request.activity.join(", ") || "Any"}
          </p>
          <p className="text-app-secondary text-sm">
            <strong>Tempo:</strong>{" "}
            {request.tempo.bucket
              ? request.tempo.bucket.charAt(0).toUpperCase() +
                request.tempo.bucket.slice(1)
              : ""}
            {request.tempo.bpmRange &&
              ` (${request.tempo.bpmRange.min}-${request.tempo.bpmRange.max} BPM)`}
          </p>
          <p className="text-app-secondary text-sm">
            <strong>Surprise:</strong> {(request.surprise * 100).toFixed(0)}%
          </p>
        </div>

        <div className="mt-8">
          <Loader2 className="size-8 text-accent-primary animate-spin mx-auto" />
        </div>
      </div>
    </div>
  );
}

