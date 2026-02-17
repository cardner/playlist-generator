/**
 * DeviceSyncSidebar Component
 *
 * Sidebar for device sync showing device header, capacity, Ready to Sync counts,
 * Sync/Scan/Export buttons, and Saved Playlists. Used by DeviceSyncPanel.
 */

"use client";

import { useState } from "react";
import type { GeneratedPlaylist } from "@/features/playlists";
import { Button, Card } from "@/design-system/components";
import { JellyfinIcon, WalkmanIcon } from "@/components/DevicePresetIcons";
import {
  Usb,
  Loader2,
  Check,
  Music,
  Circle,
  User,
  ListMusic,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Bug,
} from "lucide-react";

export type DevicePreset = "walkman" | "generic" | "zune" | "ipod" | "jellyfin";

interface PlaylistItem {
  playlist: GeneratedPlaylist;
  libraryRootId?: string;
  collectionName?: string;
}

export interface CapacityInfo {
  usedBytes: number;
  capacityGb: number;
}

interface DeviceSyncSidebarProps {
  deviceLabel: string;
  devicePreset: DevicePreset;
  deviceHandleRef: string | null;
  /** Real-time connection status. When provided, overrides deviceHandleRef for status display. */
  isDeviceConnected?: boolean;
  capacityInfo?: CapacityInfo | null;
  selectedTracksCount: number;
  selectedAlbumsCount: number;
  selectedArtistsCount: number;
  selectedPlaylistsCount: number;
  totalTracksCount: number;
  playlists?: PlaylistItem[];
  selectedPlaylistIds: string[];
  onSelectedPlaylistIdsChange: (ids: string[]) => void;
  onSync: () => void;
  onScan?: () => void;
  onExport?: () => void;
  isSyncing: boolean;
  syncPhase?: "idle" | "preparing" | "writing";
  deviceScanStatus?: "idle" | "scanning" | "done" | "error";
  lastSyncAt?: number;
  syncButtonLabel: string;
  showScanButton?: boolean;
  showExportButton?: boolean;
  supportsFileSystemAccess?: boolean;
  useCompanionApp?: boolean;
  jellyfinExportMode?: "download" | "library-root";
  /** Device path detection (Walkman/Generic/Zune). When provided, shows config in sidebar. */
  devicePathDetection?: {
    enabled: boolean;
    onlyIncludeMatchedPaths: boolean;
    scanRoots: string;
    onEnabledChange: (enabled: boolean) => void;
    onOnlyIncludeMatchedPathsChange: (value: boolean) => void;
    onScanRootsChange: (value: string) => void;
    scanProgress?: { scanned: number; matched: number; hashed: number };
    isWalkman?: boolean;
    keyCoverageLog?: {
      tracksWithMetadata: number;
      totalTracks: number;
      keyMapSize: number;
      scanned: number;
      matched: number;
      hashed: number;
      scanMapSize: number;
      sampleLibraryKeys: string[];
      sampleDevicePaths: string[];
    } | null;
    missingMetadataCount?: number;
    devicePreviewPaths?: { resolved: string[]; missing: string[] };
    onRescanLibrary?: () => void;
  };
}

