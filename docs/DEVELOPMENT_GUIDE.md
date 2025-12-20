# Development Guide

This guide provides instructions for setting up, developing, testing, and contributing to the AI Playlist Generator.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Debugging](#debugging)
- [Performance Profiling](#performance-profiling)
- [Contributing](#contributing)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Node.js**: 18.x or higher
- **Package Manager**: Yarn (recommended) or npm
- **Git**: For version control
- **Code Editor**: VS Code (recommended) with TypeScript support

### Recommended VS Code Extensions

- **ESLint**: Code linting
- **Prettier**: Code formatting
- **TypeScript**: Type checking
- **Tailwind CSS IntelliSense**: Tailwind autocomplete

### Browser Requirements

- **Chrome/Edge** (recommended): Full File System Access API support
- **Firefox/Safari**: Limited support (file input fallback)

## Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ai-playlist-generator
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Environment Setup

The application uses environment variables for configuration. Create a `.env.local` file (optional):

```env
# LLM API Keys (optional, can be set in UI)
OPENAI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here

# MusicBrainz Configuration (optional, for discovery mode)
MUSICBRAINZ_HOST=localhost
MUSICBRAINZ_PORT=5000
```

### 4. Start Development Server

```bash
yarn dev
```

The application will be available at `http://localhost:3000`.

### 5. Build for Production

```bash
yarn build
yarn start
```

## Development Workflow

### Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete architecture overview.

**Key Directories**:
- `src/app/`: Next.js pages and routing
- `src/components/`: React components
- `src/features/`: Business logic modules
- `src/hooks/`: Custom React hooks
- `src/db/`: Database layer
- `src/lib/`: Utility functions
- `src/types/`: TypeScript type definitions

### Development Commands

```bash
# Start development server
yarn dev

# Build for production
yarn build

# Start production server
yarn start

# Type checking
yarn type-check

# Linting
yarn lint

# Format code
yarn format
```

### Hot Reload

Next.js provides hot module replacement (HMR) for fast development:
- Component changes reload automatically
- State is preserved when possible
- Fast Refresh shows errors inline

### Working with Types

The project uses TypeScript for type safety:

```typescript
// Import types
import type { PlaylistRequest, GeneratedPlaylist } from '@/types/playlist';
import type { TrackRecord } from '@/db/schema';

// Use types
const request: PlaylistRequest = { /* ... */ };
```

## Code Style

### TypeScript Guidelines

1. **Use TypeScript Strict Mode**: Always enable strict type checking
2. **Prefer Interfaces**: Use `interface` for object types, `type` for unions/intersections
3. **Avoid `any`**: Use `unknown` or proper types instead
4. **Use Type Imports**: Use `import type` for type-only imports

```typescript
// Good
import type { PlaylistRequest } from '@/types/playlist';
import { generatePlaylist } from '@/features/playlists';

// Bad
import { PlaylistRequest, generatePlaylist } from '@/features/playlists';
```

### React Guidelines

1. **Functional Components**: Use functional components with hooks
2. **Component Props**: Define props interfaces above components
3. **Hooks**: Extract reusable logic into custom hooks
4. **Memoization**: Use `useMemo` and `useCallback` for expensive operations

```typescript
// Good
interface ComponentProps {
  title: string;
  onAction: () => void;
}

export function Component({ title, onAction }: ComponentProps) {
  const memoizedValue = useMemo(() => expensiveCalculation(), [deps]);
  return <div>{title}</div>;
}

// Bad
export function Component(props: any) {
  return <div>{props.title}</div>;
}
```

### Naming Conventions

- **Components**: PascalCase (`PlaylistDisplay.tsx`)
- **Functions**: camelCase (`generatePlaylist`)
- **Types/Interfaces**: PascalCase (`PlaylistRequest`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_TRACKS`)
- **Files**: Match export name (`PlaylistDisplay.tsx` exports `PlaylistDisplay`)

### File Organization

```
src/
├── components/
│   └── ComponentName.tsx      # Component file
├── features/
│   └── feature-name/
│       ├── index.ts           # Public exports
│       ├── feature-module.ts  # Main module
│       └── types.ts           # Feature-specific types
├── hooks/
│   └── useHookName.ts         # Custom hook
└── lib/
    └── utility-name.ts         # Utility function
```

### Code Formatting

The project uses Prettier for code formatting. Format on save is recommended.

**Prettier Configuration**:
- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Trailing commas in arrays/objects

### Import Order

1. External dependencies (React, Next.js, etc.)
2. Internal modules (`@/components`, `@/features`, etc.)
3. Types (`import type`)
4. Relative imports (`./`, `../`)

```typescript
// External
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Internal
import { PlaylistDisplay } from '@/components/PlaylistDisplay';
import { generatePlaylist } from '@/features/playlists';

// Types
import type { PlaylistRequest } from '@/types/playlist';

// Relative
import { LocalComponent } from './LocalComponent';
```

## Testing

### Manual Testing

The application is primarily tested manually due to its browser-specific nature:

1. **Library Scanning**: Test with various folder structures and file types
2. **Playlist Generation**: Test with different request combinations
3. **Export**: Verify exported playlists work in music players
4. **Error Handling**: Test error scenarios (no tracks, API failures, etc.)

### Testing Checklist

**Library Management**:
- [ ] Select library folder
- [ ] Scan large library (1000+ files)
- [ ] Rescan library (incremental updates)
- [ ] Relink moved library folder
- [ ] Browse tracks with filters

**Playlist Generation**:
- [ ] Create playlist with genres
- [ ] Create playlist with tempo requirements
- [ ] Create playlist with discovery mode
- [ ] Generate variants (calmer, faster, etc.)
- [ ] Regenerate with different seed

**Export**:
- [ ] Export to M3U format
- [ ] Export to PLS format
- [ ] Export to XSPF format
- [ ] Export to CSV format
- [ ] Export to JSON format

**Error Scenarios**:
- [ ] No tracks in library
- [ ] LLM API failure
- [ ] MusicBrainz connection failure
- [ ] Storage quota exceeded
- [ ] Invalid playlist request

### Browser Testing

Test in multiple browsers:
- **Chrome/Edge**: Full feature support
- **Firefox**: File input fallback
- **Safari**: File input fallback

## Debugging

### Browser DevTools

**Console**:
- Check for errors and warnings
- Use `logger.error()`, `logger.warn()`, `logger.info()` for debugging
- Logger gates info/warn to development mode only

**Network Tab**:
- Monitor API calls (LLM, MusicBrainz, iTunes)
- Check for failed requests
- Verify request/response payloads

**Application Tab**:
- **IndexedDB**: Inspect database tables and data
- **Local Storage**: Check settings and drafts
- **Session Storage**: Check playlist data

**Performance Tab**:
- Profile component renders
- Identify performance bottlenecks
- Check memory usage

### Debugging Tips

1. **Use React DevTools**: Inspect component state and props
2. **Add Logging**: Use `logger.info()` for debugging (development only)
3. **Breakpoints**: Use browser debugger for complex logic
4. **Database Inspection**: Use DevTools to inspect IndexedDB data

### Common Debugging Scenarios

**Playlist Generation Fails**:
1. Check console for errors
2. Verify library has tracks matching request
3. Check LLM API key and configuration
4. Inspect strategy generation response

**Library Scanning Slow**:
1. Check number of files being scanned
2. Verify metadata parsing isn't blocking
3. Check for memory leaks
4. Profile with Performance tab

**Export Fails**:
1. Check file paths are valid
2. Verify library root is accessible
3. Check for missing file index entries
4. Verify export format is correct

## Performance Profiling

### React Profiler

Use React DevTools Profiler to identify slow components:

1. Open React DevTools
2. Go to Profiler tab
3. Click "Record"
4. Perform action (e.g., generate playlist)
5. Stop recording
6. Analyze component render times

### Performance Monitoring

**Key Metrics**:
- **Time to Interactive**: How long until UI is responsive
- **Component Render Time**: Time spent rendering components
- **API Call Duration**: Time for external API calls
- **Database Query Time**: Time for IndexedDB operations

**Optimization Targets**:
- Library scanning: < 1 second per 1000 files
- Playlist generation: < 5 seconds for 50 tracks
- Component render: < 16ms per frame (60 FPS)

### Performance Best Practices

1. **Memoization**: Use `useMemo` for expensive computations
2. **Lazy Loading**: Load data on demand
3. **Batch Operations**: Process data in batches
4. **Virtual Scrolling**: Render only visible items (future enhancement)

## Contributing

### Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug
docs: update documentation
style: formatting changes
refactor: code restructuring
perf: performance improvements
test: add tests
chore: maintenance tasks
```

### Pull Request Process

1. **Description**: Clearly describe what the PR does
2. **Testing**: Describe how you tested the changes
3. **Breaking Changes**: Note any breaking changes
4. **Screenshots**: Include screenshots for UI changes

### Code Review Guidelines

**Reviewers Should Check**:
- Code follows style guidelines
- Types are properly defined
- Error handling is appropriate
- Performance considerations
- Documentation is updated

**Authors Should**:
- Respond to review comments
- Make requested changes
- Keep PRs focused and small
- Update documentation

## Common Tasks

### Adding a New Feature

1. **Create Feature Module**: Add to `src/features/feature-name/`
2. **Add Types**: Define types in `src/types/` or feature module
3. **Create Components**: Add UI components in `src/components/`
4. **Add Hooks**: Extract reusable logic into hooks
5. **Update Documentation**: Document the feature

### Adding a New Export Format

1. **Add Format Function**: Add to `src/features/playlists/export.ts`
2. **Add Format Type**: Add to export type union
3. **Update UI**: Add format option to `PlaylistExport` component
4. **Test**: Verify exported file works in target application

### Adding a New LLM Provider

1. **Add Provider Function**: Add to `src/features/playlists/strategy.ts` or relevant module
2. **Add Provider Type**: Add to `LLMProvider` type
3. **Update UI**: Add provider option to `AgentSelector`
4. **Test**: Verify API integration works

### Modifying Database Schema

1. **Update Schema**: Modify `src/db/schema.ts`
2. **Increment Version**: Update database version number
3. **Add Migration**: Add migration logic in `src/db/migration.ts`
4. **Test**: Verify migration works correctly

## Troubleshooting

### Build Errors

**Type Errors**:
```bash
# Check for type errors
yarn type-check

# Fix common issues
- Add missing type imports
- Fix type mismatches
- Update type definitions
```

**Import Errors**:
```bash
# Check import paths
- Use `@/` alias for src imports
- Verify file paths are correct
- Check for circular dependencies
```

### Runtime Errors

**IndexedDB Errors**:
- Check browser supports IndexedDB
- Verify database migration completed
- Check storage quota
- Clear browser storage if corrupted

**File System Access Errors**:
- Verify browser supports File System Access API
- Check permissions are granted
- Use file input fallback if needed

**LLM API Errors**:
- Verify API key is correct
- Check API rate limits
- Verify network connectivity
- Check API response format

### Development Server Issues

**Port Already in Use**:
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 yarn dev
```

**Module Not Found**:
```bash
# Clear cache and reinstall
rm -rf node_modules .next
yarn install
yarn dev
```

**Hot Reload Not Working**:
- Check file watcher limits (macOS/Linux)
- Restart development server
- Clear `.next` directory

## Additional Resources

- [Architecture Documentation](./ARCHITECTURE.md) - System architecture overview
- [Library Management Documentation](./LIBRARY_MANAGEMENT.md) - Library scanning and metadata
- [Playlist Generation Documentation](./PLAYLIST_GENERATION.md) - Playlist generation pipeline
- [Database Schema Documentation](./DATABASE_SCHEMA.md) - Complete schema reference
- [Next.js Documentation](https://nextjs.org/docs) - Next.js framework docs
- [React Documentation](https://react.dev) - React library docs
- [TypeScript Documentation](https://www.typescriptlang.org/docs) - TypeScript language docs

