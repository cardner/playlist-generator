# Copilot Instructions for Playlist Generator

## Project Overview

This is **mixtape gen**, a privacy-first, local-first Next.js web application that generates intelligent music playlists from local music libraries. All processing happens client-side in the browser—no backend server required. Music files and metadata never leave the user's device.

**Key Technologies:**
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB (Dexie) + Cache Storage API
- **File Access**: File System Access API (Chromium) with fallback for Safari/Firefox
- **Testing**: Jest with React Testing Library

**Project Size**: Medium-sized (~50-100 files), TypeScript-based web app with complex state management

## Build & Development Commands

### Installation & Setup
```bash
yarn install
# Always run yarn install after pulling changes or before building
```

### Development
```bash
yarn dev
# Starts Next.js dev server on http://localhost:3000
# Uses hot reload for fast development
```

### Building
```bash
yarn build
# Production build - generates static export in ./out directory
# IMPORTANT: Build must succeed before deploying
# Build time: ~30-60 seconds on average
```

### Testing
```bash
# Run all tests
yarn test

# Run tests in watch mode (useful during development)
yarn test:watch

# Generate coverage report
yarn test:coverage
```

### Linting
```bash
yarn lint
# Runs ESLint with Next.js config
# Always run before committing to catch TypeScript/React issues
```

### Clean Build
```bash
yarn clean        # Remove .next directory
yarn dev:clean    # Clean and start dev server
```

## Build & Test Workflow

**Before making changes:**
1. Run `yarn install` if package.json changed
2. Run `yarn test` to establish baseline (some tests may fail - note which ones)
3. Run `yarn lint` to check for existing issues

**After making changes:**
1. Run `yarn lint` to catch TypeScript/React issues
2. Run `yarn test` to verify your changes don't break existing tests
3. Run `yarn build` to ensure production build succeeds
4. If tests fail, verify they're related to your changes (some pre-existing test failures may exist)

**Important Notes:**
- The app is a static Next.js export (no server-side rendering)
- Build outputs to `./out` directory
- Tests use Jest with jsdom environment
- Test files are in `src/__tests__/` with `.test.ts` or `.test.tsx` extensions

## Project Structure & Architecture

### Directory Layout
```
.github/
  workflows/
    deploy.yml        # CI/CD: build, test, deploy to GitHub Pages

src/
  app/                # Next.js App Router pages
    page.tsx          # Landing page
    library/          # Library scanning page
    playlists/
      new/            # Playlist builder
      generating/     # Generation progress
      saved/          # Saved playlists list
      view/           # Playlist viewer

  components/         # React components
    Navigation.tsx    # Main navigation
    HelpPanel.tsx     # Help sidebar
    LibrarySelector.tsx
    CollectionManager.tsx
    PlaylistBuilder.tsx
    PlaylistDisplay.tsx
    FlowArcEditor.tsx
    AgentSelector.tsx
    TrackSamplePlayer.tsx

  features/           # Feature modules (business logic)
    library/          # Library scanning & metadata
      scanning.ts     # File scanning
      metadata.ts     # Metadata extraction (music-metadata)
      summarization.ts
      tempo-detection.ts
      mood-mapping.ts
      activity-mapping.ts
      activity-inference.ts

    playlists/        # Playlist generation
      strategy.ts     # LLM integration for strategies
      matching-engine.ts  # Track selection algorithm
      request-normalization.ts
      scoring.ts      # Track scoring logic
      track-selection.ts
      generation.ts   # Main orchestration
      validation.ts
      ordering.ts

    discovery/        # Music discovery
    audio-preview/    # Audio playback
      platform-searcher.ts
      types.ts

  db/                 # Database layer
    schema.ts         # Dexie schema definitions
    storage.ts        # Storage operations
    playlist-storage.ts

  lib/                # Utilities
    feature-detection.ts  # Browser capabilities
    settings.ts       # Privacy settings
    library-selection.ts  # File System Access API
    api-key-storage.ts    # Encrypted key storage

  workers/
    metadataWorker.ts # Background metadata parsing

  __tests__/          # Jest tests
    *.test.ts
    *.test.tsx

docs/
  help.md             # In-app help content

Root Files:
  middleware.ts       # Next.js middleware
  next.config.js      # Next.js config (static export)
  jest.config.js      # Jest configuration
  jest.setup.js       # Jest setup
  tailwind.config.ts  # Tailwind configuration
  tsconfig.json       # TypeScript configuration
  package.json        # Dependencies & scripts
```

### Key Architectural Patterns

