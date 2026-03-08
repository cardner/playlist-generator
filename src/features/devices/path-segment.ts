/**
 * Path segment sanitization for File System Access API (getDirectoryHandle / getFileHandle).
 * Shared by USB device sync and iPod sync to avoid "Name is not allowed" errors.
 */

/** Windows reserved names that are not allowed as file/directory names (case-insensitive). */
const WINDOWS_RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/**
 * Sanitize a single path segment for use with getDirectoryHandle/getFileHandle.
 * Replaces invalid characters, trims, and maps empty or Windows reserved names to fallback.
 */
export function sanitizePathSegment(segment: string, fallback = "_"): string {
  const sanitized = segment.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
  if (!sanitized) return fallback;
  if (WINDOWS_RESERVED_NAMES.has(sanitized.toLowerCase())) return fallback;
  return sanitized;
}
