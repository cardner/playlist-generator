/**
 * Spotify Collection Statistics Component
 * 
 * Displays statistics and insights for Spotify collections, including
 * import statistics, matching success rates, and suggestions.
 * 
 * @module components/SpotifyCollectionStats
 */

"use client";

import { useState, useEffect } from "react";
import { Music, Link, Unlink, TrendingUp, AlertCircle, Users } from "lucide-react";
import type { LibraryRootRecord, TrackRecord } from "@/db/schema";
import { getSpotifyTracks } from "@/features/spotify-import/track-storage";
import { db } from "@/db/schema";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface SpotifyCollectionStatsProps {
  /** Library root record for the Spotify collection */
  libraryRoot: LibraryRootRecord;
}

/**
 * Spotify collection statistics component
 */
export function SpotifyCollectionStats({ libraryRoot }: SpotifyCollectionStatsProps) {
  const [stats, setStats] = useState<{
    totalTracks: number;
    linkedTracks: number;
    unlinkedTracks: number;
    topArtists: Array<{ name: string; count: number }>;
    topGenres: Array<{ name: string; count: number }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      setIsLoading(true);
      setError(null);

      try {
        const spotifyTracks = await getSpotifyTracks(libraryRoot.id);

        // Count linked vs unlinked
        let linkedCount = 0;
        const artistCounts = new Map<string, number>();

        for (const track of spotifyTracks) {
          if (track.linkedLocalTrackId) {
            linkedCount++;
          }

          const artist = track.tags.artist;
          if (artist) {
            artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
          }
        }

        // Get top artists
        const topArtists = Array.from(artistCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        setStats({
          totalTracks: spotifyTracks.length,
          linkedTracks: linkedCount,
          unlinkedTracks: spotifyTracks.length - linkedCount,
          topArtists,
          topGenres: [], // Spotify exports don't include genres
        });
      } catch (err) {
        logger.error("Failed to load Spotify collection stats:", err);
        setError(err instanceof Error ? err.message : "Failed to load statistics");
      } finally {
        setIsLoading(false);
      }
    }

    loadStats();
  }, [libraryRoot.id]);

  if (isLoading) {
    return (
      <div className="bg-app-surface rounded-sm border border-app-border p-4">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent-primary border-t-transparent" />
          <span className="ml-3 text-app-secondary text-sm">Loading statistics...</span>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 text-sm font-medium mb-1">Error</p>
            <p className="text-red-500 text-sm">{error || "Failed to load statistics"}</p>
          </div>
        </div>
      </div>
    );
  }

  const matchRate = stats.totalTracks > 0
    ? Math.round((stats.linkedTracks / stats.totalTracks) * 100)
    : 0;

  return (
    <div className="bg-app-surface rounded-sm border border-app-border p-4 md:p-6">
      <h3 className="text-app-primary font-medium mb-4 text-sm uppercase tracking-wider">
        Collection Statistics
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Total Tracks */}
        <div className="bg-app-hover rounded-sm p-3 border border-app-border">
          <div className="flex items-center gap-2 mb-1">
            <Music className="size-4 text-accent-primary" />
            <div className="text-app-secondary text-xs uppercase tracking-wider">Total Tracks</div>
          </div>
          <div className="text-app-primary text-2xl font-semibold">{stats.totalTracks}</div>
        </div>

        {/* Linked Tracks */}
        <div className="bg-app-hover rounded-sm p-3 border border-app-border">
          <div className="flex items-center gap-2 mb-1">
            <Link className="size-4 text-green-500" />
            <div className="text-app-secondary text-xs uppercase tracking-wider">Linked</div>
          </div>
          <div className="text-green-500 text-2xl font-semibold">{stats.linkedTracks}</div>
          <div className="text-app-tertiary text-xs mt-1">{matchRate}% match rate</div>
        </div>

        {/* Unlinked Tracks */}
        <div className="bg-app-hover rounded-sm p-3 border border-app-border">
          <div className="flex items-center gap-2 mb-1">
            <Unlink className="size-4 text-yellow-500" />
            <div className="text-app-secondary text-xs uppercase tracking-wider">Unlinked</div>
          </div>
          <div className="text-yellow-500 text-2xl font-semibold">{stats.unlinkedTracks}</div>
          <div className="text-app-tertiary text-xs mt-1">
            {100 - matchRate}% need matching
          </div>
        </div>
      </div>

      {/* Top Artists */}
      {stats.topArtists.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="size-4 text-accent-primary" />
            <h4 className="text-app-primary font-medium text-sm">Top Artists</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.topArtists.slice(0, 10).map((artist) => (
              <div
                key={artist.name}
                className="px-2 py-1 bg-app-hover rounded-sm border border-app-border text-xs"
              >
                <span className="text-app-primary font-medium">{artist.name}</span>
                <span className="text-app-tertiary ml-1">({artist.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {stats.unlinkedTracks > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-sm p-3 mt-4">
          <div className="flex items-start gap-2">
            <TrendingUp className="size-4 text-yellow-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-yellow-500 text-sm font-medium mb-1">Improve Matching</p>
              <p className="text-yellow-500 text-sm">
                {stats.unlinkedTracks} track{stats.unlinkedTracks !== 1 ? "s" : ""} don&apos;t have local file matches.
                Consider scanning your local music library to enable matching.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