**1. Privacy-First Design**
- All processing happens client-side
- No data transmitted to external servers (except LLM APIs when explicitly enabled)
- Privacy settings stored locally (IndexedDB)
- Default: LLM disabled, track names never sent to LLMs

**2. Browser Compatibility**
- **Full support**: Chromium browsers (File System Access API available)
- **Fallback mode**: Safari/Firefox (no persistent file handles)
- Feature detection in `src/lib/feature-detection.ts`
- Graceful degradation throughout codebase

**3. Storage Strategy**
- **IndexedDB (Dexie)**: Collections, tracks, playlists, file index
- **localStorage**: Privacy settings, API keys (encrypted), audio preview config
- **Cache Storage**: Temporary file handles (Chromium only)

**4. Module Organization**
- **Features**: Business logic organized by domain (library, playlists, discovery)
- **Components**: UI components (React)
- **DB**: Database schema and operations
- **Lib**: Utilities and helpers
- **Workers**: Background processing

## Important Code Conventions

1. **TypeScript**: All code is TypeScript - use proper types, avoid `any`
2. **React**: Functional components with hooks, no class components
3. **Async/Await**: Preferred over promises for readability
4. **Error Handling**: Always handle errors gracefully, especially for file operations
5. **Comments**: Minimal comments - code should be self-documenting. Add comments only for complex algorithms or non-obvious decisions.

## Key Dependencies

- **next**: ^14.2.5 - React framework
- **react**: ^18.3.1 - UI library
- **dexie**: ^4.2.1 - IndexedDB wrapper
- **music-metadata**: ^11.10.3 - Audio metadata extraction
- **zod**: ^4.2.0 - Schema validation (especially for LLM responses)
- **tailwindcss**: ^3.4.4 - Styling
- **jest**: ^29.7.0 - Testing framework

## Common Gotchas & Important Notes

1. **File System Access API**: Only available in Chromium browsers. Always check for feature support before using.

2. **IndexedDB**: Asynchronous operations. Always use `await` with Dexie queries.

3. **Web Workers**: `metadataWorker.ts` runs in separate context - can't access DOM or window directly.

4. **Next.js Static Export**: This is NOT a server-side rendered app. No API routes, no server-side code. The `next.config.js` has `output: 'export'`.

5. **LLM Integration**: Multiple providers supported (OpenAI, Gemini, Claude, local). API keys are encrypted before storage. Always validate LLM responses with Zod schemas.

6. **Privacy Settings**: Check privacy settings before enabling features. Never send track names to LLM unless explicitly allowed.

7. **Browser Testing**: Test in both Chromium (full features) and Safari/Firefox (fallback mode) when making changes to file handling.

8. **Performance**: Large libraries (10k+ files) can take time to scan. Progress UI must stay responsive - use yielding patterns.

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Install dependencies: `yarn install --frozen-lockfile`
2. Build: `yarn build`
3. Calculate version: `node scripts/version.js`
4. Generate release notes: `node scripts/release-notes.js`
5. Deploy to GitHub Pages from `./out` directory

**Important**: The build MUST succeed for deployment. If build fails, fix it before merging.

## Making Changes: Quick Reference

**Adding a new feature:**
1. Implement business logic in `src/features/`
2. Create UI components in `src/components/`
3. Add page routes in `src/app/` if needed
4. Update database schema in `src/db/schema.ts` if storing data
5. Add tests in `src/__tests__/`
6. Update help documentation in `docs/help.md` if user-facing

**Modifying database schema:**
1. Update `src/db/schema.ts`
2. Increment Dexie version number
3. Add migration logic if needed
4. Test with existing data

**Adding LLM provider:**
1. Add provider logic in `src/features/playlists/strategy.ts`
2. Update UI in `src/components/AgentSelector.tsx`
3. Add Zod schema validation for responses
4. Test with real API keys

**Debugging tips:**
- Use browser DevTools for IndexedDB inspection
- Check Console for errors (especially storage/file access issues)
- Use React DevTools for component state debugging
- Test in both Chromium and Safari/Firefox for compatibility issues

## Validation Steps

Before submitting changes:
1. ✅ Run `yarn lint` - must pass
2. ✅ Run `yarn test` - verify related tests pass
3. ✅ Run `yarn build` - must succeed
4. ✅ Test manually in browser (both Chromium and Safari/Firefox if file handling changed)
5. ✅ Check browser console for errors
6. ✅ Verify privacy settings are respected

## Trust These Instructions

These instructions are comprehensive and tested. When implementing changes:
- **Follow the patterns** described here
- **Use the commands** as documented
- **Only search/explore** if you need specific file contents or if these instructions are incomplete/incorrect
- **Don't reinvent** - use existing utilities and patterns in the codebase
