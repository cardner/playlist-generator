/**
 * Extract embedded album artwork from audio files for iPod sync.
 * Used on-demand during sync; does not persist to DB.
 */

import { parseBlob, selectCover } from "music-metadata";

export interface ExtractedArtwork {
  /** MIME type (e.g. image/jpeg, image/png) */
  format: string;
  /** Raw image bytes */
  data: Uint8Array;
}

/**
 * Extracts the first cover (front) or first available picture from an audio file.
 * Prefer the original file when the track is transcoded (e.g. FLAC→ALAC) so embedded art is read from source.
 *
 * @param file - Audio file (File or Blob)
 * @returns Extracted picture with format and data, or null if none
 */
export async function extractArtworkFromFile(file: File | Blob): Promise<ExtractedArtwork | null> {
  try {
    const metadata = await parseBlob(file);
    const pictures = metadata.common.picture;
    if (!pictures?.length) return null;

    const cover = selectCover(pictures) ?? pictures[0];
    if (!cover?.data?.length) return null;

    return {
      format: cover.format ?? "image/jpeg",
      data: cover.data,
    };
  } catch {
    return null;
  }
}
