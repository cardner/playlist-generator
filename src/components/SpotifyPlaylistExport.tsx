/**
 * Spotify Playlist Export Component
 * 
 * UI component for exporting playlists to Spotify format.
 * Shows preview of tracks with/without URIs and allows format selection.
 * 
 * @module components/SpotifyPlaylistExport
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Copy, Loader2, CheckCircle2, AlertCircle, Music, X } from "lucide-react";
import type { GeneratedPlaylist } from "@/features/playlists";
import type { TrackRecord } from "@/db/schema";
import { exportPlaylistToSpotify } from "@/features/spotify-export/playlist-exporter";
import { generateExportFile, downloadExportFile, copyToClipboard, type ExportFormat } from "@/features/spotify-export/export-options";
import { hasSpotifyTracks } from "@/features/spotify-export/uri-resolver";
import { getAllTracks } from "@/db/storage";
import { db } from "@/db/schema";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface SpotifyPlaylistExportProps {
  /** Playlist to export */
  playlist: GeneratedPlaylist;
  /** Optional library root ID for URI resolution */
  libraryRootId?: string;
}

/**
 * Spotify playlist export component
 */
export function SpotifyPlaylistExport({ playlist, libraryRootId }: SpotifyPlaylistExportProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportData, setExportData] = useState<Awaited<ReturnType<typeof exportPlaylistToSpotify>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("json");
  const [copied, setCopied] = useState(false);

  // Load tracks and generate export preview
  useEffect(() => {
    async function loadPreview() {
      setIsLoading(true);
      setError(null);

      try {
        // Get all tracks
        let allTracks: TrackRecord[];
        if (libraryRootId) {
          allTracks = await db.tracks
            .where("libraryRootId")
            .equals(libraryRootId)
            .toArray();
        } else {
          allTracks = await getAllTracks();
        }

        // Build tracks map
        const tracksMap = new Map<string, TrackRecord>();
        for (const trackFileId of playlist.trackFileIds) {
          const track = allTracks.find((t) => t.trackFileId === trackFileId);
          if (track) {
            tracksMap.set(trackFileId, track);
          }
        }

        // Generate export preview
        const preview = await exportPlaylistToSpotify(playlist, tracksMap, libraryRootId);
        setExportData(preview);
      } catch (err) {
        logger.error("Failed to load Spotify export preview:", err);
        setError(err instanceof Error ? err.message : "Failed to load export preview");
      } finally {
        setIsLoading(false);
      }
    }

    loadPreview();
  }, [playlist, libraryRootId]);

  const handleExport = useCallback(async () => {
    if (!exportData) return;

    setIsExporting(true);
    setError(null);

    try {
      const file = generateExportFile(exportData, selectedFormat, playlist.title);
      downloadExportFile(file);
    } catch (err) {
      logger.error("Failed to export playlist:", err);
      setError(err instanceof Error ? err.message : "Failed to export playlist");
    } finally {
      setIsExporting(false);
    }
  }, [exportData, selectedFormat, playlist.title]);

  const handleCopy = useCallback(async () => {
    if (!exportData) return;

    try {
      const file = generateExportFile(exportData, selectedFormat, playlist.title);
      await copyToClipboard(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("Failed to copy to clipboard:", err);
      setError(err instanceof Error ? err.message : "Failed to copy to clipboard");
    }
  }, [exportData, selectedFormat, playlist.title]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 text-accent-primary animate-spin" />
        <span className="ml-3 text-app-secondary">Loading export preview...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4 flex items-start gap-3">
        <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-red-500 text-sm font-medium mb-1">Error</p>
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!exportData) {
    return null;
  }

  const hasUris = exportData.tracksWithUris > 0;
  const canExport = hasUris && exportData.tracksWithUris > 0;

  return (
    <div className="space-y-4">
      {/* Preview Stats */}
      <div className="bg-app-hover rounded-sm border border-app-border p-4">
        <h4 className="text-app-primary font-medium mb-3 text-sm">Export Preview</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-app-secondary text-xs mb-1">Total Tracks</div>
            <div className="text-app-primary font-medium">{exportData.totalTracks}</div>
          </div>
          <div>
            <div className="text-app-secondary text-xs mb-1">With Spotify URIs</div>
            <div className={cn("font-medium", hasUris ? "text-accent-primary" : "text-app-tertiary")}>
              {exportData.tracksWithUris}
            </div>
          </div>
          <div>
            <div className="text-app-secondary text-xs mb-1">Without URIs</div>
            <div className={cn("font-medium", exportData.tracksWithoutUris > 0 ? "text-yellow-500" : "text-app-tertiary")}>
              {exportData.tracksWithoutUris}
            </div>
          </div>
          <div>
            <div className="text-app-secondary text-xs mb-1">Export Status</div>
            <div className={cn("font-medium", canExport ? "text-accent-primary" : "text-red-500")}>
              {canExport ? "Ready" : "No URIs Found"}
            </div>
          </div>
        </div>
      </div>

      {/* Warning if no URIs */}
      {!hasUris && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-sm p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-yellow-500 text-sm font-medium mb-1">No Spotify URIs Found</p>
            <p className="text-yellow-500 text-sm">
              None of the tracks in this playlist have Spotify URIs. To export to Spotify format,
              you need to import your Spotify library data first.
            </p>
          </div>
        </div>
      )}

      {/* Warning if some tracks missing URIs */}
      {hasUris && exportData.tracksWithoutUris > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-sm p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-yellow-500 text-sm font-medium mb-1">Some Tracks Will Be Skipped</p>
            <p className="text-yellow-500 text-sm">
              {exportData.tracksWithoutUris} track{exportData.tracksWithoutUris !== 1 ? "s" : ""} don&apos;t have Spotify URIs
              and will be excluded from the export.
            </p>
          </div>
        </div>
      )}

      {/* Format Selection */}
      {canExport && (
        <div>
          <label className="block text-app-primary text-sm font-medium mb-2">
            Export Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["json", "csv", "m3u"] as ExportFormat[]).map((format) => (
              <button
                key={format}
                onClick={() => setSelectedFormat(format)}
                className={cn(
                  "px-3 py-2 rounded-sm border text-sm transition-colors",
                  selectedFormat === format
                    ? "bg-accent-primary text-white border-accent-primary"
                    : "bg-app-surface text-app-primary border-app-border hover:bg-app-surface-hover"
                )}
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Export Actions */}
      {canExport && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="size-4" />
                Download {selectedFormat.toUpperCase()}
              </>
            )}
          </button>
          <button
            onClick={handleCopy}
            disabled={isExporting || copied}
            className="px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copy to clipboard"
          >
            {copied ? (
              <CheckCircle2 className="size-4 text-accent-primary" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

