# Database Schema Documentation

This document provides a comprehensive overview of the IndexedDB schema used by the AI Playlist Generator application. The database uses Dexie.js, a wrapper around IndexedDB that provides a simpler, Promise-based API.

## Table of Contents

- [Overview](#overview)
- [Database Structure](#database-structure)
- [Table Relationships](#table-relationships)
- [Indexes](#indexes)
- [Composite Keys](#composite-keys)
- [Migration System](#migration-system)
- [Storage Quotas](#storage-quotas)
- [Common Queries](#common-queries)
- [Cleanup Operations](#cleanup-operations)

## Overview

The database stores all application data locally in the browser using IndexedDB. This includes:

- **Library Roots**: User-selected music library folders/collections
- **File Index**: Index of audio files found during scanning
- **Tracks**: Parsed metadata for audio files
- **Scan Runs**: History of library scan operations
- **Settings**: Application settings (key-value pairs)
- **Directory Handles**: File System Access API handles (for persistent permissions)
- **Saved Playlists**: Generated playlists saved by the user

### Key Design Decisions

1. **Composite Primary Keys**: Tracks and file index entries use composite keys (`trackFileId-libraryRootId`) to prevent duplicate tracks across different library roots (collections).

2. **Timestamps**: All timestamps are stored as Unix epoch milliseconds for consistency and easy sorting.

3. **File Handles**: File System Access API handles are stored separately to avoid serialization issues.

4. **Chunked Storage**: Large datasets are stored in chunks to avoid quota errors and keep the UI responsive.

## Database Structure

### libraryRoots

Stores user-selected music library folders or collections. Each library root can contain multiple tracks and file index entries.

**Primary Key**: `id` (string)

**Indexes**:
- `createdAt` - For sorting by creation date

**Fields**:
- `id` (string): Unique identifier for the library root
- `mode` (LibraryRootMode): Access mode - "handle" (File System Access API) or "filelist" (fallback)
- `name` (string): Display name for the library root
- `handleRef` (string, optional): Reference to directoryHandles store (only for "handle" mode)
- `createdAt` (number): Timestamp when the library root was created (Unix epoch milliseconds)
- `updatedAt` (number): Timestamp when the library root was last updated (Unix epoch milliseconds)

**Example**:
```typescript
const root: LibraryRootRecord = {
  id: "root-123",
  mode: "handle",
  name: "My Music Collection",
  handleRef: "handle-456",
  createdAt: Date.now(),
  updatedAt: Date.now()
};
```

### fileIndex

Represents scanned audio files before metadata parsing. This is the first step in the library scanning process - files are indexed, then metadata is parsed and stored in TrackRecord.

**Primary Key**: `id` (composite: `${trackFileId}-${libraryRootId}`)

**Indexes**:
- `trackFileId` - For lookups by file ID
- `libraryRootId` - For filtering by library root
- `name` - For searching by filename
- `extension` - For filtering by file type
- `updatedAt` - For sorting by update time

**Fields**:
- `id` (string): Composite primary key: `${trackFileId}-${libraryRootId}`
- `trackFileId` (string): Unique identifier for the file (based on name, size, mtime)
- `libraryRootId` (string): ID of the library root this file belongs to
- `relativePath` (string, optional): Relative path from library root (may be undefined for filelist mode)
- `name` (string): Filename (without path)
- `extension` (string): File extension (lowercase, without dot)
- `size` (number): File size in bytes
- `mtime` (number): Last modified time (Unix epoch milliseconds)
- `updatedAt` (number): Timestamp when this record was last updated (Unix epoch milliseconds)

**Example**:
```typescript
const fileIndex: FileIndexRecord = {
  id: "file123-root456",
  trackFileId: "file123",
  libraryRootId: "root456",
  relativePath: "Music/Album/Track.mp3",
  name: "Track.mp3",
  extension: "mp3",
  size: 5242880,
  mtime: 1640995200000,
  updatedAt: Date.now()
};
```

### tracks

Contains parsed metadata for audio files, including tags (title, artist, album, etc.) and technical information (duration, bitrate, BPM, etc.). This is created after successfully parsing a file's metadata.

**Primary Key**: `id` (composite: `${trackFileId}-${libraryRootId}`)

**Indexes**:
- `trackFileId` - For lookups by file ID
- `libraryRootId` - For filtering by library root
- `updatedAt` - For sorting by update time

**Fields**:
- `id` (string): Composite primary key: `${trackFileId}-${libraryRootId}`
- `trackFileId` (string): Unique identifier for the file (matches FileIndexRecord.trackFileId)
- `libraryRootId` (string): ID of the library root this track belongs to
- `tags` (NormalizedTags): Parsed metadata tags (title, artist, album, genres, etc.)
- `tech` (TechInfo, optional): Technical information (duration, bitrate, BPM, etc.)
- `updatedAt` (number): Timestamp when this record was last updated (Unix epoch milliseconds)

**Example**:
```typescript
const track: TrackRecord = {
  id: "file123-root456",
  trackFileId: "file123",
  libraryRootId: "root456",
  tags: {
    title: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    genres: ["Rock", "Progressive Rock"],
    year: 1975,
    track: 1,
    disc: 1
  },
  tech: {
    duration: 355,
    bitrate: 320,
    bpm: 72
  },
  updatedAt: Date.now()
};
```

### scanRuns

Tracks the history of library scanning operations. Each time a library is scanned, a new ScanRunRecord is created to track progress and results.

**Primary Key**: `id` (string)

**Indexes**:
- `libraryRootId` - For filtering by library root
- `startedAt` - For sorting by start time

**Fields**:
- `id` (string): Unique identifier for the scan run
- `libraryRootId` (string): ID of the library root that was scanned
- `startedAt` (number): Timestamp when the scan started (Unix epoch milliseconds)
- `finishedAt` (number, optional): Timestamp when the scan finished (undefined if scan is in progress)
- `total` (number): Total number of files found during scan
- `added` (number): Number of new files added
- `changed` (number): Number of files that changed (size or mtime)
- `removed` (number): Number of files that were removed
- `parseErrors` (number): Number of files that failed to parse

**Example**:
```typescript
const scanRun: ScanRunRecord = {
  id: "scan-123",
  libraryRootId: "root456",
  startedAt: Date.now(),
  finishedAt: Date.now() + 60000,
  total: 1000,
  added: 50,
  changed: 10,
  removed: 5,
  parseErrors: 2
};
```

### settings

Key-value store for application settings. Used to persist user preferences and application state across sessions.

**Primary Key**: `key` (string)

**Common Keys**:
- `"currentCollectionId"`: ID of the currently selected library root
- `"app-settings"`: Application settings (LLM privacy, etc.)

**Fields**:
- `key` (string): Setting key (unique)
- `value` (any): Setting value (can be any JSON-serializable type)

**Example**:
```typescript
const setting: SettingsRecord = {
  key: "currentCollectionId",
  value: "root-123"
};
```

### directoryHandles

Stores File System Access API directory handles to maintain persistent permissions. When a user grants access to a folder, the handle is stored here so the application can access it in future sessions without re-prompting.

**Primary Key**: `id` (string)

**Fields**:
- `id` (string): Unique identifier for the handle
- `handle` (FileSystemDirectoryHandle): File System Access API directory handle

**Note**: FileSystemDirectoryHandle objects cannot be directly serialized to IndexedDB, so they must be stored in a separate store that Dexie handles specially.

**Example**:
```typescript
const handleRecord: DirectoryHandleRecord = {
  id: "handle-123",
  handle: directoryHandle // FileSystemDirectoryHandle object
};
```

### savedPlaylists

Represents a generated playlist that has been saved by the user. Contains the playlist metadata, track IDs, summary statistics, and optional discovery tracks (new music not in the user's library).

**Primary Key**: `id` (string)

**Indexes**:
- `libraryRootId` - For filtering by library root
- `createdAt` - For sorting by creation date
- `updatedAt` - For sorting by update time

**Fields**:
- `id` (string): Unique identifier for the playlist
- `title` (string): Playlist title
- `description` (string): Playlist description
- `trackFileIds` (string[]): Array of trackFileIds in playlist order
- `summary` (object): Summary statistics for the playlist
  - `genreMix` (Record<string, number> | Map<string, number>): Genre distribution
  - `tempoMix` (Record<string, number> | Map<string, number>): Tempo distribution
  - `artistMix` (Record<string, number> | Map<string, number>): Artist distribution
  - `totalDuration` (number): Total duration in seconds
  - `trackCount` (number, optional): Number of tracks
  - `avgDuration` (number, optional): Average track duration in seconds
  - `minDuration` (number, optional): Minimum track duration in seconds
  - `maxDuration` (number, optional): Maximum track duration in seconds
- `strategy` (any): Playlist generation strategy used (PlaylistStrategy type)
- `libraryRootId` (string, optional): ID of the library root used (optional, may be undefined for discovery playlists)
- `createdAt` (number): Timestamp when the playlist was created (Unix epoch milliseconds)
- `updatedAt` (number): Timestamp when the playlist was last updated (Unix epoch milliseconds)
- `discoveryTracks` (array, optional): Optional discovery tracks (new music not in user's library)

**Example**:
```typescript
const playlist: SavedPlaylistRecord = {
  id: "playlist-123",
  title: "My Awesome Playlist",
  description: "A great mix of rock and indie",
  trackFileIds: ["file1", "file2", "file3"],
  summary: {
    genreMix: { "Rock": 0.6, "Indie": 0.4 },
    tempoMix: { "medium": 0.8, "fast": 0.2 },
    artistMix: { "Artist1": 3, "Artist2": 2 },
    totalDuration: 3600,
    trackCount: 15,
    avgDuration: 240
  },
  strategy: {},
  libraryRootId: "root-456",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  discoveryTracks: []
};
```

## Table Relationships

The database uses foreign key relationships through `libraryRootId` and composite keys:

```
libraryRoots (1) ──< (many) fileIndex
libraryRoots (1) ──< (many) tracks
libraryRoots (1) ──< (many) scanRuns
libraryRoots (1) ──< (many) savedPlaylists

fileIndex (1) ── (1) tracks (via trackFileId + libraryRootId)
```

### Relationship Details

1. **LibraryRoot → FileIndex**: One-to-many. Each library root can have many file index entries.

2. **LibraryRoot → Tracks**: One-to-many. Each library root can have many tracks.

3. **LibraryRoot → ScanRuns**: One-to-many. Each library root can have many scan runs.

4. **LibraryRoot → SavedPlaylists**: One-to-many. Each library root can have many saved playlists (optional relationship).

5. **FileIndex → Tracks**: One-to-one. Each file index entry should have exactly one corresponding track record (after metadata parsing).

## Indexes

Indexes are used to optimize queries and enable efficient filtering and sorting:

### libraryRoots
- **Primary Key**: `id`
- **Index**: `createdAt` - Enables sorting library roots by creation date

### fileIndex
- **Primary Key**: `id` (composite)
- **Indexes**:
  - `trackFileId` - Enables lookups by file ID
  - `libraryRootId` - Enables filtering by library root
  - `name` - Enables searching by filename
  - `extension` - Enables filtering by file type
  - `updatedAt` - Enables sorting by update time

### tracks
- **Primary Key**: `id` (composite)
- **Indexes**:
  - `trackFileId` - Enables lookups by file ID
  - `libraryRootId` - Enables filtering by library root
  - `updatedAt` - Enables sorting by update time

### scanRuns
- **Primary Key**: `id`
- **Indexes**:
  - `libraryRootId` - Enables filtering by library root
  - `startedAt` - Enables sorting by start time

### savedPlaylists
- **Primary Key**: `id`
- **Indexes**:
  - `libraryRootId` - Enables filtering by library root
  - `createdAt` - Enables sorting by creation date
  - `updatedAt` - Enables sorting by update time

## Composite Keys

Composite keys are used for `fileIndex` and `tracks` tables to prevent duplicate tracks across different library roots. The composite key format is:

```
id = `${trackFileId}-${libraryRootId}`
```

### Benefits

1. **Prevents Duplicates**: The same file can exist in multiple library roots without conflicts.

2. **Efficient Queries**: Queries can filter by `libraryRootId` using the index, then match by `trackFileId`.

3. **Data Isolation**: Each library root's data is isolated, making it easy to switch between collections.

### Usage

```typescript
import { getCompositeId } from '@/db/schema';

// Generate composite ID
const id = getCompositeId('file123', 'root456');
// Returns: "file123-root456"

// Use in queries
const track = await db.tracks.get(id);
```

## Migration System

The database uses a versioned migration system to handle schema changes. Migrations are defined in `src/db/schema.ts` and `src/db/migration.ts`.

### Version History

- **Version 1**: Initial schema
- **Version 2**: Migration from old raw IndexedDB schema
- **Version 3**: Composite primary keys (trackFileId-libraryRootId)
- **Version 4**: Added savedPlaylists table
- **Version 5**: Added libraryRootId index to savedPlaylists

### Migration Helper

The `migration-helper.ts` module ensures that incompatible databases are deleted before Dexie attempts to open them, preventing "UpgradeError Not yet support for changing primary key" errors.

**Usage**:
```typescript
import { ensureMigrationComplete } from '@/db/migration-helper';

// Ensure migration completes before accessing database
await ensureMigrationComplete();
```

### Migration Process

1. **Check for Old Database**: The migration helper checks if an incompatible database exists.

2. **Delete if Incompatible**: If the database has incompatible primary keys or schema, it's deleted.

3. **Run Migrations**: Dexie runs the appropriate migrations based on the current version.

4. **Handle Errors**: Migration errors are logged and handled gracefully.

## Storage Quotas

IndexedDB has storage quotas that vary by browser and available disk space. The application handles quota errors gracefully:

### Quota Management

1. **Chunked Storage**: Large datasets are stored in chunks (default: 1000 records) to avoid quota errors.

2. **Quota Checking**: Before large operations, the application checks available quota and warns users if storage is near limit.

3. **Error Handling**: Quota errors are caught and handled with user-friendly messages.

### Quota Utilities

```typescript
import { getStorageQuotaInfo, isQuotaExceededError } from '@/db/storage-errors';

// Check quota before operation
const quotaInfo = await getStorageQuotaInfo();
if (quotaInfo.usagePercent > 85) {
  // Warn user about low storage
}

// Handle quota errors
try {
  await saveLargeDataset(data);
} catch (error) {
  if (isQuotaExceededError(error)) {
    // Show user-friendly error message
  }
}
```

## Common Queries

### Get All Tracks for a Library Root

```typescript
import { db } from '@/db/schema';

const tracks = await db.tracks
  .where('libraryRootId')
  .equals(libraryRootId)
  .toArray();
```

### Get File Index Entry

```typescript
import { db, getCompositeId } from '@/db/schema';

const id = getCompositeId(trackFileId, libraryRootId);
const fileIndex = await db.fileIndex.get(id);
```

### Get Recent Scan Runs

```typescript
import { db } from '@/db/schema';

const scanRuns = await db.scanRuns
  .where('libraryRootId')
  .equals(libraryRootId)
  .sortBy('startedAt');
```

### Search Tracks

```typescript
import { searchTracks } from '@/db/storage-queries';

const results = await searchTracks('beatles', libraryRootId, 100);
```

### Filter Tracks by Genre

```typescript
import { filterTracksByGenre } from '@/db/storage-queries';

const rockTracks = await filterTracksByGenre('Rock', libraryRootId, 500);
```

### Bulk Operations

```typescript
import { db } from '@/db/schema';

// Bulk put (insert or update)
await db.tracks.bulkPut(trackRecords);

// Bulk get (fetch multiple records)
const tracks = await db.tracks.bulkGet(compositeIds);

// Bulk delete
await db.tracks.bulkDelete(compositeIds);
```

## Cleanup Operations

The application provides utilities for cleaning up old or orphaned data:

### Cleanup Old Scan Runs

```typescript
import { cleanupOldScanRuns } from '@/db/storage-cleanup';

// Keep only the 10 most recent scan runs per library
const result = await cleanupOldScanRuns(10);
console.log(`Deleted ${result.deleted} old scan runs`);
```

### Cleanup Orphaned File Index

```typescript
import { cleanupOrphanedFileIndex } from '@/db/storage-cleanup';

// Remove file index entries without matching tracks
const result = await cleanupOrphanedFileIndex(libraryRootId);
console.log(`Removed ${result.deleted} orphaned entries`);
```

### Cleanup Library Root Data

```typescript
import { cleanupLibraryRootData } from '@/db/storage-cleanup';

// Delete all data for a library root
const result = await cleanupLibraryRootData(libraryRootId);
console.log(`Deleted ${result.deleted.tracks} tracks`);
```

### Comprehensive Cleanup

```typescript
import { performCleanup } from '@/db/storage-cleanup';

const result = await performCleanup({
  keepRecentScanRuns: 10,
  cleanupOrphaned: true
});
```

## Best Practices

1. **Always Use Composite Keys**: When working with tracks or file index entries, always use `getCompositeId()` to generate composite keys.

2. **Filter by libraryRootId**: When querying tracks or file index entries, always filter by `libraryRootId` to ensure data isolation.

3. **Use Bulk Operations**: For multiple records, use `bulkPut()`, `bulkGet()`, and `bulkDelete()` instead of individual operations.

4. **Handle Quota Errors**: Always wrap storage operations in try-catch blocks and handle quota errors gracefully.

5. **Clean Up Regularly**: Periodically clean up old scan runs and orphaned entries to free up storage space.

6. **Use Chunked Storage**: For large datasets (>1000 records), use chunked storage functions to avoid quota errors.

## Troubleshooting

### Database Migration Errors

If you encounter migration errors:

1. Check the browser console for specific error messages.
2. The migration helper should automatically delete incompatible databases.
3. If issues persist, manually clear IndexedDB in browser settings.

### Quota Exceeded Errors

If you encounter quota errors:

1. Check available storage using `getStorageQuotaInfo()`.
2. Clean up old data using cleanup utilities.
3. Consider reducing chunk size for large operations.

### Performance Issues

If queries are slow:

1. Ensure indexes are being used (check query patterns).
2. Use bulk operations instead of individual queries.
3. Limit result sets using `.limit()` or result limits in query functions.

## Additional Resources

- [Dexie.js Documentation](https://dexie.org/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)

