/**
 * Playlist Request Validation Utilities
 * 
 * This module provides validation functions for playlist generation requests.
 * Validates all required fields, ranges, and constraints before playlist generation.
 * 
 * @module lib/playlist-validation
 * 
 * @example
 * ```typescript
 * const errors = validatePlaylistRequest(request);
 * if (hasErrors(errors)) {
 *   // Display errors to user
 *   console.error(errors);
 * } else {
 *   // Proceed with playlist generation
 * }
 * ```
 */

import type { PlaylistRequest, PlaylistRequestErrors } from "@/types/playlist";

export function validatePlaylistRequest(
  request: Partial<PlaylistRequest>
): PlaylistRequestErrors {
  const errors: PlaylistRequestErrors = {};

  // Validate genres
  if (!request.genres || request.genres.length === 0) {
    errors.genres = "Please select at least one genre";
  } else if (request.genres.some((g) => !g.trim())) {
    errors.genres = "Genres cannot be empty";
  }

  // Validate length
  if (!request.length) {
    errors.length = "Please specify playlist length";
  } else {
    if (!request.length.type) {
      errors.length = "Please choose length type (minutes or tracks)";
    } else if (!request.length.value || request.length.value <= 0) {
      errors.length = `Please enter a valid ${request.length.type === "minutes" ? "duration" : "number of tracks"}`;
    } else if (request.length.type === "minutes" && request.length.value > 600) {
      errors.length = "Playlist cannot exceed 600 minutes (10 hours)";
    } else if (request.length.type === "tracks" && request.length.value > 1000) {
      errors.length = "Playlist cannot exceed 1000 tracks";
    }
  }

  // Validate mood
  if (!request.mood || request.mood.length === 0) {
    errors.mood = "Please select at least one mood";
  } else if (request.mood.some((m) => !m.trim())) {
    errors.mood = "Mood values cannot be empty";
  }

  // Validate activity
  if (!request.activity || request.activity.length === 0) {
    errors.activity = "Please select at least one activity";
  } else if (request.activity.some((a) => !a.trim())) {
    errors.activity = "Activity values cannot be empty";
  }

  // Validate tempo
  if (!request.tempo) {
    errors.tempo = "Please specify tempo";
  } else {
    const hasBucket = !!request.tempo.bucket;
    const hasBpmRange =
      request.tempo.bpmRange &&
      typeof request.tempo.bpmRange.min === "number" &&
      typeof request.tempo.bpmRange.max === "number";

    if (!hasBucket && !hasBpmRange) {
      errors.tempo = "Please select tempo bucket or specify BPM range";
    }

    if (hasBpmRange && request.tempo.bpmRange) {
      const { min, max } = request.tempo.bpmRange;
      if (min < 0 || min > 300) {
        errors.tempo = "Minimum BPM must be between 0 and 300";
      } else if (max < 0 || max > 300) {
        errors.tempo = "Maximum BPM must be between 0 and 300";
      } else if (min >= max) {
        errors.tempo = "Minimum BPM must be less than maximum BPM";
      }
    }
  }

  // Validate surprise
  if (typeof request.surprise !== "number") {
    errors.surprise = "Please set the surprise level";
  } else if (request.surprise < 0 || request.surprise > 1) {
    errors.surprise = "Surprise level must be between 0 and 1";
  }

  return errors;
}

export function hasErrors(errors: PlaylistRequestErrors): boolean {
  return Object.keys(errors).length > 0;
}

