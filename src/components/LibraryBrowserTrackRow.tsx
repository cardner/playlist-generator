/**
 * Memoized track row for LibraryBrowser.
 * Renders a single track with play button, metadata, edit, and optional inline audio player.
 */

"use client";

import { memo, Fragment } from "react";
import { Edit2, Play, Pause, Loader2, Clock, AlertTriangle, Check } from "lucide-react";
import type { TrackRecord, TrackWritebackRecord } from "@/db/schema";
import type { SampleResult } from "@/features/audio-preview/types";
import { TrackMetadataEditor } from "./TrackMetadataEditor";
import { InlineAudioPlayer, type InlineAudioPlayerRef } from "./InlineAudioPlayer";

export interface LibraryBrowserTrackRowProps {
  track: TrackRecord;
  isEditing: boolean;
  genres: string[];
  writebackStatus: TrackWritebackRecord | undefined;
  writebackState: "pending" | "error" | "synced" | null;
  playingTrackId: string | null;
  searchingTrackId: string | null;
  hasSampleResult: (trackFileId: string) => boolean;
  getSampleResult: (trackFileId: string) => SampleResult | null | undefined;
  onPlayClick: (trackFileId: string, trackInfo: { title: string; artist: string; album?: string }) => void;
  onMouseEnter: (trackFileId: string, trackInfo: { title: string; artist: string; album?: string }) => void;
  onMouseLeave: () => void;
  onEditClick: (trackId: string) => void;
  onEditCancel: () => void;
  onSave: () => Promise<void>;
  formatDuration: (seconds?: number) => string;
  registerAudioRef: (trackFileId: string, ref: InlineAudioPlayerRef | null) => void;
  onAudioLoaded: (trackFileId: string) => void;
  setPlayingTrack: (trackFileId: string) => void;
  setSearchingTrack: (trackFileId: string | null) => void;
  setError: (trackFileId: string, error: string) => void;
  clearPlayingTrack: () => void;
}

function LibraryBrowserTrackRowInner({
  track,
  isEditing,
  genres,
  writebackStatus,
  writebackState,
  playingTrackId,
  searchingTrackId,
  hasSampleResult,
  getSampleResult,
  onPlayClick,
  onMouseEnter,
  onMouseLeave,
  onEditClick,
  onEditCancel,
  onSave,
  formatDuration,
  registerAudioRef,
  onAudioLoaded,
  setPlayingTrack,
  setSearchingTrack,
  setError,
  clearPlayingTrack,
}: LibraryBrowserTrackRowProps) {
  const trackInfo = {
    title: track.tags.title || "Unknown Title",
    artist: track.tags.artist || "Unknown Artist",
    album: track.tags.album,
  };
  const currentGenres = track.enhancedMetadata?.genres || track.tags.genres || [];
  const displayGenres = currentGenres.join(", ") || "—";

  return (
    <Fragment>
      <tr
        className="group"
        onMouseEnter={() => onMouseEnter(track.trackFileId, trackInfo)}
        onMouseLeave={onMouseLeave}
      >
        <td>
          <button
            onClick={() => onPlayClick(track.trackFileId, trackInfo)}
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
        <td className="cell-primary">{track.tags.title}</td>
        <td className="cell-primary">{track.tags.artist}</td>
        <td className="cell-secondary">{track.tags.album}</td>
        <td className="cell-secondary">{displayGenres}</td>
        <td className="cell-tertiary tabular-nums">
          {formatDuration(track.tech?.durationSeconds)}
        </td>
        <td className="cell-tertiary">
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
                  title={`Confidence: ${Math.round(track.tech.bpmConfidence * 100)}% | Thresholds: ✓ ≥ 70%, ? 50–69%, ? < 50% | Source: ${track.tech.bpmSource || "unknown"} | Method: ${track.tech.bpmMethod || "unknown"}`}
                >
                  {track.tech.bpmConfidence >= 0.7 ? "✓" : "?"}
                </span>
              )}
              {track.tech.bpmSource === "id3" && (
                <span className="text-xs text-app-tertiary" title="From ID3 tag">
                  ID3
                </span>
              )}
            </div>
          ) : (
            "—"
          )}
        </td>
        <td>
          <div className="flex items-center gap-2">
            {writebackState === "pending" && (
              <span title="Metadata sync pending">
                <Clock
                  className="size-4 text-yellow-500"
                  aria-label="Metadata sync pending"
                />
              </span>
            )}
            {writebackState === "error" && (
              <span
                title={writebackStatus?.lastWritebackError || "Metadata sync failed"}
              >
                <AlertTriangle
                  className="size-4 text-red-500"
                  aria-label="Metadata sync failed"
                />
              </span>
            )}
            {writebackState === "synced" && (
              <span title="Metadata synced to file or sidecar">
                <Check
                  className="size-4 text-green-500"
                  aria-label="Metadata synced to file or sidecar"
                />
              </span>
            )}
            <button
              onClick={() => onEditClick(track.id)}
              className="p-1.5 hover:bg-app-surface rounded-sm transition-colors text-app-secondary hover:text-accent-primary"
              aria-label="Edit metadata"
              title="Edit metadata"
            >
              <Edit2 className="size-4" />
            </button>
          </div>
        </td>
      </tr>
      {isEditing && (
        <tr key={`${track.id}-editor`}>
          <td colSpan={8} className="p-0">
            <div className="px-4 py-2">
              <TrackMetadataEditor
                track={track}
                genreSuggestions={genres}
                onSave={async () => {
                  await onSave();
                }}
                onCancel={onEditCancel}
                inline={true}
              />
            </div>
          </td>
        </tr>
      )}
      {hasSampleResult(track.trackFileId) && (
        <tr>
          <td colSpan={7} className="p-0">
            <InlineAudioPlayer
              ref={(ref) => registerAudioRef(track.trackFileId, ref)}
              trackFileId={track.trackFileId}
              sampleResult={getSampleResult(track.trackFileId) || null}
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
              onError={(error) => {
                setError(track.trackFileId, error);
                clearPlayingTrack();
                setSearchingTrack(null);
              }}
              onLoaded={() => {
                onAudioLoaded(track.trackFileId);
              }}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export const LibraryBrowserTrackRow = memo(LibraryBrowserTrackRowInner);