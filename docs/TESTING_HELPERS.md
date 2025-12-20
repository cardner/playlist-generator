# Testing Helpers for Network Drive Reliability

This document provides helper scripts and utilities for testing the network drive reliability and resume functionality.

## Browser Console Helpers

Copy and paste these into your browser console (DevTools → Console) for quick testing.

### Check Database Version

```javascript
// Check current database version
(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('ai-playlist-generator');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  console.log('Database version:', db.version);
  console.log('Object stores:', Array.from(db.objectStoreNames));
  db.close();
})();
```

### View All Checkpoints

```javascript
// View all checkpoints in database
(async () => {
  const { db } = await import('/src/db/schema.ts');
  await db.open();
  const checkpoints = await db.scanCheckpoints.toArray();
  console.table(checkpoints);
  console.log(`Total checkpoints: ${checkpoints.length}`);
})();
```

### View Interrupted Scans for Current Library

```javascript
// Get interrupted scans for a library root
(async () => {
  const { getAllLibraryRoots } = await import('/src/db/storage.ts');
  const { getInterruptedScans } = await import('/src/db/storage-scan-checkpoints.ts');
  
  const roots = await getAllLibraryRoots();
  console.log('Library roots:', roots);
  
  if (roots.length > 0) {
    const rootId = roots[0].id; // Use first root, or specify your root ID
    const interrupted = await getInterruptedScans(rootId);
    console.log(`Interrupted scans for ${rootId}:`, interrupted);
    console.table(interrupted);
  }
})();
```

### View Scan Runs

```javascript
// View all scan runs
(async () => {
  const { getAllLibraryRoots } = await import('/src/db/storage.ts');
  const { getScanRuns } = await import('/src/db/storage.ts');
  
  const roots = await getAllLibraryRoots();
  for (const root of roots) {
    const runs = await getScanRuns(root.id);
    console.log(`Scan runs for ${root.name} (${root.id}):`, runs);
    console.table(runs);
  }
})();
```

### Check Database Tables

```javascript
// Check all tables and their record counts
(async () => {
  const { db } = await import('/src/db/schema.ts');
  await db.open();
  
  const tables = {
    libraryRoots: await db.libraryRoots.count(),
    fileIndex: await db.fileIndex.count(),
    tracks: await db.tracks.count(),
    scanRuns: await db.scanRuns.count(),
    savedPlaylists: await db.savedPlaylists.count(),
    scanCheckpoints: db.scanCheckpoints ? await db.scanCheckpoints.count() : 'N/A (table not available)',
  };
  
  console.table(tables);
  console.log('Database version:', db.verno);
})();
```

### Simulate Network Disconnection

```javascript
// This is for testing - you'll need to actually disconnect the network drive
// But you can monitor the console for disconnection detection

// Watch for disconnection warnings
const originalWarn = console.warn;
console.warn = function(...args) {
  if (args[0]?.includes?.('Network drive') || args[0]?.includes?.('consecutive failures')) {
    console.log('🔴 DISCONNECTION DETECTED:', ...args);
  }
  originalWarn.apply(console, args);
};
```

### Monitor Checkpoint Creation

```javascript
// Monitor checkpoint saves during scanning
(async () => {
  const { db } = await import('/src/db/schema.ts');
  await db.open();
  
  let lastCheckpointCount = 0;
  const monitor = setInterval(async () => {
    if (db.scanCheckpoints) {
      const count = await db.scanCheckpoints.count();
      if (count > lastCheckpointCount) {
        console.log(`✅ New checkpoint saved! Total: ${count}`);
        const latest = await db.scanCheckpoints.orderBy('checkpointAt').last();
        console.log('Latest checkpoint:', latest);
        lastCheckpointCount = count;
      }
    }
  }, 1000);
  
  console.log('Monitoring checkpoints... (stop with clearInterval(monitor))');
  // To stop: clearInterval(monitor);
})();
```

### Clear All Checkpoints (Testing Only)

```javascript
// WARNING: This deletes all checkpoints - use for testing only!
(async () => {
  const { db } = await import('/src/db/schema.ts');
  await db.open();
  
  if (db.scanCheckpoints) {
    const count = await db.scanCheckpoints.count();
    await db.scanCheckpoints.clear();
    console.log(`Deleted ${count} checkpoints`);
  } else {
    console.log('scanCheckpoints table not available');
  }
})();
```

### Verify Checkpoint Data Structure

```javascript
// Verify a checkpoint has correct structure
(async () => {
  const { db } = await import('/src/db/schema.ts');
  await db.open();
  
  if (db.scanCheckpoints) {
    const checkpoint = await db.scanCheckpoints.orderBy('checkpointAt').last();
    if (checkpoint) {
      console.log('Latest checkpoint structure:');
      console.log({
        id: checkpoint.id,
        scanRunId: checkpoint.scanRunId,
        libraryRootId: checkpoint.libraryRootId,
        scannedFileIds: checkpoint.scannedFileIds?.length || 0,
        lastScannedPath: checkpoint.lastScannedPath,
        lastScannedIndex: checkpoint.lastScannedIndex,
        totalFound: checkpoint.totalFound,
        checkpointAt: new Date(checkpoint.checkpointAt).toLocaleString(),
        interrupted: checkpoint.interrupted,
      });
    } else {
      console.log('No checkpoints found');
    }
  }
})();
```

