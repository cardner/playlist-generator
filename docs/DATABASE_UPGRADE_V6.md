# Database Version 6 Upgrade Documentation

## Overview

Version 6 adds the `scanCheckpoints` table to enable checkpoint-based scanning for network drives. This upgrade is **fully backwards compatible** - existing databases will automatically upgrade without data loss.

## What Changed

### New Table: `scanCheckpoints`

- **Purpose**: Stores scan progress checkpoints to enable resuming interrupted scans
- **Primary Key**: `id` (same as `scanRunId`)
- **Indexes**: 
  - `id` (primary key)
  - `scanRunId` (for lookups by scan run)
  - `libraryRootId` (for finding interrupted scans for a library)
  - `checkpointAt` (for sorting by checkpoint time)

### Schema Definition

```typescript
interface ScanCheckpointRecord {
  id: string;                    // Same as scanRunId
  scanRunId: string;
  libraryRootId: string;
  scannedFileIds: string[];      // Array of trackFileIds already scanned
  lastScannedPath?: string;      // Last file path scanned
  lastScannedIndex: number;       // Position in scan order (0-indexed)
  totalFound: number;             // Total files found so far
  checkpointAt: number;           // Timestamp (Unix epoch milliseconds)
  interrupted: boolean;           // Whether scan was interrupted
}
```

## Backwards Compatibility

### ✅ Safe Upgrade

The version 6 upgrade is **100% backwards compatible**:

1. **No existing tables modified**: All existing tables (`libraryRoots`, `fileIndex`, `tracks`, `scanRuns`, `settings`, `directoryHandles`, `savedPlaylists`) remain unchanged
2. **No data migration needed**: We're only adding a new table, not modifying existing data
3. **No index changes**: All existing indexes remain the same
4. **Automatic upgrade**: Dexie automatically upgrades databases from version 5 to version 6 when opened

### Upgrade Process

When a database at version 5 (or earlier) is opened:

1. Dexie detects the version mismatch
2. Automatically runs the upgrade to version 6
3. Creates the new `scanCheckpoints` table
4. All existing data remains intact
5. The upgrade completes seamlessly

### Migration Helper

The migration helper (`src/db/migration.ts`) has been updated to:
- Check compatibility with version 6 schema
- Only delete databases with incompatible schemas (version 3 or earlier)
- Preserve all version 5 databases for automatic upgrade

## Testing Checklist

### ✅ Code Verification (Completed)

- [x] Version 6 upgrade defined in `AppDatabase` constructor
- [x] `scanCheckpoints` table property added to `AppDatabase` class
- [x] Migration helper updated to include version 6 schema
- [x] All checkpoint storage functions handle missing table gracefully
- [x] Build compiles successfully

### Manual Testing Required

- [ ] Test database upgrade from v5 to v6 with existing data
- [ ] Verify all existing data remains intact after upgrade
- [ ] Verify `scanCheckpoints` table is accessible after upgrade
- [ ] Test that app works correctly with v5 database (before upgrade)
- [ ] Test that app works correctly with v6 database (after upgrade)
- [ ] Verify migration helper detects v6 compatibility correctly
- [ ] Test with fresh database (no existing data)
- [ ] Test with database containing existing scan runs and checkpoints

## Usage

### Creating a Checkpoint

```typescript
import { saveCheckpoint } from '@/db/storage-scan-checkpoints';

await saveCheckpoint(
  scanRunId,
  libraryRootId,
  scannedFileIds,
  lastScannedPath,
  lastScannedIndex,
  totalFound,
  interrupted
);
```

### Loading a Checkpoint

```typescript
import { loadCheckpoint } from '@/db/storage-scan-checkpoints';

const checkpoint = await loadCheckpoint(scanRunId);
if (checkpoint) {
  // Resume scan from checkpoint
}
```

### Finding Interrupted Scans

```typescript
import { getInterruptedScans } from '@/db/storage-scan-checkpoints';

const interrupted = await getInterruptedScans(libraryRootId);
if (interrupted.length > 0) {
  // Show "Resume Previous Scan" option
}
```

## Error Handling

All checkpoint storage functions handle cases where the table doesn't exist yet:

- Functions check if `db.scanCheckpoints` exists before accessing it
- Return empty results or null if table doesn't exist
- Log debug messages (not warnings) for missing table
- Ensure database is opened before accessing tables

This ensures the app works correctly even if the database hasn't upgraded yet.

## Cleanup Functions

### Cleanup Old Checkpoints

```typescript
import { cleanupOldCheckpoints } from '@/db/storage-scan-checkpoints';

// Delete checkpoints older than 30 days (default)
const deleted = await cleanupOldCheckpoints();

// Delete checkpoints older than 7 days
const deleted = await cleanupOldCheckpoints(7);
```

### Delete Checkpoints for Library

```typescript
import { deleteCheckpointsForLibrary } from '@/db/storage-scan-checkpoints';

// Delete all checkpoints for a library root
const deleted = await deleteCheckpointsForLibrary(libraryRootId);
```

**Note**: This is automatically called when a collection is deleted via `deleteCollection()`.

## Related Files

- `src/db/schema.ts` - Database schema definition (version 6 upgrade)
- `src/db/storage-scan-checkpoints.ts` - Checkpoint storage operations
- `src/db/migration.ts` - Migration helper (updated for v6)
- `src/features/library/scanning-persist.ts` - Scanning with checkpoint support
- `src/features/library/scanning.ts` - Core scanning logic with checkpoint support

