import { useState, useEffect } from 'react';
import { PlaylistForm } from './components/PlaylistForm';
import { PlaylistResult } from './components/PlaylistResult';
import { LibraryScanner } from './components/LibraryScanner';
import { Music } from 'lucide-react';

export interface PlaylistParams {
  genre: string;
  duration: number; // in minutes
  mood: string;
  activity: string;
  tempo: string;
}

export interface MusicFile {
  file: File;
  title: string;
  artist: string;
  album: string;
  genre?: string;
  duration: number; // in seconds
  year?: number;
  bpm?: number;
}

export interface Song {
  title: string;
  artist: string;
  album: string;
  duration: string;
  genre?: string;
}

export interface Playlist {
  name: string;
  description: string;
  songs: Song[];
  totalDuration: string;
}

export default function App() {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [musicLibrary, setMusicLibrary] = useState<MusicFile[]>([]);
  const [hasScannedLibrary, setHasScannedLibrary] = useState(false);

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleLibraryScanned = (files: MusicFile[]) => {
    setMusicLibrary(files);
    setHasScannedLibrary(true);
  };

  const handleGeneratePlaylist = async (params: PlaylistParams) => {
    setIsGenerating(true);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate playlist from library
    const generatedPlaylist = generatePlaylistFromLibrary(params, musicLibrary);
    setPlaylist(generatedPlaylist);
    setIsGenerating(false);
  };

  const handleReset = () => {
    setPlaylist(null);
  };

  const handleRescanLibrary = () => {
    setMusicLibrary([]);
    setHasScannedLibrary(false);
    setPlaylist(null);
  };

  return (
    <div className="min-h-screen bg-app-bg">
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
        <header className="mb-8 md:mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="size-16 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm flex items-center justify-center">
                <Music className="size-8 text-white" />
              </div>
              <div>
                <h1 className="text-app-primary tracking-tight">playlist ai</h1>
                <p className="text-app-secondary">intelligent music curation</p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-2 bg-app-surface text-app-primary rounded-sm hover:bg-app-hover transition-colors border border-app-border uppercase tracking-wider text-xs"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>

        {!playlist ? (
          <>
            {!hasScannedLibrary ? (
              <LibraryScanner 
                onLibraryScanned={handleLibraryScanned}
              />
            ) : (
              <PlaylistForm 
                onGenerate={handleGeneratePlaylist} 
                isGenerating={isGenerating}
                libraryCount={musicLibrary.length}
                onRescanLibrary={handleRescanLibrary}
              />
            )}
          </>
        ) : (
          <PlaylistResult 
            playlist={playlist}
            onCreateNew={handleReset}
          />
        )}
      </div>
    </div>
  );
}

// Playlist generator from library
function generatePlaylistFromLibrary(params: PlaylistParams, library: MusicFile[]): Playlist {
  const { genre, duration, mood, activity, tempo } = params;
  
  // Generate playlist name based on parameters
  const playlistName = `${mood.charAt(0).toUpperCase() + mood.slice(1)} ${genre} for ${activity}`;
  
  // Generate description
  const description = `A carefully curated ${duration}-minute ${genre} playlist with ${tempo} tempo, perfect for ${activity}. The mood is ${mood}, creating the ideal atmosphere for your activity.`;
  
  // Extract BPM range from tempo selection
  let minBpm = 0;
  let maxBpm = 300;
  
  if (tempo.includes('60-90')) {
    minBpm = 60;
    maxBpm = 90;
  } else if (tempo.includes('90-120')) {
    minBpm = 90;
    maxBpm = 120;
  } else if (tempo.includes('120-140')) {
    minBpm = 120;
    maxBpm = 140;
  } else if (tempo.includes('140+')) {
    minBpm = 140;
    maxBpm = 300;
  }
  
  // Filter songs based on criteria
  let filteredSongs = library.filter(song => {
    // Filter by genre if available in metadata
    if (song.genre) {
      const songGenre = song.genre.toLowerCase();
      const targetGenre = genre.toLowerCase();
      if (!songGenre.includes(targetGenre) && !targetGenre.includes(songGenre)) {
        return false;
      }
    }
    
    // Filter by BPM if available
    if (song.bpm && (song.bpm < minBpm || song.bpm > maxBpm)) {
      return false;
    }
    
    return true;
  });
  
  // If filtering is too strict and we have no results, fall back to all songs
  if (filteredSongs.length === 0) {
    filteredSongs = library;
  }
  
  // Shuffle and select songs to match duration
  filteredSongs = filteredSongs.sort(() => Math.random() - 0.5);
  
  const targetDurationSeconds = duration * 60;
  let currentDuration = 0;
  const selectedSongs: MusicFile[] = [];
  
  for (const song of filteredSongs) {
    if (currentDuration >= targetDurationSeconds) break;
    selectedSongs.push(song);
    currentDuration += song.duration;
  }
  
  // Convert to Song interface
  const songs: Song[] = selectedSongs.map(song => ({
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: formatDuration(song.duration),
    genre: song.genre
  }));
  
  const totalDuration = formatDuration(currentDuration);
  
  return {
    name: playlistName,
    description,
    songs,
    totalDuration
  };
}

// Helper function to format duration from seconds to "mm:ss"
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}