/**
 * IndexedDB Schema Definition using Dexie
 * 
 * This module defines the complete database schema for the AI Playlist Generator application.
 * It uses Dexie.js, a wrapper around IndexedDB that provides a simpler, Promise-based API.
 * 
 * Database Structure:
 * - libraryRoots: User-selected music library folders/collections
 * - fileIndex: Index of audio files found during scanning
 * - tracks: Parsed metadata for audio files
 * - scanRuns: History of library scan operations
 * - settings: Application settings (key-value pairs)
 * - directoryHandles: File System Access API handles (for persistent permissions)
 * - savedPlaylists: Generated playlists saved by the user
 * 
 * Key Design Decisions:
 * - Composite primary keys (trackFileId-libraryRootId) prevent duplicate tracks across collections
 * - All timestamps are Unix epoch milliseconds
 * - File handles are stored separately to avoid serialization issues
 * 
 * @module db/schema
 * 
 * @example
 * ```typescript
 * import { db, getCompositeId } from '@/db/schema';
 * 
 * // Query tracks for a specific library root
 * const tracks = await db.tracks
 *   .where('libraryRootId')
 *   .equals(libraryRootId)
 *   .toArray();
 * 
 * // Generate composite ID
 * const id = getCompositeId(trackFileId, libraryRootId);
 * ```
 */

import Dexie, { type Table } from "dexie";
import type { LibraryRootMode } from "@/lib/library-selection";
import type { NormalizedTags, TechInfo } from "@/features/library/metadata";
import { logger } from "@/lib/logger";

/**
 * Library root record stored in database
 * 
 * Represents a user-selected music library folder or collection. Each library root
 * can contain multiple tracks and file index entries. The application supports
 * multiple library roots (collections) that can be switched between.
 * 
 * Relationships:
 * - One-to-many with FileIndexRecord (via libraryRootId)
 * - One-to-many with TrackRecord (via libraryRootId)
 * - One-to-many with ScanRunRecord (via libraryRootId)
 * 
 * Indexes:
 * - Primary key: id
 * - Index: createdAt (for sorting by creation date)
 * 
 * @example
 * ```typescript
 * const root: LibraryRootRecord = {
 *   id: "root-123",
 *   mode: "handle",
 *   name: "My Music Collection",
 *   handleRef: "handle-456",
 *   createdAt: Date.now(),
 *   updatedAt: Date.now()
 * };
 * ```
 */
export interface LibraryRootRecord {
  /** Unique identifier for the library root */
  id: string;
  /** Access mode: "handle" (File System Access API) or "filelist" (fallback) */
  mode: LibraryRootMode;
  /** Display name for the library root */
  name: string;
  /** Reference to directoryHandles store (only for "handle" mode) */
  handleRef?: string;
  /** Timestamp when the library root was created (Unix epoch milliseconds) */
  createdAt: number;
  /** Timestamp when the library root was last updated (Unix epoch milliseconds) */
  updatedAt: number;
}

/**
 * File index entry stored in database
 * 
 * Represents a scanned audio file before metadata parsing. This is the first
 * step in the library scanning process - files are indexed, then metadata is
 * parsed and stored in TrackRecord.
 * 
 * Uses composite primary key: `id = ${trackFileId}-${libraryRootId}` to prevent
 * duplicate files across different library roots.
 * 
 * Relationships:
 * - Many-to-one with LibraryRootRecord (via libraryRootId)
 * - One-to-one with TrackRecord (via trackFileId + libraryRootId)
 * 
 * Indexes:
 * - Primary key: id (composite)
 * - Index: trackFileId (for lookups by file ID)
 * - Index: libraryRootId (for filtering by library root)
 * - Index: name (for searching by filename)
 * - Index: extension (for filtering by file type)
 * - Index: updatedAt (for sorting by update time)
 * 
 * @example
 * ```typescript
 * const fileIndex: FileIndexRecord = {
 *   id: "file123-root456",
 *   trackFileId: "file123",
 *   libraryRootId: "root456",
 *   relativePath: "Music/Album/Track.mp3",
 *   name: "Track.mp3",
 *   extension: "mp3",
 *   size: 5242880,
 *   mtime: 1640995200000,
 *   updatedAt: Date.now()
 * };
 * ```
 */
