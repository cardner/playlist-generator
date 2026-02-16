"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneratedPlaylist } from "@/features/playlists";
import { getAllSavedPlaylistsWithCollections } from "@/db/playlist-storage";
import { getCollection } from "@/db/storage";
import { DeviceSyncPanel } from "@/components/DeviceSyncPanel";
import type { DeviceProfileRecord } from "@/db/schema";
import {
  deleteDeviceProfileWithManifests,
  getDeviceProfiles,
  saveDeviceProfile,
} from "@/features/devices/device-storage";
import { pickDeviceRootHandle } from "@/features/devices/device-sync";
import { detectDevicePreset } from "@/features/devices/device-detect";
import { getDirectoryHandle } from "@/lib/library-selection-fs-api";
import { Button, Card } from "@/design-system/components";
import { JellyfinIcon, WalkmanIcon } from "@/components/DevicePresetIcons";
import { AlertCircle, Cpu, HardDrive, Loader2, Smartphone, Trash2, Usb } from "lucide-react";
import { logger } from "@/lib/logger";

interface PlaylistWithCollection {
  playlist: GeneratedPlaylist;
  libraryRootId?: string;
  collectionName?: string;
}

type DeviceStatus =
  | "checking"
  | "available"
  | "needs_access"
  | "missing"
  | "companion"
  | "export";

