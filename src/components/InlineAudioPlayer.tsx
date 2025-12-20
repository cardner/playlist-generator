/**
 * Inline Audio Player Component
 * 
 * A lightweight audio player component designed to be embedded inline within
 * track lists. This component manages audio playback for a single track with
 * a 30-second preview limit.
 * 
 * Features:
 * - Hidden audio element (no visible UI)
 * - Automatic 30-second timer
 * - Play/pause/stop controls via ref
 * - Auto-play support
 * - Error handling
 * 
 * This component is used in PlaylistDisplay to provide inline preview playback
 * for tracks in the playlist. The component itself is hidden - playback is
 * controlled via the play button in the track row.
 * 
 * @example
 * ```typescript
 * <InlineAudioPlayer
 *   ref={audioRef}
 *   trackFileId="track-123"
 *   sampleResult={sampleResult}
 *   autoPlay={true}
 *   onPlay={() => setPlaying(true)}
 *   onPause={() => setPlaying(false)}
 *   onEnded={() => setPlaying(false)}
 *   onError={(error) => setError(error)}
 * />
 * ```
 */

"use client";

import { useEffect, useImperativeHandle, forwardRef } from "react";
import type { SampleResult } from "@/features/audio-preview/types";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { useAudioTimer } from "@/hooks/useAudioTimer";

/**
 * Props for InlineAudioPlayer component
 */
interface InlineAudioPlayerProps {
  /** Unique identifier for this track */
  trackFileId: string;
  /** Sample result containing preview URL (null if not loaded yet) */
  sampleResult: SampleResult | null;
  /** Whether to auto-play when audio loads */
  autoPlay?: boolean;
  /** Callback when playback starts */
  onPlay?: () => void;
  /** Callback when playback pauses */
  onPause?: () => void;
  /** Callback when playback ends (30 seconds or natural end) */
  onEnded?: () => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Callback when audio is loaded and ready */
  onLoaded?: () => void;
}

/**
 * Ref interface for controlling the audio player
 * 
 * Allows parent components to control playback programmatically.
 */
export interface InlineAudioPlayerRef {
  /** Start playback */
  play: () => void;
  /** Pause playback */
  pause: () => void;
  /** Stop playback and reset to beginning */
  stop: () => void;
}

/**
 * Inline audio player component
 * 
 * Manages audio playback for a single track inline within the track list.
 * Uses hooks for audio management and timer logic to keep the component
 * simple and focused on rendering.
 * 
 * The component renders a hidden audio element and exposes control methods
 * via a ref. The parent component (e.g., PlaylistDisplay) manages when to
 * play/pause based on user interactions.
 */
export const InlineAudioPlayer = forwardRef<InlineAudioPlayerRef, InlineAudioPlayerProps>(({
  trackFileId,
  sampleResult,
  autoPlay = false,
  onPlay,
  onPause,
  onEnded,
  onError,
  onLoaded,
}, ref) => {
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
    autoPlay,
    onPlay,
    onPause,
    onError,
    onLoaded,
  });

  // Use timer hook for 30-second limit
  const { startTimer, pauseTimer, stopTimer } = useAudioTimer({
    duration: 30000, // 30 seconds
    onTimerEnd: () => {
      stopAudio();
      onEnded?.();
    },
    onPause: () => {
      // Timer paused (audio paused)
    },
    onResume: () => {
      // Timer resumed (audio resumed)
    },
  });

  // Sync timer with audio playback state
  useEffect(() => {
    if (isPlaying) {
      startTimer();
    } else {
      pauseTimer();
    }
  }, [isPlaying, startTimer, pauseTimer]);

  // Expose play/pause/stop methods via ref
  useImperativeHandle(ref, () => ({
    play: async () => {
      try {
        await playAudio();
      } catch (err) {
        // Error already handled by useAudioPreview hook
      }
    },
    pause: () => {
      pauseAudio();
    },
    stop: () => {
      stopTimer();
      stopAudio();
    },
  }), [playAudio, pauseAudio, stopAudio, stopTimer]);

  // Don't render if no valid sample result
  if (!sampleResult || !sampleResult.url || !sampleResult.url.startsWith('http')) {
    return null;
  }

  // Render hidden audio element
  // Note: key uses only trackFileId to maintain stable component identity
  // URL changes are handled by useAudioPreview hook updating the src attribute
  return (
    <audio
      ref={audioRef}
      src={sampleResult.url}
      preload="auto"
      style={{ display: 'none' }}
      key={trackFileId}
    />
  );
});

InlineAudioPlayer.displayName = 'InlineAudioPlayer';
