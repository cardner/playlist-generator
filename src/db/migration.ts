/**
 * Database migration helper
 * 
 * Handles migration from old raw IndexedDB schema to Dexie schema
 * 
 * This module ensures that incompatible databases are deleted before Dexie
 * attempts to open them, preventing "UpgradeError Not yet support for changing primary key" errors.
 */

import { logger } from "@/lib/logger";

/**
 * Clear old database if it exists with incompatible schema
 * This is called before Dexie initialization to prevent primary key errors
 * 
 * This function will delete the database if:
 * - It exists with an incompatible schema (version 3 from old raw IndexedDB)
 * - Or if there's ANY error when trying to open it (to be safe)
 * - Or if Dexie reports an upgrade error
 */
export async function clearOldDatabaseIfNeeded(): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return;
  }

  const DB_NAME = "ai-playlist-generator";
  
  try {
    // Check if database exists
    const databases = await indexedDB.databases();
    const oldDb = databases.find(db => db.name === DB_NAME);
    
    if (!oldDb) {
      // No database exists, nothing to migrate
      return;
    }

    // Try to open the database with Dexie to see if it's compatible
    // We'll use a test Dexie instance to detect upgrade errors
    try {
      // Import Dexie dynamically to avoid circular dependencies
      const Dexie = (await import("dexie")).default;
      
      // Create a test database instance to check compatibility
      class TestDB extends Dexie {
        constructor() {
          super(DB_NAME);
          // Try to open with current schema version (14)
          this.version(14)
            .stores({
              libraryRoots: "id, createdAt",
              fileIndex: "id, trackFileId, libraryRootId, name, extension, fullContentHash, contentHash, updatedAt",
              tracks: "id, trackFileId, libraryRootId, globalTrackId, isrc, updatedAt, addedAt",
              scanRuns: "id, libraryRootId, startedAt",
              settings: "key",
              directoryHandles: "id",
              savedPlaylists: "id, libraryRootId, createdAt, updatedAt",
              scanCheckpoints: "id, scanRunId, libraryRootId, checkpointAt",
              processingCheckpoints: "id, scanRunId, libraryRootId, checkpointAt",
              trackWritebacks: "id, libraryRootId, pending, updatedAt",
              writebackCheckpoints: "id, writebackRunId, libraryRootId, checkpointAt",
              deviceProfiles: "id, createdAt, updatedAt",
              deviceSyncManifests: "id, deviceId, playlistId, lastSyncedAt",
              deviceFileIndex: "id, deviceId, matchKey, contentHash, fullContentHash, updatedAt",
            })
            .upgrade(async (trans) => {
              // Mirror schema.ts v14: backfill addedAt for existing tracks
              const tracksStore = trans.table("tracks");
              const allTracks = await tracksStore.toArray();
              for (const record of allTracks) {
                if (record.addedAt == null || record.addedAt === undefined) {
                  await tracksStore.put({
                    ...record,
                    addedAt: record.updatedAt,
                  });
                }
              }
            });
        }
      }

      const testDb = new TestDB();
      
      // Try to open the database
      // If it fails with an upgrade error, we know it's incompatible
      try {
        await testDb.open();
        // Database opened successfully - check if it needs migration
        const isOpen = testDb.isOpen();
        if (isOpen) {
          testDb.close();
          // If version is 3 (old raw IndexedDB) or if we detect incompatible primary keys, delete
          if (oldDb.version === 3) {
            await deleteDatabase();
            return;
          }
          // Database seems compatible, keep it
          return;
        }
      } catch (openError: any) {
        // If opening fails with upgrade error, delete the database
        if (
          openError?.name === "UpgradeError" ||
          openError?.message?.includes("primary key") ||
          openError?.message?.includes("Not yet support for changing primary key") ||
          openError?.inner?.name === "UpgradeError"
        ) {
          logger.warn("Incompatible database detected (upgrade error), deleting to allow fresh migration", openError);
          await deleteDatabase();
          return;
        }
        // Other errors - still delete to be safe (better to lose data than break the app)
        logger.warn("Error opening database, deleting to ensure clean state", openError);
        await deleteDatabase();
        return;
      }
    } catch (dexieError: any) {
      // If Dexie initialization fails, delete the database
      if (
        dexieError?.name === "UpgradeError" ||
        dexieError?.message?.includes("primary key") ||
        dexieError?.message?.includes("Not yet support for changing primary key") ||
        dexieError?.inner?.name === "UpgradeError"
      ) {
        logger.warn("Dexie detected incompatible database, deleting to allow fresh migration", dexieError);
        await deleteDatabase();
        return;
      }
      // For any other error, delete to be safe
      logger.warn("Error checking database with Dexie, deleting to ensure clean state", dexieError);
      await deleteDatabase();
      return;
    }
  } catch (error) {
    logger.error("Error checking for old database:", error);
    // If we can't check, delete anyway to be safe
    // Better to lose data than have a broken app
    try {
      await deleteDatabase();
    } catch (deleteError) {
      logger.error("Failed to delete database:", deleteError);
      // Continue anyway - we'll try again on next load
    }
  }
}

/**
 * Helper function to delete the database
 * Retries if deletion is blocked
 */
async function deleteDatabase(): Promise<void> {
  const DB_NAME = "ai-playlist-generator";
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 500;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        
        deleteRequest.onsuccess = () => {
          // Small delay to ensure deletion is complete
          setTimeout(resolve, 100);
        };
        
        deleteRequest.onerror = () => {
          logger.error(`Failed to delete database (attempt ${attempt}):`, deleteRequest.error);
          reject(deleteRequest.error);
        };
        
        deleteRequest.onblocked = () => {
          logger.warn(`Database deletion blocked (attempt ${attempt}) - may need to close other tabs`);
          // Wait longer if blocked
          setTimeout(() => {
            // Try to resolve anyway - the database might be deleted
            resolve();
          }, 1000);
        };
      });
      
      // Success - verify deletion
      const databases = await indexedDB.databases();
      const stillExists = databases.some(db => db.name === DB_NAME);
      if (stillExists) {
        throw new Error("Database still exists after deletion");
      }
      
      return; // Success
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        logger.error(`Failed to delete database after ${MAX_RETRIES} attempts:`, error);
        // Don't throw - let Dexie handle the migration
        return;
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
    }
  }
}

