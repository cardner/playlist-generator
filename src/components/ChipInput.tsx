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

import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import type { GenreWithStats } from "@/features/library/genre-normalization";
export interface ChipInputProps {
  /** Current array of selected values */
  values: string[];
  /** Callback when values change */
  onChange: (values: string[]) => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Array of suggestions for autocomplete */
  suggestions?: string[];
  /** Error message to display below the input */
  error?: string;
  /** Icon to display next to the label (optional) */
  icon?: React.ReactNode;
  /** Whether to show track counts for genres */
  showCounts?: boolean;
  /** Genre statistics for displaying track counts */
  genreStats?: GenreWithStats[];
}

export function ChipInput({
  values,
  onChange,
  placeholder = "Add item...",
  suggestions = [],
  error,
  icon,
  showCounts = false,
  genreStats = [],
}: ChipInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

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
   */
  const filteredSuggestions = suggestions.filter(
    (s) => !values.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
  );

  /**
   * Get track count for a genre if showing counts
   */
  const getTrackCount = (genre: string): number | undefined => {
    if (!showCounts || genreStats.length === 0) return undefined;
    const stat = genreStats.find((g) => g.normalized === genre);
    return stat?.trackCount;
  };

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
                      ({trackCount} {trackCount === 1 ? 'track' : 'tracks'})
                    </span>
                  )}
                </button>
              );
            })}
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