export interface FileIndexRecord {
  /** Composite primary key: `${trackFileId}-${libraryRootId}` */
  id: string;
  /** Unique identifier for the file (based on name, size, mtime) */
  trackFileId: string;
  /** ID of the library root this file belongs to */
  libraryRootId: string;
  /** Relative path from library root (optional, may be undefined for filelist mode) */
  relativePath?: string;
  /** Filename (without path) */
  name: string;
  /** File extension (lowercase, without dot) */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified time (Unix epoch milliseconds) */
  mtime: number;
  /** Timestamp when this record was last updated (Unix epoch milliseconds) */
  updatedAt: number;
}

/**
 * Track metadata record stored in database
 * 
 * Contains parsed metadata for an audio file, including tags (title, artist, album, etc.)
 * and technical information (duration, bitrate, BPM, etc.). This is created after
 * successfully parsing a file's metadata.
 * 
 * Uses composite primary key: `id = ${trackFileId}-${libraryRootId}` to prevent
 * duplicate tracks across different library roots.
 * 
 * Relationships:
 * - Many-to-one with LibraryRootRecord (via libraryRootId)
 * - One-to-one with FileIndexRecord (via trackFileId + libraryRootId)
 * 
 * Indexes:
 * - Primary key: id (composite)
 * - Index: trackFileId (for lookups by file ID)
 * - Index: libraryRootId (for filtering by library root)
 * - Index: updatedAt (for sorting by update time)
 * 
 * @example
 * ```typescript
 * const track: TrackRecord = {
 *   id: "file123-root456",
 *   trackFileId: "file123",
 *   libraryRootId: "root456",
 *   tags: {
 *     title: "Example Song",
 *     artist: "Example Artist",
 *     album: "Example Album",
 *     genres: ["Rock", "Indie"],
 *     year: 2023,
 *     trackNo: 1,
 *     discNo: 1
 *   },
 *   tech: {
 *     durationSeconds: 240,
 *     bitrate: 320,
 *     sampleRate: 44100,
 *     channels: 2,
 *     bpm: 120
 *   },
 *   updatedAt: Date.now()
 * };
 * ```
 */
export interface TrackRecord {
  /** Composite primary key: `${trackFileId}-${libraryRootId}` */
  id: string;
  /** Unique identifier for the file (matches FileIndexRecord.trackFileId) */
  trackFileId: string;
  /** ID of the library root this track belongs to */
  libraryRootId: string;
  /** Normalized and cleaned metadata tags */
  tags: NormalizedTags;
  /** Technical audio information (optional, may be missing for some files) */
  tech?: TechInfo;
  /** Timestamp when this record was last updated (Unix epoch milliseconds) */
  updatedAt: number;
}

/**
 * Generate a composite ID from trackFileId and libraryRootId
 * 
 * This function creates the composite primary key used by FileIndexRecord
 * and TrackRecord to prevent duplicate tracks across different library roots.
 * 
 * @param trackFileId - Unique identifier for the file
 * @param libraryRootId - Unique identifier for the library root
 * @returns Composite ID in format `${trackFileId}-${libraryRootId}`
 * 
 * @example
 * ```typescript
 * const id = getCompositeId("file123", "root456");
 * // Returns: "file123-root456"
 * ```
 */
export function getCompositeId(trackFileId: string, libraryRootId: string): string {
  return `${trackFileId}-${libraryRootId}`;
}

/**
 * Scan run record stored in database
 * 
 * Tracks the history of library scanning operations. Each time a library is scanned,
 * a new ScanRunRecord is created to track progress and results. This allows the
 * application to show scan history and detect incremental changes.
 * 
 * Relationships:
 * - Many-to-one with LibraryRootRecord (via libraryRootId)
 * 
 * Indexes:
 * - Primary key: id
 * - Index: libraryRootId (for filtering by library root)
 * - Index: startedAt (for sorting by start time)
 * 
 * @example
 * ```typescript
 * const scanRun: ScanRunRecord = {
 *   id: "scan-123",
 *   libraryRootId: "root456",
 *   startedAt: Date.now(),
 *   finishedAt: Date.now() + 60000,
 *   total: 1000,
 *   added: 50,
 *   changed: 10,
 *   removed: 5,
 *   parseErrors: 2
 * };
 * ```
 */
