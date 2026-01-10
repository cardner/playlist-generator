/**
 * TrackMetadataEditor Component
 * 
 * Component for manually editing track metadata (genres, mood, tempo) inline.
 * Supports editing individual tracks with validation and visual indicators
 * for manually edited vs. auto-enhanced fields.
 * 
 * Features:
 * - Inline editing for genres, mood, and tempo
 * - Chip input for genres and mood with autocomplete
 * - Number input for tempo/BPM with validation
 * - Save/Cancel buttons
 * - Visual indicators for manually edited fields
 * - Merge manual edits with existing metadata
 * 
 * @module components/TrackMetadataEditor
 */

"use client";

import { useState, useEffect } from "react";
import { Save, X, Edit2, Music, Heart, Gauge } from "lucide-react";
import type { TrackRecord } from "@/db/schema";
import type { EnhancedMetadata } from "@/features/library/metadata";
import { ChipInput } from "./ChipInput";
import { useTrackMetadataEditor } from "@/hooks/useTrackMetadataEditor";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface TrackMetadataEditorProps {
  /** Track to edit */
  track: TrackRecord;
  /** Available genre suggestions for autocomplete */
  genreSuggestions?: string[];
  /** Callback when edits are saved */
  onSave?: (trackId: string, edits: Partial<EnhancedMetadata>) => void;
  /** Callback when editing is cancelled */
  onCancel?: () => void;
  /** Whether to show as inline editor (default) or modal */
  inline?: boolean;
}

const MOOD_SUGGESTIONS = [
  "Happy",
  "Energetic",
  "Relaxed",
  "Melancholic",
  "Upbeat",
  "Calm",
  "Intense",
  "Peaceful",
  "Exciting",
  "Mellow",
  "Sad",
  "Aggressive",
  "Dreamy",
  "Romantic",
  "Dark",
];

/**
 * Get current metadata values from track, prioritizing manual edits
 */
function getCurrentMetadata(track: TrackRecord): {
  genres: string[];
  mood: string[];
  tempo: number | "slow" | "medium" | "fast" | undefined;
} {
  const enhanced = track.enhancedMetadata;
  const tags = track.tags;
  
  // Prioritize enhanced metadata, fall back to tags
  const genres = enhanced?.genres || tags.genres || [];
  const mood = enhanced?.mood || [];
  const tempo = enhanced?.tempo || track.tech?.bpm;

  return { genres, mood, tempo };
}

/**
 * Check if a field was manually edited
 */
function isManuallyEdited(track: TrackRecord, field: string): boolean {
  return track.enhancedMetadata?.manualFields?.includes(field) || false;
}

