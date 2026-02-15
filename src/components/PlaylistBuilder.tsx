/**
 * PlaylistBuilder Component
 * 
 * Comprehensive form component for creating playlist generation requests.
 * Handles user input for genres, moods, activities, tempo, duration, and other
 * playlist parameters. Supports both standard and discovery mode playlist creation.
 * 
 * Features:
 * - Genre selection with autocomplete from library
 * - Mood and activity input with suggestions
 * - Tempo selection (bucket or BPM range)
 * - Duration specification (minutes or track count)
 * - Surprise/variety slider
 * - Suggested artists, albums, and tracks
 * - LLM agent configuration
 * - Collection selection for multi-library support
 * - Draft auto-save to localStorage
 * - Form validation with inline error display
 * 
 * State Management:
 * - Uses `usePlaylistForm` hook for form state and validation
 * - Loads library data (genres, artists, albums, tracks) on mount
 * - Manages collection selection and switching
 * - Auto-saves draft to localStorage on changes
 * 
 * Form Validation:
 * - Validates required fields (genres, length)
 * - Validates ranges (tempo BPM, duration)
 * - Validates discovery mode requirements (suggested tracks/albums)
 * - Shows inline errors for invalid inputs
 * 
 * @module components/PlaylistBuilder
 * 
 * @example
 * ```tsx
 * <PlaylistBuilder
 *   onGenerate={(request) => {
 *     // Handle playlist generation
 *     generatePlaylist(request);
 *   }}
 *   discoveryMode={false}
 * />
 * ```
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PlaylistRequest, PlaylistRequestErrors } from "@/types/playlist";
import { getAllGenres, getAllGenresWithStats, getGenreCoOccurrence, getCurrentLibraryRoot, getAllCollections, getCurrentCollectionId, searchArtists, searchAlbums, searchTrackTitles, getTopArtists, getTopAlbums, getTopTrackTitles } from "@/db/storage";
import type { LibraryRootRecord } from "@/db/schema";
import type { GenreWithStats } from "@/features/library/genre-normalization";
import type { GenreCoOccurrenceMap } from "@/features/library/genre-similarity";
// Form state and validation are now handled by usePlaylistForm hook
import {
  Music,
  Clock,
  Heart,
  Activity,
  Gauge,
  Sparkles,
  X,
  Plus,
  AlertCircle,
  UserX,
  Users,
  FolderOpen,
  ChevronDown,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentSelector } from "./AgentSelector";
import { ChipInput } from "./ChipInput";
import { LibrarySearchCombo } from "./LibrarySearchCombo";
import type { AgentType, LLMConfig } from "@/types/playlist";
import { logger } from "@/lib/logger";
import { usePlaylistForm } from "@/hooks/usePlaylistForm";
import { getMoodCategories } from "@/features/library/mood-mapping";
import { getActivityCategories } from "@/features/library/activity-mapping";
import { getSimilarGenres } from "@/features/library/genre-similarity";

interface PlaylistBuilderProps {
  onGenerate?: (request: PlaylistRequest) => void;
  discoveryMode?: boolean;
}

const MOOD_SUGGESTIONS = getMoodCategories();
const ACTIVITY_SUGGESTIONS = getActivityCategories();

export function PlaylistBuilder({ onGenerate, discoveryMode = false }: PlaylistBuilderProps) {
  const router = useRouter();
  const [collections, setCollections] = useState<LibraryRootRecord[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [genresWithStats, setGenresWithStats] = useState<GenreWithStats[]>([]);
  const [genreCoOccurrence, setGenreCoOccurrence] = useState<GenreCoOccurrenceMap | null>(null);
  const [isLoadingGenres, setIsLoadingGenres] = useState(true);
  
  // Cache for search results (key: query string, value: results array)
  const [artistsCache, setArtistsCache] = useState<Map<string, string[]>>(new Map());
  const [albumsCache, setAlbumsCache] = useState<Map<string, string[]>>(new Map());
  const [tracksCache, setTracksCache] = useState<Map<string, string[]>>(new Map());
  
  // Cache for top items (shown when query is empty or too short)
  const [topArtistsCache, setTopArtistsCache] = useState<string[] | null>(null);
  const [topAlbumsCache, setTopAlbumsCache] = useState<string[] | null>(null);
  const [topTracksCache, setTopTracksCache] = useState<string[] | null>(null);
  const [showCollectionSelector, setShowCollectionSelector] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use the form hook for state and validation management
  const {
    formData,
    errors,
    setFormData,
    validate,
    isValid,
    clearDraft,
    validateDiscoveryMode,
  } = usePlaylistForm({ discoveryMode });

  // Load collections and set current collection
  useEffect(() => {
    async function loadCollections() {
      try {
        const allCollections = await getAllCollections();
        setCollections(allCollections);
        const currentId = await getCurrentCollectionId();
        setSelectedCollectionId(currentId || null);
      } catch (error) {
        logger.error("Failed to load collections:", error);
      }
    }
    loadCollections();
  }, []);

  // Form state and validation are now handled by usePlaylistForm hook

  // Load genres and co-occurrence from library
  useEffect(() => {
    async function loadGenresAndCoOccurrence() {
      try {
        setIsLoadingGenres(true);
        const [genresStats, coOccurrence] = await Promise.all([
          getAllGenresWithStats(selectedCollectionId || undefined),
          getGenreCoOccurrence(selectedCollectionId || undefined),
        ]);
        setGenresWithStats(genresStats);
        setGenres(genresStats.map((g) => g.normalized));
        setGenreCoOccurrence(coOccurrence);
      } catch (error) {
        logger.error("Failed to load genres:", error);
        setGenreCoOccurrence(null);
      } finally {
        setIsLoadingGenres(false);
      }
    }
    if (selectedCollectionId !== null) {
      loadGenresAndCoOccurrence();
    } else {
      setGenreCoOccurrence(null);
    }
  }, [selectedCollectionId]);

  const similarGenres = useMemo(
    () =>
      getSimilarGenres(
        formData.genres || [],
        genres,
        genreCoOccurrence ?? new Map(),
        6
      ),
    [formData.genres, genres, genreCoOccurrence]
  );

  // Clear caches when collection changes
  useEffect(() => {
    setArtistsCache(new Map());
    setAlbumsCache(new Map());
    setTracksCache(new Map());
    setTopArtistsCache(null);
    setTopAlbumsCache(null);
    setTopTracksCache(null);
  }, [selectedCollectionId]);

  /**
   * Async search function for artists with caching
   */
  const handleSearchArtists = async (query: string): Promise<string[]> => {
    const cacheKey = query.toLowerCase().trim();
    
    // Check cache first
    if (artistsCache.has(cacheKey)) {
      return artistsCache.get(cacheKey)!;
    }

    // If query is empty or too short, return top artists
    if (!cacheKey || cacheKey.length < 2) {
      if (topArtistsCache) {
        return topArtistsCache;
      }
      const topArtists = await getTopArtists(20, selectedCollectionId || undefined);
      setTopArtistsCache(topArtists);
      return topArtists;
    }

    // Perform search
    const results = await searchArtists(query, 50, selectedCollectionId || undefined);
    
    // Cache results
    setArtistsCache((prev) => {
      const newCache = new Map(prev);
      newCache.set(cacheKey, results);
      return newCache;
    });

    return results;
  };

  /**
   * Async search function for albums with caching
   */
  const handleSearchAlbums = async (query: string): Promise<string[]> => {
    const cacheKey = query.toLowerCase().trim();
    
    // Check cache first
    if (albumsCache.has(cacheKey)) {
      return albumsCache.get(cacheKey)!;
    }

    // If query is empty or too short, return top albums
    if (!cacheKey || cacheKey.length < 2) {
      if (topAlbumsCache) {
        return topAlbumsCache;
      }
      const topAlbums = await getTopAlbums(20, selectedCollectionId || undefined);
      setTopAlbumsCache(topAlbums);
      return topAlbums;
    }

    // Perform search
    const results = await searchAlbums(query, 50, selectedCollectionId || undefined);
    
    // Cache results
    setAlbumsCache((prev) => {
      const newCache = new Map(prev);
      newCache.set(cacheKey, results);
      return newCache;
    });

    return results;
  };

  /**
   * Async search function for track titles with caching
   */
  const handleSearchTracks = async (query: string): Promise<string[]> => {
    const cacheKey = query.toLowerCase().trim();
    
    // Check cache first
    if (tracksCache.has(cacheKey)) {
      return tracksCache.get(cacheKey)!;
    }

    // If query is empty or too short, return top tracks
    if (!cacheKey || cacheKey.length < 2) {
      if (topTracksCache) {
        return topTracksCache;
      }
      const topTracks = await getTopTrackTitles(20, selectedCollectionId || undefined);
      setTopTracksCache(topTracks);
      return topTracks;
    }

    // Perform search
    const results = await searchTrackTitles(query, 50, selectedCollectionId || undefined);
    
    // Cache results
    setTracksCache((prev) => {
      const newCache = new Map(prev);
      newCache.set(cacheKey, results);
      return newCache;
    });

    return results;
  };

  // Auto-save draft is now handled by usePlaylistForm hook

  // Close collection selector when clicking outside
  useEffect(() => {
    if (!showCollectionSelector) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-collection-selector]')) {
        setShowCollectionSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCollectionSelector]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validate discovery mode requirements
    if (!validateDiscoveryMode()) {
      setIsSubmitting(false);
      return;
    }

    // Validate form
    const validationErrors = validate();
    if (!isValid()) {
      setIsSubmitting(false);
      return;
    }

    // Clear draft
    clearDraft();

    // Call onGenerate callback if provided
    if (onGenerate) {
      onGenerate(formData as PlaylistRequest);
      setIsSubmitting(false);
    } else {
      // Store collection ID with the request
      const requestWithCollection = {
        ...formData,
        collectionId: selectedCollectionId,
      };

      // Navigate to generating state
      // Store request in sessionStorage for the result page
      sessionStorage.setItem(
        "playlist-request",
        JSON.stringify(requestWithCollection)
      );
      router.push("/playlists/generating");
    }
  };

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Collection Selector */}
      {collections.length > 0 && (
        <div>
          <label className="flex items-center gap-2 text-app-primary mb-3">
            <FolderOpen className="size-5 text-accent-primary" />
            <span className="font-medium uppercase tracking-wider text-sm">
              Collection
            </span>
          </label>
          <div className="relative" data-collection-selector>
            <button
              type="button"
              onClick={() => setShowCollectionSelector(!showCollectionSelector)}
              className="w-full px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border hover:border-accent-primary transition-colors flex items-center justify-between"
            >
              <span>{selectedCollection?.name || "Select a collection"}</span>
              <ChevronDown className={`size-4 transition-transform ${showCollectionSelector ? "rotate-180" : ""}`} />
            </button>
            {showCollectionSelector && (
              <div className="absolute z-10 w-full mt-1 bg-app-surface border border-app-border rounded-sm shadow-lg max-h-48 overflow-y-auto" data-collection-selector>
                {collections.map((collection) => (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      setShowCollectionSelector(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-app-primary hover:bg-app-hover transition-colors ${
                      collection.id === selectedCollectionId ? "bg-accent-primary/10" : ""
                    }`}
                  >
                    {collection.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!selectedCollectionId && (
            <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
              <AlertCircle className="size-4" />
              Please select a collection to create a playlist
            </p>
          )}
        </div>
      )}

      {/* Source pool: preset and controls */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <History className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Source
          </span>
        </label>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  sourcePool: "recent",
                  recentWindow: "30d",
                  recentTrackCount: undefined,
                }))
              }
              className={cn(
                "px-3 py-1.5 rounded-sm text-sm font-medium transition-colors",
                formData.sourcePool === "recent"
                  ? "bg-accent-primary text-white"
                  : "bg-app-hover text-app-secondary hover:bg-app-border hover:text-app-primary"
              )}
            >
              Mix from recent additions
            </button>
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  sourcePool: "all",
                }))
              }
              className={cn(
                "px-3 py-1.5 rounded-sm text-sm font-medium transition-colors",
                formData.sourcePool !== "recent"
                  ? "bg-accent-primary text-white"
                  : "bg-app-hover text-app-secondary hover:bg-app-border hover:text-app-primary"
              )}
            >
              All tracks
            </button>
          </div>
          {formData.sourcePool === "recent" && (
            <div className="flex items-center gap-3 pl-1">
              <span className="text-app-secondary text-sm">Recent window:</span>
              <div className="flex gap-2">
                {(["7d", "30d", "90d"] as const).map((w) => (
                  <label
                    key={w}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="recentWindow"
                      checked={formData.recentWindow === w}
                      onChange={() =>
                        setFormData((prev) => ({
                          ...prev,
                          recentWindow: w,
                        }))
                      }
                      className="text-accent-primary"
                    />
                    <span className="text-app-primary text-sm">
                      {w === "7d"
                        ? "Last 7 days"
                        : w === "90d"
                          ? "Last 90 days"
                          : "Last 30 days"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Discovery Mode Introduction */}
      {discoveryMode && (
        <div className="border-2 border-accent-primary/30 rounded-sm p-4 bg-accent-primary/5 mb-6">
          <div className="flex items-start gap-3">
            <Sparkles className="size-5 text-accent-primary shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <h3 className="text-app-primary font-medium">
                Discover New Music from Your Collection
              </h3>
              <p className="text-app-secondary text-sm">
                Select genres, artists, albums, or tracks from your collection below. We&apos;ll use MusicBrainz to find similar new tracks that aren&apos;t in your library and add them to your playlist with explanations of why they were discovered and how they relate to your selections.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Genres - Prominent in discovery mode */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Music className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Select Genres from Your Collection
          </span>
        </label>
        {discoveryMode && (
          <p className="text-app-secondary text-sm mb-3">
            Choose genres from your collection. We&apos;ll discover new tracks in these genres that aren&apos;t in your library.
          </p>
        )}
        <ChipInput
          values={formData.genres || []}
          onChange={(genres) => setFormData({ ...formData, genres })}
          placeholder={discoveryMode ? "Select genres from your collection..." : "Select or add genres..."}
          suggestions={[...new Set([...genres, ...(formData.genres || [])])]}
          error={errors.genres}
          icon={<Music className="size-4" />}
          showCounts={true}
          genreStats={genresWithStats}
          relatedSuggestions={similarGenres}
        />
        {isLoadingGenres && (
          <p className="text-app-tertiary text-sm mt-2">Loading genres...</p>
        )}
      </div>

      {/* Length */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Clock className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Length
          </span>
        </label>
        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.length?.type === "minutes"}
                onChange={() =>
                  setFormData({
                    ...formData,
                    length: { type: "minutes", value: formData.length?.value || 30 },
                  })
                }
                className="text-accent-primary"
              />
              <span className="text-app-primary">Minutes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.length?.type === "tracks"}
                onChange={() =>
                  setFormData({
                    ...formData,
                    length: { type: "tracks", value: formData.length?.value || 20 },
                  })
                }
                className="text-accent-primary"
              />
              <span className="text-app-primary">Number of Tracks</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              max={formData.length?.type === "minutes" ? 600 : 1000}
              value={formData.length?.value || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  length: {
                    type: formData.length?.type || "minutes",
                    value: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="w-32 px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            />
            <span className="text-app-secondary text-sm">
              {formData.length?.type === "minutes" ? "minutes" : "tracks"}
            </span>
          </div>
          {errors.length && (
            <p className="text-red-500 text-sm flex items-center gap-1">
              <AlertCircle className="size-4" />
              {errors.length}
            </p>
          )}
        </div>
      </div>

      {/* Mood */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Heart className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Mood
          </span>
        </label>
        <ChipInput
          values={formData.mood || []}
          onChange={(mood) => setFormData({ ...formData, mood })}
          placeholder="Add moods..."
          suggestions={MOOD_SUGGESTIONS}
          error={errors.mood}
          icon={<Heart className="size-4" />}
        />
      </div>

      {/* Activity */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Activity className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Activity
          </span>
        </label>
        <ChipInput
          values={formData.activity || []}
          onChange={(activity) => setFormData({ ...formData, activity })}
          placeholder="Add activities..."
          suggestions={ACTIVITY_SUGGESTIONS}
          error={errors.activity}
          icon={<Activity className="size-4" />}
        />
      </div>

      {/* Tempo */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Gauge className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Tempo
          </span>
        </label>
        <div className="space-y-4">
          <div className="flex gap-4">
            {(["slow", "medium", "fast"] as const).map((bucket) => (
              <label key={bucket} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tempo-bucket"
                  checked={formData.tempo?.bucket === bucket}
                  onChange={() =>
                    setFormData({
                      ...formData,
                      tempo: { ...formData.tempo, bucket },
                    })
                  }
                  className="text-accent-primary"
                />
                <span className="text-app-primary capitalize">{bucket}</span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formData.tempo?.bpmRange}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tempo: {
                      ...formData.tempo,
                      bpmRange: e.target.checked
                        ? { min: 60, max: 120 }
                        : undefined,
                    },
                  })
                }
                className="text-accent-primary"
              />
              <span className="text-app-secondary text-sm">
                Specify BPM range (optional)
              </span>
            </label>
            {formData.tempo?.bpmRange && (
              <div className="flex items-center gap-4 pl-6">
                <div className="flex items-center gap-2">
                  <label className="text-app-secondary text-sm">Min:</label>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={formData.tempo.bpmRange.min || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tempo: {
                          ...formData.tempo,
                          bpmRange: {
                            min: parseInt(e.target.value) || 0,
                            max: formData.tempo?.bpmRange?.max || 120,
                          },
                        },
                      })
                    }
                    className="w-24 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-app-secondary text-sm">Max:</label>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={formData.tempo.bpmRange.max || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tempo: {
                          ...formData.tempo,
                          bpmRange: {
                            min: formData.tempo?.bpmRange?.min || 60,
                            max: parseInt(e.target.value) || 120,
                          },
                        },
                      })
                    }
                    className="w-24 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
                  />
                </div>
              </div>
            )}
          </div>
          {errors.tempo && (
            <p className="text-red-500 text-sm flex items-center gap-1">
              <AlertCircle className="size-4" />
              {errors.tempo}
            </p>
          )}
        </div>
      </div>

      {/* Include & Exclude - side by side */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Music className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Include & Exclude
          </span>
        </label>
        <p className="text-app-secondary text-sm mb-3">
          Artists, albums, or tracks to prioritize or exclude from this playlist (optional)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-app-secondary text-xs font-medium mb-1.5">
              Include (prioritize)
            </label>
            <LibrarySearchCombo
              filters={[
                ...(formData.suggestedArtists || []).map((v) => ({ type: "artist" as const, value: v })),
                ...(formData.suggestedAlbums || []).map((v) => ({ type: "album" as const, value: v })),
                ...(formData.suggestedTracks || []).map((v) => ({ type: "title" as const, value: v })),
              ]}
              onChange={(f) => {
                setFormData({
                  ...formData,
                  suggestedArtists: f.filter((x) => x.type === "artist").map((x) => x.value),
                  suggestedAlbums: f.filter((x) => x.type === "album").map((x) => x.value),
                  suggestedTracks: f.filter((x) => x.type === "title").map((x) => x.value),
                });
              }}
              allowedTypes={["artist", "album", "title"]}
              onSearchByType={{
                artist: handleSearchArtists,
                album: handleSearchAlbums,
                title: handleSearchTracks,
              }}
              placeholder="Search artists, albums, tracks…"
            />
          </div>
          <div>
            <label className="block text-app-secondary text-xs font-medium mb-1.5">
              Exclude
            </label>
            <LibrarySearchCombo
              filters={(formData.disallowedArtists || []).map((v) => ({ type: "artist" as const, value: v }))}
              onChange={(f) =>
                setFormData({
                  ...formData,
                  disallowedArtists: f.map((x) => x.value),
                })
              }
              allowedTypes={["artist"]}
              onSearchByType={{ artist: handleSearchArtists }}
              placeholder="Search artists to exclude…"
            />
          </div>
        </div>
      </div>

      {/* Artist Variety */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Users className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Artist Variety
          </span>
        </label>
        <p className="text-app-secondary text-sm mb-3">
          Specify the minimum number of unique artists to include in the playlist. Leave empty for automatic variety based on surprise level.
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <label className="text-app-secondary text-sm w-32">Min Artists:</label>
            <input
              type="number"
              min="1"
              max="100"
              value={formData.minArtists ?? ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  minArtists: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              placeholder="Auto"
              className="flex-1 max-w-32 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            />
            <button
              type="button"
              onClick={() =>
                setFormData({
                  ...formData,
                  minArtists: undefined,
                })
              }
              className="px-3 py-2 text-app-secondary hover:text-app-primary text-sm"
            >
              Clear
            </button>
          </div>
          {formData.minArtists && (
            <p className="text-app-tertiary text-xs">
              Playlist will include at least {formData.minArtists} unique {formData.minArtists === 1 ? "artist" : "artists"}
            </p>
          )}
        </div>
      </div>

      {/* Agent Selection */}
      <div>
        <AgentSelector
          agentType={formData.agentType || "built-in"}
          llmConfig={formData.llmConfig}
          onAgentTypeChange={(type) =>
            setFormData({ ...formData, agentType: type })
          }
          onLLMConfigChange={(config) =>
            setFormData({ ...formData, llmConfig: config })
          }
        />
      </div>

      {/* Additional instructions - shown for both built-in and LLM agents */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <span className="font-medium uppercase tracking-wider text-sm">
            Additional instructions (optional)
          </span>
        </label>
        <textarea
          maxLength={500}
          placeholder={
            formData.agentType === "llm"
              ? "e.g. favor 80s production, no ballads, more variety in the middle"
              : "e.g. chill relaxing, more variety, no slow songs, yoga meditation"
          }
          value={formData.llmAdditionalInstructions ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              llmAdditionalInstructions: e.target.value || undefined,
            })
          }
          className="w-full min-h-[72px] px-3 py-2 rounded-sm border border-app-border bg-app-bg text-app-primary placeholder:text-app-tertiary text-sm resize-y"
          rows={3}
        />
        <p className="text-app-tertiary text-xs mt-1">
          {(formData.llmAdditionalInstructions?.length ?? 0)}/500
        </p>
      </div>

      {/* Surprise - Shown after discovery in discovery mode */}
      {discoveryMode && (
        <div>
          <label className="flex items-center gap-2 text-app-primary mb-3">
            <Sparkles className="size-5 text-accent-primary" />
            <span className="font-medium uppercase tracking-wider text-sm">
              Surprise Level
            </span>
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-app-secondary text-sm w-20">Safe</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={formData.surprise ?? 0.7}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    surprise: parseFloat(e.target.value),
                  })
                }
                className="flex-1 h-2 bg-app-hover rounded-sm appearance-none cursor-pointer accent-accent-primary"
              />
              <span className="text-app-secondary text-sm w-24 text-right">
                Adventurous
              </span>
            </div>
            <div className="text-center">
              <span className="text-app-tertiary text-sm">
                {((formData.surprise ?? 0.7) * 100).toFixed(0)}%
              </span>
            </div>
            {errors.surprise && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <AlertCircle className="size-4" />
                {errors.surprise}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Surprise - Shown in library mode */}
      {!discoveryMode && (
        <div>
          <label className="flex items-center gap-2 text-app-primary mb-3">
            <Sparkles className="size-5 text-accent-primary" />
            <span className="font-medium uppercase tracking-wider text-sm">
              Surprise Level
            </span>
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-app-secondary text-sm w-20">Safe</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={formData.surprise ?? 0.5}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    surprise: parseFloat(e.target.value),
                  })
                }
                className="flex-1 h-2 bg-app-hover rounded-sm appearance-none cursor-pointer accent-accent-primary"
              />
              <span className="text-app-secondary text-sm w-24 text-right">
                Adventurous
              </span>
            </div>
            <div className="text-center">
              <span className="text-app-tertiary text-sm">
                {((formData.surprise ?? 0.5) * 100).toFixed(0)}%
              </span>
            </div>
            {errors.surprise && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <AlertCircle className="size-4" />
                {errors.surprise}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Music Discovery - Shown in library mode */}
      {!discoveryMode && (
        <div>
          <label className="flex items-center gap-2 text-app-primary mb-3">
            <Sparkles className="size-5 text-accent-primary" />
            <span className="font-medium uppercase tracking-wider text-sm">
              Music Discovery
            </span>
          </label>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enableDiscovery ?? false}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      enableDiscovery: e.target.checked,
                      discoveryFrequency: e.target.checked
                        ? formData.discoveryFrequency || "every_other"
                        : undefined,
                    })
                  }
                  className="text-accent-primary"
                />
                <span className="text-app-primary text-sm">
                  Enable music discovery
                </span>
              </label>
            </div>
            {formData.enableDiscovery && (
              <div className="pl-6 space-y-3">
                <p className="text-app-secondary text-sm">
                  Discover new tracks similar to your library that aren&apos;t in your collection.
                  These tracks will be marked as &quot;New&quot; in the playlist.
                </p>
                <div>
                  <label className="text-app-secondary text-sm mb-2 block">
                    Discovery Frequency
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="discovery-frequency-library"
                        checked={formData.discoveryFrequency === "every"}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            discoveryFrequency: "every",
                          })
                        }
                        className="text-accent-primary"
                      />
                      <span className="text-app-primary text-sm">Every track</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="discovery-frequency-library"
                        checked={formData.discoveryFrequency === "every_other"}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            discoveryFrequency: "every_other",
                          })
                        }
                        className="text-accent-primary"
                      />
                      <span className="text-app-primary text-sm">Every other track</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-8 py-4 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider font-medium flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="size-5" />
              <span>Generate Playlist</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

