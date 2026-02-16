/**
 * LibraryBrowser Component
 *
 * Component for browsing and searching the user's music library. Provides
 * filtering, sorting, pagination, and search capabilities for viewing scanned tracks.
 *
 * Features:
 * - Track search by title, artist, or album
 * - Genre filtering with normalized genre support
 * - Sortable columns (title, artist, duration)
 * - Pagination (25/50/100/200 per page)
 * - Genre statistics display
 * - Clear library functionality
 * - Optimized rendering for large libraries (1000+ tracks)
 *
 * State Management:
 * - Loads tracks from IndexedDB on mount
 * - Manages search query, filter, and pagination state
 * - Handles sorting configuration
 * - Uses `useMemo` for optimized filtering, sorting, and pagination
 *
 * Performance Optimizations:
 * - Memoized filtering and sorting to prevent unnecessary re-renders
 * - Memoized `LibraryBrowserTrackRow` to skip re-renders when props unchanged
 * - `useCallback` for stable event handlers passed to rows
 * - Pagination limits DOM nodes for large result sets
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

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { TrackRecord, TrackWritebackRecord } from "@/db/schema";
import {
  getTracks,
  getAllGenresWithStats,
  clearLibraryData,
  getWritebackStatuses,
} from "@/db/storage";
import { getCurrentLibraryRoot } from "@/db/storage";
import type { GenreWithStats } from "@/features/library/genre-normalization";
import { normalizeGenre, buildGenreMappings } from "@/features/library/genre-normalization";
import { mapMoodTagsToCategories } from "@/features/library/mood-mapping";
import { mapActivityTagsToCategories } from "@/features/library/activity-mapping";
import {
  LibrarySearchCombo,
  type FilterTag,
} from "./LibrarySearchCombo";
import type { InlineAudioPlayerRef } from "./InlineAudioPlayer";
import { searchTrackSample } from "@/features/audio-preview/platform-searcher";
import { useAudioPreviewState } from "@/hooks/useAudioPreviewState";
import { useMetadataWriteback } from "@/hooks/useMetadataWriteback";
import { MAX_PLAY_ATTEMPTS } from "@/lib/audio-playback-config";
import type { LibraryRoot } from "@/lib/library-selection";
import { Save, SearchCheck, Trash2 } from "lucide-react";
import { logger } from "@/lib/logger";
import { LibraryBrowserTrackRow } from "./LibraryBrowserTrackRow";

type SortField = "title" | "artist" | "duration";
type SortDirection = "asc" | "desc";

interface LibraryBrowserProps {
  refreshTrigger?: number;
  /** When provided with onFiltersChange, filters are controlled by parent (e.g. library page) */
  filters?: FilterTag[];
  onFiltersChange?: (filters: FilterTag[]) => void;
}

