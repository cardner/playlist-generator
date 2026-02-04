/**
 * TrackReasonChips Component
 * 
 * Displays track selection reasons as visual chips with icons and color coding.
 * Used in PlaylistDisplay to show why each track was selected for the playlist.
 * 
 * Features:
 * - Color-coded reason types (genre, tempo, duration, diversity, surprise)
 * - Icon indicators for each reason type
 * - Score-based sorting (highest scores first)
 * - Compact mode for space-constrained layouts
 * - Tooltip support for full explanations
 * 
 * Reason Types:
 * - **genre_match**: Genre matching (blue)
 * - **tempo_match**: Tempo matching (purple)
 * - **duration_fit**: Duration fit (green)
 * - **diversity**: Artist/genre diversity (orange)
 * - **surprise**: Unexpected/variety tracks (pink)
 * - **constraint**: Constraint satisfaction (yellow)
 * - **ordering**: Flow arc ordering (indigo)
 * 
 * Props:
 * - `reasons`: Array of track selection reasons
 * - `compact`: Whether to show compact version (fewer chips)
 * 
 * @module components/TrackReasonChips
 * 
 * @example
 * ```tsx
 * <TrackReasonChips
 *   reasons={track.reasons}
 *   compact={false}
 * />
 * ```
 */

"use client";

import type { TrackReason } from "@/features/playlists";
import { Music, TrendingUp, Clock, Sparkles, Users, Zap, Heart, Activity, Link } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackReasonChipsProps {
  reasons: TrackReason[];
  compact?: boolean;
}

const REASON_ICONS = {
  genre_match: Music,
  tempo_match: TrendingUp,
  mood_match: Heart,
  activity_match: Activity,
  duration_fit: Clock,
  diversity: Users,
  surprise: Sparkles,
  constraint: Zap,
  ordering: TrendingUp,
  affinity: Link,
};

const REASON_COLORS = {
  genre_match: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  tempo_match: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  mood_match: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  activity_match: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  duration_fit: "bg-green-500/10 text-green-500 border-green-500/20",
  diversity: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  surprise: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  constraint: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  ordering: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  affinity: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
};

export function TrackReasonChips({
  reasons,
  compact = false,
}: TrackReasonChipsProps) {
  if (reasons.length === 0) {
    return null;
  }

  // Filter out negative reasons (penalties) unless they're important
  const positiveReasons = reasons.filter(
    (r) => r.score >= 0 || r.type === "diversity"
  );

  // Sort by score (highest first)
  const sortedReasons = [...positiveReasons].sort((a, b) => b.score - a.score);

  // Take top reasons
  const displayReasons = compact
    ? sortedReasons.slice(0, 2)
    : sortedReasons.slice(0, 4);

  return (
    <div className="flex flex-wrap gap-1.5 items-start">
      {displayReasons.map((reason, index) => {
        const Icon = REASON_ICONS[reason.type] || Sparkles;
        const colorClass = REASON_COLORS[reason.type] || REASON_COLORS.surprise;

        return (
          <div
            key={index}
            className={cn(
              "inline-flex items-start gap-1.5 px-2 py-1 rounded-sm border text-xs",
              colorClass,
              compact && "text-xs px-1.5 py-0.5"
            )}
            title={reason.explanation}
          >
            <Icon className={cn("size-3 flex-shrink-0 mt-0.5", compact && "size-2.5")} />
            <span className="break-words leading-relaxed">{reason.explanation}</span>
          </div>
        );
      })}
    </div>
  );
}

