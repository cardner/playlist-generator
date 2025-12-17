"use client";

import { useState, useEffect } from "react";
import type { LibraryFile } from "@/lib/library-selection";
import {
  parseMetadataForFiles,
  type MetadataResult,
  type MetadataProgressCallback,
} from "@/features/library";

interface MetadataParserProps {
  files: LibraryFile[];
  onComplete?: (results: MetadataResult[]) => void;
  onError?: (error: Error) => void;
}

export function MetadataParser({
  files,
  onComplete,
  onError,
}: MetadataParserProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState<{
    parsed: number;
    total: number;
    errors: number;
    currentFile?: string;
  } | null>(null);
  const [results, setResults] = useState<MetadataResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (files.length > 0 && !isParsing && !results) {
      handleParse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const handleParse = async () => {
    setIsParsing(true);
    setError(null);
    setProgress({ parsed: 0, total: files.length, errors: 0 });

    const onProgress: MetadataProgressCallback = (progressData) => {
      setProgress(progressData);
    };

    try {
      const parsedResults = await parseMetadataForFiles(files, onProgress, 3);
      setResults(parsedResults);
      onComplete?.(parsedResults);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to parse metadata";
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsParsing(false);
    }
  };

  if (files.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div className="max-w-4xl">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-sm">
          <p className="text-red-500 text-sm">
            <strong>Metadata parsing error:</strong> {error}
          </p>
        </div>
      </div>
    );
  }

  if (isParsing && progress) {
    const percentage = progress.total > 0 
      ? Math.round((progress.parsed / progress.total) * 100) 
      : 0;

    return (
      <div className="max-w-4xl">
        <div className="bg-app-surface rounded-sm shadow-2xl p-6">
          <h3 className="text-app-primary mb-4 uppercase tracking-wider text-xs">Parsing Metadata</h3>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-app-secondary">
                  Parsed {progress.parsed} of {progress.total} files
                </span>
                <span className="text-app-secondary">
                  {percentage}%
                </span>
              </div>
              <div className="w-full bg-app-hover rounded-full h-2">
                <div
                  className="bg-accent-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            {progress.errors > 0 && (
              <div className="text-sm text-red-500">
                {progress.errors} file(s) had parsing errors
              </div>
            )}

            {progress.currentFile && (
              <p className="text-sm text-app-tertiary truncate">
                Parsing: {progress.currentFile}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (results) {
    const errorCount = results.filter((r) => r.error).length;
    const successCount = results.length - errorCount;

    return (
      <div className="max-w-4xl">
        <div className="bg-app-surface rounded-sm shadow-2xl p-6">
          <h3 className="text-app-primary mb-4 uppercase tracking-wider text-xs">Metadata Parsing Complete</h3>
          
          <div className="grid grid-cols-2 gap-px bg-app-border">
            <div className="bg-app-surface p-4">
              <div className="text-2xl font-bold text-accent-primary tabular-nums">
                {successCount}
              </div>
              <div className="text-sm text-app-secondary uppercase tracking-wider mt-1">
                Successfully Parsed
              </div>
            </div>

            {errorCount > 0 && (
              <div className="bg-app-surface p-4">
                <div className="text-2xl font-bold text-red-500 tabular-nums">
                  {errorCount}
                </div>
                <div className="text-sm text-app-secondary uppercase tracking-wider mt-1">
                  Parse Errors
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

