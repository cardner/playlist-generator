/**
 * Metadata extraction worker
 * 
 * Parses audio file metadata in a background thread
 */

import { parseBlob, selectCover } from "music-metadata";
import type {
  MetadataWorkerRequest,
  MetadataWorkerResponse,
  NormalizedTags,
  TechInfo,
} from "@/features/library/metadata";
import {
  normalizeTitle,
  normalizeArtist,
  normalizeAlbum,
  normalizeGenres,
  normalizeYear,
  normalizeTrackNo,
  normalizeDiscNo,
  normalizeIsrc,
  normalizeAcoustId,
  extractAcoustId,
  extractCodecInfo,
} from "@/features/library/metadata";

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<MetadataWorkerRequest>) => {
  const { trackFileId, file } = event.data;

  try {
    // Parse metadata using music-metadata
    const metadata = await parseBlob(file);

    const warnings: string[] = [];

    // Normalize tags
    const tags: NormalizedTags = {
      title: normalizeTitle(metadata.common.title, file.name),
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

    let picture: { format: string; data: ArrayBuffer } | undefined;
    const pictures = metadata.common.picture;
    if (pictures?.length) {
      const cover = selectCover(pictures) ?? pictures[0];
      if (cover?.data?.length) {
        const data = cover.data;
        const buffer =
          data.byteLength === data.buffer.byteLength
            ? data.buffer
            : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        picture = { format: cover.format ?? "image/jpeg", data: buffer as ArrayBuffer };
      }
    }

    const response: MetadataWorkerResponse = {
      trackFileId,
      tags,
      tech,
      isrc: normalizeIsrc(metadata.common.isrc),
      acoustidId: normalizeAcoustId(extractAcoustId(metadata)),
      picture,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    self.postMessage(response, picture ? { transfer: [picture.data] } : undefined);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error parsing metadata";

    const response: MetadataWorkerResponse = {
      trackFileId,
      error: errorMessage,
    };

    self.postMessage(response);
  }
};

