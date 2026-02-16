/**
 * Resize and encode album artwork for iPod ArtworkDB/ITHMB.
 * Classic iPods expect small JPEG thumbnails (e.g. 300–600px); we use 400x400 max.
 */

import type { ExtractedArtwork } from "./artwork-extract";

const IPOD_THUMB_MAX = 400;
const JPEG_QUALITY = 0.85;

/**
 * Resizes extracted artwork to iPod-compatible dimensions and encodes as JPEG.
 * Uses Canvas: decode image from bytes, draw at max 400x400 (fit inside, preserve aspect ratio),
 * then encode as JPEG. Handles image/jpeg, image/png, image/gif.
 *
 * @param picture - Extracted artwork from extractArtworkFromFile
 * @returns JPEG bytes (Uint8Array) or null on failure
 */
export async function resizeToIpodThumbnail(
  picture: ExtractedArtwork
): Promise<Uint8Array | null> {
  if (!picture?.data?.length) return null;

  return new Promise((resolve) => {
    const blob = new Blob([picture.data as BlobPart], { type: picture.format });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.onload = () => {
      try {
        const { width, height } = img;
        if (width <= 0 || height <= 0) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }

        const scale = Math.min(IPOD_THUMB_MAX / width, IPOD_THUMB_MAX / height, 1);
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);
        if (w <= 0 || h <= 0) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);

        canvas.toBlob(
          (jpegBlob) => {
            if (!jpegBlob) {
              resolve(null);
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              const buf = reader.result;
              resolve(buf instanceof ArrayBuffer ? new Uint8Array(buf) : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsArrayBuffer(jpegBlob);
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };

    img.src = url;
  });
}
