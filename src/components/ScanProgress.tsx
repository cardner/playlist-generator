/**
 * ScanProgress Component
 * 
 * Displays progress during library file scanning. Shows files found, files scanned,
 * percentage complete, and current file being processed.
 * 
 * Features:
 * - Progress bar with percentage
 * - File count display (scanned/total)
 * - Current file name display
 * - Loading spinner animation
 * 
 * Props:
 * - `found`: Total number of files found
 * - `scanned`: Number of files scanned so far
 * - `currentFile`: Optional name of current file being scanned
 * 
 * @module components/ScanProgress
 * 
 * @example
 * ```tsx
 * <ScanProgress
 *   found={1000}
 *   scanned={450}
 *   currentFile="Music/Album/Track.mp3"
 * />
 * ```
 */

"use client";

import { AudioLines } from "@/components/animate-ui";

interface ScanProgressProps {
  found: number;
  scanned: number;
  currentFile?: string;
  total?: number;
  stage?: "counting" | "scanning";
  onPause?: () => void;
  onStop?: () => void;
}

export function ScanProgress({ found, scanned, currentFile, total, stage, onPause, onStop }: ScanProgressProps) {
  const denominator = total ?? found;
  const percentage = denominator > 0 ? Math.round((scanned / denominator) * 100) : 0;

  if (stage === "counting") {
    return (
      <div className="">
        <div className="bg-app-surface rounded-sm border border-app-border p-8 md:p-12">
          <div className="text-center">
            <p className="text-app-tertiary text-xs uppercase tracking-wider mb-2">
              Step 1 of 3
            </p>
            <div className="flex items-center justify-center gap-3 text-accent-primary mb-6">
              <AudioLines size={24} loop className="size-6" />
              <span className="uppercase tracking-wider text-lg font-medium">Preparing Scan...</span>
            </div>

            <div className="max-w-md mx-auto space-y-4">
              <p className="text-app-secondary text-sm">
                Calculating the total number of tracks in the collection directory.
              </p>
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

  return (
    <div className="">
      <div className="bg-app-surface rounded-sm border border-app-border p-8 md:p-12">
        <div className="text-center">
          <p className="text-app-tertiary text-xs uppercase tracking-wider mb-2">
            Step 1 of 3
          </p>
          <div className="flex items-center justify-center gap-3 text-accent-primary mb-6">
            <AudioLines size={24} loop className="size-6" />
            <span className="uppercase tracking-wider text-lg font-medium">Scanning Library...</span>
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
                  <span className="font-medium text-app-primary">{scanned}</span> of <span className="font-medium text-app-primary">{denominator}</span> files scanned
                </p>
                <p className="text-app-tertiary text-sm tabular-nums">
                  {percentage}%
                </p>
              </div>
            </div>
            
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

