/**
 * ThemeToggle Component
 * 
 * Toggle button for switching between light and dark themes. Displays current
 * theme state and allows users to toggle themes with a single click.
 * 
 * Features:
 * - Visual theme indicator (split-circle sun icon)
 * - Smooth transition animation
 * - Accessible (ARIA labels, keyboard support)
 * - Integrated with ThemeProvider
 * 
 * State Management:
 * - Uses `useTheme` hook from ThemeProvider
 * - No internal state - controlled by ThemeProvider
 * 
 * @module components/ThemeToggle
 * 
 * @example
 * ```tsx
 * // Used in Navigation component
 * <ThemeToggle />
 * ```
 */

"use client";

import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

/**
 * Theme toggle button component
 * 
 * Renders a sun icon with split circle (dark left, light right) with rays.
 * Clicking toggles between light and dark themes.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative inline-flex items-center justify-center w-10 h-10 rounded-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-app-bg hover:bg-app-hover",
        "text-app-primary"
      )}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      role="switch"
      aria-checked={isDark}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-6 h-6"
      >
        {/* Rays */}
        <path
          d="M12 2V4M12 20V22M22 12H20M4 12H2M19.07 4.93L17.66 6.34M6.34 17.66L4.93 19.07M19.07 19.07L17.66 17.66M6.34 6.34L4.93 4.93"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Split circle - dark left, light right */}
        <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 7C9.24 7 7 9.24 7 12C7 14.76 9.24 17 12 17V7Z"
          fill="currentColor"
          className={cn(
            "transition-colors",
            isDark ? "opacity-100" : "opacity-30"
          )}
        />
        <path
          d="M12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17V7Z"
          fill="currentColor"
          className={cn(
            "transition-colors",
            isDark ? "opacity-30" : "opacity-100"
          )}
        />
      </svg>
    </button>
  );
}

