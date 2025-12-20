/**
 * DiscoveryTrackBadge Component
 * 
 * Visual badge component that indicates a track is a discovery track (not in
 * the user's library). Used in PlaylistDisplay to mark discovery tracks that
 * were suggested by MusicBrainz.
 * 
 * Features:
 * - Sparkles icon for visual distinction
 * - "New" label
 * - Optional tooltip with explanation
 * - Accent color styling
 * 
 * Props:
 * - `className`: Optional CSS classes
 * - `showTooltip`: Whether to show tooltip on hover
 * - `explanation`: Optional explanation text for tooltip
 * 
 * @module components/DiscoveryTrackBadge
 * 
 * @example
 * ```tsx
 * <DiscoveryTrackBadge
 *   showTooltip={true}
 *   explanation="Suggested because it's similar to 'Bohemian Rhapsody'"
 * />
 * ```
 */

"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscoveryTrackBadgeProps {
  className?: string;
  showTooltip?: boolean;
  explanation?: string;
}

export function DiscoveryTrackBadge({
  className,
  showTooltip = false,
  explanation,
}: DiscoveryTrackBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 bg-accent-primary/10 text-accent-primary rounded-sm text-xs font-medium border border-accent-primary/20",
        className
      )}
      title={showTooltip && explanation ? explanation : "New discovery track - not in your library"}
    >
      <Sparkles className="size-3" />
      <span>New</span>
    </div>
  );
}

