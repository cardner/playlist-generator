"use client";

import { useState } from "react";
import { PlaylistBuilder } from "@/components/PlaylistBuilder";
import { LibrarySummary } from "@/components/LibrarySummary";
import { PlaylistTabs } from "@/components/PlaylistTabs";
import { Music, Sparkles } from "lucide-react";

export default function NewPlaylistPage() {
  const [activeTab, setActiveTab] = useState<'library' | 'discovery'>('library');

  const headerConfig = {
    library: {
      title: "Create New Playlist",
      description: "Build a personalized playlist from your music library",
      icon: Music,
    },
    discovery: {
      title: "Discover New Music",
      description: "Find new tracks similar to your library that aren't in your collection",
      icon: Sparkles,
    },
  };

  const config = headerConfig[activeTab];
  const IconComponent = config.icon;

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="size-12 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm flex items-center justify-center">
            <IconComponent className="size-6 text-white" />
          </div>
          <div>
            <h1 className="text-app-primary tracking-tight text-2xl font-semibold">
              {config.title}
            </h1>
            <p className="text-app-secondary text-sm">
              {config.description}
            </p>
          </div>
        </div>
      </header>

      <div className="mb-6">
        <LibrarySummary />
      </div>

      <div className="bg-app-surface rounded-sm shadow-2xl p-8 md:p-12">
        <PlaylistTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <PlaylistBuilder discoveryMode={activeTab === 'discovery'} />
      </div>
    </div>
  );
}
