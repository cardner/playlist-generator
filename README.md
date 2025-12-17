# AI Playlist Generator

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
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── library/           # Library scanning page
│   └── playlists/         # Playlist pages
├── components/            # React components
│   └── Navigation.tsx    # Main navigation
├── lib/                   # Utilities
│   ├── feature-detection.ts  # Browser capability detection
│   └── settings.ts        # Privacy settings management
├── db/                    # IndexedDB layer
│   └── index.ts          # Database interface
├── features/              # Feature modules
│   ├── library/          # Library scanning & indexing
│   └── playlists/        # Playlist generation
└── workers/               # Web Workers
    └── index.ts          # Worker scaffolding
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

The app supports connecting to any LLM provider for playlist strategy generation. By default, the app uses a heuristic fallback strategy generator, but you can enable LLM integration for more sophisticated playlist curation.

### How to Connect Your LLM Provider

1. **Choose Your Provider**: The app can work with any LLM API that accepts text prompts and returns JSON. Popular options include:
   - OpenAI (GPT-4, GPT-3.5)
   - Anthropic (Claude)
   - Google (Gemini)
   - Local models via API (Ollama, etc.)

2. **Update the LLM Function**: Edit `src/features/playlists/strategy.ts` and locate the `callLLM` function (around line 140). Replace the placeholder implementation with your provider's API call.

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

3. **Set Environment Variables**: Create a `.env.local` file in the project root:

```bash
# For OpenAI
NEXT_PUBLIC_OPENAI_API_KEY=your_api_key_here

# For Anthropic
NEXT_PUBLIC_ANTHROPIC_API_KEY=your_api_key_here

# Or use any other provider-specific variables
```

**Important**: Since this is a client-side app, API keys will be exposed in the browser. Consider:
- Using a proxy/backend API route to hide keys
- Using provider-specific client-side SDKs with key management
- Implementing rate limiting and usage monitoring

4. **Enable LLM in Settings**: Once configured, users can enable LLM integration in the app settings (stored locally in their browser).

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

1. Set up your API key in `.env.local`
2. Update the `callLLM` function with your provider's implementation
3. Enable LLM in app settings (or modify `src/lib/settings.ts` default)
4. Create a playlist request and verify the strategy is generated from your LLM
5. Check browser console for any API errors

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

### ⏳ In Progress / Next Steps

- ⏳ Playlist generation engine (track selection using strategy)
- ⏳ Playlist preview and editing
- ⏳ Playlist export (JSON, TXT, M3U)
- ⏳ Playlist persistence and history

## Constraints

1. **No silent disk scanning**: Users must explicitly select folders/files
2. **No backend**: All functionality must work client-side
3. **Privacy by default**: LLM features disabled by default
4. **Progressive enhancement**: Graceful degradation for unsupported browsers

## License

MIT

