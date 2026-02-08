/**
 * LibrarySearchCombo Component
 *
 * A unified search bar with autocomplete that allows adding typed filter tags for
 * titles, artists, albums, genres, BPM, mood/intensity, activity, or wildcard text.
 * Selected filters appear as removable chips; tracks must match all filters (AND logic).
 *
 * @module components/LibrarySearchCombo
 */

"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import type { TrackRecord } from "@/db/schema";
import type { GenreWithStats } from "@/features/library/genre-normalization";
import { normalizeGenre } from "@/features/library/genre-normalization";
import { getMoodCategories } from "@/features/library/mood-mapping";
import { getActivityCategories } from "@/features/library/activity-mapping";
import { mapMoodTagsToCategories } from "@/features/library/mood-mapping";
import { mapActivityTagsToCategories } from "@/features/library/activity-mapping";

export type FilterType =
  | "title"
  | "artist"
  | "album"
  | "genre"
  | "bpm"
  | "mood"
  | "intensity"
  | "activity"
  | "text";

export interface FilterTag {
  type: FilterType;
  value: string;
}

const FILTER_TYPE_LABELS: Record<FilterType, string> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  genre: "Genre",
  bpm: "BPM",
  mood: "Mood",
  intensity: "Intensity",
  activity: "Activity",
  text: "Text",
};

/** Mood categories that map to intensity (high/medium/low energy) */
const INTENSITY_MOODS = [
  "Intense",
  "Energetic",
  "Exciting",
  "Calm",
  "Peaceful",
  "Mellow",
  "Relaxed",
];

interface LibrarySearchComboProps {
  filters: FilterTag[];
  onChange: (filters: FilterTag[]) => void;
  /** Tracks for sync mode (library browser). Omit when using onSearchByType. */
  tracks?: TrackRecord[];
  /** Genres for sync mode. Omit when using onSearchByType. */
  genres?: string[];
  genreStats?: GenreWithStats[];
  genreMappings?: { originalToNormalized: Map<string, string> } | null;
  placeholder?: string;
  compact?: boolean;
  /** Unique id for aria attributes */
  id?: string;
  /** Restrict which filter types can be added (e.g. ["artist","album","title"] for playlist include) */
  allowedTypes?: FilterType[];
  /** Async search per type. When provided, uses async mode instead of building from tracks. */
  onSearchByType?: Partial<Record<FilterType, (query: string) => Promise<string[]>>>;
}

/** Parse BPM value: number, range (90-120), or slow/medium/fast */
function parseBpmDisplay(value: string): string {
  const v = value.toLowerCase().trim();
  if (v === "slow") return "BPM: slow (<100)";
  if (v === "medium") return "BPM: medium (100–130)";
  if (v === "fast") return "BPM: fast (>130)";
  if (/^\d+\s*-\s*\d+$/.test(v)) return `BPM: ${v.replace(/\s/g, "")}`;
  return `BPM: ${value}`;
}

function getMoodsFromTracks(tracks: TrackRecord[]): string[] {
  const seen = new Set<string>();
  for (const track of tracks) {
    const tags = track.enhancedMetadata?.mood || [];
    if (tags.length === 0) continue;
    const mapped = mapMoodTagsToCategories(tags);
    for (const m of mapped) {
      seen.add(m);
    }
  }
  return Array.from(seen).sort();
}

function getActivitiesFromTracks(tracks: TrackRecord[]): string[] {
  const seen = new Set<string>();
  for (const track of tracks) {
    const tags = track.enhancedMetadata?.activity || [];
    if (tags.length === 0) continue;
    const mapped = mapActivityTagsToCategories(tags);
    for (const a of mapped) {
      seen.add(a);
    }
  }
  return Array.from(seen).sort();
}

function getBpmValuesFromTracks(tracks: TrackRecord[]): string[] {
  const seen = new Set<number>();
  for (const track of tracks) {
    const bpm = track.tech?.bpm;
    if (bpm != null && bpm >= 60 && bpm <= 200) {
      seen.add(Math.round(bpm));
    }
  }
  return Array.from(seen)
    .sort((a, b) => a - b)
    .map(String);
}