### Test Resume Functionality

```javascript
// Test resuming from a checkpoint
(async () => {
  const { getAllLibraryRoots } = await import('/src/db/storage.ts');
  const { getInterruptedScans } = await import('/src/db/storage-scan-checkpoints.ts');
  
  const roots = await getAllLibraryRoots();
  if (roots.length === 0) {
    console.log('No library roots found');
    return;
  }
  
  const rootId = roots[0].id;
  const interrupted = await getInterruptedScans(rootId);
  
  if (interrupted.length === 0) {
    console.log('No interrupted scans found');
    return;
  }
  
  const mostRecent = interrupted[interrupted.length - 1];
  console.log('Most recent interrupted scan:', mostRecent);
  console.log('To resume, use scanRunId:', mostRecent.scanRunId);
  console.log('Scanned files:', mostRecent.scannedFileIds.length);
  console.log('Last scanned path:', mostRecent.lastScannedPath);
})();
```

## Testing Scenarios

### Scenario 1: Test Checkpoint Creation

1. Start scanning a library with 100+ files
2. Open console and run checkpoint monitor script
3. Verify checkpoints are created every ~50 files
4. Check checkpoint data structure

### Scenario 2: Test Resume

1. Start scanning
2. Let it scan ~75 files
3. Stop the scan (close browser or disconnect)
4. Restart and verify "Resume Previous Scan" appears
5. Click resume and verify files are skipped

### Scenario 3: Test Network Disconnection

1. Start scanning a network drive
2. Disconnect the network drive
3. Monitor console for disconnection detection
4. Verify checkpoint is saved with `interrupted: true`
5. Verify reconnection monitoring starts

### Scenario 4: Test Auto-Resume

1. Trigger disconnection (Scenario 3)
2. Reconnect the network drive
3. Monitor console for reconnection detection
4. Verify scan automatically resumes
5. Verify files are skipped correctly

## Debugging Tips

### Check if Database is Upgraded

```javascript
// Quick check
(async () => {
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('ai-playlist-generator');
    req.onsuccess = () => resolve(req.result);
  });
  console.log('Version:', db.version, db.version === 6 ? '✅' : '❌');
  console.log('Has scanCheckpoints:', db.objectStoreNames.contains('scanCheckpoints') ? '✅' : '❌');
  db.close();
})();
```

### Check Reconnection Monitor Status

The reconnection monitor status is managed in the React component state. Check the browser console for:
- "Starting reconnection monitoring..."
- "Network drive reconnected!"
- "Reconnection monitoring stopped"

### Verify Checkpoint Cleanup

```javascript
// Check if checkpoints are cleaned up after scan completion
(async () => {
  const { db } = await import('/src/db/schema.ts');
  await db.open();
  
  if (db.scanCheckpoints) {
    const count = await db.scanCheckpoints.count();
    const interrupted = await db.scanCheckpoints.where('interrupted').equals(true).count();
    const inProgress = await db.scanCheckpoints.where('interrupted').equals(false).count();
    
    console.log({
      total: count,
      interrupted,
      inProgress,
    });
  }
})();
```

## Common Issues

### Issue: Checkpoints not being created

**Debug Steps**:
1. Verify database is version 6
2. Check console for errors
3. Verify scan is actually running
4. Check if 50+ files are being scanned

### Issue: Resume not working

**Debug Steps**:
1. Verify checkpoint exists in database
2. Check checkpoint data structure
3. Verify directory handle is still valid
4. Check console for errors during resume

### Issue: Database not upgrading

**Debug Steps**:
1. Clear browser cache
2. Check migration helper logs
3. Verify version 6 is defined in schema
4. Try clearing IndexedDB and starting fresh

## Performance Monitoring

### Monitor Scan Performance

```javascript
// Monitor scan progress and checkpoint saves
let lastProgress = { found: 0, scanned: 0 };
const monitor = setInterval(() => {
  // This would need to be integrated into the scan progress callback
  // For now, check database directly
}, 1000);
```

### Check Checkpoint Size

```javascript
// Estimate checkpoint size
(async () => {
  const { db } = await import('/src/db/schema.ts');
  await db.open();
  
  if (db.scanCheckpoints) {
    const checkpoint = await db.scanCheckpoints.orderBy('checkpointAt').last();
    if (checkpoint) {
      const size = JSON.stringify(checkpoint).length;
      console.log(`Checkpoint size: ${size} bytes (${(size / 1024).toFixed(2)} KB)`);
      console.log(`Scanned files: ${checkpoint.scannedFileIds.length}`);
    }
  }
})();
```