export function LibraryBrowser({ refreshTrigger, filters: controlledFilters, onFiltersChange }: LibraryBrowserProps) {
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [internalFilters, setInternalFilters] = useState<FilterTag[]>([]);

  // Use controlled filters when both props provided; otherwise use internal state
  const filters = controlledFilters != null && onFiltersChange ? controlledFilters : internalFilters;
  const setFilters = controlledFilters != null && onFiltersChange ? onFiltersChange : setInternalFilters;
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [genres, setGenres] = useState<string[]>([]);
  const [genresWithStats, setGenresWithStats] = useState<GenreWithStats[]>([]);
  const [genreMappings, setGenreMappings] = useState<{ originalToNormalized: Map<string, string> } | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Start as false - only load when we have a root
  const [libraryRootId, setLibraryRootId] = useState<string | undefined>();
  const [libraryRoot, setLibraryRoot] = useState<LibraryRoot | null>(null);
  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null); // null = checking, false = no library, true = has library
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [writebackStatuses, setWritebackStatuses] = useState<Map<string, TrackWritebackRecord>>(
    new Map()
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

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
  const hoverPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchInFlightRef = useRef<Set<string>>(new Set());
  const MAX_PREFETCH_CONCURRENT = 3;

  const {
    isWriting,
    writebackProgress,
    error: writebackError,
    handleWriteback,
    isValidating,
    validationResults,
    validationError,
    handleValidateWriteback,
    clearError: clearWritebackError,
    clearValidation,
  } = useMetadataWriteback();

  const loadTracks = useCallback(async () => {
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

      const writebackRecords = await getWritebackStatuses(root.id);
      setWritebackStatuses(
        new Map(writebackRecords.map((record) => [record.trackFileId, record]))
      );

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
  }, []);

  // Check if we have a library root before loading
  useEffect(() => {
    async function checkLibrary() {
      try {
        const root = await getCurrentLibraryRoot();
        setHasLibrary(!!root);
        setLibraryRootId(root?.id);
        setLibraryRoot(
          root
            ? {
                mode: root.mode,
                name: root.name,
                handleId: root.handleRef,
              }
            : null
        );
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
      setWritebackStatuses(new Map());
      setIsLoading(false);
    }
  }, [refreshTrigger, hasLibrary, loadTracks]);

  // Filter and sort tracks using useMemo for better performance
  const filteredTracks = useMemo(() => {
    let filtered = [...tracks];

    const parseBpmFilter = (
      value: string
    ): ((bpm: number | undefined) => boolean) | null => {
      const v = value.trim().toLowerCase();
      if (v === "slow") return (b) => b != null && b < 100;
      if (v === "medium") return (b) => b != null && b >= 100 && b <= 130;
      if (v === "fast") return (b) => b != null && b > 130;
      const rangeMatch = v.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rangeMatch) {
        const min = Number(rangeMatch[1]);
        const max = Number(rangeMatch[2]);
        if (!Number.isNaN(min) && !Number.isNaN(max)) {
          return (b) => b != null && b >= min && b <= max;
        }
      }
      const num = Number(v);
      if (!Number.isNaN(num)) {
        return (b) => b != null && b >= num - 5 && b <= num + 5;
      }
      return null;
    };

    const getTrackMoods = (track: TrackRecord): string[] => {
      const tags = track.enhancedMetadata?.mood || [];
      return mapMoodTagsToCategories(tags);
    };
    const getTrackActivities = (track: TrackRecord): string[] => {
      const tags = track.enhancedMetadata?.activity || [];
      return mapActivityTagsToCategories(tags);
    };

    // Genre and artist filters use OR (additive) so clicking chips adds more results.
    // Other filter types use AND as before.
    const genreFilters = filters.filter((f) => f.type === "genre").map((f) => f.value.trim()).filter(Boolean);
    const artistFilters = filters.filter((f) => f.type === "artist").map((f) => f.value.trim()).filter(Boolean);
    const otherFilters = filters.filter((f) => f.type !== "genre" && f.type !== "artist");

    const hasChipFilters = genreFilters.length > 0 || artistFilters.length > 0;
    if (hasChipFilters) {
      const normalizedGenres = genreFilters.map((v) => normalizeGenre(v).toLowerCase());
      const artistVals = artistFilters.map((v) => v.toLowerCase());
      const hasGenre = genreFilters.length > 0;
      const hasArtist = artistFilters.length > 0;
      filtered = filtered.filter((t) => {
        const matchesGenre = hasGenre && normalizedGenres.some((ng) => {
          const trackGenres = t.tags.genres.map((g) => {
            const norm = genreMappings?.originalToNormalized?.get(g) ?? normalizeGenre(g);
            return norm.toLowerCase();
          });
          return trackGenres.includes(ng);
        });
        const matchesArtist = hasArtist && artistVals.some((av) =>
          (t.tags.artist ?? "").toLowerCase().includes(av)
        );
        if (hasGenre && hasArtist) return matchesGenre || matchesArtist;
        if (hasGenre) return matchesGenre;
        return matchesArtist;
      });
    }

    for (const f of otherFilters) {
      const val = f.value.trim().toLowerCase();
      if (!val) continue;

      switch (f.type) {
        case "title":
          filtered = filtered.filter((t) =>
            t.tags.title.toLowerCase().includes(val)
          );
          break;
        case "album":
          filtered = filtered.filter((t) =>
            (t.tags.album ?? "").toLowerCase().includes(val)
          );
          break;
        case "bpm": {
          const bpmPred = parseBpmFilter(f.value);
          if (bpmPred) {
            filtered = filtered.filter((t) => bpmPred(t.tech?.bpm));
          }
          break;
        }
        case "mood": {
          const moodVal = f.value.trim();
          filtered = filtered.filter((t) => {
            const moods = getTrackMoods(t);
            return moods.some(
              (m) => m.toLowerCase() === moodVal.toLowerCase()
            );
          });
          break;
        }
        case "intensity":
          // Intensity maps to mood categories (Intense, Energetic, Calm, etc.)
          filtered = filtered.filter((t) => {
            const moods = getTrackMoods(t);
            return moods.some(
              (m) => m.toLowerCase() === f.value.trim().toLowerCase()
            );
          });
          break;
        case "activity": {
          const actVal = f.value.trim();
          filtered = filtered.filter((t) => {
            const acts = getTrackActivities(t);
            return acts.some(
              (a) => a.toLowerCase() === actVal.toLowerCase()
            );
          });
          break;
        }
        case "text":
          filtered = filtered.filter(
            (t) =>
              t.tags.title.toLowerCase().includes(val) ||
              t.tags.artist.toLowerCase().includes(val) ||
              (t.tags.album ?? "").toLowerCase().includes(val)
          );
          break;
      }
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
  }, [tracks, filters, sortField, sortDirection, genreMappings]);

  const pendingWritebackCount = useMemo(() => {
    let count = 0;
    writebackStatuses.forEach((record) => {
      if (record.pending) {
        count += 1;
      }
    });
    return count;
  }, [writebackStatuses]);

  // Reset to first page when filters or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredTracks]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTracks.length / pageSize)),
    [filteredTracks.length, pageSize]
  );

  const paginatedTracks = useMemo(
    () =>
      filteredTracks.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredTracks, currentPage, pageSize]
  );

  const handleTrackSave = useCallback(async () => {
    setEditingTrackId(null);
    await loadTracks();
  }, [loadTracks]);

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

  async function handleWritebackClick() {
    if (!libraryRoot || !libraryRootId) {
      return;
    }
    try {
      clearWritebackError();
      await handleWriteback(libraryRoot, libraryRootId);
      await loadTracks();
    } catch (error) {
      logger.error("Failed to start metadata sync:", error);
    }
  }

  async function handleValidateWritebackClick() {
    if (!libraryRoot || !libraryRootId) {
      return;
    }
    try {
      clearValidation();
      await handleValidateWriteback(libraryRoot, libraryRootId);
    } catch (error) {
      logger.error("Failed to validate writeback:", error);
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
      // Show loading until stream loads and audio actually plays (onPlay fires)
      setSearchingTrack(trackFileId);
      // Use retry logic to ensure audio element is ready
      const attemptPlay = async (attempts = 0) => {
        if (attempts >= MAX_PLAY_ATTEMPTS) {
          setSearchingTrack(null);
          return;
        }
        
        const audioControls = audioRefs.current.get(trackFileId);
        if (audioControls) {
          try {
            await audioControls.play();
            // Success - onPlay will clear searching and show pause
            return;
          } catch (err) {
            if (attempts < MAX_PLAY_ATTEMPTS - 1) {
              setTimeout(() => attemptPlay(attempts + 1), 100);
            } else {
              setSearchingTrack(null);
            }
          }
        } else if (attempts < MAX_PLAY_ATTEMPTS - 1) {
          setTimeout(() => attemptPlay(attempts + 1), 100);
        } else {
          setSearchingTrack(null);
        }
      };
      
      // Start attempting to play after a short delay
      setTimeout(() => attemptPlay(), 50);
      return;
    }

    // Search for preview - show loading immediately
    setSearchingTrack(trackFileId);
    try {
      const sampleResult = await searchTrackSample(trackInfo);
      if (sampleResult) {
        // Set sample result - keep loading until stream loads and audio plays (onPlay fires)
        setSampleResult(trackFileId, sampleResult);
        
        // Trigger play after a short delay to ensure React has rendered the audio element
        // and the audio has started loading. We'll try multiple times to handle timing issues.
        const attemptPlay = async (attempts = 0) => {
          if (attempts >= MAX_PLAY_ATTEMPTS) {
            setSearchingTrack(null);
            return;
          }
          
          const audioControls = audioRefs.current.get(trackFileId);
          if (audioControls) {
            try {
              await audioControls.play();
              // Success - onPlay will clear searching and show pause
              return;
            } catch (err) {
              if (attempts < MAX_PLAY_ATTEMPTS - 1) {
                setTimeout(() => attemptPlay(attempts + 1), 100);
              } else {
                setSearchingTrack(null);
              }
            }
          } else if (attempts < MAX_PLAY_ATTEMPTS - 1) {
            setTimeout(() => attemptPlay(attempts + 1), 100);
          } else {
            setSearchingTrack(null);
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
  }, [playingTrackId, hasSampleResult, setSampleResult, setError, clearPlayingTrack, setSearchingTrack]);

  // Prefetch preview on hover - caches result so first click can play immediately (within user gesture)
  const prefetchTrackSample = useCallback(
    async (trackFileId: string, trackInfo: { title: string; artist: string; album?: string }) => {
      if (hasSampleResult(trackFileId)) return;
      if (prefetchInFlightRef.current.has(trackFileId)) return;
      if (prefetchInFlightRef.current.size >= MAX_PREFETCH_CONCURRENT) return;

      prefetchInFlightRef.current.add(trackFileId);
      try {
        const sampleResult = await searchTrackSample(trackInfo);
        if (sampleResult) {
          setSampleResult(trackFileId, sampleResult);
        }
      } catch (error) {
        logger.debug("[LibraryBrowser] Prefetch failed:", error);
      } finally {
        prefetchInFlightRef.current.delete(trackFileId);
      }
    },
    [hasSampleResult, setSampleResult]
  );

  const handleTrackRowMouseEnter = useCallback(
    (trackFileId: string, trackInfo: { title: string; artist: string; album?: string }) => {
      if (hoverPrefetchTimeoutRef.current) {
        clearTimeout(hoverPrefetchTimeoutRef.current);
        hoverPrefetchTimeoutRef.current = null;
      }
      hoverPrefetchTimeoutRef.current = setTimeout(() => {
        hoverPrefetchTimeoutRef.current = null;
        prefetchTrackSample(trackFileId, trackInfo);
      }, 250);
    },
    [prefetchTrackSample]
  );

  const handleTrackRowMouseLeave = useCallback(() => {
    if (hoverPrefetchTimeoutRef.current) {
      clearTimeout(hoverPrefetchTimeoutRef.current);
      hoverPrefetchTimeoutRef.current = null;
    }
  }, []);

  const handleEditClick = useCallback((trackId: string) => {
    setEditingTrackId((prev) => (prev === trackId ? null : trackId));
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingTrackId(null);
  }, []);

  const registerAudioRef = useCallback((trackFileId: string, ref: InlineAudioPlayerRef | null) => {
    if (ref) {
      audioRefs.current.set(trackFileId, ref);
    } else {
      audioRefs.current.delete(trackFileId);
    }
  }, []);

  const handleAudioLoaded = useCallback(
    (trackFileId: string) => {
      if (playingTrackId === trackFileId && !searchingTrackId) {
        const audioControls = audioRefs.current.get(trackFileId);
        if (audioControls) {
          void Promise.resolve(
            (audioControls.play as () => unknown)()
          ).catch(() => {
            // Ignore play errors
          });
        }
      }
    },
    [playingTrackId, searchingTrackId]
  );

  // Cleanup when component unmounts
  useEffect(() => {
    const currentRefs = audioRefs.current;
    return () => {
      if (hoverPrefetchTimeoutRef.current) {
        clearTimeout(hoverPrefetchTimeoutRef.current);
      }
      currentRefs.forEach(controls => controls.stop());
      currentRefs.clear();
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
      <div className="p-6">
        <p className="text-app-secondary">Loading tracks...</p>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-app-primary mb-4">Track List</h2>
        <p className="text-app-tertiary">
          No tracks found. Scan your library to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {writebackError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4 text-sm text-red-500">
          {writebackError}
        </div>
      )}

      {validationError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4 text-sm text-red-500">
          {validationError}
        </div>
      )}

      {validationResults && (
        <div className="bg-app-surface rounded-sm border border-app-border p-4 text-sm text-app-secondary">
          <div className="flex items-center justify-between mb-2">
            <span className="text-app-primary font-medium">Writeback Validation</span>
            <button
              type="button"
              onClick={clearValidation}
              className="text-xs text-app-tertiary hover:text-app-secondary uppercase tracking-wider"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {validationResults.map((result) => (
              <div
                key={result.extension}
                className={`flex items-center justify-between px-3 py-2 rounded-sm border ${
                  result.success
                    ? "border-green-500/20 bg-green-500/10 text-green-500"
                    : "border-red-500/20 bg-red-500/10 text-red-500"
                }`}
              >
                <span className="uppercase text-xs tracking-wider">{result.extension}</span>
                <span className="text-xs">
                  {result.success ? "ok" : result.message || "failed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {writebackProgress && (
        <div className="bg-app-surface rounded-sm border border-app-border p-4 text-sm text-app-secondary">
          <div className="flex items-center justify-between">
            <span>
              Syncing metadata:{" "}
              <span className="text-app-primary font-medium">
                {writebackProgress.processed}/{writebackProgress.total}
              </span>
              {writebackProgress.errors > 0 && (
                <span className="ml-2 text-red-500">
                  ({writebackProgress.errors} errors)
                </span>
              )}
            </span>
            {writebackProgress.currentFile && (
              <span className="text-xs text-app-tertiary truncate max-w-[50%]">
                {writebackProgress.currentFile}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Track List — no card, sits on page background */}
      <div>
        {/* Sticky header: search, filters, pagination, actions — stays at top when scrolling */}
        <div className="sticky top-0 z-10 bg-app-bg border-app-border">
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <LibrarySearchCombo
                filters={filters}
                onChange={setFilters}
                tracks={tracks}
                genres={genres}
                genreStats={genresWithStats}
                genreMappings={genreMappings}
                placeholder="Search: title, artist, album, genre, BPM, mood, intensity…"
                compact={true}
              />
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="px-2 py-1.5 text-sm bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
                aria-label="Sort by"
              >
                <option value="title">Title</option>
                <option value="artist">Artist</option>
                <option value="duration">Duration</option>
              </select>
              <button
                onClick={() =>
                  setSortDirection(sortDirection === "asc" ? "desc" : "asc")
                }
                className="px-2 py-1.5 text-sm bg-app-hover text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover transition-colors"
                aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
                title={sortDirection === "asc" ? "Ascending" : "Descending"}
              >
                {sortDirection === "asc" ? "↑" : "↓"}
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-app-primary text-sm font-medium mr-2">Tracks</span>
              <button
                onClick={handleWritebackClick}
                disabled={!pendingWritebackCount || isWriting}
                className="flex items-center justify-center size-8 text-accent-primary hover:text-accent-hover rounded-sm border border-app-border hover:bg-app-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label={pendingWritebackCount ? `Sync metadata to files (${pendingWritebackCount} pending)` : "Sync metadata to files"}
                title={pendingWritebackCount ? `Sync metadata (${pendingWritebackCount} pending)` : "Sync metadata to files"}
              >
                <Save className="size-4" />
              </button>
              <button
                onClick={handleValidateWritebackClick}
                disabled={isValidating}
                className="flex items-center justify-center size-8 text-app-tertiary hover:text-app-secondary rounded-sm border border-app-border hover:bg-app-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Validate writeback"
                title="Validate writeback"
              >
                <SearchCheck className="size-4" />
              </button>
              <button
                onClick={handleClearLibrary}
                className="flex items-center justify-center size-8 text-red-500 hover:text-red-400 rounded-sm border border-app-border hover:bg-app-hover transition-colors"
                aria-label="Clear library data"
                title="Clear library data"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {filteredTracks.length === 0 ? (
          <p className="text-app-tertiary px-4 py-6 text-sm">
            No tracks match your filters.
          </p>
        ) : (
          <>
          <div className="">
            <div className="app-table-wrap sticky-top-12">
              <table className="app-table">
                <thead>
                  <tr>
                    <th className="w-12">Play</th>
                    <th>Title</th>
                    <th>Artist</th>
                    <th>Album</th>
                    <th>Genre</th>
                    <th>Duration</th>
                    <th>BPM</th>
                    <th className="w-16">Actions</th>
                  </tr>
                </thead>
                <tbody>
                {paginatedTracks.map((track) => {
                  const writebackStatus = writebackStatuses.get(track.trackFileId);
                  const writebackState = writebackStatus?.pending
                    ? writebackStatus.lastWritebackError
                      ? "error"
                      : "pending"
                    : writebackStatus?.lastWritebackAt
                    ? "synced"
                    : null;

                  return (
                    <LibraryBrowserTrackRow
                      key={track.trackFileId}
                      track={track}
                      isEditing={editingTrackId === track.id}
                      genres={genres}
                      writebackStatus={writebackStatus}
                      writebackState={writebackState}
                      playingTrackId={playingTrackId}
                      searchingTrackId={searchingTrackId}
                      hasSampleResult={hasSampleResult}
                      getSampleResult={getSampleResult}
                      onPlayClick={handleInlinePlayClick}
                      onMouseEnter={handleTrackRowMouseEnter}
                      onMouseLeave={handleTrackRowMouseLeave}
                      onEditClick={handleEditClick}
                      onEditCancel={handleEditCancel}
                      onSave={handleTrackSave}
                      formatDuration={formatDuration}
                      registerAudioRef={registerAudioRef}
                      onAudioLoaded={handleAudioLoaded}
                      setPlayingTrack={setPlayingTrack}
                      setSearchingTrack={setSearchingTrack}
                      setError={setError}
                      clearPlayingTrack={clearPlayingTrack}
                    />
                  );
                })}
                </tbody>
              </table>
            </div>
          </div>
          {filteredTracks.length > pageSize && (
            <div className="flex flex-col gap-2 px-4 py-3 border-t border-app-border bg-app-surface md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-xs text-app-tertiary">
                <span className="tabular-nums">
                  {`${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredTracks.length)} of ${filteredTracks.length}`}
                </span>
                <label className="flex items-center gap-1">
                  <span>Per page</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-1.5 py-1 text-xs bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
                  >
                    {[25, 50, 100, 200, 300, 400, 500].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <nav
                className="flex items-center gap-1 justify-end"
                aria-label="Pagination"
              >
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2 py-1 text-xs bg-app-hover text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="px-2 py-1 text-xs text-app-secondary tabular-nums">
                  {currentPage}/{totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage >= totalPages}
                  className="px-2 py-1 text-xs bg-app-hover text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </nav>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

