/**
 * Metadata Enhancement Service
 * 
 * Combines MusicBrainz API and audio analysis to enhance track metadata.
 * Provides functions for enhancing individual tracks or entire libraries.
 * 
 * Features:
 * - MusicBrainz API integration for genres and similar artists
 * - Audio analysis for tempo/BPM detection
 * - Batch processing with progress callbacks
 * - Caching to avoid redundant API calls
 * 
 * @module features/library/metadata-enhancement
 */

import type { TrackRecord, LibraryRootRecord } from "@/db/schema";
import type { EnhancedMetadata } from "@/features/library/metadata";
import { findRecordingByTrack, getRecordingGenres, getSimilarArtists } from "@/features/discovery/musicbrainz-client";
import { detectTempo, detectTempoWithConfidence } from "./audio-analysis";
import { searchTrackSample } from "@/features/audio-preview/platform-searcher";
import { updateTrackMetadata } from "@/db/storage-tracks";
import { getFileIndexEntries } from "@/db/storage";
import { getLibraryRoot } from "@/db/storage-library-root";
import { db, getCompositeId } from "@/db/schema";
import { logger } from "@/lib/logger";
import { inferActivityFromTrack } from "./activity-inference";

const LOG_THROTTLE_MS = 2000;
const logStates = new Map<string, { last: number; suppressed: number }>();
const tempoDecodeFailureSignatures = new Set<string>();
const MAX_TEMPO_FILE_BYTES = 250 * 1024 * 1024;

const EXTENSION_BLOCKLIST = new Set([
  "flac",
  "alac",
  "wma",
  "ape",
  "aiff",
  "aif",
  "dsd",
]);

const EXTENSION_ALLOWLIST = new Set([
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "aac",
  "mp4",
  "webm",
]);

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function getSignature(file: File): string {
  const ext = getExtension(file.name ?? "");
  const type = file.type?.toLowerCase() ?? "";
  return `${ext}|${type}`;
}

function canPlayMimeType(type: string): boolean {
  if (!type || typeof document === "undefined") {
    return false;
  }
  try {
    const audio = document.createElement("audio");
    return audio.canPlayType(type) !== "";
  } catch {
    return false;
  }
}

function isTempoDecodableFile(file: File): boolean {
  const name = file.name?.toLowerCase() ?? "";
  const type = file.type?.toLowerCase() ?? "";
  const ext = getExtension(name);
  const signature = getSignature(file);

  if (tempoDecodeFailureSignatures.has(signature)) {
    return false;
  }

  if (file.size > MAX_TEMPO_FILE_BYTES) {
    return false;
  }

  if (ext && EXTENSION_BLOCKLIST.has(ext)) {
    return false;
  }

  if (type && !canPlayMimeType(type)) {
    return false;
  }

  if (ext && !EXTENSION_ALLOWLIST.has(ext) && !type.startsWith("audio/")) {
    return false;
  }

  return true;
}

function recordTempoDecodeFailure(file: File, error: unknown): void {
  if (error instanceof DOMException && error.name === "EncodingError") {
    tempoDecodeFailureSignatures.add(getSignature(file));
  }
}

function logThrottled(
  level: "debug" | "warn" | "error",
  key: string,
  message: string,
  error?: unknown
): void {
  const now = Date.now();
  const state = logStates.get(key) ?? { last: 0, suppressed: 0 };

  if (now - state.last < LOG_THROTTLE_MS) {
    state.suppressed += 1;
    logStates.set(key, state);
    return;
  }

  const suffix = state.suppressed > 0 ? ` (suppressed ${state.suppressed} similar logs)` : "";
  logStates.set(key, { last: now, suppressed: 0 });
  const fullMessage = `${message}${suffix}`;

  if (level === "debug") {
    logger.debug(fullMessage, error);
  } else if (level === "warn") {
    logger.warn(fullMessage, error);
  } else {
    logger.error(fullMessage, error);
  }
}

/**
 * Detect tempo from iTunes preview sample
 * 
 * Downloads the 30-second preview sample from iTunes and runs tempo detection on it.
 * This is useful when local file access is not available.
 * 
 * @param track - Track record to detect tempo for
 * @returns Promise resolving to tempo result with BPM, confidence, method, and source
 */
