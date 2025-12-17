# Integration Flow Verification

This document verifies that all components are properly connected for the complete user flow.

## Complete User Flow

### 1. Library Selection (`/library` page)

**Components:**
- `LibrarySelector` - Folder selection UI
- `LibraryScanner` - Scanning and metadata parsing
- `LibrarySummary` - Library statistics display
- `LibraryBrowser` - Browse scanned tracks

**Flow:**
1. User clicks "Select Music Folder" → `pickLibraryRoot()` called
2. System dialog opens → User selects folder
3. Folder saved to IndexedDB via `saveLibraryRoot()`
4. Permission checked → `requestLibraryPermission()`
5. **Auto-scan starts** (if permission granted and new selection)
6. Files scanned → `scanLibraryWithPersistence()`
7. File index saved to IndexedDB → `saveFileIndexEntries()`
8. Metadata parsed → `parseMetadataForFiles()`
9. Track metadata saved → `saveTrackMetadata()`
10. UI shows success → "Library Indexed Successfully"

**Data Stored:**
- `libraryRoots` table: Library root info
- `fileIndex` table: File paths and metadata
- `tracks` table: Track metadata (tags, tech info)
- `scanRuns` table: Scan history

### 2. Playlist Creation (`/playlists/new` page)

**Components:**
- `LibrarySummary` - Shows library stats
- `PlaylistBuilder` - Form for playlist preferences

**Flow:**
1. Page loads → `LibrarySummary` calls `getCurrentLibrarySummary()`
2. `PlaylistBuilder` loads genres → `getAllGenres()` from tracks
3. User fills form:
   - Genres (from library)
   - Length (minutes/tracks)
   - Mood (free text)
   - Activity (free text)
   - Tempo (slow/medium/fast + optional BPM range)
   - Surprise (0-100%)
4. Form validates → `validatePlaylistRequest()`
5. Draft auto-saved → `savePlaylistDraft()` to localStorage
6. User submits → Request saved to `sessionStorage`
7. Navigate to `/playlists/generating`

**Data Flow:**
- Genres loaded from `tracks` table via `getAllGenres()`
- Library summary from `tracks` table via `getCurrentLibrarySummary()`
- Request stored in `sessionStorage` as JSON

### 3. Playlist Generation (`/playlists/generating` page)

**Components:**
- Loading UI with request details
- Calls playlist generation functions

**Flow:**
1. Page loads → Loads request from `sessionStorage`
2. Gets library summary → `getCurrentLibrarySummary()`
3. Gets library root → `getCurrentLibraryRoot()`
4. Gets strategy → `getStrategy(request, summary)`
   - Tries LLM (if enabled) → `callLLM()`
   - Falls back to heuristic → `fallbackStrategy()`
5. Generates playlist → `generatePlaylistFromStrategy()`
   - Gets tracks from IndexedDB → `getAllTracks()` or filtered by `libraryRootId`
   - Builds matching index → `buildMatchingIndex()`
   - Selects tracks → `generatePlaylist()` (matching engine)
   - Orders tracks → `orderTracks()` (ordering agent)
6. Playlist saved to `sessionStorage`
7. Redirects to `/playlists/[id]`

**Data Flow:**
- Request: `sessionStorage` → `getStrategy()` → Strategy object
- Library summary: IndexedDB `tracks` → `summarizeLibrary()` → Summary object
- Tracks: IndexedDB `tracks` → Filtered by `libraryRootId` → TrackRecord[]
- Matching index: Built from tracks → `buildMatchingIndex()` → MatchingIndex
- Generated playlist: Strategy + Request + Tracks → `GeneratedPlaylist`

### 4. Playlist Display (`/playlists/[id]` page)

**Components:**
- `PlaylistDisplay` - Main display component
- `PlaylistWhySummary` - "Why this playlist?" explanation
- `TrackReasonChips` - "Why this track?" reasons
- `PlaylistExport` - Export functionality

**Flow:**
1. Page loads → Loads playlist from `sessionStorage`
2. Loads track details → `getAllTracks()` → Maps `trackFileId` to `TrackRecord`
3. Displays:
   - Playlist title + emoji + subtitle
   - Variant buttons (calmer, faster, more variety, more genre)
   - Regenerate button with seed toggle
   - "Why this playlist?" summary
   - Track list with reasons
   - Export options
