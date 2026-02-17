/**
 * Sync target helpers for device sync.
 *
 * Provides utilities to build sync targets from playlists or collection track selection.
 */

import type { GeneratedPlaylist } from "@/features/playlists";

export type DevicePreset = "ipod" | "walkman" | "generic" | "zune" | "jellyfin";

export interface PresetCapabilities {
  hasCollectionSync: boolean;
  hasCollectionExport: boolean;
  hasUsbSync: boolean;
  hasExport: boolean;
  hasOnDeviceStatus: boolean;
}

const PRESET_CAPABILITIES: Record<DevicePreset, PresetCapabilities> = {
  ipod: {
    hasCollectionSync: true,
    hasCollectionExport: false,
    hasUsbSync: true,
    hasExport: false,
    hasOnDeviceStatus: true,
  },
  walkman: {
    hasCollectionSync: true,
    hasCollectionExport: false,
    hasUsbSync: true,
    hasExport: false,
    hasOnDeviceStatus: true,
  },
  generic: {
    hasCollectionSync: true,
    hasCollectionExport: false,
    hasUsbSync: true,
    hasExport: false,
    hasOnDeviceStatus: true,
  },
  zune: {
    hasCollectionSync: true,
    hasCollectionExport: false,
    hasUsbSync: true,
    hasExport: false,
    hasOnDeviceStatus: true,
  },
  jellyfin: {
    hasCollectionSync: false,
    hasCollectionExport: true,
    hasUsbSync: false,
    hasExport: true,
    hasOnDeviceStatus: false,
  },
};

export function getPresetCapabilities(
  preset: string
): PresetCapabilities {
  const key = preset as DevicePreset;
  return (
    PRESET_CAPABILITIES[key] ?? {
      hasCollectionSync: false,
      hasCollectionExport: false,
      hasUsbSync: preset !== "jellyfin",
      hasExport: false,
      hasOnDeviceStatus: false,
    }
  );
}
import type { TrackLookup } from "@/features/playlists/export";

export interface PlaylistSyncItem {
  playlist: GeneratedPlaylist;
  libraryRootId?: string;
  collectionName?: string;
}

export interface SyncTarget {
  playlist: GeneratedPlaylist;
  trackLookups: TrackLookup[];
  libraryRootId?: string;
  mirrorMode?: boolean;
  mirrorDeleteFromDevice?: boolean;
  onlyReferenceExistingTracks?: boolean;
}

/**
 * Get sync targets from saved playlists based on selected playlist IDs.
 */
export function getSyncTargetsFromPlaylists(
  playlists: PlaylistSyncItem[],
  selectedPlaylistIds: string[],
  singlePlaylist?: PlaylistSyncItem
): PlaylistSyncItem[] {
  if (singlePlaylist) {
    return [singlePlaylist];
  }
  if (!playlists.length || !selectedPlaylistIds.length) {
    return [];
  }
  return playlists.filter((item) => selectedPlaylistIds.includes(item.playlist.id));
}

/**
 * Build a synthetic GeneratedPlaylist from a title and track IDs.
 */
export function buildSyntheticPlaylist(
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
    strategy: {} as GeneratedPlaylist["strategy"],
    createdAt: Date.now(),
  };
}

/**
 * Build sync targets from selected collection tracks.
 * Requires an async buildTrackLookups function to resolve track lookups.
 */
export async function getSyncTargetsFromCollectionTracks(
  selectedTrackIds: string[] | Set<string>,
  collectionId: string,
  collectionName: string,
  buildTrackLookups: (
    trackIds: string[],
    rootId: string,
    options?: { tryLazyFileIndex?: boolean }
  ) => Promise<TrackLookup[]>,
  options?: { tryLazyFileIndex?: boolean }
): Promise<SyncTarget[]> {
  const trackIds = Array.from(selectedTrackIds);
  if (trackIds.length === 0) {
    return [];
  }
  const trackLookups = await buildTrackLookups(trackIds, collectionId, options);
  const playlist = buildSyntheticPlaylist(`Selected Tracks - ${collectionName}`, trackIds);
  return [
    {
      playlist,
      trackLookups,
      libraryRootId: collectionId,
    },
  ];
}

/**
 * Build a full-collection sync target (for "Mirror collection" / "Sync full collection").
 */
export async function getFullCollectionSyncTarget(
  allTrackIds: string[],
  collectionId: string,
  collectionName: string,
  buildTrackLookups: (
    trackIds: string[],
    rootId: string,
    options?: { tryLazyFileIndex?: boolean }
  ) => Promise<TrackLookup[]>,
  options?: { mirrorMode?: boolean; mirrorDeleteFromDevice?: boolean }
): Promise<SyncTarget> {
  const trackLookups = await buildTrackLookups(allTrackIds, collectionId, {
    tryLazyFileIndex: true,
  });
  const playlist = buildSyntheticPlaylist(`Collection - ${collectionName}`, allTrackIds);
  return {
    playlist,
    trackLookups,
    libraryRootId: collectionId,
    mirrorMode: options?.mirrorMode,
    mirrorDeleteFromDevice: options?.mirrorDeleteFromDevice,
  };
}

/**
 * Merge playlist-based targets with collection-based targets.
 * When playlist targets exist, they take precedence. Otherwise use collection targets.
 */
export function mergeSyncTargets(
  playlistTargets: PlaylistSyncItem[],
  collectionTargets: SyncTarget[]
): PlaylistSyncItem[] | SyncTarget[] {
  if (playlistTargets.length > 0) {
    return playlistTargets;
  }
  return collectionTargets;
}