export function LibrarySearchCombo({
  filters,
  onChange,
  tracks = [],
  genres = [],
  genreStats = [],
  genreMappings,
  placeholder = "Search: title, artist, album, genre, BPM, mood…",
  compact = false,
  id: providedId,
  allowedTypes,
  onSearchByType,
}: LibrarySearchComboProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [asyncSuggestions, setAsyncSuggestions] = useState<
    Array<{ type: FilterType; value: string; label: string }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const generatedId = useRef(`library-search-combo-${Math.random().toString(36).slice(2, 9)}`);
  const id = providedId ?? generatedId.current;
  const isAsyncMode = !!onSearchByType && Object.keys(onSearchByType).length > 0;
  const debouncedInput = useDebounce(inputValue, 280);

  const typesAllowed = useCallback(
    (t: FilterType) =>
      !allowedTypes || allowedTypes.length === 0 || allowedTypes.includes(t),
    [allowedTypes]
  );

  // Precompute catalogs from tracks - expensive operation that should only run when tracks change
  const precomputedCatalogs = useMemo(() => {
    const titles = [...new Set(tracks.map((t) => t.tags.title).filter(Boolean))] as string[];
    const artists = [...new Set(tracks.map((t) => t.tags.artist).filter(Boolean))] as string[];
    const albums = [...new Set(tracks.map((t) => t.tags.album).filter(Boolean))].filter(
      Boolean
    ) as string[];
    const bpmValues = getBpmValuesFromTracks(tracks);
    const moods = getMoodsFromTracks(tracks);
    const activities = getActivitiesFromTracks(tracks);

    const moodCategories = getMoodCategories();
    const activityCategories = getActivityCategories();

    const bpmPresets = ["slow", "medium", "fast"];

    return {
      titles,
      artists,
      albums,
      bpmValues,
      moods,
      activities,
      moodCategories,
      activityCategories,
      bpmPresets,
    };
  }, [tracks]);

  // Sync mode: filter precomputed catalogs by query
  const syncSuggestionGroups = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    const filterMatch = (s: string) => !q || s.toLowerCase().includes(q);

    type Suggestion = { type: FilterType; value: string; label: string };
    const suggestions: Suggestion[] = [];

    const addIfNotFiltered = (type: FilterType, value: string) => {
      if (!typesAllowed(type)) return;
      const already = filters.some((f) => f.type === type && f.value === value);
      if (already || !filterMatch(value)) return;
      const label =
        type === "bpm" ? parseBpmDisplay(value) : `${FILTER_TYPE_LABELS[type]}: ${value}`;
      suggestions.push({ type, value, label });
    };

    precomputedCatalogs.titles.forEach((v) => addIfNotFiltered("title", v));
    precomputedCatalogs.artists.forEach((v) => addIfNotFiltered("artist", v));
    precomputedCatalogs.albums.forEach((v) => addIfNotFiltered("album", v));
    genres.forEach((v) => addIfNotFiltered("genre", v));
    precomputedCatalogs.bpmPresets.forEach((v) => addIfNotFiltered("bpm", v));
    precomputedCatalogs.bpmValues.forEach((v) => addIfNotFiltered("bpm", v));
    [...new Set([...precomputedCatalogs.moods, ...precomputedCatalogs.moodCategories])].forEach(
      (v) => addIfNotFiltered("mood", v)
    );
    [...new Set([...precomputedCatalogs.moods, ...INTENSITY_MOODS])].forEach((v) =>
      addIfNotFiltered("intensity", v)
    );
    [
      ...new Set([
        ...precomputedCatalogs.activities,
        ...precomputedCatalogs.activityCategories,
      ]),
    ].forEach((v) => addIfNotFiltered("activity", v));

    if (q.length >= 1 && typesAllowed("text")) {
      const asText = inputValue.trim();
      if (asText && !filters.some((f) => f.type === "text" && f.value === asText)) {
        suggestions.push({
          type: "text",
          value: asText,
          label: `Text: "${asText}" (matches title, artist, album)`,
        });
      }
    }

    return suggestions.slice(0, 50);
  }, [precomputedCatalogs, genres, filters, inputValue, typesAllowed]);

  // Async mode: fetch suggestions when debounced input changes
  useEffect(() => {
    if (!isAsyncMode || !onSearchByType || !showSuggestions) return;

    const query = debouncedInput.trim().toLowerCase();
    const typesToSearch = allowedTypes ?? (Object.keys(onSearchByType) as FilterType[]);

    const runSearch = async () => {
      setIsSearching(true);
      try {
        const results: Array<{ type: FilterType; value: string; label: string }> = [];
        const searches = typesToSearch
          .filter((t) => onSearchByType[t])
          .map(async (type) => {
            const searchFn = onSearchByType[type]!;
            const values = await searchFn(query || "");
            for (const v of values) {
              const already = filters.some((f) => f.type === type && f.value === v);
              if (already) continue;
              const label =
                type === "bpm" ? parseBpmDisplay(v) : `${FILTER_TYPE_LABELS[type]}: ${v}`;
              results.push({ type, value: v, label });
            }
          });
        await Promise.all(searches);
        setAsyncSuggestions(results.slice(0, 50));
      } catch {
        setAsyncSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    };

    runSearch();
  }, [
    debouncedInput,
    showSuggestions,
    isAsyncMode,
    onSearchByType,
    allowedTypes,
    filters,
  ]);

  const suggestionGroups = isAsyncMode ? asyncSuggestions : syncSuggestionGroups;

  const handleAdd = (type: FilterType, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!typesAllowed(type)) return;
    const exists = filters.some((f) => f.type === type && f.value === trimmed);
    if (exists) return;
    onChange([...filters, { type, value: trimmed }]);
    setInputValue("");
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleRemove = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestionGroups.length) {
        e.preventDefault();
        const s = suggestionGroups[highlightedIndex];
        handleAdd(s.type, s.value);
      } else if (inputValue.trim() && typesAllowed("text")) {
        e.preventDefault();
        handleAdd("text", inputValue.trim());
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) =>
        i < suggestionGroups.length - 1 ? i + 1 : suggestionGroups.length - 1
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i > 0 ? i - 1 : 0));
    } else if (e.key === "Backspace" && !inputValue && filters.length > 0) {
      handleRemove(filters.length - 1);
    }
  };

  useEffect(() => {
    if (showSuggestions) {
      setHighlightedIndex(suggestionGroups.length > 0 ? 0 : -1);
    }
  }, [showSuggestions, inputValue, suggestionGroups.length]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const getTrackCount = (genre: string): number | undefined => {
    if (genreStats.length === 0) return undefined;
    const stat = genreStats.find((g) => g.normalized === genre);
    return stat?.trackCount;
  };

  return (
    <div className="relative flex-1 min-w-0">
      <div
        className={`flex flex-wrap gap-1.5 bg-app-hover rounded-sm border border-app-border focus-within:border-accent-primary transition-colors ${
          compact ? "p-1.5 min-h-[32px]" : "p-2 min-h-[40px]"
        }`}
      >
        <Search
          className={`shrink-0 text-app-tertiary self-center ${
            compact ? "size-3.5" : "size-4"
          }`}
          aria-hidden
        />
        {filters.map((f, i) => (
          <span
            key={`${f.type}-${f.value}-${i}`}
            className={`inline-flex items-center gap-1 bg-app-surface text-app-primary rounded-sm border border-app-border ${
              compact ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
            }`}
          >
            <span className="text-app-tertiary font-medium">
              {FILTER_TYPE_LABELS[f.type]}:
            </span>
            <span>{f.type === "bpm" ? parseBpmDisplay(f.value) : f.value}</span>
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="hover:text-red-500 transition-colors ml-0.5"
              aria-label={`Remove ${FILTER_TYPE_LABELS[f.type]} filter ${f.value}`}
            >
              <X className={compact ? "size-2.5" : "size-3"} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          id={id}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={filters.length === 0 ? placeholder : ""}
          className={`flex-1 bg-transparent text-app-primary placeholder-app-tertiary outline-none min-w-[100px] ${
            compact ? "text-sm" : "text-sm"
          }`}
          aria-label="Search library by title, artist, album, genre, BPM, mood, intensity, or text"
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-expanded={showSuggestions}
          aria-activedescendant={
            highlightedIndex >= 0 && suggestionGroups[highlightedIndex]
              ? `${id}-option-${highlightedIndex}`
              : undefined
          }
        />
      </div>
      {showSuggestions && (
        <div
          id={`${id}-listbox`}
          ref={listRef}
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 bg-app-surface border border-app-border rounded-sm shadow-lg max-h-56 overflow-y-auto"
        >
          {isSearching ? (
            <div className="px-4 py-3 text-app-secondary text-sm flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Searching…</span>
            </div>
          ) : suggestionGroups.length === 0 ? (
            <div className="px-4 py-3 text-app-tertiary text-sm">
              {inputValue.trim()
                ? typesAllowed("text")
                  ? "No matches. Press Enter to add as text filter."
                  : "No matches."
                : "Type to search…"}
            </div>
          ) : (
            suggestionGroups.map((s, idx) => {
              const isGenre = s.type === "genre";
              const count = isGenre ? getTrackCount(s.value) : undefined;
              return (
                <button
                  key={`${s.type}-${s.value}-${idx}`}
                  id={`${id}-option-${idx}`}
                  role="option"
                  aria-selected={highlightedIndex === idx}
                  type="button"
                  onClick={() => handleAdd(s.type, s.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full px-4 py-2 text-left text-app-primary hover:bg-app-hover transition-colors flex items-center justify-between ${
                    highlightedIndex === idx ? "bg-app-hover" : ""
                  }`}
                >
                  <span>{s.label}</span>
                  {count !== undefined && (
                    <span className="text-app-tertiary text-xs ml-2">
                      ({count} {count === 1 ? "track" : "tracks"})
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
