/**
 * CollectionSyncBrowser Component
 *
 * Reusable UI for browsing a collection's tracks with Tracks | Albums | Artists tabs,
 * selection, search, and sync/export actions. Used by DeviceSyncPanel for iPod, Walkman,
 * Generic, Zune, and Jellyfin presets.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { getCompositeId } from "@/db/schema";
import { Button, Card, Input, Tabs } from "@/design-system/components";
import { InlineAudioPlayer, type InlineAudioPlayerRef } from "@/components/InlineAudioPlayer";
import { useAudioPreviewState } from "@/hooks/useAudioPreviewState";
import { searchTrackSample } from "@/features/audio-preview/platform-searcher";
import { MAX_PLAY_ATTEMPTS } from "@/lib/audio-playback-config";
import { Music, Play, Pause, Loader2 } from "lucide-react";

export type CollectionTrackWithStatus = {
  trackFileId: string;
  title: string;
  artist?: string;
  album?: string;
  addedAt?: number;
  fileName?: string;
  fileSize?: number;
  trackNo?: number;
  genre?: string;
  durationSeconds?: number;
  bpm?: number;
  onDevice?: boolean | null;
};

interface CollectionSyncBrowserProps {
  title: string;
  description?: string;
  collectionId: string;
  collections: Array<{ id: string; name: string }>;
  selectedCollectionId: string;
  onCollectionChange: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  tracks: CollectionTrackWithStatus[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  selectedTrackIds: Set<string>;
  onSelectedTrackIdsChange: (ids: Set<string>) => void;
  tab: "tracks" | "albums" | "artists";
  onTabChange: (tab: "tracks" | "albums" | "artists") => void;
  artworkUrlMap: Map<string, string>;
  onSyncSelected?: () => void;
  onMirrorCollection?: () => void;
  syncLabel?: string;
  mirrorLabel?: string;
  mirrorOptions?: React.ReactNode;
  showOnDeviceColumn?: boolean;
  onDeviceLabel?: string;
  isSyncing?: boolean;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export function CollectionSyncBrowser({
  title,
  description,
  collectionId,
  collections,
  selectedCollectionId,
  onCollectionChange,
  search,
  onSearchChange,
  tracks,
  status,
  error,
  selectedTrackIds,
  onSelectedTrackIdsChange,
  tab,
  onTabChange,
  artworkUrlMap,
  onSyncSelected,
  onMirrorCollection,
  syncLabel = "Sync selected",
  mirrorLabel = "Mirror collection",
  mirrorOptions,
  showOnDeviceColumn = false,
  onDeviceLabel = "On device",
  isSyncing = false,
  pageSize: controlledPageSize = 50,
  onPageSizeChange,
}: CollectionSyncBrowserProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(controlledPageSize);
  const tableHeaderCheckboxRef = useRef<HTMLInputElement>(null);
  const audioRefs = useRef<Map<string, InlineAudioPlayerRef>>(new Map());

  const effectivePageSize = onPageSizeChange ? controlledPageSize : pageSize;
  const setPageSize = onPageSizeChange ?? setPageSizeState;

  const audioState = useAudioPreviewState();
  const {
    playingTrackId,
    searchingTrackId,
    hasSampleResult,
    getSampleResult,
    setSampleResult,
    setPlayingTrack,
    clearPlayingTrack,
    setSearchingTrack,
    setError: setTrackError,
  } = audioState;

  const groupedTracks = useMemo(() => {
    const acc: Record<string, Record<string, CollectionTrackWithStatus[]>> = {};
    for (const track of tracks) {
      const artist = track.artist || "Unknown Artist";
      const album = track.album || "Unknown Album";
      if (!acc[artist]) acc[artist] = {};
      if (!acc[artist][album]) acc[artist][album] = [];
      acc[artist][album].push(track);
    }
    for (const artist of Object.keys(acc)) {
      for (const album of Object.keys(acc[artist])) {
        acc[artist][album].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
      }
    }
    return acc;
  }, [tracks]);

  const artistNames = useMemo(
    () => Object.keys(groupedTracks).sort((a, b) => a.localeCompare(b)),
    [groupedTracks]
  );

  const albumCount = useMemo(
    () =>
      Object.keys(groupedTracks).reduce(
        (sum, artist) => sum + Object.keys(groupedTracks[artist]).length,
        0
      ),
    [groupedTracks]
  );

  const albumList = useMemo(
    () =>
      Object.keys(groupedTracks).flatMap((artist) =>
        Object.keys(groupedTracks[artist]).map((album) => {
          const trackList = groupedTracks[artist][album];
          return {
            artist,
            album,
            trackIds: trackList.map((t) => t.trackFileId),
            trackCount: trackList.length,
          };
        })
      ),
    [groupedTracks]
  );

  const totalPages = Math.max(1, Math.ceil(tracks.length / effectivePageSize));
  const paginatedTracks = useMemo(
    () =>
      tracks.slice(
        (currentPage - 1) * effectivePageSize,
        currentPage * effectivePageSize
      ),
    [tracks, currentPage, effectivePageSize]
  );

  const allVisibleSelected =
    paginatedTracks.length > 0 &&
    paginatedTracks.every((t) => selectedTrackIds.has(t.trackFileId));
  const someVisibleSelected = paginatedTracks.some((t) =>
    selectedTrackIds.has(t.trackFileId)
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [tracks.length]);

  useEffect(() => {
    const el = tableHeaderCheckboxRef.current;
    if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  const handlePlayClick = useCallback(
    async (
      trackFileId: string,
      trackInfo: { title: string; artist?: string; album?: string }
    ) => {
      if (playingTrackId === trackFileId) {
        const audioControls = audioRefs.current.get(trackFileId);
        if (audioControls) audioControls.pause();
        clearPlayingTrack();
        return;
      }
      if (playingTrackId) {
        const prev = audioRefs.current.get(playingTrackId);
        if (prev) prev.stop();
        clearPlayingTrack();
      }
      const info = {
        title: trackInfo.title || "Unknown Title",
        artist: trackInfo.artist ?? "Unknown Artist",
        album: trackInfo.album,
      };
      const attemptPlay = async (attempts = 0) => {
        if (attempts >= MAX_PLAY_ATTEMPTS) {
          setSearchingTrack(null);
          return;
        }
        const audioControls = audioRefs.current.get(trackFileId);
        if (audioControls) {
          try {
            await audioControls.play();
            return;
          } catch {
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

      if (hasSampleResult(trackFileId)) {
        setSearchingTrack(trackFileId);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => attemptPlay());
        });
        return;
      }
      setSearchingTrack(trackFileId);
      try {
        const sampleResult = await searchTrackSample(info, {
          trackFileId,
          libraryRootId: collectionId,
        });
        if (sampleResult) {
          setSampleResult(trackFileId, sampleResult);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => attemptPlay());
          });
        } else {
          setSearchingTrack(null);
        }
      } catch {
        setSearchingTrack(null);
      }
    },
    [
      playingTrackId,
      collectionId,
      hasSampleResult,
      setSampleResult,
      clearPlayingTrack,
      setSearchingTrack,
    ]
  );

  const registerAudioRef = useCallback(
    (trackFileId: string, ref: InlineAudioPlayerRef | null) => {
      if (ref) {
        audioRefs.current.set(trackFileId, ref);
      } else {
        audioRefs.current.delete(trackFileId);
      }
    },
    []
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      setCurrentPage(1);
    },
    [setPageSize]
  );

  return (
    <div className="md:col-span-2 space-y-4">
      <div>
        <h3 className="text-app-primary text-xl font-semibold">{title}</h3>
        {description && (
          <p className="text-app-secondary text-sm mt-1">{description}</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
            Collection
          </label>
          <select
            value={selectedCollectionId}
            onChange={(e) => onCollectionChange(e.target.value)}
            className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {collections.length === 0 && (
              <option value="">No collections found</option>
            )}
          </select>
        </div>
      </div>
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search: title, artist, album, genre, BPM, mood, intensity…"
      />
      <Tabs
        value={tab}
        onValueChange={(v) => onTabChange(v as "tracks" | "albums" | "artists")}
        items={[
          { value: "tracks", label: `${tracks.length} tracks`, icon: <Music className="size-4" /> },
          { value: "albums", label: `${albumCount} albums` },
          { value: "artists", label: `${artistNames.length} artists` },
        ]}
        className="mb-2"
      />
      {status === "loading" && (
        <div className="text-xs text-app-tertiary mt-2">Loading collection tracks...</div>
      )}
      {status === "error" && (
        <div className="text-xs text-red-500 mt-2">{error}</div>
      )}
      {status === "ready" && (
        <>
          {tab === "albums" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {albumList.map(({ artist, album, trackIds, trackCount }) => {
                const allSelected = trackIds.every((id) => selectedTrackIds.has(id));
                const someSelected = trackIds.some((id) => selectedTrackIds.has(id));
                return (
                  <Card
                    key={`${artist}-${album}`}
                    padding="none"
                    className={`overflow-hidden ${
                      someSelected || allSelected
                        ? "border-accent-primary ring-1 ring-accent-primary"
                        : ""
                    }`}
                  >
                    <div className="aspect-square bg-app-hover flex items-center justify-center relative overflow-hidden">
                      {trackIds[0] &&
                      artworkUrlMap.get(getCompositeId(trackIds[0], collectionId)) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- blob URL from IndexedDB artwork cache
                        <img
                          src={
                            artworkUrlMap.get(
                              getCompositeId(trackIds[0], collectionId)
                            )!
                          }
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="size-12 text-app-tertiary" />
                      )}
                      <label className="absolute top-2 right-2 z-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => {
                            const next = new Set(selectedTrackIds);
                            if (e.target.checked) {
                              trackIds.forEach((id) => next.add(id));
                            } else {
                              trackIds.forEach((id) => next.delete(id));
                            }
                            onSelectedTrackIdsChange(next);
                          }}
                          className="rounded border-app-border"
                        />
                      </label>
                    </div>
                    <div className="p-2">
                      <div className="text-app-primary font-semibold text-sm truncate">
                        {album}
                      </div>
                      <div className="text-app-secondary text-xs truncate">{artist}</div>
                      <div className="text-app-tertiary text-xs">{trackCount} tracks</div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {tab === "artists" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {artistNames.map((artist) => {
                const albums = groupedTracks[artist];
                const albumCnt = Object.keys(albums).length;
                const trackIds = Object.values(albums)
                  .flat()
                  .map((t) => t.trackFileId);
                const trackCount = trackIds.length;
                const allSelected = trackIds.every((id) => selectedTrackIds.has(id));
                const firstAlbumKey = Object.keys(albums)[0];
                const firstTrack =
                  firstAlbumKey && albums[firstAlbumKey]?.length > 0
                    ? albums[firstAlbumKey][0].trackFileId
                    : null;
                const artistArtworkUrl =
                  firstTrack &&
                  artworkUrlMap.get(getCompositeId(firstTrack, collectionId));
                return (
                  <Card
                    key={artist}
                    padding="none"
                    className={`overflow-hidden ${
                      allSelected ? "border-accent-primary ring-1 ring-accent-primary" : ""
                    }`}
                  >
                    <div className="aspect-square bg-app-hover flex items-center justify-center relative rounded-t-sm overflow-hidden">
                      {artistArtworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- blob URL from IndexedDB artwork cache
                        <img
                          src={artistArtworkUrl}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="size-16 rounded-full bg-app-surface flex items-center justify-center text-app-primary font-semibold text-lg">
                          {artist.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <label className="absolute top-2 right-2 z-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => {
                            const next = new Set(selectedTrackIds);
                            if (e.target.checked) {
                              trackIds.forEach((id) => next.add(id));
                            } else {
                              trackIds.forEach((id) => next.delete(id));
                            }
                            onSelectedTrackIdsChange(next);
                          }}
                          className="rounded border-app-border"
                        />
                      </label>
                    </div>
                    <div className="p-2">
                      <div className="text-app-primary font-semibold text-sm truncate">
                        {artist}
                      </div>
                      <div className="text-app-tertiary text-xs">
                        {albumCnt} albums • {trackCount} tracks
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {tab === "tracks" && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-app-tertiary">
                <span>
                  {tracks.length > effectivePageSize
                    ? `${(currentPage - 1) * effectivePageSize + 1}–${Math.min(
                        currentPage * effectivePageSize,
                        tracks.length
                      )} of ${tracks.length}`
                    : `${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
                </span>
                <span>Selected {selectedTrackIds.size}.</span>
              </div>
              <div className="app-table-wrap mt-2 overflow-x-auto bg-transparent border-0 shadow-none">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th className="w-10 shrink-0">
                        <input
                          type="checkbox"
                          ref={tableHeaderCheckboxRef}
                          checked={allVisibleSelected}
                          onChange={() => {
                            if (allVisibleSelected) {
                              onSelectedTrackIdsChange(new Set());
                            } else {
                              onSelectedTrackIdsChange(
                                new Set(paginatedTracks.map((t) => t.trackFileId))
                              );
                            }
                          }}
                          className="rounded border-app-border"
                          aria-label="Select visible"
                        />
                      </th>
                      <th className="w-10 shrink-0">Play</th>
                      <th className="min-w-0">Title</th>
                      <th className="min-w-0">Artist</th>
                      <th className="min-w-0">Album</th>
                      <th className="min-w-0">Genre</th>
                      <th className="w-16 shrink-0">Duration</th>
                      <th className="w-14 shrink-0">BPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTracks.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="p-4 text-app-tertiary text-center text-xs"
                        >
                          No tracks match your search.
                        </td>
                      </tr>
                    ) : (
                      paginatedTracks.map((track) => {
                        const durationStr =
                          track.durationSeconds != null
                            ? `${Math.floor(track.durationSeconds / 60)}:${String(
                                track.durationSeconds % 60
                              ).padStart(2, "0")}`
                            : "";
                        const trackInfo = {
                          title: track.title,
                          artist: track.artist ?? "Unknown Artist",
                          album: track.album,
                        };
                        return (
                          <Fragment key={track.trackFileId}>
                            <tr>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedTrackIds.has(track.trackFileId)}
                                  onChange={(e) => {
                                    const next = new Set(selectedTrackIds);
                                    if (e.target.checked) next.add(track.trackFileId);
                                    else next.delete(track.trackFileId);
                                    onSelectedTrackIdsChange(next);
                                  }}
                                  className="rounded border-app-border"
                                  aria-label={`Select ${track.title}`}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePlayClick(track.trackFileId, trackInfo)
                                  }
                                  disabled={searchingTrackId === track.trackFileId}
                                  className="flex items-center justify-center size-8 text-app-tertiary hover:text-accent-primary transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                                  aria-label={
                                    playingTrackId === track.trackFileId
                                      ? "Pause"
                                      : "Play"
                                  }
                                  title={
                                    playingTrackId === track.trackFileId
                                      ? "Pause"
                                      : "Play 30-second preview"
                                  }
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
                              <td
                                className="cell-primary app-table-td-truncate"
                                title={track.title}
                              >
                                {track.title}
                                {showOnDeviceColumn && track.onDevice === true && (
                                  <span className="ml-1 text-[10px] text-green-500 shrink-0">
                                    {onDeviceLabel}
                                  </span>
                                )}
                                {showOnDeviceColumn && track.onDevice === false && (
                                  <span className="ml-1 text-[10px] text-yellow-500 shrink-0">
                                    New
                                  </span>
                                )}
                              </td>
                              <td
                                className="cell-secondary app-table-td-truncate"
                                title={track.artist ?? undefined}
                              >
                                {track.artist ?? "—"}
                              </td>
                              <td
                                className="cell-secondary app-table-td-truncate"
                                title={track.album ?? undefined}
                              >
                                {track.album ?? "—"}
                              </td>
                              <td
                                className="cell-tertiary app-table-td-truncate"
                                title={track.genre ?? undefined}
                              >
                                {track.genre ?? "—"}
                              </td>
                              <td className="cell-tertiary tabular-nums shrink-0 w-16">
                                {durationStr || "—"}
                              </td>
                              <td className="cell-tertiary tabular-nums shrink-0 w-14">
                                {track.bpm != null ? track.bpm : "—"}
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <div className="sr-only" aria-hidden="true">
                  {paginatedTracks
                    .filter((t) => hasSampleResult(t.trackFileId))
                    .map((track) => (
                      <InlineAudioPlayer
                        key={track.trackFileId}
                        ref={(ref) => registerAudioRef(track.trackFileId, ref)}
                        trackFileId={track.trackFileId}
                        sampleResult={getSampleResult(track.trackFileId) ?? null}
                        autoPlay={
                          playingTrackId === track.trackFileId &&
                          !searchingTrackId &&
                          hasSampleResult(track.trackFileId)
                        }
                        onPlay={() => {
                          setPlayingTrack(track.trackFileId);
                          setSearchingTrack(null);
                        }}
                        onPause={() => clearPlayingTrack()}
                        onEnded={() => clearPlayingTrack()}
                        onError={() => {
                          setTrackError(track.trackFileId, "Playback failed");
                          clearPlayingTrack();
                          setSearchingTrack(null);
                        }}
                      />
                    ))}
                </div>
              </div>
              {tracks.length > effectivePageSize && (
                <div className="flex flex-col gap-2 py-3 border-t border-app-border md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 text-xs text-app-tertiary">
                    <span className="tabular-nums">
                      {`${(currentPage - 1) * effectivePageSize + 1}–${Math.min(
                        currentPage * effectivePageSize,
                        tracks.length
                      )} of ${tracks.length}`}
                    </span>
                    <label className="flex items-center gap-1">
                      <span>Per page</span>
                      <select
                        value={effectivePageSize}
                        onChange={(e) =>
                          handlePageSizeChange(Number(e.target.value))
                        }
                        className="px-1.5 py-1 text-xs bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
                        aria-label="Tracks per page"
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => (
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
                      type="button"
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
                      type="button"
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
              {(onSyncSelected || onMirrorCollection) && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {onSyncSelected && (
                    <Button
                      variant="primary"
                      onClick={onSyncSelected}
                      disabled={isSyncing || selectedTrackIds.size === 0}
                    >
                      {syncLabel}
                    </Button>
                  )}
                  {onMirrorCollection && (
                    <Button
                      variant="secondary"
                      onClick={onMirrorCollection}
                      disabled={isSyncing || tracks.length === 0}
                    >
                      {mirrorLabel}
                    </Button>
                  )}
                  {mirrorOptions && (
                    <div className="w-full mt-2 space-y-2 text-app-primary text-xs">
                      {mirrorOptions}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
