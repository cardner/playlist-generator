/**
 * ScanResults Component
 * 
 * Displays the results of a library scan operation. Shows statistics about
 * files found, added, changed, and removed, along with scan duration.
 * Provides a rescan button for re-running the scan.
 * 
 * Features:
 * - Statistics grid (total, added, changed, removed)
 * - Scan duration display
 * - Rescan button
 * - Color-coded statistics (added/changed in accent, removed in red)
 * 
 * Props:
 * - `result`: Scan result object with statistics
 * - `onRescan`: Callback when rescan button is clicked
 * - `isScanning`: Whether a scan is currently in progress
 * 
 * @module components/ScanResults
 * 
 * @example
 * ```tsx
 * <ScanResults
 *   result={scanResult}
 *   onRescan={() => startScan()}
 *   isScanning={isScanning}
 * />
 * ```
 */

"use client";

import { RefreshCw } from "lucide-react";
import type { ScanResult } from "@/features/library";

interface ScanResultsProps {
  result: ScanResult;
  onRescan: () => void;
  isScanning?: boolean;
}

export function ScanResults({
  result,
  onRescan,
  isScanning = false,
}: ScanResultsProps) {
  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="max-w-4xl">
      <div className="bg-app-surface rounded-sm shadow-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-app-primary">Scan Complete</h3>
          <button
            onClick={onRescan}
            disabled={isScanning}
            className="flex items-center gap-2 px-3 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-xs border border-app-border"
          >
            <RefreshCw className="size-3" />
            <span>{isScanning ? "Scanning..." : "Rescan"}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-app-border">
          <div className="bg-app-surface p-4">
            <div className="text-2xl font-bold text-app-primary tabular-nums">
              {result.total}
            </div>
            <div className="text-sm text-app-secondary uppercase tracking-wider mt-1">
              Total Files
            </div>
          </div>

          <div className="bg-app-surface p-4">
            <div className="text-2xl font-bold text-accent-primary tabular-nums">
              {result.added}
            </div>
            <div className="text-sm text-app-secondary uppercase tracking-wider mt-1">
              Added
            </div>
          </div>

          <div className="bg-app-surface p-4">
            <div className="text-2xl font-bold text-accent-primary tabular-nums">
              {result.changed}
            </div>
            <div className="text-sm text-app-secondary uppercase tracking-wider mt-1">
              Changed
            </div>
          </div>

          <div className="bg-app-surface p-4">
            <div className="text-2xl font-bold text-red-500 tabular-nums">
              {result.removed}
            </div>
            <div className="text-sm text-app-secondary uppercase tracking-wider mt-1">
              Removed
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-app-tertiary">
          Scan completed in {formatDuration(result.duration)}
        </div>
      </div>
    </div>
  );
}

