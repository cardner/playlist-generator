/**
 * ChipInput Component
 * 
 * A reusable input component for managing arrays of string values (chips/tags).
 * Supports autocomplete suggestions, error display, and optional track count display for genres.
 * 
 * Features:
 * - Add/remove chips with visual feedback
 * - Autocomplete suggestions with filtering
 * - Keyboard navigation (Enter to add, Escape to close)
 * - Error message display
 * - Optional track count display for genres
 * - Icon support for visual context
 * 
 * State Management:
 * - Manages input value and suggestion visibility internally
 * - Filters suggestions based on current input
 * - Handles keyboard events for quick input
 * 
 * Usage:
 * Used in PlaylistBuilder for genres, moods, activities, and suggested tracks/artists/albums.
 * Also used in PlaylistDisplay for inline editing of playlist metadata.
 * 
 * @module components/ChipInput
 * 
 * @example
 * ```tsx
 * <ChipInput
 *   values={genres}
 *   onChange={setGenres}
 *   placeholder="Add genres..."
 *   suggestions={availableGenres}
 *   error={errors.genres}
 *   icon={<Music className="size-4" />}
 *   showCounts={true}
 *   genreStats={genresWithStats}
 * />
 * ```
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import type { GenreWithStats } from "@/features/library/genre-normalization";
import { useDebounce } from "@/lib/hooks/useDebounce";

export interface ChipInputProps {
  /** Current array of selected values */
  values: string[];
  /** Callback when values change */
  onChange: (values: string[]) => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Array of suggestions for autocomplete (synchronous mode) */
  suggestions?: string[];
  /** Async search function (async mode - takes precedence over suggestions) */
  onSearch?: (query: string) => Promise<string[]>;
  /** Error message to display below the input */
  error?: string;
  /** Icon to display next to the label (optional) */
  icon?: React.ReactNode;
  /** Whether to show track counts for genres */
  showCounts?: boolean;
  /** Genre statistics for displaying track counts */
  genreStats?: GenreWithStats[];
  /** Minimum characters before searching (default: 2) */
  minSearchLength?: number;
  /** Maximum results to display (default: 50) */
  maxResults?: number;
  /** Debounce delay in milliseconds (default: 300) */
  debounceDelay?: number;
  /** Compact size for toolbar/inline use */
  compact?: boolean;
}

export function ChipInput({
  values,
  onChange,
  placeholder = "Add item...",
  suggestions = [],
  onSearch,
  error,
  icon,
  showCounts = false,
  genreStats = [],
  minSearchLength = 2,
  maxResults = 50,
  debounceDelay = 300,
  compact = false,
}: ChipInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [totalResultsCount, setTotalResultsCount] = useState<number | null>(null);
  
  // Debounce the input value for async search
  const debouncedInputValue = useDebounce(inputValue, debounceDelay);

  // Determine if we're using async search mode
  const isAsyncMode = !!onSearch;

  /**
   * Perform async search when debounced value changes or dropdown opens
   */
  useEffect(() => {
    if (!isAsyncMode || !showSuggestions) {
      return;
    }

    const query = debouncedInputValue.trim();
    const shouldShowTopResults = query.length === 0 || query.length < minSearchLength;
    
    // Perform search (empty/short query will return top results)
    const performSearch = async () => {
      setIsSearching(true);
      try {
        // If query is too short, pass empty string to get top results
        const searchQuery = shouldShowTopResults ? "" : query;
        const results = await onSearch(searchQuery);
        setSearchResults(results);
        // Note: We don't know the total count from search functions, so we'll show
        // "Showing top X" if results.length === maxResults
        setTotalResultsCount(results.length === maxResults ? results.length : null);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
        setTotalResultsCount(null);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedInputValue, onSearch, isAsyncMode, showSuggestions, minSearchLength, maxResults]);

  /**
   * Add a new value to the array
   */
  const handleAdd = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  /**
   * Remove a value from the array
   */
  const handleRemove = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  /**
   * Handle keyboard events (Enter to add, Escape to close suggestions)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      handleAdd(inputValue);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  /**
   * Filter suggestions based on current input and exclude already selected values
   * Used in synchronous mode (when suggestions prop is provided)
   */
  const filteredSuggestions = useMemo(() => {
    if (isAsyncMode) {
      // In async mode, use searchResults
      return searchResults.filter((s) => !values.includes(s));
    }

    // Synchronous mode: filter suggestions
    const filtered = suggestions.filter(
      (s) => !values.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
    );
    
    // Limit results in sync mode too
    return filtered.slice(0, maxResults);
  }, [isAsyncMode, searchResults, suggestions, values, inputValue, maxResults]);

  /**
   * Get track count for a genre if showing counts
   */
  const getTrackCount = (genre: string): number | undefined => {
    if (!showCounts || genreStats.length === 0) return undefined;
    const stat = genreStats.find((g) => g.normalized === genre);
    return stat?.trackCount;
  };

  // Determine if we should show suggestions
  const shouldShowSuggestions = showSuggestions && (
    filteredSuggestions.length > 0 || 
    isSearching || 
    (isAsyncMode && inputValue.trim().length > 0 && inputValue.trim().length < minSearchLength)
  );

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="relative">
        <div
          className={`flex flex-wrap gap-1.5 bg-app-hover rounded-sm border border-app-border focus-within:border-accent-primary ${
            compact
              ? "p-1.5 min-h-[32px]"
              : "p-3 min-h-[48px] gap-2"
          }`}
        >
          {values.map((value) => (
            <span
              key={value}
              className={`inline-flex items-center gap-1 bg-app-surface text-app-primary rounded-sm border border-app-border ${
                compact
                  ? "px-2 py-0.5 text-xs"
                  : "px-3 py-1 text-sm gap-1.5"
              }`}
            >
              {value}
              <button
                type="button"
                onClick={() => handleRemove(value)}
                className="hover:text-red-500 transition-colors"
              >
                <X className={compact ? "size-2.5" : "size-3"} />
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
            className={`flex-1 bg-transparent text-app-primary placeholder-app-tertiary outline-none ${
              compact ? "min-w-[80px] text-sm" : "min-w-[120px]"
            }`}
          />
        </div>
        {shouldShowSuggestions && (
          <div className="absolute z-10 w-full mt-1 bg-app-surface border border-app-border rounded-sm shadow-lg max-h-48 overflow-hidden">
            {isSearching ? (
              <div className="px-4 py-3 text-app-secondary text-sm flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                <span>Searching...</span>
              </div>
            ) : filteredSuggestions.length > 0 ? (
              <>
                <div className="overflow-y-auto max-h-48">
                  {filteredSuggestions.map((suggestion) => {
                    const trackCount = getTrackCount(suggestion);
                    return (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleAdd(suggestion)}
                        className="w-full px-4 py-2 text-left text-app-primary hover:bg-app-hover transition-colors flex items-center justify-between"
                      >
                        <span>{suggestion}</span>
                        {trackCount !== undefined && (
                          <span className="text-app-tertiary text-xs ml-2">
                            ({trackCount} {trackCount === 1 ? "track" : "tracks"})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {totalResultsCount !== null && filteredSuggestions.length === maxResults && (
                  <div className="px-4 py-2 text-app-tertiary text-xs border-t border-app-border">
                    Showing top {maxResults} results
                  </div>
                )}
              </>
            ) : inputValue.trim().length >= minSearchLength ? (
              <div className="px-4 py-3 text-app-tertiary text-sm">
                No results found
              </div>
            ) : null}
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

