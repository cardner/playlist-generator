# Network Drive Reliability & Resume - Testing Guide

This guide provides step-by-step instructions for testing the network drive reliability and resume functionality implemented in Phases 1-6.

## Prerequisites

- Windows PC with a network drive (or ability to simulate network drive disconnection)
- Browser with File System Access API support (Chrome, Edge, or other Chromium-based browsers)
- Developer tools console open to monitor logs

## Phase 7: Database Upgrade Testing

### Test 7.1: Database Upgrade from v5 to v6

**Objective**: Verify that existing databases automatically upgrade to version 6 without data loss.

**Steps**:
1. **Setup**: 
   - If you have an existing database at version 5, skip to step 3
   - Otherwise, create a test database at version 5:
     - Open browser DevTools → Application → IndexedDB
     - Find `ai-playlist-generator` database
     - Note the current version (should be 5 or 6)

2. **Verify v5 state**:
   - Check that existing tables exist: `libraryRoots`, `fileIndex`, `tracks`, `scanRuns`, `settings`, `directoryHandles`, `savedPlaylists`
   - Verify `scanCheckpoints` table does NOT exist yet
   - Note any existing data in these tables

3. **Trigger upgrade**:
   - Refresh the page or restart the app
   - The database should automatically upgrade to version 6

4. **Verify upgrade**:
   - Open DevTools → Application → IndexedDB
   - Check that database version is now 6
   - Verify `scanCheckpoints` table now exists
   - **Critical**: Verify all existing data is still present:
     - All library roots intact
     - All tracks intact
     - All file index entries intact
     - All scan runs intact
     - All saved playlists intact

**Expected Result**: 
- ✅ Database upgrades to version 6
- ✅ `scanCheckpoints` table is created
- ✅ All existing data remains intact
- ✅ No console errors

### Test 7.2: Verify All Existing Data Remains Intact

**Objective**: Ensure no data loss during upgrade.

**Steps**:
1. Before upgrade, record counts:
   - Count of library roots
   - Count of tracks
   - Count of file index entries
   - Count of scan runs
   - Count of saved playlists

2. Perform upgrade (refresh page)

3. After upgrade, verify counts match exactly

**Expected Result**: All counts match exactly - no data loss

### Test 7.3: Verify scanCheckpoints Table is Accessible

**Objective**: Ensure the new table works correctly after upgrade.

**Steps**:
1. After upgrade, open browser console
2. Run:
   ```javascript
   import { db } from '@/db/schema';
   await db.open();
   const checkpoints = await db.scanCheckpoints.toArray();
   console.log('Checkpoints:', checkpoints);
   ```

**Expected Result**: 
- ✅ No errors
- ✅ Returns empty array (no checkpoints yet)
- ✅ Table is accessible

### Test 7.4: Test with v5 Database (Before Upgrade)

**Objective**: Verify app works correctly with v5 database.

**Steps**:
1. If possible, test with a v5 database (before upgrade)
2. Verify all existing functionality works:
   - Library selection
   - Library scanning
   - Playlist creation
   - Playlist viewing

**Expected Result**: App functions normally with v5 database

### Test 7.5: Test with v6 Database (After Upgrade)

**Objective**: Verify app works correctly with v6 database.

**Steps**:
1. After upgrade, test all functionality:
   - Library selection
   - Library scanning
   - Playlist creation
   - Playlist viewing
   - Check for interrupted scans

**Expected Result**: App functions normally with v6 database, plus checkpoint features available

### Test 7.6: Verify Migration Helper

**Objective**: Ensure migration helper correctly detects v6 compatibility.

