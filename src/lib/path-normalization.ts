/**
 * Path Normalization Utilities
 * 
 * Provides cross-platform path handling and service-specific path conversion
 * for playlist exports to different media players and servers.
 * 
 * Features:
 * - Cross-platform path normalization (Windows/Unix)
 * - Service-specific path conversion (iTunes, Jellyfin, Plex)
 * - Network path handling (UNC, SMB)
 * - Path rewriting for different directory structures
 * 
 * @module lib/path-normalization
 */

export type ServiceType = 'itunes' | 'jellyfin' | 'plex' | 'generic';

export interface ServiceConfig {
  /** Service type */
  service: ServiceType;
  /** Media library root path for the service */
  libraryRoot?: string;
  /** Whether to use network paths (UNC/SMB) */
  useNetworkPaths?: boolean;
  /** Path prefix to prepend (for absolute paths) */
  pathPrefix?: string;
}

/**
 * Normalize path separators for cross-platform compatibility
 * 
 * Converts Windows backslashes to forward slashes for consistency.
 * 
 * @param path - Path to normalize
 * @returns Normalized path
 * 
 * @example
 * ```typescript
 * normalizePath('C:\\Music\\Track.mp3') // Returns: 'C:/Music/Track.mp3'
 * ```
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Normalize path for a specific service
 * 
 * Applies service-specific path formatting rules.
 * 
 * @param path - Path to normalize
 * @param service - Service type
 * @returns Normalized path for the service
 * 
 * @example
 * ```typescript
 * normalizePathForService('/Music/Track.mp3', 'plex') // Returns: '/Music/Track.mp3'
 * ```
 */
export function normalizePathForService(
  path: string,
  service: ServiceType
): string {
  const normalized = normalizePath(path);

  switch (service) {
    case 'itunes':
      // iTunes prefers forward slashes on Mac, backslashes on Windows
      // For cross-platform compatibility, use forward slashes
      return normalized;
    
    case 'jellyfin':
    case 'plex':
      // Media servers typically use forward slashes (Unix-style)
      return normalized;
    
    case 'generic':
    default:
      return normalized;
  }
}

/**
 * Convert local path to service-specific path
 * 
 * Rewrites paths based on service configuration, handling different
 * directory structures and network paths.
 * 
 * @param localPath - Local file system path
 * @param config - Service configuration
 * @returns Converted path for the service
 * 
 * @example
 * ```typescript
 * convertToServicePath('/Users/me/Music/Track.mp3', {
 *   service: 'plex',
 *   libraryRoot: '/media/music'
 * }) // Returns: '/media/music/Track.mp3' (if relative) or full path
 * ```
 */
export function convertToServicePath(
  localPath: string,
  config: ServiceConfig
): string {
  const normalized = normalizePath(localPath);
  
  // If no library root configured, return normalized path
  if (!config.libraryRoot) {
    return normalized;
  }

  const libraryRoot = normalizePath(config.libraryRoot);
  
  // Check if path is already relative to library root
  if (normalized.startsWith(libraryRoot)) {
    // Path is within library root - return relative path
    const relativePath = normalized.substring(libraryRoot.length);
    return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  }

  // Path is outside library root - return absolute path
  // For network paths, use UNC format if configured
  if (config.useNetworkPaths && isWindowsPath(normalized)) {
    return convertToUncPath(normalized);
  }

  return normalized;
}

/**
 * Check if path is a Windows path
 * 
 * @param path - Path to check
 * @returns True if path appears to be a Windows path
 */
function isWindowsPath(path: string): boolean {
  // Check for Windows drive letter (C:, D:, etc.)
  return /^[A-Za-z]:/.test(path);
}

/**
 * Convert Windows path to UNC format
 * 
 * @param path - Windows path (e.g., C:\Music\Track.mp3)
 * @returns UNC path (e.g., \\server\share\Music\Track.mp3)
 * 
 * Note: This is a placeholder - actual conversion would require
 * network drive mapping information
 */
function convertToUncPath(path: string): string {
  // This is a simplified conversion
  // In practice, you'd need to know the network share mapping
  return path.replace(/^([A-Za-z]):/, '\\\\server\\$1$');
}

/**
 * Ensure path uses correct separators for the service
 * 
 * @param path - Path to format
 * @param service - Service type
 * @returns Formatted path
 */
export function formatPathForService(
  path: string,
  service: ServiceType
): string {
  const normalized = normalizePathForService(path, service);
  
  // Remove leading/trailing slashes for consistency
  return normalized.replace(/^\/+|\/+$/g, '');
}

/**
 * Join path segments with appropriate separator
 * 
 * @param segments - Path segments to join
 * @param service - Service type (determines separator)
 * @returns Joined path
 */
export function joinPath(
  segments: string[],
  service: ServiceType = 'generic'
): string {
  const filtered = segments.filter(s => s.length > 0);
  
  if (filtered.length === 0) {
    return '';
  }

  const joined = filtered.join('/');
  return normalizePathForService(joined, service);
}

/**
 * Get relative path between two paths
 * 
 * @param from - Source path
 * @param to - Target path
 * @returns Relative path from source to target
 */
export function getRelativePath(from: string, to: string): string {
  const fromNormalized = normalizePath(from);
  const toNormalized = normalizePath(to);
  
  const fromParts = fromNormalized.split('/').filter(p => p.length > 0);
  const toParts = toNormalized.split('/').filter(p => p.length > 0);
  
  // Find common prefix
  let commonLength = 0;
  while (
    commonLength < fromParts.length &&
    commonLength < toParts.length &&
    fromParts[commonLength] === toParts[commonLength]
  ) {
    commonLength++;
  }
  
  // Calculate relative path
  const upLevels = fromParts.length - commonLength;
  const downParts = toParts.slice(commonLength);
  
  const relativeParts: string[] = [];
  for (let i = 0; i < upLevels; i++) {
    relativeParts.push('..');
  }
  relativeParts.push(...downParts);
  
  return relativeParts.join('/') || '.';
}

