/**
 * Discovery engine for finding similar tracks from MusicBrainz
 * 
 * Scores and selects discovery tracks based on library tracks and playlist requirements
 */

import type { TrackRecord } from '@/db/schema';
import type { PlaylistRequest } from '@/types/playlist';
import type { PlaylistStrategy } from '@/features/playlists/strategy';
import type { DiscoveryTrack, FindDiscoveryTracksParams } from './types';
import { findSimilarRecordings, findRecordingsByGenre, findRelatedArtists } from './musicbrainz-client';
import type { MusicBrainzRecordingResult } from './musicbrainz-types';

/**
 * Scoring weights for discovery track selection
 */
const SCORING_WEIGHTS = {
  genreSimilarity: 0.3,
  artistRelationship: 0.25,
  tempoEnergyMatch: 0.2,
  releaseDateRelevance: 0.15,
  userPreferencesAlignment: 0.1,
};

/**
 * Find discovery tracks based on user selections (genres, albums, tracks)
 * 
 * @param params Parameters for finding discovery tracks
 * @returns Array of discovery tracks sorted by relevance score
 */
export async function findDiscoveryTracks(
  params: FindDiscoveryTracksParams
): Promise<DiscoveryTrack[]> {
  const { libraryTrack, userLibrary, request, strategy, excludeMbids = [] } = params;

  // Collect all recordings from multiple sources
  const allRecordings: MusicBrainzRecordingResult[] = [];
  
  // 1. Search by selected genres if available
  if (request.genres && request.genres.length > 0) {
    for (const genre of request.genres.slice(0, 3)) { // Limit to top 3 genres
      const genreRecordings = await findRecordingsByGenre(genre, 10);
      allRecordings.push(...genreRecordings);
    }
  }
  
  // 2. Search by selected artists if available
  if (request.suggestedArtists && request.suggestedArtists.length > 0) {
    const { searchByArtistAndTitle } = await import('./musicbrainz-client');
    for (const artist of request.suggestedArtists.slice(0, 3)) { // Limit to top 3 artists
      const artistRecordings = await searchByArtistAndTitle({ artist, limit: 10 });
      allRecordings.push(...artistRecordings);
      
      // Also find related artists and their recordings
      const relatedArtists = await findRelatedArtists(artist, 5);
      for (const relatedArtist of relatedArtists.slice(0, 2)) {
        const relatedRecordings = await searchByArtistAndTitle({ artist: relatedArtist, limit: 5 });
        allRecordings.push(...relatedRecordings);
      }
    }
  }
  
  // 3. Search by library track (artist + title) - primary method
  const similarRecordings = await findSimilarRecordings({
    artist: libraryTrack.tags.artist || '',
    title: libraryTrack.tags.title || '',
    genres: libraryTrack.tags.genres.length > 0 ? libraryTrack.tags.genres : request.genres,
    limit: 20,
  });
  allRecordings.push(...similarRecordings);

  // 4. If selected albums exist, search for tracks from those albums first
  // Then find similar tracks to those
  if (request.suggestedAlbums && request.suggestedAlbums.length > 0) {
    // Find tracks from selected albums in user's library
    const selectedAlbumTracks = userLibrary.filter(t => 
      request.suggestedAlbums!.some(album => 
        t.tags.album?.toLowerCase().includes(album.toLowerCase())
      )
    );
    
    // For each album track, find similar recordings
    for (const albumTrack of selectedAlbumTracks.slice(0, 2)) {
      const albumSimilar = await findSimilarRecordings({
        artist: albumTrack.tags.artist || '',
        title: albumTrack.tags.title || '',
        genres: albumTrack.tags.genres,
        limit: 5,
      });
      allRecordings.push(...albumSimilar);
    }
  }

  // 5. If selected tracks exist, find similar to those
  if (request.suggestedTracks && request.suggestedTracks.length > 0) {
    const selectedTracks = userLibrary.filter(t =>
      request.suggestedTracks!.some(st =>
        t.tags.title?.toLowerCase().includes(st.toLowerCase())
      )
    );
    
    for (const selectedTrack of selectedTracks.slice(0, 2)) {
      const trackSimilar = await findSimilarRecordings({
        artist: selectedTrack.tags.artist || '',
        title: selectedTrack.tags.title || '',
        genres: selectedTrack.tags.genres,
        limit: 5,
      });
      allRecordings.push(...trackSimilar);
    }
  }

  // Deduplicate by MBID
  const uniqueRecordings = new Map<string, MusicBrainzRecordingResult>();
  for (const rec of allRecordings) {
    if (!uniqueRecordings.has(rec.mbid)) {
      uniqueRecordings.set(rec.mbid, rec);
    }
  }

  const recordings = Array.from(uniqueRecordings.values());

  if (recordings.length === 0) {
    return [];
  }

  // Filter out tracks already in user's library
  const userLibraryMbids = new Set<string>();
  const userLibraryArtists = new Set(
    userLibrary.map(t => t.tags.artist?.toLowerCase().trim()).filter(Boolean) as string[]
  );
  const userLibraryTitles = new Set(
    userLibrary.map(t => t.tags.title?.toLowerCase().trim()).filter(Boolean) as string[]
  );

  // Filter and score candidates
  const candidates: DiscoveryTrack[] = [];

  for (const recording of recordings) {
    // Skip if excluded
    if (excludeMbids.includes(recording.mbid)) {
      continue;
    }

    // Skip if already in library (check by artist + title)
    const recordingArtist = recording.artist.toLowerCase().trim();
    const recordingTitle = recording.title.toLowerCase().trim();
    
    if (
      userLibraryArtists.has(recordingArtist) &&
      userLibraryTitles.has(recordingTitle)
    ) {
      continue;
    }

    // Score the candidate
    const score = scoreDiscoveryTrack(recording, libraryTrack, request, strategy);

    candidates.push({
      mbid: recording.mbid,
      title: recording.title,
      artist: recording.artist,
      album: recording.album,
      genres: recording.genres,
      duration: recording.duration,
      releaseDate: recording.releaseDate,
      releaseYear: recording.releaseYear,
      score,
      inspiringTrackId: libraryTrack.trackFileId,
      tags: recording.tags,
      relationships: recording.relationships,
    });
  }

  // Sort by score (highest first) and return top candidates
  candidates.sort((a, b) => b.score - a.score);
  
  // Return top 3-5 candidates
  const topCount = Math.min(5, Math.max(3, candidates.length));
  return candidates.slice(0, topCount);
}

