/**
 * PlaylistTabs Component
 *
 * Tab navigation component for switching between playlist creation modes:
 * "From Library" (standard playlist generation) and "Discover New Music"
 * (discovery mode with MusicBrainz integration).
 *
 * Features:
 * - Two-tab interface (library/discovery)
 * - Active tab highlighting
 * - Icon indicators (Music/Sparkles)
 * - Accessible (ARIA attributes, role="tab")
 *
 * Props:
 * - `activeTab`: Currently active tab ('library' or 'discovery')
 * - `onTabChange`: Callback when tab is changed
 *
 * @module components/PlaylistTabs
 *
 * @example
 * ```tsx
 * <PlaylistTabs
 *   activeTab={mode}
 *   onTabChange={(tab) => setMode(tab)}
 * />
 * ```
 */

"use client";

import { Music, Sparkles } from "lucide-react";
import { Tabs } from "@/design-system/components";

interface PlaylistTabsProps {
  activeTab: "library" | "discovery";
  onTabChange: (tab: "library" | "discovery") => void;
}

/**
 * Tab navigation component for playlist creation modes
 *
 * Renders two tabs for switching between library-based and discovery-based
 * playlist generation modes.
 */
export function PlaylistTabs({ activeTab, onTabChange }: PlaylistTabsProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as "library" | "discovery")}
      items={[
        { value: "library", label: "From Library", icon: <Music className="size-4" /> },
        { value: "discovery", label: "Discover New Music", icon: <Sparkles className="size-4" /> },
      ]}
    />
  );
}
