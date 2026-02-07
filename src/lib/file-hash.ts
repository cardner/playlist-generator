/**
 * Content hashing for file matching.
 * Used by library scan and device sync for path resolution.
 */

import { logger } from "@/lib/logger";

/**
 * Compute SHA-256 hash of file content (first maxBytes).
 * Used for device path matching when filename|size fails.
 *
 * @param file File to hash
 * @param maxBytes Maximum bytes to read (default 256KB)
 * @returns Hex string or undefined if hashing fails
 */
export async function hashFileContent(
  file: File,
  maxBytes = 256 * 1024
): Promise<string | undefined> {
  if (!("crypto" in globalThis) || !globalThis.crypto?.subtle) {
    return undefined;
  }
  try {
    const slice = file.slice(0, Math.min(file.size, maxBytes));
    const buffer = await slice.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    logger.warn("Failed to compute content hash", error);
    return undefined;
  }
}
