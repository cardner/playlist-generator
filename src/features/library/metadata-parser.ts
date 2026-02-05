/**
 * Metadata parser with Web Worker support
 *
 * Parses metadata using a worker pool when available, with fallback to main thread.
 * Tempo detection for tracks missing BPM runs on main thread (requires AudioContext).
 */

import { parseBlob } from "music-metadata";
import type { LibraryFile } from "@/lib/library-selection";
import type { MetadataResult, TechInfo } from "./metadata";
import {
  normalizeTitle,
  normalizeArtist,
  normalizeAlbum,
  normalizeGenres,
  normalizeYear,
  normalizeTrackNo,
  normalizeDiscNo,
  extractCodecInfo,
} from "./metadata";
import { detectTempoWithConfidence } from "./audio-analysis";
import { logger } from "@/lib/logger";

/**
 * Progress callback for metadata parsing
 */
export type MetadataProgressCallback = (progress: {
  parsed: number;
  total: number;
  errors: number;
  currentFile?: string;
}) => void;

/** Default concurrency based on hardware, capped for stability */
function getDefaultConcurrency(): number {
  if (typeof navigator === "undefined" || !navigator.hardwareConcurrency) {
    return 4;
  }
  return Math.min(Math.max(1, navigator.hardwareConcurrency - 1), 8);
}

/**
 * Worker pool for metadata parsing
 */
class MetadataWorkerPool {
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;
  private readonly poolSize: number;
  private readonly workerUrl: string;
  private initPromise: Promise<void> | null = null;

  constructor(poolSize: number, workerUrl: string = "/metadataWorker.js") {
    this.poolSize = poolSize;
    this.workerUrl = workerUrl;
  }

  private async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      for (let i = 0; i < this.poolSize; i++) {
        try {
          const worker = new Worker(this.workerUrl, { type: "classic" });
          this.workers.push(worker);
        } catch (err) {
          logger.debug("Metadata worker creation failed, will use main thread", err);
          break;
        }
      }
    })();
    return this.initPromise;
  }

  async parseFile(trackFileId: string, file: File): Promise<MetadataResult> {
    await this.init();
    if (this.workers.length === 0) {
      throw new Error("WORKER_UNAVAILABLE");
    }
    const worker = this.workers[this.nextWorkerIndex % this.workers.length];
    this.nextWorkerIndex++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener("message", handler);
        reject(new Error("Metadata parse timeout"));
      }, 60000);
      const handler = (event: MessageEvent<MetadataResult>) => {
        if (event.data.trackFileId !== trackFileId) return;
        clearTimeout(timeout);
        worker.removeEventListener("message", handler);
        resolve(event.data);
      };
      worker.addEventListener("message", handler);
      worker.postMessage({ trackFileId, file });
    });
  }

  terminate(): void {
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers = [];
    this.initPromise = null;
  }

  get size(): number {
    return this.workers.length;
  }
}

/** Per-file timeout for main-thread parsing (prevents indefinite hangs on problematic files) */
const MAIN_THREAD_PARSE_TIMEOUT_MS = 90_000; // 90 seconds

/**
 * Parse metadata on main thread with timeout (fallback when workers unavailable or fail)
 */
async function parseSingleFileWithTimeout(file: LibraryFile): Promise<MetadataResult> {
  const timeoutPromise = new Promise<MetadataResult>((_, reject) => {
    setTimeout(
      () => reject(new Error("Parse timeout")),
      MAIN_THREAD_PARSE_TIMEOUT_MS
    );
  });
  return Promise.race([
    parseSingleFileMainThread(file),
    timeoutPromise,
  ]).catch((err) => {
    if (err instanceof Error && err.message.includes("timeout")) {
      logger.warn("Main-thread parse timeout for file:", file.file.name);
      return {
        trackFileId: file.trackFileId,
        error: "Parse timeout - file may be corrupted or unusually large",
      };
    }
    throw err;
  });
}

/**
 * Parse metadata on main thread (fallback when workers unavailable)
 */
