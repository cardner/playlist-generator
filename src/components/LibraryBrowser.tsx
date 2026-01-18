/**
 * LibraryBrowser Component
 * 
 * Component for browsing and searching the user's music library. Provides
 * filtering, sorting, and search capabilities for viewing scanned tracks.
 * 
 * Features:
 * - Track search by title, artist, or album
 * - Genre filtering with normalized genre support
 * - Sortable columns (title, artist, duration)
 * - Genre statistics display
 * - Clear library functionality
 * - Optimized rendering for large libraries (1000+ tracks)
 * 
 * State Management:
 * - Loads tracks from IndexedDB on mount
 * - Manages search query and filter state
 * - Handles sorting configuration
 * - Uses `useMemo` for optimized filtering and sorting
 * 
 * Performance Optimizations:
 * - Memoized filtering and sorting to prevent unnecessary re-renders
 * - Efficient genre normalization and mapping
 * - Limits search results for performance
 * 
 * Props:
 * - `refreshTrigger`: Number to trigger refresh (for external updates)
 * 
 * @module components/LibraryBrowser
 * 
 * @example
 * ```tsx
 * <LibraryBrowser refreshTrigger={refreshCount} />
 * ```
 */

"use client";

import { useState, useEffect, useMemo, Fragment, useRef, useCallback } from "react";
import { Edit2, Play, Pause, Loader2 } from "lucide-react";
import type { TrackRecord } from "@/db/schema";
import {
  getAllTracks,
  getTracks,
  searchTracks,
  filterTracksByGenre,
  getAllGenres,
  getAllGenresWithStats,
  clearLibraryData,
} from "@/db/storage";
import { getCurrentLibraryRoot } from "@/db/storage";
import type { GenreWithStats } from "@/features/library/genre-normalization";
import { normalizeGenre, buildGenreMappings } from "@/features/library/genre-normalization";
import { TrackMetadataEditor } from "./TrackMetadataEditor";
import { InlineAudioPlayer, type InlineAudioPlayerRef } from "./InlineAudioPlayer";
import { searchTrackSample } from "@/features/audio-preview/platform-searcher";
import { useAudioPreviewState } from "@/hooks/useAudioPreviewState";
import { logger } from "@/lib/logger";

type SortField = "title" | "artist" | "duration";
type SortDirection = "asc" | "desc";

interface LibraryBrowserProps {
  refreshTrigger?: number;
}

