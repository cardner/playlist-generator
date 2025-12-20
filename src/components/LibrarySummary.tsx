/**
 * LibrarySummary Component
 * 
 * Displays a summary of the user's music library including track count, genre
 * distribution, tempo distribution, and duration statistics. Used throughout
 * the application to show library status and statistics.
 * 
 * Features:
 * - Track count display
 * - Genre distribution (top genres with counts)
 * - Tempo distribution (slow/medium/fast buckets)
 * - Duration statistics (total, average)
 * - Loading and error states
 * - Refresh trigger support
 * 
 * State Management:
 * - Loads summary data on mount and when refreshTrigger changes
 * - Checks for library existence before loading
 * - Handles loading and error states
 * 
 * Props:
 * - `className`: Optional CSS classes
 * - `libraryRootId`: Optional specific library root to summarize
 * - `refreshTrigger`: Number to trigger refresh (increment to refresh)
 * 
 * @module components/LibrarySummary
 * 
 * @example
 * ```tsx
 * <LibrarySummary
 *   libraryRootId="root-123"
 *   refreshTrigger={refreshCount}
 * />
 * ```
 */

"use client";

import { useState, useEffect } from "react";
import { getCurrentLibrarySummary } from "@/features/library/summarization";
import type { LibrarySummary } from "@/features/library/summarization";
import {
  Music,
  Clock,
  TrendingUp,
  Loader2,
  Database,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface LibrarySummaryProps {
  className?: string;
  libraryRootId?: string; // Optional: specify library root to summarize
  refreshTrigger?: number; // Optional: increment to trigger refresh
}

export function LibrarySummary({ className, libraryRootId, refreshTrigger }: LibrarySummaryProps) {
  const [summary, setSummary] = useState<LibrarySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Start as false - only load when we have a root
  const [error, setError] = useState<string | null>(null);
  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null); // null = checking, false = no library, true = has library

  // Check if we have a library root before loading
  useEffect(() => {
    async function checkLibrary() {
      try {
        const { getCurrentLibraryRoot } = await import("@/db/storage");
        const root = libraryRootId ? { id: libraryRootId } : await getCurrentLibraryRoot();
        setHasLibrary(!!root);
      } catch (err) {
        setHasLibrary(false);
      }
    }
    checkLibrary();
  }, [libraryRootId]);

  useEffect(() => {
    async function loadSummary() {
      // Wait for library check to complete
      if (hasLibrary === null) {
        return; // Still checking
      }

      // Only load if we have a library root
      if (!hasLibrary && !libraryRootId) {
        setIsLoading(false);
        setSummary(null);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        // Small delay to ensure database writes are complete after scan
        if (refreshTrigger && refreshTrigger > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Include artists for display (this is local, not sent to LLM)
        let data: LibrarySummary;
        if (libraryRootId) {
          const { summarizeLibrary } = await import("@/features/library/summarization");
          data = await summarizeLibrary(libraryRootId, true);
        } else {
          data = await getCurrentLibrarySummary(true);
        }
        
        setSummary(data);
      } catch (err) {
        logger.error("Failed to load library summary:", err);
        setError("Failed to load library summary");
      } finally {
        setIsLoading(false);
      }
    }

    loadSummary();
  }, [libraryRootId, refreshTrigger, hasLibrary]);

  // Don't show anything if no library has been selected/scanned yet
  // Wait for library check to complete before deciding
  if (hasLibrary === null) {
    return null; // Still checking, don't show anything yet
  }

  if (!hasLibrary && !libraryRootId && !isLoading) {
    return null; // Return null to hide the component until a library is selected
  }

  if (isLoading) {
    return (
      <div className={cn("bg-app-surface rounded-sm shadow-2xl p-8", className)}>
        <div className="flex items-center justify-center gap-3 text-app-secondary">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading library summary...</span>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className={cn("bg-app-surface rounded-sm shadow-2xl p-8", className)}>
        <div className="flex items-center gap-3 text-red-500">
          <AlertCircle className="size-5" />
          <span>{error || "No library data available"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-app-surface rounded-sm shadow-2xl p-8", className)}>
      <div className="flex items-center gap-3 mb-6">
        <Database className="size-6 text-accent-primary" />
        <h2 className="text-app-primary text-xl font-semibold">
          Your Library at a Glance
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total Tracks */}
        <div className="bg-app-hover rounded-sm p-4">
          <div className="flex items-center gap-3 mb-2">
            <Music className="size-5 text-accent-primary" />
            <span className="text-app-secondary text-sm uppercase tracking-wider">
              Total Tracks
            </span>
          </div>
          <p className="text-app-primary text-2xl font-semibold">
            {summary.totalTracks.toLocaleString()}
          </p>
        </div>

        {/* Duration Stats */}
        <div className="bg-app-hover rounded-sm p-4">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="size-5 text-accent-primary" />
            <span className="text-app-secondary text-sm uppercase tracking-wider">
              Avg Duration
            </span>
          </div>
          <p className="text-app-primary text-2xl font-semibold">
            {summary.durationStats.avg > 0
              ? `${Math.round(summary.durationStats.avg / 60)}:${String(
                  Math.round(summary.durationStats.avg % 60)
                ).padStart(2, "0")}`
              : "—"}
          </p>
        </div>

        {/* Recently Added */}
        <div className="bg-app-hover rounded-sm p-4">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="size-5 text-accent-primary" />
            <span className="text-app-secondary text-sm uppercase tracking-wider">
              Last 7 Days
            </span>
          </div>
          <p className="text-app-primary text-2xl font-semibold">
            {summary.recentlyAdded.last7Days}
          </p>
        </div>
      </div>

      {/* Top Genres */}
      {summary.genreCounts.length > 0 && (
        <div className="mt-6">
          <h3 className="text-app-primary font-medium mb-3 uppercase tracking-wider text-sm">
            Top Genres
          </h3>
          <div className="flex flex-wrap gap-2">
            {summary.genreCounts.slice(0, 10).map(({ genre, count }) => (
              <span
                key={genre}
                className="inline-flex items-center gap-2 px-3 py-1 bg-app-hover text-app-primary rounded-sm border border-app-border text-sm"
              >
                <span>{genre}</span>
                <span className="text-app-tertiary">({count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top Artists (if available) */}
      {summary.artistCounts && summary.artistCounts.length > 0 && (
        <div className="mt-6">
          <h3 className="text-app-primary font-medium mb-3 uppercase tracking-wider text-sm">
            Top Artists
          </h3>
          <div className="flex flex-wrap gap-2">
            {summary.artistCounts.slice(0, 10).map(({ artist, count }) => (
              <span
                key={artist}
                className="inline-flex items-center gap-2 px-3 py-1 bg-app-hover text-app-primary rounded-sm border border-app-border text-sm"
              >
                <span>{artist}</span>
                <span className="text-app-tertiary">({count})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

