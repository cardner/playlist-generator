/**
 * useWakeLock Hook
 *
 * Prevents the screen from dimming or locking while a long-running operation
 * (e.g. scanning, metadata parsing) is in progress. Uses the Screen Wake Lock API.
 *
 * @param isActive - When true, requests a wake lock; when false, releases it.
 *
 * @example
 * ```tsx
 * const isProcessing = isScanning || isParsingMetadata || isDetectingTempo;
 * useWakeLock(isProcessing);
 * ```
 */

import { useEffect, useRef } from "react";

interface WakeLockSentinel {
  release: () => Promise<void>;
}

function getWakeLock(): { request: (type: "screen") => Promise<WakeLockSentinel> } | undefined {
  return "wakeLock" in navigator
    ? (navigator as { wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> } }).wakeLock
    : undefined;
}

export function useWakeLock(isActive: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const wakeLock = getWakeLock();
    if (!wakeLock) {
      return;
    }

    const requestLock = async () => {
      const wl = getWakeLock();
      if (document.visibilityState !== "visible" || !wl) {
        return;
      }
      try {
        const sentinel = await wl.request("screen");
        sentinelRef.current = sentinel;
      } catch (err) {
        // Request can fail (e.g. low battery, power save mode)
        console.debug("Wake lock request failed:", err);
      }
    };

    const releaseLock = async () => {
      if (sentinelRef.current) {
        try {
          await sentinelRef.current.release();
        } catch {
          // Ignore release errors
        }
        sentinelRef.current = null;
      }
    };

    if (isActive) {
      void requestLock();
    } else {
      void releaseLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isActive) {
        void requestLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseLock();
    };
  }, [isActive]);
}