async function parseSingleFileMainThread(file: LibraryFile): Promise<MetadataResult> {
  try {
    const metadata = await parseBlob(file.file);

    const warnings: string[] = [];

    const tags = {
      title: normalizeTitle(metadata.common.title, file.file.name),
      artist: normalizeArtist(metadata.common.artist),
      album: normalizeAlbum(metadata.common.album),
      genres: normalizeGenres(metadata.common.genre),
      year: normalizeYear(metadata.common.year),
      trackNo: normalizeTrackNo(metadata.common.track),
      discNo: normalizeDiscNo(metadata.common.disk),
    };

    const tech: TechInfo = {
      durationSeconds: metadata.format.duration
        ? Math.round(metadata.format.duration)
        : undefined,
      bitrate: metadata.format.bitrate,
      sampleRate: metadata.format.sampleRate,
      channels: metadata.format.numberOfChannels,
      bpm: metadata.common.bpm ? Math.round(metadata.common.bpm) : undefined,
      ...(metadata.common.bpm
        ? {
            bpmConfidence: 1.0,
            bpmSource: "id3" as const,
          }
        : {}),
      ...extractCodecInfo(metadata.format),
    };

    if (!metadata.common.bpm) {
      try {
        const tempo = await detectTempoWithConfidence(file.file, "combined");
        if (tempo.bpm) {
          tech.bpm = tempo.bpm;
          tech.bpmConfidence = tempo.confidence;
          tech.bpmSource = "local-file";
          tech.bpmMethod = tempo.method as
            | "autocorrelation"
            | "spectral-flux"
            | "peak-picking"
            | "combined";
        }
      } catch {
        // Ignore tempo detection failures
      }
    }

    if (!metadata.common.title) warnings.push("No title tag found, using filename");
    if (!metadata.common.artist) warnings.push("No artist tag found, using 'Unknown Artist'");
    if (!metadata.common.album) warnings.push("No album tag found, using 'Unknown Album'");
    if (!metadata.format.duration) warnings.push("Duration not available");

    return {
      trackFileId: file.trackFileId,
      tags,
      tech,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error parsing metadata";
    return {
      trackFileId: file.trackFileId,
      error: errorMessage,
    };
  }
}

/**
 * Add tempo detection to a result that lacks BPM (runs on main thread)
 */
async function addTempoIfMissing(
  result: MetadataResult,
  file: File
): Promise<MetadataResult> {
  if (result.error || !result.tech || result.tech.bpm) return result;
  try {
    const tempo = await detectTempoWithConfidence(file, "combined");
    if (tempo.bpm && result.tech) {
      result.tech.bpm = tempo.bpm;
      result.tech.bpmConfidence = tempo.confidence;
      result.tech.bpmSource = "local-file";
      result.tech.bpmMethod = tempo.method as
        | "autocorrelation"
        | "spectral-flux"
        | "peak-picking"
        | "combined";
    }
  } catch {
    // Ignore tempo detection failures
  }
  return result;
}

/**
 * Parse metadata for multiple files with worker pool and concurrency control
 *
 * Uses Web Workers when available for parallel parsing. Falls back to main thread
 * if worker creation fails. Concurrency defaults to hardwareConcurrency - 1 (capped 1-8).
 */
export async function parseMetadataForFiles(
  files: LibraryFile[],
  onProgress?: MetadataProgressCallback,
  concurrency?: number,
  signal?: AbortSignal
): Promise<MetadataResult[]> {
  const { measureAsync } = await import("./performance");

  const effectiveConcurrency =
    concurrency ?? Math.min(getDefaultConcurrency(), files.length);

  return measureAsync(
    "parseMetadataForFiles",
    async () => {
      if (files.length === 0) {
        return [];
      }

      const results: MetadataResult[] = new Array(files.length);
      let parsed = 0;
      let errors = 0;
      let currentIndex = 0;
      let useWorkers = true;
      let pool: MetadataWorkerPool | null = null;

      try {
        pool = new MetadataWorkerPool(effectiveConcurrency);
        if (pool.size === 0) {
          useWorkers = false;
          logger.debug("Metadata workers unavailable, using main thread");
        }
      } catch {
        useWorkers = false;
      }

      const parseOne = async (file: LibraryFile, index: number): Promise<void> => {
        if (signal?.aborted) {
          throw new DOMException("Metadata parsing aborted", "AbortError");
        }

        let result: MetadataResult;

        if (useWorkers && pool && pool.size > 0) {
          try {
            result = await pool.parseFile(file.trackFileId, file.file);
            if (!result.error && result.tech && !result.tech.bpm) {
              result = await addTempoIfMissing(result, file.file);
            }
          } catch (err) {
            const isTimeout =
              err instanceof Error &&
              (err.message.includes("timeout") || err.message.includes("Timeout"));
            if (isTimeout) {
              logger.warn("Metadata parse timeout for file, skipping to avoid hang:", file.file.name);
              result = {
                trackFileId: file.trackFileId,
                error: "Parse timeout - file may be corrupted or unusually large",
              };
            } else {
              logger.debug("Worker parse failed, falling back to main thread", err);
              result = await parseSingleFileWithTimeout(file);
            }
          }
        } else {
          result = await parseSingleFileWithTimeout(file);
        }

        if (result.error) errors++;

        results[index] = result;
        parsed++;

        onProgress?.({
          parsed,
          total: files.length,
          errors,
          currentFile: file.file.name,
        });

        const yieldInterval = files.length > 1000 ? 5 : 10;
        if (parsed % yieldInterval === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      };

      const processNext = async (): Promise<void> => {
        while (currentIndex < files.length) {
          const index = currentIndex;
          currentIndex++;
          await parseOne(files[index], index);
        }
      };

      const promises: Promise<void>[] = [];
      for (let i = 0; i < Math.min(effectiveConcurrency, files.length); i++) {
        promises.push(processNext());
      }

      await Promise.all(promises);

      pool?.terminate();

      return results;
    },
    {
      fileCount: files.length,
      concurrency: effectiveConcurrency,
    }
  );
}
