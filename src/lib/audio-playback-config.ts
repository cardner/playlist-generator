/**
 * Audio playback configuration constants
 * 
 * This file contains shared constants used across components
 * for audio playback behavior and retry logic.
 */

/**
 * Maximum number of retry attempts when trying to play audio
 * Used to handle timing issues where audio elements may not be ready immediately
 */
export const MAX_PLAY_ATTEMPTS = 10;
