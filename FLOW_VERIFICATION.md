# End-to-End Flow Verification

This document verifies that all components are properly connected for the complete user journey from folder selection to playlist generation.

## Complete User Journey

### Step 1: Select Music Folder (`/library` page)

**User Action:** Click "Select Music Folder" button

**Flow:**
1. `LibrarySelector.handleChooseFolder()` called
2. `pickLibraryRoot()` opens system folder picker
3. User selects folder → Folder saved via `saveLibraryRoot()`
4. Permission checked → `requestLibraryPermission()`
5. Folder name displayed in UI
6. **Auto-scan triggered** (if permission granted and new selection)

**Data Stored:**
- `libraryRoots` table: Library root record with `id`, `name`, `mode`, `handleId`
- IndexedDB: Directory handle stored (for handle mode)

**UI Feedback:**
- ✅ Folder name displayed: "Selected Folder: [folder name]"
- ✅ Permission status shown
- ✅ "Ready to Scan" state (if not auto-scanning)

### Step 2: Scan Library (`LibraryScanner` component)

**User Action:** Auto-starts after folder selection (or manual "Start Scan" click)

**Flow:**
1. `LibraryScanner.handleScan()` called
2. `scanLibraryWithPersistence()` called
3. Files scanned recursively → `buildFileIndex()`
4. Progress updates every 50 files → `onProgress()` callback
5. File index saved → `saveFileIndexEntries()`
6. Scan run created → `createScanRun()`
7. Metadata parsing starts → `parseMetadataForFiles()`
8. Track metadata saved → `saveTrackMetadata()`
9. Scan run updated → `updateScanRun()`

**Data Stored:**
- `fileIndex` table: File entries with `trackFileId`, `relativePath`, `name`, `size`, `mtime`
- `tracks` table: Track metadata with `tags` (title, artist, album, genres, year) and `tech` (duration, bitrate, etc.)
- `scanRuns` table: Scan history

**UI Feedback:**
- ✅ Progress bar: "Scanning Library..." with file count
- ✅ Current file displayed
- ✅ Scan results: Total, Added, Changed, Removed counts
- ✅ Success banner: "Library Indexed Successfully"
- ✅ "Create Playlist" button appears

### Step 3: View Library Summary (`LibrarySummary` component)

**User Action:** Automatically displayed after scan

**Flow:**
1. `LibrarySummary` loads → `getCurrentLibrarySummary()` called
2. Reads tracks from IndexedDB → `summarizeLibrary()`
3. Calculates statistics:
   - Total tracks count
   - Genre counts (sorted by frequency)
   - Artist counts (if privacy allows)
   - Tempo distribution
   - Duration stats
   - Recently added counts

**Data Source:**
- `tracks` table → Aggregated statistics

**UI Feedback:**
- ✅ Total tracks displayed
- ✅ Top genres shown
- ✅ Average duration
- ✅ Recently added counts
- ✅ Top artists (if available)

### Step 4: Browse Library (`LibraryBrowser` component)

**User Action:** View scanned tracks

**Flow:**
1. `LibraryBrowser` loads → `getAllTracks()` called
2. Tracks loaded from IndexedDB
3. Genres loaded → `getAllGenres()` for filter dropdown
4. Search/filter/sort applied client-side

**Data Source:**
- `tracks` table → All track records
- Filtered and sorted in memory

**UI Feedback:**
- ✅ Track list with title, artist, album, duration
- ✅ Search box
- ✅ Genre filter dropdown
- ✅ Sort options
- ✅ Clear library button

### Step 5: Create Playlist Request (`/playlists/new` page)

**User Action:** Fill form and submit

**Flow:**
1. `PlaylistBuilder` loads → `getAllGenres()` called
2. Genres loaded from `tracks` table → Populated in suggestions
3. User fills form:
   - Selects genres (from library)
   - Sets length (minutes or tracks)
   - Adds moods (free text)
   - Adds activities (free text)
   - Selects tempo (slow/medium/fast + optional BPM range)
   - Adjusts surprise slider (0-100%)
4. Form validates → `validatePlaylistRequest()`
5. Draft auto-saved → `savePlaylistDraft()` to localStorage
6. User submits → Request saved to `sessionStorage`
7. Navigate to `/playlists/generating`

**Data Flow:**
- Genres: `tracks` table → `getAllGenres()` → Genre suggestions
- Request: Form → `sessionStorage` → JSON string

**UI Feedback:**
- ✅ Genre suggestions from library
- ✅ Form validation with inline errors
- ✅ Draft auto-saved
- ✅ Submit button with loading state

### Step 6: Generate Playlist (`/playlists/generating` page)

**User Action:** Automatic (page loads)