async function detectTempoFromPreview(
  track: TrackRecord
): Promise<{ bpm: number | null; confidence: number; method: string; source: 'itunes-preview' } | null> {
  try {
    // Search iTunes for preview URL
    const sampleResult = await searchTrackSample({
      title: track.tags.title,
      artist: track.tags.artist,
      album: track.tags.album,
    });
    
    if (!sampleResult || !sampleResult.url) {
      return null;
    }
    
    // Download preview sample
    const response = await fetch(sampleResult.url);
    if (!response.ok) {
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer]);
    const file = new File([blob], 'preview.m4a', { type: 'audio/m4a' });
    
    // Run tempo detection on preview
    const result = await detectTempoWithConfidence(file, 'combined');
    
    if (result.bpm) {
      return {
        ...result,
        source: 'itunes-preview',
      };
    }
    
    return null;
  } catch (error) {
    logThrottled("debug", "tempo-preview", "Failed to detect tempo from iTunes preview:", error);
    return null;
  }
}

/**
 * Get a File object from a track record using File System Access API
 * 
 * @param track - Track record
 * @returns Promise resolving to File object or null if not accessible
 */
async function getFileForTrack(track: TrackRecord): Promise<File | null> {
  try {
    // Get library root to access the directory handle
    const libraryRoot = await getLibraryRoot(track.libraryRootId);
    if (!libraryRoot || libraryRoot.mode !== "handle" || !libraryRoot.handleRef) {
      return null;
    }

    // Get directory handle from database
    const handleRecord = await db.directoryHandles.get(libraryRoot.handleRef);
    const rootHandle = handleRecord?.handle as FileSystemDirectoryHandle | undefined;
    if (!rootHandle) {
      return null;
    }

    // Get file index entry to get relative path
    const fileIndex = await db.fileIndex.get(getCompositeId(track.trackFileId, track.libraryRootId));
    if (!fileIndex?.relativePath) {
      return null;
    }

    // Navigate to file using relative path
    const parts = fileIndex.relativePath.split("/").filter(p => p.length > 0);
    let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = rootHandle;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (currentHandle instanceof FileSystemDirectoryHandle) {
        if (isLast) {
          // Last part should be a file
          const fileHandle = await currentHandle.getFileHandle(part);
          if (fileHandle) {
            return await fileHandle.getFile();
          }
          return null;
        } else {
          // Intermediate part should be a directory
          currentHandle = await currentHandle.getDirectoryHandle(part);
        }
      } else {
        // Unexpected: hit a file before the end of the path
        return null;
      }
    }

    return null;
  } catch (error) {
    logThrottled(
      "debug",
      "file-handle",
      `Failed to get file for track ${track.trackFileId}:`,
      error
    );
    return null;
  }
}

/**
 * Enhancement progress callback
 */
export interface EnhancementProgress {
  /** Current track being processed */
  currentTrack: TrackRecord;
  /** Number of tracks processed so far */
  processed: number;
  /** Total number of tracks to process */
  total: number;
  /** Number of tracks successfully enhanced */
  enhanced: number;
  /** Number of tracks matched to MusicBrainz */
  matched: number;
  /** Number of tracks with tempo detected */
  tempoDetected: number;
}

/**
 * Enhancement result
 */
export interface EnhancementResult {
  /** Number of tracks processed */
  processed: number;
  /** Number of tracks successfully enhanced */
  enhanced: number;
  /** Number of tracks matched to MusicBrainz */
  matched: number;
  /** Number of tracks with tempo detected */
  tempoDetected: number;
  /** Errors encountered during enhancement */
  errors: Array<{ trackId: string; error: string }>;
}

/**
 * Enhance metadata for a single track
 * 
 * Combines MusicBrainz API lookup and audio analysis to enhance track metadata.
 * Updates the track in IndexedDB with enhanced metadata.
 * 
 * @param track - Track record to enhance
 * @param file - Audio file for tempo analysis (optional, will try to load if not provided)
 * @returns Promise resolving to enhanced metadata or null if enhancement failed
 * 
 * @example
 * ```typescript
 * const enhanced = await enhanceTrackMetadata(track, audioFile);
 * if (enhanced) {
 *   console.log(`Enhanced: ${enhanced.genres?.join(', ')}`);
 * }
 * ```
 */
