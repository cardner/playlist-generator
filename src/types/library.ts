/**
 * Library-Related Types
 * 
 * This module defines all TypeScript types and interfaces used for library
 * management, including file selection, scanning, metadata parsing, and
 * library root configuration.
 * 
 * @module types/library
 */

/**
 * Library root selection mode
 * 
 * - "handle": Uses File System Access API (Chromium-based browsers)
 * - "fallback": Uses file input with webkitdirectory (other browsers)
 * 
 * @example
 * ```typescript
 * const mode: LibraryRootMode = "handle";
 * ```
 */
export type LibraryRootMode = "handle" | "fallback";

/**
 * Library root configuration
 * 
 * Represents a user-selected music library folder or collection. The mode
 * determines how files are accessed (File System Access API vs file input).
 * 
 * @example
 * ```typescript
 * const root: LibraryRoot = {
 *   mode: "handle",
 *   name: "My Music Collection",
 *   handleId: "handle-123"
 * };
 * ```
 */
export interface LibraryRoot {
  /** Access mode: "handle" (File System Access API) or "fallback" (file input) */
  mode: LibraryRootMode;
  /** Display name for the library root */
  name: string;
  /** ID to retrieve handle from IndexedDB (only for "handle" mode) */
  handleId?: string;
  /** Timestamp of last import (only for "fallback" mode) */
  lastImportedAt?: number;
}

/**
 * Library file representation
 * 
 * Represents a single audio file within a library root, including the File
 * object and metadata needed for processing.
 * 
 * @example
 * ```typescript
 * const libraryFile: LibraryFile = {
 *   file: fileObject,
 *   trackFileId: "file123",
 *   relativePath: "Music/Album/Track.mp3",
 *   extension: "mp3",
 *   size: 5242880,
 *   mtime: 1640995200000
 * };
 * ```
 */
export interface LibraryFile {
  /** The File object representing the audio file */
  file: File;
  /** Unique identifier for the file (based on name, size, mtime) */
  trackFileId: string;
  /** Relative path from library root (only for "handle" mode) */
  relativePath?: string;
  /** File extension (lowercase, without dot) */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified time (Unix epoch milliseconds) */
  mtime: number;
}

/**
 * Permission status for File System Access API
 * 
 * - "granted": Permission has been granted
 * - "denied": Permission has been denied
 * - "prompt": Permission status is unknown, user will be prompted
 * 
 * @example
 * ```typescript
 * const status: PermissionStatus = "granted";
 * ```
 */
export type PermissionStatus = "granted" | "denied" | "prompt";

/**
 * Supported audio file extensions
 * 
 * List of file extensions that the application can process. Used to filter
 * files during library scanning.
 * 
 * @example
 * ```typescript
 * const ext: SupportedExtension = "mp3";
 * if (SUPPORTED_EXTENSIONS.includes(ext)) {
 *   // Process file
 * }
 * ```
 */
export const SUPPORTED_EXTENSIONS = [
  "mp3",
  "flac",
  "m4a",
  "aac",
  "alac",
  "ogg",
  "wav",
  "aiff",
  "wma",
] as const;

/**
 * Type representing a supported audio file extension
 */
export type SupportedExtension = typeof SUPPORTED_EXTENSIONS[number];

/**
 * File index entry representing a scanned audio file
 * 
 * This is created during the scanning phase, before metadata parsing.
 * It contains basic file information needed to identify and track files.
 * 
 * @example
 * ```typescript
 * const entry: FileIndexEntry = {
 *   trackFileId: "file123",
 *   relativePath: "Music/Album/Track.mp3",
 *   name: "Track.mp3",
 *   extension: "mp3",
 *   size: 5242880,
 *   mtime: 1640995200000
 * };
 * ```
 */
export interface FileIndexEntry {
  /** Unique identifier for the file */
  trackFileId: string;
  /** Relative path from library root (optional, may be undefined for filelist mode) */
  relativePath?: string;
  /** Filename (without path) */
  name: string;
  /** File extension (lowercase, without dot) */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified time (Unix epoch milliseconds) */
  mtime: number;
}

