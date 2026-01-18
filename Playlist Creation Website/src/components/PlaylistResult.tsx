import { Playlist } from '../App';
import { Download, Share2, Play, Clock, Music, RefreshCw } from 'lucide-react';

interface PlaylistResultProps {
  playlist: Playlist;
  onCreateNew: () => void;
}

export function PlaylistResult({ playlist, onCreateNew }: PlaylistResultProps) {
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(playlist, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${playlist.name.replace(/\s+/g, '_')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportText = () => {
    let text = `${playlist.name}\n${'='.repeat(playlist.name.length)}\n\n`;
    text += `${playlist.description}\n\n`;
    text += `Total Duration: ${playlist.totalDuration}\n`;
    text += `Songs: ${playlist.songs.length}\n\n`;
    text += `TRACKLIST\n${'─'.repeat(50)}\n\n`;
    
    playlist.songs.forEach((song, index) => {
      text += `${index + 1}. ${song.title}\n`;
      text += `   Artist: ${song.artist}\n`;
      text += `   Album: ${song.album}\n`;
      text += `   Duration: ${song.duration}\n\n`;
    });
    
    const dataBlob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${playlist.name.replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    const shareText = `Check out my AI-generated playlist: "${playlist.name}" - ${playlist.songs.length} songs!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: playlist.name,
          text: shareText,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareText);
      alert('Playlist info copied to clipboard!');
    }
  };

  return (
    <div className="">
      {/* Playlist Header */}
      <div className="bg-app-surface rounded-sm shadow-2xl mb-1">
        <div className="p-8 border-b border-app-border">
          <h2 className="text-app-primary mb-3 tracking-tight">{playlist.name}</h2>
          <p className="text-app-secondary mb-6 leading-relaxed">{playlist.description}</p>
          <div className="flex gap-6 text-app-secondary uppercase tracking-wider text-xs">
            <div className="flex items-center gap-2">
              <Music className="size-4 text-accent-primary" />
              <span>{playlist.songs.length} tracks</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-accent-primary" />
              <span>{playlist.totalDuration}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 flex flex-wrap gap-2 bg-app-surface">
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-4 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors uppercase tracking-wider text-xs border border-app-border"
          >
            <Download className="size-3" />
            <span>JSON</span>
          </button>
          <button
            onClick={handleExportText}
            className="flex items-center gap-2 px-4 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors uppercase tracking-wider text-xs border border-app-border"
          >
            <Download className="size-3" />
            <span>TXT</span>
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors uppercase tracking-wider text-xs border border-app-border"
          >
            <Share2 className="size-3" />
            <span>Share</span>
          </button>
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors uppercase tracking-wider text-xs ml-auto"
          >
            <RefreshCw className="size-3" />
            <span>New Playlist</span>
          </button>
        </div>
      </div>

      {/* Song List */}
      <div className="bg-app-surface rounded-sm shadow-2xl overflow-hidden">
        <div className="divide-y divide-app-border">
          {playlist.songs.map((song, index) => (
            <div
              key={index}
              className="px-6 py-4 hover:bg-app-hover transition-colors group flex items-center gap-4"
            >
              <div className="flex items-center justify-center size-8 text-app-tertiary group-hover:text-accent-primary transition-colors shrink-0">
                <span className="text-sm group-hover:hidden">{String(index + 1).padStart(2, '0')}</span>
                <Play className="size-4 hidden group-hover:block" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-app-primary truncate">{song.title}</div>
                <div className="text-app-secondary text-sm truncate">
                  {song.artist}
                </div>
              </div>
              <div className="text-app-tertiary text-sm hidden sm:block">
                {song.album}
              </div>
              <div className="text-app-secondary text-sm tabular-nums shrink-0">
                {song.duration}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
