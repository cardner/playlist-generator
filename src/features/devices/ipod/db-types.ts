/**
 * Types for the pure TS/JS iPod DB implementation (iTunesDB, ArtworkDB, ITHMB).
 * Aligns with current app usage in sync.ts and DeviceSyncPanel.
 */

/** Single track as exposed to sync; matches current IpodTrack shape from sync.ts */
export type IpodTrack = {
  id: number;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  track_nr?: number;
  year?: number;
  size?: number;
  tracklen?: number;
  ipod_path?: string;
};

/** Playlist in the in-memory model */
export type IpodPlaylist = {
  name: string;
  is_master?: boolean;
  trackIds: number[];
};

/** Device info shape; matches IpodSyncResult["deviceInfo"] in sync.ts */
export type IpodDeviceInfo = {
  model_name?: string;
  generation_name?: string;
  model_number?: string;
  generation?: number;
  capacity_gb?: number;
  ipod_model?: number;
  checksum_type?: number;
  device_recognized?: boolean;
};

/** Optional artwork state for a track (in-memory; used when writing ArtworkDB/ITHMB) */
export type IpodTrackArtwork = {
  trackIndex: number;
  /** Track dbid (64-bit) for ArtworkDB linkage */
  dbid?: bigint;
  /** JPEG thumbnail bytes (e.g. from resizeToIpodThumbnail) */
  jpegBytes: Uint8Array;
};

/** In-memory representation of the iPod database (iTunesDB + optional artwork) */
export type IpodDbModel = {
  /** Database version from mhbd (e.g. 0x0b, 0x14, 0x19); used for header sizes */
  dbversion: number;
  /** Device info from SysInfo or parsed from DB */
  deviceInfo?: IpodDeviceInfo;
  /** All tracks (index in array = track index for playlist references) */
  tracks: IpodTrack[];
  /** Playlists; first must be Library (is_master) with all track IDs */
  playlists: IpodPlaylist[];
  /** Optional: artwork per track for write path */
  artwork?: IpodTrackArtwork[];
};
