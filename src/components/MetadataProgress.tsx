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
}

export function MetadataProgress({
  parsed,
  total,
  errors,
  currentFile,
  batch,
  totalBatches,
  estimatedTimeRemaining,
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
    <div className="max-w-4xl">
      <div className="bg-app-surface rounded-sm border border-app-border p-8 md:p-12">
        <div className="text-center">
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
          </div>
        </div>
      </div>
    </div>
  );
}

