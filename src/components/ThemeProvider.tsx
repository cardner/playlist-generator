/**
 * ThemeProvider Component
 * 
 * React context provider for managing application theme (light/dark mode).
 * Handles theme persistence in localStorage and applies theme to document root.
 * 
 * Features:
 * - Theme state management (light/dark)
 * - localStorage persistence
 * - SSR-safe (handles server-side rendering)
 * - Document attribute updates for CSS theming
 * - Context API for theme access throughout app
 * 
 * State Management:
 * - Manages theme state internally
 * - Syncs with localStorage
 * - Updates document.documentElement.setAttribute('data-theme', theme)
 * 
 * Usage:
 * Wrap the application root with ThemeProvider, then use `useTheme()` hook
 * in any component to access theme state and toggle function.
 * 
 * @module components/ThemeProvider
 * 
 * @example
 * ```tsx
 * // In root layout
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * 
 * // In any component
 * const { theme, toggleTheme } = useTheme();
 * ```
 */

"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Default theme values for SSR
const defaultTheme: ThemeContextType = {
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
};

/**
 * Theme provider component
 * 
 * Provides theme context to all child components. Manages theme state,
 * persistence, and document attribute updates.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load theme from localStorage or default to dark
    if (typeof window !== "undefined") {
      const savedTheme = (localStorage.getItem("theme") as Theme) || "dark";
      setThemeState(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", newTheme);
      document.documentElement.setAttribute("data-theme", newTheme);
    }
  };

  const toggleTheme = () => {
    setThemeState((currentTheme) => {
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") {
        localStorage.setItem("theme", newTheme);
        document.documentElement.setAttribute("data-theme", newTheme);
      }
      return newTheme;
    });
  };

  const value = mounted
    ? { theme, setTheme, toggleTheme }
    : defaultTheme;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // Return default during SSR
    return defaultTheme;
  }
  return context;
}
