"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PlaylistRequest, PlaylistRequestErrors } from "@/types/playlist";
import { getAllGenres, getAllArtists, getAllAlbums, getAllTrackTitles, getCurrentLibraryRoot, getAllCollections, getCurrentCollectionId } from "@/db/storage";
import type { LibraryRootRecord } from "@/db/schema";
import {
  savePlaylistDraft,
  loadPlaylistDraft,
  clearPlaylistDraft,
} from "@/lib/playlist-storage";
import {
  validatePlaylistRequest,
  hasErrors,
} from "@/lib/playlist-validation";
import {
  Music,
  Clock,
  Heart,
  Activity,
  Gauge,
  Sparkles,
  X,
  Plus,
  AlertCircle,
  UserX,
  Users,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChipInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  error?: string;
  icon?: React.ReactNode;
}

function ChipInput({
  values,
  onChange,
  placeholder = "Add item...",
  suggestions = [],
  error,
  icon,
}: ChipInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleAdd = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const handleRemove = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      handleAdd(inputValue);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const filteredSuggestions = suggestions.filter(
    (s) => !values.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex flex-wrap gap-2 p-3 bg-app-hover rounded-sm border border-app-border min-h-[48px] focus-within:border-accent-primary">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-app-surface text-app-primary rounded-sm text-sm border border-app-border"
            >
              {value}
              <button
                type="button"
                onClick={() => handleRemove(value)}
                className="hover:text-red-500 transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={values.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[120px] bg-transparent text-app-primary placeholder-app-tertiary outline-none"
          />
        </div>
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-app-surface border border-app-border rounded-sm shadow-lg max-h-48 overflow-y-auto">
            {filteredSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleAdd(suggestion)}
                className="w-full px-4 py-2 text-left text-app-primary hover:bg-app-hover transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <p className="text-red-500 text-sm flex items-center gap-1">
          <AlertCircle className="size-4" />
          {error}
        </p>
      )}
    </div>
  );
}

interface PlaylistBuilderProps {
  onGenerate?: (request: PlaylistRequest) => void;
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
];

const ACTIVITY_SUGGESTIONS = [
  "Working Out",
  "Running",
  "Studying",
  "Driving",
  "Cooking",
  "Relaxing",
  "Partying",
  "Sleeping",
  "Meditating",
  "Cleaning",
];

