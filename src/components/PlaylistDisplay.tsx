/**
 * PlaylistDisplay Component
 * 
 * Main component for displaying and interacting with generated playlists.
 * Provides a comprehensive view of playlist tracks, reasons, discovery tracks,
 * and various playlist manipulation features.
 * 
 * Features:
 * - Displays playlist tracks with inline audio preview
 * - Shows track selection reasons and explanations
 * - Supports playlist variants (calmer, faster, more variety, etc.)
 * - Allows playlist regeneration with seed control
 * - Provides playlist export functionality
 * - Supports flow arc editing and reordering
 * - Integrates discovery tracks with explanations
 * 
 * State Management:
 * - Uses `useAudioPreviewState` hook for managing audio playback across multiple tracks
 * - Manages track loading and lookup from IndexedDB
 * - Handles playlist editing state (flow arc, track reordering)
 * - Tracks variant generation and regeneration state
 * 
 * Performance Optimizations:
 * - Uses `useMemo` to pre-compute track data and avoid redundant lookups
 * - Memoizes expensive computations (track data maps, filtering)
 * - Optimized rendering for large playlists (100+ tracks)
 * 
 * @module components/PlaylistDisplay
 * 
 * @example
 * ```tsx
 * <PlaylistDisplay
 *   playlist={generatedPlaylist}
 *   libraryRootId="root-123"
 *   playlistCollectionId="collection-456"
 * />
 * ```
 */

"use client";

