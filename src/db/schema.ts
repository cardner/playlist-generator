/**
 * IndexedDB schema using Dexie
 */

import Dexie, { type Table } from "dexie";
import type { LibraryRootMode } from "@/lib/library-selection";
import type { NormalizedTags, TechInfo } from "@/features/library/metadata";

/**
 * Library root stored in database
 */
export interface LibraryRootRecord {
  id: string;
  mode: LibraryRootMode;
  name: string;
  handleRef?: string; // Reference to directoryHandles store
  createdAt: number;
  updatedAt: number;
}

/**
 * File index entry stored in database
 * Uses composite primary key: id = `${trackFileId}-${libraryRootId}`
 */
export interface FileIndexRecord {
  id: string; // Composite key: `${trackFileId}-${libraryRootId}`
  trackFileId: string;
  libraryRootId: string;
  relativePath?: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  updatedAt: number;
}

/**
 * Track metadata stored in database
 * Uses composite primary key: id = `${trackFileId}-${libraryRootId}`
 */
export interface TrackRecord {
  id: string; // Composite key: `${trackFileId}-${libraryRootId}`
  trackFileId: string;
  libraryRootId: string;
  tags: NormalizedTags;
  tech?: TechInfo;
  updatedAt: number;
}

/**
 * Helper function to generate composite ID
 */
export function getCompositeId(trackFileId: string, libraryRootId: string): string {
  return `${trackFileId}-${libraryRootId}`;
}

/**
 * Scan run record
 */
export interface ScanRunRecord {
  id: string;
  libraryRootId: string;
  startedAt: number;
  finishedAt?: number;
  total: number;
  added: number;
  changed: number;
  removed: number;
  parseErrors: number;
}

/**
 * Settings record
 */
export interface SettingsRecord {
  key: string;
  value: any;
}

/**
 * Directory handle storage (for File System Access API)
 */
export interface DirectoryHandleRecord {
  id: string;
  handle: FileSystemDirectoryHandle;
}

/**
 * Saved playlist record
 */
export interface SavedPlaylistRecord {
  id: string;
  title: string;
  description: string;
  trackFileIds: string[];
  summary: {
    genreMix: Record<string, number> | Map<string, number>;
    tempoMix: Record<string, number> | Map<string, number>;
    artistMix: Record<string, number> | Map<string, number>;
    totalDuration: number;
    trackCount?: number;
    avgDuration?: number;
    minDuration?: number;
    maxDuration?: number;
  };
  strategy: any; // PlaylistStrategy
  libraryRootId?: string;
  createdAt: number;
  updatedAt: number;
  discoveryTracks?: Array<{
    position: number;
    mbid: string;
    title: string;
    artist: string;
    album?: string;
    genres: string[];
    duration?: number;
    explanation: string;
    inspiringTrackId: string;
    section?: string; // Section assignment from ordering
  }>;
}

/**
 * Database class
 * 
 * Note: This database instance is created when the module is imported.
 * The migration helper (clearOldDatabaseIfNeeded) should be called before
 * importing this module to ensure incompatible databases are deleted first.
 */
export class AppDatabase extends Dexie {
  libraryRoots!: Table<LibraryRootRecord, string>;
  fileIndex!: Table<FileIndexRecord, string>;
  tracks!: Table<TrackRecord, string>;
  scanRuns!: Table<ScanRunRecord, string>;
  settings!: Table<SettingsRecord, string>;
  directoryHandles!: Table<DirectoryHandleRecord, string>;
  savedPlaylists!: Table<SavedPlaylistRecord, string>;

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
      console.log("Database upgrade to version 2 - stores will be created with correct schema");
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
        console.log("Migrating to version 3: Converting to composite primary keys...");
      
        // Migrate fileIndex records
        const fileIndexStore = trans.table("fileIndex");
        const fileIndexRecords = await fileIndexStore.toArray();
        console.log(`Migrating ${fileIndexRecords.length} fileIndex records...`);
        
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
        console.log(`Migrating ${tracksRecords.length} track records...`);
        
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
              console.warn(`Found duplicate trackFileId "${trackFileId}" in ${libraryRootIds.size} different library roots`);
            }
          }
        }
        
        if (duplicateCount > 0) {
          console.warn(`Warning: Found ${duplicateCount} trackFileIds that exist in multiple library roots. These will now be properly separated.`);
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
        
        console.log("Migration to version 3 complete!");
      } catch (error: any) {
        // If migration fails due to primary key incompatibility, log and rethrow
        // The migration helper should have prevented this, but if it didn't,
        // we need to fail here so the user knows to refresh
        console.error("Migration to version 3 failed:", error);
        if (error?.message?.includes("primary key") || error?.name === "UpgradeError") {
          // Close the database and delete it, then throw an error
          this.close();
          try {
            await indexedDB.deleteDatabase("ai-playlist-generator");
            console.log("Deleted incompatible database after migration failure");
          } catch (deleteError) {
            console.error("Failed to delete database after migration failure:", deleteError);
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
  }
}

// Export singleton instance
// Note: Database creation happens immediately when this module is imported
// The migration helper (clearOldDatabaseIfNeeded) should be called before
// importing this module to ensure incompatible databases are deleted first
export const db = new AppDatabase();

