/**
 * PlaylistExport Component
 * 
 * Component for exporting generated playlists in various formats (M3U, PLS, XSPF, CSV, JSON).
 * Handles track lookup, path resolution, and file download. Supports multiple export
 * configurations including path strategies and playlist location settings.
 * 
 * Features:
 * - Export to multiple formats (M3U, PLS, XSPF, CSV, JSON)
 * - Configurable path strategies (relative-to-playlist, relative-to-library-root, absolute)
 * - Playlist location settings (root or subfolder)
 * - Automatic track lookup from IndexedDB
 * - File index integration for path resolution
 * - Relink prompt for moved libraries
 * - Export preferences persistence (localStorage)
 * - Collection-aware export (uses playlist's original collection)
 * 
 * State Management:
 * - Manages export progress and error states
 * - Tracks export configuration (location, path strategy, prefix)
 * - Handles library root path checking
 * - Manages relink prompt display
 * 
 * Export Process:
 * 1. User selects export format
 * 2. Component looks up tracks from IndexedDB
 * 3. Resolves file paths based on configuration
 * 4. Generates export file content
 * 5. Triggers browser download
 * 
 * Props:
 * - `playlist`: The generated playlist to export
 * - `libraryRootId`: Optional library root ID for path resolution
 * - `playlistCollectionId`: Collection ID the playlist was created from
 * 
 * @module components/PlaylistExport
 * 
 * @example
 * ```tsx
 * <PlaylistExport
 *   playlist={generatedPlaylist}
 *   libraryRootId="root-123"
 *   playlistCollectionId="collection-456"
 * />
 * ```
 */

"use client";

import { useState, useEffect } from "react";
import type { GeneratedPlaylist } from "@/features/playlists";
import {
  exportM3U,
  exportPLS,
  exportXSPF,
  exportCSV,
  exportJSON,
  downloadFile,
  type TrackLookup,
  type PlaylistLocationConfig,
} from "@/features/playlists/export";
import { exportITunesXML } from "@/features/playlists/export-itunes";
import { exportJellyfinM3U, exportPlexM3U } from "@/features/playlists/export-media-servers";
import type { ServiceType } from "@/lib/path-normalization";
import { validatePlaylistPaths } from "@/features/playlists/path-validation";
import { getAllTracks, getCurrentCollectionId, getCollection } from "@/db/storage";
import { getFileIndexEntries } from "@/db/storage";
import { db } from "@/db/schema";
import { hasRelativePaths } from "@/features/library/relink";
import { RelinkLibraryRoot } from "./RelinkLibraryRoot";
import { SpotifyPlaylistExport } from "./SpotifyPlaylistExport";
import { hasSpotifyTracks } from "@/features/spotify-export/uri-resolver";
import type { LibraryRootRecord } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  Download,
  FileText,
  Music,
  FileJson,
  AlertCircle,
  Loader2,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaylistExportProps {
  playlist: GeneratedPlaylist;
  libraryRootId?: string;
  playlistCollectionId?: string; // Collection ID the playlist was created from
}