export function TrackMetadataEditor({
  track,
  genreSuggestions = [],
  onSave,
  onCancel,
  inline = true,
}: TrackMetadataEditorProps) {
  const { editTrack, saveEdits, cancelEdit, isEditing, updateEdits } = useTrackMetadataEditor();
  const [localGenres, setLocalGenres] = useState<string[]>([]);
  const [localMood, setLocalMood] = useState<string[]>([]);
  const [localTempo, setLocalTempo] = useState<string>("");
  const [tempoMode, setTempoMode] = useState<"bpm" | "category">("bpm");
  const [tempoError, setTempoError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const currentMetadata = getCurrentMetadata(track);
  const isCurrentlyEditing = isEditing(track.id);

  // Initialize local state when component mounts or track changes
  useEffect(() => {
    setLocalGenres(currentMetadata.genres);
    setLocalMood(currentMetadata.mood);
    
    // Initialize tempo based on type
    const tempo = currentMetadata.tempo;
    if (tempo === undefined) {
      setLocalTempo("");
      setTempoMode("bpm");
    } else if (typeof tempo === "string") {
      setLocalTempo(tempo);
      setTempoMode("category");
    } else {
      setLocalTempo(tempo.toString());
      setTempoMode("bpm");
    }
    setTempoError("");
    
    // Start editing if not already editing
    if (!isCurrentlyEditing) {
      editTrack(track.id, track.enhancedMetadata);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, track.enhancedMetadata]);

  const validateTempo = (value: string, mode: "bpm" | "category"): string => {
    if (!value.trim()) {
      return ""; // Empty is valid (will be undefined)
    }
    
    if (mode === "category") {
      const validCategories = ["slow", "medium", "fast"];
      if (!validCategories.includes(value.toLowerCase())) {
        return "Tempo must be: slow, medium, or fast";
      }
      return "";
    } else {
      // BPM mode
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        return "Tempo must be a number";
      }
      if (num < 1) {
        return "Tempo must be at least 1 BPM";
      }
      if (num > 300) {
        return "Tempo must be at most 300 BPM";
      }
      return "";
    }
  };

  const handleTempoChange = (value: string) => {
    setLocalTempo(value);
    const error = validateTempo(value, tempoMode);
    setTempoError(error);
  };

  const handleTempoModeChange = (mode: "bpm" | "category") => {
    setTempoMode(mode);
    setLocalTempo(""); // Clear tempo when switching modes
    setTempoError("");
  };

  const handleSave = async () => {
    if (tempoError) {
      return; // Don't save if there's a validation error
    }

    setIsSaving(true);
    try {
      const edits: Partial<EnhancedMetadata> = {
        genres: localGenres,
        mood: localMood,
      };

      if (localTempo.trim()) {
        if (tempoMode === "category") {
          const category = localTempo.toLowerCase() as "slow" | "medium" | "fast";
          if (["slow", "medium", "fast"].includes(category)) {
            edits.tempo = category;
          }
        } else {
          // BPM mode
          const tempoNum = parseInt(localTempo, 10);
          if (!isNaN(tempoNum)) {
            edits.tempo = tempoNum;
          }
        }
      } else {
        // If tempo is cleared, set to undefined
        edits.tempo = undefined;
      }

      await saveEdits(track.id, edits);
      onSave?.(track.id, edits);
    } catch (error) {
      logger.error("Failed to save track metadata:", error);
      alert("Failed to save metadata. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    cancelEdit();
    setLocalGenres(currentMetadata.genres);
    setLocalMood(currentMetadata.mood);
    const tempo = currentMetadata.tempo;
    if (tempo === undefined) {
      setLocalTempo("");
      setTempoMode("bpm");
    } else if (typeof tempo === "string") {
      setLocalTempo(tempo);
      setTempoMode("category");
    } else {
      setLocalTempo(tempo.toString());
      setTempoMode("bpm");
    }
    setTempoError("");
    onCancel?.();
  };

  const genresManuallyEdited = isManuallyEdited(track, "genres");
  const moodManuallyEdited = isManuallyEdited(track, "mood");
  const tempoManuallyEdited = isManuallyEdited(track, "tempo");

  if (!inline) {
    // Modal version (for future use)
    return (
      <div className="bg-app-surface rounded-sm shadow-2xl p-6 space-y-4">
        <h3 className="text-app-primary font-semibold text-lg mb-4">
          Edit Metadata: {track.tags.title}
        </h3>
        {/* Same content as inline version */}
      </div>
    );
  }

  return (
    <div className="bg-app-surface border border-app-border rounded-sm p-4 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-app-primary font-medium text-sm">
          Edit Metadata: {track.tags.title} - {track.tags.artist}
        </h4>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !!tempoError}
            className="px-3 py-1.5 bg-accent-primary text-white rounded-sm hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm transition-colors"
          >
            <Save className="size-3.5" />
            Save
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-3 py-1.5 bg-app-hover text-app-primary rounded-sm hover:bg-app-surface-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm transition-colors"
          >
            <X className="size-3.5" />
            Cancel
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Genres */}
        <div>
          <label className="flex items-center gap-2 text-app-primary mb-2 text-sm font-medium">
            <Music className="size-4 text-accent-primary" />
            <span>Genres</span>
            {genresManuallyEdited && (
              <span className="text-xs text-accent-primary">(Manually edited)</span>
            )}
          </label>
          <ChipInput
            values={localGenres}
            onChange={setLocalGenres}
            placeholder="Add genres..."
            suggestions={genreSuggestions}
            icon={<Music className="size-4" />}
          />
        </div>

        {/* Mood */}
        <div>
          <label className="flex items-center gap-2 text-app-primary mb-2 text-sm font-medium">
            <Heart className="size-4 text-accent-primary" />
            <span>Mood</span>
            {moodManuallyEdited && (
              <span className="text-xs text-accent-primary">(Manually edited)</span>
            )}
          </label>
          <ChipInput
            values={localMood}
            onChange={setLocalMood}
            placeholder="Add mood tags..."
            suggestions={MOOD_SUGGESTIONS}
            icon={<Heart className="size-4" />}
          />
        </div>

        {/* Tempo/BPM */}
        <div>
          <label className="flex items-center gap-2 text-app-primary mb-2 text-sm font-medium">
            <Gauge className="size-4 text-accent-primary" />
            <span>Tempo</span>
            {tempoManuallyEdited && (
              <span className="text-xs text-accent-primary">(Manually edited)</span>
            )}
          </label>
          
          {/* Tempo Mode Selector */}
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => handleTempoModeChange("bpm")}
              className={cn(
                "px-3 py-1.5 rounded-sm text-sm border transition-colors",
                tempoMode === "bpm"
                  ? "bg-accent-primary text-white border-accent-primary"
                  : "bg-app-surface text-app-primary border-app-border hover:bg-app-surface-hover"
              )}
            >
              BPM
            </button>
            <button
              type="button"
              onClick={() => handleTempoModeChange("category")}
              className={cn(
                "px-3 py-1.5 rounded-sm text-sm border transition-colors",
                tempoMode === "category"
                  ? "bg-accent-primary text-white border-accent-primary"
                  : "bg-app-surface text-app-primary border-app-border hover:bg-app-surface-hover"
              )}
            >
              Category
            </button>
          </div>

          {tempoMode === "bpm" ? (
            <input
              type="number"
              value={localTempo}
              onChange={(e) => handleTempoChange(e.target.value)}
              placeholder="Enter BPM (60-200 typical)"
              min="1"
              max="300"
              className={`w-full px-4 py-2 bg-app-hover text-app-primary rounded-sm border ${
                tempoError ? "border-red-500" : "border-app-border"
              } placeholder-app-tertiary focus:outline-none focus:border-accent-primary`}
            />
          ) : (
            <select
              value={localTempo}
              onChange={(e) => handleTempoChange(e.target.value)}
              className={`w-full px-4 py-2 bg-app-hover text-app-primary rounded-sm border ${
                tempoError ? "border-red-500" : "border-app-border"
              } focus:outline-none focus:border-accent-primary`}
            >
              <option value="">Select tempo category</option>
              <option value="slow">Slow</option>
              <option value="medium">Medium</option>
              <option value="fast">Fast</option>
            </select>
          )}
          
          {tempoError && (
            <p className="text-red-500 text-xs mt-1">{tempoError}</p>
          )}
          {!tempoError && localTempo && (
            <p className="text-app-tertiary text-xs mt-1">
              Current: {tempoMode === "bpm" ? `${localTempo} BPM` : localTempo.charAt(0).toUpperCase() + localTempo.slice(1)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