export function DeviceSyncSidebar({
  deviceLabel,
  devicePreset,
  deviceHandleRef,
  isDeviceConnected,
  capacityInfo,
  selectedTracksCount,
  selectedAlbumsCount,
  selectedArtistsCount,
  selectedPlaylistsCount,
  totalTracksCount,
  playlists,
  selectedPlaylistIds,
  onSelectedPlaylistIdsChange,
  onSync,
  onScan,
  onExport,
  isSyncing,
  syncPhase = "idle",
  deviceScanStatus = "idle",
  lastSyncAt,
  syncButtonLabel,
  showScanButton = true,
  showExportButton = false,
  supportsFileSystemAccess = true,
  useCompanionApp = false,
  jellyfinExportMode = "download",
  devicePathDetection,
}: DeviceSyncSidebarProps) {
  const [showKeyCoverageLog, setShowKeyCoverageLog] = useState(false);
  const [showPathPreview, setShowPathPreview] = useState(false);
  const connected =
    isDeviceConnected !== undefined ? isDeviceConnected : !!deviceHandleRef;

  const DeviceIcon =
    devicePreset === "ipod"
      ? Smartphone
      : devicePreset === "jellyfin"
        ? JellyfinIcon
        : devicePreset === "walkman"
          ? WalkmanIcon
          : Usb;

  return (
    <aside className="w-full lg:w-80 lg:max-w-sm shrink-0 sticky top-0 self-start">
      <div className="rounded-lg bg-app-surface p-4 space-y-4">
        {/* Device header: icon, name, connection status */}
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-md bg-accent-primary flex items-center justify-center shrink-0 text-white">
            <DeviceIcon className={devicePreset === "jellyfin" || devicePreset === "walkman" ? "size-6" : "size-5"} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-app-primary font-semibold text-lg truncate">
              {deviceLabel || "New device"}
            </div>
            <div className="text-xs mt-0.5 flex items-center gap-2">
              {connected ? (
                <>
                  <Check className="size-3.5 text-green-500 shrink-0" />
                  <span className="text-green-500">
                    {devicePreset === "jellyfin" ? "Ready" : "Connected"}
                  </span>
                </>
              ) : (
                <span className="text-app-tertiary">
                  {devicePreset === "jellyfin" ? "Not configured" : "Not connected"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Device Capacity card */}
        <Card padding="md">
          <div className="text-app-tertiary text-xs font-medium uppercase tracking-wider mb-1.5">
            Device capacity
          </div>
          {capacityInfo ? (
            <>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-app-primary font-medium">
                  {(capacityInfo.usedBytes / 1e9).toFixed(1)} GB of{" "}
                  {capacityInfo.capacityGb.toFixed(0)} GB used
                </span>
                <span className="text-app-primary tabular-nums">
                  {Math.round(
                    (capacityInfo.usedBytes / (capacityInfo.capacityGb * 1e9)) * 100
                  )}
                  %
                </span>
              </div>
              <div className="mt-1.5 h-1.5 bg-app-hover rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-[width]"
                  style={{
                    width: `${Math.min(
                      100,
                      (capacityInfo.usedBytes / (capacityInfo.capacityGb * 1e9)) * 100
                    )}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-app-tertiary text-xs">Capacity N/A</p>
          )}
        </Card>

        {/* Ready to Sync card */}
        <Card padding="md">
          <div className="text-app-tertiary text-xs font-medium uppercase tracking-wider mb-2">
            Ready to Sync
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Music className="size-4 text-accent-primary shrink-0" />
              <span className="text-app-primary">Tracks</span>
              <span
                className={
                  selectedTracksCount > 0 ? "text-accent-primary ml-auto font-medium" : "text-app-tertiary ml-auto"
                }
              >
                {selectedTracksCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="size-4 text-accent-primary shrink-0" />
              <span className="text-app-primary">Albums</span>
              <span
                className={
                  selectedAlbumsCount > 0 ? "text-accent-primary ml-auto font-medium" : "text-app-tertiary ml-auto"
                }
              >
                {selectedAlbumsCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="size-4 text-accent-primary shrink-0" />
              <span className="text-app-primary">Artists</span>
              <span
                className={
                  selectedArtistsCount > 0 ? "text-accent-primary ml-auto font-medium" : "text-app-tertiary ml-auto"
                }
              >
                {selectedArtistsCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ListMusic className="size-4 text-accent-primary shrink-0" />
              <span className="text-app-primary">Playlists</span>
              <span
                className={
                  selectedPlaylistsCount > 0 ? "text-accent-primary ml-auto font-medium" : "text-app-tertiary ml-auto"
                }
              >
                {selectedPlaylistsCount}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-2 mt-2 border-t border-app-border">
              <span className="text-app-primary font-medium">Total Tracks</span>
              <span
                className={
                  totalTracksCount > 0 ? "text-accent-primary font-medium ml-auto" : "text-app-tertiary ml-auto"
                }
              >
                {totalTracksCount}
              </span>
            </div>
          </div>
        </Card>

        {/* Device Path Detection (Walkman/Generic/Zune) */}
        {devicePathDetection && showScanButton && (
          <Card padding="md">
            <div className="text-app-tertiary text-xs font-medium uppercase tracking-wider mb-2">
              Device Path Detection
            </div>
            <label className="flex items-start gap-2 text-app-primary text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={devicePathDetection.enabled}
                onChange={(e) => devicePathDetection.onEnabledChange(e.target.checked)}
                className="rounded border-app-border mt-0.5"
                disabled={useCompanionApp}
              />
              <span>Scan the device and map files to improve playlist path accuracy.</span>
            </label>
            {devicePathDetection.enabled && (
              <>
                <label className="flex items-start gap-2 text-app-primary text-xs mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={devicePathDetection.onlyIncludeMatchedPaths}
                    onChange={(e) =>
                      devicePathDetection.onOnlyIncludeMatchedPathsChange(e.target.checked)
                    }
                    className="rounded border-app-border mt-0.5"
                    disabled={useCompanionApp}
                  />
                  <span>Only include tracks already found on the device.</span>
                </label>
                <div className="mt-2">
                  <label className="block text-app-primary text-[11px] font-medium mb-1 uppercase tracking-wider">
                    Scan Roots (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={devicePathDetection.scanRoots}
                    onChange={(e) => devicePathDetection.onScanRootsChange(e.target.value)}
                    placeholder="MUSIC,MP3"
                    className="w-full px-3 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-xs"
                    disabled={useCompanionApp}
                  />
                  <p className="text-app-tertiary text-[11px] mt-1">
                    Leave empty to scan entire device. {devicePathDetection.isWalkman && "Scan runs automatically on sync."}
                  </p>
                </div>
                {devicePathDetection.scanProgress && devicePathDetection.scanProgress.scanned > 0 && (
                  <p className="text-app-tertiary text-[11px] mt-2">
                    Scanned {devicePathDetection.scanProgress.scanned} files, matched{" "}
                    {devicePathDetection.scanProgress.matched}, hashed{" "}
                    {devicePathDetection.scanProgress.hashed}
                  </p>
                )}
                {devicePathDetection.keyCoverageLog != null && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowKeyCoverageLog(!showKeyCoverageLog)}
                      className="flex items-center gap-1.5 text-[11px] text-app-tertiary hover:text-app-secondary uppercase tracking-wider"
                    >
                      {showKeyCoverageLog ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      <Bug className="size-3.5" />
                      Key coverage log
                    </button>
                    {showKeyCoverageLog && (
                      <div className="mt-2 p-2.5 bg-app-surface border border-app-border rounded-sm font-mono text-[11px] text-app-secondary space-y-1.5 overflow-x-auto">
                        <div>
                          <span className="text-app-tertiary">Library:</span>{" "}
                          {devicePathDetection.keyCoverageLog.tracksWithMetadata}/
                          {devicePathDetection.keyCoverageLog.totalTracks} tracks with metadata
                        </div>
                        <div>
                          <span className="text-app-tertiary">Keys:</span>{" "}
                          {devicePathDetection.keyCoverageLog.keyMapSize} match keys
                        </div>
                        <div>
                          <span className="text-app-tertiary">Scan:</span>{" "}
                          {devicePathDetection.keyCoverageLog.scanned} scanned,{" "}
                          {devicePathDetection.keyCoverageLog.matched} matched,{" "}
                          {devicePathDetection.keyCoverageLog.hashed} hashed
                        </div>
                        <div>
                          <span className="text-app-tertiary">Map:</span>{" "}
                          {devicePathDetection.keyCoverageLog.scanMapSize} path entries
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {(devicePathDetection.missingMetadataCount ?? 0) > 0 && (
                  <div className="mt-2 text-xs text-yellow-500">
                    {devicePathDetection.missingMetadataCount} track(s) missing metadata.{" "}
                    {devicePathDetection.onRescanLibrary && (
                      <button
                        type="button"
                        onClick={devicePathDetection.onRescanLibrary}
                        className="underline hover:text-yellow-400"
                      >
                        Rescan library
                      </button>
                    )}
                  </div>
                )}
                {devicePathDetection.devicePreviewPaths &&
                  devicePathDetection.devicePreviewPaths.resolved.length + devicePathDetection.devicePreviewPaths.missing.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setShowPathPreview(!showPathPreview)}
                        className="text-[11px] text-app-tertiary hover:text-app-secondary"
                      >
                        {showPathPreview ? "Hide" : "Show"} path preview
                      </button>
                      {showPathPreview && (
                        <div className="mt-1 text-[11px] text-app-secondary space-y-1">
                          <div>
                            {devicePathDetection.devicePreviewPaths!.resolved.length} resolved,{" "}
                            {devicePathDetection.devicePreviewPaths!.missing.length} missing
                          </div>
                          {devicePathDetection.devicePreviewPaths!.missing.length > 0 &&
                            devicePathDetection.onRescanLibrary && (
                              <button
                                type="button"
                                onClick={devicePathDetection.onRescanLibrary}
                                className="text-yellow-500 underline hover:text-yellow-400"
                              >
                                Rescan library
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  )}
              </>
            )}
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          {showScanButton && onScan && (
            <Button
              variant="secondary"
              onClick={onScan}
              disabled={!deviceHandleRef || deviceScanStatus === "scanning"}
              className="w-full justify-center"
            >
              {deviceScanStatus === "scanning"
                ? "Scanning..."
                : deviceScanStatus === "idle"
                  ? "Not scanned"
                  : deviceScanStatus === "done"
                    ? "Scanned"
                    : deviceScanStatus === "error"
                      ? "Scan failed"
                      : "Not scanned"}
            </Button>
          )}
          {showExportButton && onExport ? (
            <Button
              variant="primary"
              leftIcon={<Usb className="size-4" />}
              onClick={onExport}
              disabled={
                isSyncing ||
                (jellyfinExportMode === "library-root" && !supportsFileSystemAccess)
              }
            >
              {jellyfinExportMode === "library-root"
                ? "Save to Library"
                : "Export for Jellyfin"}
            </Button>
          ) : (
            <Button
              variant="primary"
              leftIcon={
                isSyncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Usb className="size-4" />
                )
              }
              onClick={onSync}
              disabled={isSyncing || (!supportsFileSystemAccess && !useCompanionApp)}
            >
              {isSyncing
                ? syncPhase === "writing"
                  ? "Writing..."
                  : "Syncing..."
                : syncButtonLabel}
            </Button>
          )}

          {lastSyncAt && (
            <div className="pt-2 mt-2 border-t border-app-border text-app-tertiary text-xs">
              Last synced: {new Date(lastSyncAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* Saved Playlists */}
        {playlists && playlists.length > 0 && (
          <Card padding="md" className="space-y-4 mt-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-md bg-accent-primary flex items-center justify-center shrink-0 text-white">
                <ListMusic className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-app-primary font-semibold text-base">Saved Playlists</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectedPlaylistIdsChange(playlists.map((item) => item.playlist.id))}
                      className="text-xs text-accent-primary hover:text-accent-hover font-medium"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectedPlaylistIdsChange([])}
                      className="text-xs text-accent-primary hover:text-accent-hover font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <p className="text-app-tertiary text-xs mt-0.5">Select playlists to sync to device</p>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {playlists.map((item) => {
                const isChecked = selectedPlaylistIds.includes(item.playlist.id);
                return (
                  <label
                    key={item.playlist.id}
                    className={`flex items-start gap-3 cursor-pointer rounded-md p-3 transition-colors border-2 ${
                      isChecked
                        ? "bg-app-hover border-accent-primary"
                        : "border-transparent bg-app-surface hover:bg-app-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectedPlaylistIdsChange([...selectedPlaylistIds, item.playlist.id]);
                        } else {
                          onSelectedPlaylistIdsChange(
                            selectedPlaylistIds.filter((id) => id !== item.playlist.id)
                          );
                        }
                      }}
                      className="sr-only"
                      aria-label={`Select ${item.playlist.title} for sync`}
                    />
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <ListMusic className="size-4 text-app-tertiary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-app-primary font-medium text-xs">
                          {item.playlist.title}
                        </div>
                        <div className="text-app-tertiary text-xs mt-0.5">
                          Tracks: {item.playlist.trackFileIds.length}
                          {item.collectionName ? ` • ${item.collectionName}` : ""}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </aside>
  );
}