**Flow:**
1. Page loads → Loads request from `sessionStorage`
2. Gets library summary → `getCurrentLibrarySummary()`
3. Gets library root → `getCurrentLibraryRoot()`
4. Gets strategy → `getStrategy(request, summary)`
   - Builds LLM payload → `buildLLMPayload()`
   - Tries LLM (if enabled) → `callLLM()`
   - Falls back to heuristic → `fallbackStrategy()`
5. Generates playlist → `generatePlaylistFromStrategy()`
   - Gets tracks → `getAllTracks()` or filtered by `libraryRootId`
   - Builds matching index → `buildMatchingIndex()`
   - Selects tracks → `generatePlaylist()` (matching engine)
     - Scores tracks → Genre, tempo, duration, diversity, surprise
     - Applies constraints → Length, genre, tempo
     - Selects top tracks → Weighted scoring
   - Orders tracks → `orderTracks()` (ordering agent)
     - Assigns to sections → Warmup, peak, cooldown
     - Calculates transitions → Artist/genre/tempo continuity
     - Creates arc → Energy flow
6. Playlist saved to `sessionStorage`
7. Redirects to `/playlists/[id]`

**Data Flow:**
- Request: `sessionStorage` → `PlaylistRequest` object
- Summary: IndexedDB `tracks` → `summarizeLibrary()` → `LibrarySummary`
- Strategy: Request + Summary → `PlaylistStrategy` object
- Tracks: IndexedDB `tracks` → `TrackRecord[]`
- Matching Index: Tracks → `buildMatchingIndex()` → `MatchingIndex`
- Generated Playlist: Strategy + Request + Tracks → `GeneratedPlaylist`

**UI Feedback:**
- ✅ Loading state: "Generating Your Playlist"
- ✅ Request details displayed
- ✅ Loading spinner
- ✅ Error handling with retry

### Step 7: Display Playlist (`/playlists/[id]` page)

**User Action:** View generated playlist

**Flow:**
1. Page loads → Loads playlist from `sessionStorage`
2. Loads track details → `getAllTracks()` → Maps `trackFileId` to `TrackRecord`
3. Displays playlist with all features

**Data Flow:**
- Playlist: `sessionStorage` → `GeneratedPlaylist` object
- Tracks: IndexedDB `tracks` → Map by `trackFileId`
- File index: IndexedDB `fileIndex` → For export paths

**UI Feedback:**
- ✅ Playlist title + emoji + subtitle
- ✅ Variant buttons (calmer, faster, more variety, more genre)
- ✅ Regenerate button with seed toggle
- ✅ "Why this playlist?" summary
- ✅ Track list with "Why this track?" reasons
- ✅ Export options (M3U8, PLS, XSPF, CSV, JSON)

## Integration Points Verified

### ✅ Library Selection → Scanning
- **Connection:** `LibrarySelector` → `onLibrarySelected` → `LibraryScanner`
- **Status:** ✅ Working - Auto-scans on new selection (not on page load)
- **UI:** ✅ Folder name displayed, progress shown, success message

### ✅ Scanning → Storage
- **Connection:** `scanLibraryWithPersistence()` → `saveFileIndexEntries()` → `saveTrackMetadata()`
- **Status:** ✅ Working - All data saved to IndexedDB
- **Tables:** ✅ `fileIndex`, `tracks`, `scanRuns` populated

### ✅ Storage → Library Summary
- **Connection:** `getCurrentLibrarySummary()` → `summarizeLibrary()` → Reads from `tracks` table
- **Status:** ✅ Working - Summary generated from stored tracks
- **Refresh:** ✅ Updates when `refreshTrigger` changes

### ✅ Storage → Playlist Builder
- **Connection:** `getAllGenres()` → Reads from `tracks` table → Genre suggestions
- **Status:** ✅ Working - Genres loaded from scanned tracks
- **UI:** ✅ Genre chips populated with library genres

### ✅ Playlist Builder → Generation
- **Connection:** Form submit → `sessionStorage` → `/playlists/generating`
- **Status:** ✅ Working - Request stored and passed correctly
- **Validation:** ✅ Inline errors, draft saving

### ✅ Generation → Strategy
- **Connection:** `getStrategy()` → Uses library summary → Returns strategy
- **Status:** ✅ Working - Strategy generated from request + summary
- **Fallback:** ✅ Heuristic fallback if LLM fails

### ✅ Strategy → Matching Engine
- **Connection:** `generatePlaylistFromStrategy()` → `generatePlaylist()` → Selects tracks
- **Status:** ✅ Working - Tracks selected from IndexedDB using strategy
- **Scoring:** ✅ Genre, tempo, duration, diversity, surprise weights applied

### ✅ Matching Engine → Ordering
- **Connection:** `generatePlaylist()` → `orderTracks()` → Final sequence
- **Status:** ✅ Working - Tracks ordered with arc and transitions
- **Sections:** ✅ Warmup, peak, cooldown sections created