import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import type { GeneratedPlaylist, TrackSelection } from "@/features/playlists";
import type { TrackRecord } from "@/db/schema";
import { getCurrentLibraryRoot } from "@/db/storage";
import { db, getCompositeId } from "@/db/schema";
import { PlaylistWhySummary } from "./PlaylistWhySummary";
import { TrackReasonChips } from "./TrackReasonChips";
import { PlaylistExport } from "./PlaylistExport";
import { DiscoveryTrackBadge } from "./DiscoveryTrackBadge";
import { TrackSamplePlayer } from "./TrackSamplePlayer";
import { InlineAudioPlayer, type InlineAudioPlayerRef } from "./InlineAudioPlayer";
import { searchTrackSample } from "@/features/audio-preview/platform-searcher";
import type { SampleResult } from "@/features/audio-preview/types";
import { logger } from "@/lib/logger";
import { MAX_PLAY_ATTEMPTS } from "@/lib/audio-playback-config";
import { useAudioPreviewState } from "@/hooks/useAudioPreviewState";
import { usePlaylistEditState } from "@/hooks/usePlaylistEditState";
import {
  calculatePlaylistSummaryFromTracks,
  type SummaryTrackInput,
} from "@/lib/playlist-summary-calculator";
import { FlowArcEditor } from "./FlowArcEditor";
import { generateVariant, type VariantType } from "@/features/playlists/variants";
import { generatePlaylistTitle } from "@/features/playlists/naming";
import { orderTracks } from "@/features/playlists/ordering";
import { buildMatchingIndex } from "@/features/library/summarization";
import { EmojiPicker } from "./EmojiPicker";
import { DraggableTrackList } from "./DraggableTrackList";
import { TrackAddDialog } from "./TrackAddDialog";
import type { LLMConfig } from "@/types/playlist";
import { TrackExpansionPanel } from "./TrackExpansionPanel";
import { findSimilarTracks } from "@/lib/similar-tracks-finder";
import {
  Play,
  Pause,
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
  GripVertical,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { ChipInput } from "./ChipInput";
import {
  getStrategy,
  generatePlaylistFromStrategy,
  generateReplacementTracksFromStrategy,
  remixSavedPlaylist,
} from "@/features/playlists";
import type { PlaylistRequest } from "@/types/playlist";
import { getCurrentLibrarySummary } from "@/features/library/summarization";
import { getAllGenres, getAllArtists, getAllAlbums, getAllTrackTitles } from "@/db/storage";
import {
  savePlaylist,
  updatePlaylist as updateSavedPlaylist,
  updatePlaylistMetadata,
  isPlaylistSaved,
  getSavedPlaylistRequest,
} from "@/db/playlist-storage";
import { SavePlaylistDialog } from "./SavePlaylistDialog";

interface PlaylistDisplayProps {
  playlist: GeneratedPlaylist;
  playlistCollectionId?: string; // Collection ID the playlist was created from
}

export function PlaylistDisplay({ playlist: initialPlaylist, playlistCollectionId }: PlaylistDisplayProps) {
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
  const [customEmoji, setCustomEmoji] = useState<string | null | undefined>(playlist.customEmoji);
  
  // Sync customEmoji when playlist prop changes
  useEffect(() => {
    setCustomEmoji(playlist.customEmoji);
  }, [playlist.customEmoji]);
  
  const [showInlineEditor, setShowInlineEditor] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showTrackAddDialog, setShowTrackAddDialog] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LLMConfig | undefined>(undefined);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [showRemixDialog, setShowRemixDialog] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [variantError, setVariantError] = useState<{
    title: string;
    message: string;
    suggestions: string[];
  } | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [albums, setAlbums] = useState<string[]>([]);
  const [trackTitles, setTrackTitles] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [pendingGenres, setPendingGenres] = useState<string[]>([]);
  const [pendingArtists, setPendingArtists] = useState<string[]>([]);
  const [pendingAlbums, setPendingAlbums] = useState<string[]>([]);
  const [pendingTracks, setPendingTracks] = useState<string[]>([]);
  const [showFlowArcEditor, setShowFlowArcEditor] = useState(false);
  const [pendingFlowArcStrategy, setPendingFlowArcStrategy] = useState<typeof playlist.strategy | null>(null);
  const [playingSample, setPlayingSample] = useState<{
    trackFileId: string;
    sampleResult: SampleResult;
    trackInfo: { title: string; artist: string; album?: string };
  } | null>(null);
  const [searchingSample, setSearchingSample] = useState<string | null>(null); // trackFileId being searched
  const [sampleError, setSampleError] = useState<string | null>(null);

  type DiscoveryTrackItem = NonNullable<GeneratedPlaylist["discoveryTracks"]>[number];

  const buildSummary = useCallback((trackFileIds: string[]) => {
    const discoveryMap = new Map<string, DiscoveryTrackItem>();
    if (playlist.discoveryTracks) {
      for (const dt of playlist.discoveryTracks) {
        discoveryMap.set(`discovery:${dt.discoveryTrack.mbid}`, dt);
      }
    }

    const summaryInputs: SummaryTrackInput[] = [];
    for (const trackFileId of trackFileIds) {
      if (trackFileId.startsWith("discovery:")) {
        const discovery = discoveryMap.get(trackFileId);
        if (discovery) {
          summaryInputs.push({
            trackFileId,
            genres: discovery.discoveryTrack.genres || [],
            artist: discovery.discoveryTrack.artist,
            durationSeconds: discovery.discoveryTrack.duration,
          });
        }
        continue;
      }

      const track = tracks.get(trackFileId);
      if (!track) continue;
      summaryInputs.push({
        trackFileId,
        genres: track.tags.genres || [],
        artist: track.tags.artist,
        durationSeconds: track.tech?.durationSeconds,
        bpm: track.tech?.bpm,
      });
    }

    return calculatePlaylistSummaryFromTracks(summaryInputs);
  }, [playlist.discoveryTracks, tracks]);

  const {
    editedPlaylist,
    isDirty,
    updatePlaylist,
    updateTrackFileIds,
    resetEdits,
    markClean,
  } = usePlaylistEditState(playlist, { buildSummary });

  const displayPlaylist = isEditMode ? editedPlaylist : playlist;

  const trackItems = useMemo(() => {
    const discoveryTracksMap = new Map();

    if (displayPlaylist.discoveryTracks) {
      for (const dt of displayPlaylist.discoveryTracks) {
        discoveryTracksMap.set(`discovery:${dt.discoveryTrack.mbid}`, dt);
      }
    }

    const selectionsMap = new Map();
    for (const selection of displayPlaylist.trackSelections) {
      selectionsMap.set(selection.trackFileId, selection);
    }

    const orderedTracksMap = new Map();
    if (displayPlaylist.orderedTracks) {
      for (const orderedTrack of displayPlaylist.orderedTracks) {
        orderedTracksMap.set(orderedTrack.trackFileId, orderedTrack);
      }
    }

    return displayPlaylist.trackFileIds
      .map((trackFileId, index) => {
        const isDiscoveryTrack = trackFileId.startsWith("discovery:");
        const discoveryTrack = isDiscoveryTrack ? discoveryTracksMap.get(trackFileId) : null;
        const track = isDiscoveryTrack ? null : tracks.get(trackFileId);
        const selection = selectionsMap.get(trackFileId);
        const orderedTrack = orderedTracksMap.get(trackFileId);

        if (!track && !discoveryTrack) return null;

        return {
          trackFileId,
          index,
          isDiscoveryTrack,
          discoveryTrack,
          track,
          selection,
          orderedTrack,
          reasons: orderedTrack?.reasons || selection?.reasons || [],
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [
    displayPlaylist.trackFileIds,
    displayPlaylist.discoveryTracks,
    displayPlaylist.trackSelections,
    displayPlaylist.orderedTracks,
    tracks,
  ]);

  const allTrackRecords = useMemo(() => Array.from(tracks.values()), [tracks]);
  
  // Inline audio preview state - use hook for better state management
  const audioPreviewState = useAudioPreviewState();
  const {
    playingTrackId,
    searchingTrackId,
    getSampleResult,
    getError,
    hasSampleResult,
    setSampleResult,
    setError: setTrackError,
    setPlayingTrack,
    clearPlayingTrack,
    setSearchingTrack,
    clearAll: clearAllAudioState,
  } = audioPreviewState;
  const audioRefs = useRef<Map<string, InlineAudioPlayerRef>>(new Map());
  const hoverPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchInFlightRef = useRef<Set<string>>(new Set());
  const MAX_PREFETCH_CONCURRENT = 3;

  const checkIfSaved = useCallback(async () => {
    const saved = await isPlaylistSaved(playlist.id);
    setIsSaved(saved);
  }, [playlist.id]);

  const loadTracks = useCallback(async () => {
    const root = await getCurrentLibraryRoot();
    // Prefer playlistCollectionId (collection used during generation) for correct track lookups
    const rootId = playlistCollectionId ?? libraryRootId ?? root?.id;
    const trackFileIds = Array.from(new Set(displayPlaylist.trackFileIds));

    if (trackFileIds.length === 0) {
      setTracks(new Map());
      return;
    }

    let records: Array<TrackRecord | undefined> = [];
    if (rootId) {
      const compositeIds = trackFileIds.map((trackFileId) =>
        getCompositeId(trackFileId, rootId)
      );
      records = await db.tracks.bulkGet(compositeIds);
    } else {
      records = await db.tracks.where("trackFileId").anyOf(trackFileIds).toArray();
    }

    const trackMap = new Map<string, TrackRecord>();
    for (const track of records) {
      if (track) {
        trackMap.set(track.trackFileId, track);
      }
    }
    setTracks(trackMap);
  }, [displayPlaylist.trackFileIds, libraryRootId, playlistCollectionId]);

  const loadLibraryRoot = useCallback(async () => {
    const root = await getCurrentLibraryRoot();
    setLibraryRootId(root?.id);
  }, []);

  useEffect(() => {
    loadTracks();
    loadLibraryRoot();
    checkIfSaved();
    // Clear playing sample when playlist changes to prevent blob URL errors
    setPlayingSample(null);
  }, [playlist, checkIfSaved, loadTracks, loadLibraryRoot]);

  useEffect(() => {
    const stored = sessionStorage.getItem("playlist-request");
    if (!stored) return;
    try {
      const request = JSON.parse(stored) as { llmConfig?: LLMConfig };
      setLlmConfig(request.llmConfig);
    } catch {
      // Ignore parsing errors
    }
  }, []);

  const getRequestFromSessionStorage = (): PlaylistRequest | undefined => {
    const stored = sessionStorage.getItem("playlist-request");
    if (!stored) return undefined;
    try {
      return JSON.parse(stored) as PlaylistRequest;
    } catch {
      return undefined;
    }
  };

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
          logger.error("Failed to load suggestions:", error);
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
        logger.error("No playlist request found");
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

      // Clear playing sample before updating playlist to prevent blob URL errors
      setPlayingSample(null);
      setPlaylist(generated);
      sessionStorage.setItem("generated-playlist", JSON.stringify(generated));
    } catch (error) {
      logger.error("Failed to regenerate:", error);
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleVariant(variantType: VariantType, genre?: string) {
    setIsRegenerating(true);
    setVariantError(null);
    try {
      // Load original request
      const stored = sessionStorage.getItem("playlist-request");
      if (!stored) {
        logger.error("No playlist request found");
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
      storePlaylistInSessionStorage(generated);
    } catch (error) {
      logger.error("Failed to generate variant:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate variant";
      if (errorMessage.includes("No tracks match the playlist criteria")) {
        setVariantError({
          title: "No more variants available",
          message: "We ran out of tracks that match the current criteria for this variant.",
          suggestions: [
            "Add more genres, artists, or albums.",
            "Reduce constraints like mood/tempo.",
            "Try a different variant button.",
            "Add tracks directly in edit mode.",
          ],
        });
      } else {
        setVariantError({
          title: "Variant generation failed",
          message: errorMessage,
          suggestions: ["Try again or adjust your criteria."],
        });
      }
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
        logger.error("No playlist request found");
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
      logger.error("Failed to update playlist:", error);
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

  const renderTrackRow = (
    item: {
      trackFileId: string;
      index: number;
      isDiscoveryTrack: boolean;
      discoveryTrack: any;
      track: any;
      reasons: any[];
    },
    options?: { rowProps?: React.HTMLAttributes<HTMLDivElement>; isDragging?: boolean }
  ) => {
    const { trackFileId, index, isDiscoveryTrack, discoveryTrack, track, reasons } = item;
    const rowProps = options?.rowProps || {};
    const isDragging = options?.isDragging || false;

    const dragHandle = isEditMode ? (
      <div
        className="flex items-center justify-center size-7 text-app-tertiary cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </div>
    ) : null;

    if (isDiscoveryTrack && discoveryTrack) {
      const dtrack = discoveryTrack.discoveryTrack;
      return (
        <div
          {...rowProps}
          className={cn(
            "px-4 md:px-6 py-4 hover:bg-app-hover transition-colors group border-l-2 border-accent-primary/30 bg-accent-primary/5",
            isDragging && "opacity-70"
          )}
          onMouseEnter={() =>
            handleTrackRowMouseEnter(trackFileId, {
              title: dtrack.title,
              artist: dtrack.artist,
              album: dtrack.album,
            })
          }
          onMouseLeave={handleTrackRowMouseLeave}
        >
          <div className="flex items-start gap-4">
            {dragHandle}
            <button
              onClick={() =>
                handleInlinePlayClick(trackFileId, {
                  title: dtrack.title,
                  artist: dtrack.artist,
                  album: dtrack.album,
                })
              }
              disabled={searchingTrackId === trackFileId}
              className="flex items-center justify-center size-8 text-app-tertiary group-hover:text-accent-primary transition-colors shrink-0 mt-1 cursor-pointer disabled:opacity-50"
            >
              {searchingTrackId === trackFileId ? (
                <Loader2 className="size-4 animate-spin" />
              ) : playingTrackId === trackFileId ? (
                <Pause className="size-4" />
              ) : (
                <>
                  <span className="text-sm group-hover:hidden">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Play className="size-4 hidden group-hover:block" />
                </>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-app-primary font-medium truncate">
                      {dtrack.title}
                    </div>
                    <DiscoveryTrackBadge explanation={dtrack.explanation} />
                  </div>
                  <div className="text-app-secondary text-sm truncate">
                    {dtrack.artist}
                  </div>
                  {dtrack.album && (
                    <div className="text-app-tertiary text-xs truncate mt-1">
                      {dtrack.album}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {dtrack.duration && (
                    <div className="text-app-secondary text-sm tabular-nums shrink-0">
                      {formatDuration(dtrack.duration)}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (isEditMode) {
                        handleRemoveTrack(trackFileId);
                        return;
                      }
                      const updatedTrackFileIds = displayPlaylist.trackFileIds.filter(
                        id => id !== trackFileId
                      );
                      const updatedDiscoveryTracks = displayPlaylist.discoveryTracks?.filter(
                        dt => `discovery:${dt.discoveryTrack.mbid}` !== trackFileId
                      );
                      setPlaylist({
                        ...displayPlaylist,
                        trackFileIds: updatedTrackFileIds,
                        discoveryTracks: updatedDiscoveryTracks,
                      });
                    }}
                    disabled={isRegenerating}
                    className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-sm transition-all disabled:opacity-50"
                    title="Remove discovery track"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              {dtrack.explanation && (
                <div className="mt-2 p-2 bg-app-hover rounded-sm border border-app-border">
                  <p className="text-app-secondary text-xs leading-relaxed">
                    {dtrack.explanation}
                  </p>
                </div>
              )}

              {getError(trackFileId) && (
                <div className="mt-2 flex items-center gap-2 text-red-500 text-xs">
                  <AlertCircle className="size-3" />
                  <span>{getError(trackFileId)}</span>
                </div>
              )}

              {reasons.length > 0 && (
                <div className="mt-2">
                  <TrackReasonChips reasons={reasons} />
                </div>
              )}
            </div>
          </div>

          <InlineAudioPlayer
            ref={(ref) => {
              if (ref) {
                audioRefs.current.set(trackFileId, ref);
              } else {
                audioRefs.current.delete(trackFileId);
              }
            }}
            trackFileId={trackFileId}
            sampleResult={getSampleResult(trackFileId) || null}
            autoPlay={playingTrackId === trackFileId && !searchingTrackId && hasSampleResult(trackFileId)}
            onPlay={() => {
              setPlayingTrack(trackFileId);
              setSearchingTrack(null);
            }}
            onPause={() => clearPlayingTrack()}
            onEnded={() => clearPlayingTrack()}
            onError={(error) => {
              setTrackError(trackFileId, error);
              clearPlayingTrack();
              setSearchingTrack(null);
            }}
            onLoaded={async () => {
              if (playingTrackId === trackFileId && !searchingTrackId) {
                const audioControls = audioRefs.current.get(trackFileId);
                if (audioControls) {
                  try {
                    await audioControls.play();
                  } catch {
                    // Ignore play errors
                  }
                }
              }
            }}
          />
        </div>
      );
    }

    if (!track) return null;

    const isExpanded = expandedTrackId === trackFileId;
    const similar = isExpanded ? findSimilarTracks(track, allTrackRecords) : null;

    return (
      <>
        <div
          {...rowProps}
          className={cn(
            "px-4 md:px-6 py-4 hover:bg-app-hover transition-colors group",
            isDragging && "opacity-70"
          )}
          onMouseEnter={() =>
            handleTrackRowMouseEnter(trackFileId, {
              title: track.tags.title || "Unknown Title",
              artist: track.tags.artist || "Unknown Artist",
              album: track.tags.album,
            })
          }
          onMouseLeave={handleTrackRowMouseLeave}
        >
          <div className="flex items-start gap-4">
            {dragHandle}
            <button
              onClick={() =>
                handleInlinePlayClick(trackFileId, {
                  title: track.tags.title || "Unknown Title",
                  artist: track.tags.artist || "Unknown Artist",
                  album: track.tags.album,
                })
              }
              disabled={searchingTrackId === trackFileId}
              className="flex items-center justify-center size-8 text-app-tertiary group-hover:text-accent-primary transition-colors shrink-0 mt-1 cursor-pointer disabled:opacity-50"
            >
              {searchingTrackId === trackFileId ? (
                <Loader2 className="size-4 animate-spin" />
              ) : playingTrackId === trackFileId ? (
                <Pause className="size-4" />
              ) : (
                <>
                  <span className="text-sm group-hover:hidden">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Play className="size-4 hidden group-hover:block" />
                </>
              )}
            </button>

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
                <div className="flex items-center gap-2">
                  <div className="text-app-secondary text-sm tabular-nums shrink-0">
                    {formatDuration(track.tech?.durationSeconds)}
                  </div>
                  <button
                    onClick={() => setExpandedTrackId(isExpanded ? null : trackFileId)}
                    className="p-2 text-app-secondary hover:text-accent-primary transition-colors"
                    title={isExpanded ? "Hide details" : "Show details"}
                  >
                    {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
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

              {getError(trackFileId) && (
                <div className="mt-2 flex items-center gap-2 text-red-500 text-xs">
                  <AlertCircle className="size-3" />
                  <span>{getError(trackFileId)}</span>
                </div>
              )}

              {reasons.length > 0 && (
                <div className="mt-2">
                  <TrackReasonChips reasons={reasons} />
                </div>
              )}
            </div>

            <InlineAudioPlayer
              ref={(ref) => {
                if (ref) {
                  audioRefs.current.set(trackFileId, ref);
                } else {
                  audioRefs.current.delete(trackFileId);
                }
              }}
              trackFileId={trackFileId}
              sampleResult={getSampleResult(trackFileId) || null}
              autoPlay={playingTrackId === trackFileId && !searchingTrackId && hasSampleResult(trackFileId)}
              onPlay={() => {
                setPlayingTrack(trackFileId);
                setSearchingTrack(null);
              }}
              onPause={() => clearPlayingTrack()}
              onEnded={() => clearPlayingTrack()}
              onError={(error) => {
                setTrackError(trackFileId, error);
                clearPlayingTrack();
                setSearchingTrack(null);
              }}
              onLoaded={async () => {
                if (playingTrackId === trackFileId && !searchingTrackId) {
                  const audioControls = audioRefs.current.get(trackFileId);
                  if (audioControls) {
                    try {
                      await audioControls.play();
                    } catch {
                      // Ignore play errors
                    }
                  }
                }
              }}
            />
          </div>

          {isExpanded && similar && (
            <TrackExpansionPanel
              track={track}
              similarArtists={similar.similarArtists}
              similarTracks={similar.similarTracks}
              onAddTrack={isEditMode ? handleAddTrackToEditPlaylist : undefined}
            />
          )}
        </div>
      </>
    );
  };

  const handleAddTrackToEditPlaylist = (track: TrackRecord) => {
    if (!isEditMode) return;
    updatePlaylist((prev) => {
      if (prev.trackFileIds.includes(track.trackFileId)) {
        return prev;
      }
      const newSelection: TrackSelection = {
        trackFileId: track.trackFileId,
        track,
        score: 0,
        reasons: [],
        genreMatch: 0,
        tempoMatch: 0,
        moodMatch: 0.5,
        activityMatch: 0.5,
        durationFit: 0,
        diversity: 0,
        surprise: 0,
      };
      const updatedSelections = [...prev.trackSelections, newSelection];
      const updatedTrackFileIds = [...prev.trackFileIds, track.trackFileId];
      const updatedOrderedTracks = prev.orderedTracks
        ? [
            ...prev.orderedTracks,
            {
              trackFileId: track.trackFileId,
              position: prev.orderedTracks.length,
              section: "transition",
              reasons: [],
              transitionScore: 0,
            },
          ]
        : prev.orderedTracks;

      return {
        ...prev,
        trackFileIds: updatedTrackFileIds,
        trackSelections: updatedSelections,
        orderedTracks: updatedOrderedTracks,
      };
    });
  };

  const handleSaveEdits = async (options: { mode: "override" | "remix"; title: string; description?: string }) => {
    setIsSavingChanges(true);
    try {
      const targetLibraryRootId = playlistCollectionId ?? libraryRootId;
      const storedRequest =
        getRequestFromSessionStorage() ??
        (isSaved ? await getSavedPlaylistRequest(playlist.id) : undefined);

      if (options.mode === "override") {
        const updated: GeneratedPlaylist = {
          ...editedPlaylist,
          title: options.title,
          description: options.description ?? editedPlaylist.description,
        };
        await updateSavedPlaylist(updated, targetLibraryRootId, storedRequest);
        setPlaylist(updated);
        markClean(updated);
        setIsSaved(true);
        storePlaylistInSessionStorage(updated);
      } else {
        const remixId = `playlist-remix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const remixed: GeneratedPlaylist = {
          ...editedPlaylist,
          id: remixId,
          title: options.title || `${editedPlaylist.title} (Remix)`,
          description: options.description ?? editedPlaylist.description,
          createdAt: Date.now(),
        };
        await savePlaylist(remixed, targetLibraryRootId, storedRequest);
        setPlaylist(remixed);
        markClean(remixed);
        setIsSaved(true);
        storePlaylistInSessionStorage(remixed);
      }
    } catch (error) {
      logger.error("Failed to save playlist edits:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setIsSavingChanges(false);
      setShowSaveDialog(false);
    }
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
    storePlaylistInSessionStorage(updatedPlaylist);

    // Update in IndexedDB if saved
    if (isSaved) {
      try {
        await updatePlaylistMetadata(playlist.id, editedTitle.trim());
      } catch (error) {
        logger.error("Failed to update playlist metadata:", error);
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
      // Ensure customEmoji is included when saving
      const playlistToSave: GeneratedPlaylist = { 
        ...playlist, 
        customEmoji: customEmoji 
      };
      const storedRequest = getRequestFromSessionStorage();
      await savePlaylist(playlistToSave, libraryRootId, storedRequest);
      setIsSaved(true);
    } catch (error) {
      logger.error("Failed to save playlist:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemix(options: { title: string; description?: string }) {
    setIsRemixing(true);
    try {
      const sessionRequest = getRequestFromSessionStorage();
      const storedRequest =
        sessionRequest ?? (await getSavedPlaylistRequest(playlist.id));
      const targetLibraryRootId = playlistCollectionId ?? libraryRootId;
      const { playlist: remixed, request } = await remixSavedPlaylist({
        playlist,
        storedRequest,
        libraryRootId: targetLibraryRootId,
        title: options.title,
        description: options.description,
      });
      await savePlaylist(remixed, targetLibraryRootId, request);
      setPlaylist(remixed);
      markClean(remixed);
      setIsSaved(true);
      storePlaylistInSessionStorage(remixed);
      sessionStorage.setItem("playlist-request", JSON.stringify(request));
    } catch (error) {
      logger.error("Failed to remix playlist:", error);
      alert("Failed to remix playlist. Please try again.");
    } finally {
      setIsRemixing(false);
      setShowRemixDialog(false);
    }
  }

  const handleToggleEditMode = useCallback((next: boolean) => {
    if (!next && isDirty) {
      const shouldExit = confirm("You have unsaved changes. Discard them?");
      if (!shouldExit) {
        return;
      }
      resetEdits();
    }
    setIsEditMode(next);
    if (!next) {
      setShowInlineEditor(false);
      setShowFlowArcEditor(false);
      setExpandedTrackId(null);
    }
  }, [isDirty, resetEdits]);

  async function handleFlowArcUpdate(updatedStrategy: typeof playlist.strategy) {
    setIsRegenerating(true);
    try {
      const targetPlaylist = isEditMode ? editedPlaylist : playlist;
      // Re-order tracks based on updated strategy
      const request = JSON.parse(
        sessionStorage.getItem("playlist-request") || "{}"
      ) as PlaylistRequest;
      
      // Build matching index
      const matchingIndex = await buildMatchingIndex(libraryRootId);
      
      // Re-order tracks using the updated strategy
      const ordered = orderTracks(
        targetPlaylist.trackSelections,
        updatedStrategy,
        request,
        matchingIndex
      );

      // Update playlist with new ordering
      const updatedPlaylist: typeof playlist = {
        ...targetPlaylist,
        strategy: updatedStrategy,
        orderedTracks: ordered.tracks,
        trackFileIds: ordered.tracks.map((t) => t.trackFileId),
      };

      if (isEditMode) {
        updatePlaylist(() => updatedPlaylist);
      } else {
        setPlaylist(updatedPlaylist);
      }

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
    } catch (error) {
      logger.error("Failed to update flow arc:", error);
    } finally {
      setIsRegenerating(false);
    }
  }

  function handleFlowArcDraftUpdate(updatedStrategy: typeof playlist.strategy) {
    setPendingFlowArcStrategy(updatedStrategy);
  }

  function handleFlowArcReorder(reorderedSections: typeof playlist.strategy.orderingPlan.sections) {
    const baseStrategy = pendingFlowArcStrategy ?? displayPlaylist.strategy;
    const updatedStrategy = {
      ...baseStrategy,
      orderingPlan: {
        ...baseStrategy.orderingPlan,
        sections: reorderedSections,
      },
    };
    handleFlowArcDraftUpdate(updatedStrategy);
  }

  async function handleApplyFlowArc() {
    if (!pendingFlowArcStrategy) return;
    await handleFlowArcUpdate(pendingFlowArcStrategy);
    setPendingFlowArcStrategy(null);
  }

  const flowArcStrategy = pendingFlowArcStrategy ?? displayPlaylist.strategy;

  // Helper function to handle playback failure after all retry attempts
  const handlePlaybackFailure = useCallback((trackFileId: string, reason: string, error?: unknown) => {
    logger.error(`[PlaylistDisplay] ${reason}:`, trackFileId, error);
    setTrackError(trackFileId, "Failed to start playback");
    setSearchingTrack(null);
  }, [setTrackError, setSearchingTrack]);

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
      const attemptPlay = async (attempts = 0) => {
        if (attempts >= MAX_PLAY_ATTEMPTS) {
          handlePlaybackFailure(trackFileId, "Failed to play track after maximum retry attempts");
          return;
        }
        const audioControls = audioRefs.current.get(trackFileId);
        if (audioControls) {
          try {
            await audioControls.play();
            return;
          } catch (err) {
            if (attempts < MAX_PLAY_ATTEMPTS - 1) {
              setTimeout(() => attemptPlay(attempts + 1), 100);
            } else {
              handlePlaybackFailure(trackFileId, "Failed to play track after maximum retry attempts", err);
            }
          }
        } else if (attempts < MAX_PLAY_ATTEMPTS - 1) {
          setTimeout(() => attemptPlay(attempts + 1), 100);
        } else {
          handlePlaybackFailure(trackFileId, "Audio controls not found after maximum retry attempts");
        }
      };
      setTimeout(() => attemptPlay(), 100);
      return;
    }

    // Search for preview - show loading immediately
    setSearchingTrack(trackFileId);
    try {
      const sampleResult = await searchTrackSample(trackInfo);
      if (sampleResult) {
        // Set sample result - keep loading until stream loads and audio plays (onPlay fires)
        setSampleResult(trackFileId, sampleResult);
        
        const attemptPlay = async (attempts = 0) => {
          if (attempts >= MAX_PLAY_ATTEMPTS) {
            handlePlaybackFailure(trackFileId, "Failed to play track after maximum retry attempts");
            return;
          }
          const audioControls = audioRefs.current.get(trackFileId);
          if (audioControls) {
            try {
              await audioControls.play();
              return;
            } catch (err) {
              if (attempts < MAX_PLAY_ATTEMPTS - 1) {
                setTimeout(() => attemptPlay(attempts + 1), 100);
              } else {
                handlePlaybackFailure(trackFileId, "Failed to play track after maximum retry attempts", err);
              }
            }
          } else if (attempts < MAX_PLAY_ATTEMPTS - 1) {
            setTimeout(() => attemptPlay(attempts + 1), 100);
          } else {
            handlePlaybackFailure(trackFileId, "Audio controls not found after maximum retry attempts");
          }
        };
        
        setTimeout(() => attemptPlay(), 50);
      } else {
        setTrackError(trackFileId, "Preview not available for this track");
        setSearchingTrack(null);
      }
    } catch (error) {
      logger.error("[PlaylistDisplay] Failed to search for preview:", error);
      setTrackError(trackFileId, "Failed to find preview for this track");
      setSearchingTrack(null);
    }
  }, [playingTrackId, hasSampleResult, setSampleResult, setTrackError, clearPlayingTrack, setSearchingTrack, handlePlaybackFailure]);

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
        logger.debug("[PlaylistDisplay] Prefetch failed:", error);
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

  // Cleanup when playlist changes
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
  }, [playlist.id, clearAllAudioState]);

  const handleRemoveTrack = useCallback(async (trackFileId: string) => {
    if (isEditMode) {
      updatePlaylist((prev) => {
        const updatedTrackFileIds = prev.trackFileIds.filter((id) => id !== trackFileId);
        const updatedOrderedTracks = prev.orderedTracks?.filter(
          (track) => track.trackFileId !== trackFileId
        );
        const updatedSelections = prev.trackSelections?.filter(
          (track) => track.trackFileId !== trackFileId
        );
        const updatedDiscoveryTracks = prev.discoveryTracks?.filter(
          (dt) => `discovery:${dt.discoveryTrack.mbid}` !== trackFileId
        );
        return {
          ...prev,
          trackFileIds: updatedTrackFileIds,
          orderedTracks: updatedOrderedTracks,
          trackSelections: updatedSelections,
          discoveryTracks: updatedDiscoveryTracks,
        };
      });
      return;
    }

    setIsRegenerating(true);
    try {
      // Load original request from sessionStorage
      const stored = sessionStorage.getItem("playlist-request");
      if (!stored) {
        logger.error("No playlist request found");
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

      // Discovery tracks: just remove, no replacement (replacements come from library)
      const isDiscoveryTrack = trackFileId.startsWith("discovery:");

      if (neededCount > 0 && !isDiscoveryTrack) {
        const removedIndex = playlist.trackFileIds.indexOf(trackFileId);

        // Build context: remaining library tracks (for diversity/scoring)
        const contextSelections = (playlist.trackSelections ?? []).filter(
          (s) =>
            s.trackFileId !== trackFileId &&
            remainingTrackIds.includes(s.trackFileId) &&
            !s.trackFileId.startsWith("discovery:")
        );

        const replacements = await generateReplacementTracksFromStrategy(
          request,
          strategy,
          root?.id,
          1,
          contextSelections,
          removedTracks,
          stableMode ? playlist.id : undefined
        );

        if (replacements.length > 0) {
          const newSelection = replacements[0];
          const finalTrackIds = [
            ...remainingTrackIds.slice(0, removedIndex),
            newSelection.trackFileId,
            ...remainingTrackIds.slice(removedIndex),
          ];

          const removedOrderedTrack = playlist.orderedTracks?.find(
            (o) => o.trackFileId === trackFileId
          );

          const libraryTrackIds = finalTrackIds.filter(
            (id) => !id.startsWith("discovery:")
          );
          const updatedOrderedTracks = libraryTrackIds.map((id, idx) => {
            if (id === newSelection.trackFileId) {
              return {
                trackFileId: id,
                position: idx,
                section: removedOrderedTrack?.section ?? "transition",
                reasons: newSelection.reasons,
                transitionScore: 0.8,
              };
            }
            const existing = playlist.orderedTracks?.find(
              (o) => o.trackFileId === id
            );
            return existing ? { ...existing, position: idx } : null;
          }).filter((o): o is NonNullable<typeof o> => o !== null);

          const selectionMap = new Map(
            (playlist.trackSelections ?? [])
              .filter((s) => s.trackFileId !== trackFileId)
              .map((s) => [s.trackFileId, s] as const)
          );
          selectionMap.set(newSelection.trackFileId, newSelection);
          const updatedTrackSelections = libraryTrackIds
            .map((id) => selectionMap.get(id))
            .filter((s): s is TrackSelection => !!s);

          const discoveryMap = new Map<
            string,
            NonNullable<GeneratedPlaylist["discoveryTracks"]>[number]
          >();
          if (playlist.discoveryTracks) {
            for (const dt of playlist.discoveryTracks) {
              discoveryMap.set(`discovery:${dt.discoveryTrack.mbid}`, dt);
            }
          }

          const summaryInputs: SummaryTrackInput[] = [];
          for (const id of finalTrackIds) {
            if (id.startsWith("discovery:")) {
              const discovery = discoveryMap.get(id);
              if (discovery) {
                summaryInputs.push({
                  trackFileId: id,
                  genres: discovery.discoveryTrack.genres || [],
                  artist: discovery.discoveryTrack.artist,
                  durationSeconds: discovery.discoveryTrack.duration,
                });
              }
              continue;
            }
            const track =
              id === newSelection.trackFileId
                ? newSelection.track
                : tracks.get(id);
            if (track) {
              summaryInputs.push({
                trackFileId: id,
                genres: track.tags.genres || [],
                artist: track.tags.artist,
                durationSeconds: track.tech?.durationSeconds,
                bpm: track.tech?.bpm,
              });
            }
          }

          const summary = calculatePlaylistSummaryFromTracks(summaryInputs);

          const updatedPlaylist: GeneratedPlaylist = {
            ...playlist,
            trackFileIds: finalTrackIds,
            trackSelections: updatedTrackSelections,
            orderedTracks: updatedOrderedTracks,
            summary,
            totalDuration: summary.totalDuration,
          };

          setTracks((prev) => {
            const next = new Map(prev);
            next.set(newSelection.trackFileId, newSelection.track);
            return next;
          });
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
          // No candidates: just remove the track
          const updatedTrackSelectionsNoCandidates = (
            playlist.trackSelections ?? []
          ).filter((s) => s.trackFileId !== trackFileId);
          const updatedOrderedTracksNoCandidates = (
            playlist.orderedTracks ?? []
          ).filter((o) => o.trackFileId !== trackFileId);

          const discoveryMapNoCandidates = new Map<
            string,
            NonNullable<GeneratedPlaylist["discoveryTracks"]>[number]
          >();
          if (playlist.discoveryTracks) {
            for (const dt of playlist.discoveryTracks) {
              discoveryMapNoCandidates.set(
                `discovery:${dt.discoveryTrack.mbid}`,
                dt
              );
            }
          }
          const summaryInputsNoCandidates: SummaryTrackInput[] = [];
          for (const id of remainingTrackIds) {
            if (id.startsWith("discovery:")) {
              const discovery = discoveryMapNoCandidates.get(id);
              if (discovery) {
                summaryInputsNoCandidates.push({
                  trackFileId: id,
                  genres: discovery.discoveryTrack.genres || [],
                  artist: discovery.discoveryTrack.artist,
                  durationSeconds: discovery.discoveryTrack.duration,
                });
              }
              continue;
            }
            const track = tracks.get(id);
            if (track) {
              summaryInputsNoCandidates.push({
                trackFileId: id,
                genres: track.tags.genres || [],
                artist: track.tags.artist,
                durationSeconds: track.tech?.durationSeconds,
                bpm: track.tech?.bpm,
              });
            }
          }
          const summaryNoCandidates =
            calculatePlaylistSummaryFromTracks(summaryInputsNoCandidates);

          const updatedPlaylistNoCandidates = {
            ...playlist,
            trackFileIds: remainingTrackIds,
            trackSelections: updatedTrackSelectionsNoCandidates,
            orderedTracks: updatedOrderedTracksNoCandidates,
            summary: summaryNoCandidates,
            totalDuration: summaryNoCandidates.totalDuration,
          };
          setPlaylist(updatedPlaylistNoCandidates);
          sessionStorage.setItem(
            "generated-playlist",
            JSON.stringify({
              ...updatedPlaylistNoCandidates,
              summary: {
                ...updatedPlaylistNoCandidates.summary,
                genreMix: Object.fromEntries(
                  updatedPlaylistNoCandidates.summary.genreMix
                ),
                tempoMix: Object.fromEntries(
                  updatedPlaylistNoCandidates.summary.tempoMix
                ),
                artistMix: Object.fromEntries(
                  updatedPlaylistNoCandidates.summary.artistMix
                ),
              },
            })
          );
        }
      } else {
        // Just remove the track (neededCount === 0, discovery track, or no candidates)
        const updatedTrackSelections = (playlist.trackSelections ?? []).filter(
          (s) => s.trackFileId !== trackFileId
        );
        const updatedOrderedTracks = (playlist.orderedTracks ?? []).filter(
          (o) => o.trackFileId !== trackFileId
        );

        const discoveryMapForRemove = new Map<
          string,
          NonNullable<GeneratedPlaylist["discoveryTracks"]>[number]
        >();
        if (playlist.discoveryTracks) {
          for (const dt of playlist.discoveryTracks) {
            discoveryMapForRemove.set(
              `discovery:${dt.discoveryTrack.mbid}`,
              dt
            );
          }
        }
        const summaryInputsRemove: SummaryTrackInput[] = [];
        for (const id of remainingTrackIds) {
          if (id.startsWith("discovery:")) {
            const discovery = discoveryMapForRemove.get(id);
            if (discovery) {
              summaryInputsRemove.push({
                trackFileId: id,
                genres: discovery.discoveryTrack.genres || [],
                artist: discovery.discoveryTrack.artist,
                durationSeconds: discovery.discoveryTrack.duration,
              });
            }
            continue;
          }
          const track = tracks.get(id);
          if (track) {
            summaryInputsRemove.push({
              trackFileId: id,
              genres: track.tags.genres || [],
              artist: track.tags.artist,
              durationSeconds: track.tech?.durationSeconds,
              bpm: track.tech?.bpm,
            });
          }
        }
        const summaryRemove =
          calculatePlaylistSummaryFromTracks(summaryInputsRemove);

        const updatedPlaylist = {
          ...playlist,
          trackFileIds: remainingTrackIds,
          trackSelections: updatedTrackSelections,
          orderedTracks: updatedOrderedTracks,
          summary: summaryRemove,
          totalDuration: summaryRemove.totalDuration,
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
      logger.error("Failed to remove track:", error);
    } finally {
      setIsRegenerating(false);
    }
  }, [isEditMode, playlist, stableMode, tracks, updatePlaylist]);

  useEffect(() => {
    if (!isEditMode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.key === "Escape") {
        handleToggleEditMode(false);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (isDirty) {
          setShowSaveDialog(true);
        }
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && expandedTrackId) {
        event.preventDefault();
        handleRemoveTrack(expandedTrackId);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [expandedTrackId, handleToggleEditMode, handleRemoveTrack, isDirty, isEditMode]);

  const [storedRequest, setStoredRequest] = useState<PlaylistRequest | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("playlist-request");
      if (stored) {
        setStoredRequest(JSON.parse(stored) as PlaylistRequest);
      }
    } catch {
      setStoredRequest(null);
    }
  }, []);

  // Parse request with defaults (avoid sessionStorage during render)
  const request = storedRequest ?? {
    genres: [],
    mood: [],
    activity: [],
    length: { type: "tracks" as const, value: 0 },
    tempo: {},
    surprise: 0,
  };
  
  // Ensure arrays exist
  const safeRequest = {
    ...request,
    genres: Array.isArray(request.genres) ? request.genres : [],
    mood: Array.isArray(request.mood) ? request.mood : [],
    activity: Array.isArray(request.activity) ? request.activity : [],
    length: request.length || { type: "tracks" as const, value: 0 },
  };

  const { title, subtitle, emoji } = generatePlaylistTitle(
    safeRequest,
    displayPlaylist.strategy,
    true,
    customEmoji
  );
  
  // Use custom emoji if set, otherwise use auto-selected emoji
  const displayEmoji = customEmoji !== undefined ? customEmoji : emoji;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-app-surface rounded-sm border border-app-border p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <EmojiPicker
                value={displayEmoji}
                onChange={(newEmoji) => {
                  setCustomEmoji(newEmoji);
                  setPlaylist((prev) => ({ ...prev, customEmoji: newEmoji }));
                }}
                className="text-3xl"
              />
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
                    {displayPlaylist.title || title}
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
              {displayPlaylist.description || subtitle}
            </p>
            
            {/* Validation and Explanation */}
            {(displayPlaylist.validation || displayPlaylist.explanation) && (
              <div className="mt-4 space-y-3">
                {/* Validation Score */}
                {displayPlaylist.validation && (
                  <div className="p-3 bg-app-hover rounded-sm border border-app-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-app-primary text-sm font-medium">Validation Score</span>
                      <span className={cn(
                        "text-sm font-semibold",
                        displayPlaylist.validation.score >= 0.8 ? "text-green-500" :
                        displayPlaylist.validation.score >= 0.6 ? "text-yellow-500" :
                        "text-red-500"
                      )}>
                        {(displayPlaylist.validation.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    {displayPlaylist.validation.issues.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {displayPlaylist.validation.issues.map((issue, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm text-yellow-500">
                            <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {displayPlaylist.validation.strengths.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {displayPlaylist.validation.strengths.map((strength, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm text-green-500">
                            <Check className="size-4 mt-0.5 flex-shrink-0" />
                            <span>{strength}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {displayPlaylist.validation.suggestions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {displayPlaylist.validation.suggestions.map((suggestion, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm text-app-tertiary">
                            <Sparkles className="size-4 mt-0.5 flex-shrink-0" />
                            <span>{suggestion}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Explanation */}
                {displayPlaylist.explanation && (
                  <div className="p-4 bg-app-hover rounded-sm border border-app-border">
                    <h3 className="text-app-primary text-sm font-medium uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Sparkles className="size-4 text-accent-primary" />
                      Why This Playlist Works
                    </h3>
                    <p className="text-app-secondary text-sm leading-relaxed whitespace-pre-line">
                      {displayPlaylist.explanation.explanation}
                    </p>
                    {displayPlaylist.explanation.flowDescription && (
                      <p className="text-app-tertiary text-xs mt-3 italic">
                        {displayPlaylist.explanation.flowDescription}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode && (
              <button
                onClick={() => handleToggleEditMode(true)}
                className="flex items-center gap-2 px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
              >
                <Edit2 className="size-4" />
                Edit Mode
              </button>
            )}
            {isEditMode && (
              <button
                onClick={() => handleToggleEditMode(false)}
                className="flex items-center gap-2 px-4 py-2 bg-accent-primary/10 text-accent-primary rounded-sm transition-colors text-sm border border-accent-primary/20"
              >
                <X className="size-4" />
                Exit Edit
              </button>
            )}
            {isEditMode && (
              <button
                onClick={() => setShowSaveDialog(true)}
                disabled={!isDirty || isSavingChanges}
                className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 text-sm"
              >
                {isSavingChanges ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    Save Changes
                  </>
                )}
              </button>
            )}
            {isEditMode && isDirty && (
              <span className="text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded-sm">
                Unsaved changes
              </span>
            )}
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
            {!isEditMode && isSaved && (
              <button
                onClick={() => setShowRemixDialog(true)}
                disabled={isRemixing}
                className="flex items-center gap-2 px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors disabled:opacity-50 text-sm border border-app-border"
              >
                {isRemixing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Remixing...
                  </>
                ) : (
                  <>
                    <Shuffle className="size-4" />
                    Remix
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
        {!isEditMode && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => setShowFlowArcEditor(!showFlowArcEditor)}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm disabled:opacity-50"
            >
              <GripVertical className="size-4" />
              {showFlowArcEditor ? "Hide" : "Edit"} Flow Arc
            </button>
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
            {displayPlaylist.summary.genreMix.size > 0 && (
              <button
                onClick={() => {
                  const topGenre = Array.from(displayPlaylist.summary.genreMix.entries())
                    .sort((a, b) => b[1] - a[1])[0]?.[0];
                  if (topGenre) handleVariant("more_genre", topGenre);
                }}
                disabled={isRegenerating}
                className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm disabled:opacity-50"
              >
                <Plus className="size-4" />
                More {Array.from(displayPlaylist.summary.genreMix.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]}
              </button>
            )}
          </div>
        )}
        {isEditMode && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => setShowFlowArcEditor(!showFlowArcEditor)}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm disabled:opacity-50"
            >
              <GripVertical className="size-4" />
              {showFlowArcEditor ? "Hide" : "Edit"} Flow Arc
            </button>
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
            {displayPlaylist.summary.genreMix.size > 0 && (
              <button
                onClick={() => {
                  const topGenre = Array.from(displayPlaylist.summary.genreMix.entries())
                    .sort((a, b) => b[1] - a[1])[0]?.[0];
                  if (topGenre) handleVariant("more_genre", topGenre);
                }}
                disabled={isRegenerating}
                className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm disabled:opacity-50"
              >
                <Plus className="size-4" />
                More {Array.from(displayPlaylist.summary.genreMix.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]}
              </button>
            )}
            <button
              onClick={() => setShowTrackAddDialog(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm"
            >
              <Plus className="size-4" />
              Add Track
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors text-sm disabled:opacity-50"
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
                "flex items-center gap-2 px-3 py-1.5 rounded-sm transition-colors text-sm",
                stableMode
                  ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                  : "bg-app-hover text-app-primary border border-app-border hover:bg-app-surface-hover"
              )}
              title={stableMode ? "Stable mode: same seed, similar results" : "Fresh mode: new seed, different results"}
            >
              {stableMode ? <Lock className="size-4" /> : <Unlock className="size-4" />}
              {stableMode ? "Stable" : "Fresh"}
            </button>
          </div>
        )}
        {variantError && (
          <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-500 text-sm font-medium mb-1">{variantError.title}</p>
                <p className="text-yellow-500 text-sm">{variantError.message}</p>
                {variantError.suggestions.length > 0 && (
                  <div className="mt-2 text-yellow-500 text-xs space-y-1">
                    {variantError.suggestions.map((suggestion) => (
                      <div key={suggestion}>• {suggestion}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Flow Arc Editor */}
        {showFlowArcEditor && (
          <div className="mt-4 pt-4 border-t border-app-border">
            <FlowArcEditor
              strategy={flowArcStrategy}
              durationSeconds={displayPlaylist.summary.totalDuration}
              onUpdate={handleFlowArcDraftUpdate}
              onReorder={handleFlowArcReorder}
            />
            {pendingFlowArcStrategy && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleApplyFlowArc}
                  disabled={isRegenerating}
                  className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors text-sm disabled:opacity-50"
                >
                  {isRegenerating ? "Updating..." : "Apply Flow Arc"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inline Editor */}
        {showInlineEditor && !isEditMode && (
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
        {!isEditMode && (
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
        )}
      </div>

      {/* Why This Playlist Summary */}
      {!isEditMode && <PlaylistWhySummary playlist={displayPlaylist} />}

      {/* Track List */}
      <div className="bg-app-surface rounded-sm border border-app-border overflow-hidden">
        {isEditMode ? (
          <DraggableTrackList
            items={trackItems}
            getItemId={(item, index) => `${item.trackFileId}-${index}`}
            onReorder={(items) => updateTrackFileIds(items.map((item) => item.trackFileId))}
            renderItem={(item, { rowProps, isDragging }) =>
              renderTrackRow(item, { rowProps, isDragging })
            }
          />
        ) : (
          <div className="divide-y divide-app-border">
            {trackItems.map((item) => (
              <div key={`${item.trackFileId}-${item.index}`}>
                {renderTrackRow(item)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sample Error Message */}
      {sampleError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4">
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="size-4" />
            <span>{sampleError}</span>
            <button
              onClick={() => setSampleError(null)}
              className="ml-auto p-1 hover:bg-red-500/20 rounded-sm transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sample Player */}
      {playingSample && (
        <div className="bg-app-surface rounded-sm border border-app-border p-6">
          <TrackSamplePlayer
            trackInfo={playingSample.trackInfo}
            sampleResult={playingSample.sampleResult}
            onClose={() => setPlayingSample(null)}
          />
        </div>
      )}

      <TrackAddDialog
        isOpen={showTrackAddDialog}
        libraryRootId={libraryRootId}
        llmConfig={llmConfig}
        onAddTrack={handleAddTrackToEditPlaylist}
        onClose={() => setShowTrackAddDialog(false)}
      />

      <SavePlaylistDialog
        isOpen={showSaveDialog}
        defaultTitle={editedPlaylist.title || displayPlaylist.title}
        defaultDescription={editedPlaylist.description || displayPlaylist.description}
        onClose={() => setShowSaveDialog(false)}
        onConfirm={handleSaveEdits}
        titleText={isSaved ? "Save Changes" : "Save Playlist"}
        confirmLabel={isSaved ? "Save Changes" : "Save"}
      />

      <SavePlaylistDialog
        isOpen={showRemixDialog}
        defaultTitle={`${displayPlaylist.title} (Remix)`}
        defaultDescription={displayPlaylist.description}
        onClose={() => setShowRemixDialog(false)}
        onConfirm={(options) =>
          handleRemix({ title: options.title, description: options.description })
        }
        defaultMode="remix"
        modeOptions={["remix"]}
        titleText="Remix Playlist"
        confirmLabel="Remix"
        confirmDisabled={isRemixing}
      />

      {/* Export Section */}
      {!isEditMode && (
        <div className="bg-app-surface rounded-sm border border-app-border p-6">
          <PlaylistExport 
            playlist={displayPlaylist} 
            libraryRootId={libraryRootId}
            playlistCollectionId={playlistCollectionId}
          />
        </div>
      )}
    </div>
  );
}

