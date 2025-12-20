/**
 * StorageWarning Component
 * 
 * Component that displays a warning when IndexedDB storage usage exceeds 80%.
 * Provides storage cleanup functionality to free up space by removing old data.
 * 
 * Features:
 * - Storage quota monitoring
 * - Usage percentage display
 * - Critical warning (90%+ usage)
 * - One-click cleanup functionality
 * - Storage statistics display
 * - Dismissible warning
 * 
 * State Management:
 * - Loads storage quota info and statistics on mount
 * - Manages cleanup progress state
 * - Handles cleanup execution and result display
 * 
 * Cleanup Operations:
 * - Removes old scan runs
 * - Cleans up orphaned file index entries
 * - Removes orphaned tracks
 * - Updates storage statistics after cleanup
 * 
 * Props:
 * - `className`: Optional CSS classes
 * - `onDismiss`: Optional callback when warning is dismissed
 * 
 * @module components/StorageWarning
 * 
 * @example
 * ```tsx
 * <StorageWarning
 *   onDismiss={() => setShowWarning(false)}
 * />
 * ```
 */

"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Database, Trash2, X } from "lucide-react";
import {
  getStorageQuotaInfo,
  formatStorageSize,
  type StorageQuotaInfo,
} from "@/db/storage-errors";
import {
  performCleanup,
  getStorageStats,
  type StorageStats,
} from "@/db/storage-cleanup";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface StorageWarningProps {
  className?: string;
  onDismiss?: () => void;
}

export function StorageWarning({ className, onDismiss }: StorageWarningProps) {
  const [quotaInfo, setQuotaInfo] = useState<StorageQuotaInfo | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    async function loadInfo() {
      // Wait for database migration to complete before accessing database
      try {
        const { ensureMigrationComplete } = await import("@/db/migration-helper");
        await ensureMigrationComplete();
      } catch (error) {
        logger.warn("Failed to ensure migration complete:", error);
        // Continue anyway - database might still work
      }
      
      try {
        const quota = await getStorageQuotaInfo();
        const storageStats = await getStorageStats();
        setQuotaInfo(quota);
        setStats(storageStats);
      } catch (error) {
        logger.error("Failed to load storage info:", error);
        // Don't set state on error - component will just not render
      }
    }
    loadInfo();
  }, []);

  if (!quotaInfo || quotaInfo.usagePercent < 80) {
    return null; // Don't show warning if usage is below 80%
  }

  const isCritical = quotaInfo.usagePercent > 90;

  async function handleCleanup() {
    setIsCleaning(true);
    try {
      await performCleanup({
        keepRecentScanRuns: 10,
        cleanupOrphaned: true,
      });
      // Reload stats
      try {
        const newQuota = await getStorageQuotaInfo();
        const newStats = await getStorageStats();
        setQuotaInfo(newQuota);
        setStats(newStats);
      } catch (statsError) {
        logger.error("Failed to reload stats after cleanup:", statsError);
        // Don't show error to user - cleanup succeeded
      }
    } catch (error) {
      logger.error("Failed to cleanup storage:", error);
      alert("Failed to cleanup storage. Please try again.");
    } finally {
      setIsCleaning(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-sm border p-4",
        isCritical
          ? "bg-red-500/10 border-red-500/20"
          : "bg-yellow-500/10 border-yellow-500/20",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn(
            "size-5 shrink-0 mt-0.5",
            isCritical ? "text-red-500" : "text-yellow-500"
          )}
        />
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              "font-medium mb-1",
              isCritical ? "text-red-500" : "text-yellow-500"
            )}
          >
            {isCritical ? "Storage Almost Full" : "Storage Warning"}
          </h3>
          <p
            className={cn(
              "text-sm mb-3",
              isCritical ? "text-red-500" : "text-yellow-500"
            )}
          >
            Your storage is {quotaInfo.usagePercent.toFixed(1)}% full (
            {formatStorageSize(quotaInfo.usage)} of{" "}
            {formatStorageSize(quotaInfo.quota)} used).
            {isCritical &&
              " You may experience errors when scanning large libraries."}
          </p>

          {showDetails && stats && (
            <div className="mb-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-app-secondary">Tracks:</span>
                <span className="text-app-primary">{stats.tracks.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-secondary">File Index:</span>
                <span className="text-app-primary">
                  {stats.fileIndex.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-secondary">Scan Runs:</span>
                <span className="text-app-primary">
                  {stats.scanRuns.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCleanup}
              disabled={isCleaning}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-colors",
                isCritical
                  ? "bg-red-500/20 hover:bg-red-500/30 text-red-500"
                  : "bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500",
                isCleaning && "opacity-50 cursor-not-allowed"
              )}
            >
              <Trash2 className="size-4" />
              {isCleaning ? "Cleaning..." : "Clean Up Old Data"}
            </button>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm text-sm border border-app-border transition-colors"
            >
              <Database className="size-4 inline mr-2" />
              {showDetails ? "Hide" : "Show"} Details
            </button>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm text-sm border border-app-border transition-colors"
              >
                <X className="size-4 inline mr-2" />
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

