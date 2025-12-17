/**
 * Test fixtures for metadata objects
 * 
 * Sample metadata objects for testing without requiring actual audio files
 */

import type { MetadataResult, NormalizedTags, TechInfo } from "@/features/library/metadata";
import type { FileIndexEntry } from "@/features/library/scanning";

/**
 * Sample normalized tags for testing
 */
export const sampleTags: NormalizedTags[] = [
  {
    title: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    genres: ["Rock", "Progressive Rock"],
    year: 1975,
    trackNo: 1,
    discNo: 1,
  },
  {
    title: "Stairway to Heaven",
    artist: "Led Zeppelin",
    album: "Led Zeppelin IV",
    genres: ["Rock", "Hard Rock"],
    year: 1971,
    trackNo: 4,
    discNo: 1,
  },
  {
    title: "Hotel California",
    artist: "Eagles",
    album: "Hotel California",
    genres: ["Rock", "Soft Rock"],
    year: 1976,
    trackNo: 1,
    discNo: 1,
  },
  {
    title: "Billie Jean",
    artist: "Michael Jackson",
    album: "Thriller",
    genres: ["Pop", "Funk", "R&B"],
    year: 1982,
    trackNo: 2,
    discNo: 1,
  },
  {
    title: "Smells Like Teen Spirit",
    artist: "Nirvana",
    album: "Nevermind",
    genres: ["Rock", "Grunge", "Alternative"],
    year: 1991,
    trackNo: 1,
    discNo: 1,
  },
  {
    title: "Like a Rolling Stone",
    artist: "Bob Dylan",
    album: "Highway 61 Revisited",
    genres: ["Folk", "Rock"],
    year: 1965,
    trackNo: 1,
    discNo: 1,
  },
  {
    title: "Imagine",
    artist: "John Lennon",
    album: "Imagine",
    genres: ["Rock", "Soft Rock"],
    year: 1971,
    trackNo: 1,
    discNo: 1,
  },
  {
    title: "What's Going On",
    artist: "Marvin Gaye",
    album: "What's Going On",
    genres: ["Soul", "R&B"],
    year: 1971,
    trackNo: 1,
    discNo: 1,
  },
  {
    title: "Good Vibrations",
    artist: "The Beach Boys",
    album: "Smiley Smile",
    genres: ["Pop", "Rock"],
    year: 1966,
    trackNo: 1,
    discNo: 1,
  },
  {
    title: "Respect",
    artist: "Aretha Franklin",
    album: "I Never Loved a Man the Way I Love You",
    genres: ["Soul", "R&B"],
    year: 1967,
    trackNo: 1,
    discNo: 1,
  },
];

/**
 * Sample tech info for testing
 */
export const sampleTechInfo: TechInfo[] = [
  {
    durationSeconds: 355,
    codec: "MP3",
    container: "mp3",
    bitrate: 320000,
    sampleRate: 44100,
    channels: 2,
  },
  {
    durationSeconds: 482,
    codec: "FLAC",
    container: "flac",
    bitrate: 1000000,
    sampleRate: 96000,
    channels: 2,
  },
  {
    durationSeconds: 391,
    codec: "AAC",
    container: "m4a",
    bitrate: 256000,
    sampleRate: 44100,
    channels: 2,
  },
  {
    durationSeconds: 294,
    codec: "MP3",
    container: "mp3",
    bitrate: 192000,
    sampleRate: 44100,
    channels: 2,
  },
  {
    durationSeconds: 301,
    codec: "MP3",
    container: "mp3",
    bitrate: 320000,
    sampleRate: 44100,
    channels: 2,
  },
];

/**
 * Generate sample metadata results
 */
export function generateSampleMetadataResults(count: number = 10): MetadataResult[] {
  const results: MetadataResult[] = [];
  
  for (let i = 0; i < count; i++) {
    const tagIndex = i % sampleTags.length;
    const techIndex = i % sampleTechInfo.length;
    
    results.push({
      trackFileId: `test-track-${i}`,
      tags: { ...sampleTags[tagIndex] },
      tech: { ...sampleTechInfo[techIndex] },
      warnings: i % 3 === 0 ? ["Sample warning"] : undefined,
    });
  }
  
  return results;
}

/**
 * Generate sample file index entries
 */
export function generateSampleFileIndexEntries(count: number = 10): FileIndexEntry[] {
  const entries: FileIndexEntry[] = [];
  const extensions = ["mp3", "flac", "m4a", "ogg", "wav"];
  const baseTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    const ext = extensions[i % extensions.length];
    entries.push({
      trackFileId: `test-track-${i}`,
      relativePath: `Music/Album ${Math.floor(i / 5) + 1}/Track ${i + 1}.${ext}`,
      name: `Track ${i + 1}.${ext}`,
      extension: ext,
      size: 3000000 + (i * 100000), // Varying sizes
      mtime: baseTime - (i * 86400000), // Different modification times
    });
  }
  
  return entries;
}

/**
 * Generate large dataset for stress testing
 */
export function generateLargeDataset(size: number = 10000): {
  metadata: MetadataResult[];
  fileIndex: FileIndexEntry[];
} {
  return {
    metadata: generateSampleMetadataResults(size),
    fileIndex: generateSampleFileIndexEntries(size),
  };
}

