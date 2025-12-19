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
 * Plays 30-second audio previews with play/pause controls
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileRef = useRef<File | null>(null); // Keep File reference for local files
  const isYouTube = sampleResult.platform === 'youtube';

  // Initialize audio or iframe based on platform
  useEffect(() => {
    if (isYouTube) {
      // YouTube uses iframe embed
      setIsLoading(false);
    } else {
      // Spotify/Bandcamp/Local files use audio element
      // For local files, keep File reference to prevent garbage collection
      if (sampleResult.platform === 'local' && sampleResult.blobFile) {
        fileRef.current = sampleResult.blobFile;
      }

      const audio = new Audio(sampleResult.url);
      audio.preload = 'auto';
      
      audio.addEventListener('loadeddata', () => {
        setIsLoading(false);
      });

      audio.addEventListener('error', (e) => {
        console.error('Audio load error:', e);
        console.error('Audio error details:', {
          error: audio.error,
          networkState: audio.networkState,
          readyState: audio.readyState,
          src: audio.src,
          platform: sampleResult.platform,
          hasBlobFile: !!sampleResult.blobFile,
        });
        setError('Failed to load audio preview');
        setIsLoading(false);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setTimeRemaining(30);
        if (onClose) {
          setTimeout(onClose, 500);
        }
      });

      audioRef.current = audio;

      return () => {
        audio.pause();
        audio.src = '';
        // Don't revoke blob URL here - let it be cleaned up when component unmounts
        // The File reference in fileRef will keep the blob URL valid
      };
    }
  }, [sampleResult.url, isYouTube, onClose, sampleResult.platform, sampleResult.blobFile]);

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
    if (isYouTube && iframeRef.current) {
      // YouTube iframe - autoplay is handled by URL parameter
      setIsPlaying(true);
    } else if (audioRef.current) {
      audioRef.current.play().catch((err) => {
        console.error('Play failed:', err);
        setError('Failed to play audio preview');
      });
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    if (isYouTube && iframeRef.current) {
      // YouTube iframe - would need YouTube API to pause
      // For now, just mark as paused
      setIsPlaying(false);
    } else if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (sampleResult.platform === 'local' && sampleResult.url.startsWith('blob:')) {
        // Revoke blob URL on unmount
        URL.revokeObjectURL(sampleResult.url);
        fileRef.current = null;
      }
    };
  }, [sampleResult.platform, sampleResult.url]);

  const getPlatformBadge = () => {
    const badges = {
      youtube: { name: 'YouTube Music', color: 'bg-red-500/10 text-red-500' },
      spotify: { name: 'Spotify', color: 'bg-green-500/10 text-green-500' },
      bandcamp: { name: 'Bandcamp', color: 'bg-blue-500/10 text-blue-500' },
      local: { name: 'Local File', color: 'bg-purple-500/10 text-purple-500' },
    };
    const badge = badges[sampleResult.platform];
    return (
      <span className={cn("px-2 py-0.5 rounded-sm text-xs font-medium", badge.color)}>
        {badge.name}
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

      {/* YouTube iframe */}
      {isYouTube && (
        <div className="mb-3">
          <iframe
            ref={iframeRef}
            src={sampleResult.url}
            className="w-full h-48 rounded-sm"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={() => {
              setIsLoading(false);
              setIsPlaying(true);
            }}
          />
        </div>
      )}

      {/* Audio controls for non-YouTube */}
      {!isYouTube && (
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
      )}

      {/* YouTube timer display */}
      {isYouTube && isPlaying && (
        <div className="mb-3">
          <div className="text-app-secondary text-sm">
            {timeRemaining} seconds remaining
          </div>
        </div>
      )}

      {/* Hidden audio element for non-YouTube platforms */}
      {!isYouTube && <audio ref={audioRef} src={sampleResult.url} />}
    </div>
  );
}

