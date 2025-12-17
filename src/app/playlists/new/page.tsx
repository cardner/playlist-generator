"use client";

import { PlaylistBuilder } from "@/components/PlaylistBuilder";
import { LibrarySummary } from "@/components/LibrarySummary";
import { Music } from "lucide-react";

export default function NewPlaylistPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="size-12 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm flex items-center justify-center">
            <Music className="size-6 text-white" />
          </div>
          <div>
            <h1 className="text-app-primary tracking-tight text-2xl font-semibold">
              Create New Playlist
            </h1>
            <p className="text-app-secondary text-sm">
              Build a personalized playlist from your music library
            </p>
          </div>
        </div>
      </header>

      <div className="mb-6">
        <LibrarySummary />
      </div>

      <div className="bg-app-surface rounded-sm shadow-2xl p-8 md:p-12">
        <PlaylistBuilder />
      </div>
    </div>
  );
}
