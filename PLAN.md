# AI Playlist Generator - Development Plan

## Completed Features ✅

- ✅ Project structure and routing
- ✅ Feature detection utilities
- ✅ Privacy settings system
- ✅ IndexedDB layer structure (Dexie)
- ✅ Library scanning and indexing
- ✅ Metadata extraction (music-metadata)
- ✅ Library summarization and matching index
- ✅ Playlist builder UI with form validation
- ✅ LLM strategy layer with Zod validation
- ✅ Theme system (light/dark mode)
- ✅ Library browser with search/filter/sort
- ✅ Deterministic matching engine with explainable track selection
- ✅ Constraint solving (duration tolerance, track count)
- ✅ Per-track reasons for explainability
- ✅ Surprise factor implementation
- ✅ LLM provider configuration documentation

## Next Steps 🚀

### 1. Playlist Result/Display Page (`/playlists/[id]`)

**Priority:** High  
**Status:** Not Started

**Tasks:**
- Create playlist display page component
- Show playlist title, description, and metadata
- Display track list with:
  - Track number
  - Title, artist, album
  - Duration
  - Genre tags
- Show playlist statistics:
  - Total tracks
  - Total duration
  - Genre distribution
  - Artist distribution
- Add track reordering (drag & drop)
- Add track removal functionality
- Show strategy details (if available)

**Files to Create/Update:**
- `src/app/playlists/[id]/page.tsx`
- `src/components/PlaylistDisplay.tsx`
- `src/components/PlaylistTrackList.tsx`

**Dependencies:**
- Generated playlist data from sessionStorage/IndexedDB
- Track metadata lookup from IndexedDB

---

### 2. Playlist Export Functionality

**Priority:** High  
**Status:** Not Started

**Tasks:**
- Implement JSON export (full playlist data + strategy)
- Implement TXT export (simple track list)
- Implement M3U export (standard playlist format)
- Add export buttons to playlist display page
- Handle file downloads in browser
- Include metadata in exports (title, artist, duration)

**Files to Create/Update:**
- `src/lib/playlist-export.ts`
- `src/components/PlaylistExport.tsx`
- Update `src/app/playlists/[id]/page.tsx`

**Export Formats:**
- **JSON**: Complete playlist object with strategy and metadata
- **TXT**: Simple text list: `#. Title - Artist (Duration)`
- **M3U**: Standard M3U playlist format with file paths (if available)

---

### 3. Playlist Persistence to IndexedDB

**Priority:** Medium  
**Status:** Not Started

**Tasks:**
- Add playlist store to Dexie schema
- Create playlist persistence functions:
  - `savePlaylist(playlist)`
  - `getPlaylist(id)`
  - `getAllPlaylists()`
  - `deletePlaylist(id)`
  - `updatePlaylist(id, updates)`
- Update playlist generation to save to IndexedDB
- Add playlist history page (`/playlists`)
- Add "Save" button to playlist display page
- Add "Delete" functionality

**Files to Create/Update:**
- `src/db/schema.ts` (add playlists store)
- `src/db/playlist-storage.ts`
- `src/app/playlists/page.tsx` (playlist history)
- `src/components/PlaylistHistory.tsx`

**Schema:**
```typescript
interface PlaylistRecord {
  id: string;
  title: string;
  description: string;
  trackFileIds: string[];
  totalDuration: number;
  strategy?: PlaylistStrategy;
  createdAt: number;
  updatedAt: number;
}
```

---

### 4. Playlist Editing Capabilities

**Priority:** Medium  
**Status:** Not Started

**Tasks:**
- Add "Edit Playlist" mode
- Allow track reordering (drag & drop)
- Allow track removal
- Allow track addition (from library browser)
- Allow title/description editing
- Save changes to IndexedDB
- Show unsaved changes indicator
- Add "Revert" functionality

**Files to Create/Update:**
- `src/components/PlaylistEditor.tsx`
- `src/components/DraggableTrackList.tsx`
- Update `src/app/playlists/[id]/page.tsx`

**Features:**
- Drag & drop reordering
- Inline editing for title/description
- Track search/add from library
- Undo/redo (optional)
- Validation before save

---

## Future Enhancements 💡

### 5. Advanced Features (Future)

**Priority:** Low  
**Status:** Not Started

**Tasks:**
- Playlist templates/presets
- Playlist sharing (export as shareable link)
- Playlist duplication
- Batch playlist generation
- Playlist comparison/analysis
- Smart shuffle (respect strategy)
- Playlist recommendations based on library
- Integration with music players (if possible)

---

## Technical Debt / Improvements 🔧

### Code Quality
- [ ] Add comprehensive error boundaries
- [ ] Improve TypeScript strictness
- [ ] Add unit tests for core functions
- [ ] Add integration tests for playlist generation
- [ ] Improve error messages and user feedback

### Performance
- [ ] Optimize large library scanning
- [ ] Add virtual scrolling for large track lists
- [ ] Implement playlist generation progress indicator
- [ ] Cache library summaries
- [ ] Optimize IndexedDB queries

### UX Improvements
- [ ] Add loading skeletons
- [ ] Improve empty states
- [ ] Add keyboard shortcuts
- [ ] Add tooltips and help text
- [ ] Improve mobile responsiveness
- [ ] Add animations/transitions

### Documentation
- [ ] Add JSDoc comments to all public functions
- [ ] Create user guide/documentation
- [ ] Add code examples for common use cases
- [ ] Document playlist generation algorithm

---

## Notes 📝

### Current Limitations
- BPM/tempo data not extracted from audio files (all tracks marked as "unknown")
- Mood/activity matching is heuristic-based (could be improved with ML)
- No real-time playlist preview during generation
- Playlists stored in sessionStorage temporarily (need IndexedDB persistence)

### Dependencies to Consider
- `react-beautiful-dnd` or `@dnd-kit/core` for drag & drop
- `file-saver` for file downloads
- `m3u8-parser` for M3U format handling (if needed)

### Architecture Decisions
- Strategy-based generation allows for easy LLM integration
- Privacy-first: LLM only receives aggregated stats by default
- Fallback strategy ensures playlists always generate
- Client-side only: no backend required

---

## Progress Tracking

**Last Updated:** 2024-12-19

**Current Phase:** Core playlist generation complete, moving to display and persistence

**Next Milestone:** Complete playlist display and export functionality

---

## Questions / Decisions Needed

1. Should playlists be editable after generation, or read-only?
2. Should we support playlist templates/presets?
3. How should we handle file paths in exports (if File System Access API handles are not available)?
4. Should we add playlist versioning/history?
5. Do we need playlist sharing/collaboration features?

