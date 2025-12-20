/**
 * ThemeToggle Component
 * 
 * Toggle button for switching between light and dark themes. Displays current
 * theme state and allows users to toggle themes with a single click.
 * 
 * Features:
 * - Visual theme indicator (sun/moon icon)
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
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Theme toggle button component
 * 
 * Renders a toggle switch that allows users to switch between light and dark themes.
 * The button shows a sun icon in light mode and moon icon in dark mode.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-app-bg",
        isDark ? "bg-accent-primary" : "bg-app-border"
      )}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      role="switch"
      aria-checked={isDark}
    >
      <span
        className={cn(
          "inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm flex items-center justify-center",
          isDark ? "translate-x-7" : "translate-x-1"
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-accent-primary" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-app-tertiary" />
        )}
      </span>
    </button>
  );
}

