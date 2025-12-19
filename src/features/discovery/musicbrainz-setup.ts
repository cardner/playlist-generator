/**
 * MusicBrainz database setup and connection management
 * 
 * This module handles database connection validation and setup helpers.
 * In a browser environment, actual database connections are handled server-side.
 */

import { isMusicBrainzConfigured, getMusicBrainzConfig } from '@/lib/musicbrainz-config';
import { logger } from '@/lib/logger';

/**
 * Check if MusicBrainz database is accessible
 */
export async function checkMusicBrainzConnection(): Promise<boolean> {
  if (!isMusicBrainzConfigured()) {
    return false;
  }

  try {
    // In browser environment, check via API endpoint
    const response = await fetch('/api/musicbrainz/health', {
      method: 'GET',
    });

    return response.ok;
  } catch (error) {
    logger.error('MusicBrainz connection check failed:', error);
    return false;
  }
}

/**
 * Validate MusicBrainz database schema
 * 
 * Checks if required tables exist and have expected structure
 */
export async function validateMusicBrainzSchema(): Promise<{
  valid: boolean;
  missingTables?: string[];
  errors?: string[];
}> {
  if (!isMusicBrainzConfigured()) {
    return {
      valid: false,
      errors: ['MusicBrainz is not configured'],
    };
  }

  try {
    const response = await fetch('/api/musicbrainz/validate-schema', {
      method: 'GET',
    });

    if (!response.ok) {
      return {
        valid: false,
        errors: [`Schema validation failed: ${response.statusText}`],
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Schema validation failed:', error);
    return {
      valid: false,
      errors: [`Schema validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Get MusicBrainz database statistics
 */
export async function getMusicBrainzStats(): Promise<{
  recordings: number;
  artists: number;
  releases: number;
  genres: number;
} | null> {
  if (!isMusicBrainzConfigured()) {
    return null;
  }

  try {
    const response = await fetch('/api/musicbrainz/stats', {
      method: 'GET',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.stats || null;
  } catch (error) {
    logger.error('Failed to get MusicBrainz stats:', error);
    return null;
  }
}

