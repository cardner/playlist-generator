# Library Management Documentation

This document provides a comprehensive guide to how the AI Playlist Generator manages music libraries, including scanning, metadata extraction, storage, permissions, and relinking.

## Table of Contents

- [Overview](#overview)
- [Library Selection](#library-selection)
- [Scanning Flow](#scanning-flow)
- [Metadata Extraction](#metadata-extraction)
- [Storage Structure](#storage-structure)
- [Permissions](#permissions)
- [Relinking](#relinking)
- [Collections](#collections)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The library management system allows users to:

1. **Select** a music library folder (or multiple folders as collections)
2. **Scan** the folder to discover audio files
3. **Extract** metadata from audio files
4. **Store** metadata and file information in IndexedDB
5. **Relink** libraries if folders are moved
6. **Manage** multiple collections

The system supports two access modes:
- **File System Access API** (Chromium browsers): Persistent permissions, direct folder access
- **File Input Fallback** (other browsers): File list selection, no persistent permissions

## Library Selection

### File System Access API (Preferred)

The File System Access API provides persistent permissions and direct folder access:

```typescript
import { pickLibraryRoot } from '@/lib/library-selection';

// User selects a folder
const root = await pickLibraryRoot();
// Returns: { mode: 'handle', name: 'My Music', handleId: '...' }
```

**Benefits**:
- Persistent permissions (no re-prompting)
- Direct folder access for rescanning
- Relative path tracking
- Better performance for large libraries

**Limitations**:
- Only available in Chromium-based browsers (Chrome, Edge, Opera)
- Requires user interaction to grant permission

### File Input Fallback

For browsers without File System Access API support:

```typescript
// Uses standard file input with webkitdirectory
const root = await pickLibraryRoot();
// Returns: { mode: 'filelist', name: 'My Music', handleId: '...' }
```

**Limitations**:
- No persistent permissions (must re-select on each session)
- No relative path information
- File list must be re-selected for rescanning

## Scanning Flow

The library scanning process follows these steps:

### 1. User Selects Library Root

```typescript
// User clicks "Select Library Folder"
const root = await pickLibraryRoot();
await saveLibraryRoot(root, handleRef);
```

### 2. Build File Index

The system scans the selected folder recursively to find all audio files:

```typescript
import { buildFileIndex } from '@/features/library/scanning';

const fileIndex = await buildFileIndex(root, (progress) => {
  console.log(`Found ${progress.found} files, scanned ${progress.scanned}`);
});
```

**Process**:
1. Recursively traverse directory structure
2. Filter files by supported extensions (mp3, flac, m4a, etc.)
3. Generate `trackFileId` from filename, size, and mtime
4. Create `FileIndexEntry` for each file
5. Save to `fileIndex` table in IndexedDB

**Supported Formats**:
- MP3, FLAC, M4A, AAC, ALAC, OGG, WAV, AIFF, WMA

### 3. Incremental Scanning

On subsequent scans, the system performs incremental updates:

```typescript
// Compare new scan with existing file index
const diff = compareFileIndexes(oldIndex, newIndex);
// Returns: { added: [...], changed: [...], removed: [...] }
```

**Matching Strategy**:
- Primary: `relativePath + size + mtime`
- Fallback: `size + mtime` (for files without relative paths)

### 4. Save File Index

File index entries are saved to IndexedDB:

```typescript
import { saveFileIndexEntries } from '@/db/storage-file-index';

await saveFileIndexEntries(fileIndexEntries, libraryRootId, (progress) => {
  console.log(`Saved ${progress.processed} of ${progress.total}`);
});
```

**Storage**:
- Uses composite keys: `${trackFileId}-${libraryRootId}`
- Chunked storage for large libraries (>1000 files)
- Progress callbacks for UI updates

## Metadata Extraction

After scanning, metadata is extracted from audio files:

### 1. Parse Metadata

```typescript
import { parseMetadataForFiles } from '@/features/library/metadata';

const results = await parseMetadataForFiles(files, (progress) => {
  console.log(`Parsed ${progress.processed} of ${progress.total}`);
});
```

**Process**:
1. Read audio file headers
2. Extract ID3 tags (MP3) or other metadata formats
3. Normalize tags (title, artist, album, genres, year)
4. Extract technical info (duration, bitrate, codec)
5. Handle missing or malformed metadata gracefully

### 2. Normalization

All metadata is normalized for consistency:

```typescript
import { normalizeTitle, normalizeArtist, normalizeGenres } from '@/features/library/metadata';

const title = normalizeTitle(metadata.title, filename);
const artist = normalizeArtist(metadata.artist);
const genres = normalizeGenres(metadata.genre);
```

**Normalization Rules**:
- **Title**: Falls back to filename (without extension) if missing
- **Artist**: Returns "Unknown Artist" if missing
- **Album**: Returns "Unknown Album" if missing
- **Genres**: Deduplicated, trimmed, case-insensitive
- **Year**: Validated (1900-2100 range)

### 3. Genre Normalization

Genres are normalized to canonical forms:

```typescript
import { normalizeGenre } from '@/features/library/genre-normalization';

const normalized = normalizeGenre("progressive rock");
// Returns: "Progressive Rock"
```

**Normalization Steps**:
1. Split comma-separated genres
2. Normalize special characters (dashes, ampersands, slashes)
3. Apply capitalization rules (with special cases like "R&B", "EDM")
4. Map to canonical forms (e.g., "RnB" → "R&B")
5. Preserve original genres for display

### 4. Batched Processing

Large libraries are processed in batches to avoid browser timeouts:

```typescript
import { parseMetadataBatched } from '@/features/library/metadata-batched';

const results = await parseMetadataBatched(files, {
  batchSize: 500,
  saveAfterEachBatch: true,
  onProgress: (progress) => {
    console.log(`Batch ${progress.batchNumber}/${progress.totalBatches}`);
  }
});
```

**Benefits**:
- Prevents browser freezing
- Yields to UI thread periodically
- Handles quota errors gracefully
- Supports progress tracking

### 5. Save Track Metadata

Parsed metadata is saved to IndexedDB:

```typescript
import { saveTrackMetadata } from '@/db/storage-tracks';

await saveTrackMetadata(results, libraryRootId, (progress) => {
  console.log(`Saved ${progress.processed} of ${progress.total} tracks`);
});
```

**Storage**:
- Uses composite keys: `${trackFileId}-${libraryRootId}`
- Filters out tracks with errors
- Chunked storage for large datasets
- Updates `updatedAt` timestamp

## Storage Structure

The library data is stored in IndexedDB with the following structure:

### File Index (`fileIndex` table)

Stores scanned file information before metadata parsing:

```typescript
interface FileIndexRecord {
  id: string; // Composite: `${trackFileId}-${libraryRootId}`
  trackFileId: string;
  libraryRootId: string;
  relativePath?: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
  updatedAt: number;
}
```

### Tracks (`tracks` table)

Stores parsed metadata:

```typescript
interface TrackRecord {
  id: string; // Composite: `${trackFileId}-${libraryRootId}`
  trackFileId: string;
  libraryRootId: string;
  tags: NormalizedTags;
  tech?: TechInfo;
  updatedAt: number;
}
```

### Library Roots (`libraryRoots` table)

Stores library root information:

```typescript
interface LibraryRootRecord {
  id: string;
  mode: 'handle' | 'filelist';
  name: string;
  handleRef?: string;
  createdAt: number;
  updatedAt: number;
}
```

### Scan Runs (`scanRuns` table)

Tracks scan history:

```typescript
interface ScanRunRecord {
  id: string;
  libraryRootId: string;
  startedAt: number;
  finishedAt?: number;
  total: number;
  added: number;
  changed: number;
  removed: number;
  parseErrors: number;
}
```

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema documentation.

## Permissions

### File System Access API Permissions

When using the File System Access API, permissions are stored persistently:

```typescript
import { storeDirectoryHandle, getDirectoryHandle } from '@/lib/library-selection';

// Store handle for future use
await storeDirectoryHandle(handleId, directoryHandle);

// Retrieve handle (no re-prompting needed)
const handle = await getDirectoryHandle(handleId);
```

**Permission Lifecycle**:
1. User grants permission when selecting folder
2. Handle is stored in `directoryHandles` table
3. Handle reference is saved in `libraryRoots.handleRef`
4. On subsequent sessions, handle is retrieved automatically
5. If handle becomes invalid, user must re-select folder

### Permission Checking

```typescript
import { checkPermission } from '@/lib/library-selection-permissions';

const status = await checkPermission(directoryHandle);
// Returns: 'granted' | 'prompt' | 'denied'
```

### Fallback Mode

In file input fallback mode:
- No persistent permissions
- User must re-select files on each session
- No relative path information available
- Rescanning requires re-selecting files

## Relinking

If a library folder is moved or renamed, the relinking feature can match existing tracks to the new location:

### Relinking Process

```typescript
import { relinkLibraryRoot } from '@/features/library/relink';

const result = await relinkLibraryRoot(oldRootId, (progress) => {
  console.log(`Matched ${progress.matched} of ${progress.scanned}`);
});
```

**Matching Strategy**:
1. **Primary Match**: `relativePath + size + mtime`
   - Most reliable for files with relative paths
   - Works when folder structure is preserved

2. **Fallback Match**: `size + mtime`
   - Used when relative paths don't match
   - Less reliable (may match wrong files if duplicates exist)

3. **New Root Creation**:
   - Creates new library root record
   - Updates all matched tracks/file index entries
   - Preserves metadata and relationships

### Relinking Limitations

- **Requires File System Access API**: Relinking only works in Chromium browsers
- **Path Matching**: Best results when folder structure is preserved
- **No Relative Paths**: Files without relative paths use fallback matching (less reliable)
- **Unmatched Files**: Files that can't be matched are treated as new files

### When to Relink

Relink when:
- Library folder is moved to a new location
- Library folder is renamed
- Library folder structure is reorganized (but files remain the same)

Don't relink when:
- Files themselves have changed (use rescan instead)
- Switching to a completely different library
- Files have been deleted or modified

## Collections

The application supports multiple library roots (collections):

### Creating Collections

```typescript
import { saveLibraryRoot, setCurrentCollectionId } from '@/db/storage';

// Create a new collection
const root = await pickLibraryRoot();
const record = await saveLibraryRoot(root, handleRef);
await setCurrentCollectionId(record.id);
```

### Switching Collections

```typescript
import { getCurrentCollectionId, setCurrentCollectionId } from '@/db/storage';

const currentId = await getCurrentCollectionId();
await setCurrentCollectionId(newCollectionId);
```

### Collection Isolation

Each collection is isolated:
- Tracks are stored with `libraryRootId` to prevent conflicts
- Composite keys ensure no duplicates across collections
- Queries filter by `libraryRootId` automatically
- Playlists can be associated with specific collections

## Best Practices

### 1. Initial Scan

- **Be Patient**: Large libraries (10k+ files) can take several minutes
- **Don't Close Browser**: Scanning runs in the main thread
- **Check Progress**: Monitor progress indicators
- **Handle Errors**: Some files may fail to parse (check scan run results)

### 2. Rescanning

- **Incremental Updates**: Only changed files are reprocessed
- **File Changes**: Modified files (size or mtime changed) are re-parsed
- **New Files**: Newly added files are discovered automatically
- **Removed Files**: Deleted files are detected and removed from index

### 3. Storage Management

- **Monitor Quota**: Check storage usage periodically
- **Clean Up**: Remove old scan runs and orphaned entries
- **Large Libraries**: Consider splitting into multiple collections

### 4. Performance

- **Batch Size**: Default batch size (500-1000) balances speed and memory
- **Chunked Storage**: Large datasets are automatically chunked
- **Progress Updates**: Use progress callbacks for UI feedback

### 5. Error Handling

- **Parse Errors**: Some files may fail to parse (corrupted files, unsupported formats)
- **Quota Errors**: Handle storage quota exceeded errors gracefully
- **Permission Errors**: Handle permission denied errors
- **Network Errors**: Handle network errors for remote files (if applicable)

## Troubleshooting

### Scan Not Finding Files

**Symptoms**: Scan completes but finds 0 files

**Solutions**:
1. Check file extensions are supported (mp3, flac, m4a, etc.)
2. Verify folder contains audio files
3. Check browser console for errors
4. Try selecting a different folder

### Metadata Not Extracting

**Symptoms**: Files are scanned but metadata is missing

**Solutions**:
1. Check if files have embedded metadata tags
2. Verify file format is supported
3. Check scan run results for parse errors
4. Some files may not have metadata (this is normal)

### Permission Errors

**Symptoms**: "Permission denied" errors when accessing folder

**Solutions**:
1. Re-select the folder to grant permission again
2. Check browser settings for file access permissions
3. Try a different folder location
4. Use file input fallback if File System Access API isn't available

### Relinking Fails

**Symptoms**: Relinking matches 0 files

**Solutions**:
1. Verify folder structure hasn't changed significantly
2. Check that files haven't been modified (size/mtime changed)
3. Ensure File System Access API is available (Chromium browsers)
4. Try rescanning instead of relinking

### Storage Quota Exceeded

**Symptoms**: "Quota exceeded" errors when saving

**Solutions**:
1. Clean up old scan runs: `cleanupOldScanRuns(10)`
2. Remove orphaned file index entries: `cleanupOrphanedFileIndex()`
3. Delete unused collections
4. Clear browser storage (last resort - will lose all data)

### Slow Performance

**Symptoms**: Scanning or metadata parsing is very slow

**Solutions**:
1. Reduce batch size for metadata parsing
2. Check browser performance (close other tabs)
3. Split large libraries into multiple collections
4. Use chunked storage (automatic for large datasets)

## Additional Resources

- [Database Schema Documentation](./DATABASE_SCHEMA.md) - Complete IndexedDB schema reference
- [Library Feature Modules](../src/features/library/) - Source code for library management
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) - Browser API documentation

