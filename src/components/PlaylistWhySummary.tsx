"use client";

import type { GeneratedPlaylist } from "@/features/playlists";
import { Music, TrendingUp, Clock, Sparkles } from "lucide-react";

interface PlaylistWhySummaryProps {
  playlist: GeneratedPlaylist;
}

export function PlaylistWhySummary({ playlist }: PlaylistWhySummaryProps) {
  const { summary, strategy } = playlist;

  // Handle both Map and plain object (from sessionStorage deserialization)
  // JSON.stringify converts Maps to {}, so we need to handle both cases
  const genreMixMap: Map<string, number> =
    summary.genreMix instanceof Map
      ? summary.genreMix
      : new Map(Object.entries(summary.genreMix as Record<string, number> || {}));
  const tempoMixMap: Map<string, number> =
    summary.tempoMix instanceof Map
      ? summary.tempoMix
      : new Map(Object.entries(summary.tempoMix as Record<string, number> || {}));

  // Genre mix stats
  const genreEntries = Array.from(genreMixMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topGenre = genreEntries[0]?.[0] || "Various";

  // Tempo mix stats
  const tempoEntries = Array.from(tempoMixMap.entries())
    .filter(([bucket]) => bucket !== "unknown")
    .sort((a, b) => b[1] - a[1]);
  const dominantTempo = tempoEntries[0]?.[0] || "mixed";

  // Arc sections
  const sections = strategy.orderingPlan.sections;
  const hasArc = sections.length > 1;

  // Format duration
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="bg-app-surface rounded-sm border border-app-border p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="size-5 text-accent-primary" />
        <h3 className="text-app-primary font-medium uppercase tracking-wider text-sm">
          Why This Playlist?
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Genre Mix */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-app-secondary text-xs uppercase tracking-wider">
            <Music className="size-4" />
            <span>Genre Mix</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {genreEntries.map(([genre, count]) => (
              <div
                key={genre}
                className="px-3 py-1 bg-app-hover rounded-sm text-app-primary text-sm"
              >
                <span className="font-medium">{genre}</span>
                <span className="text-app-tertiary ml-2">({count})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tempo Profile */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-app-secondary text-xs uppercase tracking-wider">
            <TrendingUp className="size-4" />
            <span>Tempo Profile</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tempoEntries.map(([bucket, count]) => (
              <div
                key={bucket}
                className="px-3 py-1 bg-app-hover rounded-sm text-app-primary text-sm capitalize"
              >
                <span className="font-medium">{bucket}</span>
                <span className="text-app-tertiary ml-2">({count})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Duration Stats */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-app-secondary text-xs uppercase tracking-wider">
            <Clock className="size-4" />
            <span>Duration</span>
          </div>
          <div className="text-app-primary">
            <div className="text-lg font-medium">
              {formatDuration(summary.totalDuration)}
            </div>
            <div className="text-sm text-app-tertiary">
              {summary.trackCount} tracks • Avg {Math.round(summary.avgDuration / 60)}m
            </div>
          </div>
        </div>

        {/* Arc */}
        {hasArc && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-app-secondary text-xs uppercase tracking-wider">
              <TrendingUp className="size-4" />
              <span>Flow Arc</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {sections.map((section) => (
                <div
                  key={section.name}
                  className="px-3 py-1 bg-app-hover rounded-sm text-app-primary text-sm capitalize"
                >
                  {section.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Vibe Tags */}
      {strategy.vibeTags.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-app-border">
          <div className="text-app-secondary text-xs uppercase tracking-wider mb-2">
            Vibe Tags
          </div>
          <div className="flex flex-wrap gap-2">
            {strategy.vibeTags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-accent-primary/10 text-accent-primary rounded-sm text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

