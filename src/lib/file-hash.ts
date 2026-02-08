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
 * Compute SHA-256 hash of file content using chunked approach.
 * 
 * Note: Web Crypto API doesn't support true streaming digests, so we must
 * read the entire content into memory before hashing. However, reading in
 * chunks is still beneficial because:
 * - It yields to the event loop between chunks, keeping UI responsive
 * - It's more GC-friendly (smaller allocations)
 * - It allows progress tracking for large files
 * 
 * For files exceeding MAX_FULL_HASH_BYTES, we skip hashing entirely.
 * 
 * @param file File to hash
 * @param maxBytes Maximum bytes to hash
 * @returns Hex string or undefined if hashing fails
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
    const combined = new Uint8Array(bytesToHash);
    let offset = 0;

    // Read file in chunks, yielding to event loop between reads
    while (offset < bytesToHash) {
      const chunkSize = Math.min(HASH_CHUNK_SIZE, bytesToHash - offset);
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      const chunk = new Uint8Array(buffer);
      
      // Copy chunk into combined buffer
      combined.set(chunk, offset);
      offset += chunkSize;
      
      // Yield to event loop to keep UI responsive
      if (offset < bytesToHash) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const digest = await globalThis.crypto.subtle.digest("SHA-256", combined);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    logger.warn("Failed to compute content hash", error);
    return undefined;
  }
}

/**
 * Compute SHA-256 hash of entire file content.
 * Falls back to undefined if file exceeds MAX_FULL_HASH_BYTES.
 * Uses chunked reading to keep UI responsive while still loading full content for hashing.
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