export function LibraryBrowser({ refreshTrigger }: LibraryBrowserProps) {
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [genres, setGenres] = useState<string[]>([]);
  const [genresWithStats, setGenresWithStats] = useState<GenreWithStats[]>([]);
  const [genreMappings, setGenreMappings] = useState<{ originalToNormalized: Map<string, string> } | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Start as false - only load when we have a root
  const [libraryRootId, setLibraryRootId] = useState<string | undefined>();
  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null); // null = checking, false = no library, true = has library
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);

  // Audio preview state
  const audioPreviewState = useAudioPreviewState();
  const {
    playingTrackId,
    searchingTrackId,
    hasSampleResult,
    getSampleResult,
    setSampleResult,
    setError,
    setPlayingTrack,
    clearPlayingTrack,
    setSearchingTrack,
    clearAll: clearAllAudioState,
  } = audioPreviewState;
  const audioRefs = useRef<Map<string, InlineAudioPlayerRef>>(new Map());

  // Check if we have a library root before loading
  useEffect(() => {
    async function checkLibrary() {
      try {
        const root = await getCurrentLibraryRoot();
        setHasLibrary(!!root);
        setLibraryRootId(root?.id);
      } catch (err) {
        setHasLibrary(false);
      }
    }
    checkLibrary();
  }, [refreshTrigger]);

  // Load tracks and genres only if we have a library
  useEffect(() => {
    // Wait for library check to complete
    if (hasLibrary === null) {
      return; // Still checking
    }

    // Only load if we have a library root
    if (hasLibrary) {
      // Small delay to ensure database writes are complete after scan
      const loadWithDelay = async () => {
        if (refreshTrigger && refreshTrigger > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        await loadTracks();
      };
      loadWithDelay();
    } else {
      // No library, clear tracks
      setTracks([]);
      setGenres([]);
      setGenresWithStats([]);
      setGenreMappings(null);
      setIsLoading(false);
    }
  }, [refreshTrigger, hasLibrary]);

  // Filter and sort tracks using useMemo for better performance
  const filteredTracks = useMemo(() => {
    let filtered = [...tracks];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (track) =>
          track.tags.title.toLowerCase().includes(query) ||
          track.tags.artist.toLowerCase().includes(query) ||
          track.tags.album?.toLowerCase().includes(query)
      );
    }

    // Apply genre filter (using normalized genres)
    if (selectedGenre) {
      const normalizedSelected = normalizeGenre(selectedGenre);
      filtered = filtered.filter((track) => {
        // Get normalized genres for this track
        const trackNormalizedGenres = track.tags.genres.map((g) => {
          if (genreMappings?.originalToNormalized) {
            return genreMappings.originalToNormalized.get(g) || normalizeGenre(g);
          }
          return normalizeGenre(g);
        });
        return trackNormalizedGenres.some(
          (g) => g.toLowerCase() === normalizedSelected.toLowerCase()
        );
      });
    }

    // Apply sorting (create new array to avoid mutating original)
    return [...filtered].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case "title":
          aValue = a.tags.title.toLowerCase();
          bValue = b.tags.title.toLowerCase();
          break;
        case "artist":
          aValue = a.tags.artist.toLowerCase();
          bValue = b.tags.artist.toLowerCase();
          break;
        case "duration":
          aValue = a.tech?.durationSeconds || 0;
          bValue = b.tech?.durationSeconds || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [tracks, searchQuery, selectedGenre, sortField, sortDirection, genreMappings]);

  async function loadTracks() {
    setIsLoading(true);
    try {
      const root = await getCurrentLibraryRoot();
      if (!root) {
        // No library root, don't load
        setTracks([]);
        setGenres([]);
        setGenresWithStats([]);
        setGenreMappings(null);
        setIsLoading(false);
        return;
      }

      setLibraryRootId(root.id);

      // Load tracks for the current collection only
      const collectionTracks = await getTracks(root.id);
      setTracks(collectionTracks);

      // Load normalized genres with stats
      const genresStats = await getAllGenresWithStats(root.id);
      setGenresWithStats(genresStats);
      setGenres(genresStats.map((g) => g.normalized));

      // Build genre mappings for filtering
      const mappings = buildGenreMappings(collectionTracks);
      setGenreMappings({ originalToNormalized: mappings.originalToNormalized });
    } catch (error) {
      logger.error("Failed to load tracks:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleClearLibrary() {
    if (
      !confirm(
        "Are you sure you want to clear all library data? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      await clearLibraryData();
      setTracks([]);
      setGenres([]);
      setGenresWithStats([]);
      setGenreMappings(null);
      alert("Library data cleared successfully.");
    } catch (error) {
      logger.error("Failed to clear library:", error);
      alert("Failed to clear library data.");
    }
  }

  function formatDuration(seconds?: number): string {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Handler for inline audio preview play/pause
  const handleInlinePlayClick = useCallback(async (
    trackFileId: string,
    trackInfo: { title: string; artist: string; album?: string }
  ) => {
    // If already playing this track, pause it
    if (playingTrackId === trackFileId) {
      const audioControls = audioRefs.current.get(trackFileId);
      if (audioControls) {
        audioControls.pause();
      }
      clearPlayingTrack();
      return;
    }

    // If playing different track, stop it first
    if (playingTrackId) {
      const prevAudioControls = audioRefs.current.get(playingTrackId);
      if (prevAudioControls) {
        prevAudioControls.stop();
      }
      clearPlayingTrack();
    }

    // Check if we already have sample result cached
    if (hasSampleResult(trackFileId)) {
      const sampleResult = getSampleResult(trackFileId)!;
      // Start playing immediately
      setPlayingTrack(trackFileId);
      // Use retry logic to ensure audio element is ready
      const attemptPlay = async (attempts = 0) => {
        if (attempts > 10) return; // Max 10 attempts (1 second total)
        
        const audioControls = audioRefs.current.get(trackFileId);
        if (audioControls) {
          try {
            await audioControls.play();
            // Success - stop retrying
            return;
          } catch (err) {
            // If play fails, try again after a short delay
            if (attempts < 10) {
              setTimeout(() => attemptPlay(attempts + 1), 100);
            }
          }
        } else if (attempts < 10) {
          // Audio controls not ready yet, try again
          setTimeout(() => attemptPlay(attempts + 1), 100);
        }
      };
      
      // Start attempting to play after a short delay
      setTimeout(() => attemptPlay(), 50);
      return;
    }

    // Search for preview
    setSearchingTrack(trackFileId);
    try {
      const sampleResult = await searchTrackSample(trackInfo);
      if (sampleResult) {
        // Set sample result and playing track state first
        setSampleResult(trackFileId, sampleResult);
        setPlayingTrack(trackFileId);
        // Clear searching state AFTER setting sample result to ensure audio element exists
        setSearchingTrack(null);
        
        // Trigger play after a short delay to ensure React has rendered the audio element
        // and the audio has started loading. We'll try multiple times to handle timing issues.
        const attemptPlay = async (attempts = 0) => {
          if (attempts > 15) return; // Max 15 attempts (1.5 seconds total)
          
          const audioControls = audioRefs.current.get(trackFileId);
          if (audioControls) {
            try {
              await audioControls.play();
              // Success - stop retrying
              return;
            } catch (err) {
              // If play fails, try again after a short delay (audio might still be loading)
              if (attempts < 15) {
                setTimeout(() => attemptPlay(attempts + 1), 100);
              }
            }
          } else if (attempts < 15) {
            // Audio controls not ready yet, try again
            setTimeout(() => attemptPlay(attempts + 1), 100);
          }
        };
        
        // Use requestAnimationFrame to ensure React has rendered the audio element
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Start attempting to play
            attemptPlay();
          });
        });
      } else {
        setError(trackFileId, "Preview not available for this track");
        setSearchingTrack(null);
      }
    } catch (error) {
      logger.error("[LibraryBrowser] Failed to search for preview:", error);
      setError(trackFileId, "Failed to find preview for this track");
      setSearchingTrack(null);
    }
  }, [playingTrackId, hasSampleResult, getSampleResult, setSampleResult, setError, setPlayingTrack, clearPlayingTrack, setSearchingTrack]);

  // Cleanup when component unmounts
  useEffect(() => {
    const currentRefs = audioRefs.current;
    return () => {
      // Stop all audio when component unmounts
      currentRefs.forEach(controls => controls.stop());
      currentRefs.clear();
      // Clear all audio preview state
      clearAllAudioState();
    };
  }, [clearAllAudioState]);

  // Don't show anything if no library has been selected/scanned yet
  // Wait for library check to complete before deciding
  if (hasLibrary === null) {
    return null; // Still checking, don't show anything yet
  }

  // If no library exists, don't show the browser
  if (!hasLibrary) {
    return null; // Return null to hide the component until a library is selected
  }

  if (isLoading) {
    return (
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <p className="text-app-secondary">Loading tracks...</p>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <h2 className="text-app-primary mb-4">Track List</h2>
        <p className="text-app-tertiary">
          No tracks found. Scan your library to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <div className="space-y-4">
          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-app-primary mb-2 uppercase tracking-wider">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, artist, or album..."
              className="w-full px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border placeholder-app-tertiary focus:outline-none focus:border-accent-primary"
            />
          </div>

          {/* Genre Filter */}
          <div>
            <label className="block text-xs font-medium text-app-primary mb-2 uppercase tracking-wider">
              Genre
            </label>
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            >
              <option value="">All Genres</option>
              {genresWithStats.map((genreStat) => (
                <option key={genreStat.normalized} value={genreStat.normalized}>
                  {genreStat.normalized} ({genreStat.trackCount} {genreStat.trackCount === 1 ? 'track' : 'tracks'})
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-4">
            <label className="text-xs font-medium text-app-primary uppercase tracking-wider">
              Sort by:
            </label>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="px-4 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            >
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="duration">Duration</option>
            </select>
            <button
              onClick={() =>
                setSortDirection(sortDirection === "asc" ? "desc" : "asc")
              }
              className="px-4 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover transition-colors"
            >
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
          </div>

          {/* Results count */}
          <div className="text-sm text-app-secondary">
            Showing {filteredTracks.length} of {tracks.length} tracks
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-app-primary">Tracks</h2>
          <button
            onClick={handleClearLibrary}
            className="text-xs text-red-500 hover:text-red-400 uppercase tracking-wider"
          >
            Clear Library Data
          </button>
        </div>

        {filteredTracks.length === 0 ? (
          <p className="text-app-tertiary">
            No tracks match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border">
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider w-12">
                    Play
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Title
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Artist
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Album
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Genre
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    BPM
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider w-16">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTracks.map((track) => {
                  const isEditing = editingTrackId === track.id;
                  const currentGenres = track.enhancedMetadata?.genres || track.tags.genres || [];
                  
                  return (
                    <Fragment key={track.trackFileId}>
                      <tr
                        className="border-b border-app-border hover:bg-app-hover transition-colors group"
                      >
                        <td className="py-2 px-4">
                          <button
                            onClick={() => handleInlinePlayClick(track.trackFileId, {
                              title: track.tags.title || "Unknown Title",
                              artist: track.tags.artist || "Unknown Artist",
                              album: track.tags.album,
                            })}
                            disabled={searchingTrackId === track.trackFileId}
                            className="flex items-center justify-center size-8 text-app-tertiary group-hover:text-accent-primary transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                            aria-label={playingTrackId === track.trackFileId ? "Pause" : "Play"}
                            title={playingTrackId === track.trackFileId ? "Pause" : "Play 30-second preview"}
                          >
                            {searchingTrackId === track.trackFileId ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : playingTrackId === track.trackFileId ? (
                              <Pause className="size-4" />
                            ) : (
                              <Play className="size-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-2 px-4 text-app-primary">{track.tags.title}</td>
                        <td className="py-2 px-4 text-app-primary">{track.tags.artist}</td>
                        <td className="py-2 px-4 text-app-secondary">{track.tags.album}</td>
                        <td className="py-2 px-4 text-app-secondary">
                          {currentGenres.join(", ") || "—"}
                        </td>
                        <td className="py-2 px-4 text-app-secondary tabular-nums">
                          {formatDuration(track.tech?.durationSeconds)}
                        </td>
                        <td className="py-2 px-4 text-app-secondary">
                          {track.tech?.bpm ? (
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums">{track.tech.bpm}</span>
                              {track.tech.bpmConfidence !== undefined && (
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    track.tech.bpmConfidence >= 0.7
                                      ? "bg-green-500/20 text-green-400"
                                      : track.tech.bpmConfidence >= 0.5
                                      ? "bg-yellow-500/20 text-yellow-400"
                                      : "bg-red-500/20 text-red-400"
                                  }`}
                                  title={`Confidence: ${Math.round(track.tech.bpmConfidence * 100)}% | Source: ${track.tech.bpmSource || 'unknown'} | Method: ${track.tech.bpmMethod || 'unknown'}`}
                                >
                                  {track.tech.bpmConfidence >= 0.7 ? "✓" : track.tech.bpmConfidence >= 0.5 ? "~" : "?"}
                                </span>
                              )}
                              {track.tech.bpmSource === 'id3' && (
                                <span className="text-xs text-app-tertiary" title="From ID3 tag">ID3</span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 px-4">
                          <button
                            onClick={() => setEditingTrackId(isEditing ? null : track.id)}
                            className="p-1.5 hover:bg-app-surface rounded-sm transition-colors text-app-secondary hover:text-accent-primary"
                            aria-label="Edit metadata"
                            title="Edit metadata"
                          >
                            <Edit2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr key={`${track.id}-editor`}>
                          <td colSpan={8} className="p-0">
                            <div className="px-4 py-2">
                              <TrackMetadataEditor
                                track={track}
                                genreSuggestions={genres}
                                onSave={async (trackId, edits) => {
                                  setEditingTrackId(null);
                                  // Reload tracks to show updated metadata
                                  await loadTracks();
                                }}
                                onCancel={() => {
                                  setEditingTrackId(null);
                                }}
                                inline={true}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                      {/* Inline Audio Player */}
                      {hasSampleResult(track.trackFileId) && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <InlineAudioPlayer
                              ref={(ref) => {
                                if (ref) {
                                  audioRefs.current.set(track.trackFileId, ref);
                                } else {
                                  audioRefs.current.delete(track.trackFileId);
                                }
                              }}
                              trackFileId={track.trackFileId}
                              sampleResult={getSampleResult(track.trackFileId) || null}
                              autoPlay={playingTrackId === track.trackFileId && !searchingTrackId && hasSampleResult(track.trackFileId)}
                              onPlay={() => setPlayingTrack(track.trackFileId)}
                              onPause={() => clearPlayingTrack()}
                              onEnded={() => clearPlayingTrack()}
                              onError={(error) => {
                                setError(track.trackFileId, error);
                                clearPlayingTrack();
                              }}
                              onLoaded={async () => {
                                // Audio loaded successfully - trigger play if this track should be playing
                                // This is a fallback in case autoPlay didn't work due to timing issues
                                if (playingTrackId === track.trackFileId && !searchingTrackId) {
                                  const audioControls = audioRefs.current.get(track.trackFileId);
                                  if (audioControls) {
                                    try {
                                      await audioControls.play();
                                    } catch {
                                      // Ignore play errors - user may have paused or switched tracks
                                      // The useAudioPreview hook should handle auto-play via the autoPlay prop
                                    }
                                  }
                                }
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

