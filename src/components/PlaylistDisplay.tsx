"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { GeneratedPlaylist } from "@/features/playlists";
import { getAllTracks } from "@/db/storage";
import { db } from "@/db/schema";
import { PlaylistWhySummary } from "./PlaylistWhySummary";
import { TrackReasonChips } from "./TrackReasonChips";
import { PlaylistExport } from "./PlaylistExport";
import { generateVariant, type VariantType } from "@/features/playlists/variants";
import { generatePlaylistTitle } from "@/features/playlists/naming";
import {
  Play,
  Music,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Shuffle,
  Plus,
  Download,
  Lock,
  Unlock,
  Edit2,
  Save,
  Check,
  X,
  Trash2,
  UserPlus,
  Disc,
  FileMusic,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

// ChipInput component for inline editing
interface ChipInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  icon?: React.ReactNode;
}

function ChipInput({
  values,
  onChange,
  placeholder = "Add item...",
  suggestions = [],
  icon,
}: ChipInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleAdd = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const handleRemove = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      handleAdd(inputValue);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const filteredSuggestions = suggestions.filter(
    (s) => !values.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 p-2 bg-app-hover rounded-sm border border-app-border min-h-[40px] focus-within:border-accent-primary">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-app-surface text-app-primary rounded-sm text-xs border border-app-border"
          >
            {value}
            <button
              type="button"
              onClick={() => handleRemove(value)}
              className="hover:text-red-500 transition-colors"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={values.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[100px] bg-transparent text-app-primary placeholder-app-tertiary outline-none text-sm"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-app-surface border border-app-border rounded-sm shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.slice(0, 10).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleAdd(suggestion)}
              className="w-full px-3 py-2 text-left text-app-primary hover:bg-app-hover transition-colors text-sm"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
import {
  getStrategy,
  generatePlaylistFromStrategy,
} from "@/features/playlists";
import type { PlaylistRequest } from "@/types/playlist";
import { getCurrentLibrarySummary } from "@/features/library/summarization";
import { getCurrentLibraryRoot, getAllGenres, getAllArtists, getAllAlbums, getAllTrackTitles } from "@/db/storage";
import {
  savePlaylist,
  updatePlaylistMetadata,
  isPlaylistSaved,
} from "@/db/playlist-storage";

interface PlaylistDisplayProps {
  playlist: GeneratedPlaylist;
}

export function PlaylistDisplay({ playlist: initialPlaylist }: PlaylistDisplayProps) {
  const router = useRouter();
  const [playlist, setPlaylist] = useState<GeneratedPlaylist>(initialPlaylist);
  const [tracks, setTracks] = useState<Map<string, any>>(new Map());
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [stableMode, setStableMode] = useState(true);
  const [libraryRootId, setLibraryRootId] = useState<string | undefined>();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(playlist.title);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showInlineEditor, setShowInlineEditor] = useState(false);
  const [genres, setGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [albums, setAlbums] = useState<string[]>([]);
  const [trackTitles, setTrackTitles] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [pendingGenres, setPendingGenres] = useState<string[]>([]);
  const [pendingArtists, setPendingArtists] = useState<string[]>([]);
  const [pendingAlbums, setPendingAlbums] = useState<string[]>([]);
  const [pendingTracks, setPendingTracks] = useState<string[]>([]);

  const checkIfSaved = useCallback(async () => {
    const saved = await isPlaylistSaved(playlist.id);
    setIsSaved(saved);
  }, [playlist.id]);

  const loadTracks = useCallback(async () => {
    const allTracks = await getAllTracks();
    const trackMap = new Map();
    for (const track of allTracks) {
      trackMap.set(track.trackFileId, track);
    }
    setTracks(trackMap);
  }, []);

  const loadLibraryRoot = useCallback(async () => {
    const root = await getCurrentLibraryRoot();
    setLibraryRootId(root?.id);
  }, []);

  useEffect(() => {
    loadTracks();
    loadLibraryRoot();
    checkIfSaved();
  }, [playlist, checkIfSaved, loadTracks, loadLibraryRoot]);

  // Load suggestions for inline editor
  useEffect(() => {
    async function loadSuggestions() {
      if (showInlineEditor && libraryRootId) {
        setIsLoadingSuggestions(true);
        try {
          const [libraryGenres, libraryArtists, libraryAlbums, libraryTracks] = await Promise.all([
            getAllGenres(libraryRootId),
            getAllArtists(libraryRootId),
            getAllAlbums(libraryRootId),
            getAllTrackTitles(libraryRootId),
          ]);
          setGenres(libraryGenres);
          setArtists(libraryArtists);
          setAlbums(libraryAlbums);
          setTrackTitles(libraryTracks);
        } catch (error) {
          console.error("Failed to load suggestions:", error);
        } finally {
          setIsLoadingSuggestions(false);
        }
      }
    }
    loadSuggestions();
  }, [showInlineEditor, libraryRootId]);

  useEffect(() => {
    setEditedTitle(playlist.title);
  }, [playlist.title]);

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      // Load original request from sessionStorage
      const stored = sessionStorage.getItem("playlist-request");
      if (!stored) {
        console.error("No playlist request found");
        return;
      }

      const request = JSON.parse(stored);
      const summary = await getCurrentLibrarySummary();
      const root = await getCurrentLibraryRoot();

      // Get strategy
      const strategy = await getStrategy(request, summary);

      // Generate playlist with seed control
      const generated = await generatePlaylistFromStrategy(
        request,
        strategy,
        root?.id,
        stableMode ? playlist.id : undefined // Use playlist ID as seed for stable mode
      );

      setPlaylist(generated);
      sessionStorage.setItem("generated-playlist", JSON.stringify(generated));
    } catch (error) {
      console.error("Failed to regenerate:", error);
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleVariant(variantType: VariantType, genre?: string) {
    setIsRegenerating(true);
    try {
      // Load original request
      const stored = sessionStorage.getItem("playlist-request");
      if (!stored) {
        console.error("No playlist request found");
        return;
      }

      const originalRequest = JSON.parse(stored);
      const variantRequest = generateVariant(originalRequest, {
        type: variantType,
        genre,
      });

      // Save variant request
      sessionStorage.setItem("playlist-request", JSON.stringify(variantRequest));

      const summary = await getCurrentLibrarySummary();
      const root = await getCurrentLibraryRoot();

      // Get strategy
      const strategy = await getStrategy(variantRequest, summary);

      // Generate playlist
      const generated = await generatePlaylistFromStrategy(
        variantRequest,
        strategy,
        root?.id
      );

      setPlaylist(generated);
      sessionStorage.setItem("generated-playlist", JSON.stringify(generated));
    } catch (error) {
      console.error("Failed to generate variant:", error);
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleApplyChanges() {
    setIsRegenerating(true);
    try {
      // Load original request
      const stored = sessionStorage.getItem("playlist-request");
      if (!stored) {
        console.error("No playlist request found");
        return;
      }

      const originalRequest = JSON.parse(stored) as PlaylistRequest;
      const updatedRequest: PlaylistRequest = {
        ...originalRequest,
        // Merge pending items with existing
        genres: [...new Set([...originalRequest.genres, ...pendingGenres])],
        suggestedArtists: [...new Set([...(originalRequest.suggestedArtists || []), ...pendingArtists])],
        suggestedAlbums: [...new Set([...(originalRequest.suggestedAlbums || []), ...pendingAlbums])],
        suggestedTracks: [...new Set([...(originalRequest.suggestedTracks || []), ...pendingTracks])],
      };

      // Save updated request
      sessionStorage.setItem("playlist-request", JSON.stringify(updatedRequest));

      const summary = await getCurrentLibrarySummary();
      const root = await getCurrentLibraryRoot();

      // Get strategy
      const strategy = await getStrategy(updatedRequest, summary);

      // Generate playlist
      const generated = await generatePlaylistFromStrategy(
        updatedRequest,
        strategy,
        root?.id
      );

      setPlaylist(generated);
      sessionStorage.setItem("generated-playlist", JSON.stringify(generated));
      
      // Clear pending items and close editor
      setPendingGenres([]);
      setPendingArtists([]);
      setPendingAlbums([]);
      setPendingTracks([]);
      setShowInlineEditor(false);
    } catch (error) {
      console.error("Failed to update playlist:", error);
    } finally {
      setIsRegenerating(false);
    }
  }

  function handleCancelInlineEdit() {
    setPendingGenres([]);
    setPendingArtists([]);
    setPendingAlbums([]);
    setPendingTracks([]);
    setShowInlineEditor(false);
  }

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  async function handleSaveTitle() {
    if (editedTitle.trim() === "") {
      return;
    }

    const updatedPlaylist = {
      ...playlist,
      title: editedTitle.trim(),
    };
    setPlaylist(updatedPlaylist);
    setIsEditingTitle(false);

    // Update sessionStorage
    const serializable = {
      ...updatedPlaylist,
      summary: {
        ...updatedPlaylist.summary,
        genreMix: Object.fromEntries(updatedPlaylist.summary.genreMix),
        tempoMix: Object.fromEntries(updatedPlaylist.summary.tempoMix),
        artistMix: Object.fromEntries(updatedPlaylist.summary.artistMix),
      },
    };
    sessionStorage.setItem("generated-playlist", JSON.stringify(serializable));

    // Update in IndexedDB if saved
    if (isSaved) {
      try {
        await updatePlaylistMetadata(playlist.id, editedTitle.trim());
      } catch (error) {
        console.error("Failed to update playlist metadata:", error);
      }
    }
  }

  function handleCancelEdit() {
    setEditedTitle(playlist.title);
    setIsEditingTitle(false);
  }

  async function handleSavePlaylist() {
    setIsSaving(true);
    try {
      await savePlaylist(playlist, libraryRootId);
      setIsSaved(true);
    } catch (error) {
      console.error("Failed to save playlist:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveTrack(trackFileId: string) {
    setIsRegenerating(true);
    try {
      // Load original request from sessionStorage
      const stored = sessionStorage.getItem("playlist-request");
      if (!stored) {
        console.error("No playlist request found");
        return;
      }

      const request = JSON.parse(stored) as PlaylistRequest;
      const summary = await getCurrentLibrarySummary();
      const root = await getCurrentLibraryRoot();

      // Get currently removed tracks
      const removedTracks = JSON.parse(
        sessionStorage.getItem("removed-tracks") || "[]"
      ) as string[];
      if (!removedTracks.includes(trackFileId)) {
        removedTracks.push(trackFileId);
        sessionStorage.setItem("removed-tracks", JSON.stringify(removedTracks));
      }

      // Get strategy
      const strategy = await getStrategy(request, summary);

      // Remove the track from current playlist
      const remainingTrackIds = playlist.trackFileIds.filter(
        (id) => id !== trackFileId
      );

      // Calculate how many tracks we need to add back
      const targetCount = playlist.trackFileIds.length;
      const neededCount = targetCount - remainingTrackIds.length;

      if (neededCount > 0) {
        // Generate new tracks to fill the gap, excluding removed tracks
        const generated = await generatePlaylistFromStrategy(
          request,
          strategy,
          root?.id,
          stableMode ? playlist.id : undefined,
          removedTracks
        );

        // Get new tracks that aren't already in the playlist
        const newTracks = generated.trackFileIds.filter(
          (id) => !remainingTrackIds.includes(id) && !removedTracks.includes(id)
        );

        // Regenerate full playlist with updated track list
        const refilled = await generatePlaylistFromStrategy(
          request,
          strategy,
          root?.id,
          stableMode ? playlist.id : undefined,
          removedTracks
        );

        // Use the refilled playlist but ensure we have the right number of tracks
        const finalTrackIds = refilled.trackFileIds
          .filter((id) => !removedTracks.includes(id))
          .slice(0, targetCount);

        // Update playlist
        const updatedPlaylist = {
          ...refilled,
          trackFileIds: finalTrackIds,
        };

        setPlaylist(updatedPlaylist);
        sessionStorage.setItem(
          "generated-playlist",
          JSON.stringify({
            ...updatedPlaylist,
            summary: {
              ...updatedPlaylist.summary,
              genreMix: Object.fromEntries(updatedPlaylist.summary.genreMix),
              tempoMix: Object.fromEntries(updatedPlaylist.summary.tempoMix),
              artistMix: Object.fromEntries(updatedPlaylist.summary.artistMix),
            },
          })
        );
      } else {
        // Just remove the track
        const updatedPlaylist = {
          ...playlist,
          trackFileIds: remainingTrackIds,
        };
        setPlaylist(updatedPlaylist);
        sessionStorage.setItem(
          "generated-playlist",
          JSON.stringify({
            ...updatedPlaylist,
            summary: {
              ...updatedPlaylist.summary,
              genreMix: Object.fromEntries(updatedPlaylist.summary.genreMix),
              tempoMix: Object.fromEntries(updatedPlaylist.summary.tempoMix),
              artistMix: Object.fromEntries(updatedPlaylist.summary.artistMix),
            },
          })
        );
      }
    } catch (error) {
      console.error("Failed to remove track:", error);
    } finally {
      setIsRegenerating(false);
    }
  }

  const { title, subtitle, emoji } = generatePlaylistTitle(
    JSON.parse(sessionStorage.getItem("playlist-request") || "{}"),
    playlist.strategy
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-app-surface rounded-sm border border-app-border p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {emoji && <span className="text-3xl">{emoji}</span>}
              {isEditingTitle ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveTitle();
                      } else if (e.key === "Escape") {
                        handleCancelEdit();
                      }
                    }}
                    className="flex-1 text-2xl md:text-3xl font-semibold text-app-primary bg-app-hover border border-accent-primary rounded-sm px-3 py-1 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-2 text-accent-primary hover:bg-accent-primary/10 rounded-sm transition-colors"
                    title="Save title"
                  >
                    <Check className="size-5" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-2 text-app-secondary hover:bg-app-hover rounded-sm transition-colors"
                    title="Cancel"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-2xl md:text-3xl font-semibold text-app-primary">
                    {playlist.title || title}
                  </h1>
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-app-secondary hover:text-accent-primary transition-all"
                    title="Edit title"
                  >
                    <Edit2 className="size-4" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-app-secondary text-sm md:text-base mt-2">
              {playlist.description || subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isSaved && (
              <button
                onClick={handleSavePlaylist}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 text-sm"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    Save Playlist
                  </>
                )}
              </button>
            )}
            {isSaved && (
              <div className="flex items-center gap-2 px-3 py-2 bg-accent-primary/10 text-accent-primary rounded-sm text-sm">
                <Check className="size-4" />
                Saved
              </div>
            )}
          </div>
        </div>

        {/* Variant Buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={() => handleVariant("calmer")}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm disabled:opacity-50"
          >
            <TrendingDown className="size-4" />
            Make it calmer
          </button>
          <button
            onClick={() => handleVariant("faster")}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm disabled:opacity-50"
          >
            <TrendingUp className="size-4" />
            Make it faster
          </button>
          <button
            onClick={() => handleVariant("more_variety")}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm disabled:opacity-50"
          >
            <Shuffle className="size-4" />
            More variety
          </button>
          {playlist.summary.genreMix.size > 0 && (
            <button
              onClick={() => {
                const topGenre = Array.from(playlist.summary.genreMix.entries())
                  .sort((a, b) => b[1] - a[1])[0]?.[0];
                if (topGenre) handleVariant("more_genre", topGenre);
              }}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm disabled:opacity-50"
            >
              <Plus className="size-4" />
              More {Array.from(playlist.summary.genreMix.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]}
            </button>
          )}
        </div>

        {/* Inline Editor */}
        {showInlineEditor && (
          <div className="mt-4 pt-4 border-t border-app-border space-y-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-app-primary text-sm font-medium uppercase tracking-wider">
                Add More Criteria
              </h3>
              <button
                onClick={handleCancelInlineEdit}
                className="text-app-secondary hover:text-app-primary transition-colors"
                disabled={isRegenerating}
              >
                <X className="size-4" />
              </button>
            </div>
            
            {isLoadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="size-5 animate-spin text-accent-primary" />
                <span className="ml-2 text-app-secondary text-sm">Loading suggestions...</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Add Genres */}
                  <div>
                    <label className="flex items-center gap-2 text-app-primary mb-2 text-xs uppercase tracking-wider">
                      <Tag className="size-4 text-accent-primary" />
                      <span>Add Genres</span>
                    </label>
                    <ChipInput
                      values={pendingGenres}
                      onChange={setPendingGenres}
                      placeholder="Add genre..."
                      suggestions={genres}
                      icon={<Tag className="size-4" />}
                    />
                  </div>

                  {/* Add Artists */}
                  <div>
                    <label className="flex items-center gap-2 text-app-primary mb-2 text-xs uppercase tracking-wider">
                      <UserPlus className="size-4 text-accent-primary" />
                      <span>Add Artists</span>
                    </label>
                    <ChipInput
                      values={pendingArtists}
                      onChange={setPendingArtists}
                      placeholder="Add artist..."
                      suggestions={artists}
                      icon={<UserPlus className="size-4" />}
                    />
                  </div>

                  {/* Add Albums */}
                  <div>
                    <label className="flex items-center gap-2 text-app-primary mb-2 text-xs uppercase tracking-wider">
                      <Disc className="size-4 text-accent-primary" />
                      <span>Add Albums</span>
                    </label>
                    <ChipInput
                      values={pendingAlbums}
                      onChange={setPendingAlbums}
                      placeholder="Add album..."
                      suggestions={albums}
                      icon={<Disc className="size-4" />}
                    />
                  </div>

                  {/* Add Tracks */}
                  <div>
                    <label className="flex items-center gap-2 text-app-primary mb-2 text-xs uppercase tracking-wider">
                      <FileMusic className="size-4 text-accent-primary" />
                      <span>Add Tracks</span>
                    </label>
                    <ChipInput
                      values={pendingTracks}
                      onChange={setPendingTracks}
                      placeholder="Add track..."
                      suggestions={trackTitles}
                      icon={<FileMusic className="size-4" />}
                    />
                  </div>
                </div>

                {/* Apply/Cancel Buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleApplyChanges}
                    disabled={isRegenerating || (pendingGenres.length === 0 && pendingArtists.length === 0 && pendingAlbums.length === 0 && pendingTracks.length === 0)}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isRegenerating ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <Check className="size-4" />
                        Apply Changes
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleCancelInlineEdit}
                    disabled={isRegenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors disabled:opacity-50 text-sm border border-app-border"
                  >
                    <X className="size-4" />
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Regenerate Button */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-app-border">
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50"
          >
            {isRegenerating ? (
              <>
                <RefreshCw className="size-4 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                Regenerate
              </>
            )}
          </button>
          <button
            onClick={() => setStableMode(!stableMode)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-sm transition-colors text-sm",
              stableMode
                ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                : "bg-app-hover text-app-primary border border-app-border hover:bg-app-surface-hover"
            )}
            title={stableMode ? "Stable mode: same seed, similar results" : "Fresh mode: new seed, different results"}
          >
            {stableMode ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            {stableMode ? "Stable" : "Fresh"}
          </button>
          {!showInlineEditor && (
            <button
              onClick={() => setShowInlineEditor(true)}
              className="flex items-center gap-2 px-3 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
            >
              <Plus className="size-4" />
              Add More
            </button>
          )}
        </div>
      </div>

      {/* Why This Playlist Summary */}
      <PlaylistWhySummary playlist={playlist} />

      {/* Track List */}
      <div className="bg-app-surface rounded-sm border border-app-border overflow-hidden">
        <div className="divide-y divide-app-border">
          {playlist.trackFileIds.map((trackFileId, index) => {
            const track = tracks.get(trackFileId);
            const selection = playlist.trackSelections.find(
              (s) => s.trackFileId === trackFileId
            );
            const orderedTrack = playlist.orderedTracks?.find(
              (t) => t.trackFileId === trackFileId
            );

            if (!track) return null;

            const reasons = orderedTrack?.reasons || selection?.reasons || [];

            return (
              <div
                key={trackFileId}
                className="px-4 md:px-6 py-4 hover:bg-app-hover transition-colors group"
              >
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center size-8 text-app-tertiary group-hover:text-accent-primary transition-colors shrink-0 mt-1">
                    <span className="text-sm group-hover:hidden">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Play className="size-4 hidden group-hover:block" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-app-primary font-medium truncate">
                          {track.tags.title || "Unknown Title"}
                        </div>
                        <div className="text-app-secondary text-sm truncate">
                          {track.tags.artist || "Unknown Artist"}
                        </div>
                        {track.tags.album && (
                          <div className="text-app-tertiary text-xs truncate mt-1">
                            {track.tags.album}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-app-secondary text-sm tabular-nums shrink-0">
                          {formatDuration(track.tech?.durationSeconds)}
                        </div>
                        <button
                          onClick={() => handleRemoveTrack(trackFileId)}
                          disabled={isRegenerating}
                          className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-sm transition-all disabled:opacity-50"
                          title="Remove track"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>

                    {/* Why This Track Chips */}
                    {reasons.length > 0 && (
                      <div className="mt-2">
                        <TrackReasonChips reasons={reasons} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-app-surface rounded-sm border border-app-border p-6">
        <PlaylistExport playlist={playlist} libraryRootId={libraryRootId} />
      </div>
    </div>
  );
}

