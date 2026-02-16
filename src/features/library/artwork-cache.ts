/**
 * Persist album artwork thumbnails from metadata parse results into the artwork cache.
 * Used so the Device Sync UI and iPod sync can show/reuse art without re-extracting.
 */

import type { MetadataResult } from "./metadata";
import { db, getCompositeId } from "@/db/schema";
import { resizeToIpodThumbnail } from "@/features/devices/ipod/artwork-resize";
import { logger } from "@/lib/logger";

/**
 * For each parse result that has embedded picture data, resize to thumbnail and put in artworkCache.
 * Failures for a single track (e.g. resize error) are logged and skipped; track metadata save is not blocked.
 */
export async function saveArtworkCacheFromResults(
  results: MetadataResult[],
  libraryRootId: string
): Promise<void> {
  for (const result of results) {
    if (result.error || !result.picture?.data) continue;

    const id = getCompositeId(result.trackFileId, libraryRootId);
    try {
      const picture = {
        format: result.picture.format,
        data: new Uint8Array(result.picture.data),
      };
      const jpegBytes = await resizeToIpodThumbnail(picture);
      if (!jpegBytes?.length) continue;

      const thumbnail = new Blob([jpegBytes as BlobPart], { type: "image/jpeg" });
      await db.artworkCache.put({ id, thumbnail });
    } catch (err) {
      logger.debug(`Artwork cache skip for ${result.trackFileId}:`, err);
    }
  }
}
