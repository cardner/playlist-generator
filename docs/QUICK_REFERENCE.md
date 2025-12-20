# Network Drive Reliability - Quick Reference

Quick reference guide for testing and using the network drive reliability features.

## Quick Verification

### Check Database Version
```javascript
// Browser Console
const db = await new Promise(r => {
  const req = indexedDB.open('ai-playlist-generator');
  req.onsuccess = () => r(req.result);
});
console.log('Version:', db.version); // Should be 6
console.log('Has scanCheckpoints:', db.objectStoreNames.contains('scanCheckpoints'));
db.close();
```

### View Checkpoints
```javascript
// Browser Console
const { db } = await import('/src/db/schema.ts');
await db.open();
const checkpoints = await db.scanCheckpoints.toArray();
console.table(checkpoints);
```

## Key Features

### ✅ Automatic Checkpoint Saving
- Checkpoints saved every 50 files during scanning
- Automatic on scan completion
- Automatic on disconnection

### ✅ Automatic Resume
- Detects network drive reconnection
- Automatically resumes scan
- Skips already-scanned files

### ✅ Manual Resume
- Banner appears if interrupted scan exists
- "Resume Previous Scan" button available
- Works after page refresh

### ✅ Error Handling
- Graceful handling of network disconnections
- Clear error messages
- Partial results preserved

## Testing Quick Start

1. **Verify Database Upgrade**
   - Refresh page
   - Check DevTools → Application → IndexedDB
   - Verify version is 6 and `scanCheckpoints` table exists

2. **Test Checkpoint Creation**
   - Start scanning library with 100+ files
   - Monitor console or database for checkpoint creation
   - Verify checkpoint saved every ~50 files

3. **Test Resume**
   - Start scan, let it scan ~75 files
   - Stop scan (close browser or disconnect)
   - Restart and verify "Resume Previous Scan" appears
   - Click resume and verify files are skipped

4. **Test Disconnection Detection**
   - Scan network drive
   - Disconnect network drive
   - Verify disconnection detected after 3+ failures
   - Verify checkpoint saved with `interrupted: true`

5. **Test Auto-Resume**
   - Trigger disconnection
   - Reconnect network drive
   - Verify auto-resume triggers
   - Verify scan continues correctly

## File Locations

### Core Implementation
- `src/db/schema.ts` - Database schema (version 6)
- `src/db/storage-scan-checkpoints.ts` - Checkpoint storage
- `src/features/library/scanning-persist.ts` - Scanning with checkpoints
- `src/features/library/scanning.ts` - Core scanning logic
- `src/lib/library-selection-fs-api.ts` - Disconnection detection
- `src/features/library/reconnection-monitor.ts` - Reconnection monitoring
- `src/hooks/useLibraryScanning.ts` - Hook with resume support
- `src/components/InterruptedScanBanner.tsx` - UI banner
- `src/components/LibraryScanner.tsx` - Scanner with banner integration

### Documentation
- `docs/DATABASE_UPGRADE_V6.md` - Database upgrade details
- `docs/TESTING_NETWORK_DRIVE_RELIABILITY.md` - Comprehensive testing guide
- `docs/TESTING_HELPERS.md` - Browser console helpers
- `docs/NETWORK_DRIVE_IMPLEMENTATION_SUMMARY.md` - Implementation overview
- `docs/IMPLEMENTATION_CHECKLIST.md` - Verification checklist

## Common Commands

### Check Database State
```javascript
const { db } = await import('/src/db/schema.ts');
await db.open();
console.log('Version:', db.verno);
console.log('Checkpoints:', await db.scanCheckpoints.count());
```

### Find Interrupted Scans
```javascript
const { getAllLibraryRoots } = await import('/src/db/storage.ts');
const { getInterruptedScans } = await import('/src/db/storage-scan-checkpoints.ts');
const roots = await getAllLibraryRoots();
const interrupted = await getInterruptedScans(roots[0].id);
console.log(interrupted);
```

### Clear Checkpoints (Testing)
```javascript
const { db } = await import('/src/db/schema.ts');
await db.open();
await db.scanCheckpoints.clear();
```

## Troubleshooting

### Issue: Checkpoints not being created
- Verify database is version 6
- Check console for errors
- Verify scan is running (100+ files needed for multiple checkpoints)

### Issue: Resume not working
- Verify checkpoint exists in database
- Check directory handle is still valid
- Verify library root matches

### Issue: Database not upgrading
- Clear browser cache
- Verify version 6 is in schema.ts
- Check migration helper logs

## Status Indicators

### During Scan
- Progress bar shows files scanned
- Checkpoints saved every 50 files (check database)

### On Disconnection
- Warning messages in console
- Checkpoint saved with `interrupted: true`
- Banner appears with monitoring status

### On Reconnection
- "Reconnection detected" message
- Auto-resume triggers
- Scan continues from checkpoint

### On Page Load
- Banner appears if interrupted scan exists
- "Resume Previous Scan" button available
- Click to resume

## Next Steps

1. Review `docs/TESTING_NETWORK_DRIVE_RELIABILITY.md` for detailed test procedures
2. Use `docs/TESTING_HELPERS.md` for browser console scripts
3. Follow Phase 7 and Phase 8 test procedures
4. Report any issues found

