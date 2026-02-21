/**
 * Pure TS path conversion: iPod DB path <-> FS path.
 * The iPod iTunesDB location mhod stores paths in a colon-separated "iPod format"
 * (e.g. :iPod_Control:Music:F02:filename.mp3). The filesystem uses forward slashes
 * (e.g. iPod_Control/Music/F02/filename.mp3). See libgpod itdb_path_to_ipod_format
 * and itdb_path_to_fs_format.
 */

/**
 * Normalize path: strip leading slashes, use forward slashes.
 */
function normalize(path: string): string {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

/**
 * Convert relative FS path to iPod DB path format (for location mhod).
 * Produces colon-separated path with leading colon, e.g. :iPod_Control:Music:F02:file.mp3
 */
export function ipodPathToDbFormat(relFsPath: string): string {
  const normalized = normalize(relFsPath);
  if (!normalized) return "";
  return ":" + normalized.replace(/\//g, ":");
}

/**
 * Convert iPod DB path to relative FS path.
 * Accepts either colon-separated (iPod DB) or slash-separated format for robustness.
 */
export function dbPathToFsPath(ipodDbPath: string): string {
  const s = String(ipodDbPath || "").trim();
  if (!s) return "";
  if (s.includes(":")) {
    const withoutLeading = s.replace(/^:+/, "");
    return normalize(withoutLeading.replace(/:/g, "/"));
  }
  return normalize(s);
}