export async function enhanceTrackMetadata(
  track: TrackRecord,
  file?: File
): Promise<EnhancedMetadata | null> {
  try {
    const enhanced: EnhancedMetadata = {};
    let hasEnhancements = false;

    // 1. Find MusicBrainz recording
    let musicbrainzId: string | undefined;
    const recording = await findRecordingByTrack(track);
    if (recording) {
      musicbrainzId = recording.mbid;
      
      // Get enhanced genres
      const genres = await getRecordingGenres(recording.mbid);
      if (genres.length > 0) {
        enhanced.genres = genres;
        hasEnhancements = true;
      }
      
      // Get similar artists
      const similarArtists = await getSimilarArtists(recording.mbid, 10);
      if (similarArtists.length > 0) {
        enhanced.similarArtists = similarArtists;
        hasEnhancements = true;
      }
      
      // Store MusicBrainz tags
      if (recording.tags && recording.tags.length > 0) {
        enhanced.musicbrainzTags = recording.tags;
        hasEnhancements = true;
      }
    }

    // 2. Detect tempo from audio file or iTunes preview
    type TempoResult = { bpm: number | null; confidence: number; method: string; source: 'local-file' | 'itunes-preview' };
    let tempoResult: TempoResult | null = null;
    
    // Try local file first
    let audioFile: File | null = null;
    if (file) {
      audioFile = file;
    } else {
      // Try to load file using File System Access API
      audioFile = await getFileForTrack(track);
      if (!audioFile) {
        logThrottled(
          "debug",
          "tempo-local-missing",
          `Cannot detect tempo from local file: file handle not available for ${track.trackFileId}`
        );
      }
    }

    if (audioFile) {
      try {
        if (!isTempoDecodableFile(audioFile)) {
          logThrottled(
            "debug",
            "tempo-skip-codec",
            `Skipping tempo detection for unsupported codec: ${audioFile.name}`
          );
          audioFile = null;
        }
      } catch (error) {
        const fileName = audioFile?.name ?? "unknown-file";
        logThrottled(
          "debug",
          "tempo-codec-check",
          `Failed to validate codec for ${fileName}`,
          error
        );
        audioFile = null;
      }
    }

    if (audioFile) {
      try {
        const result = await detectTempoWithConfidence(audioFile, 'combined');
        if (result.bpm) {
          tempoResult = {
            ...result,
            source: 'local-file',
          };
        }
      } catch (error) {
        recordTempoDecodeFailure(audioFile, error);
        logThrottled(
          "warn",
          "tempo-local-fail",
          `Failed to detect tempo for track ${track.trackFileId}:`,
          error
        );
      }
    }
    
    // If local file detection failed, try iTunes preview
    if (!tempoResult || !tempoResult.bpm || tempoResult.confidence < 0.5) {
      try {
        const previewResult = await detectTempoFromPreview(track);
        if (previewResult && previewResult.bpm && (!tempoResult || previewResult.confidence > tempoResult.confidence)) {
          tempoResult = previewResult;
        }
      } catch (error) {
        logThrottled(
          "debug",
          "tempo-preview-fail",
          `Failed to detect tempo from iTunes preview for track ${track.trackFileId}:`,
          error
        );
      }
    }
    
    if (tempoResult && tempoResult.bpm) {
      enhanced.tempo = tempoResult.bpm;
      hasEnhancements = true;
      
      // Update tech info with confidence, source, and method
      // We'll update the track record directly to store this in tech.bpmConfidence, etc.
      try {
        const trackId = getCompositeId(track.trackFileId, track.libraryRootId);
        const existing = await db.tracks.get(trackId);
        if (existing) {
          await db.tracks.update(trackId, {
            tech: {
              ...existing.tech,
              bpm: tempoResult.bpm,
              bpmConfidence: tempoResult.confidence,
              bpmSource: tempoResult.source,
              bpmMethod: tempoResult.method as 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined',
            },
          });
        }
      } catch (error) {
        logThrottled(
          "warn",
          "tempo-update-fail",
          `Failed to update tech info with tempo metadata for track ${track.trackFileId}:`,
          error
        );
      }
    }

    // 3. Infer activity tags if missing and not manually set
    const manualFields = track.enhancedMetadata?.manualFields || [];
    const hasManualActivity = manualFields.includes("activity");
    if (!hasManualActivity && !(track.enhancedMetadata?.activity?.length)) {
      const inferredActivity = inferActivityFromTrack(track);
      if (inferredActivity.length > 0) {
        enhanced.activity = inferredActivity;
        hasEnhancements = true;
      }
    }

    if (!hasEnhancements) {
      return null;
    }

    // 4. Update track in database
    await updateTrackMetadata(track.id, enhanced, false); // false = not manual edit
    
    // Also update metadataEnhancementDate and musicbrainzId
    await db.tracks.update(track.id, {
      metadataEnhancementDate: Date.now(),
      ...(musicbrainzId && { musicbrainzId }),
    });

    return enhanced;
  } catch (error) {
    logThrottled("error", "enhance-track", `Failed to enhance track ${track.id}:`, error);
    throw error;
  }
}

