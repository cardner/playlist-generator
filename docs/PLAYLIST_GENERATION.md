# Playlist Generation Documentation

This document provides a comprehensive guide to how the AI Playlist Generator creates playlists, including the generation pipeline, strategy system, matching algorithm, ordering, and constraints.

## Table of Contents

- [Overview](#overview)
- [Generation Pipeline](#generation-pipeline)
- [Strategy System](#strategy-system)
- [Matching Algorithm](#matching-algorithm)
- [Scoring System](#scoring-system)
- [Mood and Activity](#mood-and-activity)
- [Track Selection](#track-selection)
- [Ordering and Flow Arc](#ordering-and-flow-arc)
- [Deterministic Validation](#deterministic-validation)
- [Constraints](#constraints)
- [Discovery Mode](#discovery-mode)
- [LLM Integration](#llm-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The playlist generation system combines:

1. **User Request**: Genres, moods, activities, tempo preferences, duration, etc.
2. **LLM Strategy**: AI-generated strategy with scoring weights, constraints, and ordering plan
3. **Deterministic Matching**: Algorithmic track selection based on strategy
4. **Flow Arc Ordering**: Sequencing tracks for optimal listening experience
5. **Discovery Integration**: Optional new music discovery from MusicBrainz

The system is designed to be:
- **Explainable**: Each track has reasons for its selection
- **Deterministic**: Same request = same playlist (unless LLM refinement is used)
- **Flexible**: Supports both simple and complex playlist requirements
- **Extensible**: Easy to add new scoring factors or constraints

## Generation Pipeline

The playlist generation follows these steps:

### 1. User Request Collection

```typescript
interface PlaylistRequest {
  genres: string[];
  mood: string[];
  activity: string[];
  tempo: { bucket?: "slow" | "medium" | "fast"; bpmRange?: { min: number; max: number } };
  length: { value: number; type: "minutes" | "tracks" };
  surprise: number; // 0-1, how much variety/surprise
  suggestedArtists?: string[];
  suggestedAlbums?: string[];
  suggestedTracks?: string[];
  discoveryMode?: boolean;
  // ... more fields
}
```

### 2. Strategy Generation

The LLM generates a strategy based on the request and library summary:

```typescript
interface PlaylistStrategy {
  title: string;
  description: string;
  constraints: {
    minTracks?: number;
    maxTracks?: number;
    minDuration?: number;
    maxDuration?: number;
    requiredGenres?: string[];
    excludedGenres?: string[];
  };
  scoringWeights: {
    genreMatch: number; // 0-1
    tempoMatch: number;
    moodMatch: number;
    activityMatch: number;
    diversity: number;
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
  vibeTags: string[];
  tempoGuidance: { /* ... */ };
  genreMixGuidance: { /* ... */ };
}
```

### 3. Request Normalization

Before matching, mood and activity lists are normalized to canonical categories via `request-normalization`. This maps user input (e.g. "chill", "gym") to categories like "Relaxing" and "Workout" for consistent matching.

### 4. Track Filtering

Filters candidate tracks based on constraints. When mood or activity is requested, tracks with no matching tags may be deprioritized (balanced prefilter) rather than excluded entirely.

```typescript
// Filter by required genres
if (strategy.constraints.requiredGenres) {
  candidates = candidates.filter(track => 
    hasAnyGenre(track, strategy.constraints.requiredGenres)
  );
}

// Filter by excluded genres
if (strategy.constraints.excludedGenres) {
  candidates = candidates.filter(track => 
    !hasAnyGenre(track, strategy.constraints.excludedGenres)
  );
}

// Filter by tempo
if (request.tempo.bucket) {
  candidates = candidates.filter(track => 
    matchesTempoBucket(track, request.tempo.bucket)
  );
}
```

### 5. Track Scoring

Each candidate track is scored using multiple factors:

```typescript
const score = (
  genreMatch * weights.genreMatch +
  tempoMatch * weights.tempoMatch +
  durationFit * weights.durationFit +
  diversity * weights.diversity +
  surprise * weights.surprise
) + suggestionBonus;
```

### 6. Track Selection

Selects top-scoring tracks with optional LLM refinement:

```typescript
// Sort by score (descending)
const sorted = candidates.sort((a, b) => b.score - a.score);

// Apply diversity rules
const selected = [];
for (const track of sorted) {
  if (meetsDiversityRules(track, selected, strategy)) {
    selected.push(track);
    if (selected.length >= targetCount) break;
  }
}

// Optional LLM refinement
if (useLLMRefinement) {
  selected = await refineTrackSelectionWithLLM(selected, request, strategy);
}
```

### 7. Summary Generation

Generates statistics about the playlist:

```typescript
interface PlaylistSummary {
  totalDuration: number; // seconds
  trackCount: number;
  genreMix: Map<string, number>; // genre -> count
  tempoMix: Map<string, number>; // tempo bucket -> count
  artistMix: Map<string, number>; // artist -> count
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
}
```

### 7. Ordering

Orders tracks using flow arc:

```typescript
const ordered = orderTracks(selections, strategy, request, matchingIndex);
// Returns: { tracks: [...], arc: { warmup: 3, build: 5, peak: 4, cooldown: 3 } }
```

### 9. Discovery Integration

If discovery mode is enabled, integrates discovery tracks:

```typescript
if (request.discoveryMode) {
  for (const libraryTrack of ordered.tracks) {
    const discoveryTracks = await findDiscoveryTracks(libraryTrack, request);
    // Insert discovery tracks after library track
  }
}
```

## Strategy System

The strategy system uses LLMs to generate a playlist strategy (not a track list). This approach:

1. **Separates concerns**: LLM generates rules, deterministic engine selects tracks
2. **Ensures explainability**: Each track selection has algorithmic reasons
3. **Maintains determinism**: Same strategy = same playlist (unless LLM refinement is used)
4. **Provides flexibility**: Strategy can be complex while selection remains fast

### Strategy Generation Process

```typescript
import { getStrategy } from '@/features/playlists/strategy';

const strategy = await getStrategy(request, librarySummary, llmConfig);
```

**Process**:
1. Build LLM payload with request and library summary
2. Send prompt to LLM (OpenAI, Gemini, Claude, or local)
3. Parse JSON response and validate against Zod schema
4. Fall back to default strategy if LLM fails

### Strategy Components

**Constraints**: Hard limits (min/max tracks, duration, required/excluded genres)

**Scoring Weights**: How much each factor contributes to final score

**Diversity Rules**: Limits on artist/genre repetition

**Ordering Plan**: Flow arc sections (warmup, build, peak, cooldown)

**Vibe Tags**: Descriptive tags for playlist character

**Tempo Guidance**: Target tempo bucket and BPM range

**Genre Mix Guidance**: Primary/secondary genre ratios

## Matching Algorithm

The matching algorithm is deterministic and explainable:

### Algorithm Overview

```typescript
function generatePlaylist(request, strategy, matchingIndex) {
  // 1. Filter candidates
  let candidates = filterTracks(request, strategy, matchingIndex);
  
  // 2. Score all candidates
  const scored = candidates.map(track => 
    scoreTrack(track, request, strategy, matchingIndex, selected, ...)
  );
  
  // 3. Sort by score
  scored.sort((a, b) => b.score - a.score);
  
  // 4. Select top tracks with diversity rules
  const selected = [];
  for (const track of scored) {
    if (meetsDiversityRules(track, selected, strategy)) {
      selected.push(track);
      if (selected.length >= targetCount) break;
    }
  }
  
  // 5. Optional LLM refinement
  if (useLLMRefinement) {
    return refineTrackSelectionWithLLM(selected, request, strategy);
  }
  
  return selected;
}
```

### Determinism

The algorithm is deterministic when:
- Same request parameters
- Same library state
- Same strategy
- No LLM refinement

To ensure determinism:
- Uses seeded random number generator for surprise factor
- Sorts tracks consistently (by score, then by trackFileId)
- Applies diversity rules in order

## Scoring System

Tracks are scored using multiple factors. The built-in agent uses deterministic scoring; the LLM agent can optionally refine scores.

### Mood Match (0-1)

Tracks are scored by comparing their mood tags (or tempo-inferred moods when tags are missing) against requested moods. Uses `mood-mapping` for canonical categories. Unknown mood yields a neutral 0.5.

### Activity Match (0-1)

Tracks are scored by comparing their activity tags (or inferred activities from BPM/genres when tags are missing) against requested activities. Uses `activity-mapping` and `activity-inference` for canonical categories. Unknown activity yields a neutral 0.5.

### Genre Match (0-1)

```typescript
function calculateGenreMatch(track, requestedGenres, strategy, index) {
  // Hard match: exact normalized genre match
  const exactMatches = findExactGenreMatches(track, requestedGenres);
  if (exactMatches.length > 0) {
    return exactMatches.length / requestedGenres.length;
  }
  
  // Soft match: partial/substring match
  const partialMatches = findPartialGenreMatches(track, requestedGenres);
  if (partialMatches.length > 0) {
    return (partialMatches.length / requestedGenres.length) * 0.7;
  }
  
  return 0;
}
```

**Scoring**:
- Exact match: 1.0 per matched genre
- Partial match: 0.7 per matched genre
- Penalty for missing required genres: -0.5 per missing genre

### Tempo Match (0-1)

```typescript
function calculateTempoMatch(track, request, strategy, index) {
  const trackBPM = getTrackBPM(track, index);
  
  if (request.tempo.bucket) {
    const trackBucket = getTempoBucket(trackBPM);
    return trackBucket === request.tempo.bucket ? 1.0 : 0.0;
  }
  
  if (request.tempo.bpmRange) {
    if (trackBPM >= request.tempo.bpmRange.min && 
        trackBPM <= request.tempo.bpmRange.max) {
      return 1.0;
    }
    // Distance penalty
    const distance = Math.min(
      Math.abs(trackBPM - request.tempo.bpmRange.min),
      Math.abs(trackBPM - request.tempo.bpmRange.max)
    );
    return Math.max(0, 1 - (distance / 20)); // 20 BPM tolerance
  }
  
  return 1.0; // No tempo requirement
}
```

### Duration Fit (0-1)

```typescript
function calculateDurationFit(track, targetDuration, currentDuration, remainingSlots) {
  const trackDuration = track.tech?.durationSeconds || 0;
  const idealDuration = (targetDuration - currentDuration) / remainingSlots;
  
  if (trackDuration === 0) return 0.5; // Unknown duration
  
  const ratio = trackDuration / idealDuration;
  
  if (ratio >= 0.8 && ratio <= 1.2) {
    return 1.0; // Perfect fit
  }
  
  // Penalty for being too short or too long
  if (ratio < 0.8) {
    return ratio / 0.8; // Linear penalty
  }
  
  return Math.max(0, 1 - (ratio - 1.2) * 0.5); // Exponential penalty
}
```

### Diversity (0-1)

Diversity scoring includes penalties for repeated artists, genres, moods, and activities. Light penalties (0.9x) apply when mood or activity tags repeat in the last few tracks.

```typescript
function calculateDiversity(track, previousTracks, strategy) {
  let score = 1.0;
  
  // Penalty for same artist
  const sameArtistCount = previousTracks.filter(
    t => t.tags.artist === track.tags.artist
  ).length;
  if (sameArtistCount > 0) {
    score *= 0.3; // Heavy penalty
  }
  
  // Penalty for same album
  const sameAlbumCount = previousTracks.filter(
    t => t.tags.album === track.tags.album
  ).length;
  if (sameAlbumCount > 0) {
    score *= 0.6; // Moderate penalty
  }
  
  return score;
}
```

### Surprise (0-1)

```typescript
function calculateSurprise(track, requestedGenres, previousTracks, index, surpriseLevel) {
  if (surpriseLevel === 0) return 1.0; // No surprise requirement
  
  // Check if track is unexpected
  const isUnexpected = !hasRequestedGenres(track, requestedGenres);
  const isRare = isRareTrack(track, index);
  
  if (isUnexpected || isRare) {
    return surpriseLevel; // Bonus for unexpected tracks
  }
  
  return 1.0 - (surpriseLevel * 0.3); // Slight penalty for expected tracks
}
```

### Affinity Bonus

Tracks from suggested artists, albums, or similar genres receive an affinity bonus (up to 0.15). This encourages playlists that include related artists when the user suggests specific artists or tracks.

## Mood and Activity

Mood and activity are first-class criteria for playlist matching:

- **Request normalization**: User input (e.g. "chill", "gym") is normalized to canonical categories via `request-normalization` before matching.
- **Track tags**: Tracks can have `enhancedMetadata.mood` and `enhancedMetadata.activity` arrays. These are inferred during metadata enhancement (from BPM and genres) or set manually.
- **Fallback inference**: When a track has no activity tags, `activity-inference` infers from BPM (tempo bucket) and genres (e.g. ambient → relaxing, edm → party).
- **Mood fallback**: When a track has no mood tags, tempo bucket maps to default moods (e.g. slow → calm, fast → energetic).
- **Scoring**: Both mood and activity contribute to the final score. Unknown tags yield a neutral 0.5.
- **Ordering**: Transition scoring considers mood and activity continuity for smoother flow.

### Final Score

```typescript
const finalScore = (
  genreMatch * weights.genreMatch +
  tempoMatch * weights.tempoMatch +
  moodMatch * weights.moodMatch +
  activityMatch * weights.activityMatch +
  durationFit * weights.durationFit +
  diversity * weights.diversity +
  surprise * weights.surprise
) + suggestionBonus + affinityBonus;
```

## Track Selection

### Selection Process

1. **Score all candidates**: Calculate score for each track
2. **Sort by score**: Order tracks by final score (descending)
3. **Apply diversity rules**: Filter tracks that violate diversity rules
4. **Select top tracks**: Take top N tracks that meet all criteria
5. **Optional LLM refinement**: Use LLM to refine selection if enabled

### Diversity Rules

```typescript
function meetsDiversityRules(track, selected, strategy) {
  const rules = strategy.diversityRules;
  
  // Check artist limit
  const artistCount = selected.filter(
    t => t.track.tags.artist === track.tags.artist
  ).length;
  if (artistCount >= rules.maxTracksPerArtist) {
    return false;
  }
  
  // Check artist spacing
  const recentSameArtist = selected.slice(-rules.artistSpacing).some(
    t => t.track.tags.artist === track.tags.artist
  );
  if (recentSameArtist) {
    return false;
  }
  
  // Check genre limit (if specified)
  if (rules.maxTracksPerGenre) {
    const genreCount = selected.filter(
      t => hasSharedGenre(t.track, track)
    ).length;
    if (genreCount >= rules.maxTracksPerGenre) {
      return false;
    }
  }
  
  // Check genre spacing
  const recentSameGenre = selected.slice(-rules.genreSpacing).some(
    t => hasSharedGenre(t.track, track)
  );
  if (recentSameGenre) {
    return false;
  }
  
  return true;
}
```

### LLM Refinement

Optional step that uses LLM to refine track selection:

```typescript
async function refineTrackSelectionWithLLM(
  selected: TrackSelection[],
  request: PlaylistRequest,
  strategy: PlaylistStrategy
): Promise<TrackSelection[]> {
  // Build prompt with selected tracks and request
  const prompt = buildRefinementPrompt(selected, request, strategy);
  
  // Call LLM
  const response = await callLLM(prompt, llmConfig);
  
  // Parse response (JSON with trackFileIds and scores)
  const refined = parseLLMResponse(response);
  
  // Update scores based on LLM feedback
  return updateScores(selected, refined);
}
```

## Ordering and Flow Arc

Tracks are ordered using a flow arc concept:

### Flow Arc Sections

1. **Warmup** (0-20%): Slow tempo, familiar tracks, sets the mood
2. **Build** (20-60%): Gradually increasing tempo and energy
3. **Peak** (60-80%): Highest energy, fastest tempo, most exciting tracks
4. **Cooldown** (80-100%): Gradually decreasing tempo, calming tracks

### Transition Scoring

Tracks are scored for how well they transition from the previous track. The scoring considers:

- **Artist/album**: Heavy penalty for same artist back-to-back; moderate penalty for same album
- **Genre**: Light bonus for genre continuity, slight penalty for genre change
- **Mood**: Bonus for mood continuity, slight penalty for mood shift (when tags available)
- **Activity**: Bonus for activity continuity, slight penalty for activity shift (when tags available)
- **Tempo**: Bonus for adjacent tempo transitions (e.g. slow→medium), penalty for jumps
- **Year**: Slight bonus for similar era, slight penalty for large era jumps

```typescript
function calculateTransitionScore(current, previous, index) {
  let score = 1.0;
  
  // Penalty for same artist back-to-back
  if (current.tags.artist === previous.tags.artist) {
    score *= 0.2; // Heavy penalty
  }
  
  // Penalty for same album back-to-back
  if (current.tags.album === previous.tags.album) {
    score *= 0.5; // Moderate penalty
  }
  
  // Bonus for genre continuity
  if (hasSharedGenre(current, previous)) {
    score *= 1.1; // Light bonus
  }
  
  // Mood/activity continuity (when tags available)
  if (hasMoodOverlap(current, previous)) score *= 1.05;
  else score *= 0.95;
  if (hasActivityOverlap(current, previous)) score *= 1.05;
  else score *= 0.95;
  
  // Tempo progression bonus
  const tempoProgression = calculateTempoProgression(current, previous);
  score *= tempoProgression;
  
  return score;
}
```

### Ordering Algorithm

```typescript
function orderTracks(selections, strategy, request, index) {
  // 1. Assign tracks to flow arc sections
  const sections = assignToSections(selections, strategy.orderingPlan);
  
  // 2. Order tracks within each section
  const orderedSections = sections.map(section => 
    orderSection(section, index)
  );
  
  // 3. Optimize transitions between sections
  const optimized = optimizeTransitions(orderedSections, index);
  
  return {
    tracks: optimized,
    arc: calculateArcDistribution(optimized)
  };
}
```

## Constraints

Constraints are hard limits that must be satisfied:

### Genre Constraints

```typescript
// Required genres: Track must have at least one
if (strategy.constraints.requiredGenres) {
  candidates = candidates.filter(track =>
    hasAnyGenre(track, strategy.constraints.requiredGenres)
  );
}

// Excluded genres: Track must not have any
if (strategy.constraints.excludedGenres) {
  candidates = candidates.filter(track =>
    !hasAnyGenre(track, strategy.constraints.excludedGenres)
  );
}
```

### Duration Constraints

```typescript
// Min duration: Playlist must be at least X seconds
if (strategy.constraints.minDuration) {
  while (totalDuration < strategy.constraints.minDuration && candidates.length > 0) {
    // Add more tracks
  }
}

// Max duration: Playlist must not exceed X seconds
if (strategy.constraints.maxDuration) {
  while (totalDuration > strategy.constraints.maxDuration) {
    // Remove longest track
  }
}
```

### Track Count Constraints

```typescript
// Min tracks: Must have at least X tracks
if (strategy.constraints.minTracks) {
  while (selected.length < strategy.constraints.minTracks && candidates.length > 0) {
    // Add more tracks (relax diversity rules if needed)
  }
}

// Max tracks: Must not exceed X tracks
if (strategy.constraints.maxTracks) {
  selected = selected.slice(0, strategy.constraints.maxTracks);
}
```

## Discovery Mode

Discovery mode integrates new music from MusicBrainz:

### Discovery Process

1. **For each library track**: Find similar tracks in MusicBrainz
2. **Filter discovered tracks**: Remove tracks already in library
3. **Select best matches**: Score discovered tracks by similarity
4. **Insert after library track**: Place discovery tracks after inspiring track
5. **Generate explanation**: Create explanation for why track was suggested

### Discovery Track Integration

```typescript
if (request.discoveryMode) {
  for (const libraryTrack of ordered.tracks) {
    const discoveryTracks = await findDiscoveryTracks(
      libraryTrack,
      request,
      musicbrainzConfig
    );
    
    // Insert discovery tracks after library track
    playlist.discoveryTracks.push({
      position: libraryTrack.position + 1,
      discoveryTrack: discoveryTracks[0],
      inspiringTrackId: libraryTrack.trackFileId,
      section: libraryTrack.section
    });
  }
}
```

## Deterministic Validation

When LLM validation is disabled or fails, the app uses `validatePlaylistDeterministic`. It computes scores from genre, tempo, mood, activity, length, and diversity matches. It also adds issues and suggestions when many tracks lack mood or activity tags, recommending metadata enhancement for better matching.

## LLM Integration

LLMs are used in three places:

### 1. Strategy Generation

Generates playlist strategy based on request and library summary.

**Providers**: OpenAI, Google Gemini, Anthropic Claude, Local LLM

**Input**: Request + Library Summary

**Output**: PlaylistStrategy JSON

### 2. Track Refinement (Optional)

Refines track selection scores based on semantic understanding.

**When**: Only if `request.agentType === "llm"` and LLM config provided

**Input**: Selected tracks + Request + Strategy

**Output**: Refined scores for tracks

### 3. Tempo Detection (Optional)

Detects BPM for tracks missing tempo information.

**When**: Only if LLM is enabled and tracks are missing BPM

**Input**: Batch of tracks (title, artist, album)

**Output**: BPM values for tracks

## Best Practices

### 1. Request Design

- **Be specific**: More specific requests yield better results
- **Balance constraints**: Too many constraints may result in no matches
- **Use suggestions**: Suggested artists/albums/tracks get bonus scores
- **Set surprise level**: Higher surprise = more variety (but less match)

### 2. Strategy Tuning

- **Adjust weights**: Modify scoring weights to emphasize different factors
- **Set diversity rules**: Prevent too much repetition
- **Define flow arc**: Plan sections for better listening experience

### 3. Performance

- **Limit library size**: Very large libraries (>10k tracks) may be slow
- **Use tempo detection**: Pre-detect tempo for better matching
- **Cache strategies**: Reuse strategies for similar requests

### 4. Discovery Mode

- **Use sparingly**: Discovery tracks add to playlist length
- **Check MusicBrainz**: Ensure MusicBrainz is configured and accessible
- **Review explanations**: Check why tracks were suggested

## Troubleshooting

### No Tracks Selected

**Symptoms**: Playlist generation completes but has 0 tracks

**Solutions**:
1. Check constraints are not too restrictive
2. Verify library has tracks matching requested genres
3. Check tempo requirements match available tracks
4. Review diversity rules (may be filtering all tracks)

### Playlist Too Short/Long

**Symptoms**: Playlist duration doesn't match request

**Solutions**:
1. Check duration constraints in strategy
2. Verify track durations are accurate
3. Adjust min/max duration constraints
4. Check if discovery tracks are affecting duration

### Poor Track Quality

**Symptoms**: Selected tracks don't match request well

**Solutions**:
1. Review scoring weights (may need adjustment)
2. Check genre normalization (may be mismatching)
3. Verify tempo detection is working
4. Try LLM refinement for better semantic matching

### Slow Generation

**Symptoms**: Playlist generation takes too long

**Solutions**:
1. Reduce library size (filter by collection)
2. Disable LLM refinement (if enabled)
3. Pre-detect tempo to avoid runtime detection
4. Check database indexes are present

### Discovery Tracks Not Appearing

**Symptoms**: Discovery mode enabled but no discovery tracks

**Solutions**:
1. Verify MusicBrainz is configured and accessible
2. Check library tracks have good metadata (artist, title)
3. Review MusicBrainz API rate limits
4. Check discovery track filtering (may be filtering all matches)

## Additional Resources

- [Library Management Documentation](./LIBRARY_MANAGEMENT.md) - How library scanning and metadata work
- [Database Schema Documentation](./DATABASE_SCHEMA.md) - IndexedDB structure
- [Playlist Feature Modules](../src/features/playlists/) - Source code for playlist generation

