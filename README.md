# mixtape gen

A privacy-first, local-first web application that generates playlists from your local music library.

## Project Goal

Generate intelligent playlists from your local music collection while maintaining complete privacy. All processing happens locally in your browser—no backend server required. Your music files and metadata never leave your device.

## Core Principles

### Privacy-First
- **No silent scanning**: The app only scans folders/files you explicitly select
- **No data transmission**: Music files are never uploaded or sent to external servers
- **Local storage only**: All data stored using IndexedDB and Cache Storage
- **LLM privacy**: When LLM integration is enabled, it only receives JSON rules, never track names (unless explicitly allowed)

### Local-First
- **No backend required**: Everything runs client-side
- **Offline capable**: Once set up, works completely offline
- **User-controlled**: You choose what folders to scan and what data to share

## Browser Support Matrix

### ✅ Full Support: Chromium-based Browsers

| Browser | Version | Features | Notes |
|---------|---------|----------|-------|
| **Chrome** | 86+ | ✅ Full support | File System Access API, persistent handles |
| **Edge** | 86+ | ✅ Full support | File System Access API, persistent handles |
| **Brave** | 1.20+ | ✅ Full support | File System Access API, persistent handles |
| **Opera** | 72+ | ✅ Full support | File System Access API, persistent handles |
| **Chromium** | 86+ | ✅ Full support | File System Access API, persistent handles |

**Full Support Features:**
- ✅ Direct folder selection via File System Access API
- ✅ Persistent directory handles (survives page reload)
- ✅ Efficient recursive directory scanning
- ✅ Automatic permission management
- ✅ Relative path storage
- ✅ All export formats (M3U8, PLS, XSPF, CSV, JSON)
- ✅ Library relinking support
- ✅ Local file audio preview (no API keys required)
- ✅ Multiple collection management

### ⚠️ Fallback Mode: Safari & Firefox

| Browser | Version | Features | Limitations |
|---------|---------|----------|-------------|
| **Safari** | 14+ | ⚠️ Fallback mode | No File System Access API |
| **Firefox** | 90+ | ⚠️ Fallback mode | No File System Access API |

**Fallback Mode Features:**
- ✅ File selection via `<input type="file" webkitdirectory>`
- ✅ Metadata extraction and parsing
- ✅ Playlist generation
- ✅ CSV/JSON export (always works)
- ⚠️ **Limitations:**
  - Must re-select folder on each page reload (no persistent handles)
  - Relative paths extracted from `webkitRelativePath` (may vary)
  - M3U8/PLS/XSPF exports may require manual file relinking
  - No automatic permission persistence
  - Slightly slower scanning (no direct file handle access)

**Fallback Mode Workflow:**
1. Click "Select Music Folder"
2. Choose folder via file picker
3. Files are scanned and indexed
4. Metadata is extracted
5. Playlists can be generated
6. **Note**: After page reload, folder selection must be repeated

### Feature Detection

The app automatically detects browser capabilities and adjusts the UI accordingly:
- **Chromium browsers**: Shows "Select Folder" button (File System Access API)
- **Other browsers**: Shows "Select Folder" button (fallback file input)
- Check the home page for your browser's support status

### Performance Considerations

**Large Libraries (10k-50k files):**
- ✅ Scanning yields to UI every 50 files (keeps browser responsive)
- ✅ Metadata parsing limited to 3 concurrent tasks (default)
- ✅ Progress updates every 100 files during scanning
- ✅ Performance metrics logged for monitoring
- ⚠️ Initial scan may take several minutes for very large libraries
- ⚠️ Metadata parsing may take 10-30 minutes for 10k+ files

**Recommended Settings:**
- **Concurrency**: 3 tasks (default) - balanced performance
- **Lower (1-2)**: More responsive UI, slower parsing
- **Higher (4-6)**: Faster parsing, may impact UI responsiveness

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB + Cache Storage API
- **File Access**: File System Access API (Chromium) with fallback

## Project Structure

