/**
 * DeviceSyncPanel Component
 *
 * Standalone UI for syncing playlists to USB devices. For iPod, classifies tracks as
 * on-device vs missing (using saved mappings and tag index), and shows a dialog when
 * any are missing with options: Sync missing, Playlist only (reference existing only), or Cancel.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { getDirectoryHandle, storeDirectoryHandle } from "@/lib/library-selection-fs-api";
import { requestLibraryPermission } from "@/lib/library-selection-permissions";
import { getSavedLibraryRoot } from "@/lib/library-selection-root";
import type { LibraryRoot } from "@/lib/library-selection";
import { logger } from "@/lib/logger";
import { formatPlaylistFilenameStem } from "@/lib/playlist-filename";
import { Modal } from "@/components/Modal";
import { Usb, HardDrive, Loader2, Save, Bug, ChevronDown, ChevronUp } from "lucide-react";
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
}

export function DeviceSyncPanel({
  playlist,
  libraryRootId,
  playlists,
  deviceProfileOverride,
  selectionIsFromUserAction = true,
  onDeviceProfileUpdated,
  showDeviceSelector = true,
}: DeviceSyncPanelProps) {
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfileRecord[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("new");
  const [deviceLabel, setDeviceLabel] = useState<string>("");
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
  const [showKeyCoverageLog, setShowKeyCoverageLog] = useState(false);
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
  const [mirrorDeleteFromDevice, setMirrorDeleteFromDevice] = useState(false);
  const [overwriteExistingPlaylistOnIpod, setOverwriteExistingPlaylistOnIpod] = useState(false);
  const [collectionViewMode, setCollectionViewMode] = useState<"all" | "recent">("recent");
  const [selectedArtistFilter, setSelectedArtistFilter] = useState<string>("all");
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
  const artistScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    if (devicePreset !== "ipod") return;
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
      setUseCompanionApp(
        !deviceProfileOverride.handleRef && preset !== "ipod" && preset !== "jellyfin"
      );
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
      setUseCompanionApp(!selected.handleRef && preset !== "ipod" && preset !== "jellyfin");
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
    const monitor = startIpodConnectionMonitor({
      handleRef: deviceHandleRef,
      onDisconnect: (reason) => {
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
    if (devicePreset !== "ipod") return;
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
            return {
              trackFileId: track.trackFileId,
              title: track.tags?.title || fallbackTitle,
              artist: track.tags?.artist,
              album: track.tags?.album,
              trackNo: track.tags?.trackNo,
              addedAt: fileIndex?.updatedAt ?? track.updatedAt,
              fileName: fileIndex?.name,
              fileSize: fileIndex?.size,
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

  function buildSyntheticPlaylist(
    title: string,
    trackFileIds: string[]
  ): GeneratedPlaylist {
    return {
      id: `manual-${title}-${Date.now()}`,
      title,
      description: "",
      trackFileIds,
      trackSelections: [],
      totalDuration: 0,
      summary: {
        totalDuration: 0,
        trackCount: trackFileIds.length,
        genreMix: new Map(),
        tempoMix: new Map(),
        artistMix: new Map(),
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
      },
      strategy: {} as any,
      createdAt: Date.now(),
    };
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
    const onDevice = isTrackOnDevice({
      title: track.title,
      artist: track.artist,
      album: track.album,
      trackFileId: track.trackFileId,
      fileSize: track.fileSize,
      trackNo: track.trackNo,
    });
    return { ...track, onDevice };
  });
  const filteredCollectionTracks = collectionSearch
    ? collectionTracksWithStatus.filter((track) => {
        const haystack = `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`.toLowerCase();
        return haystack.includes(collectionSearch);
      })
    : collectionTracksWithStatus;
  const recentMissingTracks = filteredCollectionTracks
    .filter((track) => track.onDevice === false)
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  const activeTracks =
    collectionViewMode === "recent" ? recentMissingTracks : filteredCollectionTracks;
  const artistFilteredTracks =
    selectedArtistFilter === "all"
      ? activeTracks
      : activeTracks.filter((track) =>
          normalizeTag(track.artist) === normalizeTag(selectedArtistFilter)
        );
  const visibleCollectionTracks = artistFilteredTracks.slice(0, 1000);

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

  function formatAddedAt(value?: number) {
    if (!value) return "";
    return new Date(value).toLocaleDateString();
  }

  function addSelection(ids: string[]) {
    setSelectedCollectionTrackIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function removeSelection(ids: string[]) {
    setSelectedCollectionTrackIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  async function checkIpodSetup(handleRef?: string | null) {
    if (!handleRef) return;
    setIpodSetupStatus("checking");
    setIpodSetupMessage(null);
    setIpodSetupSkipped(false);
    try {
      const handle = await getDirectoryHandle(handleRef);
      if (!handle) {
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
    if (playlists && playlists.length > 0) {
      if (selectedPlaylistIds.length === 0) {
        return [];
      }
      return playlists.filter((item) => selectedPlaylistIds.includes(item.playlist.id));
    }
    if (playlist) {
      return [{ playlist, libraryRootId }];
    }
    return [];
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

  async function handleSyncSelectedTracks() {
    setIsSyncing(true);
    setSyncPhase("preparing");
    setSyncError(null);
    setSyncSuccess(null);
    setSyncWarning(null);
    try {
      ipodMonitor?.suspend();
      if (!isIpodPreset) {
        throw new Error("Selected-track sync is only available for iPod devices.");
      }
      if (!selectedCollectionId) {
        throw new Error("Select a collection to sync.");
      }
      const selectedIds = Array.from(selectedCollectionTrackIds);
      if (selectedIds.length === 0) {
        throw new Error("Select at least one track to sync.");
      }
      await ensureAllLibraryRootAccess([selectedCollectionId]);
      const profile = await prepareIpodProfileForSync();
      const trackLookups = await buildTrackLookupsFromTrackIds(
        selectedIds,
        selectedCollectionId,
        { tryLazyFileIndex: true }
      );
      const collectionName =
        collections.find((collection) => collection.id === selectedCollectionId)?.name ||
        "Selected Tracks";
      const playlistTitle = `Selected Tracks - ${collectionName}`;
      const syntheticPlaylist = buildSyntheticPlaylist(playlistTitle, selectedIds);
      setSyncPhase("writing");
      await syncPlaylistsToDevice({
        deviceProfile: profile,
        targets: [
          {
            playlist: syntheticPlaylist,
            trackLookups,
            libraryRootId: selectedCollectionId,
          },
        ],
      });
      setSyncSuccess(`Synced ${selectedIds.length} track(s) to iPod.`);
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
      if (!isIpodPreset) {
        throw new Error("Collection mirror is only available for iPod devices.");
      }
      if (!selectedCollectionId) {
        throw new Error("Select a collection to sync.");
      }
      await ensureAllLibraryRootAccess([selectedCollectionId]);
      const profile = await prepareIpodProfileForSync();
      const allTrackIds = collectionTracks.map((track) => track.trackFileId);
      if (allTrackIds.length === 0) {
        throw new Error("Selected collection has no tracks.");
      }
      const trackLookups = await buildTrackLookupsFromTrackIds(
        allTrackIds,
        selectedCollectionId,
        { tryLazyFileIndex: true }
      );
      const collectionName =
        collections.find((collection) => collection.id === selectedCollectionId)?.name ||
        "Collection";
      const playlistTitle = `Collection - ${collectionName}`;
      const syntheticPlaylist = buildSyntheticPlaylist(playlistTitle, allTrackIds);
      setSyncPhase("writing");
      await syncPlaylistsToDevice({
        deviceProfile: profile,
        targets: [
          {
            playlist: syntheticPlaylist,
            trackLookups,
            libraryRootId: selectedCollectionId,
            mirrorMode: true,
            mirrorDeleteFromDevice,
          },
        ],
      });
      setSyncSuccess(`Mirrored ${collectionName} to iPod.`);
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

  async function handleSaveDeviceSettings() {
    setIsSavingSettings(true);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const label = deviceLabel.trim() || (isJellyfinPreset ? "Jellyfin" : "USB Device");
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

  return (
    <div className="bg-app-hover rounded-sm border border-app-border p-4 space-y-4">
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

        <div>
          <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
            Device Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder="My Walkman"
              className="flex-1 px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
            />
            <button
              type="button"
              onClick={handleSaveDeviceSettings}
              disabled={isSavingSettings || isSyncing}
              className="flex items-center gap-1.5 px-3 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shrink-0"
            >
              {isSavingSettings ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </button>
          </div>
        </div>

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

        {isIpodPreset && (
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
                className="px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm disabled:opacity-50"
              >
                Detect iPod (WebUSB)
              </button>
              <button
                type="button"
                onClick={handleSelectDeviceFolder}
                className="flex items-center gap-2 px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm"
              >
                <HardDrive className="size-4" />
                {deviceHandleRef ? "Change iPod Folder" : "Select iPod Folder"}
              </button>
              <button
                type="button"
                onClick={handleRunIpodSetup}
                disabled={!supportsWebUSB() || !deviceHandleRef || ipodSetupStatus === "checking"}
                className="px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm disabled:opacity-50"
              >
                {ipodSetupStatus === "checking" ? "Setting up..." : "Run iPod Setup"}
              </button>
              {!supportsWebUSB() && ipodSetupStatus === "needs_setup" && (
                <button
                  type="button"
                  onClick={handleSkipIpodSetup}
                  className="px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm"
                >
                  Skip Setup
                </button>
              )}
              {ipodSetupStatus === "ready" && (
                <span className="text-xs text-green-500">Ready</span>
              )}
              {ipodSetupStatus === "needs_setup" && (
                <span className="text-xs text-yellow-500">Setup required</span>
              )}
              {ipodSetupStatus === "error" && (
                <span className="text-xs text-red-500">Setup failed</span>
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
                {ipodKnownDevices.length > 0 && (
                  <div>
                    Known iPods: {ipodKnownDevices.map((device) => device.productName).join(", ")}
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 text-xs text-app-tertiary">
              <div>
                Step 1: Detect iPod (WebUSB){" "}
                {ipodUsbInfo ? <span className="text-green-500">✓</span> : null}
              </div>
              <div>
                Step 2: Select iPod folder{" "}
                {deviceHandleRef ? <span className="text-green-500">✓</span> : null}
              </div>
              <div>
                Step 3: Run iPod setup{" "}
                {ipodSetupStatus === "ready" ? (
                  <span className="text-green-500">✓</span>
                ) : null}
              </div>
              <div>Step 4: Sync playlist</div>
            </div>
          </div>
        )}

        {isIpodPreset && (
          <div className="md:col-span-2">
            <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
              iPod Collection Sync
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                  Collection
                </label>
                <select
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                  className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
                >
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                  {collections.length === 0 && <option value="">No collections found</option>}
                </select>
              </div>
              <div>
                <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
                  Track Search
                </label>
                <input
                  type="text"
                  value={collectionTrackSearch}
                  onChange={(e) => setCollectionTrackSearch(e.target.value)}
                  placeholder="Filter by title, artist, album"
                  className="w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm"
                />
              </div>
            </div>
            {collectionTracksStatus === "loading" && (
              <div className="text-xs text-app-tertiary mt-2">Loading collection tracks...</div>
            )}
            {collectionTracksStatus === "error" && (
              <div className="text-xs text-red-500 mt-2">{collectionTracksError}</div>
            )}
            {collectionTracksStatus === "ready" && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-app-tertiary">
                  <span>
                    Showing {visibleCollectionTracks.length} of {filteredCollectionTracks.length}{" "}
                    tracks.
                  </span>
                  <span>Selected {selectedCollectionTrackIds.size}.</span>
                  {filteredCollectionTracks.length > visibleCollectionTracks.length && (
                    <span>Refine search to see more.</span>
                  )}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-app-tertiary">View</span>
                    <button
                      type="button"
                      onClick={() => setCollectionViewMode("recent")}
                      className={`px-3 py-1 rounded-sm border ${
                        collectionViewMode === "recent"
                          ? "bg-app-surface text-app-primary border-app-border"
                          : "text-app-tertiary border-app-border/60"
                      }`}
                    >
                      Recent to sync
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollectionViewMode("all")}
                      className={`px-3 py-1 rounded-sm border ${
                        collectionViewMode === "all"
                          ? "bg-app-surface text-app-primary border-app-border"
                          : "text-app-tertiary border-app-border/60"
                      }`}
                    >
                      All tracks
                    </button>
                  </div>
                  <div>
                    <label className="block text-app-tertiary text-[11px] uppercase tracking-wider mb-1">
                      Filter by artist
                    </label>
                    <select
                      value={selectedArtistFilter}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedArtistFilter(value);
                        if (value !== "all") {
                          artistScrollRefs.current[value]?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }
                      }}
                      className="w-full px-2 py-1 bg-app-surface text-app-primary border border-app-border rounded-sm text-xs"
                    >
                      <option value="all">All artists</option>
                      {artistNames.map((artist) => (
                        <option key={artist} value={artist}>
                          {artist}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-app-tertiary text-[11px] uppercase tracking-wider mb-1">
                      Jump to artist
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value) {
                          artistScrollRefs.current[value]?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }
                      }}
                      className="w-full px-2 py-1 bg-app-surface text-app-primary border border-app-border rounded-sm text-xs"
                    >
                      <option value="">Select artist</option>
                      {artistNames.map((artist) => (
                        <option key={artist} value={artist}>
                          {artist}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {collectionViewMode === "recent" && ipodTrackIndexStatus !== "ready" && (
                  <div className="mt-2 text-xs text-yellow-500">
                    Connect the iPod folder to compare tracks and show recent additions.
                  </div>
                )}
                {ipodTrackIndexStatus === "error" && (
                  <div className="mt-2 text-xs text-red-500">{ipodTrackIndexError}</div>
                )}
                <div className="mt-3 border border-app-border rounded-sm max-h-72 overflow-y-auto bg-app-surface">
                  {artistNames.length === 0 && (
                    <div className="px-3 py-2 text-xs text-app-tertiary">
                      No tracks match your search.
                    </div>
                  )}
                  {artistNames.map((artist) => {
                    const albums = groupedTracks[artist];
                    const artistTrackIds = Object.values(albums)
                      .flat()
                      .map((track) => track.trackFileId);
                    return (
                      <div
                        key={artist}
                        ref={(node) => {
                          artistScrollRefs.current[artist] = node;
                        }}
                      >
                        <div className="sticky top-0 z-10 bg-app-surface px-3 py-2 border-b border-app-border/60 flex items-center justify-between">
                          <span className="text-xs font-semibold text-app-primary">{artist}</span>
                          <div className="flex items-center gap-2 text-[11px] text-app-tertiary">
                            <button
                              type="button"
                              onClick={() => addSelection(artistTrackIds)}
                              className="px-2 py-1 border border-app-border rounded-sm hover:bg-app-surface-hover"
                            >
                              Select artist
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSelection(artistTrackIds)}
                              className="px-2 py-1 border border-app-border rounded-sm hover:bg-app-surface-hover"
                            >
                              Clear artist
                            </button>
                          </div>
                        </div>
                        {Object.keys(albums).map((album) => {
                          const albumTracks = albums[album];
                          const albumTrackIds = albumTracks.map((track) => track.trackFileId);
                          return (
                            <div key={`${artist}-${album}`}>
                              <div className="sticky top-8 z-10 bg-app-surface px-3 py-2 border-b border-app-border/40 flex items-center justify-between">
                                <span className="text-xs text-app-secondary">{album}</span>
                                <div className="flex items-center gap-2 text-[11px] text-app-tertiary">
                                  <button
                                    type="button"
                                    onClick={() => addSelection(albumTrackIds)}
                                    className="px-2 py-1 border border-app-border rounded-sm hover:bg-app-surface-hover"
                                  >
                                    Select album
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeSelection(albumTrackIds)}
                                    className="px-2 py-1 border border-app-border rounded-sm hover:bg-app-surface-hover"
                                  >
                                    Clear album
                                  </button>
                                </div>
                              </div>
                              {albumTracks.map((track) => {
                                const checked = selectedCollectionTrackIds.has(track.trackFileId);
                                return (
                                  <label
                                    key={track.trackFileId}
                                    className="flex items-start gap-2 px-3 py-2 text-xs text-app-primary border-b border-app-border/40 last:border-b-0"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const next = new Set(selectedCollectionTrackIds);
                                        if (e.target.checked) {
                                          next.add(track.trackFileId);
                                        } else {
                                          next.delete(track.trackFileId);
                                        }
                                        setSelectedCollectionTrackIds(next);
                                      }}
                                      className="rounded border-app-border mt-0.5"
                                    />
                                    <span className="flex-1">
                                      {track.title}
                                      {track.onDevice === true && (
                                        <span className="ml-2 text-[10px] text-green-500">
                                          On iPod
                                        </span>
                                      )}
                                      {track.onDevice === false && (
                                        <span className="ml-2 text-[10px] text-yellow-500">
                                          New
                                        </span>
                                      )}
                                    </span>
                                    {track.addedAt && (
                                      <span className="text-[10px] text-app-tertiary">
                                        {formatAddedAt(track.addedAt)}
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCollectionTrackIds(
                        new Set(visibleCollectionTracks.map((track) => track.trackFileId))
                      )
                    }
                    className="px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm"
                  >
                    Select visible
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCollectionTrackIds(new Set())}
                    className="px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm"
                  >
                    Clear selection
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncSelectedTracks}
                    disabled={isSyncing || selectedCollectionTrackIds.size === 0}
                    className="px-3 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-primary/90 text-sm disabled:opacity-50"
                  >
                    Sync selected to iPod
                  </button>
                  <button
                    type="button"
                    onClick={handleMirrorCollectionSync}
                    disabled={isSyncing || collectionTracks.length === 0}
                    className="px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm disabled:opacity-50"
                  >
                    Mirror collection to iPod
                  </button>
                </div>
                <label className="flex items-start gap-2 text-app-primary text-xs mt-3">
                  <input
                    type="checkbox"
                    checked={mirrorDeleteFromDevice}
                    onChange={(e) => setMirrorDeleteFromDevice(e.target.checked)}
                    className="rounded border-app-border mt-0.5"
                  />
                  <span>Also delete removed tracks from the iPod storage.</span>
                </label>
                <p className="text-app-tertiary text-xs mt-2">
                  Mirror sync removes tracks from the playlist that are not in the collection.
                </p>
                {mirrorDeleteFromDevice && (
                  <p className="text-yellow-500 text-xs mt-1">
                    Files deleted from iPod storage may still be referenced by other playlists.
                  </p>
                )}
              </>
            )}
          </div>
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

        {!isIpodPreset && !isJellyfinPreset && (
          <div className="md:col-span-2">
            <label className="block text-app-primary text-xs font-medium mb-2 uppercase tracking-wider">
              Device Path Detection
            </label>
            <label className="flex items-start gap-2 text-app-primary text-xs">
              <input
                type="checkbox"
                checked={devicePathDetectionEnabled}
                onChange={(e) => setDevicePathDetectionEnabled(e.target.checked)}
                className="rounded border-app-border mt-0.5"
                disabled={useCompanionApp}
              />
              <span>
                Scan the device and map files to improve playlist path accuracy.
              </span>
            </label>
            {devicePathDetectionEnabled && (
              <label className="flex items-start gap-2 text-app-primary text-xs mt-2">
                <input
                  type="checkbox"
                  checked={onlyIncludeMatchedPaths}
                  onChange={(e) => setOnlyIncludeMatchedPaths(e.target.checked)}
                  className="rounded border-app-border mt-0.5"
                  disabled={useCompanionApp}
                />
                <span>Only include tracks already found on the device.</span>
              </label>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleScanDevicePaths}
                disabled={
                  useCompanionApp ||
                  !devicePathDetectionEnabled ||
                  deviceScanStatus === "scanning"
                }
                className="flex items-center gap-2 px-3 py-2 bg-app-surface text-app-primary rounded-sm border border-app-border hover:bg-app-surface-hover text-sm disabled:opacity-50"
              >
                {deviceScanStatus === "scanning" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  "Scan Device"
                )}
              </button>
              {isWalkmanPreset && (
                <span className="text-xs text-app-tertiary">
                  Scan runs automatically on sync.
                </span>
              )}
              {deviceScanStatus !== "idle" && (
                <span className="text-xs text-app-tertiary">
                  Scanned {deviceScanProgress.scanned} files, matched{" "}
                  {deviceScanProgress.matched}, hashed {deviceScanProgress.hashed}
                </span>
              )}
            </div>
            <div className="mt-2">
              <label className="block text-app-primary text-[11px] font-medium mb-1 uppercase tracking-wider">
                Scan Roots (comma-separated)
              </label>
              <input
                type="text"
                value={deviceScanRoots}
                onChange={(e) => setDeviceScanRoots(e.target.value)}
                placeholder="MUSIC,MP3"
                className="w-full px-3 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm focus:outline-none focus:ring-2 focus:ring-accent-primary text-xs"
                disabled={useCompanionApp}
              />
              <p className="text-app-tertiary text-[11px] mt-1">
                Leave empty to scan the entire device (may be slower).
              </p>
              <p className="text-app-tertiary text-[11px] mt-1">
                Keep device folder structure aligned with your library for best results.
              </p>
            </div>
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
              {showKeyCoverageLog && keyCoverageLog && (
                <div className="mt-2 p-2.5 bg-app-surface border border-app-border rounded-sm font-mono text-[11px] text-app-secondary space-y-1.5 overflow-x-auto">
                  <div>
                    <span className="text-app-tertiary">Library:</span>{" "}
                    {keyCoverageLog.tracksWithMetadata}/{keyCoverageLog.totalTracks} tracks with
                    metadata
                  </div>
                  <div>
                    <span className="text-app-tertiary">Keys:</span> {keyCoverageLog.keyMapSize}{" "}
                    match keys for playlist targets
                  </div>
                  <div>
                    <span className="text-app-tertiary">Scan:</span> {keyCoverageLog.scanned} files
                    scanned, {keyCoverageLog.matched} matched, {keyCoverageLog.hashed} hashed
                  </div>
                  <div>
                    <span className="text-app-tertiary">Map:</span> {keyCoverageLog.scanMapSize}{" "}
                    path entries for resolution
                  </div>
                  {keyCoverageLog.sampleLibraryKeys.length > 0 && (
                    <div>
                      <span className="text-app-tertiary">Sample library keys:</span>
                      <div className="mt-0.5 truncate">
                        {keyCoverageLog.sampleLibraryKeys.join(", ")}
                      </div>
                    </div>
                  )}
                  {keyCoverageLog.sampleDevicePaths.length > 0 && (
                    <div>
                      <span className="text-app-tertiary">Sample device paths:</span>
                      <div className="mt-0.5 space-y-0.5">
                        {keyCoverageLog.sampleDevicePaths.map((p, i) => (
                          <div key={i} className="truncate">
                            {p}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {showKeyCoverageLog && !keyCoverageLog && deviceScanStatus !== "scanning" && (
                <div className="mt-2 p-2.5 bg-app-surface border border-app-border rounded-sm text-[11px] text-app-tertiary">
                  Run a scan to see key coverage data.
                </div>
              )}
            </div>
            {(missingMetadataCount > 0 ||
              (deviceScanStatus === "done" && devicePreviewPaths.missing.length > 0)) && (
              <div className="mt-2 text-xs text-yellow-500 flex items-center gap-2 flex-wrap">
                <span>
                  {missingMetadataCount > 0 ? (
                    <>
                      {missingMetadataCount} track(s) are missing local file metadata. Rescan your
                      library to improve device path detection.
                    </>
                  ) : (
                    <>
                      Some device paths could not be resolved. Rescan your library to improve
                      matching.
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowRescanPrompt(true)}
                  className="text-xs text-yellow-500 underline hover:text-yellow-400"
                >
                  Rescan library
                </button>
              </div>
            )}
            {deviceScanStatus === "done" && (
              <div className="mt-2 text-xs text-app-secondary">
                <div className="flex items-center gap-2">
                  <span className="text-app-tertiary">Preview:</span>
                  <span>{devicePreviewPaths.resolved.length} resolved</span>
                  <span>•</span>
                  <span>{devicePreviewPaths.missing.length} missing</span>
                </div>
                {devicePreviewPaths.resolved.length > 0 && (
                  <div className="mt-1">
                    <div className="text-app-tertiary">Resolved paths:</div>
                    {devicePreviewPaths.resolved.map((path, idx) => (
                      <div key={`resolved-${idx}`} className="font-mono truncate">
                        {path}
                      </div>
                    ))}
                  </div>
                )}
                {devicePreviewPaths.missing.length > 0 && (
                  <div className="mt-1">
                    <div className="text-app-tertiary">Missing paths:</div>
                    {devicePreviewPaths.missing.map((path, idx) => (
                      <div key={`missing-${idx}`} className="font-mono truncate">
                        {path}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 p-3 bg-app-surface border border-app-border rounded-sm text-xs text-app-secondary space-y-2">
        <div className="text-app-primary font-medium uppercase tracking-wider text-[11px]">
          Diagnostics
        </div>
        <div>
          <span className="text-app-tertiary">Device profile:</span>{" "}
          {selectedDeviceProfile?.label || "New device"}
        </div>
        {selectedDeviceProfile?.lastSyncAt && (
          <div>
            <span className="text-app-tertiary">Last sync:</span>{" "}
            {new Date(selectedDeviceProfile.lastSyncAt).toLocaleString()}
          </div>
        )}
        <div>
          <span className="text-app-tertiary">Scan status:</span>{" "}
          {deviceScanStatus === "idle" ? "Not scanned" : deviceScanStatus}
        </div>
        <div className="text-app-tertiary">
          Troubleshooting: reselect the device folder if permissions were revoked or the device was unplugged.
        </div>
        {selectedDeviceProfile?.label?.toLowerCase().includes("zune") && (
          <div className="text-yellow-500">
            Zune devices often use MTP and may require a companion app for full sync.
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCheckWriteAccess}
            disabled={!deviceHandleRef || isCheckingWriteAccess || useCompanionApp}
            className="px-2 py-1 rounded-sm border border-app-border text-[11px] text-app-primary hover:bg-app-hover disabled:opacity-50"
          >
            {isCheckingWriteAccess ? "Checking write access..." : "Check write access"}
          </button>
          {writeAccessStatus === "ok" && (
            <span className="text-green-500">Writable</span>
          )}
          {writeAccessStatus === "read-only" && (
            <span className="text-yellow-500">Read-only</span>
          )}
          {writeAccessStatus === "error" && (
            <span className="text-red-500">Check failed</span>
          )}
        </div>
        {writeAccessMessage && (
          <div className="text-app-tertiary">{writeAccessMessage}</div>
        )}
        {deviceMatchStats && deviceMatchStats.total > 0 && (
          <div className="text-app-tertiary">
            Path matches: {deviceMatchStats.matched}/{deviceMatchStats.total} (
            {(deviceMatchStats.ratio * 100).toFixed(0)}%)
          </div>
        )}
        {pathValidationStatus !== "idle" && (
          <div className="text-app-tertiary">
            <span>Path validation:</span>{" "}
            {pathValidationStatus === "validating" && "Checking playlist paths..."}
            {pathValidationStatus === "error" &&
              `Failed (${pathValidationError || "Unknown error"})`}
            {pathValidationStatus === "done" && pathValidationResult && (
              <>
                {pathValidationPlaylistTitle ? ` ${pathValidationPlaylistTitle} •` : ""}{" "}
                {pathValidationResult.missing}/{pathValidationResult.total} missing
                {pathValidationResult.missingSamples.length > 0 && (
                  <span>
                    {" "}
                    (samples: {pathValidationResult.missingSamples.join(", ")})
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {playlists && playlists.length > 0 && (
        <div className="bg-app-surface border border-app-border rounded-sm p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-app-primary font-medium">Saved Playlists</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedPlaylistIds(playlists.map((item) => item.playlist.id))}
                className="text-xs text-accent-primary hover:text-accent-hover"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlaylistIds([])}
                className="text-xs text-app-tertiary hover:text-app-secondary"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {playlists.map((item) => {
              const isChecked = selectedPlaylistIds.includes(item.playlist.id);
              return (
                <label
                  key={item.playlist.id}
                  className="flex items-start gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPlaylistIds((prev) => [...prev, item.playlist.id]);
                      } else {
                        setSelectedPlaylistIds((prev) =>
                          prev.filter((id) => id !== item.playlist.id)
                        );
                      }
                    }}
                    className="mt-1 rounded border-app-border"
                  />
                  <div>
                    <div className="text-app-primary font-medium">
                      {item.playlist.title}
                    </div>
                    <div className="text-app-tertiary text-xs">
                      Tracks: {item.playlist.trackFileIds.length}
                      {item.collectionName ? ` • ${item.collectionName}` : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-app-tertiary text-xs">
          {isIpodPreset
            ? "iPod sync uses iTunesDB and may require one-time SysInfo setup (WebUSB)."
            : isJellyfinPreset
            ? "Jellyfin export uses container paths and avoids ../ traversal."
            : "USB sync writes playlists directly to your device."}
        </p>
        {deviceMatchStats &&
          deviceMatchStats.total > 0 &&
          deviceMatchStats.ratio < 0.8 && (
            <span className="text-xs text-yellow-500">
              Low path match rate. Consider rescanning or adjusting scan roots.
            </span>
          )}
        {isIpodPreset && (
          <label className="flex items-start gap-2 text-app-primary text-xs mt-2">
            <input
              type="checkbox"
              checked={overwriteExistingPlaylistOnIpod}
              onChange={(e) => setOverwriteExistingPlaylistOnIpod(e.target.checked)}
              className="rounded border-app-border mt-0.5"
            />
            <span>Replace existing playlist on device if same name.</span>
          </label>
        )}
        <div className="flex items-center gap-2">
          {isJellyfinPreset ? (
            <button
              onClick={handleExportForJellyfin}
              disabled={
                isSyncing ||
                (jellyfinExportMode === "library-root" && !supportsFileSystemAccess())
              }
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 text-sm"
            >
              <Usb className="size-4" />
              {jellyfinExportMode === "library-root"
                ? "Save to Library"
                : "Export for Jellyfin"}
            </button>
          ) : (
            <button
              onClick={handleDeviceSync}
              disabled={isSyncing || (!supportsFileSystemAccess() && !useCompanionApp)}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 text-sm"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {syncPhase === "writing" ? "Writing..." : "Syncing..."}
                </>
              ) : (
                <>
                  <Usb className="size-4" />
                  {playlists && playlists.length > 0 ? "Sync Selected" : "Sync Playlist"}
                </>
              )}
            </button>
          )}
        </div>
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
  );
}
