/**
 * Utility Functions
 * 
 * Common utility functions used throughout the application.
 * 
 * @module lib/utils
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with conflict resolution
 * 
 * Combines multiple class name inputs (strings, arrays, objects) and resolves
 * Tailwind CSS class conflicts using tailwind-merge. This ensures that conflicting
 * utility classes (e.g., "p-2" and "p-4") are properly resolved.
 * 
 * @param inputs - Class name inputs (strings, arrays, or objects)
 * @returns Merged class string
 * 
 * @example
 * ```typescript
 * cn('p-2', 'p-4') // Returns: 'p-4' (conflict resolved)
 * cn('bg-red-500', { 'bg-blue-500': isActive }) // Conditional classes
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

