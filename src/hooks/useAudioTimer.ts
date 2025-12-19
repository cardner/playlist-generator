/**
 * Hook for managing 30-second audio preview timer
 * 
 * This hook handles the countdown timer for audio previews, ensuring they
 * automatically stop after 30 seconds. It manages timer state, calculates
 * remaining time, and provides callbacks for timer events.
 * 
 * @example
 * ```typescript
 * const { startTimer, stopTimer, pauseTimer, remainingSeconds } = useAudioTimer({
 *   duration: 30000, // 30 seconds in milliseconds
 *   onTimerEnd: () => {
 *     audio.pause();
 *     onEnded?.();
 *   }
 * });
 * 
 * // Start timer when audio starts playing
 * useEffect(() => {
 *   if (isPlaying) {
 *     startTimer();
 *   } else {
 *     pauseTimer();
 *   }
 * }, [isPlaying]);
 * ```
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Configuration for the audio timer hook
 */
export interface UseAudioTimerOptions {
  /** Duration in milliseconds (default: 30000 = 30 seconds) */
  duration?: number;
  /** Callback when timer reaches zero */
  onTimerEnd?: () => void;
  /** Callback when timer is paused */
  onPause?: () => void;
  /** Callback when timer is resumed */
  onResume?: () => void;
}

/**
 * Return value from useAudioTimer hook
 */
export interface UseAudioTimerReturn {
  /** Start the timer (or resume if paused) */
  startTimer: () => void;
  /** Pause the timer (preserves remaining time) */
  pauseTimer: () => void;
  /** Stop the timer completely (resets to full duration) */
  stopTimer: () => void;
  /** Remaining time in milliseconds */
  remainingTime: number;
  /** Remaining time in seconds (for display) */
  remainingSeconds: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
}

/**
 * Hook for managing audio preview timer
 * 
 * Manages a countdown timer that automatically stops audio playback after
 * a specified duration (default 30 seconds). The timer can be started,
 * paused, and stopped, and provides remaining time information.
 * 
 * The timer uses a 100ms interval for smooth updates and accurate timing.
 * When the timer reaches zero, it automatically calls onTimerEnd callback.
 * 
 * @param options Timer configuration options
 * @returns Timer control functions and state
 */
export function useAudioTimer(options: UseAudioTimerOptions = {}): UseAudioTimerReturn {
  const {
    duration = 30000, // 30 seconds default
    onTimerEnd,
    onPause,
    onResume,
  } = options;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedTimeRef = useRef<number | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(duration);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Calculate remaining seconds for display
  const remainingSeconds = Math.floor(remainingTime / 1000);

  /**
   * Start the timer
   * 
   * If the timer was paused, resumes from where it left off.
   * If the timer was stopped, starts fresh from the full duration.
   */
  const startTimer = useCallback(() => {
    // Don't start if already running
    if (timerRef.current) {
      return;
    }

    // If we have paused time, resume from there
    const elapsed = pausedTimeRef.current !== null 
      ? duration - pausedTimeRef.current 
      : 0;
    
    startTimeRef.current = Date.now() - elapsed;
    pausedTimeRef.current = null;
    setIsRunning(true);

    if (onResume && elapsed > 0) {
      onResume();
    }

    // Start interval timer
    timerRef.current = setInterval(() => {
      if (!startTimeRef.current) {
        return;
      }

      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, duration - elapsed);

      setRemainingTime(remaining);

      if (remaining <= 0) {
        // Timer ended
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        startTimeRef.current = null;
        pausedTimeRef.current = null;
        setIsRunning(false);
        onTimerEnd?.();
      }
    }, 100); // Update every 100ms for smooth countdown
  }, [duration, onTimerEnd, onResume]);

  /**
   * Pause the timer
   * 
   * Stops the timer but preserves the remaining time so it can be resumed.
   */
  const pauseTimer = useCallback(() => {
    if (!timerRef.current) {
      return;
    }

    // Calculate and store remaining time
    if (startTimeRef.current) {
      const elapsed = Date.now() - startTimeRef.current;
      pausedTimeRef.current = Math.max(0, duration - elapsed);
      setRemainingTime(pausedTimeRef.current);
    }

    // Clear interval
    clearInterval(timerRef.current);
    timerRef.current = null;
    startTimeRef.current = null;
    setIsRunning(false);

    onPause?.();
  }, [duration, onPause]);

  /**
   * Stop the timer completely
   * 
   * Stops the timer and resets to full duration. Use this when you want
   * to completely reset the timer (e.g., when switching tracks).
   */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    startTimeRef.current = null;
    pausedTimeRef.current = null;
    setRemainingTime(duration);
    setIsRunning(false);
  }, [duration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    startTimer,
    pauseTimer,
    stopTimer,
    remainingTime,
    remainingSeconds,
    isRunning,
  };
}