export function PlaylistExport({ playlist, libraryRootId, playlistCollectionId }: PlaylistExportProps) {
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [hasPathWarning, setHasPathWarning] = useState(false);
  const [showRelinkPrompt, setShowRelinkPrompt] = useState(false);
  const [hasRelativePathsCheck, setHasRelativePathsCheck] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExportConfig, setShowExportConfig] = useState(false);
  const [playlistLocation, setPlaylistLocation] = useState<"root" | "subfolder">("root");
  const [pathStrategy, setPathStrategy] = useState<"relative-to-playlist" | "relative-to-library-root" | "absolute">("absolute");
  const [absolutePathPrefix, setAbsolutePathPrefix] = useState<string>("");
  const [currentCollectionId, setCurrentCollectionId] = useState<string | null>(null);
  const [playlistCollection, setPlaylistCollection] = useState<LibraryRootRecord | null>(null);
  const [currentCollection, setCurrentCollection] = useState<LibraryRootRecord | null>(null);
  const [showSpotifyExport, setShowSpotifyExport] = useState(false);
  const [hasSpotify, setHasSpotify] = useState<boolean | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceType>("generic");
  const [serviceLibraryPath, setServiceLibraryPath] = useState<string>("");
  const [useNetworkPaths, setUseNetworkPaths] = useState<boolean>(false);
  const [showPathPreview, setShowPathPreview] = useState<boolean>(false);
  const [pathValidationResult, setPathValidationResult] = useState<Awaited<ReturnType<typeof validatePlaylistPaths>> | null>(null);

  // Load export preferences from localStorage
  useEffect(() => {
    const savedLocation = localStorage.getItem("playlist-export-location") as "root" | "subfolder" | null;
    const savedStrategy = localStorage.getItem("playlist-export-strategy") as "relative-to-playlist" | "relative-to-library-root" | "absolute" | null;
    const savedPrefix = localStorage.getItem("playlist-export-absolute-prefix");
    
    if (savedLocation) {
      setPlaylistLocation(savedLocation);
    }
    if (savedStrategy) {
      setPathStrategy(savedStrategy);
    }
    if (savedPrefix !== null) {
      setAbsolutePathPrefix(savedPrefix);
    }
  }, []);

  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem("playlist-export-location", playlistLocation);
    localStorage.setItem("playlist-export-strategy", pathStrategy);
    localStorage.setItem("playlist-export-absolute-prefix", absolutePathPrefix);
  }, [playlistLocation, pathStrategy, absolutePathPrefix]);

  // Check current collection and load collection info
  useEffect(() => {
    async function loadCollectionInfo() {
      const currentId = await getCurrentCollectionId();
      setCurrentCollectionId(currentId || null);

      if (currentId) {
        const collection = await getCollection(currentId);
        setCurrentCollection(collection || null);
      }

      if (playlistCollectionId) {
        const collection = await getCollection(playlistCollectionId);
        setPlaylistCollection(collection || null);
      }
    }
    loadCollectionInfo();
  }, [playlistCollectionId, libraryRootId]);

  // Check if library has relative paths
  useEffect(() => {
    async function checkPaths() {
      if (libraryRootId) {
        const hasPaths = await hasRelativePaths(libraryRootId);
        setHasRelativePathsCheck(hasPaths);
        if (!hasPaths) {
          setShowRelinkPrompt(true);
        }
      }
    }
    checkPaths();
  }, [libraryRootId]);

  // Check if collection has Spotify tracks
  useEffect(() => {
    async function checkSpotify() {
      if (libraryRootId) {
        const has = await hasSpotifyTracks(libraryRootId);
        setHasSpotify(has);
      } else {
        // Check all collections
        const allCollections = await db.libraryRoots.toArray();
        let found = false;
        for (const collection of allCollections) {
          if (collection.mode === "spotify") {
            found = true;
            break;
          }
        }
        setHasSpotify(found);
      }
    }
    checkSpotify();
  }, [libraryRootId]);

  // Check if playlist collection matches current collection
  const collectionMismatch = playlistCollectionId && 
    playlistCollectionId !== currentCollectionId;

  async function handleExport(format: "m3u" | "pls" | "xspf" | "csv" | "json" | "itunes-xml") {
    setIsExporting(format);
    setError(null);
    setHasPathWarning(false);

    try {
      // Get all tracks
      let allTracks;
      if (libraryRootId) {
        allTracks = await db.tracks
          .where("libraryRootId")
          .equals(libraryRootId)
          .toArray();
      } else {
        allTracks = await getAllTracks();
      }

      // Get file index entries
      let fileIndexEntries: Map<string, any> = new Map();
      if (libraryRootId) {
        const entries = await getFileIndexEntries(libraryRootId);
        for (const entry of entries) {
          fileIndexEntries.set(entry.trackFileId, entry);
        }
      }

      // Build track lookups
      const trackLookups: TrackLookup[] = [];
      for (const trackFileId of playlist.trackFileIds) {
        const track = allTracks.find((t) => t.trackFileId === trackFileId);
        if (!track) continue;

        const fileIndex = fileIndexEntries.get(trackFileId);
        trackLookups.push({
          track,
          fileIndex,
        });
      }

      // Build export configuration
      const exportConfig: PlaylistLocationConfig = {
        playlistLocation,
        pathStrategy,
        absolutePathPrefix: pathStrategy === "absolute" ? absolutePathPrefix : undefined,
      };

      // Export based on format
      let result;
      switch (format) {
        case "m3u":
          if (selectedService === "jellyfin") {
            result = exportJellyfinM3U(playlist, trackLookups, exportConfig, {
              service: "jellyfin",
              libraryRoot: serviceLibraryPath || undefined,
              useNetworkPaths,
            });
          } else if (selectedService === "plex") {
            result = exportPlexM3U(playlist, trackLookups, exportConfig, {
              service: "plex",
              libraryRoot: serviceLibraryPath || undefined,
              useNetworkPaths,
            });
          } else if (selectedService === "mediamonkey") {
            result = exportM3U(playlist, trackLookups, exportConfig, "mediamonkey" as ServiceType);
          } else {
            result = exportM3U(playlist, trackLookups, exportConfig, selectedService as ServiceType);
          }
          break;
        case "pls":
          result = exportPLS(playlist, trackLookups, exportConfig);
          break;
        case "xspf":
          result = exportXSPF(playlist, trackLookups, exportConfig);
          break;
        case "csv":
          result = exportCSV(playlist, trackLookups, exportConfig);
          break;
        case "json":
          result = exportJSON(playlist, trackLookups, exportConfig);
          break;
        case "itunes-xml":
          result = exportITunesXML(playlist, trackLookups, exportConfig, serviceLibraryPath || undefined);
          break;
      }

      // Check for path warnings
      if (!result.hasRelativePaths && format !== "csv" && format !== "json") {
        setHasPathWarning(true);
      }

      // Generate filename
      const sanitizedTitle = playlist.title
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase()
        .substring(0, 50);
      const filename = `${sanitizedTitle}.${result.extension}`;

      // Download file
      downloadFile(result.content, filename, result.mimeType);
    } catch (err) {
      logger.error("Export failed:", err);
      setError(err instanceof Error ? err.message : "Failed to export playlist");
    } finally {
      setIsExporting(null);
    }
  }

  const exportButtons = [
    {
      format: "m3u" as const,
      label: "M3U",
      icon: Music,
      description: "Standard playlist format",
      supportsService: true,
    },
    {
      format: "pls" as const,
      label: "PLS",
      icon: Music,
      description: "Winamp playlist format",
      supportsService: false,
    },
    {
      format: "xspf" as const,
      label: "XSPF",
      icon: FileText,
      description: "XML Shareable Playlist",
      supportsService: false,
    },
    {
      format: "itunes-xml" as const,
      label: "iTunes XML",
      icon: FileText,
      description: "iTunes/Apple Music import",
      supportsService: false,
    },
    {
      format: "csv" as const,
      label: "CSV",
      icon: FileText,
      description: "Spreadsheet format",
      supportsService: false,
    },
    {
      format: "json" as const,
      label: "JSON",
      icon: FileJson,
      description: "Data format",
      supportsService: false,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Collection Mismatch Warning */}
      {collectionMismatch && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-sm p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-yellow-500 font-medium mb-1">Collection Mismatch</h4>
              <p className="text-yellow-500 text-sm mb-2">
                This playlist was created from the collection &quot;{playlistCollection?.name || "Unknown"}&quot;, 
                but you are currently viewing the collection &quot;{currentCollection?.name || "Unknown"}&quot;.
              </p>
              <p className="text-yellow-500 text-sm">
                Exporting this playlist may not work correctly because the file paths may not match your current collection. 
                Consider switching to the collection this playlist was created from before exporting.
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-app-primary font-medium uppercase tracking-wider text-sm">
            Export Playlist
          </h3>
          <button
            onClick={() => setShowExportConfig(!showExportConfig)}
            className="flex items-center gap-2 px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
            title="Export settings"
          >
            <Settings className="size-4" />
            {showExportConfig ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
        <p className="text-app-secondary text-sm mb-4">
          Download your playlist in various formats for use in music players or
          for inspection.
        </p>
      </div>

      {/* Export Configuration */}
      {showExportConfig && (
        <div className="bg-app-hover rounded-sm border border-app-border p-4 space-y-4">
          <div>
            <label className="block text-app-primary text-sm font-medium mb-2 uppercase tracking-wider">
              Playlist Location
            </label>
            <p className="text-app-secondary text-xs mb-3">
              Where will you store the playlist file?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPlaylistLocation("root")}
                className={cn(
                  "flex-1 px-4 py-2 rounded-sm border transition-colors text-sm",
                  playlistLocation === "root"
                    ? "bg-accent-primary text-white border-accent-primary"
                    : "bg-app-surface text-app-primary border-app-border hover:bg-app-surface-hover"
                )}
              >
                Root Folder
              </button>
              <button
                onClick={() => setPlaylistLocation("subfolder")}
                className={cn(
                  "flex-1 px-4 py-2 rounded-sm border transition-colors text-sm",
                  playlistLocation === "subfolder"
                    ? "bg-accent-primary text-white border-accent-primary"
                    : "bg-app-surface text-app-primary border-app-border hover:bg-app-surface-hover"
                )}
              >
                Playlists Subfolder
              </button>
            </div>
            <p className="text-app-tertiary text-xs mt-2">
              {playlistLocation === "root"
                ? "Playlist will be in the same folder as your music files"
                : "Playlist will be in a 'playlists' subfolder"}
            </p>
          </div>

          <div>
            <label className="block text-app-primary text-sm font-medium mb-2 uppercase tracking-wider">
              Path Format
            </label>
            <p className="text-app-secondary text-xs mb-3">
              How should file paths be formatted in the playlist?
            </p>
            <select
              value={pathStrategy}
              onChange={(e) => setPathStrategy(e.target.value as typeof pathStrategy)}
              className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm mb-3"
            >
              <option value="absolute">Absolute Paths (Recommended)</option>
              <option value="relative-to-playlist">Relative to Playlist</option>
              <option value="relative-to-library-root">Relative to Library Root</option>
            </select>
            
          {/* Service Selector (for M3U format) */}
          {exportButtons.find(b => b.format === "m3u" || b.format === "itunes-xml") && (
            <div>
              <label className="block text-app-primary text-sm font-medium mb-2 uppercase tracking-wider">
                Media Service
              </label>
              <p className="text-app-secondary text-xs mb-3">
                Select the target media service for optimized path handling
              </p>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value as ServiceType)}
                className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm mb-3"
              >
                <option value="generic">Generic (Default)</option>
                <option value="itunes">iTunes / Apple Music</option>
                <option value="jellyfin">Jellyfin</option>
                <option value="plex">Plex</option>
                <option value="mediamonkey">MediaMonkey</option>
              </select>
              
              {(selectedService === "jellyfin" || selectedService === "plex" || selectedService === "itunes" || selectedService === "mediamonkey") && (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="block text-app-primary text-xs font-medium mb-2">
                      Media Library Path
                    </label>
                    <input
                      type="text"
                      value={serviceLibraryPath}
                      onChange={(e) => setServiceLibraryPath(e.target.value)}
                      placeholder={selectedService === "itunes" ? "/Users/me/Music/iTunes" : "/media/music"}
                      className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
                    />
                    <p className="text-app-tertiary text-xs mt-1">
                      {selectedService === "itunes" 
                        ? "Path to your iTunes Media folder"
                        : selectedService === "mediamonkey"
                        ? "Path to your MediaMonkey music library root (optional)"
                        : "Path to your media server library root"}
                    </p>
                  </div>
                  
                  {/* Path Validation Status */}
                  {pathValidationResult && (
                    <div className="mt-3 p-3 bg-app-surface border border-app-border rounded-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-app-primary text-xs font-medium">Path Validation</span>
                        <span className={`text-xs ${pathValidationResult.invalidPaths === 0 && pathValidationResult.missingPaths === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                          {pathValidationResult.validPaths}/{pathValidationResult.totalTracks} valid
                        </span>
                      </div>
                      {pathValidationResult.invalidPaths > 0 && (
                        <p className="text-yellow-500 text-xs">
                          {pathValidationResult.invalidPaths} path(s) may have issues
                        </p>
                      )}
                      {pathValidationResult.missingPaths > 0 && (
                        <p className="text-yellow-500 text-xs">
                          {pathValidationResult.missingPaths} path(s) missing relative paths
                        </p>
                      )}
                      {pathValidationResult.invalidPaths === 0 && pathValidationResult.missingPaths === 0 && (
                        <p className="text-green-500 text-xs">
                          All paths validated successfully
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPathPreview(!showPathPreview)}
                        className="mt-2 text-xs text-accent-primary hover:text-accent-hover"
                      >
                        {showPathPreview ? "Hide" : "Show"} path preview
                      </button>
                      {showPathPreview && pathValidationResult.issues.length > 0 && (
                        <div className="mt-2 max-h-32 overflow-y-auto">
                          {pathValidationResult.issues.slice(0, 5).map((issue: { trackFileId: string; path: string; issues: string[] }, idx: number) => (
                            <div key={idx} className="text-xs text-app-secondary mt-1">
                              <span className="font-mono">{issue.path}</span>
                              {issue.issues.length > 0 && (
                                <ul className="list-disc list-inside ml-2 text-yellow-500">
                                  {issue.issues.map((i: string, iidx: number) => (
                                    <li key={iidx}>{i}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                          {pathValidationResult.issues.length > 5 && (
                            <p className="text-xs text-app-tertiary mt-1">
                              ... and {pathValidationResult.issues.length - 5} more
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {(selectedService === "jellyfin" || selectedService === "plex") && (
                    <div>
                      <label className="flex items-center gap-2 text-app-primary text-xs">
                        <input
                          type="checkbox"
                          checked={useNetworkPaths}
                          onChange={(e) => setUseNetworkPaths(e.target.checked)}
                          className="rounded border-app-border"
                        />
                        <span>Use network paths (UNC/SMB)</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

            {pathStrategy === "absolute" && (
              <div className="mt-3">
                <label className="block text-app-primary text-xs font-medium mb-2">
                  Absolute Path Prefix
                </label>
                <p className="text-app-secondary text-xs mb-2">
                  Prefix to prepend to relative paths (e.g., /media/music or /mnt/music)
                </p>
                <input
                  type="text"
                  value={absolutePathPrefix}
                  onChange={(e) => setAbsolutePathPrefix(e.target.value)}
                  placeholder="/media/music"
                  className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm font-mono"
                />
                <p className="text-app-tertiary text-xs mt-2">
                  Example: If prefix is &quot;/media/music&quot; and relative path is &quot;Artist/Album/track.mp3&quot;,
                  the absolute path will be &quot;/media/music/Artist/Album/track.mp3&quot;
                </p>
              </div>
            )}
            
            <p className="text-app-tertiary text-xs mt-2">
              {pathStrategy === "absolute"
                ? "Paths will be absolute with the specified prefix prepended to relative paths."
                : pathStrategy === "relative-to-playlist"
                ? "Paths are relative to where the playlist file is located."
                : "Paths are relative to the library root folder."}
            </p>
          </div>
        </div>
      )}

      {showRelinkPrompt && libraryRootId && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-sm p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-yellow-500 text-sm font-medium mb-1">
                Missing Relative Paths
              </p>
              <p className="text-yellow-500 text-sm mb-3">
                Your library doesn&apos;t have relative paths stored. Playlist
                exports (M3U, PLS, XSPF) may not work correctly. You can relink
                your library root to update paths.
              </p>
              <RelinkLibraryRoot
                libraryRootId={libraryRootId}
                onRelinkComplete={(newRootId) => {
                  setShowRelinkPrompt(false);
                  // Reload page or update state
                  window.location.reload();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {hasPathWarning && !showRelinkPrompt && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-sm p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-yellow-500 text-sm font-medium mb-1">
              Path Warning
            </p>
            <p className="text-yellow-500 text-sm">
              Some tracks don&apos;t have relative paths. You may need to
              manually relink files in your music player after importing this
              playlist.
            </p>
            {libraryRootId && (
              <button
                onClick={() => setShowRelinkPrompt(true)}
                className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded-sm transition-colors text-sm"
              >
                <RefreshCw className="size-4" />
                Relink Library Root
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 text-sm font-medium mb-1">Export Error</p>
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {exportButtons.map(({ format, label, icon: Icon, description }) => (
          <button
            key={format}
            onClick={() => handleExport(format)}
            disabled={isExporting !== null}
            className={cn(
              "flex items-center gap-3 px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed",
              isExporting === format && "bg-accent-primary/10 border-accent-primary"
            )}
          >
            {isExporting === format ? (
              <Loader2 className="size-5 text-accent-primary animate-spin shrink-0" />
            ) : (
              <Icon className="size-5 text-accent-primary shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-app-tertiary truncate">
                {description}
              </div>
            </div>
            <Download className="size-4 text-app-tertiary shrink-0" />
          </button>
        ))}
      </div>

      <div className="text-app-tertiary text-xs">
        <p>
          <strong>Note:</strong> CSV and JSON formats always work perfectly and
          include full track metadata. Playlist formats (M3U, PLS, XSPF) may
          require manual file relinking if relative paths are not available.
        </p>
      </div>

      {/* Spotify Export Section */}
      {hasSpotify && (
        <div className="mt-6 pt-6 border-t border-app-border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-app-primary font-medium uppercase tracking-wider text-sm mb-1">
                Export to Spotify Format
              </h3>
              <p className="text-app-secondary text-sm">
                Export playlist in Spotify-compatible JSON format for manual import
              </p>
            </div>
            <button
              onClick={() => setShowSpotifyExport(!showSpotifyExport)}
              className="p-2 hover:bg-app-hover rounded-sm transition-colors text-app-secondary hover:text-app-primary"
              aria-label={showSpotifyExport ? "Hide Spotify export" : "Show Spotify export"}
            >
              {showSpotifyExport ? (
                <ChevronUp className="size-5" />
              ) : (
                <ChevronDown className="size-5" />
              )}
            </button>
          </div>

          {showSpotifyExport && (
            <SpotifyPlaylistExport playlist={playlist} libraryRootId={libraryRootId} />
          )}
        </div>
      )}
    </div>
  );
}

