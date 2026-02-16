/**
 * Playlist generation feature
 * 
 * This module will handle:
 * - Rule-based playlist generation
 * - LLM-assisted playlist creation (when enabled)
 * - Playlist editing and management
 */

export { generatePlaylistFromStrategy, generateReplacementTracksFromStrategy } from "./generation";
export type {
  GeneratedPlaylist,
  TrackSelection,
  TrackReason,
  PlaylistSummary,
} from "./generation";
export { getStrategy, fallbackStrategy } from "./strategy";
export type { PlaylistStrategy } from "./strategy";
export { generatePlaylist } from "./matching-engine";
export { orderTracks } from "./ordering";
export type { OrderedTracks, OrderedTrack } from "./ordering";
export {
  exportM3U,
  exportPLS,
  exportXSPF,
  exportCSV,
  exportJSON,
  downloadFile,
} from "./export";
export type { TrackLookup, ExportResult } from "./export";
export { generateVariant, getVariantDescription } from "./variants";
export type { VariantType, VariantRequest } from "./variants";
export { generatePlaylistTitle } from "./naming";
export { buildRemixRequest, remixSavedPlaylist } from "./remix";

