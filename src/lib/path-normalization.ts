/**
 * Path Normalization Utilities
 * 
 * Provides cross-platform path handling and service-specific path conversion
 * for playlist exports to different media players and servers.
 * 
 * Features:
 * - Cross-platform path normalization (Windows/Unix)
 * - Service-specific path conversion (iTunes, Jellyfin, Plex, MediaMonkey)
 * - Network path handling (UNC, SMB)
 * - Path rewriting for different directory structures
 * - Path validation and testing
 * 
 * @module lib/path-normalization
 */

export type ServiceType = 'itunes' | 'jellyfin' | 'plex' | 'mediamonkey' | 'generic';

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
      // Remove trailing slashes
      return normalized.replace(/\/+$/, '');
    
    case 'mediamonkey':
      // MediaMonkey uses platform-specific separators
      const platform = detectPlatform();
      if (platform === 'windows') {
        // Use backslashes on Windows
        return normalized.replace(/\//g, '\\');
      }
      // Use forward slashes on Mac/Linux
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
    return normalizePathForService(normalized, config.service);
  }

  const libraryRoot = normalizePath(config.libraryRoot);
  
  // Check if path is already relative to library root
  if (normalized.startsWith(libraryRoot)) {
    // Path is within library root - return relative path
    const relativePath = normalized.substring(libraryRoot.length);
    const cleanRelative = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    return normalizePathForService(cleanRelative, config.service);
  }

  // Check if localPath is already a relative path (doesn't start with / or drive letter)
  if (!isAbsolutePath(normalized)) {
    // Already relative, just normalize for service
    return normalizePathForService(normalized, config.service);
  }

  // Path is absolute and outside library root
  // For network paths, use UNC format if configured
  if (config.useNetworkPaths && isWindowsPath(normalized)) {
    // Extract server and share from library root if it's a UNC path
    if (isUncPath(libraryRoot)) {
      const uncMatch = libraryRoot.match(/^\\\\?([^\\]+)\\([^\\]+)/);
      if (uncMatch) {
        const uncPath = convertToUncPath(normalized, uncMatch[1], uncMatch[2]);
        return normalizePathForService(uncPath, config.service);
      }
    }
    // Fallback: use generic server/share
    const uncPath = convertToUncPath(normalized, 'server', 'share');
    return normalizePathForService(uncPath, config.service);
  }

  // Return absolute path normalized for service
  return normalizePathForService(normalized, config.service);
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
 * @param server - Network server name (e.g., "server")
 * @param share - Network share name (e.g., "Music")
 * @returns UNC path (e.g., \\server\Music\Track.mp3)
 */
function convertToUncPath(path: string, server: string = 'server', share: string = 'share'): string {
  const normalized = normalizePath(path);
  
  // Remove drive letter if present
  const withoutDrive = normalized.replace(/^[A-Za-z]:/, '');
  
  // Remove leading slash
  const cleanPath = withoutDrive.startsWith('/') ? withoutDrive.substring(1) : withoutDrive;
  
  // Construct UNC path
  return `\\\\${server}\\${share}\\${cleanPath}`.replace(/\\+/g, '\\');
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

/**
 * Validate path format
 * 
 * @param path - Path to validate
 * @returns True if path appears to be valid
 */
export function validatePath(path: string): boolean {
  if (!path || typeof path !== 'string' || path.trim().length === 0) {
    return false;
  }
  
  // Check for invalid characters (platform-specific)
  // Windows: < > : " | ? * and control characters
  // Unix: null character and forward slash in filename
  const invalidChars = /[<>:"|?*\x00-\x1f]/;
  if (invalidChars.test(path)) {
    return false;
  }
  
  // Check for valid path structure
  // Allow forward slashes, backslashes, dots, spaces, etc.
  return true;
}

/**
 * Check if path is absolute
 * 
 * @param path - Path to check
 * @returns True if path is absolute
 */
export function isAbsolutePath(path: string): boolean {
  if (!path) return false;
  
  const normalized = normalizePath(path);
  
  // Unix absolute path (starts with /)
  if (normalized.startsWith('/')) {
    return true;
  }
  
  // Windows absolute path (starts with drive letter like C:)
  if (/^[A-Za-z]:/.test(path)) {
    return true;
  }
  
  // UNC path (starts with \\)
  if (path.startsWith('\\\\') || path.startsWith('//')) {
    return true;
  }
  
  return false;
}

/**
 * Check if path is UNC format
 * 
 * @param path - Path to check
 * @returns True if path is UNC format
 */
export function isUncPath(path: string): boolean {
  if (!path) return false;
  return path.startsWith('\\\\') || path.startsWith('//');
}

/**
 * Ensure path is absolute by prepending library root if needed
 * 
 * @param path - Path to ensure is absolute
 * @param libraryRoot - Library root path
 * @returns Absolute path
 */
export function ensureAbsolutePath(path: string, libraryRoot: string): string {
  if (isAbsolutePath(path)) {
    return normalizePath(path);
  }
  
  const normalizedRoot = normalizePath(libraryRoot);
  const normalizedPathValue = normalizePath(path);
  
  // Ensure root doesn't end with slash and path doesn't start with slash
  const root = normalizedRoot.endsWith('/') ? normalizedRoot.slice(0, -1) : normalizedRoot;
  const relPath = normalizedPathValue.startsWith('/') ? normalizedPathValue.substring(1) : normalizedPathValue;
  
  return `${root}/${relPath}`;
}

/**
 * Detect platform (Windows, Mac, Linux)
 * 
 * @returns Platform string
 */
export function detectPlatform(): 'windows' | 'mac' | 'linux' | 'unknown' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unknown';
  }
  
  const platform = navigator.platform.toLowerCase();
  
  if (platform.includes('win')) {
    return 'windows';
  }
  
  if (platform.includes('mac')) {
    return 'mac';
  }
  
  if (platform.includes('linux') || platform.includes('x11')) {
    return 'linux';
  }
  
  return 'unknown';
}

