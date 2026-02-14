/**
 * Human-readable, filesystem-safe playlist filename helpers.
 */

const DEFAULT_MAX_FILENAME_STEM_LENGTH = 80;

export function formatPlaylistFilenameStem(
  title: string,
  maxLength = DEFAULT_MAX_FILENAME_STEM_LENGTH
): string {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return "Playlist";
  }

  const normalized = trimmedTitle
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " - ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .trim();

  const baseName = normalized || "Playlist";
  if (baseName.length <= maxLength) {
    return baseName;
  }

  return baseName.slice(0, maxLength).replace(/[.\s-]+$/g, "").trim() || "Playlist";
}