/**
 * File index as a map of trackFileId -> FileIndexEntry
 * 
 * Used during scanning to efficiently look up files by their unique identifier.
 * 
 * @example
 * ```typescript
 * const index: FileIndex = new Map();
 * index.set("file123", entry);
 * const entry = index.get("file123");
 * ```
 */
export type FileIndex = Map<string, FileIndexEntry>;

/**
 * Diff result showing changes between two file indexes
 * 
 * Used for incremental scanning to detect which files were added, changed,
 * or removed since the last scan.
 * 
 * @example
 * ```typescript
 * const diff: FileIndexDiff = {
 *   added: [newEntry1, newEntry2],
 *   changed: [changedEntry1],
 *   removed: [removedEntry1]
 * };
 * ```
 */
export interface FileIndexDiff {
  /** Files that were added since last scan */
  added: FileIndexEntry[];
  /** Files that changed (size or mtime different) */
  changed: FileIndexEntry[];
  /** Files that were removed since last scan */
  removed: FileIndexEntry[];
}

/**
 * Normalized metadata tags
 * 
 * Contains cleaned and normalized metadata extracted from audio files.
 * All fields are normalized to ensure consistency across different file formats.
 * 
 * @example
 * ```typescript
 * const tags: NormalizedTags = {
 *   title: "Example Song",
 *   artist: "Example Artist",
 *   album: "Example Album",
 *   genres: ["Rock", "Indie"],
 *   year: 2023,
 *   trackNo: 1,
 *   discNo: 1
 * };
 * ```
 */
export interface NormalizedTags {
  /** Track title (normalized, fallback to filename if missing) */
  title: string;
  /** Artist name (normalized, fallback to "Unknown Artist" if missing) */
  artist: string;
  /** Album name (normalized, fallback to "Unknown Album" if missing) */
  album: string;
  /** Array of genre names (normalized and deduplicated) */
  genres: string[];
  /** Release year (optional) */
  year?: number;
  /** Track number within album (optional) */
  trackNo?: number;
  /** Disc number within album (optional) */
  discNo?: number;
}

/**
 * Technical information about the audio file
 * 
 * Contains technical metadata extracted from the audio file, such as
 * duration, bitrate, sample rate, and codec information.
 * 
 * @example
 * ```typescript
 * const tech: TechInfo = {
 *   durationSeconds: 240,
 *   codec: "MP3",
 *   container: "MP3",
 *   bitrate: 320,
 *   sampleRate: 44100,
 *   channels: 2,
 *   bpm: 120
 * };
 * ```
 */
export interface TechInfo {
  /** Duration in seconds (optional, may be missing for some files) */
  durationSeconds?: number;
  /** Audio codec (e.g., "MP3", "AAC", "FLAC") */
  codec?: string;
  /** Container format (e.g., "MP3", "MP4", "OGG") */
  container?: string;
  /** Bitrate in kbps */
  bitrate?: number;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Number of audio channels (1 = mono, 2 = stereo, etc.) */
  channels?: number;
  /** Beats per minute (tempo) - may be detected via LLM if not in metadata */
  bpm?: number;
}

/**
 * Metadata parsing result
 * 
 * Result of parsing metadata from an audio file. Contains normalized tags
 * and technical info if successful, or an error message if parsing failed.
 * 
 * @example
 * ```typescript
 * const result: MetadataResult = {
 *   trackFileId: "file123",
 *   tags: { title: "Song", artist: "Artist", album: "Album", genres: [] },
 *   tech: { durationSeconds: 240 },
 *   warnings: ["No genre tag found"]
 * };
 * ```
 */
export interface MetadataResult {
  /** Unique identifier for the file */
  trackFileId: string;
  /** Normalized metadata tags (optional, missing if parsing failed) */
  tags?: NormalizedTags;
  /** Technical information (optional, may be missing for some files) */
  tech?: TechInfo;
  /** Array of warning messages (optional) */
  warnings?: string[];
  /** Error message if parsing failed (optional) */
  error?: string;
}