### ✅ Generation → Display
- **Connection:** `sessionStorage` → `/playlists/[id]` → `PlaylistDisplay`
- **Status:** ✅ Working - Playlist loaded and displayed
- **Tracks:** ✅ Track details loaded from IndexedDB

### ✅ Display → Export
- **Connection:** `PlaylistExport` → Reads tracks + file index → Downloads files
- **Status:** ✅ Working - Exports generated with proper paths
- **Formats:** ✅ M3U8, PLS, XSPF, CSV, JSON all working

## Data Flow Diagram

```
User selects folder
    ↓
LibrarySelector → pickLibraryRoot()
    ↓
saveLibraryRoot() → IndexedDB (libraryRoots)
    ↓
LibraryScanner → scanLibraryWithPersistence()
    ↓
buildFileIndex() → scanLibrary()
    ↓
saveFileIndexEntries() → IndexedDB (fileIndex)
    ↓
parseMetadataForFiles() → parseSingleFile()
    ↓
saveTrackMetadata() → IndexedDB (tracks)
    ↓
LibrarySummary → getCurrentLibrarySummary()
    ↓
summarizeLibrary() → Reads from IndexedDB (tracks)
    ↓
PlaylistBuilder → getAllGenres()
    ↓
Reads from IndexedDB (tracks) → Genre suggestions
    ↓
User submits form → sessionStorage (playlist-request)
    ↓
/playlists/generating → getStrategy()
    ↓
getCurrentLibrarySummary() → Reads from IndexedDB (tracks)
    ↓
generatePlaylistFromStrategy() → getAllTracks()
    ↓
Reads from IndexedDB (tracks) → TrackRecord[]
    ↓
buildMatchingIndex() → MatchingIndex
    ↓
generatePlaylist() → Selects tracks
    ↓
orderTracks() → Final sequence
    ↓
sessionStorage (generated-playlist)
    ↓
/playlists/[id] → PlaylistDisplay
    ↓
Reads from IndexedDB (tracks) → Display tracks
    ↓
PlaylistExport → Reads from IndexedDB (fileIndex) → Export files
```

## Error Handling

### Missing Library:
- ✅ `getCurrentLibrarySummary()` returns empty summary (0 tracks)
- ✅ `getAllGenres()` returns empty array
- ✅ Playlist generation fails with "No tracks available" error
- ✅ UI shows appropriate error messages

### Missing Tracks:
- ✅ `generatePlaylistFromStrategy()` throws error
- ✅ UI shows error message with retry button
- ✅ User prompted to scan library

### Missing Request:
- ✅ `/playlists/generating` redirects to `/playlists/new`
- ✅ `/playlists/[id]` shows error if playlist not found

### Missing File Index:
- ✅ Export shows warning if relative paths missing
- ✅ CSV/JSON exports always work (don't require paths)
- ✅ Relink option available

## Performance Considerations

### Large Libraries (10k-50k files):
- ✅ Scanning yields every 50 files (keeps UI responsive)
- ✅ Metadata parsing limited to 3 concurrent tasks
- ✅ Progress updates every 100 files
- ✅ Performance metrics logged

### Playlist Generation:
- ✅ Matching index built once and reused
- ✅ Track selection uses efficient scoring
- ✅ Ordering uses greedy algorithm (fast)
- ✅ All operations are deterministic (seeded random)

## Testing Checklist

- [x] Select folder → See folder name → Scan starts automatically
- [x] Scan progress shows file count and current file
- [x] Scan completes → Shows success message with file count
- [x] Library summary shows track count and genres
- [x] Library browser shows scanned tracks
- [x] Playlist builder loads genres from library
- [x] Submit playlist request → Navigate to generating page
- [x] Generating page shows request details
- [x] Playlist generated → Redirects to display page
- [x] Display page shows playlist with tracks
- [x] Track reasons displayed correctly
- [x] Export works for all formats
- [x] Variants regenerate playlist correctly
- [x] Regenerate with stable/fresh mode works

## Summary

All components are properly connected and working together:

1. ✅ **Library Selection** → Folder selected and saved
2. ✅ **Scanning** → Files scanned, indexed, and metadata parsed
3. ✅ **Storage** → All data persisted to IndexedDB
4. ✅ **Library Summary** → Statistics generated from stored tracks
5. ✅ **Playlist Builder** → Genres loaded from library, form validated
6. ✅ **Playlist Generation** → Strategy created, tracks selected, ordered
7. ✅ **Playlist Display** → Playlist shown with explanations
8. ✅ **Export** → Playlists exported in multiple formats

The complete flow from folder selection to playlist generation is **fully integrated and working**.