export interface ScanRunRecord {
  /** Unique identifier for the scan run */
  id: string;
  /** ID of the library root that was scanned */
  libraryRootId: string;
  /** Timestamp when the scan started (Unix epoch milliseconds) */
  startedAt: number;
  /** Timestamp when the scan finished (optional, undefined if scan is in progress) */
  finishedAt?: number;
  /** Total number of files found during scan */
  total: number;
  /** Number of new files added */
  added: number;
  /** Number of files that changed (size or mtime) */
  changed: number;
  /** Number of files that were removed */
  removed: number;
  /** Number of files that failed to parse */
  parseErrors: number;
}

/**
 * Scan checkpoint record stored in database
 * 
 * Tracks scan progress to enable resuming interrupted scans, particularly useful
 * for network drives that may disconnect during scanning. Checkpoints are saved
 * periodically (every 50 files) and when a scan is interrupted.
 * 
 * Relationships:
 * - One-to-one with ScanRunRecord (via scanRunId)
 * - Many-to-one with LibraryRootRecord (via libraryRootId)
 * 
 * Indexes:
 * - Primary key: id (same as scanRunId)
 * - Index: scanRunId (for lookups by scan run)
 * - Index: libraryRootId (for finding interrupted scans for a library)
 * - Index: checkpointAt (for sorting by checkpoint time)
 * 
 * @example
 * ```typescript
 * const checkpoint: ScanCheckpointRecord = {
 *   id: "scan-123",
 *   scanRunId: "scan-123",
 *   libraryRootId: "root-456",
 *   scannedFileIds: ["file1", "file2", "file3"],
 *   lastScannedPath: "Music/Album/Track.mp3",
 *   lastScannedIndex: 150,
 *   totalFound: 1000,
 *   checkpointAt: Date.now(),
 *   interrupted: true
 * };
 * ```
 */
export interface ScanCheckpointRecord {
  /** Unique identifier (same as scanRunId) */
  id: string;
  /** ID of the scan run this checkpoint belongs to */
  scanRunId: string;
  /** ID of the library root being scanned */
  libraryRootId: string;
  /** Array of trackFileIds that have already been scanned */
  scannedFileIds: string[];
  /** Last file path that was scanned (for resume context) */
  lastScannedPath?: string;
  /** Position in scan order (0-indexed) */
  lastScannedIndex: number;
  /** Total number of files found so far */
  totalFound: number;
  /** Timestamp when checkpoint was created (Unix epoch milliseconds) */
  checkpointAt: number;
  /** Whether the scan was interrupted (true) or is in progress (false) */
  interrupted: boolean;
}

/**
 * Settings record stored in database
 * 
 * Key-value store for application settings. Used to persist user preferences
 * and application state across sessions.
 * 
 * Common keys:
 * - "currentCollectionId": ID of the currently selected library root
 * - "app-settings": Application settings (LLM privacy, etc.)
 * 
 * Indexes:
 * - Primary key: key
 * 
 * @example
 * ```typescript
 * const setting: SettingsRecord = {
 *   key: "currentCollectionId",
 *   value: "root-123"
 * };
 * ```
 */
export interface SettingsRecord {
  /** Setting key (unique) */
  key: string;
  /** Setting value (can be any JSON-serializable type) */
  value: any;
}

/**
 * Directory handle record stored in database
 * 
 * Stores File System Access API directory handles to maintain persistent
 * permissions. When a user grants access to a folder, the handle is stored
 * here so the application can access it in future sessions without re-prompting.
 * 
 * Note: FileSystemDirectoryHandle objects cannot be directly serialized to
 * IndexedDB, so they must be stored in a separate store that Dexie handles specially.
 * 
 * Indexes:
 * - Primary key: id
 * 
 * @example
 * ```typescript
 * const handleRecord: DirectoryHandleRecord = {
 *   id: "handle-123",
 *   handle: directoryHandle // FileSystemDirectoryHandle object
 * };
 * ```
 */
export interface DirectoryHandleRecord {
  /** Unique identifier for the handle */
  id: string;
  /** File System Access API directory handle */
  handle: FileSystemDirectoryHandle;
}

