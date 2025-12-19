/**
 * Track Sample Player Component
 * 
 * A standalone audio player component with visible UI for playing 30-second
 * track previews. This component displays track information, play/pause
 * controls, and a countdown timer.
 * 
 * Features:
 * - Visible UI with track info and controls
 * - Play/pause button with loading state
 * - 30-second countdown timer display
 * - Platform badge (Apple Music)
 * - Error display
 * - Close button
 * 
 * This component is used as a separate player (not inline) and can be
 * displayed in a modal or separate section. It's useful for cases where
 * you want a more prominent audio player UI.
 * 
 * @example
 * ```typescript
 * <TrackSamplePlayer
 *   trackInfo={{
 *     title: "Bohemian Rhapsody",
 *     artist: "Queen",
 *     album: "A Night at the Opera"
 *   }}
 *   sampleResult={sampleResult}
 *   onClose={() => setShowPlayer(false)}
 * />
 * ```
 */

"use client";

import { useEffect } from "react";
import { Play, Pause, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SampleResult } from "@/features/audio-preview/types";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { useAudioTimer } from "@/hooks/useAudioTimer";

/**
 * Props for TrackSamplePlayer component
 */
interface TrackSamplePlayerProps {
  /** Track information for display */
  trackInfo: {
    /** Track title */
    title: string;
    /** Artist name */
    artist: string;
    /** Optional album name */
    album?: string;
  };
  /** Sample result containing preview URL */
  sampleResult: SampleResult;
  /** Optional callback when player is closed */
  onClose?: () => void;
}

/**
 * Track sample player component
 * 
 * Plays 30-second audio previews from iTunes with a visible UI including
 * play/pause controls, track information, and a countdown timer.
 * 
 * This component uses the same hooks as InlineAudioPlayer but provides
 * a full UI experience. It's useful when you want a dedicated player
 * component rather than inline playback.
 */
export function TrackSamplePlayer({
  trackInfo,
  sampleResult,
  onClose,
}: TrackSamplePlayerProps) {
  // Use audio preview hook for audio element management
  const {
    audioRef,
    isLoading,
    error: audioError,
    play: playAudio,
    pause: pauseAudio,
    stop: stopAudio,
    isPlaying,
  } = useAudioPreview({
    sampleResult,
    autoPlay: false, // User must click play
    onPlay: () => {
      // Playback started
    },
    onPause: () => {
      // Playback paused
    },
    onEnded: () => {
      // Playback ended - close after delay
      if (onClose) {
        setTimeout(onClose, 500);
      }
    },
    onError: (error) => {
      // Error handled by hook
    },
    onLoaded: () => {
      // Audio loaded
    },
  });

  // Use timer hook for 30-second countdown
  const { remainingSeconds, startTimer, pauseTimer, stopTimer } = useAudioTimer({
    duration: 30000, // 30 seconds
    onTimerEnd: () => {
      stopAudio();
      if (onClose) {
        setTimeout(onClose, 500);
      }
    },
  });

  // Sync timer with playback state
  useEffect(() => {
    if (isPlaying) {
      startTimer();
    } else {
      pauseTimer();
    }
  }, [isPlaying, startTimer, pauseTimer]);

  // Reset timer when component mounts or sampleResult changes
  useEffect(() => {
    stopTimer();
  }, [sampleResult.url, stopTimer]);

  /**
   * Handle play button click
   */
  const handlePlay = async () => {
    try {
      await playAudio();
    } catch (err) {
      // Error already handled by useAudioPreview hook
    }
  };

  /**
   * Handle pause button click
   */
  const handlePause = () => {
    pauseAudio();
  };

  /**
   * Handle stop/close
   */
  const handleStop = () => {
    stopTimer();
    stopAudio();
    if (onClose) {
      setTimeout(onClose, 500);
    }
  };

  /**
   * Get platform badge component
   */
  const getPlatformBadge = () => {
    return (
      <span className={cn("px-2 py-0.5 rounded-sm text-xs font-medium", "bg-blue-500/10 text-blue-500")}>
        Apple Music
      </span>
    );
  };

  // Error state UI
  if (audioError) {
    return (
      <div className="p-4 bg-app-surface border border-app-border rounded-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1">
            <div className="text-app-primary font-medium">{trackInfo.title}</div>
            <div className="text-app-secondary text-sm">{trackInfo.artist}</div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-app-secondary hover:text-app-primary transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="text-red-500 text-sm mt-2">{audioError}</div>
      </div>
    );
  }

  // Main player UI
  return (
    <div className="p-4 bg-app-surface border border-app-border rounded-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-app-primary font-medium truncate">{trackInfo.title}</div>
          <div className="text-app-secondary text-sm truncate">{trackInfo.artist}</div>
          {trackInfo.album && (
            <div className="text-app-tertiary text-xs truncate mt-1">{trackInfo.album}</div>
          )}
        </div>
        {onClose && (
          <button
            onClick={handleStop}
            className="p-1 text-app-secondary hover:text-app-primary transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Platform badge */}
      <div className="mb-3">{getPlatformBadge()}</div>

      {/* Audio controls */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isLoading}
          className={cn(
            "flex items-center justify-center size-10 rounded-sm transition-colors",
            isLoading
              ? "bg-app-hover text-app-tertiary cursor-not-allowed"
              : isPlaying
              ? "bg-accent-primary text-white hover:bg-accent-hover"
              : "bg-accent-primary text-white hover:bg-accent-hover"
          )}
        >
          {isLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="size-5" />
          ) : (
            <Play className="size-5" />
          )}
        </button>
        <div className="flex-1">
          {isLoading && (
            <div className="text-app-tertiary text-sm">Loading preview...</div>
          )}
          {!isLoading && isPlaying && (
            <div className="text-app-secondary text-sm">
              {remainingSeconds} seconds remaining
            </div>
          )}
          {!isLoading && !isPlaying && (
            <div className="text-app-tertiary text-sm">Click play to preview</div>
          )}
        </div>
      </div>

      {/* Hidden audio element */}
      {sampleResult.url && sampleResult.url.startsWith('http') ? (
        <audio 
          ref={audioRef} 
          src={sampleResult.url} 
          preload="auto"
        />
      ) : (
        <div className="text-red-500 text-sm">No valid preview URL available</div>
      )}
    </div>
  );
}
