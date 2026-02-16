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
import { AlertCircle, Cpu, HardDrive, Loader2, Music, Smartphone, Usb } from "lucide-react";
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
    if (profile.deviceType === "jellyfin") return Music;
    if (profile.deviceType === "walkman") return Music;
    if (profile.deviceType === "ipod") return Smartphone;
    const name = (profile.label || "").toLowerCase();
    if (name.includes("walkman") || name.includes("sony")) return Music;
    if (name.includes("ipod") || name.includes("ipo")) return Smartphone;
    return HardDrive;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-app-surface rounded-sm border border-app-border p-6">
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

      <div className="bg-app-surface rounded-sm border border-app-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-app-primary font-medium uppercase tracking-wider text-sm">
            Detected Devices
          </div>
          <div className="flex items-center gap-2">
            {isCheckingDevices && (
              <span className="text-xs text-app-tertiary">Checking devices...</span>
            )}
            <button
              type="button"
              onClick={() => handleAddDevice("generic")}
              className="px-3 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
            >
              Detect Device
            </button>
            <button
              type="button"
              onClick={() => handleAddDevice("ipod")}
              className="px-3 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
            >
              Detect iPod
            </button>
            <button
              type="button"
              onClick={() => handleAddDevice("walkman")}
              className="px-3 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
            >
              Detect Walkman
            </button>
            <button
              type="button"
              onClick={handleAddCompanionDevice}
              className="px-3 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
            >
              Add Companion Device
            </button>
            <button
              type="button"
              onClick={handleAddJellyfinProfile}
              className="px-3 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm border border-app-border"
            >
              Add Jellyfin Export
            </button>
          </div>
        </div>
        <p className="text-app-tertiary text-xs">
          Browsers require a click to grant folder access. Detect device will prompt for permission.
        </p>

        {isLoadingDevices ? (
          <div className="text-center py-6">
            <Loader2 className="size-6 text-accent-primary animate-spin mx-auto mb-2" />
            <p className="text-app-secondary text-sm">Loading devices...</p>
          </div>
        ) : deviceProfiles.length === 0 ? (
          <div className="space-y-3">
            <div className="text-app-secondary text-sm">
              No devices saved yet. Click “Detect Device” to select a USB device folder.
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleAddDevice("walkman")}
                className="flex-1 text-left rounded-sm border border-app-border bg-app-surface hover:border-accent-primary/50 p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 bg-app-hover rounded-sm flex items-center justify-center">
                    <Music className="size-4 text-accent-primary" />
                  </div>
                  <div>
                    <div className="text-app-primary font-semibold text-sm">
                      Add Walkman Preset
                    </div>
                    <div className="text-app-tertiary text-xs">
                      Sets playlists to <span className="font-mono">MUSIC</span> and relative paths.
                    </div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleAddDevice("ipod")}
                className="flex-1 text-left rounded-sm border border-app-border bg-app-surface hover:border-accent-primary/50 p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 bg-app-hover rounded-sm flex items-center justify-center">
                    <Music className="size-4 text-accent-primary" />
                  </div>
                  <div>
                    <div className="text-app-primary font-semibold text-sm">Add iPod Preset</div>
                    <div className="text-app-tertiary text-xs">
                      Uses iTunesDB sync with in-browser setup.
                    </div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleAddJellyfinProfile}
                className="flex-1 text-left rounded-sm border border-app-border bg-app-surface hover:border-accent-primary/50 p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 bg-app-hover rounded-sm flex items-center justify-center">
                    <Music className="size-4 text-accent-primary" />
                  </div>
                  <div>
                    <div className="text-app-primary font-semibold text-sm">
                      Add Jellyfin Export
                    </div>
                    <div className="text-app-tertiary text-xs">
                      Export M3U playlists with container paths for Jellyfin.
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleAddDevice("walkman")}
                className="flex-1 text-left rounded-sm border border-dashed border-app-border bg-app-surface hover:border-accent-primary/50 p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 bg-app-hover rounded-sm flex items-center justify-center">
                    <Music className="size-4 text-accent-primary" />
                  </div>
                  <div>
                    <div className="text-app-primary font-semibold text-sm">
                      Add Walkman Preset
                    </div>
                    <div className="text-app-tertiary text-xs">
                      Optimized for Sony Walkman playlists.
                    </div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleAddDevice("ipod")}
                className="flex-1 text-left rounded-sm border border-dashed border-app-border bg-app-surface hover:border-accent-primary/50 p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 bg-app-hover rounded-sm flex items-center justify-center">
                    <Music className="size-4 text-accent-primary" />
                  </div>
                  <div>
                    <div className="text-app-primary font-semibold text-sm">Add iPod Preset</div>
                    <div className="text-app-tertiary text-xs">
                      iTunesDB sync with in-browser setup.
                    </div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleAddJellyfinProfile}
                className="flex-1 text-left rounded-sm border border-dashed border-app-border bg-app-surface hover:border-accent-primary/50 p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="size-9 bg-app-hover rounded-sm flex items-center justify-center">
                    <Music className="size-4 text-accent-primary" />
                  </div>
                  <div>
                    <div className="text-app-primary font-semibold text-sm">
                      Add Jellyfin Export
                    </div>
                    <div className="text-app-tertiary text-xs">
                      Export M3U playlists with container paths.
                    </div>
                  </div>
                </div>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deviceProfiles.map((profile) => {
              const Icon = getDeviceIcon(profile);
              const isSelected = selectedDeviceId === profile.id;
              const status = deviceStatuses[profile.id] || "checking";
              return (
                <div
                  key={profile.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedDeviceId(profile.id);
                    setSelectionIsUserInitiated(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedDeviceId(profile.id);
                      setSelectionIsUserInitiated(true);
                    }
                  }}
                  className={`text-left rounded-sm border p-4 transition-colors cursor-pointer ${
                    isSelected
                      ? "border-accent-primary bg-accent-primary/5"
                      : "border-app-border bg-app-surface hover:border-accent-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-app-hover rounded-sm flex items-center justify-center">
                      <Icon className="size-5 text-accent-primary" />
                    </div>
                    <div>
                      <div className="text-app-primary font-semibold truncate">
                        {profile.label}
                      </div>
                      <div className="text-app-tertiary text-xs">
                        {profile.playlistFolder || "Device root"}
                      </div>
                      <div className="text-app-tertiary text-xs">
                        Status:{" "}
                        {status === "available"
                          ? "Available"
                          : status === "companion"
                          ? "Companion"
                          : status === "export"
                          ? "Export"
                          : status === "needs_access"
                          ? "Needs access"
                          : status === "missing"
                          ? "Missing"
                          : "Checking"}
                      </div>
                      {profile.lastSyncAt && (
                        <div className="text-app-tertiary text-xs">
                          Last sync: {new Date(profile.lastSyncAt).toLocaleString()}
                        </div>
                      )}
                      {(status === "needs_access" || status === "missing") && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleReconnectDevice(profile);
                          }}
                          className="mt-2 text-xs text-accent-primary hover:text-accent-hover"
                        >
                          Reconnect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteDevice(profile);
                        }}
                        className="mt-2 text-xs text-red-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      <div className="bg-app-surface rounded-sm border border-app-border p-6">
        {isLoading ? (
          <div className="text-center py-6">
            <Loader2 className="size-6 text-accent-primary animate-spin mx-auto mb-2" />
            <p className="text-app-secondary text-sm">Loading playlists...</p>
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-8">
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
          />
        ) : (
          <div className="text-app-secondary text-sm">
            Select a device to begin syncing playlists.
          </div>
        )}
      </div>
    </div>
  );
}
