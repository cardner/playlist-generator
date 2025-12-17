import { useState } from 'react';
import { FolderOpen, Music, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { MusicFile } from '../App';
import { parseBlob } from 'music-metadata-browser';

interface LibraryScannerProps {
  onLibraryScanned: (files: MusicFile[]) => void;
}

export function LibraryScanner({ onLibraryScanned }: LibraryScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setError(null);
    setScanProgress(0);
    setScannedFiles(0);

    const audioFiles = Array.from(files).filter(file => 
      file.type.startsWith('audio/')
    );

    setTotalFiles(audioFiles.length);

    if (audioFiles.length === 0) {
      setError('No audio files found. Please select a folder containing music files.');
      setIsScanning(false);
      return;
    }

    const musicFiles: MusicFile[] = [];

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      
      try {
        // Parse metadata
        const metadata = await parseBlob(file);
        
        const musicFile: MusicFile = {
          file,
          title: metadata.common.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: metadata.common.artist || 'Unknown Artist',
          album: metadata.common.album || 'Unknown Album',
          genre: metadata.common.genre?.[0],
          duration: Math.floor(metadata.format.duration || 0),
          year: metadata.common.year,
          bpm: metadata.common.bpm,
        };

        musicFiles.push(musicFile);
      } catch (err) {
        console.error(`Error parsing ${file.name}:`, err);
        // Still add the file with basic info
        musicFiles.push({
          file,
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0,
        });
      }

      setScannedFiles(i + 1);
      setScanProgress(Math.round(((i + 1) / audioFiles.length) * 100));
    }

    onLibraryScanned(musicFiles);
    setIsScanning(false);
  };

  return (
    <div className="max-w-4xl">
      <div className="bg-app-surface rounded-sm shadow-2xl p-8 md:p-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center size-20 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm mb-6">
            <Music className="size-10 text-white" />
          </div>
          
          <h2 className="text-app-primary mb-3">Scan Your Music Library</h2>
          <p className="text-app-secondary mb-8 max-w-lg mx-auto">
            Select your music folder to scan and analyze your audio files. We'll read the metadata to help create personalized playlists.
          </p>

          {!isScanning ? (
            <>
              <label className="inline-flex items-center gap-3 px-8 py-4 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors cursor-pointer uppercase tracking-wider">
                <FolderOpen className="size-5" />
                <span>Select Music Folder</span>
                <input
                  type="file"
                  /* @ts-ignore - webkitdirectory is not in the types but is supported */
                  webkitdirectory=""
                  directory=""
                  multiple
                  accept="audio/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              
              <p className="text-app-tertiary mt-4 text-sm">
                Supported formats: MP3, M4A, FLAC, WAV, OGG, and more
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3 text-accent-primary">
                <Loader2 className="size-6 animate-spin" />
                <span className="uppercase tracking-wider">Scanning Library...</span>
              </div>
              
              <div className="max-w-md mx-auto">
                <div className="h-2 bg-app-hover rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent-primary transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-app-secondary mt-2 text-sm">
                  {scannedFiles} of {totalFiles} files scanned ({scanProgress}%)
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-sm flex items-start gap-3 text-left max-w-lg mx-auto">
              <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-app-border">
            <div className="flex items-start gap-4 text-left max-w-2xl mx-auto">
              <CheckCircle2 className="size-5 text-accent-primary shrink-0 mt-1" />
              <div>
                <h4 className="text-app-primary mb-2">Privacy First</h4>
                <p className="text-app-secondary text-sm">
                  All music files are processed locally in your browser. No files are uploaded to any server. Your music library stays completely private.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
