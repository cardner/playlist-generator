"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useBackgroundLibraryTasks } from "./BackgroundLibraryTasksProvider";

export function BackgroundTaskOverlay() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { scanning, metadataParsing, metadataEnhancement } = useBackgroundLibraryTasks();
  const { isScanning, scanProgress } = scanning;
  const { isParsingMetadata, metadataProgress, isDetectingTempo, tempoProgress } =
    metadataParsing;
  const { isEnhancing, progress: enhancementProgress } = metadataEnhancement;

  const isLibraryPage = pathname?.startsWith("/library");

  const activeTaskCount = useMemo(() => {
    let count = 0;
    if (isScanning) count += 1;
    if (isParsingMetadata) count += 1;
    if (isDetectingTempo) count += 1;
    if (isEnhancing) count += 1;
    return count;
  }, [isScanning, isParsingMetadata, isDetectingTempo, isEnhancing]);

  if (isLibraryPage || activeTaskCount === 0) {
    return null;
  }

  return (
    <div className="fixed left-4 top-16 z-40 pointer-events-none">
      <div className="pointer-events-auto w-[320px] max-w-[calc(100vw-2rem)] bg-app-surface border border-app-border rounded-sm shadow-lg">
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-b border-app-border"
          aria-expanded={!isCollapsed}
        >
          <div className="text-app-primary text-sm font-medium">
            Background tasks
            <span className="ml-2 text-xs text-app-tertiary">
              {activeTaskCount}
            </span>
          </div>
          {isCollapsed ? (
            <ChevronDown className="size-4 text-app-tertiary" />
          ) : (
            <ChevronUp className="size-4 text-app-tertiary" />
          )}
        </button>
        {!isCollapsed && (
          <div className="px-3 py-3 space-y-3 text-xs text-app-secondary">
            {isScanning && (
              <div>
                <div className="text-app-primary font-medium">Scanning library</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span>
                    {scanProgress
                      ? `${scanProgress.scanned}/${scanProgress.found} files`
                      : "Starting..."}
                  </span>
                  {scanProgress?.currentFile && (
                    <span className="text-app-tertiary truncate max-w-[140px]">
                      {scanProgress.currentFile}
                    </span>
                  )}
                </div>
              </div>
            )}
            {isParsingMetadata && (
              <div>
                <div className="text-app-primary font-medium">Processing metadata</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span>
                    {metadataProgress
                      ? `${metadataProgress.parsed}/${metadataProgress.total} files`
                      : "Starting..."}
                  </span>
                  {metadataProgress?.currentFile && (
                    <span className="text-app-tertiary truncate max-w-[140px]">
                      {metadataProgress.currentFile}
                    </span>
                  )}
                </div>
              </div>
            )}
            {isDetectingTempo && (
              <div>
                <div className="text-app-primary font-medium">Detecting tempo</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span>
                    {tempoProgress
                      ? `${tempoProgress.detected}/${tempoProgress.processed} detected`
                      : "Starting..."}
                  </span>
                  {tempoProgress?.currentTrack && (
                    <span className="text-app-tertiary truncate max-w-[140px]">
                      {tempoProgress.currentTrack}
                    </span>
                  )}
                </div>
              </div>
            )}
            {isEnhancing && (
              <div>
                <div className="text-app-primary font-medium">Enhancing metadata</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span>
                    {enhancementProgress
                      ? `${enhancementProgress.processed}/${enhancementProgress.total} tracks`
                      : "Starting..."}
                  </span>
                  {enhancementProgress?.currentTrack && (
                    <span className="text-app-tertiary truncate max-w-[140px]">
                      {enhancementProgress.currentTrack.tags.title}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
