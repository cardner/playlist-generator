/**
 * MetadataProgress Component
 * 
 * Displays progress during metadata parsing from audio files. Shows files parsed,
 * total files, errors, batch progress, and estimated time remaining.
 * 
 * Features:
 * - Progress bar with percentage
 * - File count display (parsed/total)
 * - Error count display
 * - Batch progress (if batched processing)
 * - Estimated time remaining
 * - Current file name display
 * 
 * Props:
 * - `parsed`: Number of files parsed so far
 * - `total`: Total number of files to parse
 * - `errors`: Number of files that failed to parse
 * - `currentFile`: Optional name of current file being parsed
 * - `batch`: Current batch number (if batched)
 * - `totalBatches`: Total number of batches (if batched)
 * - `estimatedTimeRemaining`: Estimated seconds remaining
 * 
 * @module components/MetadataProgress
 * 
 * @example
 * ```tsx
 * <MetadataProgress
 *   parsed={250}
 *   total={500}
 *   errors={2}
 *   batch={3}
 *   totalBatches={5}
 *   estimatedTimeRemaining={120}
 *   currentFile="Music/Album/Track.mp3"
 * />
 * ```
 */

"use client";

import { Loader2 } from "lucide-react";

interface MetadataProgressProps {
  parsed: number;
  total: number;
  errors: number;
  currentFile?: string;
  batch?: number;
  totalBatches?: number;
  estimatedTimeRemaining?: number; // seconds
  onPause?: () => void;
  onStop?: () => void;
}

export function MetadataProgress({
  parsed,
  total,
  errors,
  currentFile,
  batch,
  totalBatches,
  estimatedTimeRemaining,
  onPause,
  onStop,
}: MetadataProgressProps) {
  const percentage = total > 0 ? Math.round((parsed / total) * 100) : 0;
  
  const formatTimeRemaining = (seconds?: number): string => {
    if (!seconds || seconds < 0) return "calculating...";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="">
      <div className="bg-app-surface rounded-sm border border-app-border p-8 md:p-12">
        <div className="text-center">
          <p className="text-app-tertiary text-xs uppercase tracking-wider mb-2">
            Step 2 of 3
          </p>
          <div className="flex items-center justify-center gap-3 text-accent-primary mb-6">
            <Loader2 className="size-6 animate-spin" />
            <span className="uppercase tracking-wider text-lg font-medium">Processing Files...</span>
          </div>

          <div className="max-w-md mx-auto space-y-4">
            <div>
              <div className="h-3 bg-app-hover rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-app-secondary text-sm">
                  <span className="font-medium text-app-primary">{parsed}</span> of <span className="font-medium text-app-primary">{total}</span> files processed
                </p>
                <p className="text-app-tertiary text-sm tabular-nums">
                  {percentage}%
                </p>
              </div>
            </div>

            {batch && totalBatches && (
              <div className="pt-2 border-t border-app-border">
                <p className="text-app-tertiary text-xs uppercase tracking-wider mb-1">
                  Batch Progress
                </p>
                <p className="text-app-secondary text-sm">
                  Batch <span className="font-medium text-app-primary">{batch}</span> of <span className="font-medium text-app-primary">{totalBatches}</span>
                </p>
              </div>
            )}

            {errors > 0 && (
              <div className="pt-2 border-t border-app-border">
                <p className="text-app-tertiary text-xs uppercase tracking-wider mb-1">
                  Errors
                </p>
                <p className="text-red-500 text-sm">
                  {errors} file{errors !== 1 ? "s" : ""} failed to process
                </p>
              </div>
            )}

            {estimatedTimeRemaining !== undefined && (
              <div className="pt-2 border-t border-app-border">
                <p className="text-app-tertiary text-xs uppercase tracking-wider mb-1">
                  Estimated Time Remaining
                </p>
                <p className="text-app-secondary text-sm">
                  {formatTimeRemaining(estimatedTimeRemaining)}
                </p>
              </div>
            )}
            
            {currentFile && (
              <div className="pt-2 border-t border-app-border">
                <p className="text-app-tertiary text-xs uppercase tracking-wider mb-1">
                  Current File
                </p>
                <p className="text-app-secondary text-sm truncate" title={currentFile}>
                  {currentFile}
                </p>
              </div>
            )}
            {(onPause || onStop) && (
              <div className="pt-4 border-t border-app-border flex items-center justify-center gap-2">
                {onPause && (
                  <button
                    type="button"
                    onClick={onPause}
                    className="px-3 py-1.5 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border text-xs uppercase tracking-wider"
                  >
                    Pause
                  </button>
                )}
                {onStop && (
                  <button
                    type="button"
                    onClick={onStop}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-sm border border-red-500/20 text-xs uppercase tracking-wider"
                  >
                    Stop
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

