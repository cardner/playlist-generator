/**
 * Content hashing for file matching.
 * Used by library scan and device sync for path resolution.
 */

import { logger } from "@/lib/logger";

// Lower cap to prevent memory spikes during scans
// 10MB is a reasonable limit - most audio files are under this size
const MAX_FULL_HASH_BYTES = 10 * 1024 * 1024;

// Chunk size for streaming hash (1MB chunks to keep memory usage low)
const HASH_CHUNK_SIZE = 1024 * 1024;

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

/**
 * Compute SHA-256 hash of file content using streaming/chunked approach.
 * This prevents loading entire file into memory at once.
 * 
 * @param file File to hash
 * @param maxBytes Maximum bytes to hash (default: MAX_FULL_HASH_BYTES)
 * @returns Hex string or undefined if hashing fails or file too large
 */
async function hashFileContentStreaming(
  file: File,
  maxBytes: number
): Promise<string | undefined> {
  if (!("crypto" in globalThis) || !globalThis.crypto?.subtle) {
    return undefined;
  }

  try {
    const bytesToHash = Math.min(file.size, maxBytes);
    const chunks: Uint8Array[] = [];
    let offset = 0;

    // Read file in chunks to avoid loading entire file into memory
    while (offset < bytesToHash) {
      const chunkSize = Math.min(HASH_CHUNK_SIZE, bytesToHash - offset);
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      chunks.push(new Uint8Array(buffer));
      offset += chunkSize;
    }

    // Concatenate all chunks for hashing
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
      combined.set(chunk, position);
      position += chunk.length;
    }

    const digest = await globalThis.crypto.subtle.digest("SHA-256", combined);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    logger.warn("Failed to compute streaming content hash", error);
    return undefined;
  }
}

/**
 * Compute SHA-256 hash of entire file content.
 * Falls back to undefined if file exceeds MAX_FULL_HASH_BYTES.
 * Uses streaming approach to prevent loading entire file into memory.
 */
export async function hashFullFileContent(
  file: File
): Promise<string | undefined> {
  if (file.size > MAX_FULL_HASH_BYTES) {
    logger.warn("Skipping full hash for large file", {
      name: file.name,
      size: file.size,
    });
    return undefined;
  }
  return hashFileContentStreaming(file, file.size);
}
