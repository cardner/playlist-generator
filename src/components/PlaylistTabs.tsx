"use client";

import { Music, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaylistTabsProps {
  activeTab: 'library' | 'discovery';
  onTabChange: (tab: 'library' | 'discovery') => void;
}

/**
 * Tab navigation component for playlist creation modes
 */
export function PlaylistTabs({ activeTab, onTabChange }: PlaylistTabsProps) {
  return (
    <div className="flex gap-2 border-b border-app-border mb-6">
      <button
        onClick={() => onTabChange('library')}
        className={cn(
          "px-4 py-2 flex items-center gap-2 transition-colors relative",
          activeTab === 'library'
            ? "text-accent-primary"
            : "text-app-secondary hover:text-app-primary"
        )}
        aria-selected={activeTab === 'library'}
        role="tab"
      >
        <Music className="size-4" />
        <span className="font-medium">From Library</span>
        {activeTab === 'library' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
        )}
      </button>
      <button
        onClick={() => onTabChange('discovery')}
        className={cn(
          "px-4 py-2 flex items-center gap-2 transition-colors relative",
          activeTab === 'discovery'
            ? "text-accent-primary"
            : "text-app-secondary hover:text-app-primary"
        )}
        aria-selected={activeTab === 'discovery'}
        role="tab"
      >
        <Sparkles className="size-4" />
        <span className="font-medium">Discover New Music</span>
        {activeTab === 'discovery' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
        )}
      </button>
    </div>
  );
}

