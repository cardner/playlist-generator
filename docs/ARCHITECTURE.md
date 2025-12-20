# Architecture Documentation

This document provides a comprehensive overview of the AI Playlist Generator architecture, including system design, component hierarchy, data flow, patterns, error handling, and performance considerations.

## Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Component Hierarchy](#component-hierarchy)
- [Data Flow](#data-flow)
- [Architecture Patterns](#architecture-patterns)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)
- [State Management](#state-management)
- [API Integration](#api-integration)
- [Storage Architecture](#storage-architecture)

## System Overview

The AI Playlist Generator is a client-side web application that helps users create intelligent music playlists from their local music library. The application follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer (React)                     │
│  Components, Pages, Hooks, State Management             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                 Feature Layer (Business Logic)         │
│  Library Management, Playlist Generation, Discovery    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Storage Layer (IndexedDB)                 │
│  Schema, Storage Operations, Migration, Cleanup        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              External Services                          │
│  LLM APIs, MusicBrainz, iTunes Search                  │
└─────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Client-Side First**: All processing happens in the browser; no backend required
2. **Privacy-Focused**: User data never leaves their device unless explicitly configured
3. **Modular**: Clear separation between UI, business logic, and storage
4. **Extensible**: Easy to add new features, formats, or integrations
5. **Performance**: Optimized for large libraries (10k+ tracks)

## Technology Stack

### Core Technologies

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5.x
- **UI Library**: React 18
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

### Storage

- **Primary**: IndexedDB (via Dexie.js)
- **Session**: sessionStorage (playlist data)
- **Settings**: localStorage (user preferences, API keys)

### File Access

- **Primary**: File System Access API (Chromium browsers)
- **Fallback**: File Input API (other browsers)

### External Services

- **LLM Providers**: OpenAI, Google Gemini, Anthropic Claude, Local LLM
- **Music Discovery**: MusicBrainz API (local database)
- **Audio Preview**: iTunes Search API

## Project Structure

```
src/
├── app/                      # Next.js App Router pages
│   ├── layout.tsx           # Root layout with navigation
│   ├── page.tsx             # Landing page
│   ├── library/             # Library management pages
│   │   └── page.tsx         # Library scanning and browsing
│   └── playlists/           # Playlist pages
│       ├── new/             # Playlist creation form
│       ├── generating/      # Generation progress
│       ├── saved/           # Saved playlists list
│       └── view/            # Playlist viewer
│
├── components/               # React components
│   ├── Navigation.tsx       # Main navigation bar
│   ├── LibrarySelector.tsx  # Library folder selection
│   ├── LibraryScanner.tsx   # Scanning UI and progress
│   ├── LibraryBrowser.tsx   # Track browsing interface
│   ├── PlaylistBuilder.tsx  # Playlist creation form
│   ├── PlaylistDisplay.tsx  # Playlist viewer
│   ├── FlowArcEditor.tsx    # Flow arc editing
│   ├── AgentSelector.tsx    # LLM provider selection
│   ├── InlineAudioPlayer.tsx # Inline audio preview
│   └── ...                  # Other UI components
│
├── features/                 # Feature modules (business logic)
│   ├── library/            # Library management
│   │   ├── scanning.ts     # File scanning logic
│   │   ├── metadata.ts     # Metadata extraction
│   │   ├── summarization.ts # Library statistics
│   │   ├── tempo-detection.ts # BPM detection
│   │   └── genre-normalization.ts # Genre normalization
│   ├── playlists/          # Playlist generation
│   │   ├── strategy.ts     # LLM strategy generation
│   │   ├── matching-engine.ts # Track selection
│   │   ├── scoring.ts      # Track scoring functions
│   │   ├── track-selection.ts # Selection logic
│   │   ├── ordering.ts     # Track ordering
│   │   ├── generation.ts   # Generation orchestration
│   │   ├── validation.ts   # LLM validation
│   │   ├── variants.ts      # Variant generation
│   │   ├── naming.ts        # Playlist naming
│   │   └── export.ts        # Export functionality
│   ├── discovery/          # Music discovery
│   │   ├── musicbrainz-client.ts # MusicBrainz API
│   │   └── explanation-generator.ts # Discovery explanations
│   └── audio-preview/      # Audio preview
│       ├── itunes-searcher.ts # iTunes search
│       └── platform-searcher.ts # Unified search
│
├── hooks/                   # Custom React hooks
│   ├── useLibraryScanning.ts # Scanning state management
│   ├── useMetadataParsing.ts # Metadata parsing state
│   ├── usePlaylistForm.ts   # Form state and validation
│   ├── useAudioPreview.ts   # Audio playback logic
│   ├── useAudioPreviewState.ts # Multi-track audio state
│   └── ...                  # Other hooks
│
├── db/                      # Database layer
│   ├── schema.ts           # Dexie schema definition
│   ├── storage.ts          # Storage operations (re-exports)
│   ├── storage-library-root.ts # Library root operations
│   ├── storage-file-index.ts # File index operations
│   ├── storage-tracks.ts   # Track operations
│   ├── storage-queries.ts  # Query operations
│   ├── storage-cleanup.ts  # Cleanup utilities
│   ├── storage-errors.ts   # Error handling
│   ├── migration.ts        # Migration logic
│   └── migration-helper.ts # Migration helper
│
├── lib/                     # Utility libraries
│   ├── logger.ts           # Centralized logging
│   ├── utils.ts            # Common utilities
│   ├── library-selection.ts # File system access
│   ├── api-key-storage.ts  # Secure API key storage
│   ├── settings.ts         # App settings
│   ├── feature-detection.ts # Browser capability detection
│   └── playlist-validation.ts # Request validation
│
└── types/                   # TypeScript type definitions
    ├── playlist.ts         # Playlist-related types
    ├── library.ts          # Library-related types
    ├── storage.ts          # Storage-related types
    └── ui.ts               # UI component types
```

## Component Hierarchy

### Page Components

```
RootLayout
├── Navigation
├── ThemeProvider
└── Page Content
    ├── LibraryPage
    │   ├── LibrarySelector
    │   ├── LibraryScanner
    │   ├── LibrarySummary
    │   └── LibraryBrowser
    │
    ├── PlaylistNewPage
    │   ├── LibrarySummary
    │   └── PlaylistBuilder
    │       ├── AgentSelector
    │       ├── ChipInput (genres, moods, activities)
    │       └── FlowArcEditor
    │
    ├── PlaylistGeneratingPage
    │   └── Loading UI
    │
    └── PlaylistViewPage
        └── PlaylistDisplay
            ├── PlaylistWhySummary
            ├── TrackReasonChips
            ├── InlineAudioPlayer
            └── PlaylistExport
```

### Component Responsibilities

**Page Components** (`app/*/page.tsx`):
- Handle routing and navigation
- Load initial data
- Coordinate child components
- Manage page-level state

**Feature Components** (`components/*.tsx`):
- Present UI for specific features
- Handle user interactions
- Call feature modules for business logic
- Manage component-level state

**UI Components** (`components/Modal.tsx`, `components/ChipInput.tsx`):
- Reusable UI primitives
- No business logic
- Configurable via props

## Data Flow

### Library Scanning Flow

```
User selects folder
    ↓
LibrarySelector → pickLibraryRoot()
    ↓
saveLibraryRoot() → IndexedDB (libraryRoots)
    ↓
LibraryScanner → scanLibraryWithPersistence()
    ↓
buildFileIndex() → Recursive file scanning
    ↓
saveFileIndexEntries() → IndexedDB (fileIndex)
    ↓
parseMetadataForFiles() → Extract metadata
    ↓
saveTrackMetadata() → IndexedDB (tracks)
    ↓
LibrarySummary → getCurrentLibrarySummary()
    ↓
summarizeLibrary() → Generate statistics
```

### Playlist Generation Flow

```
User fills PlaylistBuilder form
    ↓
validatePlaylistRequest() → Validate input
    ↓
savePlaylistDraft() → localStorage (draft)
    ↓
User submits → sessionStorage (request)
    ↓
PlaylistGeneratingPage → generatePlaylistFromStrategy()
    ↓
getStrategy() → LLM or fallback strategy
    ↓
buildMatchingIndex() → Build search indexes
    ↓
generatePlaylist() → Score and select tracks
    ↓
orderTracks() → Order with flow arc
    ↓
sessionStorage (playlist) → PlaylistViewPage
    ↓
PlaylistDisplay → Render playlist
```

### Data Storage Flow

```
Component Action
    ↓
Feature Module (business logic)
    ↓
Storage Module (data access)
    ↓
Dexie/IndexedDB (persistence)
    ↓
Component receives updated data
```

## Architecture Patterns

### 1. Layered Architecture

**UI Layer** → **Feature Layer** → **Storage Layer**

- **UI Layer**: React components, hooks, state management
- **Feature Layer**: Business logic, algorithms, external API calls
- **Storage Layer**: Database operations, data persistence

**Benefits**:
- Clear separation of concerns
- Easy to test each layer independently
- Can swap storage implementation without changing features

### 2. Feature Modules

Each feature is self-contained in `src/features/`:

```
features/
├── library/          # Library management
├── playlists/        # Playlist generation
├── discovery/        # Music discovery
└── audio-preview/    # Audio preview
```

**Benefits**:
- Features are independent and reusable
- Easy to add new features
- Clear boundaries between features

### 3. Custom Hooks Pattern

Business logic is extracted into reusable hooks:

```typescript
// Instead of inline state management
const { scanning, startScan, progress } = useLibraryScanning();
const { formData, setFormData, validate } = usePlaylistForm();
```

**Benefits**:
- Reusable logic across components
- Easier to test
- Cleaner component code

### 4. Storage Abstraction

Storage operations are abstracted through modules:

```typescript
// Instead of direct Dexie calls
import { saveTrackMetadata, getTracks } from '@/db/storage';
```

**Benefits**:
- Can swap storage implementation
- Centralized error handling
- Easier to add caching or optimizations

### 5. Error Handling Pattern

Standardized error handling:

```typescript
import { logger } from '@/lib/logger';
import { GenerationError } from '@/features/playlists/errors';

try {
  // Operation
} catch (error) {
  logger.error('Operation failed:', error);
  throw new GenerationError('User-friendly message', error);
}
```

**Benefits**:
- Consistent error handling
- User-friendly error messages
- Centralized logging

## Error Handling

### Error Hierarchy

```
Error (base)
├── LibraryError
│   ├── ScanningError
│   ├── MetadataError
│   ├── PermissionError
│   └── StorageError
├── PlaylistError
│   ├── GenerationError
│   ├── ValidationError
│   ├── StrategyError
│   └── MatchingError
└── ComponentError
    ├── FormError
    ├── FileError
    └── NetworkError
```

### Error Handling Strategy

1. **Feature Layer**: Throws typed errors with context
2. **Component Layer**: Catches errors and displays user-friendly messages
3. **Storage Layer**: Wraps IndexedDB errors with context
4. **Logger**: Centralized logging (development only for warnings/info)

### Error Recovery

- **Graceful Degradation**: Fallback strategies when LLM fails
- **Partial Success**: Continue with available data when possible
- **User Feedback**: Clear error messages with actionable steps

## Performance Considerations

### 1. Large Library Handling

**Problem**: Libraries with 10k+ tracks can be slow to scan and process.

**Solutions**:
- **Batched Processing**: Process files in batches (500-1000 at a time)
- **Incremental Scanning**: Only scan changed files
- **Chunked Storage**: Save data in chunks to avoid blocking
- **Progress Callbacks**: Yield to UI thread periodically

### 2. Rendering Optimization

**Problem**: Rendering large track lists can be slow.

**Solutions**:
- **Memoization**: Use `useMemo` for expensive computations
- **Virtual Scrolling**: Only render visible items (future enhancement)
- **Lazy Loading**: Load track details on demand
- **Component Splitting**: Split large components into smaller ones

### 3. Database Optimization

**Problem**: IndexedDB queries can be slow for large datasets.

**Solutions**:
- **Indexes**: Proper indexes on frequently queried fields
- **Batch Operations**: Use `bulkGet()` and `bulkPut()` instead of individual operations
- **Query Limits**: Limit result sets to prevent loading excessive data
- **Caching**: Cache frequently accessed data in memory

### 4. LLM API Optimization

**Problem**: LLM API calls are slow and expensive.

**Solutions**:
- **Batching**: Batch tempo detection requests
- **Caching**: Cache strategies for similar requests (future enhancement)
- **Fallbacks**: Use deterministic fallbacks when LLM fails
- **Timeout Handling**: Set reasonable timeouts and handle failures gracefully

### 5. Memory Management

**Problem**: Large libraries can consume significant memory.

**Solutions**:
- **Streaming**: Process files one at a time instead of loading all into memory
- **Cleanup**: Remove unused data from memory
- **Garbage Collection**: Let browser handle GC, avoid memory leaks

## State Management

### Local State (useState)

Used for component-specific state:

```typescript
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

### Shared State (Custom Hooks)

Used for state shared across components:

```typescript
const { scanning, startScan } = useLibraryScanning();
const { formData, setFormData } = usePlaylistForm();
```

### Persistent State (IndexedDB/localStorage)

Used for data that persists across sessions:

- **IndexedDB**: Library data, tracks, file index
- **localStorage**: User settings, API keys, draft playlists
- **sessionStorage**: Current playlist, generation state

### State Flow

```
User Action
    ↓
Component State Update (useState)
    ↓
Feature Module Call
    ↓
Storage Update (IndexedDB/localStorage)
    ↓
Component Re-render (React)
```

## API Integration

### LLM Integration

**Providers**: OpenAI, Google Gemini, Anthropic Claude, Local LLM

**Pattern**:
```typescript
async function callLLM(prompt: string, config: LLMConfig) {
  switch (config.provider) {
    case 'openai': return callOpenAI(prompt, config);
    case 'gemini': return callGemini(prompt, config);
    case 'claude': return callClaude(prompt, config);
    case 'local': return callLocalLLM(prompt, config);
  }
}
```

**Error Handling**: Falls back to deterministic strategies on failure

### MusicBrainz Integration

**Pattern**: Local MusicBrainz database via HTTP API

**Usage**:
- Search for recordings by artist/title
- Find related artists
- Get genre information
- Discover new music

**Error Handling**: Gracefully handles connection failures, rate limits

### iTunes Integration

**Pattern**: Unauthenticated iTunes Search API

**Usage**:
- Search for track previews
- Get 30-second audio samples
- No authentication required

**Error Handling**: Returns null on failure, component handles gracefully

## Storage Architecture

### IndexedDB Schema

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema documentation.

**Key Tables**:
- `libraryRoots`: Library root information
- `fileIndex`: Scanned file information
- `tracks`: Track metadata
- `scanRuns`: Scan history
- `savedPlaylists`: Saved playlists
- `directoryHandles`: File System Access API handles

### Storage Operations

**Read Operations**:
- Query by `libraryRootId` for multi-collection support
- Use indexes for fast lookups
- Limit result sets for large queries

**Write Operations**:
- Batch operations for efficiency
- Chunked storage for large datasets
- Progress callbacks for UI updates

**Migration**:
- Versioned schema migrations
- Automatic migration on version change
- Backward compatibility handling

### Storage Quotas

**Monitoring**: `getStorageQuotaInfo()` checks available space

**Cleanup**: `cleanupOldScanRuns()`, `cleanupOrphanedFileIndex()` remove old data

**Error Handling**: Gracefully handles quota exceeded errors

## Additional Resources

- [Library Management Documentation](./LIBRARY_MANAGEMENT.md) - Library scanning and metadata
- [Playlist Generation Documentation](./PLAYLIST_GENERATION.md) - Playlist generation pipeline
- [Database Schema Documentation](./DATABASE_SCHEMA.md) - Complete schema reference
- [Development Guide](./DEVELOPMENT_GUIDE.md) - Setup and development workflow

