/**
 * Hook for managing audio element playback
 * 
 * This hook encapsulates all the logic for managing an HTML audio element,
 * including URL validation, play/pause/stop controls, loading states,
 * error handling, and auto-play functionality.
 * 
 * This hook is designed to be reusable across different audio player components
 * (InlineAudioPlayer, TrackSamplePlayer) to reduce code duplication.
 * 
 * @example
 * ```typescript
 * const {
 *   audioRef,
 *   isLoading,
 *   error,
 *   play,
 *   pause,
 *   stop,
 * } = useAudioPreview({
 *   url: sampleResult.url,
 *   autoPlay: true,
 *   onPlay: () => setIsPlaying(true),
 *   onPause: () => setIsPlaying(false),
 *   onError: (error) => setError(error),
 * });
 * 
 * return <audio ref={audioRef} src={url} />;
 * ```
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SampleResult } from '@/features/audio-preview/types';
import { isValidPreviewUrl, resetAudioElement } from '@/features/audio-preview/utils';
import { handleAudioPreviewError } from '@/features/audio-preview/errors';
import { logger } from '@/lib/logger';

/**
 * Configuration options for useAudioPreview hook
 */
export interface UseAudioPreviewOptions {
  /** Sample result containing the preview URL */
  sampleResult: SampleResult | null;
  /** Whether to auto-play when URL is loaded */
  autoPlay?: boolean;
  /** Callback when audio starts playing */
  onPlay?: () => void;
  /** Callback when audio is paused */
  onPause?: () => void;
  /** Callback when audio ends */
  onEnded?: () => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Callback when audio is loaded and ready */
  onLoaded?: () => void;
}

/**
 * Return value from useAudioPreview hook
 */
export interface UseAudioPreviewReturn {
  /** Ref to attach to the audio element */
  audioRef: React.RefObject<HTMLAudioElement>;
  /** Whether the audio is currently loading */
  isLoading: boolean;
  /** Error message if an error occurred */
  error: string | null;
  /** Play the audio */
  play: () => Promise<void>;
  /** Pause the audio */
  pause: () => void;
  /** Stop the audio (pause and reset to beginning) */
  stop: () => void;
  /** Whether the audio is currently playing */
  isPlaying: boolean;
}

/**
 * Hook for managing audio element playback
 * 
 * Provides a complete interface for managing HTML audio element playback,
 * including state management, error handling, and control functions.
 * 
 * The hook handles:
 * - URL validation
 * - Audio element lifecycle
 * - Loading and error states
 * - Play/pause/stop controls
 * - Auto-play functionality
 * - Event listener management
 * 
 * @param options Configuration options
 * @returns Audio control functions and state
 */
export function useAudioPreview(options: UseAudioPreviewOptions): UseAudioPreviewReturn {
  const {
    sampleResult,
    autoPlay = false,
    onPlay,
    onPause,
    onEnded,
    onError,
    onLoaded,
  } = options;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const previousUrlRef = useRef<string | null>(null);

  // Use refs for callbacks to avoid re-creating event listeners on every render
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  const onLoadedRef = useRef(onLoaded);

  // Keep refs in sync with props
  useEffect(() => {
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onEndedRef.current = onEnded;
    onErrorRef.current = onError;
    onLoadedRef.current = onLoaded;
  }, [onPlay, onPause, onEnded, onError, onLoaded]);

  /**
   * Validate URL and setup audio element
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !sampleResult) {
      return;
    }

    // Validate URL
    if (!isValidPreviewUrl(sampleResult.url)) {
      const errorMessage = handleAudioPreviewError(
        new Error('Invalid preview URL'),
        'validating URL'
      );
      setError(errorMessage);
      setIsLoading(false);
      onErrorRef.current?.(errorMessage);
      return;
    }

    // Only reset audio if the URL has changed
    const urlChanged = previousUrlRef.current !== sampleResult.url;

    if (urlChanged) {
      // Reset state
      setError(null);
      setIsLoading(true);
      setIsPlaying(false);

      // Set audio source
      audio.src = sampleResult.url;
      previousUrlRef.current = sampleResult.url;

      // Reset audio element
      resetAudioElement(audio);
    }

    // Setup event listeners
    // Use refs for callbacks to avoid recreating listeners when callbacks change
    const handleLoadedData = () => {
      setIsLoading(false);
      onLoadedRef.current?.();

      // Auto-play if requested
      if (autoPlay && urlChanged) {
        audio.play().catch((err) => {
          const errorMessage = handleAudioPreviewError(err, 'auto-playing');
          setError(errorMessage);
          setIsLoading(false);
          onErrorRef.current?.(errorMessage);
        });
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayRef.current?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPauseRef.current?.();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      resetAudioElement(audio);
      onEndedRef.current?.();
    };

    const handleError = (e: Event) => {
      const audioEl = e.currentTarget as HTMLAudioElement;
      const errorMessage = handleAudioPreviewError(
        {
          error: audioEl.error,
          networkState: audioEl.networkState,
          readyState: audioEl.readyState,
          src: audioEl.src,
        },
        'loading audio'
      );
      setError(errorMessage);
      setIsLoading(false);
      setIsPlaying(false);
      onErrorRef.current?.(errorMessage);
    };

    // Add event listeners
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Cleanup
    return () => {
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [sampleResult, autoPlay]); // Removed callback dependencies - using refs instead

  /**
   * Play the audio
   */
  const play = useCallback(async (): Promise<void> => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      await audio.play();
    } catch (err) {
      const errorMessage = handleAudioPreviewError(err, 'playing audio');
      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
      throw err;
    }
  }, []); // No dependencies - using ref for callback

  /**
   * Pause the audio
   */
  const pause = useCallback((): void => {
    audioRef.current?.pause();
  }, []);

  /**
   * Stop the audio (pause and reset)
   */
  const stop = useCallback((): void => {
    if (audioRef.current) {
      resetAudioElement(audioRef.current);
    }
    setIsPlaying(false);
  }, []);

  return {
    audioRef,
    isLoading,
    error,
    play,
    pause,
    stop,
    isPlaying,
  };
}

