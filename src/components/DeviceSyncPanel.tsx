/**
 * DeviceSyncPanel Component
 *
 * Standalone UI for syncing playlists to USB devices. For iPod, classifies tracks as
 * on-device vs missing (using saved mappings and tag index), and shows a dialog when
 * any are missing with options: Sync missing, Playlist only (reference existing only), or Cancel.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GeneratedPlaylist } from "@/features/playlists";
import {
  downloadFile,
  exportM3U,
  getTrackPath,
  type TrackLookup,
  type PlaylistLocationConfig,
  type PathStrategy,
} from "@/features/playlists/export";
import {
  getAllCollections,
  getAllTracks,
  getCurrentCollectionId,
  getFileIndexEntries,
  getFileIndexEntry,
  getLibraryRoot,
  relinkCollectionHandle,
} from "@/db/storage";
import { db, getCompositeId } from "@/db/schema";
import type { DeviceProfileRecord, FileIndexRecord } from "@/db/schema";
import { supportsFileSystemAccess, supportsWebUSB } from "@/lib/feature-detection";
import {
  getDeviceProfiles,
  getDeviceFileIndexMap,
  getDeviceTrackMappings,
  saveDeviceFileIndexEntries,
  saveDeviceProfile,
} from "@/features/devices/device-storage";
import {
  buildSyntheticPlaylist,
  getPresetCapabilities,
  getSyncTargetsFromPlaylists,
} from "@/features/devices/sync-targets";
import {
  applyDevicePathMap,
  checkDeviceWriteAccess,
  pickDeviceRootHandle,
  syncPlaylistsToDevice,
  validatePlaylistOnDevice,
  type DevicePlaylistFormat,
  type PlaylistPathValidationResult,
} from "@/features/devices/device-sync";
import { detectDevicePreset } from "@/features/devices/device-detect";
import type { DeviceScanEntry } from "@/features/devices/device-scan";
import {
  scanDeviceForPaths,
  type DeviceScanProgress,
  buildDeviceMatchCandidates,
  isTrackOnDeviceUsb,
} from "@/features/devices/device-scan";
import {
  getDeviceViaWebUSB,
  getModelInfo,
  isSysInfoSetup,
  listKnownIpodDevices,
  loadIpodDeviceInfo,
  loadIpodTracks,
  requiresEncryption,
  startIpodConnectionMonitor,
  verifyIpodStructure,
  writeSysInfoSetup,
} from "@/features/devices/ipod";
import {
  getDirectoryHandle,
  storeDirectoryHandle,
  verifyDeviceConnection,
} from "@/lib/library-selection-fs-api";
import { requestLibraryPermission } from "@/lib/library-selection-permissions";
import { getSavedLibraryRoot } from "@/lib/library-selection-root";
import type { LibraryRoot } from "@/lib/library-selection";
import { logger } from "@/lib/logger";
import { formatPlaylistFilenameStem } from "@/lib/playlist-filename";
import { Modal } from "@/components/Modal";
import { CollectionSyncBrowser, type CollectionTrackWithStatus } from "@/components/CollectionSyncBrowser";
import { DeviceSyncSidebar } from "@/components/DeviceSyncSidebar";
import { JellyfinIcon, WalkmanIcon } from "@/components/DevicePresetIcons";
import { useAudioPreviewState } from "@/hooks/useAudioPreviewState";
import { Button, Card, Input, Tabs } from "@/design-system/components";
import {
  Usb,
  HardDrive,
  Loader2,
  Save,
  Music,
  Play,
  Check,
  Circle,
  User,
  ListMusic,
  Smartphone,
  X,
  Edit,
} from "lucide-react";
import { scanLibraryWithPersistence } from "@/features/library/scanning-persist";
import { findFileIndexByGlobalTrackId } from "@/features/library/track-identity";

interface PlaylistItem {
  playlist: GeneratedPlaylist;
  libraryRootId?: string;
  collectionName?: string;
}

interface DeviceSyncPanelProps {
  playlist?: GeneratedPlaylist;
  libraryRootId?: string;
  playlists?: PlaylistItem[];
  deviceProfileOverride?: DeviceProfileRecord | null;
  /** When false, skip iPod setup/parse (avoids WASM noise on auto-select). Default true. */
  selectionIsFromUserAction?: boolean;
  onDeviceProfileUpdated?: (profile: DeviceProfileRecord) => void;
  showDeviceSelector?: boolean;
  /** When set, portal the Device Name edit and iPod Detection & Setup UI into this DOM element id (e.g. for the device-sync page Detected Device column). */
  deviceDetailsSlotId?: string;
  /** When set with deviceDetailsSlotId, portal the device title (editable name + status) into this DOM element id so it appears in the card header. */
  deviceTitleSlotId?: string;
  /** Status of the selected device for the title slot (e.g. "available", "missing"). Pass from page when using deviceTitleSlotId. */
  deviceStatus?: string;
}