```
docs/
└── help.md               # In-app help content (About/FAQ/Tips)
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── library/           # Library scanning page
│   └── playlists/         # Playlist pages
│       ├── new/          # Playlist builder
│       ├── generating/   # Generation progress
│       ├── saved/        # Saved playlists list
│       └── view/         # Playlist viewer
├── components/            # React components
│   ├── Navigation.tsx    # Main navigation
│   ├── HelpPanel.tsx     # Help sidebar overlay + TOC
│   ├── LibrarySelector.tsx  # Library selection UI
│   ├── CollectionManager.tsx  # Collection management
│   ├── PlaylistBuilder.tsx  # Playlist creation form
│   ├── PlaylistDisplay.tsx  # Playlist viewer
│   ├── FlowArcEditor.tsx  # Flow arc editing
│   ├── AgentSelector.tsx  # LLM provider selection
│   └── TrackSamplePlayer.tsx  # Audio preview player
├── lib/                   # Utilities
│   ├── feature-detection.ts  # Browser capability detection
│   ├── settings.ts        # Privacy settings management
│   ├── library-selection.ts  # File System Access API
│   └── api-key-storage.ts  # Secure API key storage
├── db/                    # IndexedDB layer
│   ├── schema.ts         # Database schema (Dexie)
│   ├── storage.ts        # Storage operations
│   └── playlist-storage.ts  # Playlist persistence
├── features/              # Feature modules
│   ├── library/          # Library scanning & indexing
│   │   ├── scanning.ts   # File scanning
│   │   ├── metadata.ts   # Metadata extraction
│   │   ├── summarization.ts  # Library summaries
│   │   ├── tempo-detection.ts  # BPM detection
│   │   ├── mood-mapping.ts   # Mood tag normalization
│   │   ├── activity-mapping.ts  # Activity tag normalization
│   │   └── activity-inference.ts  # Activity inference (BPM/genres, LLM)
│   ├── playlists/        # Playlist generation
│   │   ├── strategy.ts   # Strategy generation
│   │   ├── matching-engine.ts  # Track selection (affinity, prefilter)
│   │   ├── request-normalization.ts  # Mood/activity normalization
│   │   ├── scoring.ts    # Track scoring (genre, tempo, mood, activity)
│   │   ├── track-selection.ts  # Selection logic (affinity bonus)
│   │   ├── generation.ts  # Playlist orchestration
│   │   ├── validation.ts  # LLM + deterministic validation
│   │   └── ordering.ts   # Track ordering (mood/activity transitions)
│   ├── discovery/        # Music discovery
│   └── audio-preview/    # Audio preview
│       ├── platform-searcher.ts  # Multi-platform search
│       └── types.ts      # Preview types
└── workers/               # Web Workers
    └── metadataWorker.ts  # Background metadata parsing
```

## Getting Started

### Prerequisites
- Node.js 18+ 
- yarn

### Installation

```bash
yarn install
```

