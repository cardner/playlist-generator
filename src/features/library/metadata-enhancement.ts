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
import { detectTempo } from "./audio-analysis";
import { updateTrackMetadata } from "@/db/storage-tracks";
import { getFileIndexEntries } from "@/db/storage";
import { getLibraryRoot } from "@/db/storage-library-root";
import { db, getCompositeId } from "@/db/schema";
import { logger } from "@/lib/logger";

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
    logger.debug(`Failed to get file for track ${track.trackFileId}:`, error);
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

    // 2. Detect tempo from audio file
    let audioFile: File | null = null;
    if (file) {
      audioFile = file;
    } else {
      // Try to load file using File System Access API
      audioFile = await getFileForTrack(track);
      if (!audioFile) {
        logger.debug(`Cannot detect tempo: file handle not available for ${track.trackFileId}`);
      }
    }

    if (audioFile) {
      try {
        const tempo = await detectTempo(audioFile);
        if (tempo) {
          enhanced.tempo = tempo;
          hasEnhancements = true;
        }
      } catch (error) {
        logger.warn(`Failed to detect tempo for track ${track.trackFileId}:`, error);
      }
    }

    if (!hasEnhancements) {
      return null;
    }

    // 3. Update track in database
    await updateTrackMetadata(track.id, enhanced, false); // false = not manual edit
    
    // Also update metadataEnhancementDate and musicbrainzId
    await db.tracks.update(track.id, {
      metadataEnhancementDate: Date.now(),
      ...(musicbrainzId && { musicbrainzId }),
    });

    return enhanced;
  } catch (error) {
    logger.error(`Failed to enhance track ${track.id}:`, error);
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
          logger.error(`Failed to enhance track ${track.id}:`, error);
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

