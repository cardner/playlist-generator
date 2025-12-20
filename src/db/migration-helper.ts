/**
 * Database migration helper - ensures migration completes before database access
 * 
 * This module provides a singleton promise that ensures database migration
 * completes before any database operations are performed.
 */

import { clearOldDatabaseIfNeeded } from "./migration";
import { logger } from "@/lib/logger";

// Singleton promise that ensures migration completes
let dbMigrationPromise: Promise<void> | null = null;

/**
 * Ensure database migration completes before accessing the database
 * This function returns a promise that resolves when migration is complete
 * 
 * Call this before any database operations to ensure compatibility
 */
export function ensureMigrationComplete(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  
  if (!dbMigrationPromise) {
    dbMigrationPromise = clearOldDatabaseIfNeeded()
      .catch((error) => {
        logger.error("Database migration error:", error);
        // Even if migration fails, we continue - Dexie will handle it
        // But we log the error for debugging
      })
      .then(() => {
        // Small delay to ensure database deletion is fully complete
        return new Promise(resolve => setTimeout(resolve, 200));
      });
  }
  
  return dbMigrationPromise;
}

// Start migration immediately when module loads (client-side only)
if (typeof window !== "undefined") {
  ensureMigrationComplete();
}