export function PlaylistBuilder({ onGenerate }: PlaylistBuilderProps) {
  const router = useRouter();
  const [collections, setCollections] = useState<LibraryRootRecord[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [albums, setAlbums] = useState<string[]>([]);
  const [trackTitles, setTrackTitles] = useState<string[]>([]);
  const [isLoadingGenres, setIsLoadingGenres] = useState(true);
  const [isLoadingArtists, setIsLoadingArtists] = useState(true);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true);
  const [isLoadingTracks, setIsLoadingTracks] = useState(true);
  const [showCollectionSelector, setShowCollectionSelector] = useState(false);

  const [formData, setFormData] = useState<Partial<PlaylistRequest>>({
    genres: [],
    length: { type: "minutes", value: 30 },
    mood: [],
    activity: [],
    tempo: { bucket: "medium" },
    surprise: 0.5,
    minArtists: undefined,
    disallowedArtists: [],
    suggestedArtists: [],
    suggestedAlbums: [],
    suggestedTracks: [],
  });

  const [errors, setErrors] = useState<PlaylistRequestErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load collections and set current collection
  useEffect(() => {
    async function loadCollections() {
      try {
        const allCollections = await getAllCollections();
        setCollections(allCollections);
        const currentId = await getCurrentCollectionId();
        setSelectedCollectionId(currentId || null);
      } catch (error) {
        console.error("Failed to load collections:", error);
      }
    }
    loadCollections();
  }, []);

  // Load draft from localStorage
  useEffect(() => {
    const draft = loadPlaylistDraft();
    if (draft) {
      setFormData((prev) => ({ ...prev, ...draft }));
    }
  }, []);

  // Load genres from library
  useEffect(() => {
    async function loadGenres() {
      try {
        setIsLoadingGenres(true);
        const libraryGenres = await getAllGenres(selectedCollectionId || undefined);
        setGenres(libraryGenres);
      } catch (error) {
        console.error("Failed to load genres:", error);
      } finally {
        setIsLoadingGenres(false);
      }
    }
    if (selectedCollectionId !== null) {
      loadGenres();
    }
  }, [selectedCollectionId]);

  // Load artists from library
  useEffect(() => {
    async function loadArtists() {
      try {
        setIsLoadingArtists(true);
        const libraryArtists = await getAllArtists(selectedCollectionId || undefined);
        setArtists(libraryArtists);
      } catch (error) {
        console.error("Failed to load artists:", error);
      } finally {
        setIsLoadingArtists(false);
      }
    }
    if (selectedCollectionId !== null) {
      loadArtists();
    }
  }, [selectedCollectionId]);

  // Load albums from library
  useEffect(() => {
    async function loadAlbums() {
      try {
        setIsLoadingAlbums(true);
        const libraryAlbums = await getAllAlbums(selectedCollectionId || undefined);
        setAlbums(libraryAlbums);
      } catch (error) {
        console.error("Failed to load albums:", error);
      } finally {
        setIsLoadingAlbums(false);
      }
    }
    if (selectedCollectionId !== null) {
      loadAlbums();
    }
  }, [selectedCollectionId]);

  // Load track titles from library
  useEffect(() => {
    async function loadTrackTitles() {
      try {
        setIsLoadingTracks(true);
        const libraryTracks = await getAllTrackTitles(selectedCollectionId || undefined);
        setTrackTitles(libraryTracks);
      } catch (error) {
        console.error("Failed to load track titles:", error);
      } finally {
        setIsLoadingTracks(false);
      }
    }
    if (selectedCollectionId !== null) {
      loadTrackTitles();
    }
  }, [selectedCollectionId]);

  // Auto-save draft to localStorage
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      savePlaylistDraft(formData);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData]);

  // Close collection selector when clicking outside
  useEffect(() => {
    if (!showCollectionSelector) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-collection-selector]')) {
        setShowCollectionSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCollectionSelector]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const validationErrors = validatePlaylistRequest(formData);
    setErrors(validationErrors);

    if (hasErrors(validationErrors)) {
      setIsSubmitting(false);
      return;
    }

    // Clear draft
    clearPlaylistDraft();

    // Call onGenerate callback if provided
    if (onGenerate) {
      onGenerate(formData as PlaylistRequest);
    } else {
      // Store collection ID with the request
    const requestWithCollection = {
      ...formData,
      collectionId: selectedCollectionId,
    };

    // Navigate to generating state
    // Store request in sessionStorage for the result page
    sessionStorage.setItem(
      "playlist-request",
      JSON.stringify(requestWithCollection)
    );
    router.push("/playlists/generating");
    }
  };

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Collection Selector */}
      {collections.length > 0 && (
        <div>
          <label className="flex items-center gap-2 text-app-primary mb-3">
            <FolderOpen className="size-5 text-accent-primary" />
            <span className="font-medium uppercase tracking-wider text-sm">
              Collection
            </span>
          </label>
          <div className="relative" data-collection-selector>
            <button
              type="button"
              onClick={() => setShowCollectionSelector(!showCollectionSelector)}
              className="w-full px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border hover:border-accent-primary transition-colors flex items-center justify-between"
            >
              <span>{selectedCollection?.name || "Select a collection"}</span>
              <ChevronDown className={`size-4 transition-transform ${showCollectionSelector ? "rotate-180" : ""}`} />
            </button>
            {showCollectionSelector && (
              <div className="absolute z-10 w-full mt-1 bg-app-surface border border-app-border rounded-sm shadow-lg max-h-48 overflow-y-auto" data-collection-selector>
                {collections.map((collection) => (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      setShowCollectionSelector(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-app-primary hover:bg-app-hover transition-colors ${
                      collection.id === selectedCollectionId ? "bg-accent-primary/10" : ""
                    }`}
                  >
                    {collection.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!selectedCollectionId && (
            <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
              <AlertCircle className="size-4" />
              Please select a collection to create a playlist
            </p>
          )}
        </div>
      )}

      {/* Genres */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Music className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Genres
          </span>
        </label>
        <ChipInput
          values={formData.genres || []}
          onChange={(genres) => setFormData({ ...formData, genres })}
          placeholder="Select or add genres..."
          suggestions={genres}
          error={errors.genres}
          icon={<Music className="size-4" />}
        />
        {isLoadingGenres && (
          <p className="text-app-tertiary text-sm mt-2">Loading genres...</p>
        )}
      </div>

      {/* Length */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Clock className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Length
          </span>
        </label>
        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.length?.type === "minutes"}
                onChange={() =>
                  setFormData({
                    ...formData,
                    length: { type: "minutes", value: formData.length?.value || 30 },
                  })
                }
                className="text-accent-primary"
              />
              <span className="text-app-primary">Minutes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.length?.type === "tracks"}
                onChange={() =>
                  setFormData({
                    ...formData,
                    length: { type: "tracks", value: formData.length?.value || 20 },
                  })
                }
                className="text-accent-primary"
              />
              <span className="text-app-primary">Number of Tracks</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              max={formData.length?.type === "minutes" ? 600 : 1000}
              value={formData.length?.value || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  length: {
                    type: formData.length?.type || "minutes",
                    value: parseInt(e.target.value) || 0,
                  },
                })
              }
              className="w-32 px-4 py-3 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            />
            <span className="text-app-secondary text-sm">
              {formData.length?.type === "minutes" ? "minutes" : "tracks"}
            </span>
          </div>
          {errors.length && (
            <p className="text-red-500 text-sm flex items-center gap-1">
              <AlertCircle className="size-4" />
              {errors.length}
            </p>
          )}
        </div>
      </div>

      {/* Mood */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Heart className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Mood
          </span>
        </label>
        <ChipInput
          values={formData.mood || []}
          onChange={(mood) => setFormData({ ...formData, mood })}
          placeholder="Add moods..."
          suggestions={MOOD_SUGGESTIONS}
          error={errors.mood}
          icon={<Heart className="size-4" />}
        />
      </div>

      {/* Activity */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Activity className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Activity
          </span>
        </label>
        <ChipInput
          values={formData.activity || []}
          onChange={(activity) => setFormData({ ...formData, activity })}
          placeholder="Add activities..."
          suggestions={ACTIVITY_SUGGESTIONS}
          error={errors.activity}
          icon={<Activity className="size-4" />}
        />
      </div>

      {/* Tempo */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Gauge className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Tempo
          </span>
        </label>
        <div className="space-y-4">
          <div className="flex gap-4">
            {(["slow", "medium", "fast"] as const).map((bucket) => (
              <label key={bucket} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tempo-bucket"
                  checked={formData.tempo?.bucket === bucket}
                  onChange={() =>
                    setFormData({
                      ...formData,
                      tempo: { ...formData.tempo, bucket },
                    })
                  }
                  className="text-accent-primary"
                />
                <span className="text-app-primary capitalize">{bucket}</span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formData.tempo?.bpmRange}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tempo: {
                      ...formData.tempo,
                      bpmRange: e.target.checked
                        ? { min: 60, max: 120 }
                        : undefined,
                    },
                  })
                }
                className="text-accent-primary"
              />
              <span className="text-app-secondary text-sm">
                Specify BPM range (optional)
              </span>
            </label>
            {formData.tempo?.bpmRange && (
              <div className="flex items-center gap-4 pl-6">
                <div className="flex items-center gap-2">
                  <label className="text-app-secondary text-sm">Min:</label>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={formData.tempo.bpmRange.min || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tempo: {
                          ...formData.tempo,
                          bpmRange: {
                            min: parseInt(e.target.value) || 0,
                            max: formData.tempo?.bpmRange?.max || 120,
                          },
                        },
                      })
                    }
                    className="w-24 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-app-secondary text-sm">Max:</label>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={formData.tempo.bpmRange.max || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tempo: {
                          ...formData.tempo,
                          bpmRange: {
                            min: formData.tempo?.bpmRange?.min || 60,
                            max: parseInt(e.target.value) || 120,
                          },
                        },
                      })
                    }
                    className="w-24 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
                  />
                </div>
              </div>
            )}
          </div>
          {errors.tempo && (
            <p className="text-red-500 text-sm flex items-center gap-1">
              <AlertCircle className="size-4" />
              {errors.tempo}
            </p>
          )}
        </div>
      </div>

      {/* Disallowed Artists */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <UserX className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Exclude Artists
          </span>
        </label>
        <p className="text-app-secondary text-sm mb-3">
          Artists to exclude from this playlist (optional)
        </p>
        <ChipInput
          values={formData.disallowedArtists || []}
          onChange={(values) =>
            setFormData({ ...formData, disallowedArtists: values })
          }
          placeholder="Add artist to exclude..."
          suggestions={artists}
          icon={<UserX className="size-4" />}
        />
      </div>

      {/* Suggested Artists */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Music className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Include Artists
          </span>
        </label>
        <p className="text-app-secondary text-sm mb-3">
          Artists to prioritize/include in this playlist (optional)
        </p>
        <ChipInput
          values={formData.suggestedArtists || []}
          onChange={(values) =>
            setFormData({ ...formData, suggestedArtists: values })
          }
          placeholder="Add artist to include..."
          suggestions={artists}
          icon={<Music className="size-4" />}
        />
      </div>

      {/* Suggested Albums */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Music className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Include Albums
          </span>
        </label>
        <p className="text-app-secondary text-sm mb-3">
          Albums to prioritize/include in this playlist (optional)
        </p>
        <ChipInput
          values={formData.suggestedAlbums || []}
          onChange={(values) =>
            setFormData({ ...formData, suggestedAlbums: values })
          }
          placeholder="Add album to include..."
          suggestions={albums}
          icon={<Music className="size-4" />}
        />
      </div>

      {/* Suggested Tracks */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Music className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Include Tracks
          </span>
        </label>
        <p className="text-app-secondary text-sm mb-3">
          Specific tracks to include in this playlist (optional)
        </p>
        <ChipInput
          values={formData.suggestedTracks || []}
          onChange={(values) =>
            setFormData({ ...formData, suggestedTracks: values })
          }
          placeholder="Add track name to include..."
          suggestions={trackTitles}
          icon={<Music className="size-4" />}
        />
      </div>

      {/* Artist Variety */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Users className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Artist Variety
          </span>
        </label>
        <p className="text-app-secondary text-sm mb-3">
          Specify the minimum number of unique artists to include in the playlist. Leave empty for automatic variety based on surprise level.
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <label className="text-app-secondary text-sm w-32">Min Artists:</label>
            <input
              type="number"
              min="1"
              max="100"
              value={formData.minArtists ?? ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  minArtists: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              placeholder="Auto"
              className="flex-1 max-w-32 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            />
            <button
              type="button"
              onClick={() =>
                setFormData({
                  ...formData,
                  minArtists: undefined,
                })
              }
              className="px-3 py-2 text-app-secondary hover:text-app-primary text-sm"
            >
              Clear
            </button>
          </div>
          {formData.minArtists && (
            <p className="text-app-tertiary text-xs">
              Playlist will include at least {formData.minArtists} unique {formData.minArtists === 1 ? "artist" : "artists"}
            </p>
          )}
        </div>
      </div>

      {/* Surprise */}
      <div>
        <label className="flex items-center gap-2 text-app-primary mb-3">
          <Sparkles className="size-5 text-accent-primary" />
          <span className="font-medium uppercase tracking-wider text-sm">
            Surprise Level
          </span>
        </label>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-app-secondary text-sm w-20">Safe</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={formData.surprise ?? 0.5}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  surprise: parseFloat(e.target.value),
                })
              }
              className="flex-1 h-2 bg-app-hover rounded-sm appearance-none cursor-pointer accent-accent-primary"
            />
            <span className="text-app-secondary text-sm w-24 text-right">
              Adventurous
            </span>
          </div>
          <div className="text-center">
            <span className="text-app-tertiary text-sm">
              {((formData.surprise ?? 0.5) * 100).toFixed(0)}%
            </span>
          </div>
          {errors.surprise && (
            <p className="text-red-500 text-sm flex items-center gap-1">
              <AlertCircle className="size-4" />
              {errors.surprise}
            </p>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-8 py-4 bg-accent-primary text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider font-medium flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="size-5" />
              <span>Generate Playlist</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

