"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SampleResult } from "@/features/audio-preview/types";

interface TrackSamplePlayerProps {
  trackInfo: {
    title: string;
    artist: string;
    album?: string;
  };
  sampleResult: SampleResult;
  onClose?: () => void;
}

/**
 * Track sample player component
 * 
 * Plays 30-second audio previews from iTunes with play/pause controls
 */
export function TrackSamplePlayer({
  trackInfo,
  sampleResult,
  onClose,
}: TrackSamplePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Validate URL and reset state when URL changes
  useEffect(() => {
    console.log('[TrackSamplePlayer] sampleResult:', sampleResult);
    console.log('[TrackSamplePlayer] URL:', sampleResult.url);
    
    if (!sampleResult.url || !sampleResult.url.startsWith('http')) {
      console.error('[TrackSamplePlayer] Invalid preview URL:', sampleResult.url);
      setError('Invalid preview URL');
      setIsLoading(false);
      return;
    }
    // Reset state when URL changes
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    setTimeRemaining(30);
  }, [sampleResult]);

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setTimeRemaining(30);
    if (onClose) {
      setTimeout(onClose, 500);
    }
  }, [onClose]);

  // Handle 30-second limit
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleStop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, handleStop]);

  const handlePlay = () => {
    if (audioRef.current) {
      audioRef.current.play().catch((err) => {
        console.error('Play failed:', err);
        setError('Failed to play audio preview');
      });
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const getPlatformBadge = () => {
    return (
      <span className={cn("px-2 py-0.5 rounded-sm text-xs font-medium", "bg-blue-500/10 text-blue-500")}>
        Apple Music
      </span>
    );
  };

  if (error) {
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
        <div className="text-red-500 text-sm mt-2">{error}</div>
      </div>
    );
  }

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
            onClick={onClose}
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
              {timeRemaining} seconds remaining
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
          onLoadedData={() => {
            console.log('[TrackSamplePlayer] Audio loaded successfully');
            setIsLoading(false);
          }}
          onError={(e) => {
            const audio = e.currentTarget;
            console.error('[TrackSamplePlayer] Audio load error:', e);
            console.error('[TrackSamplePlayer] Audio error details:', {
              error: audio.error,
              networkState: audio.networkState,
              readyState: audio.readyState,
              src: audio.src,
              expectedUrl: sampleResult.url,
              sampleResult: sampleResult,
            });
            setError('Failed to load audio preview');
            setIsLoading(false);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setTimeRemaining(30);
            if (onClose) {
              setTimeout(onClose, 500);
            }
          }}
        />
      ) : (
        <div className="text-red-500 text-sm">No valid preview URL available</div>
      )}
    </div>
  );
}