**Steps**:
1. Check `src/db/migration.ts` - verify `TestDB` includes version 6 schema
2. The migration helper should NOT delete v5 databases (they're compatible)

**Expected Result**: Migration helper correctly identifies v5 as compatible for upgrade

### Test 7.7: Test with Fresh Database

**Objective**: Verify new databases start at version 6.

**Steps**:
1. Clear browser data (or use incognito mode)
2. Open the app
3. Check database version in DevTools

**Expected Result**: 
- ✅ Database created at version 6
- ✅ All tables including `scanCheckpoints` exist
- ✅ App functions normally

### Test 7.8: Test with Database Containing Existing Scan Runs

**Objective**: Verify checkpoints work with existing scan runs.

**Steps**:
1. Have a database with existing scan runs
2. Upgrade to v6
3. Start a new scan
4. Verify checkpoint is created and linked to scan run

**Expected Result**: Checkpoints work correctly with existing scan runs

## Phase 8: Functionality Testing

### Test 8.1: Checkpoint Saving Every 50 Files

**Objective**: Verify checkpoints are saved periodically during scanning.

**Steps**:
1. Start scanning a library with 100+ files
2. Monitor browser console for checkpoint saves
3. Check database during scan:
   ```javascript
   import { db } from '@/db/schema';
   await db.open();
   const checkpoints = await db.scanCheckpoints.toArray();
   console.log('Current checkpoints:', checkpoints);
   ```

**Expected Result**:
- ✅ Checkpoint saved approximately every 50 files
- ✅ Checkpoint contains correct data:
  - `scannedFileIds` array
  - `lastScannedPath`
  - `lastScannedIndex`
  - `totalFound`
  - `interrupted: false`

### Test 8.2: Resume from Checkpoint (Verify Skipped Files)

**Objective**: Verify that resuming from a checkpoint skips already-scanned files.

**Steps**:
1. Start scanning a library
2. Let it scan ~75 files (past first checkpoint)
3. Manually interrupt (close browser or disconnect network)
4. Resume the scan
5. Verify:
   - First ~75 files are NOT scanned again
   - Scanning continues from file 76
   - Total count is correct

**Expected Result**:
- ✅ Already-scanned files are skipped
- ✅ Scan continues from correct position
- ✅ No duplicate file entries

### Test 8.3: Network Disconnection Detection (3+ Consecutive Failures)

**Objective**: Verify that 3+ consecutive failures trigger disconnection detection.

**Steps**:
1. Start scanning a network drive
2. Disconnect the network drive (or simulate disconnection)
3. Monitor console for:
   - Warnings about consecutive failures
   - Disconnection detection message
   - `NetworkDriveDisconnectedError` thrown

**Expected Result**:
- ✅ After 3 consecutive `NotFoundError` failures, disconnection is detected
- ✅ Checkpoint is saved with `interrupted: true`
- ✅ Reconnection monitoring starts

### Test 8.4: Reconnection Detection (Polling Every 2s)

**Objective**: Verify that reconnection is detected via polling.

**Steps**:
1. Trigger a disconnection (see Test 8.3)
2. Verify reconnection monitoring starts
3. Reconnect the network drive
4. Monitor console for reconnection detection

**Expected Result**:
- ✅ Monitoring polls every 2 seconds
- ✅ Reconnection is detected within 2-4 seconds
- ✅ Auto-resume is triggered

### Test 8.5: Auto-Resume with Cancel Option

**Objective**: Verify auto-resume can be cancelled.

**Steps**:
1. Trigger disconnection and reconnection (see Tests 8.3-8.4)
2. When reconnection is detected, verify banner appears
3. Click "Cancel Auto-Resume" button
4. Verify:
   - Monitoring stops
   - Banner changes to show manual resume option
   - Scan does NOT automatically resume

**Expected Result**:
- ✅ Banner appears when monitoring
- ✅ Cancel button works
- ✅ Auto-resume is cancelled
- ✅ Manual resume option available

### Test 8.6: Manual Resume from Interrupted Scan

**Objective**: Verify manual resume functionality.

**Steps**:
1. Have an interrupted scan (from Test 8.3 or manual interruption)
2. Refresh page or reopen app
3. Verify banner appears with "Resume Previous Scan" button
4. Click "Resume Previous Scan"
5. Verify scan resumes from checkpoint

**Expected Result**:
- ✅ Banner appears on page load if interrupted scan exists
- ✅ Resume button works
- ✅ Scan resumes from correct position
- ✅ Already-scanned files are skipped

### Test 8.7: Checkpoint Cleanup on Completion

**Objective**: Verify checkpoints are deleted when scan completes successfully.

**Steps**:
1. Start and complete a scan successfully
2. Check database:
   ```javascript
   import { db } from '@/db/schema';
   await db.open();
   const checkpoints = await db.scanCheckpoints.toArray();
   console.log('Checkpoints after completion:', checkpoints);
   ```

**Expected Result**:
- ✅ No checkpoints remain after successful completion
- ✅ Checkpoint was deleted

### Test 8.8: Test with Large Libraries (1000+ Files)

**Objective**: Verify checkpoint system works with large libraries.

**Steps**:
1. Scan a library with 1000+ files
2. Monitor checkpoint creation
3. Verify:
   - Checkpoints are saved periodically
   - Performance is acceptable
   - Resume works correctly

**Expected Result**:
- ✅ Checkpoints saved every 50 files
- ✅ No performance degradation
- ✅ Resume works correctly

### Test 8.9: Error Handling for Various Failure Scenarios

**Objective**: Verify error handling for edge cases.

**Test Scenarios**:

1. **Invalid Directory Handle on Resume**:
   - Create interrupted scan
   - Delete or move the directory
   - Attempt to resume
   - **Expected**: Clear error message, no crash

2. **Checkpoint Exists but ScanRun Does Not**:
   - Manually create checkpoint in database
   - Delete corresponding scan run
   - Attempt to resume
   - **Expected**: New scan run created, resume works

3. **Network Drive Disconnects During Resume**:
   - Resume interrupted scan
   - Disconnect network drive during resume
   - **Expected**: New checkpoint saved, monitoring starts

4. **Multiple Interrupted Scans**:
   - Create multiple interrupted scans for same library
   - Verify most recent is used for resume
   - **Expected**: Most recent checkpoint used

5. **Database Upgrade During Active Scan**:
   - Start scan with v5 database
   - Upgrade to v6 during scan
   - **Expected**: Scan continues, checkpoint saved

## Testing Checklist Summary

### Database Upgrade (Phase 7)
- [ ] Test 7.1: Database upgrade from v5 to v6
- [ ] Test 7.2: Verify all existing data remains intact
- [ ] Test 7.3: Verify scanCheckpoints table is accessible
- [ ] Test 7.4: Test with v5 database (before upgrade)
- [ ] Test 7.5: Test with v6 database (after upgrade)
- [ ] Test 7.6: Verify migration helper detects v6 compatibility
- [ ] Test 7.7: Test with fresh database
- [ ] Test 7.8: Test with database containing existing scan runs

### Functionality (Phase 8)
- [ ] Test 8.1: Checkpoint saving every 50 files
- [ ] Test 8.2: Resume from checkpoint (verify skipped files)
- [ ] Test 8.3: Network disconnection detection (3+ consecutive failures)
- [ ] Test 8.4: Reconnection detection (polling every 2s)
- [ ] Test 8.5: Auto-resume with cancel option
- [ ] Test 8.6: Manual resume from interrupted scan
- [ ] Test 8.7: Checkpoint cleanup on completion
- [ ] Test 8.8: Test with large libraries (1000+ files)
- [ ] Test 8.9: Error handling for various failure scenarios

## Browser DevTools Commands

### Check Database Version
```javascript
// In browser console
const db = await indexedDB.open('ai-playlist-generator');
db.onsuccess = (e) => {
  console.log('Database version:', e.target.result.version);
  e.target.result.close();
};
```

### View All Checkpoints
```javascript
import { db } from '@/db/schema';
await db.open();
const checkpoints = await db.scanCheckpoints.toArray();
console.table(checkpoints);
```

### View Interrupted Scans
```javascript
import { getInterruptedScans } from '@/db/storage-scan-checkpoints';
const interrupted = await getInterruptedScans('your-library-root-id');
console.log('Interrupted scans:', interrupted);
```

### Clear All Checkpoints (for testing)
```javascript
import { db } from '@/db/schema';
await db.open();
await db.scanCheckpoints.clear();
console.log('All checkpoints cleared');
```

## Common Issues and Solutions

### Issue: Checkpoint not being created
**Solution**: Verify database is at version 6, check console for errors

### Issue: Resume not working
**Solution**: Verify checkpoint exists in database, check that directory handle is still valid

### Issue: Database upgrade not happening
**Solution**: Clear browser cache, ensure migration helper is not blocking upgrade

### Issue: Warning about missing scanCheckpoints table
**Solution**: Refresh page to trigger database upgrade, verify version 6 upgrade is defined

## Notes

- All tests should be performed on Windows PC with actual network drive for most accurate results
- Some tests can be simulated by temporarily disconnecting network or using file system errors
- Monitor browser console for detailed logs during testing
- Use browser DevTools → Application → IndexedDB to inspect database state

