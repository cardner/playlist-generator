import { useState } from 'react';
import { PlaylistParams } from '../App';
import { Sparkles, Music2, Clock, Heart, Activity, Gauge, RefreshCw, Database } from 'lucide-react';
import { Combobox } from './Combobox';

interface PlaylistFormProps {
  onGenerate: (params: PlaylistParams) => void;
  isGenerating: boolean;
  libraryCount: number;
  onRescanLibrary: () => void;
}

const genreOptions = [
  'Pop', 'Rock', 'Hip Hop', 'Electronic', 'Jazz', 'Classical', 
  'R&B', 'Country', 'Indie', 'Latin', 'K-Pop', 'Alternative'
];

const moodOptions = [
  'Energetic', 'Relaxed', 'Happy', 'Melancholic', 'Romantic', 
  'Motivational', 'Chill', 'Intense', 'Uplifting', 'Nostalgic'
];

const activityOptions = [
  'Working Out', 'Studying', 'Commuting', 'Relaxing', 'Party', 
  'Cooking', 'Driving', 'Sleeping', 'Reading', 'Working', 'Dancing'
];

const tempoOptions = [
  'Slow & Steady (60-90 BPM)',
  'Moderate (90-120 BPM)',
  'Upbeat (120-140 BPM)',
  'Fast & Energetic (140+ BPM)'
];

export function PlaylistForm({ onGenerate, isGenerating, libraryCount, onRescanLibrary }: PlaylistFormProps) {
  const [genre, setGenre] = useState('Pop');
  const [duration, setDuration] = useState(30);
  const [mood, setMood] = useState('Happy');
  const [activity, setActivity] = useState('Working Out');
  const [tempo, setTempo] = useState('Upbeat (120-140 BPM)');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate({ genre, duration, mood, activity, tempo });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins} min`;
  };

  return (
    <div className="max-w-4xl">
      {/* Library Info Banner */}
      <div className="bg-app-surface rounded-sm shadow-2xl p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="size-5 text-accent-primary" />
          <div>
            <p className="text-app-primary text-sm uppercase tracking-wider">Library Loaded</p>
            <p className="text-app-secondary text-xs">{libraryCount} tracks available</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRescanLibrary}
          className="flex items-center gap-2 px-3 py-2 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover transition-colors uppercase tracking-wider text-xs border border-app-border"
        >
          <RefreshCw className="size-3" />
          <span>Rescan</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-app-surface rounded-sm shadow-2xl">
        <div className="grid md:grid-cols-2 gap-px bg-app-border">
          {/* Genre Selection */}
          <div className="bg-app-surface p-6">
            <label className="flex items-center gap-3 text-app-primary mb-4 uppercase tracking-wider text-xs">
              <Music2 className="size-4 text-accent-primary" />
              <span>Genre</span>
            </label>
            <Combobox
              value={genre}
              onChange={setGenre}
              options={genreOptions}
              placeholder="Select or type a genre..."
              icon={<Music2 className="size-4 text-accent-primary" />}
            />
          </div>

          {/* Mood Selection */}
          <div className="bg-app-surface p-6">
            <label className="flex items-center gap-3 text-app-primary mb-4 uppercase tracking-wider text-xs">
              <Heart className="size-4 text-accent-primary" />
              <span>Mood</span>
            </label>
            <Combobox
              value={mood}
              onChange={setMood}
              options={moodOptions}
              placeholder="Select or type a mood..."
              icon={<Heart className="size-4 text-accent-primary" />}
            />
          </div>

          {/* Activity Selection */}
          <div className="bg-app-surface p-6">
            <label className="flex items-center gap-3 text-app-primary mb-4 uppercase tracking-wider text-xs">
              <Activity className="size-4 text-accent-primary" />
              <span>Activity</span>
            </label>
            <Combobox
              value={activity}
              onChange={setActivity}
              options={activityOptions}
              placeholder="Select or type an activity..."
              icon={<Activity className="size-4 text-accent-primary" />}
            />
          </div>

          {/* Tempo Selection */}
          <div className="bg-app-surface p-6">
            <label className="flex items-center gap-3 text-app-primary mb-4 uppercase tracking-wider text-xs">
              <Gauge className="size-4 text-accent-primary" />
              <span>Tempo</span>
            </label>
            <Combobox
              value={tempo}
              onChange={setTempo}
              options={tempoOptions}
              placeholder="Select or type a tempo..."
              icon={<Gauge className="size-4 text-accent-primary" />}
            />
          </div>

          {/* Playlist Duration - Full Width */}
          <div className="bg-app-surface p-6 md:col-span-2">
            <label className="flex items-center gap-3 text-app-primary mb-4 uppercase tracking-wider text-xs">
              <Clock className="size-4 text-accent-primary" />
              <span>Duration</span>
              <span className="ml-auto text-accent-primary">{formatDuration(duration)}</span>
            </label>
            <div className="relative">
              <input
                type="range"
                min="15"
                max="180"
                step="5"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full h-1 bg-app-hover rounded-none appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:bg-accent-primary [&::-webkit-slider-thumb]:rounded-none [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0"
              />
              <div className="flex justify-between text-app-tertiary mt-3 text-xs uppercase tracking-wider">
                <span>15 min</span>
                <span>1 hour</span>
                <span>2 hours</span>
                <span>3 hours</span>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="p-6 bg-app-surface border-t border-app-border">
          <button
            type="submit"
            disabled={isGenerating}
            className="w-full bg-accent-primary text-white py-4 px-6 rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 uppercase tracking-wider"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                <span>Generating Playlist...</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                <span>Generate Playlist</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}