/**
 * Score a discovery track candidate
 * 
 * @param recording MusicBrainz recording result
 * @param libraryTrack The library track that inspired this discovery
 * @param request Playlist request
 * @param strategy Playlist strategy
 * @returns Score from 0 to 1
 */
function scoreDiscoveryTrack(
  recording: MusicBrainzRecordingResult,
  libraryTrack: TrackRecord,
  request: PlaylistRequest,
  strategy: PlaylistStrategy
): number {
  let score = 0;

  // 1. Genre similarity (weight: 0.3)
  const genreScore = calculateGenreSimilarity(
    recording.genres,
    libraryTrack.tags.genres,
    request.genres
  );
  score += genreScore * SCORING_WEIGHTS.genreSimilarity;

  // 2. Artist relationship (weight: 0.25)
  const artistScore = calculateArtistRelationship(
    recording.artist,
    recording.artists,
    libraryTrack.tags.artist || '',
    recording.relationships
  );
  score += artistScore * SCORING_WEIGHTS.artistRelationship;

  // 3. Tempo/energy match (weight: 0.2)
  // Note: MusicBrainz doesn't have tempo data, so we use genre-based heuristics
  const tempoScore = calculateTempoEnergyMatch(
    recording.genres,
    request.tempo,
    strategy
  );
  score += tempoScore * SCORING_WEIGHTS.tempoEnergyMatch;

  // 4. Release date relevance (weight: 0.15)
  const dateScore = calculateReleaseDateRelevance(recording.releaseYear);
  score += dateScore * SCORING_WEIGHTS.releaseDateRelevance;

  // 5. User preferences alignment (weight: 0.1)
  const preferencesScore = calculateUserPreferencesAlignment(
    recording,
    request,
    strategy
  );
  score += preferencesScore * SCORING_WEIGHTS.userPreferencesAlignment;

  return Math.min(1, Math.max(0, score));
}

/**
 * Calculate genre similarity score
 */
function calculateGenreSimilarity(
  recordingGenres: string[],
  libraryTrackGenres: string[],
  requestedGenres: string[]
): number {
  if (recordingGenres.length === 0) {
    return 0.5; // Neutral if no genres
  }

  const recordingGenresLower = recordingGenres.map(g => g.toLowerCase());
  const libraryGenresLower = libraryTrackGenres.map(g => g.toLowerCase());
  const requestedGenresLower = requestedGenres.map(g => g.toLowerCase());

  // Check for exact matches
  const exactMatches = recordingGenresLower.filter(g =>
    libraryGenresLower.includes(g) || requestedGenresLower.includes(g)
  );

  if (exactMatches.length > 0) {
    return Math.min(1, 0.7 + (exactMatches.length * 0.1)); // 0.7-1.0 for matches
  }

  // Check for partial matches (substring)
  const partialMatches = recordingGenresLower.filter(g =>
    libraryGenresLower.some(lg => lg.includes(g) || g.includes(lg)) ||
    requestedGenresLower.some(rg => rg.includes(g) || g.includes(rg))
  );

  if (partialMatches.length > 0) {
    return 0.5 + (partialMatches.length * 0.1); // 0.5-0.7 for partial matches
  }

  return 0.3; // Low score for no matches
}

/**
 * Calculate artist relationship score
 */
