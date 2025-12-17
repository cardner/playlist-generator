"use client";

import type { TrackReason } from "@/features/playlists";
import { Music, TrendingUp, Clock, Sparkles, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackReasonChipsProps {
  reasons: TrackReason[];
  compact?: boolean;
}

const REASON_ICONS = {
  genre_match: Music,
  tempo_match: TrendingUp,
  duration_fit: Clock,
  diversity: Users,
  surprise: Sparkles,
  constraint: Zap,
  ordering: TrendingUp,
};

const REASON_COLORS = {
  genre_match: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  tempo_match: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  duration_fit: "bg-green-500/10 text-green-500 border-green-500/20",
  diversity: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  surprise: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  constraint: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  ordering: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
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
    <div className="flex flex-wrap gap-1.5">
      {displayReasons.map((reason, index) => {
        const Icon = REASON_ICONS[reason.type] || Sparkles;
        const colorClass = REASON_COLORS[reason.type] || REASON_COLORS.surprise;

        return (
          <div
            key={index}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border text-xs",
              colorClass,
              compact && "text-xs px-1.5 py-0.5"
            )}
            title={reason.explanation}
          >
            <Icon className={cn("size-3", compact && "size-2.5")} />
            <span className="truncate max-w-[120px]">{reason.explanation}</span>
          </div>
        );
      })}
    </div>
  );
}

