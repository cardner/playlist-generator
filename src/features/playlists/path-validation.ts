/**
 * Path Validation Utilities
 * 
 * Provides validation and testing functions for playlist file paths
 * to ensure compatibility with different media services.
 * 
 * @module features/playlists/path-validation
 */

import type { TrackLookup, PlaylistLocationConfig } from "./export";
import type { ServiceType } from "@/lib/path-normalization";
import { validatePath, isAbsolutePath, isUncPath, normalizePath } from "@/lib/path-normalization";
import { getTrackPath } from "./export";

export interface PathTestResult {
  isValid: boolean;
  isAbsolute: boolean;
  isUnc: boolean;
  issues: string[];
  suggestions: string[];
}

export interface ValidationResult {
  totalTracks: number;
  validPaths: number;
  invalidPaths: number;
  missingPaths: number;
  issues: Array<{
    trackFileId: string;
    path: string;
    issues: string[];
  }>;
}

/**
 * Test a single path format for a service
 * 
 * @param path - Path to test
 * @param service - Service type
 * @returns Test result with validation information
 */
export function testPathFormat(path: string, service: ServiceType): PathTestResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Basic validation
  if (!path || path.trim().length === 0) {
    issues.push("Path is empty");
    return {
      isValid: false,
      isAbsolute: false,
      isUnc: false,
      issues,
      suggestions: ["Provide a valid file path"],
    };
  }
  
  if (!validatePath(path)) {
    issues.push("Path contains invalid characters");
    suggestions.push("Remove invalid characters (< > : \" | ? * and control characters)");
  }
  
  const isAbsolute = isAbsolutePath(path);
  const isUnc = isUncPath(path);
  
  // Service-specific validation
  switch (service) {
    case 'jellyfin':
      if (!isAbsolute && !path.startsWith('../')) {
        issues.push("Jellyfin prefers absolute paths or paths relative to library root");
        suggestions.push("Use absolute paths or configure library root");
      }
      if (path.includes('\\')) {
        issues.push("Jellyfin uses forward slashes (Unix-style)");
        suggestions.push("Convert backslashes to forward slashes");
      }
      break;
      
    case 'plex':
      if (!isAbsolute) {
        issues.push("Plex requires absolute paths");
        suggestions.push("Use absolute paths matching Plex library configuration");
      }
      if (path.includes('\\')) {
        issues.push("Plex uses forward slashes (Unix-style)");
        suggestions.push("Convert backslashes to forward slashes");
      }
      break;
      
    case 'itunes':
      // iTunes can handle both absolute and relative paths
      // But file:// URLs should be absolute
      if (path.startsWith('file://') && !isAbsolute) {
        issues.push("file:// URLs should use absolute paths");
        suggestions.push("Ensure file:// URLs point to absolute paths");
      }
      break;
      
    case 'mediamonkey':
      // MediaMonkey is flexible with paths
      // Just validate basic format
      break;
      
    case 'generic':
    default:
      // Generic validation only
      break;
  }
  
  return {
    isValid: issues.length === 0,
    isAbsolute,
    isUnc,
    issues,
    suggestions,
  };
}

/**
 * Validate all paths in a playlist
 * 
 * @param trackLookups - Track lookups to validate
 * @param config - Playlist location configuration
 * @param service - Service type for service-specific validation
 * @returns Validation result with statistics and issues
 */
export function validatePlaylistPaths(
  trackLookups: TrackLookup[],
  config?: PlaylistLocationConfig,
  service: ServiceType = 'generic'
): ValidationResult {
  const issues: Array<{
    trackFileId: string;
    path: string;
    issues: string[];
  }> = [];
  
  let validPaths = 0;
  let invalidPaths = 0;
  let missingPaths = 0;
  
  for (const lookup of trackLookups) {
    const { path, hasRelativePath } = getTrackPath(lookup, config);
    const trackFileId = lookup.track.trackFileId;
    
    if (!hasRelativePath) {
      missingPaths++;
      issues.push({
        trackFileId,
        path,
        issues: ["No relative path available - using filename or constructed path"],
      });
      continue;
    }
    
    const testResult = testPathFormat(path, service);
    
    if (!testResult.isValid) {
      invalidPaths++;
      issues.push({
        trackFileId,
        path,
        issues: testResult.issues,
      });
    } else {
      validPaths++;
    }
  }
  
  return {
    totalTracks: trackLookups.length,
    validPaths,
    invalidPaths,
    missingPaths,
    issues,
  };
}

/**
 * Suggest a path fix for a problematic path
 * 
 * @param path - Path to fix
 * @param service - Service type
 * @returns Fixed path or null if no fix available
 */
export function suggestPathFix(path: string, service: ServiceType): string | null {
  if (!path || path.trim().length === 0) {
    return null;
  }
  
  let fixed = normalizePath(path);
  
  // Remove trailing slashes
  fixed = fixed.replace(/\/+$/, '');
  
  // Service-specific fixes
  switch (service) {
    case 'jellyfin':
    case 'plex':
      // Ensure forward slashes
      fixed = fixed.replace(/\\/g, '/');
      break;
      
    case 'mediamonkey':
      // Platform-specific: keep as normalized (will be converted by normalizePathForService)
      break;
      
    case 'itunes':
      // Ensure forward slashes for file:// URLs
      if (fixed.startsWith('file://')) {
        fixed = fixed.replace(/\\/g, '/');
      }
      break;
      
    default:
      break;
  }
  
  return fixed;
}