function calculateArtistRelationship(
  recordingArtist: string,
  recordingArtists: string[],
  libraryArtist: string,
  relationships?: Array<{ type: string; target: string; targetType: string }>
): number {
  const recordingArtistLower = recordingArtist.toLowerCase().trim();
  const libraryArtistLower = libraryArtist.toLowerCase().trim();

  // Exact match (shouldn't happen if filtering works, but check anyway)
  if (recordingArtistLower === libraryArtistLower) {
    return 1.0;
  }

  // Check if artist appears in recording's artist list
  const allArtists = [recordingArtist, ...recordingArtists].map(a => a.toLowerCase().trim());
  if (allArtists.includes(libraryArtistLower)) {
    return 0.9;
  }

  // Check relationships (collaborations, etc.)
  if (relationships) {
    const hasRelationship = relationships.some(rel =>
      rel.targetType === 'artist' &&
      rel.target.toLowerCase().trim() === libraryArtistLower
    );
    if (hasRelationship) {
      return 0.8;
    }
  }

  // Partial name match (e.g., "The Beatles" vs "Beatles")
  if (
    recordingArtistLower.includes(libraryArtistLower) ||
    libraryArtistLower.includes(recordingArtistLower)
  ) {
    return 0.6;
  }

  return 0.4; // Base score for different artist
}

/**
 * Calculate tempo/energy match score
 * 
 * Uses genre-based heuristics since MusicBrainz doesn't have tempo data
 */
function calculateTempoEnergyMatch(
  genres: string[],
  tempoSpec: PlaylistRequest['tempo'],
  strategy: PlaylistStrategy
): number {
  // Map genres to typical tempo ranges (heuristic)
  const fastGenres = ['electronic', 'dance', 'techno', 'house', 'trance', 'drum and bass', 'hardcore'];
  const slowGenres = ['ambient', 'downtempo', 'chillout', 'lounge', 'ballad', 'acoustic'];
  const mediumGenres = ['pop', 'rock', 'indie', 'alternative', 'folk', 'country'];

  const genresLower = genres.map(g => g.toLowerCase());

  let tempoMatch = 0.5; // Default neutral

  if (tempoSpec.bucket) {
    if (tempoSpec.bucket === 'fast') {
      const hasFastGenre = genresLower.some(g => fastGenres.some(fg => g.includes(fg)));
      tempoMatch = hasFastGenre ? 0.9 : 0.5;
    } else if (tempoSpec.bucket === 'slow') {
      const hasSlowGenre = genresLower.some(g => slowGenres.some(sg => g.includes(sg)));
      tempoMatch = hasSlowGenre ? 0.9 : 0.5;
    } else {
      // Medium tempo - check for medium genres or mix
      const hasMediumGenre = genresLower.some(g => mediumGenres.some(mg => g.includes(mg)));
      tempoMatch = hasMediumGenre ? 0.8 : 0.6;
    }
  }

  // Check strategy tempo guidance
  if (strategy.tempoGuidance.targetBucket) {
    const strategyMatch = tempoSpec.bucket === strategy.tempoGuidance.targetBucket ? 0.9 : 0.6;
    tempoMatch = Math.max(tempoMatch, strategyMatch);
  }

  return tempoMatch;
}

/**
 * Calculate release date relevance score
 * 
 * Prefers recent releases but doesn't penalize older ones too much
 */
function calculateReleaseDateRelevance(releaseYear?: number): number {
  if (!releaseYear) {
    return 0.5; // Neutral if unknown
  }

  const currentYear = new Date().getFullYear();
  const age = currentYear - releaseYear;

  // Prefer releases from last 10 years, but don't heavily penalize older ones
  if (age <= 10) {
    return 1.0;
  } else if (age <= 20) {
    return 0.8;
  } else if (age <= 30) {
    return 0.7;
  } else {
    return 0.6; // Still reasonable for older music
  }
}

/**
 * Calculate user preferences alignment score
 */
function calculateUserPreferencesAlignment(
  recording: MusicBrainzRecordingResult,
  request: PlaylistRequest,
  strategy: PlaylistStrategy
): number {
  let score = 0.5; // Base score

  // Check if genres match requested genres
  if (request.genres.length > 0) {
    const recordingGenresLower = recording.genres.map(g => g.toLowerCase());
    const requestedGenresLower = request.genres.map(g => g.toLowerCase());
    const hasRequestedGenre = recordingGenresLower.some(g =>
      requestedGenresLower.some(rg => g.includes(rg) || rg.includes(g))
    );
    if (hasRequestedGenre) {
      score += 0.3;
    }
  }

  // Check strategy genre mix guidance
  if (strategy.genreMixGuidance?.primaryGenres) {
    const recordingGenresLower = recording.genres.map(g => g.toLowerCase());
    const primaryGenresLower = strategy.genreMixGuidance.primaryGenres.map(g => g.toLowerCase());
    const hasPrimaryGenre = recordingGenresLower.some(g =>
      primaryGenresLower.some(pg => g.includes(pg) || pg.includes(g))
    );
    if (hasPrimaryGenre) {
      score += 0.2;
    }
  }

  return Math.min(1, score);
}

