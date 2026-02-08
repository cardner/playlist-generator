/**
 * RelinkLibraryRoot Component
 * 
 * Component for relinking a library root when the folder has been moved or renamed.
 * Provides UI for initiating the relink process, displaying progress, and showing
 * results (matched/unmatched tracks).
 * 
 * Features:
 * - Relink initiation button
 * - Progress display during relinking
 * - Results summary (matched/unmatched counts)
 * - Error handling and display
 * - Success callback on completion
 * 
 * Relinking Process:
 * 1. User clicks "Relink Library"
 * 2. System prompts for new folder location
 * 3. Matches existing tracks by relativePath + size + mtime
 * 4. Creates new library root with updated paths
 * 5. Updates all matched tracks and file index entries
 * 
 * State Management:
 * - Manages relinking state (idle, in-progress, complete)
 * - Tracks progress updates from relink function
 * - Stores and displays relink results
 * 
 * Props:
 * - `libraryRootId`: ID of the library root to relink
 * - `onRelinkComplete`: Callback when relink succeeds (receives new root ID)
 * - `onError`: Optional callback when relink fails
 * 
 * @module components/RelinkLibraryRoot
 * 
 * @example
 * ```tsx
 * <RelinkLibraryRoot
 *   libraryRootId="root-123"
 *   onRelinkComplete={(newRootId) => {
 *     // Update UI with new root ID
 *     setLibraryRootId(newRootId);
 *   }}
 * />
 * ```
 */

"use client";

import { useState, useRef } from "react";
import { relinkLibraryRoot, type RelinkProgress } from "@/features/library/relink";
import { FolderOpen, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface RelinkLibraryRootProps {
  libraryRootId: string;
  onRelinkComplete?: (newRootId: string) => void;
  onError?: () => void;
}

export function RelinkLibraryRoot({
  libraryRootId,
  onRelinkComplete,
  onError,
}: RelinkLibraryRootProps) {
  const [isRelinking, setIsRelinking] = useState(false);
  const relinkInProgressRef = useRef(false);
  const [progress, setProgress] = useState<RelinkProgress | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    matched: number;
    unmatched: number;
    total: number;
    errors?: string[];
  } | null>(null);

  async function handleRelink() {
    if (relinkInProgressRef.current) return;
    relinkInProgressRef.current = true;
    setIsRelinking(true);
    setProgress(null);
    setResult(null);

    try {
      const relinkResult = await relinkLibraryRoot(libraryRootId, (prog) => {
        setProgress(prog);
      });

      setResult({
        success: relinkResult.success,
        matched: relinkResult.matched,
        unmatched: relinkResult.unmatched,
        total: relinkResult.total,
        errors: relinkResult.errors,
      });

      if (relinkResult.success && onRelinkComplete) {
        onRelinkComplete(relinkResult.newRootId);
      }
    } catch (error) {
      logger.error("Relink failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setResult({
        success: false,
        matched: 0,
        unmatched: 0,
        total: 0,
        errors: [errorMessage],
      });
      // Notify parent of error
      onError?.();
    } finally {
      relinkInProgressRef.current = false;
      setIsRelinking(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        {result.success ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-sm p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-green-500 font-medium mb-2">
                  Relink Successful
                </h3>
                <div className="text-sm text-app-secondary space-y-1">
                  <p>
                    Matched <strong>{result.matched}</strong> of{" "}
                    <strong>{result.total}</strong> tracks
                  </p>
                  {result.unmatched > 0 && (
                    <p className="text-yellow-500">
                      {result.unmatched} tracks could not be matched. They may
                      have been moved or deleted.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-500 font-medium mb-2">
                  Relink Failed
                </h3>
                {result.errors && result.errors.length > 0 && (
                  <ul className="text-sm text-red-500 list-disc list-inside">
                    {result.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => {
            setResult(null);
            setProgress(null);
          }}
          className="px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm transition-colors text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-app-primary font-medium mb-2 uppercase tracking-wider text-sm">
          Relink Library Root
        </h3>
        <p className="text-app-secondary text-sm mb-4">
          If your music library has been moved, you can re-select the folder to
          update file paths. Tracks will be matched by relative path, file size,
          and modification time.
        </p>
      </div>

      {progress && (
        <div className="bg-app-hover rounded-sm p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="size-5 text-accent-primary animate-spin" />
            <div className="flex-1">
              <div className="text-sm text-app-primary font-medium">
                Relinking library...
              </div>
              <div className="text-xs text-app-tertiary mt-1">
                Scanned: {progress.scanned} | Matched: {progress.matched}
                {progress.currentFile && (
                  <span className="ml-2">• {progress.currentFile}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleRelink}
        disabled={isRelinking}
        className={cn(
          "flex items-center gap-3 px-4 py-3 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          isRelinking && "bg-accent-primary/10 border-accent-primary"
        )}
      >
        {isRelinking ? (
          <Loader2 className="size-5 text-accent-primary animate-spin shrink-0" />
        ) : (
          <FolderOpen className="size-5 text-accent-primary shrink-0" />
        )}
        <span className="font-medium">
          {isRelinking ? "Relinking..." : "Select New Library Folder"}
        </span>
      </button>
    </div>
  );
}