/**
 * Saved playlist record stored in database
 * 
 * Represents a generated playlist that has been saved by the user. Contains
 * the playlist metadata, track IDs, summary statistics, and optional discovery
 * tracks (new music not in the user's library).
 * 
 * Relationships:
 * - Many-to-one with LibraryRootRecord (via libraryRootId, optional)
 * 
 * Indexes:
 * - Primary key: id
 * - Index: libraryRootId (for filtering by library root)
 * - Index: createdAt (for sorting by creation date)
 * - Index: updatedAt (for sorting by update time)
 * 
 * @example
 * ```typescript
 * const playlist: SavedPlaylistRecord = {
 *   id: "playlist-123",
 *   title: "My Awesome Playlist",
 *   description: "A great mix of rock and indie",
 *   trackFileIds: ["file1", "file2", "file3"],
 *   summary: {
 *     genreMix: { "Rock": 0.6, "Indie": 0.4 },
 *     tempoMix: { "medium": 0.8, "fast": 0.2 },
 *     artistMix: { "Artist1": 3, "Artist2": 2 },
 *     totalDuration: 3600,
 *     trackCount: 15,
 *     avgDuration: 240
 *   },
 *   strategy: {},
 *   libraryRootId: "root-456",
 *   createdAt: Date.now(),
 *   updatedAt: Date.now(),
 *   discoveryTracks: []
 * };
 * ```
 */
export interface SavedPlaylistRecord {
  /** Unique identifier for the playlist */
  id: string;
  /** Playlist title */
  title: string;
  /** Playlist description */
  description: string;
  /** Array of trackFileIds in playlist order */
  trackFileIds: string[];
  /** Summary statistics for the playlist */
  summary: {
    /** Genre distribution (genre name -> count or percentage) */
    genreMix: Record<string, number> | Map<string, number>;
    /** Tempo distribution (tempo bucket -> count or percentage) */
    tempoMix: Record<string, number> | Map<string, number>;
    /** Artist distribution (artist name -> track count) */
    artistMix: Record<string, number> | Map<string, number>;
    /** Total duration in seconds */
    totalDuration: number;
    /** Number of tracks (optional, can be derived from trackFileIds.length) */
    trackCount?: number;
    /** Average track duration in seconds */
    avgDuration?: number;
    /** Minimum track duration in seconds */
    minDuration?: number;
    /** Maximum track duration in seconds */
    maxDuration?: number;
  };
  /** Playlist generation strategy used (PlaylistStrategy type) */
  strategy: any;
  /** ID of the library root used (optional, may be undefined for discovery playlists) */
  libraryRootId?: string;
  /** Timestamp when the playlist was created (Unix epoch milliseconds) */
  createdAt: number;
  /** Timestamp when the playlist was last updated (Unix epoch milliseconds) */
  updatedAt: number;
  /** Optional discovery tracks (new music not in user's library) */
  discoveryTracks?: Array<{
    /** Position in playlist (0-indexed) */
    position: number;
    /** MusicBrainz ID */
    mbid: string;
    /** Track title */
    title: string;
    /** Artist name */
    artist: string;
    /** Album name (optional) */
    album?: string;
    /** Array of genre names */
    genres: string[];
    /** Duration in seconds (optional) */
    duration?: number;
    /** Explanation of why this track was suggested */
    explanation: string;
    /** TrackFileId of the inspiring library track */
    inspiringTrackId: string;
    /** Section assignment from playlist ordering (optional) */
    section?: string;
  }>;
}

/**
 * Main database class extending Dexie
 * 
 * This class defines the IndexedDB schema and handles migrations. The database
 * instance is created when this module is imported, so the migration helper
 * (clearOldDatabaseIfNeeded) should be called before importing this module to
 * ensure incompatible databases are deleted first.
 * 
 * Database Versions:
 * - Version 1: Initial schema
 * - Version 2: Migration from old raw IndexedDB schema
 * - Version 3: Composite primary keys (trackFileId-libraryRootId)
 * - Version 4: Added savedPlaylists table
 * - Version 5: Added libraryRootId index to savedPlaylists
 * 
 * @example
 * ```typescript
 * import { db } from '@/db/schema';
 * 
 * // Query all library roots
 * const roots = await db.libraryRoots.toArray();
 * 
 * // Query tracks for a specific library root
 * const tracks = await db.tracks
 *   .where('libraryRootId')
 *   .equals(libraryRootId)
 *   .toArray();
 * ```
 */