### Development

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
yarn build
yarn start
```

## Privacy Settings

The app includes configurable privacy settings (stored locally):

- `allowLLM`: Enable LLM integration (default: `false`)
- `allowSendingTrackNamesToLLM`: Allow sending track names to LLM (default: `false`)

Even when LLM is enabled, track names are never sent unless explicitly allowed. The LLM only receives JSON rules for playlist generation.

## LLM Provider Configuration

The app includes built-in support for multiple LLM providers. By default, the app uses a heuristic fallback strategy generator, but you can enable LLM integration for more sophisticated playlist curation directly from the UI.

### Built-in LLM Providers

The app supports the following providers out of the box:

- **OpenAI**: GPT-4, GPT-3.5 (via `gpt-4o-mini`)
- **Google Gemini**: Gemini Pro
- **Anthropic Claude**: Claude 3 Haiku
- **Local Models**: Ollama and other local LLM APIs

### Using LLM Providers

1. **Configure in UI**: No code changes needed! Simply:
   - Go to the playlist builder
   - Select "LLM" as the agent type
   - Choose your provider from the dropdown
   - Enter your API key (securely stored)

2. **API Key Storage**: API keys are:
   - Encrypted using AES-GCM encryption
   - Hashed using SHA-256
   - Stored locally in your browser
   - Never transmitted except to the selected provider

### Custom LLM Provider

To add support for a custom LLM provider, edit `src/features/playlists/strategy.ts`:

#### Example: OpenAI

```typescript
async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a music playlist curation assistant. Always return valid JSON only, no markdown, no explanations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
```

#### Example: Anthropic Claude

```typescript
async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are a music playlist curation assistant. Always return valid JSON only, no markdown, no explanations.\n\n${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Anthropic API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.content[0].text;
}
```

#### Example: Local Model (Ollama)

```typescript
async function callLLM(prompt: string): Promise<string> {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama2',
      prompt: `You are a music playlist curation assistant. Always return valid JSON only, no markdown, no explanations.\n\n${prompt}`,
      stream: false,
      options: {
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response;
}
```

3. **Add Provider to UI**: Update `src/components/AgentSelector.tsx` to add your provider to the dropdown.

**Note**: API keys are stored securely in the browser using encryption. For production deployments, consider:
- Using Next.js API routes as a proxy to hide keys
- Implementing a backend service to manage API keys
- Using provider SDKs with secure key management

### Privacy & Security Notes

- **API Keys**: Client-side API keys are visible in the browser. For production, consider:
  - Using Next.js API routes as a proxy
  - Implementing a backend service to manage API keys
  - Using provider SDKs with secure key management

- **Data Privacy**: The LLM only receives:
  - Aggregated library statistics (genre counts, tempo distribution, etc.)
  - Playlist request parameters (genres, mood, activity, tempo, length)
  - **Never** receives track names, artist names, or file paths (unless explicitly enabled in privacy settings)

- **Fallback**: If LLM is disabled or fails, the app automatically uses a heuristic fallback strategy generator.

### Testing Your LLM Integration

1. Configure your API key in the playlist builder UI
2. Select "LLM" as the agent type
3. Choose your provider
4. Create a playlist request and verify the strategy is generated from your LLM
5. Check browser console for any API errors
6. Review playlist validation and explanation (if enabled)

### Strategy Schema

The LLM must return JSON matching this schema (validated with Zod):

```typescript
{
  title: string; // Playlist title (1-100 chars)
  description: string; // Description (10-500 chars)
  constraints: {
    minTracks?: number;
    maxTracks?: number;
    minDuration?: number; // seconds
    maxDuration?: number; // seconds
    requiredGenres?: string[];
    excludedGenres?: string[];
  };
  scoringWeights: {
    genreMatch: number; // 0-1
    tempoMatch: number; // 0-1
    moodMatch: number; // 0-1
    activityMatch: number; // 0-1
    diversity: number; // 0-1
  };
  diversityRules: {
    maxTracksPerArtist: number;
    artistSpacing: number;
    maxTracksPerGenre?: number;
    genreSpacing: number;
  };
  orderingPlan: {
    sections: Array<{
      name: "warmup" | "peak" | "cooldown" | "transition";
      startPosition: number; // 0-1
      endPosition: number; // 0-1
      tempoTarget?: "slow" | "medium" | "fast";
      energyLevel?: "low" | "medium" | "high";
    }>;
  };
  vibeTags: string[]; // 1-10 tags
  tempoGuidance: {
    targetBucket?: "slow" | "medium" | "fast";
    bpmRange?: { min: number; max: number };
    allowVariation: boolean;
  };
  genreMixGuidance: {
    primaryGenres: string[];
    secondaryGenres?: string[];
    mixRatio?: { primary: number; secondary: number };
  };
}
```

If the LLM returns invalid JSON or doesn't match the schema, the app automatically falls back to the heuristic strategy generator.

## Key Features

### 🎵 Library Management

- **Multiple Collections**: Scan and manage multiple music library collections
- **Collection Switching**: Switch between saved collections seamlessly
- **Persistent Storage**: Collections persist across browser refreshes and cache clears
- **Customizable Names**: Edit collection names inline
- **Directory Relinking**: Relink directory handles if folders are moved
- **Collection Deletion**: Remove collections and all associated data

### 🎼 Playlist Generation

- **Intelligent Matching**: Deterministic algorithm for track selection based on user preferences
- **Mood & Activity Matching**: Tracks scored by mood and activity tags; inferred from BPM/genres when missing
- **Request Normalization**: User input (e.g. "chill", "gym") mapped to canonical categories for consistent matching
- **Affinity Bonus**: Tracks from suggested artists or similar genres receive scoring bonuses
- **LLM-Enhanced Generation**: Optional LLM integration for sophisticated playlist strategies
- **Track Refinement**: LLM-based semantic re-scoring of candidate tracks
- **Playlist Validation**: Post-generation validation (LLM or deterministic) with issues and suggestions
- **Human-Readable Explanations**: Natural language explanations for playlist choices
- **Flow Arc Editing**: Customize playlist energy flow (warmup, build, peak, cooldown sections)
- **Music Discovery**: Discover new tracks similar to your library (optional)

### 🎧 Audio Preview

- **Local File Playback**: Play tracks directly from your library (no API keys required)
- **YouTube Integration**: Optional YouTube Music previews (requires API key)
- **Spotify Integration**: Optional Spotify previews (requires Client ID/Secret)
- **Automatic Fallback**: Falls back to next available platform if one fails

### 📊 Playlist Management

- **Playlist Persistence**: Save playlists to IndexedDB with collection association
- **Playlist History**: View all saved playlists
- **Collection Association**: Playlists remember which collection they were generated from
- **Export Formats**: Export to M3U, PLS, XSPF, CSV, and JSON formats
- **Collection Mismatch Warnings**: Alerts when exporting playlists from different collections
- **In-app Help Panel**: Sidebar with FAQs, usage guidance, and tips

### 🎯 Advanced Features

- **Tempo Detection**: LLM-based BPM detection for tracks missing metadata
- **Genre Normalization**: Automatic genre normalization and mapping
- **Mood & Activity Inference**: Rule-based (BPM + genres) and optional LLM-based activity tagging
- **Track Reasoning**: See why each track was selected with detailed explanations
- **Playlist Variants**: Generate variations of existing playlists
- **Track Reordering**: Drag and drop to reorder tracks in playlists

## Configuration

### LLM Provider Setup

The app supports multiple LLM providers for enhanced playlist generation. Configure your provider in the playlist builder UI:

**Supported Providers:**
- **OpenAI** (GPT-4, GPT-3.5)
- **Google Gemini** (Gemini Pro)
- **Anthropic Claude** (Claude 3 Haiku)
- **Local Models** (Ollama, etc.)

**Configuration:**
1. In the playlist builder, select "LLM" as the agent type
2. Choose your provider from the dropdown
3. Enter your API key (stored securely using AES-GCM encryption)
4. API keys are hashed and encrypted before storage

**Note**: API keys are stored locally in your browser using encrypted storage. They are never transmitted except to the selected LLM provider.

### Audio Preview Setup

**Local File Playback (No Configuration Required):**
- Works automatically for collections scanned using File System Access API
- No API keys needed
- Plays files directly from your library

**YouTube Music Preview (Optional):**
1. Get a YouTube Data API v3 key from [Google Cloud Console](https://console.cloud.google.com/)
2. Configure in browser console:
   ```javascript
   localStorage.setItem('audio-preview-config', JSON.stringify({
     youtube: { apiKey: 'YOUR_YOUTUBE_API_KEY' }
   }));
   ```

**Spotify Preview (Optional):**
1. Create a Spotify app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Get Client ID and Client Secret
3. Configure in browser console:
   ```javascript
   localStorage.setItem('audio-preview-config', JSON.stringify({
     spotify: {
       clientId: 'YOUR_CLIENT_ID',
       clientSecret: 'YOUR_CLIENT_SECRET'
     }
   }));
   ```

### Music Discovery Setup

Music discovery uses MusicBrainz API (no API key required for basic usage):
- Automatically finds similar tracks not in your library
- Uses MusicBrainz for track metadata
- Can be enabled per playlist generation
- Configurable frequency (every track, every other track)

## Current Status

### ✅ Completed Features

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
- ✅ Playlist generation engine with deterministic matching
- ✅ Playlist preview and editing
- ✅ Playlist export (M3U, PLS, XSPF, CSV, JSON)
- ✅ Playlist persistence and history
- ✅ Collections management system
- ✅ LLM integration (OpenAI, Gemini, Claude, Local)
- ✅ Audio preview (local files, YouTube, Spotify)
- ✅ Music discovery feature
- ✅ Flow arc editor
- ✅ Playlist validation and explanation (LLM + deterministic)
- ✅ Tempo detection for missing BPM data
- ✅ Track reasoning and explanations
- ✅ Mood and activity matching with inference
- ✅ Request normalization and affinity scoring

## Data Storage

All data is stored locally in your browser:

- **IndexedDB**: Collections, tracks, playlists, file index, scan history
- **localStorage**: Privacy settings, audio preview config, API keys (encrypted)
- **Cache Storage**: Temporary file handles (Chromium browsers)

**Data Persistence:**
- Collections persist across browser refreshes
- Playlists are saved to IndexedDB
- Directory handles persist in Chromium browsers
- Settings and configurations persist locally

**Data Privacy:**
- No data is transmitted to external servers (except LLM providers when enabled)
- Music files never leave your device
- API keys are encrypted before storage
- All processing happens client-side

## Troubleshooting

### Audio Preview Not Working

**Local Files:**
- Ensure your collection was scanned using File System Access API (Chromium browsers)
- Check that files still exist at their original locations
- Verify collection is in "handle" mode (not "fallback" mode)

**YouTube/Spotify:**
- Verify API keys are configured correctly
- Check browser console for API errors
- Ensure API keys have proper permissions/quota

### Playlist Generation Issues

**LLM Errors:**
- Verify API key is correct and has sufficient quota
- Check browser console for detailed error messages
- Fallback to built-in agents if LLM fails

**Missing Tracks:**
- Ensure library is fully scanned
- Check that requested genres exist in your library
- Verify collection is selected correctly

### Collection Issues

**Collection Not Appearing:**
- Refresh the page
- Check browser console for errors
- Verify IndexedDB is accessible (check browser storage)

**Directory Relinking:**
- Only works for "handle" mode collections
- Requires existing tracks or file index entries
- Files must still exist at new location

## Constraints

1. **No silent disk scanning**: Users must explicitly select folders/files
2. **No backend**: All functionality must work client-side
3. **Privacy by default**: LLM features disabled by default
4. **Progressive enhancement**: Graceful degradation for unsupported browsers
5. **File System Access API**: Required for persistent collections and local file playback (Chromium browsers only)

## Contributing

Contributions are welcome! Please ensure:
- All features maintain privacy-first principles
- No backend dependencies are introduced
- Browser compatibility is maintained
- Tests are added for new features

## License

MIT