export function DeviceSyncPanel({
  playlist,
  libraryRootId,
  playlists,
  deviceProfileOverride,
  selectionIsFromUserAction = true,
  onDeviceProfileUpdated,
  showDeviceSelector = true,
  deviceDetailsSlotId,
  deviceTitleSlotId,
  deviceStatus,
}: DeviceSyncPanelProps) {
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfileRecord[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("new");
  const [deviceLabel, setDeviceLabel] = useState<string>("");
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const [editingDeviceName, setEditingDeviceName] = useState<string>("");
  const [deviceHandleRef, setDeviceHandleRef] = useState<string | null>(null);
  const [devicePlaylistFolder, setDevicePlaylistFolder] = useState<string>("PLAYLISTS");
  const [devicePlaylistFormat, setDevicePlaylistFormat] = useState<DevicePlaylistFormat>("m3u");
  const [devicePathStrategy, setDevicePathStrategy] = useState<PathStrategy>("relative-to-playlist");
  const [deviceAbsolutePrefix, setDeviceAbsolutePrefix] = useState<string>("");
  const [devicePreset, setDevicePreset] = useState<
    "walkman" | "generic" | "zune" | "ipod" | "jellyfin"
  >("walkman");
  const [jellyfinContainerPrefix, setJellyfinContainerPrefix] = useState<string>("");
  const [jellyfinExportMode, setJellyfinExportMode] = useState<
    "download" | "library-root"
  >("download");
  const [useCompanionApp, setUseCompanionApp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [syncPhase, setSyncPhase] = useState<"idle" | "preparing" | "writing">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [devicePathDetectionEnabled, setDevicePathDetectionEnabled] = useState(true);
  const [onlyIncludeMatchedPaths, setOnlyIncludeMatchedPaths] = useState(false);
  const [deviceScanRoots, setDeviceScanRoots] = useState<string>("MUSIC");
  const [deviceScanStatus, setDeviceScanStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [deviceScanProgress, setDeviceScanProgress] = useState<DeviceScanProgress>({
    scanned: 0,
    matched: 0,
    hashed: 0,
  });
  const [devicePathMap, setDevicePathMap] = useState<Map<string, string>>(new Map());
  const [deviceEntries, setDeviceEntries] = useState<DeviceScanEntry[]>([]);
  const [ipodSetupStatus, setIpodSetupStatus] = useState<
    "idle" | "checking" | "ready" | "needs_setup" | "error"
  >("idle");
  const [ipodSetupMessage, setIpodSetupMessage] = useState<string | null>(null);
  const [ipodUsbInfo, setIpodUsbInfo] = useState<{
    productId?: number;
    serialNumber?: string;
    productName?: string;
    manufacturerName?: string;
  } | null>(null);
  const [ipodDeviceInfo, setIpodDeviceInfo] = useState<{
    model_name?: string;
    generation_name?: string;
    checksum_type?: number;
    capacity_gb?: number;
  } | null>(null);
  const [ipodSetupSkipped, setIpodSetupSkipped] = useState(false);
  const [ipodMonitor, setIpodMonitor] = useState<{
    suspend: () => void;
    resume: () => void;
    stop: () => void;
  } | null>(null);
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [ipodKnownDevices, setIpodKnownDevices] = useState<
    Array<{
      productId?: number;
      serialNumber?: string;
      productName?: string;
      manufacturerName?: string;
    }>
  >([]);
  const [devicePreviewPaths, setDevicePreviewPaths] = useState<{
    resolved: string[];
    missing: string[];
  }>({ resolved: [], missing: [] });
  const [missingMetadataCount, setMissingMetadataCount] = useState<number>(0);
  const [showRescanPrompt, setShowRescanPrompt] = useState(false);
  const [rescanStatus, setRescanStatus] = useState<
    "idle" | "requesting" | "scanning" | "done" | "error"
  >("idle");
  const [rescanProgress, setRescanProgress] = useState<{ found: number; scanned: number }>({
    found: 0,
    scanned: 0,
  });
  const [rescanError, setRescanError] = useState<string | null>(null);
  const [deviceMatchStats, setDeviceMatchStats] = useState<{
    matched: number;
    total: number;
    ratio: number;
  } | null>(null);
  const [keyCoverageLog, setKeyCoverageLog] = useState<{
    tracksWithMetadata: number;
    totalTracks: number;
    keyMapSize: number;
    sampleLibraryKeys: string[];
    scanMapSize: number;
    scanEntriesCount: number;
    scanned: number;
    matched: number;
    hashed: number;
    sampleDevicePaths: string[];
  } | null>(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [syncQueueStatus, setSyncQueueStatus] = useState<{
    currentIndex: number;
    total: number;
    currentTitle?: string;
  }>({ currentIndex: 0, total: 0 });
  const [isCheckingWriteAccess, setIsCheckingWriteAccess] = useState(false);
  const [writeAccessStatus, setWriteAccessStatus] = useState<
    "unknown" | "ok" | "read-only" | "error"
  >("unknown");
  const [writeAccessMessage, setWriteAccessMessage] = useState<string | null>(null);
  const [pathValidationStatus, setPathValidationStatus] = useState<
    "idle" | "validating" | "done" | "error"
  >("idle");
  const [pathValidationResult, setPathValidationResult] =
    useState<PlaylistPathValidationResult | null>(null);
  const [pathValidationPlaylistTitle, setPathValidationPlaylistTitle] =
    useState<string | null>(null);
  const [pathValidationError, setPathValidationError] = useState<string | null>(null);
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [collectionTracks, setCollectionTracks] = useState<
    Array<{
      trackFileId: string;
      title: string;
      artist?: string;
      album?: string;
      addedAt?: number;
      fileName?: string;
      fileSize?: number;
      trackNo?: number;
      genre?: string;
      durationSeconds?: number;
      bpm?: number;
    }>
  >([]);
  const [collectionTracksStatus, setCollectionTracksStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [collectionTracksError, setCollectionTracksError] = useState<string | null>(null);
  const [collectionTrackSearch, setCollectionTrackSearch] = useState("");
  const [selectedCollectionTrackIds, setSelectedCollectionTrackIds] = useState<Set<string>>(
    new Set()
  );
  const [collectionTracksCurrentPage, setCollectionTracksCurrentPage] = useState(1);
  const [collectionTracksPageSize, setCollectionTracksPageSize] = useState(50);
  const [mirrorDeleteFromDevice, setMirrorDeleteFromDevice] = useState(false);
  const [overwriteExistingPlaylistOnIpod, setOverwriteExistingPlaylistOnIpod] = useState(false);
  const [collectionContentTab, setCollectionContentTab] = useState<
    "tracks" | "albums" | "artists"
  >("tracks");
  const [artworkUrlMap, setArtworkUrlMap] = useState<Map<string, string>>(new Map());
  const artworkUrlMapRef = useRef<Map<string, string>>(new Map());
  const [ipodTrackIndexStatus, setIpodTrackIndexStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [ipodTrackIndexError, setIpodTrackIndexError] = useState<string | null>(null);
  const [ipodTrackIndex, setIpodTrackIndex] = useState<{
    tagSize: Set<string>;
    tagOnly: Set<string>;
    usedBytes?: number;
  }>({ tagSize: new Set(), tagOnly: new Set() });
  const [showMissingTracksDialog, setShowMissingTracksDialog] = useState(false);
  const [missingTrackCount, setMissingTrackCount] = useState(0);
  const [pendingIpodSync, setPendingIpodSync] = useState<{
    profile: DeviceProfileRecord;
    scanTargets: Array<{
      playlist: GeneratedPlaylist;
      trackLookups: TrackLookup[];
      libraryRootId?: string;
    }>;
  } | null>(null);

  const isIpodPreset = devicePreset === "ipod";
  const isJellyfinPreset = devicePreset === "jellyfin";
  const isWalkmanPreset = devicePreset === "walkman";
  const isGenericPreset = devicePreset === "generic";
  const isZunePreset = devicePreset === "zune";
  const presetCaps = getPresetCapabilities(devicePreset);
  const hasCollectionSync = presetCaps.hasCollectionSync;
  const hasCollectionExport = presetCaps.hasCollectionExport;
  const normalizeTag = useCallback((value?: string | null) => {
    return String(value ?? "").trim().toLowerCase();
  }, []);

  const buildTagKey = useCallback(
    (input: {
      title?: string | null;
      artist?: string | null;
      album?: string | null;
      trackNo?: number | null;
    }): string => {
      return [
        normalizeTag(input.artist),
        normalizeTag(input.title),
        normalizeTag(input.album),
        input.trackNo ?? 0,
      ].join("|");
    },
    [normalizeTag]
  );

  const buildTagSizeKey = useCallback(
    (input: {
      title?: string | null;
      artist?: string | null;
      album?: string | null;
      trackNo?: number | null;
      size?: number | null;
    }): string => {
      return `${buildTagKey(input)}|${input.size ?? 0}`;
    },
    [buildTagKey]
  );

  function isTrackOnDevice(track: {
    title?: string;
    artist?: string;
    album?: string;
    addedAt?: number;
    fileName?: string;
    trackFileId: string;
    fileSize?: number;
    trackNo?: number;
  }): boolean | null {
    if (ipodTrackIndexStatus !== "ready") {
      return null;
    }
    const tagOnly = buildTagKey({
      title: track.title,
      artist: track.artist,
      album: track.album,
      trackNo: track.trackNo ?? 0,
    });
    if (typeof track.fileSize === "number") {
      const tagSize = buildTagSizeKey({
        title: track.title,
        artist: track.artist,
        album: track.album,
        trackNo: track.trackNo ?? 0,
        size: track.fileSize,
      });
      if (ipodTrackIndex.tagSize.has(tagSize)) {
        return true;
      }
    }
    if (ipodTrackIndex.tagOnly.has(tagOnly)) {
      return true;
    }
    return false;
  }

  async function handleMissingTracksDialogChoice(
    choice: "sync" | "playlist-only" | "cancel"
  ) {
    const pending = pendingIpodSync;
    setShowMissingTracksDialog(false);
    if (!pending) return;
    if (choice === "cancel") {
      setPendingIpodSync(null);
      return;
    }
    const onlyRef = choice === "playlist-only";
    setIsSyncing(true);
    setSyncPhase("writing");
    setSyncError(null);
    setSyncSuccess(null);
    try {
      await syncPlaylistsToDevice({
        deviceProfile: pending.profile,
        targets: pending.scanTargets,
        onlyReferenceExistingTracks: onlyRef,
        overwriteExistingPlaylist: overwriteExistingPlaylistOnIpod,
      });
      await refreshDeviceProfiles();
      setSelectedDeviceId(pending.profile.id);
      setSyncSuccess(
        onlyRef
          ? "Playlist updated with existing tracks only."
          : "Synced playlist successfully."
      );
      onDeviceProfileUpdated?.(pending.profile);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
      setSyncPhase("idle");
      setPendingIpodSync(null);
    }
  }

  useEffect(() => {
    if (deviceProfileOverride) return;
    async function loadDevices() {
      const profiles = await getDeviceProfiles();
      setDeviceProfiles(profiles);
    }
    loadDevices();
  }, [deviceProfileOverride]);

  useEffect(() => {
    if (!["ipod", "walkman", "generic", "zune", "jellyfin"].includes(devicePreset))
      return;
    let cancelled = false;
    async function loadCollections() {
      try {
        const results = await getAllCollections();
        if (cancelled) return;
        setCollections(
          results.map((collection) => ({
            id: collection.id,
            name: collection.name || collection.id,
          }))
        );
        if (!selectedCollectionId && results.length > 0) {
          setSelectedCollectionId(results[0].id);
        }
      } catch (error) {
        logger.warn("Failed to load collections", error);
      }
    }
    loadCollections();
    return () => {
      cancelled = true;
    };
  }, [devicePreset, selectedCollectionId]);

  useEffect(() => {
    if (deviceProfileOverride) {
      const preset = (deviceProfileOverride.deviceType ||
        "generic") as typeof devicePreset;
      setSelectedDeviceId(deviceProfileOverride.id);
      setDeviceLabel(deviceProfileOverride.label);
      setDeviceHandleRef(deviceProfileOverride.handleRef ?? null);
      setDevicePreset(preset);
      if (preset === "jellyfin") {
        setIsDeviceConnected(true);
      } else if (preset === "walkman" || preset === "generic") {
        setIsDeviceConnected(false);
      }
      const useCompanion = !deviceProfileOverride.handleRef && preset !== "ipod" && preset !== "jellyfin";
      setUseCompanionApp(useCompanion);
      if (useCompanion) setIsDeviceConnected(true);
      setDevicePlaylistFolder(deviceProfileOverride.playlistFolder);
      setDevicePlaylistFormat(deviceProfileOverride.playlistFormat);
      setDevicePathStrategy(deviceProfileOverride.pathStrategy);
      setDeviceAbsolutePrefix(deviceProfileOverride.absolutePathPrefix || "");
      setJellyfinContainerPrefix(
        deviceProfileOverride.containerLibraryPrefix ||
          deviceProfileOverride.absolutePathPrefix ||
          ""
      );
      setJellyfinExportMode(deviceProfileOverride.jellyfinExportMode || "download");
      setDevicePathDetectionEnabled(preset !== "ipod" && preset !== "jellyfin");
      setDevicePathMap(new Map());
      setDeviceScanStatus("idle");
      setDeviceScanProgress({ scanned: 0, matched: 0, hashed: 0 });
      return;
    }

    if (selectedDeviceId === "new") {
      setDeviceHandleRef(null);
      setIsDeviceConnected(false);
      setUseCompanionApp(false);
      setDevicePathMap(new Map());
      setDeviceScanStatus("idle");
      setDeviceScanProgress({ scanned: 0, matched: 0, hashed: 0 });
      return;
    }
    const selected = deviceProfiles.find((profile) => profile.id === selectedDeviceId);
    if (selected) {
      const preset = (selected.deviceType || "generic") as typeof devicePreset;
      setDeviceLabel(selected.label);
      setDeviceHandleRef(selected.handleRef ?? null);
      setDevicePreset(preset);
      if (preset === "jellyfin") {
        setIsDeviceConnected(true);
      }
      const useCompanion = !selected.handleRef && preset !== "ipod" && preset !== "jellyfin";
      setUseCompanionApp(useCompanion);
      if (useCompanion) setIsDeviceConnected(true);
      setDevicePlaylistFolder(selected.playlistFolder);
      setDevicePlaylistFormat(selected.playlistFormat);
      setDevicePathStrategy(selected.pathStrategy);
      setDeviceAbsolutePrefix(selected.absolutePathPrefix || "");
      setJellyfinContainerPrefix(
        selected.containerLibraryPrefix || selected.absolutePathPrefix || ""
      );
      setJellyfinExportMode(selected.jellyfinExportMode || "download");
      setDevicePathDetectionEnabled(preset !== "ipod" && preset !== "jellyfin");
      setDevicePathMap(new Map());
      setDeviceScanStatus("idle");
      setDeviceScanProgress({ scanned: 0, matched: 0, hashed: 0 });
      if (preset === "walkman" || preset === "generic") {
        setIsDeviceConnected(false);
      }
    }
  }, [deviceProfiles, selectedDeviceId, deviceProfileOverride]);

  useEffect(() => {
    if (selectedDeviceId !== "new") return;
    if (devicePreset === "walkman") {
      setDevicePlaylistFormat("m3u");
      setDevicePlaylistFolder("MUSIC");
      setDevicePathStrategy("relative-to-playlist");
      setDeviceScanRoots("MUSIC");
      setUseCompanionApp(false);
      setDevicePathDetectionEnabled(true);
    } else if (devicePreset === "generic") {
      setDevicePlaylistFormat("m3u");
      setDevicePlaylistFolder("playlists");
      setDevicePathStrategy("relative-to-playlist");
      setDeviceScanRoots("MUSIC,MP3");
      setUseCompanionApp(false);
      setDevicePathDetectionEnabled(true);
    } else if (devicePreset === "ipod") {
      setDevicePlaylistFormat("m3u");
      setDevicePlaylistFolder("");
      setDevicePathStrategy("relative-to-library-root");
      setDeviceScanRoots("iPod_Control/Music");
      setUseCompanionApp(false);
      setDevicePathDetectionEnabled(false);
    } else if (devicePreset === "jellyfin") {
      setDevicePlaylistFormat("m3u");
      setDevicePlaylistFolder("");
      setDevicePathStrategy("relative-to-library-root");
      setDeviceScanRoots("");
      setUseCompanionApp(false);
      setDevicePathDetectionEnabled(false);
      setJellyfinExportMode("download");
      setJellyfinContainerPrefix("");
    } else {
      setDevicePlaylistFormat("m3u");
      setDevicePlaylistFolder("playlists");
      setDevicePathStrategy("relative-to-playlist");
      setDeviceScanRoots("MUSIC,MP3");
      setUseCompanionApp(true);
      setDevicePathDetectionEnabled(true);
    }
    setIpodSetupStatus("idle");
    setIpodSetupMessage(null);
    setIpodUsbInfo(null);
  }, [devicePreset, selectedDeviceId]);

  useEffect(() => {
    if (selectedDeviceId === "new") return;
    if (devicePreset === "ipod" || devicePreset === "jellyfin") return;
    let cancelled = false;
    async function loadDeviceCache() {
      try {
        const cached = await getDeviceFileIndexMap(selectedDeviceId);
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const entry of cached.values()) {
          map.set(entry.matchKey, entry.relativePath);
        }
        if (map.size > 0) {
          setDevicePathMap(map);
          setDeviceScanStatus("done");
        }
      } catch (error) {
        logger.warn("Failed to load device cache", error);
      }
    }
    loadDeviceCache();
    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId, devicePreset]);

  useEffect(() => {
    if (!deviceHandleRef) return;
    if (devicePreset !== "ipod") return;
    if (selectionIsFromUserAction === false) return;
    checkIpodSetup(deviceHandleRef);
  }, [deviceHandleRef, devicePreset, selectionIsFromUserAction]);

  useEffect(() => {
    if (!isIpodPreset || !deviceHandleRef) {
      setIpodTrackIndexStatus("idle");
      setIpodTrackIndexError(null);
      setIpodTrackIndex({ tagSize: new Set(), tagOnly: new Set() });
      return;
    }
    if (selectionIsFromUserAction === false) return;
    const handleRef = deviceHandleRef;
    let cancelled = false;
    async function loadTracks() {
      setIpodTrackIndexStatus("loading");
      setIpodTrackIndexError(null);
      try {
        const tracks = await loadIpodTracks(handleRef);
        if (cancelled) return;
        const tagSize = new Set<string>();
        const tagOnly = new Set<string>();
        let usedBytes = 0;
        for (const track of tracks) {
          const tagKey = buildTagKey({
            title: track.title,
            artist: track.artist,
            album: track.album,
            trackNo: track.track_nr,
          });
          tagOnly.add(tagKey);
          if (typeof track.size === "number") {
            usedBytes += track.size;
            tagSize.add(
              buildTagSizeKey({
                title: track.title,
                artist: track.artist,
                album: track.album,
                trackNo: track.track_nr,
                size: track.size,
              })
            );
          }
        }
        setIpodTrackIndex({ tagSize, tagOnly, usedBytes });
        setIpodTrackIndexStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setIpodTrackIndexStatus("error");
        setIpodTrackIndexError(
          error instanceof Error ? error.message : "Failed to load iPod tracks"
        );
      }
    }
    loadTracks();
    return () => {
      cancelled = true;
    };
  }, [isIpodPreset, deviceHandleRef, selectionIsFromUserAction, buildTagKey, buildTagSizeKey]);

  useEffect(() => {
    if (devicePreset !== "jellyfin") return;
    const nextStrategy =
      jellyfinExportMode === "download" ? "absolute" : "relative-to-library-root";
    if (devicePathStrategy !== nextStrategy) {
      setDevicePathStrategy(nextStrategy);
    }
  }, [devicePreset, jellyfinExportMode, devicePathStrategy]);

  useEffect(() => {
    if (devicePreset !== "jellyfin") return;
    if (jellyfinExportMode === "download") {
      setDeviceAbsolutePrefix(jellyfinContainerPrefix);
    } else if (deviceAbsolutePrefix) {
      setDeviceAbsolutePrefix("");
    }
  }, [devicePreset, jellyfinExportMode, jellyfinContainerPrefix, deviceAbsolutePrefix]);

  useEffect(() => {
    if (!deviceHandleRef) return;
    if (devicePreset !== "ipod") return;
    setIsDeviceConnected(true);
    const monitor = startIpodConnectionMonitor({
      handleRef: deviceHandleRef,
      onDisconnect: (reason) => {
        setIsDeviceConnected(false);
        setSyncWarning(`iPod disconnected (${reason}). Reconnect the device folder.`);
      },
    });
    setIpodMonitor(monitor);
    return () => {
      monitor.stop();
      setIpodMonitor(null);
    };
  }, [deviceHandleRef, devicePreset]);

  useEffect(() => {
    if (!deviceHandleRef) return;
    if (devicePreset !== "walkman" && devicePreset !== "generic") return;
    let cancelled = false;
    const verify = async () => {
      const ok = await verifyDeviceConnection(deviceHandleRef);
      if (!cancelled) setIsDeviceConnected(ok);
    };
    void verify();
    const interval = window.setInterval(verify, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [deviceHandleRef, devicePreset]);

  useEffect(() => {
    if (devicePreset !== "ipod") return;
    if (!supportsWebUSB()) return;
    let cancelled = false;
    async function loadKnown() {
      try {
        const known = await listKnownIpodDevices();
        if (!cancelled) {
          setIpodKnownDevices(known);
        }
      } catch (error) {
        logger.warn("Failed to list known iPods", error);
      }
    }
    loadKnown();
    return () => {
      cancelled = true;
    };
  }, [devicePreset]);

  useEffect(() => {
    if (!["ipod", "walkman", "generic", "zune", "jellyfin"].includes(devicePreset))
      return;
    if (!selectedCollectionId) return;
    let cancelled = false;
    async function loadCollectionTracks() {
      setCollectionTracksStatus("loading");
      setCollectionTracksError(null);
      try {
        const tracks = await db.tracks
          .where("libraryRootId")
          .equals(selectedCollectionId)
          .toArray();
        const fileIndexEntries = await getFileIndexEntries(selectedCollectionId);
        const fileIndexMap = new Map(
          fileIndexEntries.map((entry) => [entry.trackFileId, entry])
        );
        if (cancelled) return;
        setCollectionTracks(
          tracks.map((track) => {
            const fileIndex = fileIndexMap.get(track.trackFileId);
            const fallbackTitle = fileIndex?.name || track.trackFileId;
            const genres = track.tags?.genres;
            return {
              trackFileId: track.trackFileId,
              title: track.tags?.title || fallbackTitle,
              artist: track.tags?.artist,
              album: track.tags?.album,
              trackNo: track.tags?.trackNo,
              addedAt: fileIndex?.updatedAt ?? track.updatedAt,
              fileName: fileIndex?.name,
              fileSize: fileIndex?.size,
              genre: Array.isArray(genres) && genres.length > 0 ? genres.join(", ") : undefined,
              durationSeconds: track.tech?.durationSeconds,
              bpm: track.tech?.bpm,
            };
          })
        );
        setSelectedCollectionTrackIds(new Set());
        setCollectionTracksStatus("ready");
      } catch (error) {
        if (!cancelled) {
          setCollectionTracksStatus("error");
          setCollectionTracksError(
            error instanceof Error ? error.message : "Failed to load collection tracks"
          );
        }
      }
    }
    loadCollectionTracks();
    return () => {
      cancelled = true;
    };
  }, [devicePreset, selectedCollectionId]);

  useEffect(() => {
    if (
      collectionTracksStatus !== "ready" ||
      collectionTracks.length === 0 ||
      !selectedCollectionId
    ) {
      setArtworkUrlMap(new Map());
      return;
    }
    const search = collectionTrackSearch.trim().toLowerCase();
    const filtered = search
      ? collectionTracks.filter((track) => {
          const haystack = `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`.toLowerCase();
          return haystack.includes(search);
        })
      : collectionTracks;
    const grouped: Record<string, Record<string, typeof filtered>> = {};
    for (const track of filtered) {
      const artist = track.artist || "Unknown Artist";
      const album = track.album || "Unknown Album";
      if (!grouped[artist]) grouped[artist] = {};
      if (!grouped[artist][album]) grouped[artist][album] = [];
      grouped[artist][album].push(track);
    }
    const representativeIds = new Set<string>();
    for (const artist of Object.keys(grouped)) {
      const albums = grouped[artist];
      const firstAlbumKey = Object.keys(albums)[0];
      if (firstAlbumKey && albums[firstAlbumKey].length > 0) {
        representativeIds.add(
          getCompositeId(albums[firstAlbumKey][0].trackFileId, selectedCollectionId)
        );
      }
      for (const album of Object.keys(albums)) {
        const tracks = albums[album];
        if (tracks.length > 0) {
          representativeIds.add(
            getCompositeId(tracks[0].trackFileId, selectedCollectionId)
          );
        }
      }
    }
    const ids = Array.from(representativeIds);
    if (ids.length === 0) {
      setArtworkUrlMap(new Map());
      return;
    }
    let cancelled = false;
    const urlMapForCleanup = new Map<string, string>();
    artworkUrlMapRef.current = urlMapForCleanup;
    db.artworkCache
      .bulkGet(ids)
      .then((records) => {
        if (cancelled) return;
        urlMapForCleanup.forEach((url) => URL.revokeObjectURL(url));
        urlMapForCleanup.clear();
        records.forEach((record, i) => {
          if (record?.thumbnail && ids[i]) {
            const url = URL.createObjectURL(record.thumbnail);
            urlMapForCleanup.set(ids[i], url);
          }
        });
        setArtworkUrlMap(new Map(urlMapForCleanup));
      })
      .catch((err) => {
        if (!cancelled) logger.warn("Failed to load artwork cache", err);
      });
    return () => {
      cancelled = true;
      urlMapForCleanup.forEach((url) => URL.revokeObjectURL(url));
      urlMapForCleanup.clear();
      setArtworkUrlMap(new Map());
    };
  }, [
    collectionTracksStatus,
    collectionTracks,
    selectedCollectionId,
    collectionTrackSearch,
  ]);

  async function buildTrackLookups(
    targetPlaylist: GeneratedPlaylist,
    rootId?: string,
    options?: { tryLazyFileIndex?: boolean }
  ): Promise<TrackLookup[]> {
    const trackFileIds = targetPlaylist.trackFileIds;
    let allTracks: Awaited<ReturnType<typeof getAllTracks>>;
    if (rootId) {
      const fromRoot = await db.tracks
        .where("libraryRootId")
        .equals(rootId)
        .toArray();
      const foundIds = new Set(fromRoot.map((t) => t.trackFileId));
      const missingIds = trackFileIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        const fromOther = await db.tracks
          .where("trackFileId")
          .anyOf(missingIds)
          .toArray();
        allTracks = [...fromRoot, ...fromOther];
      } else {
        allTracks = fromRoot;
      }
    } else {
      allTracks = await getAllTracks();
    }

    const fileIndexEntries: Map<string, any> = new Map();
    if (rootId) {
      const entries = await getFileIndexEntries(rootId);
      for (const entry of entries) {
        fileIndexEntries.set(entry.trackFileId, entry);
      }
    } else {
      const rootIds = new Set(
        allTracks.map((track) => track.libraryRootId).filter(Boolean)
      );
      const entriesByRoot = await Promise.all(
        Array.from(rootIds).map(async (id) => ({
          id,
          entries: await getFileIndexEntries(id as string),
        }))
      );
      for (const group of entriesByRoot) {
        for (const entry of group.entries) {
          fileIndexEntries.set(entry.trackFileId, entry);
        }
      }
    }

    const trackLookups: TrackLookup[] = [];
    const globalIndexCache = new Map<string, FileIndexRecord | null>();
    for (const trackFileId of trackFileIds) {
      const track = allTracks.find((t) => t.trackFileId === trackFileId);
      if (!track) continue;
      let fileIndex = fileIndexEntries.get(trackFileId);
      if (!fileIndex && track.libraryRootId) {
        fileIndex = await getFileIndexEntry(trackFileId, track.libraryRootId);
        if (fileIndex) {
          fileIndexEntries.set(trackFileId, fileIndex);
        }
      }
      if (!fileIndex && track.globalTrackId) {
        fileIndex = await findFileIndexByGlobalTrackId(track.globalTrackId, {
          preferredRootId: rootId ?? track.libraryRootId,
          cache: globalIndexCache,
        });
        if (fileIndex) {
          fileIndexEntries.set(trackFileId, fileIndex);
        }
      }
      if (!fileIndex) {
        const rootsToTry = Array.from(
          new Set(allTracks.map((t) => t.libraryRootId).filter(Boolean))
        ).filter((id) => id !== rootId);
        for (const rid of rootsToTry) {
          fileIndex = await getFileIndexEntry(trackFileId, rid as string);
          if (fileIndex) {
            fileIndexEntries.set(trackFileId, fileIndex);
            break;
          }
        }
      }
      if (!fileIndex && options?.tryLazyFileIndex && track.libraryRootId) {
        const root = await resolveLibraryRoot(track.libraryRootId);
        if (root?.mode === "handle") {
          const { tryLazyFileIndex } = await import(
            "@/features/devices/lazy-file-index"
          );
          fileIndex = await tryLazyFileIndex(
            track,
            root,
            track.libraryRootId
          );
          if (fileIndex) {
            fileIndexEntries.set(trackFileId, fileIndex);
          }
        }
      }
      trackLookups.push({ track, fileIndex: fileIndexEntries.get(trackFileId) });
    }
    return trackLookups;
  }

  async function buildTrackLookupsFromTrackIds(
    trackFileIds: string[],
    rootId?: string,
    options?: { tryLazyFileIndex?: boolean }
  ): Promise<TrackLookup[]> {
    let allTracks: Awaited<ReturnType<typeof getAllTracks>>;
    if (rootId) {
      const fromRoot = await db.tracks
        .where("libraryRootId")
        .equals(rootId)
        .toArray();
      const foundIds = new Set(fromRoot.map((t) => t.trackFileId));
      const missingIds = trackFileIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        const fromOther = await db.tracks
          .where("trackFileId")
          .anyOf(missingIds)
          .toArray();
        allTracks = [...fromRoot, ...fromOther];
      } else {
        allTracks = fromRoot;
      }
    } else {
      allTracks = await getAllTracks();
    }

    const fileIndexEntries: Map<string, any> = new Map();
    if (rootId) {
      const entries = await getFileIndexEntries(rootId);
      for (const entry of entries) {
        fileIndexEntries.set(entry.trackFileId, entry);
      }
    } else {
      const rootIds = new Set(
        allTracks.map((track) => track.libraryRootId).filter(Boolean)
      );
      const entriesByRoot = await Promise.all(
        Array.from(rootIds).map(async (id) => ({
          id,
          entries: await getFileIndexEntries(id as string),
        }))
      );
      for (const group of entriesByRoot) {
        for (const entry of group.entries) {
          fileIndexEntries.set(entry.trackFileId, entry);
        }
      }
    }

    const lookupMap = new Map(allTracks.map((track) => [track.trackFileId, track]));
    const trackLookups: TrackLookup[] = [];
    const globalIndexCache = new Map<string, FileIndexRecord | null>();
    for (const trackFileId of trackFileIds) {
      const track = lookupMap.get(trackFileId);
      if (!track) continue;
      let fileIndex = fileIndexEntries.get(trackFileId);
      if (!fileIndex && track.libraryRootId) {
        fileIndex = await getFileIndexEntry(trackFileId, track.libraryRootId);
        if (fileIndex) {
          fileIndexEntries.set(trackFileId, fileIndex);
        }
      }
      if (!fileIndex && track.globalTrackId) {
        fileIndex = await findFileIndexByGlobalTrackId(track.globalTrackId, {
          preferredRootId: rootId ?? track.libraryRootId,
          cache: globalIndexCache,
        });
        if (fileIndex) {
          fileIndexEntries.set(trackFileId, fileIndex);
        }
      }
      if (!fileIndex) {
        const rootsToTry = Array.from(
          new Set(allTracks.map((t) => t.libraryRootId).filter(Boolean))
        ).filter((id) => id !== rootId);
        for (const rid of rootsToTry) {
          fileIndex = await getFileIndexEntry(trackFileId, rid as string);
          if (fileIndex) {
            fileIndexEntries.set(trackFileId, fileIndex);
            break;
          }
        }
      }
      if (!fileIndex && options?.tryLazyFileIndex && track.libraryRootId) {
        const root = await resolveLibraryRoot(track.libraryRootId);
        if (root?.mode === "handle") {
          const { tryLazyFileIndex } = await import(
            "@/features/devices/lazy-file-index"
          );
          fileIndex = await tryLazyFileIndex(
            track,
            root,
            track.libraryRootId
          );
          if (fileIndex) {
            fileIndexEntries.set(trackFileId, fileIndex);
          }
        }
      }
      trackLookups.push({ track, fileIndex: fileIndexEntries.get(trackFileId) });
    }
    return trackLookups;
  }

  function buildTargetKeyMap(
    targetsWithLookups: Array<{ trackLookups: TrackLookup[] }>
  ): { keyMap: Map<string, Set<string>>; trackCount: number; hasFullHash: boolean } {
    const keyMap = new Map<string, Set<string>>();
    const trackIds = new Set<string>();
    let hasFullHash = false;
    for (const target of targetsWithLookups) {
      for (const lookup of target.trackLookups) {
        const fileIndex = lookup.fileIndex;
        if (!fileIndex) continue;
        const candidates = buildDeviceMatchCandidates({
          filename: fileIndex.name,
          size: fileIndex.size,
          mtime: fileIndex.mtime,
        });
        if (fileIndex.fullContentHash) {
          candidates.push(fileIndex.fullContentHash);
          hasFullHash = true;
        }
        if (fileIndex.contentHash) {
          candidates.push(fileIndex.contentHash);
        }
        if (candidates.length === 0) continue;
        trackIds.add(lookup.track.trackFileId);
        for (const candidate of candidates) {
          const existing = keyMap.get(candidate);
          if (existing) {
            existing.add(lookup.track.trackFileId);
          } else {
            keyMap.set(candidate, new Set([lookup.track.trackFileId]));
          }
        }
      }
    }
    return { keyMap, trackCount: trackIds.size, hasFullHash };
  }

  function resolveLibraryRoot(recordId?: string): Promise<LibraryRoot | null> {
    if (!recordId) {
      return getSavedLibraryRoot();
    }
    return getLibraryRoot(recordId).then((rootRecord) => {
      if (!rootRecord) return null;
      if (rootRecord.mode === "handle") {
        return {
          mode: "handle",
          name: rootRecord.name,
          handleId: rootRecord.handleRef || rootRecord.id,
        } as LibraryRoot;
      }
      return {
        mode: "fallback",
        name: rootRecord.name,
        handleId: rootRecord.id,
        lastImportedAt: rootRecord.createdAt,
      } as LibraryRoot;
    });
  }

  function normalizeContainerPrefix(value: string): string {
    let normalized = value.trim().replace(/\\/g, "/");
    if (!normalized) return "";
    if (!normalized.startsWith("/")) {
      normalized = `/${normalized}`;
    }
    return normalized.replace(/\/+$/, "");
  }

  function filterTrackLookups(trackLookups: TrackLookup[]): {
    filtered: TrackLookup[];
    missingMetadataCount: number;
    missingTrackRootIds: string[];
  } {
    const missingTrackRootIds: string[] = [];
    const filtered = trackLookups.filter((lookup) => {
      if (!lookup.fileIndex) {
        if (lookup.track.libraryRootId) {
          missingTrackRootIds.push(lookup.track.libraryRootId);
        }
        return false;
      }
      return true;
    });
    return {
      filtered,
      missingMetadataCount: trackLookups.length - filtered.length,
      missingTrackRootIds,
    };
  }

  const collectionSearch = collectionTrackSearch.trim().toLowerCase();
  const collectionTracksWithStatus = collectionTracks.map((track) => {
    let onDevice: boolean | null = null;
    if (isIpodPreset) {
      onDevice = isTrackOnDevice({
        title: track.title,
        artist: track.artist,
        album: track.album,
        trackFileId: track.trackFileId,
        fileSize: track.fileSize,
        trackNo: track.trackNo,
      });
    } else if (
      (isWalkmanPreset || isGenericPreset || isZunePreset) &&
      devicePathDetectionEnabled &&
      deviceScanStatus === "done" &&
      devicePathMap.size > 0
    ) {
      onDevice = isTrackOnDeviceUsb(
        { fileName: track.fileName, fileSize: track.fileSize, trackFileId: track.trackFileId },
        devicePathMap
      );
    }
    return { ...track, onDevice };
  });
  const filteredCollectionTracks = collectionSearch
    ? collectionTracksWithStatus.filter((track) => {
        const haystack = `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`.toLowerCase();
        return haystack.includes(collectionSearch);
      })
    : collectionTracksWithStatus;
  const visibleCollectionTracks = filteredCollectionTracks;

  useEffect(() => {
    setCollectionTracksCurrentPage(1);
  }, [filteredCollectionTracks.length]);

  const groupedTracks = visibleCollectionTracks.reduce(
    (acc, track) => {
      const artist = track.artist || "Unknown Artist";
      const album = track.album || "Unknown Album";
      if (!acc[artist]) {
        acc[artist] = {};
      }
      if (!acc[artist][album]) {
        acc[artist][album] = [];
      }
      acc[artist][album].push(track);
      return acc;
    },
    {} as Record<string, Record<string, typeof visibleCollectionTracks>>
  );
  for (const artist of Object.keys(groupedTracks)) {
    for (const album of Object.keys(groupedTracks[artist])) {
      groupedTracks[artist][album].sort(
        (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)
      );
    }
  }
  const artistNames = Object.keys(groupedTracks).sort((a, b) =>
    a.localeCompare(b)
  );
  const albumCount = Object.keys(groupedTracks).reduce(
    (sum, artist) => sum + Object.keys(groupedTracks[artist]).length,
    0
  );
  const albumList = Object.keys(groupedTracks).flatMap((artist) =>
    Object.keys(groupedTracks[artist]).map((album) => {
      const tracks = groupedTracks[artist][album];
      return {
        artist,
        album,
        trackIds: tracks.map((t) => t.trackFileId),
        trackCount: tracks.length,
      };
    })
  );
  const selectedTracksCount = selectedCollectionTrackIds.size;
  const selectedAlbumsCount = albumList.filter((a) =>
    a.trackIds.some((id) => selectedCollectionTrackIds.has(id))
  ).length;
  const selectedArtistsCount = artistNames.filter((artist) => {
    const ids = Object.values(groupedTracks[artist])
      .flat()
      .map((t) => t.trackFileId);
    return ids.some((id) => selectedCollectionTrackIds.has(id));
  }).length;
  const selectedPlaylistsCount =
    playlists && playlists.length > 0 ? selectedPlaylistIds.length : 0;
  const totalTracksCount = (() => {
    const targets = getSyncTargets();
    const fromPlaylists = targets.flatMap((t) => t.playlist.trackFileIds);
    return new Set([...fromPlaylists, ...selectedCollectionTrackIds]).size;
  })();

  async function checkIpodSetup(handleRef?: string | null) {
    if (!handleRef) return;
    setIpodSetupStatus("checking");
    setIpodSetupMessage(null);
    setIpodSetupSkipped(false);
    try {
      const handle = await getDirectoryHandle(handleRef);
      if (!handle) {
        setIsDeviceConnected(false);
        setIpodSetupStatus("error");
        setIpodSetupMessage("iPod folder handle not found.");
        return;
      }
      const isValid = await verifyIpodStructure(handle);
      if (!isValid) {
        setIpodSetupStatus("error");
        setIpodSetupMessage("Selected folder does not look like an iPod root.");
        return;
      }
      const configured = await isSysInfoSetup(handle);
      setIsDeviceConnected(true);
      if (configured) {
        setIpodSetupStatus("ready");
        setIpodSetupMessage("iPod setup is complete.");
      } else {
        const info = await loadIpodDeviceInfo(handleRef);
        setIpodDeviceInfo({
          model_name: info?.model_name,
          generation_name: info?.generation_name,
          checksum_type: info?.checksum_type,
          capacity_gb: info?.capacity_gb,
        });
        if (info?.checksum_type === 0) {
          setIpodSetupStatus("ready");
          setIpodSetupMessage("Detected iPod does not require setup.");
        } else {
          setIpodSetupStatus("needs_setup");
          setIpodSetupMessage(
            supportsWebUSB()
              ? "iPod setup required to sync correctly."
              : "iPod setup may be required, but WebUSB is unavailable. You can skip if this is an older iPod."
          );
        }
      }
    } catch (error) {
      setIsDeviceConnected(false);
      setIpodSetupStatus("error");
      setIpodSetupMessage(
        error instanceof Error ? error.message : "Failed to validate iPod setup."
      );
    }
  }

  async function handleRunIpodSetup() {
    setIpodSetupStatus("checking");
    setIpodSetupMessage(null);
    setIpodSetupSkipped(false);
    try {
      if (!supportsWebUSB()) {
        throw new Error("WebUSB is not supported in this browser.");
      }
      if (!deviceHandleRef) {
        throw new Error("Select the iPod folder first.");
      }
      const handle = await getDirectoryHandle(deviceHandleRef);
      if (!handle) {
        throw new Error("iPod folder handle not found.");
      }
      const usbInfo = await getDeviceViaWebUSB();
      await writeSysInfoSetup({
        ipodHandle: handle,
        serialNumber: usbInfo.serialNumber,
        productId: usbInfo.productId,
      });
      setIpodUsbInfo({
        productId: usbInfo.productId,
        serialNumber: usbInfo.serialNumber,
        productName: usbInfo.productName,
        manufacturerName: usbInfo.manufacturerName,
      });
      setIpodSetupStatus("ready");
      setIpodSetupMessage("iPod setup complete. Ready to sync.");
    } catch (error) {
      setIpodSetupStatus("error");
      setIpodSetupMessage(error instanceof Error ? error.message : "iPod setup failed.");
    }
  }

  function handleSkipIpodSetup() {
    setIpodSetupStatus("ready");
    setIpodSetupSkipped(true);
    setIpodSetupMessage("Continuing without iPod setup.");
  }

  async function relinkLibraryRoot(rootId: string) {
    if (!supportsFileSystemAccess()) {
      throw new Error("File System Access API not supported");
    }
    const handle = await window.showDirectoryPicker({ mode: "read" });
    const handleId = await storeDirectoryHandle(handle);
    await relinkCollectionHandle(rootId, handleId);
  }

  async function ensureLibraryRootAccess(rootId: string) {
    const root = await getLibraryRoot(rootId);
    if (!root) {
      throw new Error(`Library root not found: ${rootId}`);
    }
    if (!root.handleRef) {
      await relinkLibraryRoot(rootId);
      return;
    }
    const handle = await getDirectoryHandle(root.handleRef);
    if (!handle) {
      await relinkLibraryRoot(rootId);
      return;
    }
    const permission = await handle.queryPermission({ mode: "read" });
    if (permission === "granted") return;
    const requested = await handle.requestPermission({ mode: "read" });
    if (requested === "granted") return;
    await relinkLibraryRoot(rootId);
  }

  async function ensureAllLibraryRootAccess(rootIds: string[]) {
    for (const rootId of rootIds) {
      await ensureLibraryRootAccess(rootId);
    }
  }

  async function handleDetectIpodUsb() {
    setIpodSetupMessage(null);
    try {
      if (!supportsWebUSB()) {
        throw new Error("WebUSB is not supported in this browser.");
      }
      const usbInfo = await getDeviceViaWebUSB();
      setIpodUsbInfo({
        productId: usbInfo.productId,
        serialNumber: usbInfo.serialNumber,
        productName: usbInfo.productName,
        manufacturerName: usbInfo.manufacturerName,
      });
      if (!deviceLabel) {
        setDeviceLabel(usbInfo.productName || "iPod");
      }
      const known = await listKnownIpodDevices();
      setIpodKnownDevices(known);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to detect iPod.";
      setIpodSetupMessage(
        message.includes("No compatible devices")
          ? "No compatible devices found via WebUSB. Older iPods may not appear; select the iPod folder to continue."
          : message
      );
    }
  }

  async function handleSelectDeviceFolder() {
    if (useCompanionApp) return;
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const result = await pickDeviceRootHandle();
      setDeviceHandleRef(result.handleId);
      setIsDeviceConnected(true);
      if (!deviceLabel) {
        setDeviceLabel(result.name);
      }
      const handle = await getDirectoryHandle(result.handleId);
      if (handle) {
        const detected = await detectDevicePreset(handle);
        if (detected === "ipod") {
          setDevicePreset("ipod");
          await checkIpodSetup(result.handleId);
        } else if (!isIpodPreset) {
          setDevicePreset(detected);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to select device folder";
      setSyncError(message);
    }
  }

  async function refreshDeviceProfiles() {
    const profiles = await getDeviceProfiles();
    setDeviceProfiles(profiles);
  }

  function getSyncTargets(): PlaylistItem[] {
    return getSyncTargetsFromPlaylists(
      playlists ?? [],
      selectedPlaylistIds,
      playlist ? { playlist, libraryRootId } : undefined
    );
  }

  async function handleDeviceSync() {
    setIsSyncing(true);
    setSyncPhase("preparing");
    setSyncError(null);
    setSyncSuccess(null);
    setSyncWarning(null);
    setMissingMetadataCount(0);
    setPathValidationStatus("idle");
    setPathValidationResult(null);
    setPathValidationPlaylistTitle(null);
    setPathValidationError(null);

    try {
      ipodMonitor?.suspend();
      if (isJellyfinPreset) {
        throw new Error("Use Jellyfin export to generate playlists.");
      }
      if (!supportsFileSystemAccess() && !useCompanionApp) {
        throw new Error("USB sync requires a Chromium browser with File System Access API");
      }
      if (!deviceHandleRef && !useCompanionApp) {
        throw new Error("Select a device folder to sync");
      }
      const targets = getSyncTargets();
      if (targets.length === 0) {
        throw new Error("Select at least one playlist to sync");
      }
      if (
        isIpodPreset &&
        ipodSetupStatus === "needs_setup" &&
        !ipodSetupSkipped &&
        ipodDeviceInfo?.checksum_type !== 0
      ) {
        throw new Error("iPod setup is required before syncing.");
      }
      if (isIpodPreset) {
        const rootIds = Array.from(
          new Set(targets.map((item) => item.libraryRootId).filter(Boolean))
        ) as string[];
        if (rootIds.length === 0) {
          throw new Error("iPod sync requires playlists with a library collection.");
        }
        await ensureAllLibraryRootAccess(rootIds);
      }
      const label = deviceLabel.trim() || "USB Device";
      const effectivePlaylistFolder = isWalkmanPreset ? "MUSIC" : devicePlaylistFolder.trim();
      const effectivePathStrategy = isWalkmanPreset
        ? "relative-to-playlist"
        : devicePathStrategy;
      const effectiveAbsolutePrefix =
        effectivePathStrategy === "absolute" ? deviceAbsolutePrefix.trim() || undefined : undefined;
      const effectiveOnlyIncludeMatchedPaths = isWalkmanPreset
        ? true
        : onlyIncludeMatchedPaths;
      const modelInfo = ipodUsbInfo?.productId
        ? getModelInfo(ipodUsbInfo.productId)
        : null;

      const profile = await saveDeviceProfile({
        id: selectedDeviceId === "new" ? undefined : selectedDeviceId,
        label,
        handleRef: useCompanionApp ? undefined : deviceHandleRef || undefined,
        deviceType: isIpodPreset ? "ipod" : devicePreset,
        playlistFormat: devicePlaylistFormat,
        playlistFolder: effectivePlaylistFolder,
        pathStrategy: effectivePathStrategy,
        absolutePathPrefix: effectiveAbsolutePrefix,
        containerLibraryPrefix: isJellyfinPreset
          ? normalizeContainerPrefix(jellyfinContainerPrefix) || undefined
          : undefined,
        jellyfinExportMode: isJellyfinPreset ? jellyfinExportMode : undefined,
        usbVendorId: ipodUsbInfo?.productId ? 0x05ac : undefined,
        usbProductId: ipodUsbInfo?.productId,
        usbSerialNumber: ipodUsbInfo?.serialNumber,
        usbProductName: ipodUsbInfo?.productName,
        usbManufacturerName: ipodUsbInfo?.manufacturerName,
        ipodModelName: modelInfo?.name,
        ipodModelNumber: modelInfo?.modelNumStr,
        ipodRequiresEncryption: ipodUsbInfo?.productId
          ? requiresEncryption(ipodUsbInfo.productId)
          : undefined,
      });
      const targetsWithLookups = await Promise.all(
        targets.map(async (target) => ({
          ...target,
          trackLookups: await buildTrackLookups(target.playlist, target.libraryRootId, {
            tryLazyFileIndex: true,
          }),
        }))
      );
      let totalMissingMetadata = 0;
      const allMissingRootIds: string[] = [];
      const scanTargets = targetsWithLookups.map((target) => {
        const { filtered, missingMetadataCount, missingTrackRootIds } =
          filterTrackLookups(target.trackLookups);
        totalMissingMetadata += missingMetadataCount;
        allMissingRootIds.push(...missingTrackRootIds);
        return {
          ...target,
          trackLookups: filtered,
        };
      });
      setMissingMetadataCount(totalMissingMetadata);
      if (totalMissingMetadata > 0) {
        const rootIds = Array.from(
          new Set(targets.map((t) => t.libraryRootId).filter(Boolean))
        ) as string[];
        const primaryRootId = rootIds[0];
        const missingInOtherRoot =
          primaryRootId &&
          allMissingRootIds.length > 0 &&
          allMissingRootIds.filter((id) => id !== primaryRootId).length >=
            Math.ceil(allMissingRootIds.length / 2);
        setSyncWarning(
          missingInOtherRoot
            ? `${totalMissingMetadata} track(s) may be in a different collection. Try switching collection or rescanning your library.`
            : `${totalMissingMetadata} track(s) are missing local file metadata. ` +
                "Rescan your library to improve device path detection."
        );
      }
      if (isWalkmanPreset && !devicePathDetectionEnabled) {
        setSyncWarning(
          "Walkman sync works best with device path detection. Enable device scan if paths fail."
        );
      }
      const { keyMap: targetKeyMap, trackCount: targetTrackCount, hasFullHash } =
        buildTargetKeyMap(scanTargets);

      let activeDevicePathMap = devicePathMap;
      let activeDeviceEntries = deviceEntries;
      if (isWalkmanPreset && devicePathDetectionEnabled) {
        if (targetTrackCount === 0) {
          setSyncWarning(
            "No track metadata available for playlist scan. Continuing without path detection."
          );
          activeDevicePathMap = new Map();
          activeDeviceEntries = [];
        } else {
          try {
            const scanResult = await scanDevicePaths({
              preview: false,
              targetKeyMap,
              targetTrackCount,
              computeFullContentHash: hasFullHash,
            });
            activeDevicePathMap = scanResult.map;
            activeDeviceEntries = scanResult.entries;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Device scan failed";
            throw new Error(`Walkman scan failed (${message}).`);
          }
        }
      } else if (!useCompanionApp && devicePathDetectionEnabled && !isIpodPreset) {
        if (devicePathMap.size === 0 || deviceScanStatus !== "done") {
          if (targetTrackCount === 0) {
            setSyncWarning(
              "No track metadata available for playlist scan. Continuing without path detection."
            );
            activeDevicePathMap = new Map();
            activeDeviceEntries = [];
          } else {
            try {
              const scanResult = await scanDevicePaths({
                preview: false,
                targetKeyMap,
                targetTrackCount,
                computeFullContentHash: hasFullHash,
              });
              activeDevicePathMap = scanResult.map;
              activeDeviceEntries = scanResult.entries;
            } catch (err) {
              const message = err instanceof Error ? err.message : "Device scan failed";
              setSyncWarning(
                `Device scan failed (${message}). Continuing without path detection.`
              );
              activeDevicePathMap = new Map();
              activeDeviceEntries = [];
            }
          }
        }
      }

      if (isWalkmanPreset && devicePathDetectionEnabled && devicePathMap.size === 0) {
        setSyncWarning(
          "Walkman playlists require exact on-device paths. Consider running Scan Device first."
        );
      }

      if (isIpodPreset) {
        const mappings = await getDeviceTrackMappings(profile.id);
        const libraryOnDevice = new Set(mappings.map((m) => m.libraryTrackId));
        let missingCount = 0;
        for (const target of scanTargets) {
          for (const lookup of target.trackLookups) {
            const libraryKey = getCompositeId(
              lookup.track.trackFileId,
              lookup.track.libraryRootId ?? target.libraryRootId ?? ""
            );
            if (libraryOnDevice.has(libraryKey)) continue;
            const onDevice = isTrackOnDevice({
              title: lookup.track.tags?.title,
              artist: lookup.track.tags?.artist,
              album: lookup.track.tags?.album,
              trackNo: lookup.track.tags?.trackNo,
              trackFileId: lookup.track.trackFileId,
              fileSize: lookup.fileIndex?.size,
            });
            if (onDevice === true) continue;
            missingCount += 1;
          }
        }
        if (missingCount > 0) {
          setMissingTrackCount(missingCount);
          setPendingIpodSync({ profile, scanTargets });
          setShowMissingTracksDialog(true);
          setIsSyncing(false);
          setSyncPhase("idle");
          ipodMonitor?.resume();
          return;
        }
      }

      setSyncPhase("writing");
      let syncedCount = 0;
      const companionJobs: string[] = [];

      if (isIpodPreset) {
        setSyncQueueStatus({
          currentIndex: 1,
          total: scanTargets.length,
          currentTitle: scanTargets[0]?.playlist.title,
        });
        await syncPlaylistsToDevice({
          deviceProfile: profile,
          targets: scanTargets,
          overwriteExistingPlaylist: overwriteExistingPlaylistOnIpod,
        });
        syncedCount = scanTargets.length;
      } else {
        for (let index = 0; index < scanTargets.length; index += 1) {
          const target = scanTargets[index];
          setSyncQueueStatus({
            currentIndex: index + 1,
            total: scanTargets.length,
            currentTitle: target.playlist.title,
          });
          if (useCompanionApp) {
            const mappedLookups = devicePathDetectionEnabled
              ? applyDevicePathMap(target.trackLookups, activeDevicePathMap, {
                  absolutePrefix:
                    effectivePathStrategy === "absolute"
                      ? effectiveAbsolutePrefix
                      : undefined,
                  deviceEntries: activeDeviceEntries,
                })
              : target.trackLookups;
            const payload = buildCompanionPayload({
              playlist: target.playlist,
              trackLookups: mappedLookups,
              deviceLabel: label,
            });
            const result = await sendCompanionSync(payload);
            if (result?.jobId) {
              companionJobs.push(result.jobId);
            }
          } else {
            const syncResult = await syncPlaylistsToDevice({
              deviceProfile: profile,
              targets: [target],
              devicePathMap: devicePathDetectionEnabled ? activeDevicePathMap : undefined,
              deviceEntries: devicePathDetectionEnabled ? activeDeviceEntries : undefined,
              onlyIncludeMatchedPaths: devicePathDetectionEnabled && effectiveOnlyIncludeMatchedPaths,
            });
            if (profile.handleRef && syncResult.playlistPath) {
              setPathValidationStatus("validating");
              try {
                const validation = await validatePlaylistOnDevice({
                  deviceHandleRef: profile.handleRef,
                  playlistPath: syncResult.playlistPath,
                  pathStrategy: profile.pathStrategy,
                  absolutePathPrefix: profile.absolutePathPrefix,
                  devicePathMap: activeDevicePathMap,
                });
                setPathValidationStatus("done");
                setPathValidationResult(validation);
                setPathValidationPlaylistTitle(target.playlist.title);
                setPathValidationError(null);
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "Path validation failed";
                setPathValidationStatus("error");
                setPathValidationError(message);
              }
            }
          }
          syncedCount += 1;
        }
      }

      await refreshDeviceProfiles();
      setSelectedDeviceId(profile.id);
      if (useCompanionApp) {
        const suffix =
          companionJobs.length > 0
            ? ` (job${companionJobs.length > 1 ? "s" : ""}: ${companionJobs.join(", ")})`
            : "";
        setSyncSuccess(
          syncedCount === 1
            ? `Sent playlist to companion app${suffix}`
            : `Sent ${syncedCount} playlists to companion app${suffix}`
        );
      } else if (isIpodPreset) {
        setSyncSuccess(
          syncedCount === 1 ? "Synced iPod playlist" : `Synced ${syncedCount} iPod playlists`
        );
      } else {
        setSyncSuccess(
          syncedCount === 1
            ? "Synced playlist successfully"
            : `Synced ${syncedCount} playlists successfully`
        );
      }
      onDeviceProfileUpdated?.(profile);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NoModificationAllowedError"
          ? "Device is read-only. Please remount with write access or use a writable USB device."
          : err instanceof Error
          ? err.message
          : "Failed to sync playlist";
      setSyncError(message);
    } finally {
      setIsSyncing(false);
      setSyncPhase("idle");
      setSyncQueueStatus({ currentIndex: 0, total: 0 });
      ipodMonitor?.resume();
    }
  }

  async function prepareIpodProfileForSync(): Promise<DeviceProfileRecord> {
    if (!supportsFileSystemAccess()) {
      throw new Error("USB sync requires a Chromium browser with File System Access API");
    }
    if (!deviceHandleRef) {
      throw new Error("Select a device folder to sync");
    }
    if (
      ipodSetupStatus === "needs_setup" &&
      !ipodSetupSkipped &&
      ipodDeviceInfo?.checksum_type !== 0
    ) {
      throw new Error("iPod setup is required before syncing.");
    }
    const label = deviceLabel.trim() || "USB Device";
    const modelInfo = ipodUsbInfo?.productId ? getModelInfo(ipodUsbInfo.productId) : null;
    return saveDeviceProfile({
      id: selectedDeviceId === "new" ? undefined : selectedDeviceId,
      label,
      handleRef: deviceHandleRef || undefined,
      deviceType: "ipod",
      playlistFormat: devicePlaylistFormat,
      playlistFolder: devicePlaylistFolder.trim(),
      pathStrategy: devicePathStrategy,
      absolutePathPrefix: deviceAbsolutePrefix.trim() || undefined,
      usbVendorId: ipodUsbInfo?.productId ? 0x05ac : undefined,
      usbProductId: ipodUsbInfo?.productId,
      usbSerialNumber: ipodUsbInfo?.serialNumber,
      usbProductName: ipodUsbInfo?.productName,
      usbManufacturerName: ipodUsbInfo?.manufacturerName,
      ipodModelName: modelInfo?.name,
      ipodModelNumber: modelInfo?.modelNumStr,
      ipodRequiresEncryption: ipodUsbInfo?.productId
        ? requiresEncryption(ipodUsbInfo.productId)
        : undefined,
    });
  }

  async function prepareProfileForCollectionSync(): Promise<DeviceProfileRecord> {
    if (isIpodPreset) {
      return prepareIpodProfileForSync();
    }
    if (isWalkmanPreset || isGenericPreset || isZunePreset) {
      if (!supportsFileSystemAccess() && !useCompanionApp) {
        throw new Error("USB sync requires a Chromium browser with File System Access API");
      }
      if (!deviceHandleRef && !useCompanionApp) {
        throw new Error("Select a device folder to sync");
      }
      const label = deviceLabel.trim() || "USB Device";
      const effectivePlaylistFolder = isWalkmanPreset
        ? "MUSIC"
        : devicePlaylistFolder.trim();
      const effectivePathStrategy = isWalkmanPreset
        ? "relative-to-playlist"
        : devicePathStrategy;
      const effectiveAbsolutePrefix =
        effectivePathStrategy === "absolute"
          ? deviceAbsolutePrefix.trim() || undefined
          : undefined;
      return saveDeviceProfile({
        id: selectedDeviceId === "new" ? undefined : selectedDeviceId,
        label,
        handleRef: useCompanionApp ? undefined : deviceHandleRef || undefined,
        deviceType: devicePreset,
        playlistFormat: devicePlaylistFormat,
        playlistFolder: effectivePlaylistFolder,
        pathStrategy: effectivePathStrategy,
        absolutePathPrefix: effectiveAbsolutePrefix,
      });
    }
    throw new Error("Collection sync is not supported for this device preset.");
  }

  async function handleSyncSelectedTracks() {
    setIsSyncing(true);
    setSyncPhase("preparing");
    setSyncError(null);
    setSyncSuccess(null);
    setSyncWarning(null);
    try {
      ipodMonitor?.suspend();
      if (!hasCollectionSync) {
        throw new Error(
          "Selected-track sync is only available for iPod, Walkman, Generic, and Zune devices."
        );
      }
      if (!selectedCollectionId) {
        throw new Error("Select a collection to sync.");
      }
      const selectedIds = Array.from(selectedCollectionTrackIds);
      if (selectedIds.length === 0) {
        throw new Error("Select at least one track to sync.");
      }
      await ensureAllLibraryRootAccess([selectedCollectionId]);
      const profile = await prepareProfileForCollectionSync();
      const trackLookups = await buildTrackLookupsFromTrackIds(
        selectedIds,
        selectedCollectionId,
        { tryLazyFileIndex: true }
      );
      const { filtered } = filterTrackLookups(trackLookups);
      const collectionName =
        collections.find((collection) => collection.id === selectedCollectionId)?.name ||
        "Selected Tracks";
      const playlistTitle = `Selected Tracks - ${collectionName}`;
      const syntheticPlaylist = buildSyntheticPlaylist(playlistTitle, selectedIds);
      const target = {
        playlist: syntheticPlaylist,
        trackLookups: filtered,
        libraryRootId: selectedCollectionId,
      };

      let activeDevicePathMap = devicePathMap;
      let activeDeviceEntries = deviceEntries;
      if (isWalkmanPreset && devicePathDetectionEnabled) {
        const normalizedTargets = [{ ...target }];
        const { keyMap: targetKeyMap, trackCount: targetTrackCount, hasFullHash } =
          buildTargetKeyMap(normalizedTargets);
        if (targetTrackCount > 0) {
          try {
            const scanResult = await scanDevicePaths({
              preview: false,
              targetKeyMap,
              targetTrackCount,
              computeFullContentHash: hasFullHash,
            });
            activeDevicePathMap = scanResult.map;
            activeDeviceEntries = scanResult.entries;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Device scan failed";
            throw new Error(`Walkman scan failed (${message}).`);
          }
        }
      } else if (!useCompanionApp && devicePathDetectionEnabled && isWalkmanPreset === false) {
        const normalizedTargets = [{ ...target }];
        const { keyMap: targetKeyMap, trackCount: targetTrackCount, hasFullHash } =
          buildTargetKeyMap(normalizedTargets);
        if (
          targetTrackCount > 0 &&
          (devicePathMap.size === 0 || deviceScanStatus !== "done")
        ) {
          try {
            const scanResult = await scanDevicePaths({
              preview: false,
              targetKeyMap,
              targetTrackCount,
              computeFullContentHash: hasFullHash,
            });
            activeDevicePathMap = scanResult.map;
            activeDeviceEntries = scanResult.entries;
          } catch {
            activeDevicePathMap = new Map();
            activeDeviceEntries = [];
          }
        }
      }

      setSyncPhase("writing");
      if (useCompanionApp && !isIpodPreset) {
        const effectivePathStrategy = isWalkmanPreset
          ? "relative-to-playlist"
          : devicePathStrategy;
        const effectiveAbsolutePrefix =
          effectivePathStrategy === "absolute"
            ? deviceAbsolutePrefix.trim()
            : undefined;
        const mappedLookups = devicePathDetectionEnabled
          ? applyDevicePathMap(filtered, activeDevicePathMap, {
              absolutePrefix: effectiveAbsolutePrefix,
              deviceEntries: activeDeviceEntries,
            })
          : filtered;
        const payload = buildCompanionPayload({
          playlist: syntheticPlaylist,
          trackLookups: mappedLookups,
          deviceLabel: profile.label,
        });
        await sendCompanionSync(payload);
        setSyncSuccess(`Sent ${selectedIds.length} track(s) to companion app.`);
      } else {
        await syncPlaylistsToDevice({
          deviceProfile: profile,
          targets: [target],
          devicePathMap: devicePathDetectionEnabled ? activeDevicePathMap : undefined,
          deviceEntries: devicePathDetectionEnabled ? activeDeviceEntries : undefined,
          onlyIncludeMatchedPaths:
            devicePathDetectionEnabled &&
            (isWalkmanPreset || onlyIncludeMatchedPaths),
        });
        const deviceName = isIpodPreset
          ? "iPod"
          : isWalkmanPreset
            ? "Walkman"
            : isZunePreset
              ? "Zune"
              : "device";
        setSyncSuccess(`Synced ${selectedIds.length} track(s) to ${deviceName}.`);
      }
      await refreshDeviceProfiles();
      setSelectedDeviceId(profile.id);
      onDeviceProfileUpdated?.(profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync tracks";
      setSyncError(message);
    } finally {
      setIsSyncing(false);
      setSyncPhase("idle");
      ipodMonitor?.resume();
    }
  }

  async function handleMirrorCollectionSync() {
    setIsSyncing(true);
    setSyncPhase("preparing");
    setSyncError(null);
    setSyncSuccess(null);
    setSyncWarning(null);
    try {
      ipodMonitor?.suspend();
      if (!hasCollectionSync) {
        throw new Error(
          "Collection sync is only available for iPod, Walkman, Generic, and Zune devices."
        );
      }
      if (!selectedCollectionId) {
        throw new Error("Select a collection to sync.");
      }
      await ensureAllLibraryRootAccess([selectedCollectionId]);
      const profile = await prepareProfileForCollectionSync();
      const allTrackIds = collectionTracks.map((track) => track.trackFileId);
      if (allTrackIds.length === 0) {
        throw new Error("Selected collection has no tracks.");
      }
      const trackLookups = await buildTrackLookupsFromTrackIds(
        allTrackIds,
        selectedCollectionId,
        { tryLazyFileIndex: true }
      );
      const { filtered } = filterTrackLookups(trackLookups);
      const collectionName =
        collections.find((collection) => collection.id === selectedCollectionId)?.name ||
        "Collection";
      const playlistTitle = `Collection - ${collectionName}`;
      const syntheticPlaylist = buildSyntheticPlaylist(playlistTitle, allTrackIds);
      const target = {
        playlist: syntheticPlaylist,
        trackLookups: filtered,
        libraryRootId: selectedCollectionId,
        ...(isIpodPreset && { mirrorMode: true, mirrorDeleteFromDevice }),
      };

      let activeDevicePathMap = devicePathMap;
      let activeDeviceEntries = deviceEntries;
      if (isWalkmanPreset && devicePathDetectionEnabled) {
        const normalizedTargets = [{ ...target }];
        const { keyMap: targetKeyMap, trackCount: targetTrackCount, hasFullHash } =
          buildTargetKeyMap(normalizedTargets);
        if (targetTrackCount > 0) {
          try {
            const scanResult = await scanDevicePaths({
              preview: false,
              targetKeyMap,
              targetTrackCount,
              computeFullContentHash: hasFullHash,
            });
            activeDevicePathMap = scanResult.map;
            activeDeviceEntries = scanResult.entries;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Device scan failed";
            throw new Error(`Walkman scan failed (${message}).`);
          }
        }
      } else if (!useCompanionApp && devicePathDetectionEnabled && !isIpodPreset) {
        const normalizedTargets = [{ ...target }];
        const { keyMap: targetKeyMap, trackCount: targetTrackCount, hasFullHash } =
          buildTargetKeyMap(normalizedTargets);
        if (
          targetTrackCount > 0 &&
          (devicePathMap.size === 0 || deviceScanStatus !== "done")
        ) {
          try {
            const scanResult = await scanDevicePaths({
              preview: false,
              targetKeyMap,
              targetTrackCount,
              computeFullContentHash: hasFullHash,
            });
            activeDevicePathMap = scanResult.map;
            activeDeviceEntries = scanResult.entries;
          } catch {
            activeDevicePathMap = new Map();
            activeDeviceEntries = [];
          }
        }
      }

      setSyncPhase("writing");
      if (useCompanionApp && !isIpodPreset) {
        const effectivePathStrategy = isWalkmanPreset
          ? "relative-to-playlist"
          : devicePathStrategy;
        const effectiveAbsolutePrefix =
          effectivePathStrategy === "absolute"
            ? deviceAbsolutePrefix.trim()
            : undefined;
        const mappedLookups = devicePathDetectionEnabled
          ? applyDevicePathMap(filtered, activeDevicePathMap, {
              absolutePrefix: effectiveAbsolutePrefix,
              deviceEntries: activeDeviceEntries,
            })
          : filtered;
        const payload = buildCompanionPayload({
          playlist: syntheticPlaylist,
          trackLookups: mappedLookups,
          deviceLabel: profile.label,
        });
        await sendCompanionSync(payload);
        setSyncSuccess(`Sent full collection to companion app.`);
      } else {
        await syncPlaylistsToDevice({
          deviceProfile: profile,
          targets: [target],
          devicePathMap: devicePathDetectionEnabled ? activeDevicePathMap : undefined,
          deviceEntries: devicePathDetectionEnabled ? activeDeviceEntries : undefined,
          onlyIncludeMatchedPaths:
            devicePathDetectionEnabled &&
            (isWalkmanPreset || onlyIncludeMatchedPaths),
        });
        const deviceName = isIpodPreset
          ? "iPod"
          : isWalkmanPreset
            ? "Walkman"
            : isZunePreset
              ? "Zune"
              : "device";
        setSyncSuccess(
          isIpodPreset
            ? `Mirrored ${collectionName} to iPod.`
            : `Synced full collection (${collectionName}) to ${deviceName}.`
        );
      }
      await refreshDeviceProfiles();
      setSelectedDeviceId(profile.id);
      onDeviceProfileUpdated?.(profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to mirror collection";
      setSyncError(message);
    } finally {
      setIsSyncing(false);
      setSyncPhase("idle");
      ipodMonitor?.resume();
    }
  }

  async function scanDevicePaths(options: {
    preview: boolean;
    targetKeyMap?: Map<string, Set<string>>;
    targetTrackCount?: number;
    computeFullContentHash?: boolean;
  }): Promise<{
    map: Map<string, string>;
    entries: DeviceScanEntry[];
    finalProgress?: DeviceScanProgress;
  }> {
    if (!deviceHandleRef) {
      throw new Error("Select a device folder before scanning");
    }
    setDeviceScanStatus("scanning");
    setDeviceScanProgress({ scanned: 0, matched: 0, hashed: 0 });
    const handle = await getDirectoryHandle(deviceHandleRef);
    if (!handle) {
      throw new Error("Device folder handle not found");
    }
    const includePaths = deviceScanRoots
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const result = await scanDeviceForPaths({
      handle,
      onProgress: (progress) => setDeviceScanProgress(progress),
      includePaths: includePaths.length > 0 ? includePaths : undefined,
      computeContentHash: true,
      computeFullContentHash: options.computeFullContentHash,
      targetKeyMap: options.targetKeyMap,
      targetTrackCount: options.targetTrackCount,
    });
    const map = result.pathMap;
    setDevicePathMap(map);
    setDeviceEntries(result.entries);
    setDeviceScanStatus("done");
    if (selectedDeviceId !== "new" && result.entries.length > 0) {
      const now = Date.now();
      const entries = result.entries.map((entry) => ({
        id: `${selectedDeviceId}-${entry.matchKey}`,
        deviceId: selectedDeviceId,
        matchKey: entry.matchKey,
        relativePath: entry.relativePath,
        contentHash: entry.contentHash,
        fullContentHash: entry.fullContentHash,
        name: entry.name,
        size: entry.size,
        mtime: entry.mtime,
        updatedAt: now,
      }));
      await saveDeviceFileIndexEntries(entries);
    }
    if (options.preview) {
      const targets = getSyncTargets();
      const targetsWithLookups = await Promise.all(
        targets.map(async (target) => ({
          ...target,
          trackLookups: await buildTrackLookups(target.playlist, target.libraryRootId),
        }))
      );
      const combinedLookups = targetsWithLookups.flatMap((target) => target.trackLookups);
      if (combinedLookups.length > 0) {
        buildDevicePreview(combinedLookups, map);
      }
    }
    return {
      map,
      entries: result.entries,
      finalProgress: result.finalProgress,
    };
  }

  function buildCompanionPayload(options: {
    playlist: GeneratedPlaylist;
    trackLookups: TrackLookup[];
    deviceLabel: string;
  }) {
    const { playlist, trackLookups, deviceLabel } = options;
    const exportConfig: PlaylistLocationConfig = {
      playlistLocation: devicePlaylistFolder ? "subfolder" : "root",
      playlistSubfolderPath: devicePlaylistFolder || undefined,
      pathStrategy: devicePathStrategy,
      absolutePathPrefix: devicePathStrategy === "absolute" ? deviceAbsolutePrefix : undefined,
    };

    const tracks = playlist.trackFileIds
      .map((trackFileId) => {
        const lookup = trackLookups.find((item) => item.track.trackFileId === trackFileId);
        if (!lookup) {
          return null;
        }
        const { path, hasRelativePath } = getTrackPath(lookup, exportConfig);
        if (!path) {
          return null;
        }
        return {
          trackFileId,
          path,
          hasRelativePath,
          title: lookup.track.tags.title || "Unknown Title",
          artist: lookup.track.tags.artist || "Unknown Artist",
          album: lookup.track.tags.album || "Unknown Album",
        };
      })
      .filter((track): track is NonNullable<typeof track> => Boolean(track));

    return {
      exportedAt: new Date().toISOString(),
      playlist: {
        id: playlist.id,
        title: playlist.title,
        description: playlist.description,
        trackCount: tracks.length,
      },
      device: {
        label: deviceLabel,
        playlistFolder: devicePlaylistFolder,
        pathStrategy: devicePathStrategy,
        absolutePathPrefix: deviceAbsolutePrefix || undefined,
      },
      tracks,
    };
  }

  async function sendCompanionSync(payload: unknown): Promise<any> {
    const url = "/api/companion/sync";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Companion app sync failed (${response.status})${errorText ? `: ${errorText}` : ""}`
        );
      }
      try {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return await response.json();
        }
        return null;
      } catch (err) {
        logger.warn("Failed to parse companion sync response", err);
        return null;
      }
    } catch (error) {
      logger.warn("Companion sync proxy failed", error);
      throw error;
    }
  }

  function buildDevicePreview(trackLookups: TrackLookup[], map: Map<string, string>) {
    const resolved: string[] = [];
    const missing: string[] = [];
    let matched = 0;
    let total = 0;
    for (const lookup of trackLookups) {
      total += 1;
      if (!lookup.fileIndex) {
        missing.push(lookup.track.tags.title || lookup.track.trackFileId);
        continue;
      }
      const candidates = buildDeviceMatchCandidates({
        filename: lookup.fileIndex.name,
        size: lookup.fileIndex.size,
        mtime: lookup.fileIndex.mtime,
      });
      let mapped: string | undefined;
      for (const candidate of candidates) {
        const candidatePath = map.get(candidate);
        if (candidatePath) {
          mapped = candidatePath;
          break;
        }
      }
      if (mapped) {
        resolved.push(mapped);
        matched += 1;
      } else {
        missing.push(lookup.fileIndex.relativePath || lookup.fileIndex.name);
      }
    }
    setDevicePreviewPaths({
      resolved: resolved.slice(0, 5),
      missing: missing.slice(0, 5),
    });
    const ratio = total > 0 ? matched / total : 0;
    setDeviceMatchStats({ matched, total, ratio });
  }

  async function handleScanDevicePaths() {
    setSyncError(null);
    setSyncSuccess(null);
    setDeviceScanStatus("scanning");
    setDeviceScanProgress({ scanned: 0, matched: 0, hashed: 0 });
    setMissingMetadataCount(0);

    try {
      const targets = getSyncTargets();
      const targetsWithLookups = await Promise.all(
        targets.map(async (target) => ({
          ...target,
          trackLookups: await buildTrackLookups(target.playlist, target.libraryRootId, {
            tryLazyFileIndex: true,
          }),
        }))
      );
      let totalMissingMetadata = 0;
      const allMissingRootIds: string[] = [];
      const normalizedTargets = targetsWithLookups.map((target) => {
        const { filtered, missingMetadataCount, missingTrackRootIds } =
          filterTrackLookups(target.trackLookups);
        totalMissingMetadata += missingMetadataCount;
        allMissingRootIds.push(...missingTrackRootIds);
        return {
          ...target,
          trackLookups: filtered,
        };
      });
      setMissingMetadataCount(totalMissingMetadata);
      if (totalMissingMetadata > 0) {
        const rootIds = Array.from(
          new Set(targets.map((t) => t.libraryRootId).filter(Boolean))
        ) as string[];
        const primaryRootId = rootIds[0];
        const missingInOtherRoot =
          primaryRootId &&
          allMissingRootIds.length > 0 &&
          allMissingRootIds.filter((id) => id !== primaryRootId).length >=
            Math.ceil(allMissingRootIds.length / 2);
        setSyncWarning(
          missingInOtherRoot
            ? `${totalMissingMetadata} track(s) may be in a different collection. Try switching collection or rescanning your library.`
            : `${totalMissingMetadata} track(s) are missing local file metadata. ` +
                "Rescan your library to improve device path detection."
        );
      }
      const { keyMap: targetKeyMap, trackCount: targetTrackCount, hasFullHash } =
        buildTargetKeyMap(normalizedTargets);
      if (targetTrackCount === 0) {
        setSyncWarning(
          "No track metadata available for scan targets. Try rescanning your library first."
        );
        setDeviceScanStatus("done");
        setDeviceScanProgress({ scanned: 0, matched: 0, hashed: 0 });
        const totalTracks = targetsWithLookups.flatMap((t) => t.trackLookups).length;
        setKeyCoverageLog({
          tracksWithMetadata: 0,
          totalTracks,
          keyMapSize: 0,
          sampleLibraryKeys: [],
          scanMapSize: 0,
          scanEntriesCount: 0,
          scanned: 0,
          matched: 0,
          hashed: 0,
          sampleDevicePaths: [],
        });
        return;
      }
      const scanResult = await scanDevicePaths({
        preview: true,
        targetKeyMap,
        targetTrackCount,
        computeFullContentHash: hasFullHash,
      });
      const totalTracks = targetsWithLookups.flatMap((t) => t.trackLookups).length;
      const tracksWithMetadata = normalizedTargets.flatMap((t) => t.trackLookups).length;
      const sampleLibraryKeys = Array.from(targetKeyMap.keys()).slice(0, 8);
      const pathValues = Array.from(scanResult.map.values());
      const uniquePaths = Array.from(new Set(pathValues));
      setKeyCoverageLog({
        tracksWithMetadata,
        totalTracks,
        keyMapSize: targetKeyMap.size,
        sampleLibraryKeys,
        scanMapSize: scanResult.map.size,
        scanEntriesCount: scanResult.entries.length,
        scanned: scanResult.finalProgress?.scanned ?? 0,
        matched: scanResult.finalProgress?.matched ?? 0,
        hashed: scanResult.finalProgress?.hashed ?? 0,
        sampleDevicePaths: uniquePaths.slice(0, 8),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to scan device paths";
      setDeviceScanStatus("error");
      setSyncError(message);
      setKeyCoverageLog(null);
    }
  }

  async function handleRescanLibraryFromDeviceSync() {
    setRescanError(null);
    setRescanStatus("requesting");
    setRescanProgress({ found: 0, scanned: 0 });
    try {
      const targets = getSyncTargets();
      const targetRootIds = new Set(
        targets.map((target) => target.libraryRootId).filter(Boolean)
      );
      if (targetRootIds.size > 1) {
        throw new Error(
          "Multiple collections are selected. Please rescan from the Library page."
        );
      }
      const targetRootId = targetRootIds.size === 1 ? Array.from(targetRootIds)[0] : undefined;
      const root = await resolveLibraryRoot(targetRootId);
      if (!root) {
        throw new Error("No saved library found. Open the Library page and select a folder.");
      }
      if (root.mode !== "handle") {
        throw new Error("Library is in fallback mode. Re-select the library folder to rescan.");
      }
      const permission = await requestLibraryPermission(root);
      if (permission !== "granted") {
        throw new Error("Library permission not granted.");
      }
      setRescanStatus("scanning");
      const existingLibraryRootId =
        targetRootId ?? (await getCurrentCollectionId()) ?? undefined;
      await scanLibraryWithPersistence(root, (progress) => {
        setRescanProgress({ found: progress.found, scanned: progress.scanned });
      }, undefined, {
        existingLibraryRootId,
      });
      const updatedTargetsWithLookups = await Promise.all(
        targets.map(async (target) => ({
          ...target,
          trackLookups: await buildTrackLookups(target.playlist, target.libraryRootId),
        }))
      );
      let totalMissingMetadata = 0;
      updatedTargetsWithLookups.forEach((target) => {
        const { missingMetadataCount } = filterTrackLookups(target.trackLookups);
        totalMissingMetadata += missingMetadataCount;
      });
      setMissingMetadataCount(totalMissingMetadata);
      if (totalMissingMetadata === 0) {
        setSyncWarning(null);
      }
      setRescanStatus("done");
      setSyncWarning("Library rescan complete. Re-scan the device to refresh path mapping.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Library rescan failed.";
      setRescanError(message);
      setRescanStatus("error");
    }
  }

  async function handleExportForIpodCompanion() {
    setSyncError(null);
    setSyncSuccess(null);
    try {
      if (playlists && playlists.length > 0) {
        throw new Error("Select a single playlist for iPod export");
      }
      if (!playlist) {
        throw new Error("Select a playlist for iPod export");
      }
      const trackLookups = await buildTrackLookups(playlist, libraryRootId, {
        tryLazyFileIndex: true,
      });
      const mappedLookups = devicePathDetectionEnabled
        ? applyDevicePathMap(trackLookups, devicePathMap, {
            deviceEntries,
          })
        : trackLookups;

      const exportConfig: PlaylistLocationConfig = {
        playlistLocation: devicePlaylistFolder ? "subfolder" : "root",
        playlistSubfolderPath: devicePlaylistFolder || undefined,
        pathStrategy: devicePathStrategy,
        absolutePathPrefix:
          devicePathStrategy === "absolute" ? deviceAbsolutePrefix : undefined,
      };

      const tracks = playlist.trackFileIds.map((trackFileId) => {
        const lookup = mappedLookups.find((item) => item.track.trackFileId === trackFileId);
        if (!lookup) {
          return {
            trackFileId,
            path: null,
            title: "Unknown Title",
            artist: "Unknown Artist",
          };
        }
        const { path, hasRelativePath } = getTrackPath(lookup, exportConfig);
        return {
          trackFileId,
          path,
          hasRelativePath,
          title: lookup.track.tags.title || "Unknown Title",
          artist: lookup.track.tags.artist || "Unknown Artist",
          album: lookup.track.tags.album || "Unknown Album",
        };
      });

      const payload = {
        exportedAt: new Date().toISOString(),
        playlist: {
          id: playlist.id,
          title: playlist.title,
          description: playlist.description,
          trackCount: playlist.trackFileIds.length,
        },
        device: {
          label: deviceLabel || "USB Device",
          playlistFolder: devicePlaylistFolder,
          pathStrategy: devicePathStrategy,
          absolutePathPrefix: deviceAbsolutePrefix || undefined,
        },
        tracks,
      };

      const filename = `${playlist.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_ipod.json`;
      downloadFile(JSON.stringify(payload, null, 2), filename, "application/json");
      setSyncSuccess("Exported iPod companion payload");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to export iPod payload";
      setSyncError(message);
    }
  }

  async function executeJellyfinExport(
    filteredTargets: Array<{
      playlist: GeneratedPlaylist;
      trackLookups: TrackLookup[];
      libraryRootId?: string;
    }>
  ) {
    if (filteredTargets.length === 0) {
      throw new Error("No tracks to export");
    }
    const containerPrefix = normalizeContainerPrefix(jellyfinContainerPrefix);
    const pathStrategy =
      jellyfinExportMode === "download" ? "absolute" : "relative-to-library-root";
    if (pathStrategy === "absolute" && !containerPrefix) {
      throw new Error("Enter the Jellyfin container library prefix.");
    }
    const exportConfig: PlaylistLocationConfig = {
      playlistLocation: "root",
      pathStrategy,
      absolutePathPrefix: pathStrategy === "absolute" ? containerPrefix : undefined,
    };
    const invalidPaths: string[] = [];
    for (const target of filteredTargets) {
      for (const lookup of target.trackLookups) {
        const { path } = getTrackPath(lookup, exportConfig);
        if (!path) continue;
        if (pathStrategy === "relative-to-library-root") {
          if (
            path.startsWith("..") ||
            path.includes("/../") ||
            path.startsWith("/") ||
            /^[a-zA-Z]:[\\/]/.test(path)
          ) {
            invalidPaths.push(path);
          }
        } else if (!path.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(path)) {
          invalidPaths.push(path);
        }
        if (invalidPaths.length >= 5) break;
      }
      if (invalidPaths.length >= 5) break;
    }
    if (invalidPaths.length > 0) {
      setSyncWarning(
        `Found ${invalidPaths.length} path(s) that may not resolve in Jellyfin. ` +
          `Examples: ${invalidPaths.slice(0, 3).join(", ")}`
      );
    }
    setSyncPhase("writing");
    if (jellyfinExportMode === "library-root") {
      const rootIds = Array.from(
        new Set(filteredTargets.map((target) => target.libraryRootId).filter(Boolean))
      ) as string[];
      if (rootIds.length === 0) {
        throw new Error("Jellyfin export requires playlists with a library collection.");
      }
      if (rootIds.length > 1) {
        throw new Error("Select playlists from a single library for Jellyfin export.");
      }
      const root = await resolveLibraryRoot(rootIds[0]);
      if (!root) {
        throw new Error("No saved library found. Open the Library page and select a folder.");
      }
      if (root.mode !== "handle") {
        throw new Error("Library is in fallback mode. Re-select the library folder.");
      }
      const permission = await requestLibraryPermission(root);
      if (permission !== "granted") {
        throw new Error("Library permission not granted.");
      }
      const handle = await getDirectoryHandle(root.handleId!);
      if (!handle) {
        throw new Error("Library folder handle not found.");
      }
      const writePermission = await handle.requestPermission({ mode: "readwrite" });
      if (writePermission !== "granted") {
        throw new Error("Write permission not granted for library folder.");
      }
      for (const target of filteredTargets) {
        const result = exportM3U(
          target.playlist,
          target.trackLookups,
          exportConfig,
          "jellyfin"
        );
        const filename = `${formatPlaylistFilenameStem(target.playlist.title)}.m3u`;
        const fileHandle = await handle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(result.content);
        await writable.close();
      }
      setSyncSuccess(`Exported ${filteredTargets.length} playlist(s) to library root`);
    } else {
      for (const target of filteredTargets) {
        const result = exportM3U(
          target.playlist,
          target.trackLookups,
          exportConfig,
          "jellyfin"
        );
        const filename = `${formatPlaylistFilenameStem(target.playlist.title)}.m3u`;
        downloadFile(result.content, filename, result.mimeType);
      }
      setSyncSuccess(`Downloaded ${filteredTargets.length} playlist(s) for Jellyfin`);
    }
    const profile = await saveDeviceProfile({
      id: selectedDeviceId === "new" ? undefined : selectedDeviceId,
      label: deviceLabel.trim() || "Jellyfin",
      handleRef: undefined,
      deviceType: "jellyfin",
      playlistFormat: "m3u",
      playlistFolder: "",
      pathStrategy,
      absolutePathPrefix: pathStrategy === "absolute" ? containerPrefix : undefined,
      containerLibraryPrefix: containerPrefix || undefined,
      jellyfinExportMode,
    });
    await refreshDeviceProfiles();
    if (selectedDeviceId === "new") {
      setSelectedDeviceId(profile.id);
    }
  }

  async function handleExportSelectedTracks() {
    if (!isJellyfinPreset) return;
    setIsSyncing(true);
    setSyncPhase("preparing");
    setSyncError(null);
    setSyncSuccess(null);
    setSyncWarning(null);
    try {
      if (!selectedCollectionId) {
        throw new Error("Select a collection to export.");
      }
      const selectedIds = Array.from(selectedCollectionTrackIds);
      if (selectedIds.length === 0) {
        throw new Error("Select at least one track to export.");
      }
      await ensureAllLibraryRootAccess([selectedCollectionId]);
      const trackLookups = await buildTrackLookupsFromTrackIds(
        selectedIds,
        selectedCollectionId,
        { tryLazyFileIndex: true }
      );
      const { filtered } = filterTrackLookups(trackLookups);
      const collectionName =
        collections.find((collection) => collection.id === selectedCollectionId)?.name ||
        "Selected Tracks";
      const playlistTitle = `Selected Tracks - ${collectionName}`;
      const syntheticPlaylist = buildSyntheticPlaylist(playlistTitle, selectedIds);
      await executeJellyfinExport([
        {
          playlist: syntheticPlaylist,
          trackLookups: filtered,
          libraryRootId: selectedCollectionId,
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to export selected tracks";
      setSyncError(message);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleExportFullCollection() {
    if (!isJellyfinPreset) return;
    setIsSyncing(true);
    setSyncPhase("preparing");
    setSyncError(null);
    setSyncSuccess(null);
    setSyncWarning(null);
    try {
      if (!selectedCollectionId) {
        throw new Error("Select a collection to export.");
      }
      const allTrackIds = collectionTracks.map((track) => track.trackFileId);
      if (allTrackIds.length === 0) {
        throw new Error("Selected collection has no tracks.");
      }
      await ensureAllLibraryRootAccess([selectedCollectionId]);
      const trackLookups = await buildTrackLookupsFromTrackIds(
        allTrackIds,
        selectedCollectionId,
        { tryLazyFileIndex: true }
      );
      const { filtered } = filterTrackLookups(trackLookups);
      const collectionName =
        collections.find((collection) => collection.id === selectedCollectionId)?.name ||
        "Collection";
      const playlistTitle = `Collection - ${collectionName}`;
      const syntheticPlaylist = buildSyntheticPlaylist(playlistTitle, allTrackIds);
      await executeJellyfinExport([
        {
          playlist: syntheticPlaylist,
          trackLookups: filtered,
          libraryRootId: selectedCollectionId,
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to export full collection";
      setSyncError(message);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleExportForJellyfin() {
    setIsSyncing(true);
    setSyncPhase("preparing");
    setSyncError(null);
    setSyncSuccess(null);
    setSyncWarning(null);
    setMissingMetadataCount(0);
    try {
      const targets = getSyncTargets();
      if (targets.length === 0) {
        throw new Error("Select at least one playlist to export");
      }
      const targetsWithLookups = await Promise.all(
        targets.map(async (target) => ({
          ...target,
          trackLookups: await buildTrackLookups(target.playlist, target.libraryRootId, {
            tryLazyFileIndex: true,
          }),
        }))
      );
      let totalMissingMetadata = 0;
      const allMissingRootIds: string[] = [];
      const filteredTargets = targetsWithLookups.map((target) => {
        const { filtered, missingMetadataCount, missingTrackRootIds } =
          filterTrackLookups(target.trackLookups);
        totalMissingMetadata += missingMetadataCount;
        allMissingRootIds.push(...missingTrackRootIds);
        return { ...target, trackLookups: filtered };
      });
      setMissingMetadataCount(totalMissingMetadata);
      if (totalMissingMetadata > 0) {
        const rootIds = Array.from(
          new Set(targets.map((t) => t.libraryRootId).filter(Boolean))
        ) as string[];
        const primaryRootId = rootIds[0];
        const missingInOtherRoot =
          primaryRootId &&
          allMissingRootIds.length > 0 &&
          allMissingRootIds.filter((id) => id !== primaryRootId).length >=
            Math.ceil(allMissingRootIds.length / 2);
        setSyncWarning(
          missingInOtherRoot
            ? `${totalMissingMetadata} track(s) may be in a different collection. Try switching collection or rescanning your library.`
            : `${totalMissingMetadata} track(s) are missing local file metadata. ` +
                "Rescan your library to improve path accuracy."
        );
      }

      await executeJellyfinExport(filteredTargets);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to export Jellyfin playlist";
      setSyncError(message);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleCheckWriteAccess() {
    setWriteAccessStatus("unknown");
    setWriteAccessMessage(null);
    if (!deviceHandleRef) {
      setWriteAccessStatus("error");
      setWriteAccessMessage("Select a device folder to check write access.");
      return;
    }
    try {
      setIsCheckingWriteAccess(true);
      await checkDeviceWriteAccess(deviceHandleRef);
      setWriteAccessStatus("ok");
      setWriteAccessMessage("Write access confirmed.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NoModificationAllowedError") {
        setWriteAccessStatus("read-only");
        setWriteAccessMessage("Device is read-only. Remount with write access.");
      } else {
        const message = err instanceof Error ? err.message : "Write check failed.";
        setWriteAccessStatus("error");
        setWriteAccessMessage(message);
      }
    } finally {
      setIsCheckingWriteAccess(false);
    }
  }

  function handleStartEditDeviceName() {
    setEditingDeviceName(deviceLabel);
    setIsEditingDeviceName(true);
  }

  function handleCancelEditDeviceName() {
    setIsEditingDeviceName(false);
  }

  async function handleSaveDeviceName() {
    const label =
      editingDeviceName.trim() || (isJellyfinPreset ? "Jellyfin" : "USB Device");
    setDeviceLabel(label);
    setIsEditingDeviceName(false);
    await handleSaveDeviceSettings(label);
  }

  async function handleSaveDeviceSettings(overrideLabel?: string) {
    setIsSavingSettings(true);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const label =
        (overrideLabel ?? deviceLabel.trim()) || (isJellyfinPreset ? "Jellyfin" : "USB Device");
      const effectivePlaylistFolder = isWalkmanPreset ? "MUSIC" : devicePlaylistFolder.trim();
      const effectivePathStrategy = isWalkmanPreset
        ? "relative-to-playlist"
        : devicePathStrategy;
      const effectiveAbsolutePrefix =
        effectivePathStrategy === "absolute" ? deviceAbsolutePrefix.trim() || undefined : undefined;
      const modelInfo = ipodUsbInfo?.productId
        ? getModelInfo(ipodUsbInfo.productId)
        : null;

      const profile = await saveDeviceProfile({
        id: selectedDeviceId === "new" ? undefined : selectedDeviceId,
        label,
        handleRef: useCompanionApp ? undefined : deviceHandleRef || undefined,
        deviceType: isIpodPreset ? "ipod" : devicePreset,
        playlistFormat: devicePlaylistFormat,
        playlistFolder: effectivePlaylistFolder,
        pathStrategy: effectivePathStrategy,
        absolutePathPrefix: effectiveAbsolutePrefix,
        containerLibraryPrefix: isJellyfinPreset
          ? normalizeContainerPrefix(jellyfinContainerPrefix) || undefined
          : undefined,
        jellyfinExportMode: isJellyfinPreset ? jellyfinExportMode : undefined,
        usbVendorId: ipodUsbInfo?.productId ? 0x05ac : undefined,
        usbProductId: ipodUsbInfo?.productId,
        usbSerialNumber: ipodUsbInfo?.serialNumber,
        usbProductName: ipodUsbInfo?.productName,
        usbManufacturerName: ipodUsbInfo?.manufacturerName,
        ipodModelName: modelInfo?.name,
        ipodModelNumber: modelInfo?.modelNumStr,
        ipodRequiresEncryption: ipodUsbInfo?.productId
          ? requiresEncryption(ipodUsbInfo.productId)
          : undefined,
      });
      await refreshDeviceProfiles();
      if (selectedDeviceId === "new") {
        setSelectedDeviceId(profile.id);
      }
      setSyncSuccess("Device settings saved.");
      onDeviceProfileUpdated?.(profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save device settings";
      setSyncError(message);
    } finally {
      setIsSavingSettings(false);
    }
  }

  const selectedDeviceProfile =
    deviceProfileOverride ||
    (selectedDeviceId === "new"
      ? null
      : deviceProfiles.find((profile) => profile.id === selectedDeviceId) || null);

  const renderDeviceTitlePortal = () => {
    if (
      typeof document === "undefined" ||
      !deviceTitleSlotId ||
      !deviceProfileOverride
    ) {
      return null;
    }
    const slot = document.getElementById(deviceTitleSlotId);
    if (!slot) return null;
    const statusLabel =
      deviceStatus === "available"
        ? "Available"
        : deviceStatus === "companion"
          ? "Companion"
          : deviceStatus === "export"
            ? "Export"
            : deviceStatus === "needs_access"
              ? "Needs access"
              : deviceStatus === "missing"
                ? "Missing"
                : "Checking";
    return createPortal(
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0 group">
          {isEditingDeviceName ? (
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <input
                type="text"
                value={editingDeviceName}
                onChange={(e) => setEditingDeviceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveDeviceName();
                  else if (e.key === "Escape") handleCancelEditDeviceName();
                }}
                placeholder="My device"
                className="flex-1 px-2 py-1 bg-app-surface text-app-primary rounded-sm border border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-sm font-semibold"
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleSaveDeviceName()}
                disabled={isSavingSettings || isSyncing}
                className="p-1 hover:bg-accent-primary/20 text-accent-primary rounded-sm transition-colors shrink-0 disabled:opacity-50"
                aria-label="Save"
              >
                <Check className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCancelEditDeviceName}
                className="p-1 hover:bg-app-surface-hover text-app-secondary rounded-sm transition-colors shrink-0"
                aria-label="Cancel"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-app-primary text-base font-semibold truncate">
                {deviceLabel || "Device"}
              </span>
              <button
                type="button"
                onClick={handleStartEditDeviceName}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-surface rounded-sm transition-all text-app-secondary hover:text-accent-primary shrink-0"
                aria-label="Edit device name"
                title="Edit device name"
              >
                <Edit className="size-3" />
              </button>
            </div>
          )}
        </div>
        <div className="text-app-tertiary text-xs mt-1 flex items-center gap-2 flex-wrap">
          <span>{deviceProfileOverride?.playlistFolder || "Device root"}</span>
          <span className="text-app-border">·</span>
          {deviceStatus === "available" ? (
            <>
              <Check className="size-3.5 text-green-500 shrink-0" />
              <span className="text-green-500">{statusLabel}</span>
            </>
          ) : (
            <span>{statusLabel}</span>
          )}
        </div>
      </div>,
      slot
    );
  };

  const renderDeviceDetailsPortal = () => {
    if (
      typeof document === "undefined" ||
      !deviceDetailsSlotId ||
      !deviceProfileOverride
    ) {
      return null;
    }
    const slot = document.getElementById(deviceDetailsSlotId);
    if (!slot) return null;
    return createPortal(
      <div className="space-y-4">
        {!deviceTitleSlotId && (
          <div className="flex items-center gap-1.5 min-w-0 group">
            {isEditingDeviceName ? (
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <input
                  type="text"
                  value={editingDeviceName}
                  onChange={(e) => setEditingDeviceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveDeviceName();
                    else if (e.key === "Escape") handleCancelEditDeviceName();
                  }}
                  placeholder="My device"
                  className="flex-1 px-2 py-1 bg-app-surface text-app-primary rounded-sm border border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveDeviceName()}
                  disabled={isSavingSettings || isSyncing}
                  className="p-1 hover:bg-accent-primary/20 text-accent-primary rounded-sm transition-colors shrink-0 disabled:opacity-50"
                  aria-label="Save"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditDeviceName}
                  className="p-1 hover:bg-app-surface-hover text-app-secondary rounded-sm transition-colors shrink-0"
                  aria-label="Cancel"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-app-primary text-sm font-medium truncate">
                  {deviceLabel || "Device"}
                </span>
                <button
                  type="button"
                  onClick={handleStartEditDeviceName}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-surface rounded-sm transition-all text-app-secondary hover:text-accent-primary shrink-0"
                  aria-label="Edit device name"
                  title="Edit device name"
                >
                  <Edit className="size-3" />
                </button>
              </div>
            )}
          </div>
        )}
        {isIpodPreset && (
          <div>
            <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
              iPod Detection & Setup
            </label>
            {!supportsWebUSB() && (
              <div className="text-xs text-yellow-500">
                WebUSB is required for iPod setup. Use a Chromium browser.
              </div>
            )}
            {supportsWebUSB() && (
              <div className="text-xs text-app-tertiary">
                Detect the iPod via WebUSB, then select its folder to sync.
              </div>
            )}
            {ipodSetupMessage && (
              <div className="text-xs text-app-tertiary mt-2">{ipodSetupMessage}</div>
            )}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDetectIpodUsb}
                disabled={!supportsWebUSB()}
                className="inline-flex items-center px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover disabled:opacity-50"
              >
                Detect iPod
              </button>
              <button
                type="button"
                onClick={handleSelectDeviceFolder}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover"
              >
                <HardDrive className="size-3.5" />
                {deviceHandleRef ? "Change iPod Folder" : "Select iPod Folder"}
              </button>
              <button
                type="button"
                onClick={handleRunIpodSetup}
                disabled={
                  !supportsWebUSB() || !deviceHandleRef || ipodSetupStatus === "checking"
                }
                className="inline-flex items-center px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover disabled:opacity-50"
              >
                {ipodSetupStatus === "checking" ? "Setting up..." : "Run iPod Setup"}
              </button>
              {!supportsWebUSB() && ipodSetupStatus === "needs_setup" && (
                <button
                  type="button"
                  onClick={handleSkipIpodSetup}
                  className="inline-flex items-center px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover"
                >
                  Skip Setup
                </button>
              )}
              <button
                type="button"
                onClick={handleCheckWriteAccess}
                disabled={!deviceHandleRef || isCheckingWriteAccess || useCompanionApp}
                className="inline-flex items-center px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover disabled:opacity-50"
              >
                {isCheckingWriteAccess ? "Checking write access..." : "Check write access"}
              </button>
              {writeAccessStatus === "ok" && (
                <Check className="size-4 text-green-500 shrink-0" aria-label="Writable" />
              )}
              {writeAccessStatus === "read-only" && (
                <span className="text-[11px] text-yellow-500">Read-only</span>
              )}
              {writeAccessStatus === "error" && (
                <X className="size-4 text-red-500 shrink-0" aria-label="Check failed" />
              )}
              {ipodSetupStatus === "ready" && (
                <span className="text-[11px] text-green-500">Ready</span>
              )}
              {ipodSetupStatus === "needs_setup" && (
                <span className="text-[11px] text-yellow-500">Setup required</span>
              )}
              {ipodSetupStatus === "error" && (
                <span className="text-[11px] text-red-500">Setup failed</span>
              )}
            </div>
            {(ipodUsbInfo || ipodKnownDevices.length > 0 || ipodDeviceInfo) && (
              <div className="mt-3 text-xs text-app-tertiary space-y-1">
                {ipodUsbInfo && (
                  <div>
                    Detected: {ipodUsbInfo.productName || "iPod"}{" "}
                    {ipodUsbInfo.serialNumber ? `(${ipodUsbInfo.serialNumber})` : ""}
                  </div>
                )}
                {ipodDeviceInfo && (
                  <div>
                    Device: {ipodDeviceInfo.model_name || "iPod"}{" "}
                    {ipodDeviceInfo.generation_name
                      ? `(${ipodDeviceInfo.generation_name})`
                      : ""}
                  </div>
                )}
                {(ipodDeviceInfo?.capacity_gb != null ||
                  (ipodTrackIndexStatus === "ready" &&
                    ipodTrackIndex.usedBytes != null)) && (
                  <div>
                    Storage:{" "}
                    {ipodDeviceInfo?.capacity_gb != null && (
                      <span>
                        {ipodDeviceInfo.capacity_gb.toFixed(2)} GB capacity
                      </span>
                    )}
                    {ipodDeviceInfo?.capacity_gb != null &&
                      ipodTrackIndexStatus === "ready" &&
                      ipodTrackIndex.usedBytes != null && (
                        <span> · </span>
                      )}
                    {ipodTrackIndexStatus === "ready" &&
                      ipodTrackIndex.usedBytes != null && (
                        <span>
                          {(ipodTrackIndex.usedBytes / 1e9).toFixed(2)} GB used (music)
                        </span>
                      )}
                    {ipodDeviceInfo?.capacity_gb != null &&
                      ipodTrackIndexStatus === "ready" &&
                      ipodTrackIndex.usedBytes != null && (
                        <>
                          <span> · </span>
                          <span>
                            {(Math.max(
                              0,
                              ipodDeviceInfo.capacity_gb * 1e9 -
                                (ipodTrackIndex.usedBytes ?? 0)
                            ) / 1e9).toFixed(2)}{" "}
                            GB free
                          </span>
                        </>
                      )}
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-app-border flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-app-tertiary">
              <span>
                1. Detect iPod (WebUSB){" "}
                {ipodUsbInfo ? <span className="text-green-500">✓</span> : null}
              </span>
              <span>
                2. Select iPod folder{" "}
                {deviceHandleRef ? <span className="text-green-500">✓</span> : null}
              </span>
              <span>
                3. Run iPod setup{" "}
                {ipodSetupStatus === "ready" ? (
                  <span className="text-green-500">✓</span>
                ) : null}
              </span>
            </div>
          </div>
        )}
      </div>,
      slot
    );
  };

  return (
    <>
      {renderDeviceTitlePortal()}
      {renderDeviceDetailsPortal()}
      <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-4">
      {!supportsFileSystemAccess() &&
        !useCompanionApp &&
        !(isJellyfinPreset && jellyfinExportMode === "download") && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-sm p-3 text-yellow-500 text-sm">
          USB sync requires a Chromium browser that supports the File System Access API.
        </div>
      )}

      {syncError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-3 text-red-500 text-sm">
          {syncError}
        </div>
      )}
      {syncWarning && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-sm p-3 text-yellow-500 text-sm">
          {syncWarning}
        </div>
      )}
      {syncSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-sm p-3 text-green-500 text-sm">
          {syncSuccess}
        </div>
      )}
      {isSyncing && syncQueueStatus.total > 0 && (
        <div className="bg-app-surface border border-app-border rounded-sm p-3 text-xs text-app-secondary">
          Syncing {syncQueueStatus.currentIndex}/{syncQueueStatus.total}
          {syncQueueStatus.currentTitle ? ` • ${syncQueueStatus.currentTitle}` : ""}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {showDeviceSelector && !deviceProfileOverride && (
          <>
            <div>
              <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                Device Profile
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
              >
                <option value="new">New device...</option>
                {deviceProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>

            {selectedDeviceId === "new" && (
              <div>
                <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                  Preset
                </label>
                <select
                  value={devicePreset}
                  onChange={(e) => setDevicePreset(e.target.value as typeof devicePreset)}
                  className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
                >
                  <option value="walkman">Sony Walkman</option>
                  <option value="generic">Generic USB</option>
                  <option value="jellyfin">Jellyfin (Docker)</option>
                  <option value="zune">Microsoft Zune (Experimental)</option>
                  <option value="ipod">Apple iPod (iTunesDB)</option>
                </select>
              </div>
            )}
          </>
        )}

        {(!deviceDetailsSlotId || !deviceProfileOverride) && (
          <div className="flex items-center gap-1.5 min-w-0 group">
            {isEditingDeviceName ? (
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <input
                  type="text"
                  value={editingDeviceName}
                  onChange={(e) => setEditingDeviceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveDeviceName();
                    else if (e.key === "Escape") handleCancelEditDeviceName();
                  }}
                  placeholder="My device"
                  className="flex-1 px-2 py-1 bg-app-surface text-app-primary rounded-sm border border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveDeviceName()}
                  disabled={isSavingSettings || isSyncing}
                  className="p-1 hover:bg-accent-primary/20 text-accent-primary rounded-sm transition-colors shrink-0 disabled:opacity-50"
                  aria-label="Save"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditDeviceName}
                  className="p-1 hover:bg-app-surface-hover text-app-secondary rounded-sm transition-colors shrink-0"
                  aria-label="Cancel"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-app-primary text-sm font-medium truncate">
                  {deviceLabel || "Device"}
                </span>
                <button
                  type="button"
                  onClick={handleStartEditDeviceName}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-app-surface rounded-sm transition-all text-app-secondary hover:text-accent-primary shrink-0"
                  aria-label="Edit device name"
                  title="Edit device name"
                >
                  <Edit className="size-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {isJellyfinPreset && (
          <>
            <div>
              <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                Jellyfin Container Library Prefix
              </label>
              <input
                type="text"
                value={jellyfinContainerPrefix}
                onChange={(e) => setJellyfinContainerPrefix(e.target.value)}
                placeholder="/media/music"
                className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm font-mono"
              />
              <p className="text-app-tertiary text-xs mt-2">
                Use the path as seen inside the Jellyfin container (e.g.{" "}
                <span className="font-mono">/media/music</span>).
              </p>
            </div>
            <div>
              <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                Export Destination
              </label>
              <select
                value={jellyfinExportMode}
                onChange={(e) =>
                  setJellyfinExportMode(e.target.value as typeof jellyfinExportMode)
                }
                className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
              >
                <option value="download">Download M3U (absolute container paths)</option>
                <option value="library-root">Save to Library Root (relative paths)</option>
              </select>
              <p className="text-app-tertiary text-xs mt-2">
                Download uses absolute container paths. Saving to the library root uses
                relative paths and avoids <span className="font-mono">../</span>.
              </p>
            </div>
          </>
        )}

        {!isIpodPreset && !isJellyfinPreset && !isWalkmanPreset && (
          <div>
            <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
              Device Folder
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectDeviceFolder}
                disabled={useCompanionApp}
                className="flex items-center gap-2 px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm"
              >
                <HardDrive className="size-4" />
                {deviceHandleRef ? "Change Folder" : "Select Folder"}
              </button>
              {deviceHandleRef && (
                <span className="text-xs text-app-tertiary flex items-center gap-1">
                  <Usb className="size-3" />
                  Connected
                </span>
              )}
            </div>
            <p className="text-app-tertiary text-xs mt-2">
              {useCompanionApp
                ? "Companion mode does not require a mounted device."
                : "Use the device root folder when it appears as a USB drive."}
            </p>
            <label className="flex items-start gap-2 text-app-primary text-xs mt-3">
              <input
                type="checkbox"
                checked={useCompanionApp}
                onChange={(e) => setUseCompanionApp(e.target.checked)}
                className="rounded border-app-border mt-0.5"
              />
              <span>Use companion app (localhost:8731)</span>
            </label>
          </div>
        )}

        {isIpodPreset && (!deviceDetailsSlotId || !deviceProfileOverride) && (
          <div className="md:col-span-2">
            <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
              iPod Detection & Setup
            </label>
            {!supportsWebUSB() && (
              <div className="text-xs text-yellow-500">
                WebUSB is required for iPod setup. Use a Chromium browser.
              </div>
            )}
            {supportsWebUSB() && (
              <div className="text-xs text-app-tertiary">
                Detect the iPod via WebUSB, then select its folder to sync.
              </div>
            )}
            {ipodSetupMessage && (
              <div className="text-xs text-app-tertiary mt-2">{ipodSetupMessage}</div>
            )}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDetectIpodUsb}
                disabled={!supportsWebUSB()}
                className="inline-flex items-center px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover disabled:opacity-50"
              >
                Detect iPod
              </button>
              <button
                type="button"
                onClick={handleSelectDeviceFolder}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover"
              >
                <HardDrive className="size-3.5" />
                {deviceHandleRef ? "Change iPod Folder" : "Select iPod Folder"}
              </button>
              <button
                type="button"
                onClick={handleRunIpodSetup}
                disabled={!supportsWebUSB() || !deviceHandleRef || ipodSetupStatus === "checking"}
                className="inline-flex items-center px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover disabled:opacity-50"
              >
                {ipodSetupStatus === "checking" ? "Setting up..." : "Run iPod Setup"}
              </button>
              {!supportsWebUSB() && ipodSetupStatus === "needs_setup" && (
                <button
                  type="button"
                  onClick={handleSkipIpodSetup}
                  className="inline-flex items-center px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover"
                >
                  Skip Setup
                </button>
              )}
              <button
                type="button"
                onClick={handleCheckWriteAccess}
                disabled={!deviceHandleRef || isCheckingWriteAccess || useCompanionApp}
                className="inline-flex items-center px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary bg-app-surface hover:bg-app-surface-hover disabled:opacity-50"
              >
                {isCheckingWriteAccess ? "Checking write access..." : "Check write access"}
              </button>
              {writeAccessStatus === "ok" && (
                <Check className="size-4 text-green-500 shrink-0" aria-label="Writable" />
              )}
              {writeAccessStatus === "read-only" && (
                <span className="text-[11px] text-yellow-500">Read-only</span>
              )}
              {writeAccessStatus === "error" && (
                <X className="size-4 text-red-500 shrink-0" aria-label="Check failed" />
              )}
              {ipodSetupStatus === "ready" && (
                <span className="text-[11px] text-green-500">Ready</span>
              )}
              {ipodSetupStatus === "needs_setup" && (
                <span className="text-[11px] text-yellow-500">Setup required</span>
              )}
              {ipodSetupStatus === "error" && (
                <span className="text-[11px] text-red-500">Setup failed</span>
              )}
            </div>
            {(ipodUsbInfo || ipodKnownDevices.length > 0 || ipodDeviceInfo) && (
              <div className="mt-3 text-xs text-app-tertiary space-y-1">
                {ipodUsbInfo && (
                  <div>
                    Detected: {ipodUsbInfo.productName || "iPod"}{" "}
                    {ipodUsbInfo.serialNumber ? `(${ipodUsbInfo.serialNumber})` : ""}
                  </div>
                )}
                {ipodDeviceInfo && (
                  <div>
                    Device: {ipodDeviceInfo.model_name || "iPod"}{" "}
                    {ipodDeviceInfo.generation_name
                      ? `(${ipodDeviceInfo.generation_name})`
                      : ""}
                  </div>
                )}
                {(ipodDeviceInfo?.capacity_gb != null ||
                  (ipodTrackIndexStatus === "ready" &&
                    ipodTrackIndex.usedBytes != null)) && (
                  <div>
                    Storage:{" "}
                    {ipodDeviceInfo?.capacity_gb != null && (
                      <span>
                        {ipodDeviceInfo.capacity_gb.toFixed(2)} GB capacity
                      </span>
                    )}
                    {ipodDeviceInfo?.capacity_gb != null &&
                      ipodTrackIndexStatus === "ready" &&
                      ipodTrackIndex.usedBytes != null && (
                        <span> · </span>
                      )}
                    {ipodTrackIndexStatus === "ready" &&
                      ipodTrackIndex.usedBytes != null && (
                        <span>
                          {(ipodTrackIndex.usedBytes / 1e9).toFixed(2)} GB used
                          (music)
                        </span>
                      )}
                    {ipodDeviceInfo?.capacity_gb != null &&
                      ipodTrackIndexStatus === "ready" &&
                      ipodTrackIndex.usedBytes != null && (
                        <>
                          <span> · </span>
                          <span>
                            {(Math.max(
                              0,
                              ipodDeviceInfo.capacity_gb * 1e9 -
                                (ipodTrackIndex.usedBytes ?? 0)
                            ) / 1e9).toFixed(2)}{" "}
                            GB free
                          </span>
                        </>
                      )}
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 text-xs text-app-tertiary">
              <div>
                1. Detect iPod (WebUSB){" "}
                {ipodUsbInfo ? <span className="text-green-500">✓</span> : null}
              </div>
              <div>
                2. Select iPod folder{" "}
                {deviceHandleRef ? <span className="text-green-500">✓</span> : null}
              </div>
              <div>
                3. Run iPod setup{" "}
                {ipodSetupStatus === "ready" ? (
                  <span className="text-green-500">✓</span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {(hasCollectionSync || hasCollectionExport) && (
          <CollectionSyncBrowser
            title={
              isJellyfinPreset
                ? "Jellyfin Collection Export"
                : isIpodPreset
                  ? "iPod Collection Sync"
                  : isWalkmanPreset
                    ? "Walkman Collection Sync"
                    : "Collection Sync"
            }
            description="Select tracks, albums, and artists to sync to your device."
            collectionId={selectedCollectionId}
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            onCollectionChange={setSelectedCollectionId}
            search={collectionTrackSearch}
            onSearchChange={setCollectionTrackSearch}
            tracks={collectionTracksWithStatus}
            status={collectionTracksStatus}
            error={collectionTracksError}
            selectedTrackIds={selectedCollectionTrackIds}
            onSelectedTrackIdsChange={setSelectedCollectionTrackIds}
            tab={collectionContentTab}
            onTabChange={setCollectionContentTab}
            artworkUrlMap={artworkUrlMap}
            onSyncSelected={
              hasCollectionExport ? handleExportSelectedTracks : handleSyncSelectedTracks
            }
            onMirrorCollection={
              hasCollectionExport
                ? handleExportFullCollection
                : handleMirrorCollectionSync
            }
            syncLabel={
              isJellyfinPreset
                ? "Export selected"
                : isIpodPreset
                  ? "Sync selected to iPod"
                  : isWalkmanPreset
                    ? "Sync selected to Walkman"
                    : isZunePreset
                      ? "Sync selected to Zune"
                      : "Sync selected"
            }
            mirrorLabel={
              isJellyfinPreset
                ? "Export full collection"
                : isIpodPreset
                  ? "Mirror collection to iPod"
                  : "Sync full collection"
            }
            mirrorOptions={
              isIpodPreset && !hasCollectionExport ? (
                <>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={mirrorDeleteFromDevice}
                      onChange={(e) => setMirrorDeleteFromDevice(e.target.checked)}
                      className="rounded border-app-border mt-0.5"
                    />
                    <span>Also delete removed tracks from the iPod storage.</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={overwriteExistingPlaylistOnIpod}
                      onChange={(e) => setOverwriteExistingPlaylistOnIpod(e.target.checked)}
                      className="rounded border-app-border mt-0.5"
                    />
                    <span>Replace existing playlist on device if same name.</span>
                  </label>
                </>
              ) : undefined
            }
            showOnDeviceColumn={
              !hasCollectionExport &&
              (isIpodPreset ||
                (hasCollectionSync &&
                  (isWalkmanPreset || isGenericPreset || isZunePreset) &&
                  devicePathDetectionEnabled))
            }
            onDeviceLabel={isIpodPreset ? "On iPod" : "On device"}
            isSyncing={isSyncing}
            pageSize={collectionTracksPageSize}
            onPageSizeChange={(size) => {
              setCollectionTracksPageSize(size);
              setCollectionTracksCurrentPage(1);
            }}
          />
        )}

        {!isIpodPreset && !isJellyfinPreset && !isWalkmanPreset && (
          <>
            <div>
              <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                Playlist Format
              </label>
              <select
                value={devicePlaylistFormat}
                onChange={(e) => setDevicePlaylistFormat(e.target.value as DevicePlaylistFormat)}
                className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
              >
                <option value="m3u">M3U</option>
                <option value="pls">PLS</option>
                <option value="xspf">XSPF</option>
              </select>
            </div>

            <div>
              <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                Playlist Folder
              </label>
              <input
                type="text"
                value={devicePlaylistFolder}
                onChange={(e) => setDevicePlaylistFolder(e.target.value)}
                placeholder="PLAYLISTS"
                className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
              />
              <p className="text-app-tertiary text-xs mt-2">
                Relative to device root. Leave empty to save in the root folder.
              </p>
              <p className="text-app-tertiary text-xs mt-1">
                Choose a single target (internal memory or SD) per sync.
              </p>
            </div>

            <div>
              <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                Path Strategy
              </label>
              <select
                value={devicePathStrategy}
                onChange={(e) => setDevicePathStrategy(e.target.value as PathStrategy)}
                className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
              >
                <option value="relative-to-playlist">Relative to Playlist</option>
                <option value="relative-to-library-root">Relative to Library Root</option>
                <option value="absolute">Absolute Paths</option>
              </select>
            </div>

            {devicePathStrategy === "absolute" && (
              <div>
                <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                  Absolute Path Prefix
                </label>
                <input
                  type="text"
                  value={deviceAbsolutePrefix}
                  onChange={(e) => setDeviceAbsolutePrefix(e.target.value)}
                  placeholder="/Volumes/WALKMAN/MUSIC"
                  className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm font-mono"
                />
              </div>
            )}
          </>
        )}

      </div>

        </div>

        <DeviceSyncSidebar
          deviceLabel={selectedDeviceProfile?.label || deviceLabel || "New device"}
          devicePreset={devicePreset}
          deviceHandleRef={deviceHandleRef}
          isDeviceConnected={isDeviceConnected}
          devicePathDetection={
            !isIpodPreset && !isJellyfinPreset
              ? {
                  enabled: devicePathDetectionEnabled,
                  onlyIncludeMatchedPaths,
                  scanRoots: deviceScanRoots,
                  onEnabledChange: setDevicePathDetectionEnabled,
                  onOnlyIncludeMatchedPathsChange: setOnlyIncludeMatchedPaths,
                  onScanRootsChange: setDeviceScanRoots,
                  scanProgress: deviceScanProgress,
                  isWalkman: isWalkmanPreset,
                  keyCoverageLog: keyCoverageLog ?? null,
                  missingMetadataCount,
                  devicePreviewPaths: deviceScanStatus === "done" ? devicePreviewPaths : undefined,
                  onRescanLibrary: () => setShowRescanPrompt(true),
                }
              : undefined
          }
          capacityInfo={
            ipodDeviceInfo?.capacity_gb != null &&
            ipodTrackIndexStatus === "ready" &&
            ipodTrackIndex.usedBytes != null
              ? {
                  usedBytes: ipodTrackIndex.usedBytes,
                  capacityGb: ipodDeviceInfo.capacity_gb,
                }
              : null
          }
          selectedTracksCount={selectedTracksCount}
          selectedAlbumsCount={selectedAlbumsCount}
          selectedArtistsCount={selectedArtistsCount}
          selectedPlaylistsCount={selectedPlaylistsCount}
          totalTracksCount={totalTracksCount}
          playlists={playlists}
          selectedPlaylistIds={selectedPlaylistIds}
          onSelectedPlaylistIdsChange={setSelectedPlaylistIds}
          onSync={handleDeviceSync}
          onScan={handleScanDevicePaths}
          onExport={handleExportForJellyfin}
          isSyncing={isSyncing}
          syncPhase={syncPhase}
          deviceScanStatus={deviceScanStatus}
          lastSyncAt={selectedDeviceProfile?.lastSyncAt}
          syncButtonLabel={
            isIpodPreset
              ? "Sync to iPod"
              : playlists && playlists.length > 0
                ? "Sync Selected"
                : "Sync Playlist"
          }
          showScanButton={!isJellyfinPreset}
          showExportButton={isJellyfinPreset}
          supportsFileSystemAccess={supportsFileSystemAccess()}
          useCompanionApp={useCompanionApp}
          jellyfinExportMode={jellyfinExportMode}
        />
      </div>
      <Modal
        isOpen={showMissingTracksDialog}
        onClose={() => handleMissingTracksDialogChoice("cancel")}
        title="Tracks not on device"
      >
        <div className="space-y-3 text-sm text-app-secondary">
          <p>
            {missingTrackCount} track{missingTrackCount === 1 ? "" : "s"} in the selected
            playlist(s) {missingTrackCount === 1 ? "is" : "are"} not on the device.
          </p>
          <p>Copy missing tracks now, or update the playlist with existing tracks only?</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => handleMissingTracksDialogChoice("sync")}
              className="px-3 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-hover text-xs uppercase tracking-wider"
            >
              Sync missing
            </button>
            <button
              type="button"
              onClick={() => handleMissingTracksDialogChoice("playlist-only")}
              className="px-3 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover text-xs uppercase tracking-wider"
            >
              Playlist only
            </button>
            <button
              type="button"
              onClick={() => handleMissingTracksDialogChoice("cancel")}
              className="px-3 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover text-xs uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={showRescanPrompt}
        onClose={() => setShowRescanPrompt(false)}
        title="Rescan Library"
      >
        <div className="space-y-3 text-sm text-app-secondary">
          <p>
            Some tracks in this playlist are missing local file metadata, so device path
            detection cannot map them yet.
          </p>
          <p>
            Go to the Library page and run a scan to rebuild the file index, then return
            here and rescan the device.
          </p>
          {rescanStatus !== "idle" && (
            <div className="text-xs text-app-tertiary">
              {rescanStatus === "requesting" && "Requesting library permission..."}
              {rescanStatus === "scanning" &&
                `Scanning library: ${rescanProgress.scanned}/${rescanProgress.found} files`}
              {rescanStatus === "done" && "Library rescan complete."}
              {rescanStatus === "error" &&
                `Library rescan failed: ${rescanError || "Unknown error"}`}
            </div>
          )}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleRescanLibraryFromDeviceSync}
              disabled={rescanStatus === "requesting" || rescanStatus === "scanning"}
              className="px-3 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-hover text-xs uppercase tracking-wider"
            >
              {rescanStatus === "scanning" ? "Rescanning..." : "Rescan Now"}
            </button>
            <button
              type="button"
              onClick={() => setShowRescanPrompt(false)}
              className="px-3 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover text-xs uppercase tracking-wider"
            >
              Stay Here
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/library";
              }}
              className="px-3 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover text-xs uppercase tracking-wider"
            >
              Go to Library
            </button>
          </div>
        </div>
      </Modal>
      </div>
    </>
  );
}
