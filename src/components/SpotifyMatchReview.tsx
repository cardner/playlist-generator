/**
 * Spotify Match Review Component
 * 
 * UI component for reviewing and accepting/rejecting matches between
 * Spotify tracks and local files. Shows match suggestions with confidence scores.
 * 
 * @module components/SpotifyMatchReview
 */

"use client";

import { useState, useCallback } from "react";
import { CheckCircle2, X, AlertCircle, Loader2, Music, Search } from "lucide-react";
import type { MatchResult } from "@/features/spotify-import/matching";
import { applyMatches } from "@/features/spotify-import/track-linking";
import type { TrackRecord } from "@/db/schema";
import { getAllTracks } from "@/db/storage";
import { db } from "@/db/schema";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface SpotifyMatchReviewProps {
  /** Array of match results to review */
  matches: MatchResult[];
  /** Spotify tracks map (trackFileId -> TrackRecord) */
  spotifyTracks: Map<string, TrackRecord>;
  /** Callback when matching is complete */
  onComplete: (linked: number, failed: number) => void;
  /** Callback to cancel */
  onCancel: () => void;
}

/**
 * Spotify match review component
 */
export function SpotifyMatchReview({
  matches,
  spotifyTracks,
  onComplete,
  onCancel,
}: SpotifyMatchReviewProps) {
  const [acceptedMatches, setAcceptedMatches] = useState<Set<number>>(new Set());
  const [rejectedMatches, setRejectedMatches] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter matches to show only those that need review
  const reviewMatches = matches.filter(
    (m, index) => m.matchType !== "none" && !acceptedMatches.has(index) && !rejectedMatches.has(index)
  );

  const handleAccept = useCallback((index: number) => {
    setAcceptedMatches((prev) => new Set(prev).add(index));
    setRejectedMatches((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const handleReject = useCallback((index: number) => {
    setRejectedMatches((prev) => new Set(prev).add(index));
    setAcceptedMatches((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const handleAcceptAll = useCallback(() => {
    const allIndices = new Set(matches.map((_, i) => i).filter((i) => matches[i].matchType !== "none"));
    setAcceptedMatches(allIndices);
    setRejectedMatches(new Set());
  }, [matches]);

  const handleApply = useCallback(async () => {
    setIsApplying(true);
    setError(null);

    try {
      // Get accepted matches
      const toApply = matches.filter((_, index) => acceptedMatches.has(index));

      // Convert spotifyTracks map to the format expected by applyMatches
      const tracksMap = new Map<string, TrackRecord>();
      for (const [trackFileId, track] of spotifyTracks.entries()) {
        tracksMap.set(trackFileId, track);
      }

      const result = await applyMatches(toApply, tracksMap);
      onComplete(result.linked, result.failed);
    } catch (err) {
      logger.error("Failed to apply matches:", err);
      setError(err instanceof Error ? err.message : "Failed to apply matches");
    } finally {
      setIsApplying(false);
    }
  }, [matches, acceptedMatches, spotifyTracks, onComplete]);

  const stats = {
    total: matches.length,
    exact: matches.filter((m) => m.matchType === "exact").length,
    fuzzy: matches.filter((m) => m.matchType === "fuzzy").length,
    none: matches.filter((m) => m.matchType === "none").length,
    accepted: acceptedMatches.size,
    rejected: rejectedMatches.size,
    pending: reviewMatches.length,
  };

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="bg-app-hover rounded-sm border border-app-border p-4">
        <h4 className="text-app-primary font-medium mb-3 text-sm">Match Statistics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-app-secondary text-xs mb-1">Total</div>
            <div className="text-app-primary font-medium">{stats.total}</div>
          </div>
          <div>
            <div className="text-app-secondary text-xs mb-1">Exact Matches</div>
            <div className="text-accent-primary font-medium">{stats.exact}</div>
          </div>
          <div>
            <div className="text-app-secondary text-xs mb-1">Fuzzy Matches</div>
            <div className="text-yellow-500 font-medium">{stats.fuzzy}</div>
          </div>
          <div>
            <div className="text-app-secondary text-xs mb-1">No Match</div>
            <div className="text-app-tertiary font-medium">{stats.none}</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-app-border grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-app-secondary text-xs mb-1">Accepted</div>
            <div className="text-green-500 font-medium">{stats.accepted}</div>
          </div>
          <div>
            <div className="text-app-secondary text-xs mb-1">Rejected</div>
            <div className="text-red-500 font-medium">{stats.rejected}</div>
          </div>
          <div>
            <div className="text-app-secondary text-xs mb-1">Pending</div>
            <div className="text-app-primary font-medium">{stats.pending}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {stats.pending > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleAcceptAll}
            className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors text-sm"
          >
            Accept All Matches
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors text-sm"
          >
            Skip Matching
          </button>
        </div>
      )}

      {/* Match List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {reviewMatches.length === 0 ? (
          <div className="text-center py-8 text-app-secondary text-sm">
            {stats.accepted > 0 ? (
              <>
                <CheckCircle2 className="size-8 text-accent-primary mx-auto mb-2" />
                <p>All matches reviewed</p>
                <p className="text-xs mt-1">Click &quot;Apply Matches&quot; to link tracks</p>
              </>
            ) : (
              <>
                <AlertCircle className="size-8 text-app-tertiary mx-auto mb-2" />
                <p>No matches to review</p>
              </>
            )}
          </div>
        ) : (
          reviewMatches.map((match, originalIndex) => {
            const index = matches.indexOf(match);
            const spotifyTrack = match.spotifyTrack;
            const localTrack = match.localTrack;
            const confidence = Math.round(match.confidence * 100);

            return (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-sm border transition-colors",
                  acceptedMatches.has(index)
                    ? "bg-green-500/10 border-green-500/20"
                    : rejectedMatches.has(index)
                    ? "bg-red-500/10 border-red-500/20"
                    : "bg-app-hover border-app-border"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Music className="size-4 text-accent-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-app-primary font-medium text-sm truncate">
                          {spotifyTrack.track}
                        </div>
                        <div className="text-app-secondary text-xs truncate">
                          {spotifyTrack.artist}
                          {spotifyTrack.album && ` • ${spotifyTrack.album}`}
                        </div>
                      </div>
                    </div>

                    {localTrack && (
                      <div className="mt-2 pl-6 border-l-2 border-app-border">
                        <div className="text-app-secondary text-xs mb-1">Suggested Match:</div>
                        <div className="text-app-primary text-sm">
                          {localTrack.tags.title} • {localTrack.tags.artist}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-sm",
                              match.matchType === "exact"
                                ? "bg-green-500/20 text-green-500"
                                : "bg-yellow-500/20 text-yellow-500"
                            )}
                          >
                            {match.matchType === "exact" ? "Exact" : "Fuzzy"} ({confidence}%)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {acceptedMatches.has(index) ? (
                      <CheckCircle2 className="size-5 text-green-500" />
                    ) : rejectedMatches.has(index) ? (
                      <X className="size-5 text-red-500" />
                    ) : (
                      <>
                        <button
                          onClick={() => handleAccept(index)}
                          className="p-1.5 hover:bg-green-500/20 text-green-500 rounded-sm transition-colors"
                          aria-label="Accept match"
                          title="Accept match"
                        >
                          <CheckCircle2 className="size-4" />
                        </button>
                        <button
                          onClick={() => handleReject(index)}
                          className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-sm transition-colors"
                          aria-label="Reject match"
                          title="Reject match"
                        >
                          <X className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Apply Button */}
      {stats.accepted > 0 && (
        <div className="flex items-center justify-between pt-4 border-t border-app-border">
          <div className="text-app-secondary text-sm">
            {stats.accepted} match{stats.accepted !== 1 ? "es" : ""} ready to apply
          </div>
          <button
            onClick={handleApply}
            disabled={isApplying}
            className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isApplying ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Apply Matches
              </>
            )}
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-3 flex items-start gap-2">
          <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-500 text-sm font-medium mb-1">Error</p>
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

