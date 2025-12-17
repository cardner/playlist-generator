/**
 * Library scanning and indexing feature
 * 
 * This module handles:
 * - Scanning user-selected folders/files
 * - Building file indexes
 * - Incremental diff detection
 * - Indexing tracks in IndexedDB
 */

export interface ScanState {
  status: "idle" | "scanning" | "completed" | "error";
  progress: number; // 0-100
  totalFiles: number;
  scannedFiles: number;
  error?: string;
}

// Re-export scanning functions
export {
  scanLibrary,
  scanLibraryFromFileList,
  buildFileIndex,
  buildFileIndexFromFileList,
  diffFileIndex,
  generateTrackFileId,
  isSupportedExtension,
  SUPPORTED_EXTENSIONS,
  type FileIndexEntry,
  type FileIndex,
  type FileIndexDiff,
  type ScanResult,
  type ScanProgressCallback,
} from "./scanning";

// Re-export metadata functions
export {
  parseMetadataForFiles,
  type MetadataProgressCallback,
} from "./metadata-parser";

export {
  type NormalizedTags,
  type TechInfo,
  type MetadataResult,
} from "./metadata";

