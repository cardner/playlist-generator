# Large Library Storage Management Plan

## Overview

This document outlines strategies for handling very large music libraries (10k-100k+ tracks) while managing browser storage limits and maintaining performance.

## Storage Limits

### Browser Storage Quotas

- **IndexedDB**: Typically 50% of available disk space, but can be as low as:
  - Chrome: ~60% of disk space (can be several GB)
  - Firefox: ~50% of disk space
  - Safari: ~1GB (more restrictive)
- **Practical Limits**: 
  - Small libraries (<5k tracks): No issues
  - Medium libraries (5k-20k tracks): May need optimization
  - Large libraries (20k-50k tracks): Requires chunking and cleanup
  - Very large libraries (50k+ tracks): May need selective storage

### Estimated Storage Per Track

- **File Index Entry**: ~200-300 bytes (path, name, size, mtime)
- **Track Metadata**: ~500-1000 bytes (tags, tech info)
- **Total per track**: ~700-1300 bytes
- **10k tracks**: ~7-13 MB
- **50k tracks**: ~35-65 MB
- **100k tracks**: ~70-130 MB

## Current Implementation

### ✅ Implemented

1. **Chunked Storage Operations**
   - `saveFileIndexEntriesChunked()` - Processes 1000 entries at a time
   - `saveTrackMetadataChunked()` - Processes 1000 tracks at a time
   - Yields to UI thread periodically to prevent freezing

2. **Quota Error Handling**
   - `withQuotaErrorHandling()` - Wraps operations with quota error detection
   - `getStorageQuotaInfo()` - Monitors storage usage
   - `checkQuotaBeforeOperation()` - Prevents operations that would exceed quota

3. **Storage Cleanup Utilities**
   - `cleanupOldScanRuns()` - Removes old scan history
   - `cleanupOrphanedFileIndex()` - Removes entries without tracks
   - `cleanupLibraryRootData()` - Cleans up when switching libraries

4. **Automatic Chunking**
   - Storage functions automatically use chunking for >1000 records
   - Progress callbacks for UI feedback

### 🔄 To Be Implemented

1. **Progressive Loading**
   - Load tracks on-demand (pagination)
   - Lazy-load metadata for playlist generation
   - Virtual scrolling in library browser

2. **Selective Storage**
   - Option to store only essential metadata
   - Skip storing tech info for very large libraries
   - Store only tracks that match user preferences

3. **Storage Monitoring UI**
   - Display storage usage in settings
   - Warn users when approaching limits
   - Provide cleanup recommendations

4. **Compression**
   - Compress metadata before storage
   - Use more efficient data structures
   - Remove redundant information

## Mitigation Strategies

### Strategy 1: Chunked Operations (✅ Implemented)

**When to use**: All bulk operations
**How it works**: Process records in batches of 1000
**Benefits**: 
- Prevents quota errors
- Keeps UI responsive
- Allows progress tracking

**Usage**:
```typescript
await saveFileIndexEntriesChunked(entries, 1000, (progress) => {
  console.log(`Processed ${progress.processed}/${progress.total}`);
});
```

### Strategy 2: Storage Cleanup (✅ Implemented)

**When to use**: Periodically or when storage is full
**How it works**: Remove old/unused data
**Benefits**:
- Frees up space
- Maintains performance
- Keeps database lean

**Usage**:
```typescript
// Cleanup old scan runs (keep last 10)
await cleanupOldScanRuns(10);

// Remove orphaned entries
await cleanupOrphanedFileIndex();

// Full cleanup
await performCleanup({
  keepRecentScanRuns: 10,
  cleanupOrphaned: true,
});
```

### Strategy 3: Quota Monitoring (✅ Implemented)

**When to use**: Before large operations
**How it works**: Check available quota before storing
**Benefits**:
- Prevents quota errors
- Provides user warnings
- Allows proactive cleanup

**Usage**:
```typescript
const { allowed, warning, quotaInfo } = await checkQuotaForLargeOperation(
  recordCount,
  avgRecordSizeBytes
);

if (!allowed) {
  // Show warning to user
  // Suggest cleanup
}
```

### Strategy 4: Progressive Loading (🔄 To Implement)

**When to use**: Library browser, playlist generation
**How it works**: Load tracks in pages, not all at once
**Benefits**:
- Reduces memory usage
- Faster initial load
- Better performance

**Implementation Plan**:
1. Add pagination to `getAllTracks()`
2. Implement virtual scrolling in `LibraryBrowser`
3. Load matching index on-demand for playlist generation

### Strategy 5: Selective Storage (🔄 To Implement)

**When to use**: Very large libraries (>50k tracks)
**How it works**: Store only essential data
**Benefits**:
- Reduces storage by 30-50%
- Faster operations
- Still functional