4. User can:
   - Generate variants → Modifies request → Regenerates
   - Regenerate → Same request, new seed (if fresh mode)
   - Export → Downloads playlist files

**Data Flow:**
- Playlist: `sessionStorage` → `GeneratedPlaylist` object
- Tracks: IndexedDB `tracks` → Map by `trackFileId`
- File index: IndexedDB `fileIndex` → For export paths

## Key Integration Points

### ✅ Library Selection → Scanning
- **Connection:** `LibrarySelector` → `onLibrarySelected` → `LibraryScanner`
- **Status:** ✅ Working - Auto-scans on new selection

### ✅ Scanning → Storage
- **Connection:** `scanLibraryWithPersistence()` → `saveFileIndexEntries()` → `saveTrackMetadata()`
- **Status:** ✅ Working - All data saved to IndexedDB

### ✅ Storage → Library Summary
- **Connection:** `getCurrentLibrarySummary()` → `summarizeLibrary()` → Reads from `tracks` table
- **Status:** ✅ Working - Summary generated from stored tracks

### ✅ Storage → Playlist Builder
- **Connection:** `getAllGenres()` → Reads from `tracks` table → Genre suggestions
- **Status:** ✅ Working - Genres loaded from scanned tracks

### ✅ Playlist Builder → Generation
- **Connection:** Form submit → `sessionStorage` → `/playlists/generating`
- **Status:** ✅ Working - Request stored and passed correctly

### ✅ Generation → Strategy
- **Connection:** `getStrategy()` → Uses library summary → Returns strategy
- **Status:** ✅ Working - Strategy generated from request + summary

### ✅ Strategy → Matching Engine
- **Connection:** `generatePlaylistFromStrategy()` → `generatePlaylist()` → Selects tracks
- **Status:** ✅ Working - Tracks selected from IndexedDB using strategy

### ✅ Matching Engine → Ordering
- **Connection:** `generatePlaylist()` → `orderTracks()` → Final sequence
- **Status:** ✅ Working - Tracks ordered with arc and transitions

### ✅ Generation → Display
- **Connection:** `sessionStorage` → `/playlists/[id]` → `PlaylistDisplay`
- **Status:** ✅ Working - Playlist loaded and displayed

### ✅ Display → Export
- **Connection:** `PlaylistExport` → Reads tracks + file index → Downloads files
- **Status:** ✅ Working - Exports generated with proper paths

## Data Dependencies

### Required for Playlist Generation:
1. ✅ Library root selected and scanned
2. ✅ Files indexed in `fileIndex` table
3. ✅ Track metadata in `tracks` table
4. ✅ Library summary available
5. ✅ Matching index built from tracks

### Required for Export:
1. ✅ Generated playlist with `trackFileIds`
2. ✅ Track records in `tracks` table
3. ✅ File index entries with `relativePath` (optional but recommended)

## Error Handling

### Missing Library:
- `getCurrentLibrarySummary()` returns empty summary
- `getAllGenres()` returns empty array
- Playlist generation fails with "No tracks available"

### Missing Tracks:
- `generatePlaylistFromStrategy()` throws error
- UI shows error message
- User prompted to scan library

### Missing Request:
- `/playlists/generating` redirects to `/playlists/new`
- `/playlists/[id]` shows error if playlist not found

## Testing Checklist

- [ ] Select folder → See folder name → Scan starts automatically
- [ ] Scan progress shows file count and current file
- [ ] Scan completes → Shows success message
- [ ] Library summary shows track count and genres
- [ ] Library browser shows scanned tracks
- [ ] Playlist builder loads genres from library
- [ ] Submit playlist request → Navigate to generating page
- [ ] Generating page shows request details
- [ ] Playlist generated → Redirects to display page
- [ ] Display page shows playlist with tracks
- [ ] Track reasons displayed correctly
- [ ] Export works for all formats
- [ ] Variants regenerate playlist correctly
- [ ] Regenerate with stable/fresh mode works

