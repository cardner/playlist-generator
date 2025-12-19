/**
 * Configuration for MusicBrainz database connection
 */

export interface MusicBrainzConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

let cachedConfig: MusicBrainzConfig | null = null;

/**
 * Get MusicBrainz database configuration
 * 
 * Reads from environment variables or returns default values
 * In a browser environment, this would typically come from user settings
 */
export function getMusicBrainzConfig(): MusicBrainzConfig | null {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    // Server-side: use environment variables
    const config: MusicBrainzConfig = {
      host: process.env.MUSICBRAINZ_DB_HOST || 'localhost',
      port: parseInt(process.env.MUSICBRAINZ_DB_PORT || '5432', 10),
      database: process.env.MUSICBRAINZ_DB_NAME || 'musicbrainz',
      user: process.env.MUSICBRAINZ_DB_USER || 'musicbrainz',
      password: process.env.MUSICBRAINZ_DB_PASSWORD || '',
      ssl: process.env.MUSICBRAINZ_DB_SSL === 'true',
      maxConnections: parseInt(process.env.MUSICBRAINZ_DB_MAX_CONNECTIONS || '10', 10),
    };

    if (!config.password) {
      return null; // No password configured
    }

    cachedConfig = config;
    return config;
  } else {
    // Browser-side: check localStorage or settings
    // For now, return null - configuration should be set via settings UI
    // This will be integrated with the app's settings system
    const stored = localStorage.getItem('musicbrainz-config');
    if (stored) {
      try {
        cachedConfig = JSON.parse(stored);
        return cachedConfig;
      } catch (e) {
        console.error('Failed to parse MusicBrainz config:', e);
        return null;
      }
    }
    return null;
  }
}

/**
 * Set MusicBrainz database configuration
 */
export function setMusicBrainzConfig(config: MusicBrainzConfig): void {
  cachedConfig = config;
  
  if (typeof window !== 'undefined') {
    localStorage.setItem('musicbrainz-config', JSON.stringify(config));
  }
}

/**
 * Clear cached configuration
 */
export function clearMusicBrainzConfig(): void {
  cachedConfig = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('musicbrainz-config');
  }
}

/**
 * Check if MusicBrainz is configured
 */
export function isMusicBrainzConfigured(): boolean {
  const config = getMusicBrainzConfig();
  return config !== null && !!config.password;
}