/**
 * Scan progress callback
 * 
 * Function called during library scanning to report progress updates.
 * 
 * @param progress - Progress information
 * @param progress.found - Total files found so far
 * @param progress.scanned - Files scanned so far
 * @param progress.currentFile - Currently processing file name (optional)
 * 
 * @example
 * ```typescript
 * const onProgress: ScanProgressCallback = (progress) => {
 *   console.log(`Scanned ${progress.scanned} of ${progress.found} files`);
 * };
 * ```
 */
export type ScanProgressCallback = (progress: {
  found: number;
  scanned: number;
  currentFile?: string;
}) => void;

/**
 * Metadata parsing progress callback
 * 
 * Function called during metadata parsing to report progress updates.
 * 
 * @param progress - Progress information
 * @param progress.parsed - Files parsed so far
 * @param progress.total - Total files to parse
 * @param progress.errors - Number of errors encountered
 * @param progress.currentFile - Currently processing file name (optional)
 * 
 * @example
 * ```typescript
 * const onProgress: MetadataProgressCallback = (progress) => {
 *   console.log(`Parsed ${progress.parsed} of ${progress.total} files`);
 * };
 * ```
 */
export type MetadataProgressCallback = (progress: {
  parsed: number;
  total: number;
  errors: number;
  currentFile?: string;
}) => void;

/**
 * Scan result from library scanning operation
 * 
 * Contains the file index and diff information after scanning a library root.
 * 
 * @example
 * ```typescript
 * const result: ScanResult = {
 *   index: fileIndex,
 *   diff: { added: [], changed: [], removed: [] },
 *   totalFiles: 1000,
 *   scannedFiles: 1000
 * };
 * ```
 */
export interface ScanResult {
  /** Complete file index after scanning */
  index: FileIndex;
  /** Diff showing changes since last scan */
  diff: FileIndexDiff;
  /** Total number of files found */
  totalFiles: number;
  /** Number of files successfully scanned */
  scannedFiles: number;
}

/**
 * Scan state for UI components
 * 
 * Used by React components to track the current state of a library scan operation.
 * 
 * @example
 * ```typescript
 * const scanState: ScanState = {
 *   status: "scanning",
 *   progress: 50,
 *   totalFiles: 1000,
 *   scannedFiles: 500,
 *   error: undefined
 * };
 * ```
 */
export interface ScanState {
  /** Current scan status */
  status: "idle" | "scanning" | "completed" | "error";
  /** Progress percentage (0-100) */
  progress: number;
  /** Total number of files found */
  totalFiles: number;
  /** Number of files scanned so far */
  scannedFiles: number;
  /** Error message if scan failed (optional) */
  error?: string;
}

/**
 * Utility type: Extract all keys from LibraryRoot that are optional
 */
export type OptionalLibraryRootKeys = {
  [K in keyof LibraryRoot]-?: {} extends Pick<LibraryRoot, K> ? K : never;
}[keyof LibraryRoot];

/**
 * Utility type: Extract all keys from LibraryRoot that are required
 */
export type RequiredLibraryRootKeys = {
  [K in keyof LibraryRoot]-?: {} extends Pick<LibraryRoot, K> ? never : K;
}[keyof LibraryRoot];

/**
 * Partial library root (all fields optional)
 * 
 * Useful for updates and partial configurations.
 */
export type PartialLibraryRoot = Partial<LibraryRoot>;

/**
 * Helper function to check if a file extension is supported
 * 
 * @param extension - File extension to check (lowercase, without dot)
 * @returns True if the extension is supported
 * 
 * @example
 * ```typescript
 * if (isSupportedExtension("mp3")) {
 *   // Process file
 * }
 * ```
 */
export function isSupportedExtension(extension: string): extension is SupportedExtension {
  return SUPPORTED_EXTENSIONS.includes(extension as SupportedExtension);
}

/**
 * Helper function to check if a library root is valid
 * 
 * @param root - The library root to validate
 * @returns True if the library root has all required fields with valid values
 * 
 * @example
 * ```typescript
 * if (isValidLibraryRoot(root)) {
 *   await scanLibrary(root);
 * }
 * ```
 */
export function isValidLibraryRoot(root: Partial<LibraryRoot>): root is LibraryRoot {
  return (
    root.mode !== undefined &&
    (root.mode === "handle" || root.mode === "fallback") &&
    typeof root.name === "string" &&
    root.name.length > 0
  );
}