export default function DeviceSyncPage() {
  const [playlists, setPlaylists] = useState<PlaylistWithCollection[]>([]);
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfileRecord[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectionIsUserInitiated, setSelectionIsUserInitiated] = useState(false);
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, DeviceStatus>>({});
  const [isCheckingDevices, setIsCheckingDevices] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlaylists();
    loadDevices();
  }, []);

  const checkDeviceStatuses = useCallback(async () => {
    setIsCheckingDevices(true);
    const statusMap: Record<string, DeviceStatus> = {};
    deviceProfiles.forEach((profile) => {
      statusMap[profile.id] = "checking";
    });
    setDeviceStatuses(statusMap);

    const resolved: Array<{ id: string; status: DeviceStatus }> = [];
    for (const profile of deviceProfiles) {
      try {
        if (!profile.handleRef) {
          resolved.push({
            id: profile.id,
            status: profile.deviceType === "jellyfin" ? "export" : "companion",
          });
          continue;
        }
        const handle = await getDirectoryHandle(profile.handleRef);
        if (!handle) {
          resolved.push({ id: profile.id, status: "missing" });
          continue;
        }
        const permission = await handle.queryPermission({ mode: "read" });
        if (permission === "granted") {
          resolved.push({ id: profile.id, status: "available" });
        } else {
          resolved.push({ id: profile.id, status: "needs_access" });
        }
      } catch (err) {
        logger.warn("Failed to check device permission", err);
        resolved.push({ id: profile.id, status: "needs_access" });
      }
    }

    const updated: Record<string, DeviceStatus> = {};
    resolved.forEach((item) => {
      updated[item.id] = item.status;
    });
    setDeviceStatuses(updated);
    setIsCheckingDevices(false);

    if (!selectedDeviceId) {
      const firstAvailable = resolved.find((item) => item.status === "available");
      if (firstAvailable) {
        setSelectedDeviceId(firstAvailable.id);
        setSelectionIsUserInitiated(false);
      }
    }
  }, [deviceProfiles, selectedDeviceId]);

  useEffect(() => {
    if (deviceProfiles.length === 0) return;
    checkDeviceStatuses();
  }, [deviceProfiles, checkDeviceStatuses]);

  async function loadPlaylists() {
    try {
      setIsLoading(true);
      const saved = await getAllSavedPlaylistsWithCollections();
      const playlistsWithNames = await Promise.all(
        saved.map(async (item) => {
          let collectionName: string | undefined;
          if (item.collectionId) {
            const collection = await getCollection(item.collectionId);
            collectionName = collection?.name;
          }
          return {
            playlist: item.playlist,
            libraryRootId: item.collectionId,
            collectionName,
          };
        })
      );
      setPlaylists(playlistsWithNames);
    } catch (err) {
      logger.error("Failed to load saved playlists:", err);
      setError(err instanceof Error ? err.message : "Failed to load playlists");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDevices() {
    try {
      setIsLoadingDevices(true);
      const profiles = await getDeviceProfiles();
      setDeviceProfiles(profiles);
    } catch (err) {
      logger.error("Failed to load device profiles:", err);
    } finally {
      setIsLoadingDevices(false);
    }
  }


  async function handleAddDevice(
    preset: "generic" | "walkman" | "ipod" = "generic"
  ) {
    try {
      const result = await pickDeviceRootHandle();
      const handle = await getDirectoryHandle(result.handleId);
      if (!handle) {
        throw new Error("Device folder handle not found");
      }
      const detectedPreset = await detectDevicePreset(handle);
      if (preset === "ipod" && detectedPreset !== "ipod") {
        throw new Error("Selected folder does not look like an iPod root");
      }
      const effectivePreset = detectedPreset === "ipod" ? "ipod" : preset;
      const useWalkmanDefaults =
        effectivePreset === "walkman" || detectedPreset === "walkman";
      const profile = await saveDeviceProfile({
        label: result.name,
        handleRef: result.handleId,
        deviceType: effectivePreset === "ipod" ? "ipod" : effectivePreset,
        playlistFormat: "m3u",
        playlistFolder:
          effectivePreset === "ipod" ? "" : useWalkmanDefaults ? "MUSIC" : "PLAYLISTS",
        pathStrategy:
          effectivePreset === "ipod" ? "relative-to-library-root" : "relative-to-playlist",
      });
      await loadDevices();
      setSelectedDeviceId(profile.id);
      setSelectionIsUserInitiated(true);
    } catch (err) {
      logger.error("Failed to add device:", err);
      setError(err instanceof Error ? err.message : "Failed to add device");
    }
  }

  async function handleAddCompanionDevice() {
    try {
      const profile = await saveDeviceProfile({
        label: "Zune (Companion)",
        handleRef: undefined,
        deviceType: "zune",
        playlistFormat: "m3u",
        playlistFolder: "playlists",
        pathStrategy: "relative-to-playlist",
      });
      await loadDevices();
      setSelectedDeviceId(profile.id);
      setSelectionIsUserInitiated(true);
    } catch (err) {
      logger.error("Failed to add companion device:", err);
      setError(err instanceof Error ? err.message : "Failed to add companion device");
    }
  }

  async function handleAddJellyfinProfile() {
    try {
      const profile = await saveDeviceProfile({
        label: "Jellyfin (Docker)",
        handleRef: undefined,
        deviceType: "jellyfin",
        playlistFormat: "m3u",
        playlistFolder: "",
        pathStrategy: "absolute",
        absolutePathPrefix: undefined,
        containerLibraryPrefix: "",
        jellyfinExportMode: "download",
      });
      await loadDevices();
      setSelectedDeviceId(profile.id);
      setSelectionIsUserInitiated(true);
    } catch (err) {
      logger.error("Failed to add Jellyfin profile:", err);
      setError(err instanceof Error ? err.message : "Failed to add Jellyfin profile");
    }
  }

  /** Detect device: pick folder, auto-detect preset (walkman/ipod/generic), save and select. */
  async function handleDetectDevice() {
    try {
      setError(null);
      const result = await pickDeviceRootHandle();
      const handle = await getDirectoryHandle(result.handleId);
      if (!handle) {
        throw new Error("Device folder handle not found");
      }
      const detectedPreset = await detectDevicePreset(handle);
      const useWalkmanDefaults =
        detectedPreset === "walkman";
      const profile = await saveDeviceProfile({
        label: result.name,
        handleRef: result.handleId,
        deviceType: detectedPreset === "ipod" ? "ipod" : detectedPreset,
        playlistFormat: "m3u",
        playlistFolder:
          detectedPreset === "ipod" ? "" : useWalkmanDefaults ? "MUSIC" : "PLAYLISTS",
        pathStrategy:
          detectedPreset === "ipod" ? "relative-to-library-root" : "relative-to-playlist",
      });
      await loadDevices();
      setSelectedDeviceId(profile.id);
      setSelectionIsUserInitiated(true);
    } catch (err) {
      logger.error("Failed to detect device:", err);
      setError(err instanceof Error ? err.message : "Failed to detect device");
    }
  }

  async function handleReconnectDevice(profile: DeviceProfileRecord) {
    try {
      const result = await pickDeviceRootHandle();
      const updated = await saveDeviceProfile({
        id: profile.id,
        label: result.name,
        handleRef: result.handleId,
        playlistFormat: profile.playlistFormat,
        playlistFolder: profile.playlistFolder,
        pathStrategy: profile.pathStrategy,
        absolutePathPrefix: profile.absolutePathPrefix,
        lastSyncAt: profile.lastSyncAt,
      });
      await loadDevices();
      setSelectedDeviceId(updated.id);
      setSelectionIsUserInitiated(true);
    } catch (err) {
      logger.error("Failed to reconnect device:", err);
      setError(err instanceof Error ? err.message : "Failed to reconnect device");
    }
  }

  async function handleDeleteDevice(profile: DeviceProfileRecord) {
    try {
      const confirmed = window.confirm(`Remove device "${profile.label}"?`);
      if (!confirmed) return;
      await deleteDeviceProfileWithManifests(profile.id);
      await loadDevices();
      if (selectedDeviceId === profile.id) {
        setSelectedDeviceId(null);
      }
    } catch (err) {
      logger.error("Failed to delete device:", err);
      setError(err instanceof Error ? err.message : "Failed to delete device");
    }
  }

  const selectedDeviceProfile = useMemo(
    () => deviceProfiles.find((profile) => profile.id === selectedDeviceId) || null,
    [deviceProfiles, selectedDeviceId]
  );

  function getDeviceIcon(profile: DeviceProfileRecord) {
    if (profile.deviceType === "zune") return Cpu;
    if (profile.deviceType === "jellyfin") return JellyfinIcon;
    if (profile.deviceType === "walkman") return WalkmanIcon;
    if (profile.deviceType === "ipod") return Smartphone;
    const name = (profile.label || "").toLowerCase();
    if (name.includes("walkman") || name.includes("sony")) return WalkmanIcon;
    if (name.includes("ipod") || name.includes("ipo")) return Smartphone;
    return HardDrive;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm flex items-center justify-center">
          <Usb className="size-5 text-white" />
        </div>
        <div>
          <h1 className="text-app-primary text-2xl font-semibold">Device Sync</h1>
          <p className="text-app-secondary text-sm">
            Detect USB devices, then sync saved playlists.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 text-sm font-medium mb-1">Error</p>
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Single full-width container: Quick Add Device | Detected Device */}
      <Card padding="md">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Quick Add Device */}
          <div className="space-y-3">
            <h2 className="text-app-primary font-medium uppercase tracking-wider text-sm">
              Quick Add Device
            </h2>
            {isLoadingDevices ? (
              <div className="text-center py-6">
                <Loader2 className="size-6 text-accent-primary animate-spin mx-auto mb-2" />
                <p className="text-app-secondary text-sm">Loading devices...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleDetectDevice}
                  className="text-left rounded-sm border border-app-border bg-app-surface p-3 transition-colors flex items-center gap-3 hover:border-accent-primary/50"
                >
                  <div className="size-10 rounded-sm bg-accent-primary/20 flex items-center justify-center shrink-0">
                    <HardDrive className="size-5 text-accent-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-app-primary font-semibold text-sm">
                      Detect Device
                    </div>
                    <div className="text-app-tertiary text-xs">
                      Pick a folder and auto-detect Walkman, iPod, or generic USB device.
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddDevice("walkman")}
                  className={`text-left rounded-sm border p-3 transition-colors flex items-center gap-3 ${
                    selectedDeviceProfile?.deviceType === "walkman"
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-app-border bg-app-surface hover:border-accent-primary/50"
                  }`}
                >
                  <div className="size-10 rounded-sm bg-accent-primary/20 flex items-center justify-center shrink-0 text-accent-primary">
                    <WalkmanIcon className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-app-primary font-semibold text-sm">
                      Add Walkman Preset
                    </div>
                    <div className="text-app-tertiary text-xs">
                      Sets playlists to <span className="font-mono">MUSIC</span> and relative paths.
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddDevice("ipod")}
                  className={`text-left rounded-sm border p-3 transition-colors flex items-center gap-3 ${
                    selectedDeviceProfile?.deviceType === "ipod"
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-app-border bg-app-surface hover:border-accent-primary/50"
                  }`}
                >
                  <div className="size-10 rounded-sm bg-accent-primary/20 flex items-center justify-center shrink-0">
                    <Smartphone className="size-5 text-accent-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-app-primary font-semibold text-sm">Add iPod Preset</div>
                    <div className="text-app-tertiary text-xs">
                      Uses iTunesDB sync with in-browser setup.
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleAddJellyfinProfile}
                  className={`text-left rounded-sm border p-3 transition-colors flex items-center gap-3 ${
                    selectedDeviceProfile?.deviceType === "jellyfin"
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-app-border bg-app-surface hover:border-accent-primary/50"
                  }`}
                >
                  <div className="size-10 rounded-sm bg-accent-primary/20 flex items-center justify-center shrink-0">
                    <JellyfinIcon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-app-primary font-semibold text-sm">
                      Add Jellyfin Export
                    </div>
                    <div className="text-app-tertiary text-xs">
                      Export M3U playlists with container paths for Jellyfin.
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Right: Detected Device */}
          <div className="space-y-3">
            <h2 className="text-app-primary font-medium uppercase tracking-wider text-sm">
              Detected Device
            </h2>
            {isLoadingDevices ? (
              <div className="text-center py-6">
                <Loader2 className="size-6 text-accent-primary animate-spin mx-auto mb-2" />
                <p className="text-app-secondary text-sm">Loading...</p>
              </div>
            ) : deviceProfiles.length === 0 ? (
              <div className="text-app-secondary text-sm py-4">
                No devices saved yet. Use Quick Add Device to add one.
              </div>
            ) : selectedDeviceProfile ? (
              <div className="space-y-4">
                {deviceProfiles.length > 1 && (
                  <label className="block text-app-tertiary text-xs">
                    Device
                    <select
                      value={selectedDeviceId ?? ""}
                      onChange={(e) => {
                        setSelectedDeviceId(e.target.value);
                        setSelectionIsUserInitiated(true);
                      }}
                      className="mt-1.5 block w-full px-3 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary"
                    >
                      {deviceProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="rounded-sm border border-accent-primary bg-app-surface p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-sm bg-accent-primary/20 flex items-center justify-center shrink-0">
                      {(() => {
                        const Icon = getDeviceIcon(selectedDeviceProfile);
                        return <Icon className="size-5 text-accent-primary" />;
                      })()}
                    </div>
                    <div id="device-sync-title-slot" className="min-w-0 flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 className="size-4" />}
                      onClick={() => handleDeleteDevice(selectedDeviceProfile)}
                      className="shrink-0 text-app-tertiary hover:text-red-500"
                      aria-label="Remove device"
                    />
                  </div>
                  {(deviceStatuses[selectedDeviceProfile.id] === "needs_access" ||
                    deviceStatuses[selectedDeviceProfile.id] === "missing") && (
                    <div className="mt-3 pt-3 border-t border-app-border">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleReconnectDevice(selectedDeviceProfile)}
                      >
                        Reconnect
                      </Button>
                    </div>
                  )}
                  {selectedDeviceProfile.lastSyncAt && (
                    <div className="text-app-tertiary text-xs mt-2 pt-2 border-t border-app-border">
                      Last sync: {new Date(selectedDeviceProfile.lastSyncAt).toLocaleString()}
                    </div>
                  )}
                  <div id="device-sync-details-slot" className="space-y-4 mt-3 pt-3 border-t border-app-border" />
                </div>
              </div>
            ) : (
              <div className="text-app-secondary text-sm py-4">
                Select a device above to view details.
              </div>
            )}
          </div>
        </div>
      </Card>

      <p className="text-app-tertiary text-xs">
        Browsers require a click to grant folder access. Detect device will prompt for permission.
      </p>

      {/* Main: panel (with internal two-column layout and sidebar) */}
      <div className="min-h-[calc(100vh-12rem)]">
          {isLoading ? (
            <div className="bg-app-surface rounded-sm border border-app-border p-6 text-center py-6">
              <Loader2 className="size-6 text-accent-primary animate-spin mx-auto mb-2" />
              <p className="text-app-secondary text-sm">Loading playlists...</p>
            </div>
          ) : playlists.length === 0 ? (
            <div className="bg-app-surface rounded-sm border border-app-border p-6 text-center py-8">
              <Usb className="size-10 text-app-tertiary mx-auto mb-3" />
              <p className="text-app-secondary text-sm">
                Save a playlist first, then return here to sync it to a device.
              </p>
            </div>
          ) : selectedDeviceProfile ? (
            <DeviceSyncPanel
              playlists={playlists}
              deviceProfileOverride={selectedDeviceProfile}
              selectionIsFromUserAction={selectionIsUserInitiated}
              onDeviceProfileUpdated={loadDevices}
              showDeviceSelector={false}
              deviceDetailsSlotId="device-sync-details-slot"
              deviceTitleSlotId="device-sync-title-slot"
              deviceStatus={selectedDeviceProfile ? deviceStatuses[selectedDeviceProfile.id] : undefined}
            />
          ) : (
            <div className="bg-app-surface rounded-sm border border-app-border p-6">
              <p className="text-app-secondary text-sm">
                Select a device to begin syncing playlists.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