export class AppDatabase extends Dexie {
  /** Library roots table (collections/folders) */
  libraryRoots!: Table<LibraryRootRecord, string>;
  /** File index table (scanned audio files) */
  fileIndex!: Table<FileIndexRecord, string>;
  /** Tracks table (parsed metadata) */
  tracks!: Table<TrackRecord, string>;
  /** Scan runs table (scan history) */
  scanRuns!: Table<ScanRunRecord, string>;
  /** Settings table (key-value store) */
  settings!: Table<SettingsRecord, string>;
  /** Directory handles table (File System Access API handles) */
  directoryHandles!: Table<DirectoryHandleRecord, string>;
  /** Saved playlists table (user-saved playlists) */
  savedPlaylists!: Table<SavedPlaylistRecord, string>;
  /** Scan checkpoints table (for resuming interrupted scans) */
  scanCheckpoints!: Table<ScanCheckpointRecord, string>;

  constructor() {
    super("ai-playlist-generator");

    // Version 1: Initial schema
    this.version(1).stores({
      libraryRoots: "id, createdAt",
      fileIndex: "trackFileId, libraryRootId, name, extension, updatedAt",
      tracks: "trackFileId, libraryRootId, updatedAt",
      scanRuns: "id, libraryRootId, startedAt",
      settings: "key",
      directoryHandles: "id",
    });

    // Version 2: Handle migration from old raw IndexedDB schema (version 3)
    // The old database was created with raw IndexedDB without primary keys
    // Dexie cannot change primary keys, so we delete incompatible stores during upgrade
    this.version(2).stores({
      libraryRoots: "id, createdAt",
      fileIndex: "trackFileId, libraryRootId, name, extension, updatedAt",
      tracks: "trackFileId, libraryRootId, updatedAt",
      scanRuns: "id, libraryRootId, startedAt",
      settings: "key",
      directoryHandles: "id",
    }).upgrade(async (trans) => {
      // During upgrade, we can't delete stores that already exist with wrong schema
      // The migration helper (clearOldDatabaseIfNeeded) should have deleted the old database
      // If we get here, the stores should already be compatible or non-existent
    });

    // Version 3: Composite primary keys to prevent duplicate tracks across library roots
    // Primary key is now: id = `${trackFileId}-${libraryRootId}`
    // NOTE: Dexie cannot change primary keys during upgrade. If this upgrade fails,
    // the migration helper (clearOldDatabaseIfNeeded) should have deleted the old database.
    this.version(3).stores({
      libraryRoots: "id, createdAt",
      fileIndex: "id, trackFileId, libraryRootId, name, extension, updatedAt",
      tracks: "id, trackFileId, libraryRootId, updatedAt",
      scanRuns: "id, libraryRootId, startedAt",
      settings: "key",
      directoryHandles: "id",
    }).upgrade(async (trans) => {
      // If we get here and the stores have incompatible primary keys, the upgrade will fail
      // The migration helper should have prevented this by deleting the old database
      try {
        // Migrate fileIndex records
        const fileIndexStore = trans.table("fileIndex");
        const fileIndexRecords = await fileIndexStore.toArray();
        
        for (const record of fileIndexRecords) {
          // Skip if already has composite ID
          if (record.id && record.id.includes("-")) {
            continue;
          }
          // Generate composite ID
          const compositeId = `${record.trackFileId}-${record.libraryRootId}`;
          // Delete old record (by old primary key - trackFileId)
          if (record.trackFileId) {
            await fileIndexStore.delete(record.trackFileId as any);
          }
          // Add new record with composite ID
          await fileIndexStore.add({
            ...record,
            id: compositeId,
          });
        }
        
        // Migrate tracks records
        const tracksStore = trans.table("tracks");
        const tracksRecords = await tracksStore.toArray();
        
        // Group by trackFileId to detect duplicates
        const trackMap = new Map<string, TrackRecord[]>();
        for (const record of tracksRecords) {
          // Skip if already has composite ID
          if (record.id && record.id.includes("-")) {
            continue;
          }
          if (!trackMap.has(record.trackFileId)) {
            trackMap.set(record.trackFileId, []);
          }
          trackMap.get(record.trackFileId)!.push(record);
        }
        
        // Check for duplicates (same trackFileId, different libraryRootId)
        let duplicateCount = 0;
        for (const [trackFileId, records] of trackMap.entries()) {
          if (records.length > 1) {
            const libraryRootIds = new Set(records.map(r => r.libraryRootId));
            if (libraryRootIds.size > 1) {
              duplicateCount++;
              logger.warn(`Found duplicate trackFileId "${trackFileId}" in ${libraryRootIds.size} different library roots`);
            }
          }
        }
        
        if (duplicateCount > 0) {
          logger.warn(`Found ${duplicateCount} trackFileIds that exist in multiple library roots. These will now be properly separated.`);
        }
        
        for (const record of tracksRecords) {
          // Skip if already has composite ID
          if (record.id && record.id.includes("-")) {
            continue;
          }
          // Generate composite ID
          const compositeId = `${record.trackFileId}-${record.libraryRootId}`;
          // Delete old record (by old primary key - trackFileId)
          if (record.trackFileId) {
            await tracksStore.delete(record.trackFileId as any);
          }
          // Add new record with composite ID
          await tracksStore.add({
            ...record,
            id: compositeId,
          });
        }
      } catch (error: any) {
        // If migration fails due to primary key incompatibility, log and rethrow
        // The migration helper should have prevented this, but if it didn't,
        // we need to fail here so the user knows to refresh
        logger.error("Migration to version 3 failed:", error);
        if (error?.message?.includes("primary key") || error?.name === "UpgradeError") {
          // Close the database and delete it, then throw an error
          this.close();
          try {
            await indexedDB.deleteDatabase("ai-playlist-generator");
          } catch (deleteError) {
            logger.error("Failed to delete database after migration failure:", deleteError);
          }
          throw new Error(
            "Database migration failed due to incompatible schema. " +
            "The database has been cleared. Please refresh the page to continue."
          );
        }
        throw error;
      }
    });

    // Version 4: Add saved playlists table
    this.version(4).stores({
      libraryRoots: "id, createdAt",
      fileIndex: "id, trackFileId, libraryRootId, name, extension, updatedAt",
      tracks: "id, trackFileId, libraryRootId, updatedAt",
      scanRuns: "id, libraryRootId, startedAt",
      settings: "key",
      directoryHandles: "id",
      savedPlaylists: "id, createdAt, updatedAt",
    });

    // Version 5: Add libraryRootId index to savedPlaylists for efficient querying
    this.version(5).stores({
      libraryRoots: "id, createdAt",
      fileIndex: "id, trackFileId, libraryRootId, name, extension, updatedAt",
      tracks: "id, trackFileId, libraryRootId, updatedAt",
      scanRuns: "id, libraryRootId, startedAt",
      settings: "key",
      directoryHandles: "id",
      savedPlaylists: "id, libraryRootId, createdAt, updatedAt",
    });

    // Version 6: Add scanCheckpoints table for resuming interrupted scans
    // This enables checkpoint-based scanning for network drives that may disconnect
    this.version(6).stores({
      libraryRoots: "id, createdAt",
      fileIndex: "id, trackFileId, libraryRootId, name, extension, updatedAt",
      tracks: "id, trackFileId, libraryRootId, updatedAt",
      scanRuns: "id, libraryRootId, startedAt",
      settings: "key",
      directoryHandles: "id",
      savedPlaylists: "id, libraryRootId, createdAt, updatedAt",
      scanCheckpoints: "id, scanRunId, libraryRootId, checkpointAt",
    });
  }
}

/**
 * Singleton database instance
 * 
 * This instance is created immediately when this module is imported. All database
 * operations should use this instance.
 * 
 * Important: The migration helper (clearOldDatabaseIfNeeded) should be called before
 * importing this module to ensure incompatible databases are deleted first. This prevents
 * migration errors from incompatible schemas.
 * 
 * @example
 * ```typescript
 * import { ensureMigrationComplete } from '@/db/migration-helper';
 * import { db } from '@/db/schema';
 * 
 * // Ensure migration completes before using database
 * await ensureMigrationComplete();
 * 
 * // Now safe to use database
 * const tracks = await db.tracks.toArray();
 * ```
 */
export const db = new AppDatabase();

