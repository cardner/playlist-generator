import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrackRecord } from "@/db/schema";
import type { LLMConfig } from "@/types/playlist";
import { searchTracksByCriteria, type TrackSearchType } from "@/lib/track-search-engine";
import { InlineAudioPlayer, type InlineAudioPlayerRef } from "./InlineAudioPlayer";
import { useAudioPreviewState } from "@/hooks/useAudioPreviewState";
import { searchTrackSample } from "@/features/audio-preview/platform-searcher";
import { Play, Pause, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiCriteriaTrackSearchProps {
  libraryRootId?: string;
  llmConfig?: LLMConfig;
  onSelectTrack: (track: TrackRecord) => void;
}

const SEARCH_TYPES: Array<{ value: TrackSearchType; label: string; placeholder: string }> = [
  { value: "track", label: "Track", placeholder: "Search track name..." },
  { value: "artist", label: "Artist", placeholder: "Search artist..." },
  { value: "album", label: "Album", placeholder: "Search album..." },
  { value: "genre", label: "Genre", placeholder: "Search genre..." },
  { value: "tempo", label: "Tempo", placeholder: "Search tempo (slow, medium, fast, 120)" },
  { value: "mood", label: "Mood", placeholder: "Search mood (happy, calm, energetic)" },
  { value: "activity", label: "Activity", placeholder: "Search activity (workout, study, commute)" },
];

export function MultiCriteriaTrackSearch({
  libraryRootId,
  llmConfig,
  onSelectTrack,
}: MultiCriteriaTrackSearchProps) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<TrackSearchType>("track");
  const [results, setResults] = useState<TrackRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioPreviewState = useAudioPreviewState();
  const {
    playingTrackId,
    searchingTrackId,
    getSampleResult,
    hasSampleResult,
    setSampleResult,
    setError: setTrackError,
    setPlayingTrack,
    clearPlayingTrack,
    setSearchingTrack,
  } = audioPreviewState;

  const audioRefs = useRef<Map<string, InlineAudioPlayerRef>>(new Map());
  const hoverPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchInFlightRef = useRef<Set<string>>(new Set());
  const MAX_PREFETCH_CONCURRENT = 3;

  const searchPlaceholder = useMemo(
    () => SEARCH_TYPES.find((type) => type.value === searchType)?.placeholder || "Search...",
    [searchType]
  );

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const tracks = await searchTracksByCriteria({
          query,
          type: searchType,
          limit: 25,
          libraryRootId,
          llmConfig,
        });
        setResults(tracks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [query, searchType, libraryRootId, llmConfig]);

  const handlePlayClick = async (track: TrackRecord) => {
    const trackFileId = track.trackFileId;
    if (playingTrackId === trackFileId) {
      const audioControls = audioRefs.current.get(trackFileId);
      if (audioControls) {
        audioControls.pause();
      }
      clearPlayingTrack();
      return;
    }

    if (playingTrackId) {
      const prevAudioControls = audioRefs.current.get(playingTrackId);
      if (prevAudioControls) {
        prevAudioControls.stop();
      }
      clearPlayingTrack();
    }

    if (hasSampleResult(trackFileId)) {
      setSearchingTrack(trackFileId);
      const attemptPlay = async (attempts = 0) => {
        if (attempts > 10) {
          setSearchingTrack(null);
          return;
        }
        const audioControls = audioRefs.current.get(trackFileId);
        if (audioControls) {
          try {
            await audioControls.play();
            return;
          } catch {
            if (attempts < 10) {
              setTimeout(() => attemptPlay(attempts + 1), 100);
            } else {
              setSearchingTrack(null);
            }
          }
        } else if (attempts < 10) {
          setTimeout(() => attemptPlay(attempts + 1), 100);
        } else {
          setSearchingTrack(null);
        }
      };
      setTimeout(() => attemptPlay(), 100);
      return;
    }

    setSearchingTrack(trackFileId);
    try {
      const sampleResult = await searchTrackSample({
        title: track.tags.title || "Unknown Title",
        artist: track.tags.artist || "Unknown Artist",
        album: track.tags.album,
      });
      if (sampleResult) {
        setSampleResult(trackFileId, sampleResult);
        const attemptPlay = async (attempts = 0) => {
          if (attempts > 10) {
            setSearchingTrack(null);
            return;
          }
          const audioControls = audioRefs.current.get(trackFileId);
          if (audioControls) {
            try {
              await audioControls.play();
              return;
            } catch {
              if (attempts < 10) {
                setTimeout(() => attemptPlay(attempts + 1), 100);
              } else {
                setSearchingTrack(null);
              }
            }
          } else if (attempts < 10) {
            setTimeout(() => attemptPlay(attempts + 1), 100);
          } else {
            setSearchingTrack(null);
          }
        };
        setTimeout(() => attemptPlay(), 100);
      } else {
        setTrackError(trackFileId, "Preview not available for this track");
        setSearchingTrack(null);
      }
    } catch (err) {
      setTrackError(trackFileId, "Failed to find preview for this track");
      setSearchingTrack(null);
    }
  };

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
      } catch {
        // Silently ignore prefetch failures
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <select
          value={searchType}
          onChange={(event) => setSearchType(event.target.value as TrackSearchType)}
          className="px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary text-sm"
        >
          {SEARCH_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="flex-1 px-4 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary text-sm"
        />
      </div>

      {isSearching && (
        <div className="flex items-center gap-2 text-app-secondary text-sm">
          <Loader2 className="size-4 animate-spin" />
          Searching...
        </div>
      )}

      {error && <div className="text-red-500 text-sm">{error}</div>}

      {!isSearching && results.length === 0 && query.trim() && (
        <div className="text-app-tertiary text-sm">No matches found.</div>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {results.map((track) => (
          <div
            key={track.trackFileId}
            className="flex items-start gap-3 p-3 bg-app-hover rounded-sm border border-app-border"
            onMouseEnter={() =>
              handleTrackRowMouseEnter(track.trackFileId, {
                title: track.tags.title || "Unknown Title",
                artist: track.tags.artist || "Unknown Artist",
                album: track.tags.album,
              })
            }
            onMouseLeave={handleTrackRowMouseLeave}
          >
            <button
              onClick={() => handlePlayClick(track)}
              disabled={searchingTrackId === track.trackFileId}
              className="flex items-center justify-center size-8 text-app-tertiary hover:text-accent-primary transition-colors shrink-0"
            >
              {searchingTrackId === track.trackFileId ? (
                <Loader2 className="size-4 animate-spin" />
              ) : playingTrackId === track.trackFileId ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
            </button>

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
              {track.tags.genres.length > 0 && (
                <div className="text-app-tertiary text-xs mt-1 truncate">
                  {track.tags.genres.join(", ")}
                </div>
              )}
            </div>

            <button
              onClick={() => onSelectTrack(track)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 bg-accent-primary text-white rounded-sm text-xs transition-colors",
                "hover:bg-accent-hover"
              )}
            >
              <Plus className="size-3" />
              Add
            </button>

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
              onPlay={() => {
                setPlayingTrack(track.trackFileId);
                setSearchingTrack(null);
              }}
              onPause={() => clearPlayingTrack()}
              onEnded={() => clearPlayingTrack()}
              onError={(error) => {
                setTrackError(track.trackFileId, error);
                clearPlayingTrack();
                setSearchingTrack(null);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