**Options**:
- Skip tech info (duration, bitrate, etc.) - can be recalculated
- Store only tracks matching user preferences
- Compress metadata fields

### Strategy 6: Data Compression (🔄 To Implement)

**When to use**: All storage operations
**How it works**: Compress metadata before storing
**Benefits**:
- Reduces storage by 40-60%
- More tracks fit in quota
- Transparent to application

**Implementation**:
- Use compression library (pako, fflate)
- Compress/decompress on read/write
- Cache compressed data

## Error Handling

### Quota Exceeded Error

**Detection**:
```typescript
import { isQuotaExceededError, withQuotaErrorHandling } from "@/db/storage-errors";

try {
  await withQuotaErrorHandling(() => saveData(), "saving tracks");
} catch (error) {
  if (isQuotaExceededError(error)) {
    // Show user-friendly error
    // Suggest cleanup options
  }
}
```

**User-Facing Error**:
- Clear message: "Storage limit reached"
- Actionable suggestions:
  - Clean up old scan history
  - Remove unused library data
  - Reduce library size
- Link to storage management UI

### Storage Monitoring

**Check Storage Before Operations**:
```typescript
import { checkQuotaForLargeOperation } from "@/db/storage-chunking";

const { allowed, warning } = await checkQuotaForLargeOperation(
  trackCount,
  500 // bytes per track
);

if (warning) {
  // Show warning banner
}
```

## UI Components Needed

### 1. Storage Usage Display

**Location**: Settings page or library page
**Shows**:
- Current storage usage
- Available quota
- Usage percentage
- Breakdown by data type

### 2. Cleanup Recommendations

**Triggers**: When storage >80% full
**Shows**:
- Number of old scan runs
- Orphaned entries count
- Estimated space to free
- One-click cleanup button

### 3. Large Library Warning

**Triggers**: When scanning >20k tracks
**Shows**:
- Estimated storage needed
- Current available space
- Options to proceed or optimize

## Performance Optimizations

### 1. IndexedDB Indexes

**Current**: Basic indexes on `libraryRootId`, `trackFileId`
**Optimize**: Add compound indexes for common queries
- `(libraryRootId, updatedAt)` for recent tracks
- `(libraryRootId, genre)` for genre filtering

### 2. Batch Operations

**Current**: Bulk operations for writes
**Optimize**: Batch reads where possible
- Load tracks in batches
- Cache frequently accessed data

### 3. Lazy Loading

**Current**: Load all tracks for playlist generation
**Optimize**: 
- Load only matching tracks
- Build matching index incrementally
- Cache strategy results

## Testing Strategy

### 1. Large Library Simulation

- Create test fixtures with 10k, 50k, 100k tracks
- Test storage operations
- Measure performance
- Verify quota handling

### 2. Quota Testing

- Simulate quota exceeded errors
- Test error handling
- Verify cleanup works
- Test chunked operations

### 3. Performance Testing

- Measure operation times
- Track memory usage
- Monitor UI responsiveness
- Identify bottlenecks

## Migration Path

### Phase 1: Error Handling (✅ Complete)

- Add quota error detection
- Implement chunked storage
- Add cleanup utilities

### Phase 2: Monitoring (Next)

- Add storage usage UI
- Implement warnings
- Add cleanup recommendations

### Phase 3: Optimization (Future)

- Implement progressive loading
- Add selective storage options
- Implement compression

### Phase 4: Advanced Features (Future)

- Multi-library support with quotas per library
- Cloud backup option
- Export/import for library migration

## Recommendations

### For Users with Large Libraries (>20k tracks)

1. **Enable automatic cleanup**: Clean old scan runs regularly
2. **Monitor storage**: Check usage periodically
3. **Consider selective storage**: Store only essential metadata
4. **Use progressive loading**: Enable pagination in library browser

### For Developers

1. **Always use chunked operations**: For any bulk operation >1000 records
2. **Monitor quota**: Check before large operations
3. **Provide user feedback**: Show progress and warnings
4. **Test with large datasets**: Verify behavior with 50k+ tracks

## Monitoring and Alerts

### Storage Thresholds

- **<50%**: Normal operation
- **50-80%**: Show usage indicator
- **80-90%**: Show warning banner
- **90-95%**: Show critical warning + cleanup prompt
- **>95%**: Block new operations, require cleanup

### Metrics to Track

- Storage usage over time
- Operation success/failure rates
- Cleanup frequency
- Average library size
- Quota error frequency

## Conclusion

The current implementation provides a solid foundation for handling large libraries:

1. ✅ Chunked operations prevent quota errors
2. ✅ Error handling provides user feedback
3. ✅ Cleanup utilities free up space
4. ✅ Quota monitoring prevents issues

Future enhancements will focus on:
- Progressive loading for better performance
- Selective storage for very large libraries
- Compression for maximum efficiency
- Better UI for storage management

