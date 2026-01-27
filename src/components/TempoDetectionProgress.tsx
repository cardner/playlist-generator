/**
 * TempoDetectionProgress Component
 *
 * Displays progress during tempo detection. Shows tracks processed,
 * total tracks, detected count, and current track name.
 */

"use client";

import { Loader2 } from "lucide-react";

interface TempoDetectionProgressProps {
  processed: number;
  total: number;
  detected: number;
  currentTrack?: string;
}

export function TempoDetectionProgress({
  processed,
  total,
  detected,
  currentTrack,
}: TempoDetectionProgressProps) {
  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="">
      <div className="bg-app-surface rounded-sm border border-app-border p-8 md:p-12">
        <div className="text-center">
          <p className="text-app-tertiary text-xs uppercase tracking-wider mb-2">
            Step 3 of 3
          </p>
          <div className="flex items-center justify-center gap-3 text-accent-primary mb-6">
            <Loader2 className="size-6 animate-spin" />
            <span className="uppercase tracking-wider text-lg font-medium">
              Detecting Tempo...
            </span>
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
                  <span className="font-medium text-app-primary">{processed}</span> of{" "}
                  <span className="font-medium text-app-primary">{total}</span> tracks processed
                </p>
                <p className="text-app-tertiary text-sm tabular-nums">{percentage}%</p>
              </div>
            </div>

            <div className="pt-2 border-t border-app-border">
              <p className="text-app-tertiary text-xs uppercase tracking-wider mb-1">
                Tempo Detected
              </p>
              <p className="text-app-secondary text-sm">
                <span className="font-medium text-app-primary">{detected}</span> tracks with BPM
              </p>
            </div>

            {currentTrack && (
              <div className="pt-2 border-t border-app-border">
                <p className="text-app-tertiary text-xs uppercase tracking-wider mb-1">
                  Current Track
                </p>
                <p className="text-app-secondary text-sm truncate" title={currentTrack}>
                  {currentTrack}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

