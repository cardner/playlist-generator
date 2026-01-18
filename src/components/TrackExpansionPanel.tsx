import type { TrackRecord } from "@/db/schema";
import { Plus } from "lucide-react";

interface TrackExpansionPanelProps {
  track: TrackRecord;
  similarArtists: string[];
  similarTracks: TrackRecord[];
  onAddTrack?: (track: TrackRecord) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function TrackExpansionPanel({
  track,
  similarArtists,
  similarTracks,
  onAddTrack,
}: TrackExpansionPanelProps) {
  const tech = track.tech || {};

  return (
    <div className="mt-3 p-4 bg-app-hover rounded-sm border border-app-border">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-app-tertiary text-xs uppercase tracking-wider mb-2">Track Metadata</div>
          <div className="space-y-1 text-app-secondary">
            <div>
              <span className="text-app-tertiary">Title:</span> {track.tags.title || "Unknown Title"}
            </div>
            <div>
              <span className="text-app-tertiary">Artist:</span> {track.tags.artist || "Unknown Artist"}
            </div>
            <div>
              <span className="text-app-tertiary">Album:</span> {track.tags.album || "Unknown Album"}
            </div>
            <div>
              <span className="text-app-tertiary">Genres:</span>{" "}
              {track.tags.genres.length > 0 ? track.tags.genres.join(", ") : "Unknown"}
            </div>
            <div>
              <span className="text-app-tertiary">Year:</span> {track.tags.year || "Unknown"}
            </div>
          </div>
        </div>

        <div>
          <div className="text-app-tertiary text-xs uppercase tracking-wider mb-2">Audio Details</div>
          <div className="space-y-1 text-app-secondary">
            <div>
              <span className="text-app-tertiary">Duration:</span> {formatDuration(tech.durationSeconds)}
            </div>
            <div>
              <span className="text-app-tertiary">BPM:</span> {tech.bpm || "Unknown"}
            </div>
            <div>
              <span className="text-app-tertiary">Bitrate:</span> {tech.bitrate ? `${tech.bitrate} kbps` : "Unknown"}
            </div>
            <div>
              <span className="text-app-tertiary">Sample Rate:</span> {tech.sampleRate || "Unknown"}
            </div>
            <div>
              <span className="text-app-tertiary">Channels:</span> {tech.channels || "Unknown"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-app-tertiary text-xs uppercase tracking-wider mb-2">Similar Artists</div>
        {similarArtists.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {similarArtists.map((artist) => (
              <span
                key={artist}
                className="px-2 py-1 text-xs bg-app-surface text-app-primary rounded-sm border border-app-border"
              >
                {artist}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-app-tertiary text-sm">No similar artists found.</div>
        )}
      </div>

      <div className="mt-4">
        <div className="text-app-tertiary text-xs uppercase tracking-wider mb-2">Similar Tracks</div>
        {similarTracks.length > 0 ? (
          <div className="space-y-2">
            {similarTracks.map((similar) => (
              <div
                key={similar.trackFileId}
                className="flex items-center justify-between gap-3 p-2 bg-app-surface rounded-sm border border-app-border"
              >
                <div className="min-w-0">
                  <div className="text-app-primary text-sm truncate">
                    {similar.tags.title || "Unknown Title"}
                  </div>
                  <div className="text-app-secondary text-xs truncate">
                    {similar.tags.artist || "Unknown Artist"}
                  </div>
                </div>
                {onAddTrack && (
                  <button
                    onClick={() => onAddTrack(similar)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors"
                  >
                    <Plus className="size-3" />
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-app-tertiary text-sm">No similar tracks found.</div>
        )}
      </div>
    </div>
  );
}

