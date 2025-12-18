/**
 * Genre normalization and mapping
 * 
 * Normalizes genre names to canonical forms while preserving subgenres.
 * Uses a mapping layer approach to preserve original genres in the database.
 */

/**
 * Genre with statistics
 */
export interface GenreWithStats {
  normalized: string;
  original: string[];
  trackCount: number;
}

/**
 * Split a genre string that may contain multiple genres separated by commas
 */
function splitGenreString(genre: string): string[] {
  if (!genre || !genre.trim()) {
    return [];
  }

  // Split by comma, but be smart about it
  // Handle cases like "Rock, Pop" or "Rock,Pop" or "Rock, Pop, Electronic"
  const parts = genre
    .split(/,/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.length > 0 ? parts : [genre.trim()];
}

/**
 * Normalize special characters in genre names
 */
function normalizeSpecialCharacters(genre: string): string {
  let normalized = genre;

  // Normalize different types of dashes and hyphens
  normalized = normalized.replace(/[-–—―]/g, "-");

  // Normalize ampersand variations
  normalized = normalized.replace(/&amp;|&amp|&/g, "&");

  // Normalize slashes (convert to space for compound genres)
  normalized = normalized.replace(/\//g, " ");

  // Normalize multiple spaces
  normalized = normalized.replace(/\s+/g, " ");

  // Trim
  normalized = normalized.trim();

  return normalized;
}

/**
 * Normalize capitalization for a genre
 */
function normalizeCapitalization(genre: string): string {
  // Handle special cases that should stay uppercase or have specific formatting
  const specialCases: Record<string, string> = {
    "r&b": "R&B",
    "rnb": "R&B",
    "r and b": "R&B",
    "r & b": "R&B",
    "edm": "EDM",
    "idm": "IDM",
    "dnb": "DnB",
    "drum and bass": "Drum & Bass",
    "uk garage": "UK Garage",
    "uk": "UK",
    "usa": "USA",
  };

  const lower = genre.toLowerCase();
  if (specialCases[lower]) {
    return specialCases[lower];
  }

  // Split into tokens (words, hyphens, ampersands, spaces)
  const tokens: Array<{ type: "word" | "separator"; value: string }> = [];
  let currentWord = "";
  
  for (let i = 0; i < genre.length; i++) {
    const char = genre[i];
    if (char === "-" || char === "&") {
      if (currentWord) {
        tokens.push({ type: "word", value: currentWord });
        currentWord = "";
      }
      tokens.push({ type: "separator", value: char });
    } else if (/\s/.test(char)) {
      if (currentWord) {
        tokens.push({ type: "word", value: currentWord });
        currentWord = "";
      }
      // Skip spaces, we'll add them back
    } else {
      currentWord += char;
    }
  }
  if (currentWord) {
    tokens.push({ type: "word", value: currentWord });
  }

  // Process words for capitalization
  const result: string[] = [];
  
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const prevToken = index > 0 ? tokens[index - 1] : null;
    const nextToken = index < tokens.length - 1 ? tokens[index + 1] : null;
    
    if (token.type === "separator") {
      if (token.value === "&") {
        result.push(" & ");
      } else if (token.value === "-") {
        result.push("-");
      }
      continue;
    }

    const word = token.value;
    const isAfterSeparator = prevToken?.type === "separator";
    const isFirstWord = index === 0 || (prevToken && prevToken.type === "separator");
    const needsSpace = index > 0 && prevToken?.type === "word";

    // Preserve acronyms (all caps, 2+ chars, no lowercase)
    if (word.length >= 2 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) {
      if (needsSpace) result.push(" ");
      result.push(word);
      continue;
    }

    // Handle "and" - convert to & if between words
    if (word.toLowerCase() === "and" && !isFirstWord && nextToken) {
      if (needsSpace) result.push(" ");
      result.push("&");
      continue;
    }

    // First word or word after separator always capitalized
    if (isFirstWord || isAfterSeparator) {
      if (needsSpace && !isAfterSeparator) result.push(" ");
      result.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
      continue;
    }

    // Small words stay lowercase (unless after separator)
    const smallWords = ["a", "an", "as", "at", "but", "by", "for", "if", "in", "of", "on", "or", "the", "to", "up"];
    if (smallWords.includes(word.toLowerCase())) {
      if (needsSpace) result.push(" ");
      result.push(word.toLowerCase());
      continue;
    }

    // Capitalize other words
    if (needsSpace) result.push(" ");
    result.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }

  return result.join("").replace(/\s+/g, " ").trim();
}

/**
 * Normalize a single genre to its canonical form
 */
export function normalizeGenre(genre: string): string {
  if (!genre || !genre.trim()) {
    return "";
  }

  let normalized = genre.trim();

  // Remove common suffixes/prefixes
  normalized = normalized.replace(/\s+(Music|Genre|Style)$/i, "");
  normalized = normalized.replace(/^(The\s+)?Music\s+/i, "");

  // Normalize special characters
  normalized = normalizeSpecialCharacters(normalized);

  // Common genre variations mapping (after special char normalization)
  const variations: Record<string, string> = {
    "hip-hop": "Hip Hop",
    "hip hop": "Hip Hop",
    "hiphop": "Hip Hop",
    "rock n roll": "Rock & Roll",
    "rock and roll": "Rock & Roll",
    "rock'n'roll": "Rock & Roll",
    "pop rock": "Pop Rock",
    "pop-rock": "Pop Rock",
    "dance electronic": "Dance Electronic",
    "dance-electronic": "Dance Electronic",
    "folk rock": "Folk Rock",
    "folk-rock": "Folk Rock",
    "country folk": "Country Folk",
    "country-folk": "Country Folk",
    "alternative rock": "Alternative Rock",
    "alt rock": "Alternative Rock",
    "alt-rock": "Alternative Rock",
    "heavy metal": "Heavy Metal",
    "death metal": "Death Metal",
    "black metal": "Black Metal",
    "power metal": "Power Metal",
    "progressive rock": "Progressive Rock",
    "prog rock": "Progressive Rock",
    "prog-rock": "Progressive Rock",
    "indie rock": "Indie Rock",
    "indie-rock": "Indie Rock",
    "punk rock": "Punk Rock",
    "punk-rock": "Punk Rock",
    "classic rock": "Classic Rock",
    "soft rock": "Soft Rock",
    "hard rock": "Hard Rock",
    "jazz fusion": "Jazz Fusion",
    "smooth jazz": "Smooth Jazz",
    "acid jazz": "Acid Jazz",
    "trip hop": "Trip Hop",
    "trip-hop": "Trip Hop",
    "drum and bass": "Drum & Bass",
    "drum n bass": "Drum & Bass",
    "drum-n-bass": "Drum & Bass",
  };

  const lower = normalized.toLowerCase();
  if (variations[lower]) {
    return variations[lower];
  }

  // Apply capitalization normalization
  normalized = normalizeCapitalization(normalized);

  return normalized;
}

/**
 * Find the closest matching normalized genre from existing normalized genres
 * Uses fuzzy matching to find similar genres
 */
function findClosestGenre(
  genre: string,
  existingNormalized: Set<string>
): string | null {
  const normalized = normalizeGenre(genre);
  const normalizedLower = normalized.toLowerCase();

  // Exact match
  if (existingNormalized.has(normalized)) {
    return normalized;
  }

  // Case-insensitive match
  for (const existing of existingNormalized) {
    if (existing.toLowerCase() === normalizedLower) {
      return existing;
    }
  }

  // Partial match (one contains the other)
  for (const existing of existingNormalized) {
    const existingLower = existing.toLowerCase();
    if (
      normalizedLower.includes(existingLower) ||
      existingLower.includes(normalizedLower)
    ) {
      // Prefer the longer/more specific one
      return existing.length > normalized.length ? existing : normalized;
    }
  }

  // No close match found, return the normalized version
  return normalized;
}

/**
 * Build genre normalization mappings from tracks
 * Handles comma-separated genres by splitting them
 */
export function buildGenreMappings(
  tracks: Array<{ tags: { genres: string[] }; trackFileId?: string; id?: string }>
): {
  originalToNormalized: Map<string, string>;
  normalizedToOriginals: Map<string, Set<string>>;
  normalizedToTrackCount: Map<string, number>;
} {
  const originalToNormalized = new Map<string, string>();
  const normalizedToOriginals = new Map<string, Set<string>>();
  const normalizedToTrackCount = new Map<string, number>();

  // Track which tracks have which normalized genres
  const normalizedGenreTracks = new Map<string, Set<string>>();
  
  // Collect all normalized genres for closest matching
  const allNormalizedGenres = new Set<string>();

  for (const track of tracks) {
    // Use trackFileId or id as unique identifier, fallback to index
    const trackId = track.trackFileId || track.id || `track-${tracks.indexOf(track)}`;
    
    for (const originalGenre of track.tags.genres) {
      if (!originalGenre || !originalGenre.trim()) {
        continue;
      }

      // Split comma-separated genres
      const genreParts = splitGenreString(originalGenre);

      for (const genrePart of genreParts) {
        if (!genrePart || !genrePart.trim()) {
          continue;
        }

        // Get or create normalized genre
        let normalized = originalToNormalized.get(genrePart);
        if (!normalized) {
          normalized = normalizeGenre(genrePart);
          
          // Try to find closest matching existing normalized genre
          const closest = findClosestGenre(normalized, allNormalizedGenres);
          if (closest && closest !== normalized && allNormalizedGenres.has(closest)) {
            // Use the existing normalized genre
            normalized = closest;
          } else {
            // Add new normalized genre
            allNormalizedGenres.add(normalized);
          }
          
          originalToNormalized.set(genrePart, normalized);
        }

        // Build reverse mapping
        if (!normalizedToOriginals.has(normalized)) {
          normalizedToOriginals.set(normalized, new Set());
        }
        normalizedToOriginals.get(normalized)!.add(genrePart);

        // Count tracks per normalized genre
        if (!normalizedGenreTracks.has(normalized)) {
          normalizedGenreTracks.set(normalized, new Set());
        }
        normalizedGenreTracks.get(normalized)!.add(trackId);
      }
    }
  }

  // Convert track sets to counts
  for (const [normalized, trackSet] of normalizedGenreTracks.entries()) {
    normalizedToTrackCount.set(normalized, trackSet.size);
  }

  return {
    originalToNormalized,
    normalizedToOriginals,
    normalizedToTrackCount,
  };
}

/**
 * Get normalized genres with statistics from tracks
 */
export function getNormalizedGenresWithStats(
  tracks: Array<{ tags: { genres: string[] }; trackFileId?: string; id?: string }>
): GenreWithStats[] {
  const { normalizedToOriginals, normalizedToTrackCount } = buildGenreMappings(tracks);

  const genres: GenreWithStats[] = [];

  for (const [normalized, originals] of normalizedToOriginals.entries()) {
    const trackCount = normalizedToTrackCount.get(normalized) || 0;
    genres.push({
      normalized,
      original: Array.from(originals).sort(),
      trackCount,
    });
  }

  // Sort by track count (descending), then alphabetically
  genres.sort((a, b) => {
    if (b.trackCount !== a.trackCount) {
      return b.trackCount - a.trackCount;
    }
    return a.normalized.localeCompare(b.normalized);
  });

  return genres;
}

/**
 * Normalize an array of genres
 */
export function normalizeGenres(genres: string[]): string[] {
  return genres.map(normalizeGenre).filter((g) => g.length > 0);
}