/**
 * Enhance metadata for all tracks in a library
 * 
 * Processes tracks in batches to avoid blocking the UI. Provides progress
 * callbacks for UI updates. Respects MusicBrainz rate limits.
 * 
 * @param libraryRootId - Library root ID to enhance tracks for
 * @param onProgress - Optional progress callback
 * @param batchSize - Number of tracks to process per batch (default: 10)
 * @returns Promise resolving to enhancement result
 * 
 * @example
 * ```typescript
 * const result = await enhanceLibraryMetadata(libraryRootId, (progress) => {
 *   console.log(`Processed ${progress.processed}/${progress.total}`);
 * });
 * ```
 */
export async function enhanceLibraryMetadata(
  libraryRootId: string,
  onProgress?: (progress: EnhancementProgress) => void,
  batchSize: number = 10
): Promise<EnhancementResult> {
  const result: EnhancementResult = {
    processed: 0,
    enhanced: 0,
    matched: 0,
    tempoDetected: 0,
    errors: [],
  };

  try {
    // Get all tracks for the library
    const tracks = await db.tracks
      .where("libraryRootId")
      .equals(libraryRootId)
      .toArray();

    const total = tracks.length;
    logger.info(`Starting metadata enhancement for ${total} tracks`);

    // Process tracks in batches
    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize);
      
      // Process batch sequentially to respect rate limits
      for (const track of batch) {
        try {
          // Report progress
          if (onProgress) {
            onProgress({
              currentTrack: track,
              processed: result.processed,
              total,
              enhanced: result.enhanced,
              matched: result.matched,
              tempoDetected: result.tempoDetected,
            });
          }

          // Enhance track (without file for now - tempo detection requires file handles)
          const enhanced = await enhanceTrackMetadata(track);
          
          result.processed++;
          
          // Check if tempo was detected (check tech.bpm after enhancement)
          const updatedTrack = await db.tracks.get(track.id);
          if (updatedTrack?.tech?.bpm) {
            result.tempoDetected++;
          }
          
          if (enhanced) {
            result.enhanced++;
            // Reload track to check if musicbrainzId was set
            const updatedTrack = await db.tracks.get(track.id);
            if (updatedTrack?.musicbrainzId) {
              result.matched++;
            }
            if (enhanced.tempo) {
              result.tempoDetected++;
            }
          }

          // Small delay to respect rate limits (MusicBrainz: 1 req/sec)
          // We're processing sequentially, so this helps avoid hitting limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          result.processed++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({
            trackId: track.id,
            error: errorMessage,
          });
          logThrottled("error", "enhance-track-batch", `Failed to enhance track ${track.id}:`, error);
        }
      }
    }

    logger.info(`Metadata enhancement complete: ${result.enhanced}/${result.processed} tracks enhanced`);
    return result;
  } catch (error) {
    logger.error("Failed to enhance library metadata:", error);
    throw error;
  }
}

/**
 * Enhance metadata for selected tracks
 * 
 * Similar to enhanceLibraryMetadata but only processes specified tracks.
 * 
 * @param trackIds - Array of composite track IDs to enhance
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to enhancement result
 */
