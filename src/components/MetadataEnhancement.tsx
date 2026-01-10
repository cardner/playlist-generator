/**
 * MetadataEnhancement Component
 * 
 * UI component for triggering and monitoring metadata enhancement scans.
 * Provides progress indicators, statistics, and options for enhancing
 * all tracks or selected tracks only.
 * 
 * Features:
 * - Button to trigger metadata enhancement scan
 * - Progress indicator showing current track and completion percentage
 * - Display enhancement statistics (tracks enhanced, new genres found, etc.)
 * - Option to enhance all tracks or selected tracks only
 * - Show which tracks were matched to MusicBrainz vs. not found
 * 
 * @module components/MetadataEnhancement
 */

"use client";

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useMetadataEnhancement } from "@/hooks/useMetadataEnhancement";
import { logger } from "@/lib/logger";

interface MetadataEnhancementProps {
  /** Library root ID to enhance tracks for */
  libraryRootId: string;
  /** Optional array of selected track IDs for selective enhancement */
  selectedTrackIds?: string[];
  /** Callback when enhancement completes */
  onComplete?: () => void;
}

export function MetadataEnhancement({
  libraryRootId,
  selectedTrackIds,
  onComplete,
}: MetadataEnhancementProps) {
  const {
    isEnhancing,
    progress,
    result,
    error,
    startEnhancement,
    startSelectedEnhancement,
    cancelEnhancement,
    reset,
  } = useMetadataEnhancement();

  const handleStartEnhancement = async () => {
    try {
      if (selectedTrackIds && selectedTrackIds.length > 0) {
        await startSelectedEnhancement(selectedTrackIds);
      } else {
        await startEnhancement(libraryRootId);
      }
      onComplete?.();
    } catch (err) {
      logger.error("Enhancement failed:", err);
    }
  };

  const progressPercent = progress
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  return (
    <div className="bg-app-surface rounded-sm shadow-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-accent-primary" />
          <h2 className="text-app-primary font-semibold text-lg">
            Metadata Enhancement
          </h2>
        </div>
        {!isEnhancing && result && (
          <button
            onClick={reset}
            className="text-xs text-app-secondary hover:text-app-primary uppercase tracking-wider"
          >
            Reset
          </button>
        )}
      </div>

      <p className="text-app-secondary text-sm">
        Enhance track metadata using MusicBrainz API and audio analysis.
        This will add genres, similar artists, and tempo/BPM information.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-3 flex items-start gap-2">
          <XCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-red-500 text-sm font-medium">Enhancement Failed</p>
            <p className="text-red-500/80 text-xs mt-1">{error}</p>
          </div>
        </div>
      )}

      {isEnhancing && progress && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-app-primary">
              Processing: {progress.currentTrack.tags.title} - {progress.currentTrack.tags.artist}
            </span>
            <span className="text-app-secondary">
              {progress.processed} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-app-hover rounded-full h-2 overflow-hidden">
            <div
              className="bg-accent-primary h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-app-tertiary">
            <span>{progressPercent}% complete</span>
            <button
              onClick={cancelEnhancement}
              className="text-red-500 hover:text-red-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && !isEnhancing && (
        <div className="space-y-3">
          <div className="bg-green-500/10 border border-green-500/20 rounded-sm p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="size-4 text-green-500" />
              <p className="text-green-500 text-sm font-medium">Enhancement Complete</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-app-secondary">Processed:</span>
                <span className="text-app-primary ml-2 font-medium">{result.processed}</span>
              </div>
              <div>
                <span className="text-app-secondary">Enhanced:</span>
                <span className="text-app-primary ml-2 font-medium">{result.enhanced}</span>
              </div>
              <div>
                <span className="text-app-secondary">MusicBrainz Matched:</span>
                <span className="text-app-primary ml-2 font-medium">{result.matched}</span>
              </div>
              <div>
                <span className="text-app-secondary">Tempo Detected:</span>
                <span className="text-app-primary ml-2 font-medium">{result.tempoDetected}</span>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3 pt-3 border-t border-app-border">
                <p className="text-app-secondary text-xs mb-1">
                  {result.errors.length} error(s) occurred:
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.slice(0, 5).map((err, idx) => (
                    <p key={idx} className="text-red-500/80 text-xs">
                      {err.trackId}: {err.error}
                    </p>
                  ))}
                  {result.errors.length > 5 && (
                    <p className="text-app-tertiary text-xs">
                      ... and {result.errors.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!isEnhancing && !result && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleStartEnhancement}
            className="px-4 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-primary/90 transition-colors flex items-center gap-2"
          >
            <Sparkles className="size-4" />
            {selectedTrackIds && selectedTrackIds.length > 0
              ? `Enhance Selected Tracks (${selectedTrackIds.length})`
              : "Enhance All Tracks"}
          </button>
          {selectedTrackIds && selectedTrackIds.length === 0 && (
            <p className="text-app-tertiary text-xs">
              Select tracks in the library to enhance specific tracks only
            </p>
          )}
        </div>
      )}

      {isEnhancing && (
        <div className="flex items-center gap-2 text-app-secondary text-sm">
          <Loader2 className="size-4 animate-spin" />
          <span>Enhancing metadata...</span>
        </div>
      )}

      <div className="bg-app-hover rounded-sm p-3 text-xs text-app-tertiary">
        <p className="font-medium mb-1">Note:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>MusicBrainz API rate limit: 1 request per second</li>
          <li>Enhancement may take several minutes for large libraries</li>
          <li>Tempo detection requires audio file access (may not work for all tracks)</li>
          <li>Manual edits take precedence over auto-enhanced data</li>
        </ul>
      </div>
    </div>
  );
}

