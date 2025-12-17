"use client";

import { useState, useEffect, useMemo } from "react";
import type { TrackRecord } from "@/db/schema";
import {
  getAllTracks,
  getTracks,
  searchTracks,
  filterTracksByGenre,
  getAllGenres,
  clearLibraryData,
} from "@/db/storage";
import { getCurrentLibraryRoot } from "@/db/storage";

type SortField = "title" | "artist" | "duration";
type SortDirection = "asc" | "desc";

interface LibraryBrowserProps {
  refreshTrigger?: number;
}

export function LibraryBrowser({ refreshTrigger }: LibraryBrowserProps) {
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [filteredTracks, setFilteredTracks] = useState<TrackRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [genres, setGenres] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start as false - only load when we have a root
  const [libraryRootId, setLibraryRootId] = useState<string | undefined>();
  const [hasLibrary, setHasLibrary] = useState<boolean | null>(null); // null = checking, false = no library, true = has library

  // Check if we have a library root before loading
  useEffect(() => {
    async function checkLibrary() {
      try {
        const root = await getCurrentLibraryRoot();
        setHasLibrary(!!root);
        setLibraryRootId(root?.id);
      } catch (err) {
        setHasLibrary(false);
      }
    }
    checkLibrary();
  }, [refreshTrigger]);

  // Load tracks and genres only if we have a library
  useEffect(() => {
    // Wait for library check to complete
    if (hasLibrary === null) {
      return; // Still checking
    }

    // Only load if we have a library root
    if (hasLibrary) {
      // Small delay to ensure database writes are complete after scan
      const loadWithDelay = async () => {
        if (refreshTrigger && refreshTrigger > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        await loadTracks();
      };
      loadWithDelay();
    } else {
      // No library, clear tracks
      setTracks([]);
      setFilteredTracks([]);
      setGenres([]);
      setIsLoading(false);
    }
  }, [refreshTrigger, hasLibrary]);

  // Filter and sort tracks
  useEffect(() => {
    let filtered = [...tracks];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (track) =>
          track.tags.title.toLowerCase().includes(query) ||
          track.tags.artist.toLowerCase().includes(query) ||
          track.tags.album.toLowerCase().includes(query)
      );
    }

    // Apply genre filter
    if (selectedGenre) {
      filtered = filtered.filter((track) =>
        track.tags.genres.some(
          (g) => g.toLowerCase() === selectedGenre.toLowerCase()
        )
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case "title":
          aValue = a.tags.title.toLowerCase();
          bValue = b.tags.title.toLowerCase();
          break;
        case "artist":
          aValue = a.tags.artist.toLowerCase();
          bValue = b.tags.artist.toLowerCase();
          break;
        case "duration":
          aValue = a.tech?.durationSeconds || 0;
          bValue = b.tech?.durationSeconds || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    setFilteredTracks(filtered);
  }, [tracks, searchQuery, selectedGenre, sortField, sortDirection]);

  async function loadTracks() {
    setIsLoading(true);
    try {
      const root = await getCurrentLibraryRoot();
      if (!root) {
        // No library root, don't load
        setTracks([]);
        setGenres([]);
        setIsLoading(false);
        return;
      }

      setLibraryRootId(root.id);

      // Load tracks for the current collection only
      const collectionTracks = await getTracks(root.id);
      setTracks(collectionTracks);

      const allGenres = await getAllGenres(root.id);
      setGenres(allGenres);
    } catch (error) {
      console.error("Failed to load tracks:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleClearLibrary() {
    if (
      !confirm(
        "Are you sure you want to clear all library data? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      await clearLibraryData();
      setTracks([]);
      setFilteredTracks([]);
      setGenres([]);
      alert("Library data cleared successfully.");
    } catch (error) {
      console.error("Failed to clear library:", error);
      alert("Failed to clear library data.");
    }
  }

  function formatDuration(seconds?: number): string {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Don't show anything if no library has been selected/scanned yet
  // Wait for library check to complete before deciding
  if (hasLibrary === null) {
    return null; // Still checking, don't show anything yet
  }

  // If no library exists, don't show the browser
  if (!hasLibrary) {
    return null; // Return null to hide the component until a library is selected
  }

  if (isLoading) {
    return (
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <p className="text-app-secondary">Loading tracks...</p>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <h2 className="text-app-primary mb-4">Track List</h2>
        <p className="text-app-tertiary">
          No tracks found. Scan your library to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Search and Filters */}
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <div className="space-y-4">
          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-app-primary mb-2 uppercase tracking-wider">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, artist, or album..."
              className="w-full px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border placeholder-app-tertiary focus:outline-none focus:border-accent-primary"
            />
          </div>

          {/* Genre Filter */}
          <div>
            <label className="block text-xs font-medium text-app-primary mb-2 uppercase tracking-wider">
              Genre
            </label>
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            >
              <option value="">All Genres</option>
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-4">
            <label className="text-xs font-medium text-app-primary uppercase tracking-wider">
              Sort by:
            </label>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="px-4 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            >
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="duration">Duration</option>
            </select>
            <button
              onClick={() =>
                setSortDirection(sortDirection === "asc" ? "desc" : "asc")
              }
              className="px-4 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover transition-colors"
            >
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
          </div>

          {/* Results count */}
          <div className="text-sm text-app-secondary">
            Showing {filteredTracks.length} of {tracks.length} tracks
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-app-primary">Tracks</h2>
          <button
            onClick={handleClearLibrary}
            className="text-xs text-red-500 hover:text-red-400 uppercase tracking-wider"
          >
            Clear Library Data
          </button>
        </div>

        {filteredTracks.length === 0 ? (
          <p className="text-app-tertiary">
            No tracks match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border">
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Title
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Artist
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Album
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Genre
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-app-primary uppercase tracking-wider">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTracks.map((track) => (
                  <tr
                    key={track.trackFileId}
                    className="border-b border-app-border hover:bg-app-hover transition-colors"
                  >
                    <td className="py-2 px-4 text-app-primary">{track.tags.title}</td>
                    <td className="py-2 px-4 text-app-primary">{track.tags.artist}</td>
                    <td className="py-2 px-4 text-app-secondary">{track.tags.album}</td>
                    <td className="py-2 px-4 text-app-secondary">
                      {track.tags.genres.join(", ") || "—"}
                    </td>
                    <td className="py-2 px-4 text-app-secondary tabular-nums">
                      {formatDuration(track.tech?.durationSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