export async function enhanceSelectedTracks(
  trackIds: string[],
  onProgress?: (progress: EnhancementProgress) => void
): Promise<EnhancementResult> {
  const result: EnhancementResult = {
    processed: 0,
    enhanced: 0,
    matched: 0,
    tempoDetected: 0,
    errors: [],
  };

  try {
    const tracks = await db.tracks.bulkGet(trackIds);
    const validTracks = tracks.filter((t): t is TrackRecord => t !== undefined);
    const total = validTracks.length;

    for (const track of validTracks) {
      try {
        if (onProgress) {
          onProgress({
            currentTrack: track,
            processed: result.processed,
            total,
            enhanced: result.enhanced,
            matched: result.matched,
            tempoDetected: result.tempoDetected,
          });
        }

        const enhanced = await enhanceTrackMetadata(track);
        result.processed++;

        if (enhanced) {
          result.enhanced++;
          // Reload track to check if musicbrainzId was set
          const updatedTrack = await db.tracks.get(track.id);
          if (updatedTrack?.musicbrainzId) {
            result.matched++;
          }
          if (enhanced.tempo) {
            result.tempoDetected++;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        result.processed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({
          trackId: track.id,
          error: errorMessage,
        });
      }
    }

    return result;
  } catch (error) {
    logger.error("Failed to enhance selected tracks:", error);
    throw error;
  }
}

/**
 * Detect tempo for tracks missing BPM data
 * 
 * Automatically detects tempo for tracks that don't have BPM in their ID3 tags.
 * Runs in background after scanning completes. Uses Web Workers for non-blocking processing.
 * 
 * @param libraryRootId - Library root ID to detect tempo for
 * @param onProgress - Optional progress callback
 * @param batchSize - Number of tracks to process per batch (default: 5)
 * @param trackFileIds - Optional list of track file IDs to limit detection scope
 * @returns Promise resolving to detection result
 */
export async function detectTempoForLibrary(
  libraryRootId: string,
  onProgress?: (progress: { processed: number; total: number; detected: number; currentTrack?: string }) => void,
  batchSize: number = 5,
  trackFileIds?: string[],
  signal?: AbortSignal
): Promise<{ processed: number; detected: number; errors: Array<{ trackId: string; error: string }> }> {
  const result = {
    processed: 0,
    detected: 0,
    errors: [] as Array<{ trackId: string; error: string }>,
  };

  try {
    if (signal?.aborted) {
      throw new DOMException("Tempo detection aborted", "AbortError");
    }
    // Get tracks without BPM (or with low confidence BPM)
    const allTracks = await db.tracks
      .where("libraryRootId")
      .equals(libraryRootId)
      .toArray();

    const trackFilter = trackFileIds && trackFileIds.length > 0
      ? new Set(trackFileIds)
      : null;
    const scopedTracks = trackFilter
      ? allTracks.filter((track) => trackFilter.has(track.trackFileId))
      : allTracks;
    
    // Filter tracks that need tempo detection:
    // - No BPM in tech.bpm
    // - Or BPM exists but no confidence/source (old data)
    const tracksNeedingDetection = scopedTracks.filter(track => {
      if (!track.tech?.bpm) {
        return true; // No BPM at all
      }
      // Has BPM but missing confidence/source - might want to re-detect
      if (!track.tech.bpmConfidence || !track.tech.bpmSource) {
        return true;
      }
      // Has BPM from ID3 - skip (already reliable)
      if (track.tech.bpmSource === 'id3') {
        return false;
      }
      // Has low confidence detected BPM - might want to re-detect
      if (track.tech.bpmConfidence < 0.5) {
        return true;
      }
      return false;
    });

    const total = tracksNeedingDetection.length;
    logger.info(`Detecting tempo for ${total} tracks missing BPM data`);

    if (trackFilter && scopedTracks.length === 0) {
      return result;
    }

    // Process in batches with bounded concurrency
    for (let i = 0; i < tracksNeedingDetection.length; i += batchSize) {
      if (signal?.aborted) {
        throw new DOMException("Tempo detection aborted", "AbortError");
      }
      const batch = tracksNeedingDetection.slice(i, i + batchSize);
      const hc = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
      const concurrency = Math.min(Math.max(1, hc - 1), 6, batch.length);
      const inFlight = new Set<Promise<void>>();

      const runTask = async (track: TrackRecord) => {
        try {
          if (signal?.aborted) {
            return;
          }
          if (onProgress) {
            onProgress({
              processed: result.processed,
              total,
              detected: result.detected,
              currentTrack: track.tags.title,
            });
          }

          // Detect tempo (will try local file, then iTunes preview)
          const tempoResult = await detectTempoForTrack(track);

          result.processed++;

          if (tempoResult && tempoResult.bpm) {
            result.detected++;
          }
        } catch (error) {
          result.errors.push({
            trackId: track.id,
            error: error instanceof Error ? error.message : String(error),
          });
          result.processed++;
        }
      };

      for (const track of batch) {
        const task = runTask(track);
        inFlight.add(task);
        task.finally(() => inFlight.delete(task));

        if (inFlight.size >= concurrency) {
          await Promise.race(inFlight);
        }
      }

      if (inFlight.size > 0) {
        await Promise.all(inFlight);
      }
      
      // Yield to UI thread between batches
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    logger.info(`Tempo detection complete: ${result.detected}/${result.processed} tracks detected`);
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      logger.info("Tempo detection aborted by user");
      return result;
    }
    logger.error("Failed to detect tempo for library:", error);
    result.errors.push({
      trackId: "unknown",
      error: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
}

/**
 * Detect tempo for a single track
 * 
 * Wrapper function that attempts tempo detection using local file or iTunes preview.
 * 
 * @param track - Track record to detect tempo for
 * @returns Promise resolving to tempo result or null
 */
async function detectTempoForTrack(
  track: TrackRecord
): Promise<{ bpm: number | null; confidence: number; method: string; source: 'local-file' | 'itunes-preview' } | null> {
  type TempoResult = { bpm: number | null; confidence: number; method: string; source: 'local-file' | 'itunes-preview' };
  let tempoResult: TempoResult | null = null;
  
  // Try local file first
  const audioFile = await getFileForTrack(track);
  if (audioFile) {
    try {
      if (!isTempoDecodableFile(audioFile)) {
        logThrottled(
          "debug",
          "tempo-skip-codec",
          `Skipping tempo detection for unsupported codec: ${audioFile.name}`
        );
        return null;
      }
      const result = await detectTempoWithConfidence(audioFile, 'combined');
      if (result.bpm) {
        tempoResult = {
          ...result,
          source: 'local-file',
        };
      }
    } catch (error) {
      recordTempoDecodeFailure(audioFile, error);
      logThrottled(
        "debug",
        "tempo-local-track",
        `Failed to detect tempo from local file for track ${track.trackFileId}:`,
        error
      );
    }
  }
  
  // If local file detection failed or low confidence, try iTunes preview
  if (!tempoResult || !tempoResult.bpm || tempoResult.confidence < 0.5) {
    try {
      const previewResult = await detectTempoFromPreview(track);
      if (previewResult && previewResult.bpm && (!tempoResult || previewResult.confidence > tempoResult.confidence)) {
        tempoResult = previewResult;
      }
    } catch (error) {
      logThrottled(
        "debug",
        "tempo-preview-track",
        `Failed to detect tempo from iTunes preview for track ${track.trackFileId}:`,
        error
      );
    }
  }
  
  // Update track with tempo data if detected
  if (tempoResult && tempoResult.bpm) {
    try {
      const trackId = getCompositeId(track.trackFileId, track.libraryRootId);
      const existing = await db.tracks.get(trackId);
      if (existing) {
        await db.tracks.update(trackId, {
          tech: {
            ...existing.tech,
            bpm: tempoResult.bpm,
            bpmConfidence: tempoResult.confidence,
            bpmSource: tempoResult.source,
            bpmMethod: tempoResult.method as 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined',
          },
        });
      }
    } catch (error) {
      logThrottled(
        "warn",
        "tempo-update-track",
        `Failed to update track with tempo data for ${track.trackFileId}:`,
        error
      );
    }
  }
  
  return tempoResult;
}

