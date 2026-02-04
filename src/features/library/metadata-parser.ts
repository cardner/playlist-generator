/**
 * Main-thread metadata parser with concurrency control
 * 
 * Parses metadata with controlled concurrency to keep UI responsive
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

/**
 * Progress callback for metadata parsing
 */
export type MetadataProgressCallback = (progress: {
  parsed: number;
  total: number;
  errors: number;
  currentFile?: string;
}) => void;

/**
 * Parse metadata for multiple files with concurrency control
 * 
 * @param files Array of library files to parse
 * @param onProgress Optional progress callback
 * @param concurrency Maximum number of concurrent workers (default: 3)
 * @returns Promise resolving to array of metadata results
 */
/**
 * Parse metadata for a single file
 */
async function parseSingleFile(file: LibraryFile): Promise<MetadataResult> {
  try {
    const metadata = await parseBlob(file.file);

    const warnings: string[] = [];

    // Normalize tags
    const tags = {
      title: normalizeTitle(metadata.common.title, file.file.name),
      artist: normalizeArtist(metadata.common.artist),
      album: normalizeAlbum(metadata.common.album),
      genres: normalizeGenres(metadata.common.genre),
      year: normalizeYear(metadata.common.year),
      trackNo: normalizeTrackNo(metadata.common.track),
      discNo: normalizeDiscNo(metadata.common.disk),
    };

    // Extract tech info
    const tech: TechInfo = {
      durationSeconds: metadata.format.duration
        ? Math.round(metadata.format.duration)
        : undefined,
      bitrate: metadata.format.bitrate,
      sampleRate: metadata.format.sampleRate,
      channels: metadata.format.numberOfChannels,
      bpm: metadata.common.bpm ? Math.round(metadata.common.bpm) : undefined,
      // If BPM comes from ID3 tag, mark it with high confidence and source
      ...(metadata.common.bpm ? {
        bpmConfidence: 1.0, // ID3 tags are considered highly reliable
        bpmSource: 'id3' as const,
      } : {}),
      ...extractCodecInfo(metadata.format),
    };

    // If BPM is missing, attempt local tempo detection while we have the File
    if (!metadata.common.bpm) {
      try {
        const tempo = await detectTempoWithConfidence(file.file, "combined");
        if (tempo.bpm) {
          tech.bpm = tempo.bpm;
          tech.bpmConfidence = tempo.confidence;
          tech.bpmSource = "local-file";
          tech.bpmMethod = tempo.method as "autocorrelation" | "spectral-flux" | "peak-picking" | "combined";
        }
      } catch {
        // Ignore tempo detection failures during parsing
      }
    }

    // Collect warnings
    if (!metadata.common.title) {
      warnings.push("No title tag found, using filename");
    }
    if (!metadata.common.artist) {
      warnings.push("No artist tag found, using 'Unknown Artist'");
    }
    if (!metadata.common.album) {
      warnings.push("No album tag found, using 'Unknown Album'");
    }
    if (!metadata.format.duration) {
      warnings.push("Duration not available");
    }

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
 * Parse metadata for multiple files with concurrency control
 * 
 * Concurrency is limited to keep UI responsive. Default is 3 concurrent tasks.
 * For large libraries (10k+ files), this ensures the browser remains responsive.
 * 
 * @param files Array of library files to parse
 * @param onProgress Optional progress callback
 * @param concurrency Maximum number of concurrent parsing tasks (default: 3)
 *   - Lower values (1-2): More responsive UI, slower parsing
 *   - Higher values (4-6): Faster parsing, may impact UI responsiveness
 *   - Recommended: 3 for balanced performance
 * @returns Promise resolving to array of metadata results
 */
export async function parseMetadataForFiles(
  files: LibraryFile[],
  onProgress?: MetadataProgressCallback,
  concurrency: number = 3,
  signal?: AbortSignal
): Promise<MetadataResult[]> {
  const { measureAsync } = await import("./performance");
  
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

  // Process files with concurrency control
  const processNext = async (): Promise<void> => {
    while (currentIndex < files.length) {
      if (signal?.aborted) {
        throw new DOMException("Metadata parsing aborted", "AbortError");
      }
      const file = files[currentIndex];
      const index = currentIndex;
      currentIndex++;

      // Parse metadata
      const result = await parseSingleFile(file);

      if (result.error) {
        errors++;
      }

      results[index] = result;
      parsed++;

      // Report progress
      onProgress?.({
        parsed,
        total: files.length,
        errors,
        currentFile: file.file.name,
      });

      // Yield control periodically to keep UI responsive
      // More frequent yields for larger batches
      const yieldInterval = files.length > 1000 ? 5 : 10;
      if (parsed % yieldInterval === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  };

  // Start processing with concurrency limit
  const promises: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, files.length); i++) {
    promises.push(processNext());
  }

      // Wait for all to complete
      await Promise.all(promises);

      // Return results in original order
      return results;
    },
    {
      fileCount: files.length,
      concurrency,
    }
  );
}

